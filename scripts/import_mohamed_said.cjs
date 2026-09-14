require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Mohamed Said clean data import...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'محمد سعيد')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'محمد سعيد' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Mohamed Said:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "محمد سعيد" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "محمد سعيد" with ID:', supplierId);
  }

  // 2. Define sequential timestamps starting from 2026-07-01T10:00:00Z
  let baseTime = new Date('2026-07-01T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 3600000; // Increment by 1 hour
    return new Date(baseTime).toISOString();
  };

  // Helper to insert device and purchase transaction
  async function insertDevicePurchase(brand, capacity, cost, qty = 1, details = '') {
    const timestamp = getNextTimestamp();
    console.log(`Inserting purchase: ${qty}x ${brand} (${capacity}) - Cost: ${cost} EGP`);

    let deviceIds = [];
    for (let i = 0; i < qty; i++) {
      const serial = `DEV-${brand.substring(0,3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: dev, error: devErr } = await supabase
        .from('devices')
        .insert({
          brand: brand,
          capacity: capacity,
          serial_number: serial,
          cost_price: Math.round(cost / qty),
          status: 'متاح',
          supplier_id: supplierId,
          created_at: timestamp
        })
        .select('id')
        .single();

      if (devErr) {
        console.error(`Error inserting device:`, devErr.message);
      } else {
        deviceIds.push(dev.id);
      }
    }

    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'شراء',
        amount: cost,
        notes: `شراء ${qty} جهاز ${brand} (${capacity}) ${details}`.trim(),
        created_at: timestamp
      });

    if (txErr) console.error('Error inserting purchase transaction:', txErr.message);
  }

  // Helper to insert collection
  async function insertCollection(amount, notes) {
    const timestamp = getNextTimestamp();
    console.log(`Inserting collection: ${amount} EGP - ${notes}`);

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
        description: `تحصيل نقدي من المورد/التاجر محمد سعيد (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // Helper to insert payment (with optional cash flow)
  async function insertPayment(amount, notes, hasCashFlow = true) {
    const timestamp = getNextTimestamp();
    console.log(`Inserting payment: ${amount} EGP - ${notes}`);

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

    if (hasCashFlow) {
      const { error: cashErr } = await supabase
        .from('cash_flow')
        .insert({
          type: 'مصروف',
          amount: amount,
          description: `سداد دفعة حساب للمورد محمد سعيد (${notes})`,
          created_at: timestamp
        });
      if (cashErr) console.error('Error inserting cash flow payment:', cashErr.message);
    }
  }

  // Helper to insert sale of devices to supplier
  async function insertSaleToSupplier(amount, notes) {
    const timestamp = getNextTimestamp();
    console.log(`Inserting sale to supplier: ${amount} EGP - ${notes}`);

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

  // ==========================================
  // Section A: Things we took from Mohamed Said
  // ==========================================
  console.log('\n--- Inserting Things Taken From Mohamed Said (Purchases & Collections) ---');
  
  await insertDevicePurchase('كاريير', '1.5 حصان', 25186, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '2.25 حصان', 33237, 1, 'بارد');
  await insertCollection(20000, 'دفعة نقدي');
  await insertDevicePurchase('ميديا', '1.5 حصان', 19478, 1, 'بارد');
  await insertDevicePurchase('كاريير', '5 حصان', 80350, 1, 'كونسيلد');
  await insertCollection(30000, 'دفعة نقدي');
  await insertDevicePurchase('كاريير', '1.5 حصان', 22092, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 33233, 1, 'بارد'); // match schema format
  await insertDevicePurchase('ميديا', '1.5 حصان', 19478, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25 حصان', 30711, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 23975, 1, 'بارد ساخن');
  await insertDevicePurchase('كاريير', '5 حصان', 784410, 10, 'كونسيلد');
  await insertCollection(49650, 'دفعة نقدي');
  await insertDevicePurchase('LG', '4 حصان', 68290, 1, 'انفرتر');
  await insertDevicePurchase('كاريير', '3 حصان', 39896, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5 حصان', 19478, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5 حصان', 51865, 2, 'ساخن انفرتر');
  await insertDevicePurchase('LG', '1.5 حصان', 19600, 1, 'بارد ساخن هيرو');
  await insertDevicePurchase('ميديا', '1.5 حصان', 41332, 2, 'بارد');
  await insertDevicePurchase('هاير', '1.5 حصان', 18500, 1, 'بارد');

  // ==========================================
  // Section B: Things we gave to Mohamed Said
  // ==========================================
  console.log('\n--- Inserting Things Given To Mohamed Said (Payments & Sales) ---');

  // Rebate settlement (No physical cash flow)
  await insertPayment(169881, 'دفعة ريبيت تسوية خصم مورد', false);

  // Sharp sales (Direct sale to decrease debt)
  await insertSaleToSupplier(75528, 'بيع 3 أجهزة 1.5ح شارب ساخن');
  await insertSaleToSupplier(19273, 'بيع جهاز 1.5ح شارب بارد بدون بلازما');

  // Payments (With physical cash flow)
  await insertPayment(799650, 'دفعة نقدي تحويل بنكي');
  await insertPayment(95000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي تحويل بنك مصر');
  await insertPayment(10000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(40000, 'دفعة نقدي');
  await insertPayment(17000, 'دفعة نقدي فودافون كاش');
  await insertPayment(49000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(35000, 'دفعة نقدي');
  await insertPayment(7000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');

  console.log('\n✅ Mohamed Said data import completed successfully!');
}

run();
