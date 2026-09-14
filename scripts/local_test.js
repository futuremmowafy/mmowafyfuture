// Local development polling runner for Telegram Bot
import { bot } from '../lib/bot.js';
import { registerHandlers } from '../lib/handlers.js';
import dotenv from 'dotenv';

dotenv.config();

async function startLocal() {
  if (!bot) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
  }

  registerHandlers(bot);

  console.log('⏳ Deleting any existing webhook for local polling...');
  await bot.telegram.deleteWebhook();

  console.log('🚀 Telegram Voice ERP Bot is running locally in polling mode!');
  console.log('🎙️ Send a voice message or text on Telegram to test...');
  bot.launch();

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

startLocal().catch(err => {
  console.error('Error starting local bot:', err);
});
