// 🤖 Future Air ERP Telegram Bot Instance
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('⚠️ WARNING: Missing TELEGRAM_BOT_TOKEN in environment variables.');
}

export const bot = token ? new Telegraf(token) : null;

// Helper to check if a user is authorized
export function isAuthorized(userId) {
  const authEnv = process.env.AUTHORIZED_USERS || '';
  const authList = authEnv.split(',').map(s => s.trim()).filter(Boolean);
  if (authList.length === 0) return true; // Default allow if not configured
  return authList.includes(String(userId));
}
