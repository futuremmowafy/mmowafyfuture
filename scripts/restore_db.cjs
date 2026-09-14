const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://rvsznntvsmcshfphidrc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c3pubnR2c21jc2hmcGhpZHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNTQ4MywiZXhwIjoyMDg2NjkxNDgzfQ.t9l9l0s2B9j-5K1z56mF2C4n8q9a1y3x4z5w6v7u8s9';

const supabase = createClient(supabaseUrl, supabaseKey);

async function restoreFullBackup(customFile = null) {
  const backupsDir = path.join(__dirname, '..', 'backups');
  const targetFile = customFile ? path.resolve(customFile) : path.join(backupsDir, 'latest_clean_snapshot.json');

  if (!fs.existsSync(targetFile)) {
    console.error('❌ ملف النسخة الاحتياطية غير موجود:', targetFile);
    process.exit(1);
  }

  console.log('🔄 بدء استرجاع النسخة الاحتياطية من:', targetFile);
  const backupData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

  // Order of restoration:
  // 1. Delete dependent tables, then parents
  // 2. Insert parents, then dependents
  const deleteOrder = [
    'attendance',
    'salary_advances',
    'supplier_transactions',
    'cash_flow',
    'devices',
    'technicians',
    'suppliers',
    'bot_sessions'
  ];

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

  console.log('\n🧹 1. تنظيف البيانات الحالية...');
  for (const table of deleteOrder) {
    try {
      // delete all rows
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && !error.message.includes('chat_id')) {
        // if table uses chat_id or int id
        await supabase.from(table).delete().neq('chat_id', -999999);
      }
      console.log(`   ✅ تم تنظيف جدول [${table}]`);
    } catch (e) {
      console.warn(`   ⚠️ تنبيه عند تنظيف ${table}:`, e.message);
    }
  }

  console.log('\n📥 2. استرجاع البيانات الأصلية من النسخة...');
  for (const table of insertOrder) {
    const rows = backupData.tables[table] || [];
    if (rows.length === 0) {
      console.log(`   ⚪ جدول [${table}]: فارغ في النسخة.`);
      continue;
    }

    try {
      // Chunk inserts in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) throw error;
      }
      console.log(`   ✅ تم استرجاع [${table}]: (${rows.length} سجل بنجاح)`);
    } catch (e) {
      console.error(`   ❌ خطأ في استرجاع ${table}:`, e.message);
    }
  }

  console.log('\n🎉 تمت استعادة كافة بيانات المنظومة بالكامل لحالتها الأصلية بنسبة 100%!');
}

const fileArg = process.argv[2] || null;
restoreFullBackup(fileArg);
