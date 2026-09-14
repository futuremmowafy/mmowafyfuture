const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fsdgiebjkymenayboodg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZGdpZWJqa3ltZW5heWJvb2RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU4NTYyNCwiZXhwIjoyMTA0MTYxNjI0fQ.HadIKjbOZ4L4QyNSeTwUtMM4_pR4Kaw3xMOFRyUlEW0';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function restoreToNewProject() {
  const snapshotPath = path.join(__dirname, '..', 'backups', 'latest_clean_snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    console.error('❌ ملف النسخة الاحتياطية غير موجود:', snapshotPath);
    process.exit(1);
  }

  console.log('🚀 بدء نقل واسترجاع كافة البيانات للمشروع الجديد...');
  console.log('📍 مسار النسخة الاحتياطية:', snapshotPath);
  const backupData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  // 1. Order of insertion to respect foreign keys
  const insertOrder = [
    'suppliers',
    'technicians',
    'devices',
    'cash_flow',
    'supplier_transactions',
    'salary_advances',
    'attendance',
    'bot_sessions'
  ];

  for (const table of insertOrder) {
    const rows = backupData.tables[table] || [];
    if (rows.length === 0) {
      console.log('⚪ جدول [' + table + ']: فارغ في النسخة.');
      continue;
    }

    console.log('⏳ جاري رفع بيانات جدول [' + table + '] (' + rows.length + ' سجل)... ');

    try {
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) {
          throw error;
        }
        insertedCount += chunk.length;
      }
      console.log('✅ تم استرجاع جدول [' + table + '] بنجاح (' + insertedCount + ' / ' + rows.length + ' سجل)');
    } catch (err) {
      console.error('❌ خطأ أثناء رفع جدول [' + table + ']:', err.message);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 تم الانتهاء من فحص ونقل كافة البيانات للمشروع الجديد!');
  console.log('=============================================');
}

restoreToNewProject();
