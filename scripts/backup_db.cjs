const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://rvsznntvsmcshfphidrc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c3pubnR2c21jc2hmcGhpZHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNTQ4MywiZXhwIjoyMDg2NjkxNDgzfQ.t9l9l0s2B9j-5K1z56mF2C4n8q9a1y3x4z5w6v7u8s9';

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  'devices',
  'cash_flow',
  'suppliers',
  'supplier_transactions',
  'technicians',
  'attendance',
  'salary_advances',
  'bot_sessions'
];

async function takeFullBackup() {
  console.log('🚀 بدء أخذ نسخة احتياطية شاملة لكافة بيانات وجداول الموقع والمنظومة...');
  const backupData = {
    timestamp: new Date().toISOString(),
    cairo_time: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
    tables: {}
  };

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.warn(`⚠️ تعذر قراءة جدول ${table}:`, error.message);
        backupData.tables[table] = [];
      } else {
        backupData.tables[table] = data || [];
        console.log(`✅ تم حفظ جدول [${table}]: (${(data || []).length} سجل)`);
      }
    } catch (e) {
      console.warn(`❌ خطأ في جدول ${table}:`, e.message);
      backupData.tables[table] = [];
    }
  }

  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snapshotPath = path.join(backupsDir, `snapshot_${dateStr}.json`);
  const latestPath = path.join(backupsDir, 'latest_clean_snapshot.json');

  const jsonContent = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(snapshotPath, jsonContent, 'utf8');
  fs.writeFileSync(latestPath, jsonContent, 'utf8');

  console.log('\n🎉 تم أخذ النسخة الاحتياطية وحفظها بنجاح!');
  console.log('📁 مسار النسخة المؤرخة:', snapshotPath);
  console.log('📁 مسار النسخة الأساسية:', latestPath);
}

takeFullBackup();
