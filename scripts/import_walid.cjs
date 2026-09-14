require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Walid Attia (وليد عطية) clean data import...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'وليد عطية')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'وليد عطية' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Walid Attia:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "وليد عطية" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "وليد عطية" with ID:', supplierId);
  }

  // 2. Sequential timestamps starting from 2026-07-08T10:00:00Z
  let baseTime = new Date('2026-07-08T10:00:00Z').getTime();
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
        description: `تحصيل نقدي من التاجر وليد عطية (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // ==========================================
  // Section A: Things he took from us (Sales & Services)
  // ==========================================
  console.log('\n--- Inserting Sales & Services ---');
  await insertSaleToSupplier(21400, 'بيع جهاز كاريير 1.5 بارد');
  await insertSaleToSupplier(21800, 'بيع جهاز كاريير 1.5 بارد');
  await insertSaleToSupplier(76600, 'بيع 2 جهاز كاريير 2.25 بارد انفرتر');
  await insertSaleToSupplier(35800, 'بيع جهاز ميديا 3ح بارد');
  await insertSaleToSupplier(40600, 'بيع 2 جهاز ميديا 1.5 بارد');
  await insertSaleToSupplier(36000, 'بيع جهاز ميديا 3ح بارد');
  await insertSaleToSupplier(460, 'عمولة ماكينة فيزا');
  await insertSaleToSupplier(34117, 'بيع جهاز كاريير 2.25 بارد ساخن');
  await insertSaleToSupplier(23000, 'بيع جهاز كاريير 1.5 بارد');

  // ==========================================
  // Section B: Things he paid to us (Collections)
  // ==========================================
  console.log('\n--- Inserting Collections ---');
  await insertCollection(21400, 'دفعة نقدي');
  await insertCollection(21800, 'دفعة نقدي');
  await insertCollection(76600, 'دفعة نقدي');
  await insertCollection(35800, 'دفعة نقدي');
  await insertCollection(10000, 'دفعة نقدي');
  await insertCollection(8060, 'دفعة نقدي');
  await insertCollection(23000, 'دفعة نقدي');
  await insertCollection(36000, 'دفعة نقدي');
  await insertCollection(16500, 'دفعة نقدي');
  await insertCollection(17600, 'دفعة نقدي');
  await insertCollection(4000, 'دفعة نقدي');
  await insertCollection(19000, 'دفعة نقدي');

  console.log('✅ Walid Attia data import completed successfully!');
}

run();
