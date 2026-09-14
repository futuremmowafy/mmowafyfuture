require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Ahmed Akry (احمد عكرى) clean data import - Part 1...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'احمد عكرى')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'احمد عكرى' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Ahmed Akry:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "احمد عكرى" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "احمد عكرى" with ID:', supplierId);
  }

  // 2. Sequential timestamps starting from 2026-07-03T10:00:00Z
  let baseTime = new Date('2026-07-03T10:00:00Z').getTime();
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

  // Helper to insert sale of devices to supplier
  async function insertSaleToSupplier(amount, notes) {
    const timestamp = getNextTimestamp();
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'بيع',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting sale to supplier transaction:', txErr.message);
  }

  // Insert sales
  await insertSaleToSupplier(78700, 'بيع جهاز كونسيلد كاريير 5 ح');
  await insertSaleToSupplier(22750, 'بيع جهاز 1.5 بارد كاريير عادي');
  await insertSaleToSupplier(19295, 'بيع جهاز 1.5 بارد تورنيدو');
  
  // Cash paid to him (he took from us)
  await insertPayment(1200, 'دفعة نقدي');

  // More sales
  await insertSaleToSupplier(51865, 'بيع 2 جهاز 1.5 بارد ساخن انفرتر ميديا');
  await insertSaleToSupplier(27645, 'بيع جهاز 2.25 تورنيدو بارد');

  // Cash paid to him (he took from us)
  await insertPayment(900, 'دفعة نقدي');

  console.log('✅ Ahmed Akry Part 1 data import completed successfully!');
}

run();
