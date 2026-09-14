require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Mohamed Samy (محمد سامي) clean data import...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'محمد سامي')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'محمد سامي' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Mohamed Samy:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "محمد سامي" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "محمد سامي" with ID:', supplierId);
  }

  // 2. Sequential timestamps starting from 2026-07-06T10:00:00Z
  let baseTime = new Date('2026-07-06T10:00:00Z').getTime();
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
        description: `تحصيل نقدي من المورد/التاجر محمد سامي (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // ==========================================
  // Section A: Things he took from us (Sales & Services)
  // ==========================================
  console.log('\n--- Inserting Sales & Services ---');
  await insertSaleToSupplier(36000, 'بيع جهاز ميديا 3ح بارد (ناقص كابولي)');
  await insertSaleToSupplier(1500, 'أجر تركيب جهاز 5ح له');
  await insertSaleToSupplier(29760, 'بيع جهاز ميديا 2.25 بارد');
  await insertSaleToSupplier(900, 'أجر تركيب جهاز له');

  // ==========================================
  // Section B: Things he paid to us (Collections)
  // ==========================================
  console.log('\n--- Inserting Collections ---');
  await insertCollection(36000, 'دفعة نقدي');
  await insertCollection(1500, 'دفعة نقدي');
  await insertCollection(30700, 'دفعة نقدي');

  console.log('✅ Mohamed Samy data import completed successfully!');
}

run();
