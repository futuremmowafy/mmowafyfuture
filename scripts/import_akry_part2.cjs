require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Ahmed Akry (احمد عكرى) clean data import - Part 2...');

  const supplierId = '46483de9-dbcd-4c59-baf7-8ce5d5324a8b'; // Ahmed Akry UUID

  // Sequential timestamps starting from 2026-07-04T10:00:00Z
  let baseTime = new Date('2026-07-04T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 1800000; // Increment by 30 minutes
    return new Date(baseTime).toISOString();
  };

  // Helper to insert payment
  async function insertPayment(amount, notes) {
    const timestamp = getNextTimestamp();
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting payment transaction:', txErr.message);

    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'مصروف',
        amount: amount,
        description: `سداد دفعة حساب للمورد/التاجر احمد عكرى (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow payment:', cashErr.message);
  }

  // Helper to insert collection
  async function insertCollection(amount, notes) {
    const timestamp = getNextTimestamp();
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'تحصيل',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting collection transaction:', txErr.message);

    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'إيراد',
        amount: amount,
        description: `تحصيل نقدي من المورد/التاجر احمد عكرى (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // Add the additional cash he took
  await insertPayment(4410, 'دفعة نقدي إضافية');

  // Add the collections he paid us
  await insertCollection(1766, 'تصفية عام 2025');
  await insertCollection(74000, 'دفعة نقدي');
  await insertCollection(100000, 'دفعة نقدي');
  await insertCollection(25000, 'دفعة نقدي');

  console.log('✅ Ahmed Akry Part 2 data import completed successfully!');
}

run();
