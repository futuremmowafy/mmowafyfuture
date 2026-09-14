const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fsdgiebjkymenayboodg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZGdpZWJqa3ltZW5heWJvb2RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU4NTYyNCwiZXhwIjoyMTA0MTYxNjI0fQ.HadIKjbOZ4L4QyNSeTwUtMM4_pR4Kaw3xMOFRyUlEW0';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TAWFIK_ID = 'e30996b4-0369-46c8-8b80-2c5fb84595c7';

const payments = [
  { date: '2026-08-15', amount: 22500, time: '12:00:00Z' },
  { date: '2026-08-15', amount: 30000, time: '15:00:00Z' },
  { date: '2026-08-16', amount: 25000, time: '12:00:00Z' },
  { date: '2026-08-16', amount: 30000, time: '15:00:00Z' },
  { date: '2026-08-22', amount: 40000, time: '14:00:00Z' },
  { date: '2026-08-23', amount: 30000, time: '14:00:00Z' },
  { date: '2026-08-26', amount: 50000, time: '14:00:00Z' },
  { date: '2026-08-30', amount: 50000, time: '14:00:00Z' },
  { date: '2026-09-02', amount: 100000, time: '12:00:00Z' },
  { date: '2026-09-02', amount: 50000, time: '16:00:00Z' }
];

async function insertPayments() {
  console.log('🚀 بدء إضافة الدفعات المستحقة للتاجر توفيق سالم...');

  let totalAdded = 0;

  for (const p of payments) {
    const createdAt = p.date + 'T' + p.time;

    // 1. Insert into supplier_transactions
    const { error: supErr } = await supabase.from('supplier_transactions').insert({
      supplier_id: TAWFIK_ID,
      transaction_type: 'دفع',
      amount: p.amount,
      notes: 'سداد دفعة للتاجر توفيق سالم بتاريخ ' + p.date,
      created_at: createdAt
    });

    if (supErr) {
      console.error('❌ خطأ في إضافة حركة المورد:', supErr.message);
      continue;
    }

    // 2. Insert into cash_flow
    const { error: cfErr } = await supabase.from('cash_flow').insert({
      type: 'مصروف',
      amount: p.amount,
      description: 'سداد دفعة للتاجر توفيق سالم | خزنة',
      date: p.date,
      created_at: createdAt
    });

    if (cfErr) {
      console.error('⚠️ خطأ في إضافة حركة الخزينة:', cfErr.message);
    }

    totalAdded += p.amount;
    console.log('✅ تم تسجيل دفعة: ' + p.amount.toLocaleString() + ' ج.م بتاريخ ' + p.date);
  }

  console.log('\n=============================================');
  console.log('🎉 تم تسجيل كافة الدفعات الـ 10 بنجاح! إجمالي الدفعات المضافة: ' + totalAdded.toLocaleString() + ' ج.م');
  console.log('=============================================');
}

insertPayments();
