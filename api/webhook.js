// 🚀 Vercel Serverless Webhook Endpoint for Future Air Telegram Voice ERP
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bot } from '../lib/bot.js';
import { registerHandlers, getStoredAiKeys } from '../lib/handlers.js';
import { parseERPWithGemini } from '../lib/transcriber.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Initialize and register handlers once
let isRegistered = false;
if (bot && !isRegistered) {
  registerHandlers(bot);
  isRegistered = true;
}

// Deduplication cache for Telegram update_id to prevent duplicate retries
const processedUpdates = new Map();

function isUpdateDuplicate(updateId) {
  if (!updateId) return false;
  const now = Date.now();
  for (const [id, time] of processedUpdates.entries()) {
    if (now - time > 120000) processedUpdates.delete(id);
  }
  if (processedUpdates.has(updateId)) {
    return true;
  }
  processedUpdates.set(updateId, now);
  return false;
}

export default async function handler(req, res) {
  // 1. Handle Telegram Update POST
  if (req.method === 'POST') {
    try {
      if (!bot) {
        return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is missing' });
      }

      if (req.body) {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (body?.update_id && isUpdateDuplicate(body.update_id)) {
          return res.status(200).json({ ok: true, duplicate: true });
        }

        // On persistent Node server (Render / VPS), respond 200 immediately
        // so Telegram releases the chat queue instantly and delivers consecutive requests without delay!
        if (process.env.PORT) {
          res.status(200).json({ ok: true });
          bot.handleUpdate(body).catch(err => {
            console.error('Error handling Telegram webhook update:', err);
          });
          return;
        }

        await bot.handleUpdate(body);
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Error handling Telegram webhook update:', err);
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // 2. Handle GET request for Health Check / Webhook Registration
  if (req.method === 'GET') {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'futureairpro.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${protocol}://${host}/api/webhook`;

    if (req.query.check_version === 'true') {
      return res.status(200).json({
        deploy_version: "v4_fast_clean_telemetry",
        uptime_seconds: Math.round(process.uptime()),
        cairo_time: new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })
      });
    }

    if (req.query.benchmark_audio === 'true') {
      const t0 = Date.now();
      try {
        const aiKeys = await getStoredAiKeys();
        const numSamples = 5 * 16000;
        const buf = Buffer.alloc(44 + numSamples * 2);
        buf.write('RIFF', 0);
        buf.writeUInt32LE(36 + numSamples * 2, 4);
        buf.write('WAVE', 8);
        buf.write('fmt ', 12);
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(16000, 24);
        buf.writeUInt32LE(32000, 28);
        buf.writeUInt16LE(2, 32);
        buf.writeUInt16LE(16, 34);
        buf.write('data', 36);
        buf.writeUInt32LE(numSamples * 2, 40);

        const erpResult = await parseERPWithGemini(buf, aiKeys.GEMINI_API_KEY, true);
        return res.status(200).json({
          ok: true,
          total_ms: Date.now() - t0,
          intent: erpResult.intent,
          traces: erpResult._debug_traces
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          total_ms: Date.now() - t0,
          error: err.message
        });
      }
    }

    if (req.query.set_webhook === 'true' && bot) {
      try {
        await bot.telegram.setWebhook(webhookUrl);
        await bot.telegram.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '📱 لوحة التحكم (ERP)',
            web_app: { url: 'https://futureairpro.onrender.com/' }
          }
        }).catch(err => console.warn('Could not set chat menu button on webhook register:', err.message));

        return res.status(200).json({
          status: 'success',
          message: 'تم تفعيل الـ Webhook وزر التطبيق المصغر الخاص ببوت التليجرام بنجاح!',
          webhookUrl,
          miniAppUrl: 'https://futureairpro.onrender.com/'
        });
      } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
      }
    }

    // Default GET response: Serve index.html Dashboard
    const indexPath = path.join(rootDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
      return res.status(200).send(fs.readFileSync(indexPath, 'utf8'));
    }

    return res.status(200).json({ status: 'active', time: new Date().toISOString() });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// 🌐 Standalone HTTP Server for Render, Railway, VPS
if (process.env.PORT) {
  import('http').then(({ default: http }) => {
    import('url').then(({ default: url }) => {
      const server = http.createServer(async (req, res) => {
        // Polyfill response helpers for Express-like API
        res.status = function(code) { this.statusCode = code; return this; };
        res.json = function(data) {
          this.setHeader('Content-Type', 'application/json; charset=utf-8');
          this.end(JSON.stringify(data));
        };
        res.send = function(content) {
          this.setHeader('Content-Type', 'text/html; charset=utf-8');
          this.end(content);
        };

        const parsedUrl = url.parse(req.url, true);
        req.query = parsedUrl.query || {};
        const pathname = parsedUrl.pathname || '/';

        const cairoTime = new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour12: true });
        console.log(`[${cairoTime}] 📥 ${req.method} ${pathname} (UA: ${req.headers['user-agent'] ? req.headers['user-agent'].slice(0, 35) : 'unknown'})`);

        // 1. Webhook endpoints
        if (pathname === '/api/webhook') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {};
              } catch (e) {
                req.body = {};
              }
              await handler(req, res);
            });
            return;
          } else {
            await handler(req, res);
            return;
          }
        }

        // 2. Serve ERP Dashboard (Mini App & Browser) Static Files
        if (req.method === 'GET' || req.method === 'HEAD') {
          const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
          const targetFile = path.resolve(rootDir, safeRel);

          if (targetFile.startsWith(rootDir) && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
            const ext = path.extname(targetFile).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.removeHeader('X-Frame-Options');
            res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
            const stream = fs.createReadStream(targetFile);
            stream.pipe(res);
            return;
          }

          // Fallback to index.html if route has no file extension
          if (!path.extname(safeRel)) {
            const indexFile = path.join(rootDir, 'index.html');
            if (fs.existsSync(indexFile)) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.removeHeader('X-Frame-Options');
              res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
              const stream = fs.createReadStream(indexFile);
              stream.pipe(res);
              return;
            }
          }

          return res.status(404).send('404 Not Found');
        }

        return res.status(405).send('Method Not Allowed');
      });

      const port = process.env.PORT || 3000;
      server.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Future Air Telegram Bot Server listening on 0.0.0.0:${port}`);
      });

      // 🔄 Anti-Sleep Self-Ping Keep-Alive (Pings public endpoint every 5 minutes so Render NEVER sleeps)
      const PING_INTERVAL = 5 * 60 * 1000;
      setInterval(async () => {
        try {
          const https = (await import('https')).default;
          https.get('https://futureairpro.onrender.com/api/webhook?check_version=true', (res) => {
            const time = new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour12: true });
            console.log(`[${time}] ⚡ Anti-Sleep Keep-Alive Pulse: Status ${res.statusCode} (Server 100% Warm & Ready)`);
          }).on('error', () => {});
        } catch (e) {}
      }, PING_INTERVAL);
    });
  });
}
