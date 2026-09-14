require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Neshat (نشأت) clean data import...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'نشأت')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'نشأت' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Neshat:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "نشأت" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "نشأت" with ID:', supplierId);
  }

  // 2. Sequential timestamps starting from 2026-07-05T10:00:00Z
  let baseTime = new Date('2026-07-05T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 1800000; // Increment by 30 minutes
    return new Date(baseTime).toISOString();
  };

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
    if (txErr) console.error('Error inserting sale transaction:', txErr.message);
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
        description: `تحصيل نقدي من المورد/التاجر نشأت (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // ==========================================
  // Section A: Things he took from us (Sales & Services)
  // ==========================================
  console.log('\n--- Inserting Sales & Services ---');
  await insertSaleToSupplier(22300, 'بيع جهاز 1.5 بارد كاريير');
  await insertSaleToSupplier(38700, 'بيع جهاز 3ح بارد كاريير');
  await insertSaleToSupplier(38700, 'بيع جهاز 2.25 بارد كاريير انفرتر');
  await insertSaleToSupplier(20200, 'بيع جهاز 1.5 بارد ميديا');
  await insertSaleToSupplier(32314, 'بيع جهاز 2.25 بارد كاريير');
  await insertSaleToSupplier(750, 'أجر تركيب جهاز كاريير له');
  await insertSaleToSupplier(20200, 'بيع جهاز 1.5 بارد ميديا');
  await insertSaleToSupplier(750, 'أجر تركيب جهاز ميديا له');
  await insertSaleToSupplier(23500, 'بيع جهاز كاريير 1.5 ح بارد');
  await insertSaleToSupplier(20200, 'بيع جهاز ميديا 1.5ح بارد');

  // ==========================================
  // Section B: Things he paid to us (Collections)
  // ==========================================
  console.log('\n--- Inserting Collections ---');
  await insertCollection(22300, 'دفعة نقدي');
  await insertCollection(25000, 'دفعة نقدي');
  await insertCollection(33065, 'دفعة نقدي');
  await insertCollection(7500, 'دفعة نقدي');
  await insertCollection(5400, 'دفعة نقدي');
  await insertCollection(800, 'دفعة نقدي');
  await insertCollection(38700, 'دفعة نقدي');
  await insertCollection(20200, 'دفعة نقدي');
  await insertCollection(21200, 'دفعة نقدي');
  await insertCollection(23250, 'دفعة نقدي');
  await insertCollection(20200, 'دفعة نقدي');

  console.log('✅ Neshat data import completed successfully!');
}

run();
