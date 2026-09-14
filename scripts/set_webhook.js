// Script to register the Telegram webhook URL with Telegram API
import { bot } from '../lib/bot.js';
import dotenv from 'dotenv';

dotenv.config();

const webhookUrl = process.argv[2] || 'https://futureairpro.vercel.app/api/webhook';

async function main() {
  if (!bot) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
  }

  console.log(`⏳ Setting Telegram bot webhook to: ${webhookUrl}`);
  await bot.telegram.setWebhook(webhookUrl);
  const info = await bot.telegram.getWebhookInfo();
  console.log('✅ Webhook set successfully:', info);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed to set webhook:', err);
  process.exit(1);
});
