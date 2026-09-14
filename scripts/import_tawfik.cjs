require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🚀 Starting Tawfik (توفيق سالم) clean data import...');

  // 1. Get or create Supplier
  let supplierId;
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'توفيق سالم')
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: 'توفيق سالم' })
      .select('id')
      .single();
    if (insSupErr) {
      console.error('Error creating supplier Tawfik:', insSupErr.message);
      return;
    }
    supplierId = newSup.id;
    console.log('Created supplier "توفيق سالم" with ID:', supplierId);
  } else {
    supplierId = existingSup.id;
    console.log('Found existing supplier "توفيق سالم" with ID:', supplierId);
  }

  // 2. Sequential timestamps starting from 2026-07-02T10:00:00Z
  let baseTime = new Date('2026-07-02T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 1800000; // Increment by 30 minutes to separate items
    return new Date(baseTime).toISOString();
  };

  // Helper to insert device and purchase transaction
  async function insertDevicePurchase(brand, capacity, cost, qty = 1, details = '') {
    const timestamp = getNextTimestamp();
    const cleanCost = Math.round(cost / qty);
    
    for (let i = 0; i < qty; i++) {
      const serial = `DEV-${brand.substring(0,3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const { error: devErr } = await supabase
        .from('devices')
        .insert({
          brand: brand,
          capacity: capacity,
          serial_number: serial,
          cost_price: cleanCost,
          status: 'متاح',
          supplier_id: supplierId,
          created_at: timestamp
        });
      if (devErr) console.error(`Error inserting device:`, devErr.message);
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
        description: `تحصيل نقدي من المورد/التاجر توفيق سالم (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

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
        description: `سداد دفعة حساب للمورد توفيق سالم (${notes})`,
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

  // ==========================================
  // Section A: Things taken from Tawfik
  // ==========================================
  console.log('\n--- Inserting Purchases & Collections ---');

  // Before agreement
  await insertDevicePurchase('شارب', '3 حصان', 41039, 1, 'بارد');
  await insertCollection(9670, 'دفعة نقدي');
  await insertDevicePurchase('كاريير', '1.5 حصان', 42590, 2, 'بارد');
  await insertDevicePurchase('كاريير', '3 حصان', 46285, 1, 'ساخن انفرتر');
  await insertDevicePurchase('كاريير', '1.5 حصان', 21865, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25 حصان', 38700, 1, 'بارد انفرتر');

  // After agreement
  await insertDevicePurchase('ميديا', '1.5-حصان', 19478, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 22815, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22980, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 78211, 2, 'بارد انفرتر');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20260, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25-حصان', 35288, 1, 'بارد انفرتر');
  await insertDevicePurchase('ميديا', '1.5-حصان', 47462, 2, 'بارد');
  await insertDevicePurchase('ميديا', '3-حصان', 37145, 1, 'بارد (بعد خصم الكابولي وخصم 3%)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 45958, 2, 'بارد');
  await insertDevicePurchase('كاريير', '5-حصان', 241049, 3, 'كونسيلد');
  await insertDevicePurchase('كاريير', '4-حصان', 69873, 1, 'كونسيلد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '3-حصان', 35770, 1, 'بارد (بعد خصم الوصلة والكابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 23731, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '3-حصان', 39120, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '3-حصان', 36937, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30128, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('كاريير', '3-حصان', 39120, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 32650, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '3-حصان', 39546, 1, 'بارد انفرتر');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30196, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22465, 1, 'بارد');
  await insertDevicePurchase('شارب', '2.25-حصان', 48640, 1, 'بارد ساخن انفرتر');
  await insertDevicePurchase('شارب', '3-حصان', 53440, 1, 'بارد ساخن انفرتر');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('كاريير', '4-حصان', 67327, 1, 'بارد ساخن');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 51864, 2, 'بارد ساخن انفرتر');
  await insertDevicePurchase('كاريير', '2.25-حصان', 35652, 1, 'بارد ساخن');
  await insertDevicePurchase('كاريير', '1.5-حصان', 26194, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '2.25-حصان', 32620, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30710, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30710, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 39106, 1, 'بارد انفرتر');
  await insertDevicePurchase('ميديا', '2.25-حصان', 29614, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22465, 1, 'بارد');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30196, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 32136, 1, 'بارد');
  await insertDevicePurchase('كاريير', '2.25-حصان', 33236, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 26195, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20258, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22979, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22926, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20152, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 23692, 1, 'بارد انفرتر (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '2.25-حصان', 31331, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22925, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('كاريير', '2.25-حصان', 32790, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 40303, 2, 'بارد (ناقص 2 كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 40303, 2, 'بارد (ناقص 2 كابولي)');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30812, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('كاريير', '1.5-حصان', 23440, 1, 'بارد');
  await insertDevicePurchase('كاريير', '3-حصان', 39337, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '2.25-حصان', 35997, 1, 'بارد انفرتر');
  await insertDevicePurchase('كاريير', '1.5-حصان', 23440, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 23440, 1, 'بارد');
  await insertDevicePurchase('ميديا', '1.5-حصان', 40303, 2, 'بارد (ناقص 2 كابولي)');
  await insertDevicePurchase('ميديا', '3-حصان', 40920, 1, 'بارد انفرتر');
  await insertDevicePurchase('ميديا', '2.25-حصان', 30812, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20151, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '3-حصان', 37679, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22925, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('كاريير', '2.25-حصان', 33387, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('كاريير', '2.25-حصان', 66775, 2, 'بارد (ناقص 2 كابولي)');
  await insertDevicePurchase('كاريير', '1.5-حصان', 22925, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20151, 1, 'بارد (ناقص كابولي)');
  await insertDevicePurchase('ميديا', '1.5-حصان', 20665, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 23440, 1, 'بارد');
  await insertDevicePurchase('كاريير', '1.5-حصان', 46880, 2, 'بارد');

  // ==========================================
  // Section B: Things given to Tawfik
  // ==========================================
  console.log('\n--- Inserting Payments & Sales ---');

  // Tornado Sales
  await insertSaleToSupplier(20500, 'بيع جهاز 1.5ح تورنيدو');
  await insertSaleToSupplier(30209, 'بيع جهاز 2.25ح تورنيدو');

  // Payments (Numbers only)
  await insertPayment(80000, 'دفعة نقدي');
  await insertPayment(10000, 'دفعة نقدي');
  await insertPayment(5400, 'دفعة نقدي');
  await insertPayment(15000, 'دفعة نقدي');
  await insertPayment(5000, 'دفعة نقدي');
  await insertPayment(35000, 'دفعة نقدي');
  await insertPayment(7000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(76000, 'دفعة نقدي');
  await insertPayment(8500, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(100000, 'دفعة نقدي');
  await insertPayment(55000, 'دفعة نقدي');
  await insertPayment(100000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(26000, 'دفعة نقدي');
  await insertPayment(12000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(35000, 'دفعة نقدي');
  await insertPayment(9990, 'دفعة نقدي');
  await insertPayment(32000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(35000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(28000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');

  // Tornado Sales
  await insertSaleToSupplier(19091, 'بيع جهاز 1.5ح تورنيدو');
  await insertSaleToSupplier(28397, 'بيع جهاز 2.25ح تورنيدو');

  // Payments
  await insertPayment(37000, 'دفعة نقدي');
  await insertPayment(7500, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(25000, 'دفعة نقدي');

  // Tornado Sale
  await insertSaleToSupplier(90630, 'بيع 3 أجهزة 2.25ح تورنيدو');

  // Payments
  await insertPayment(10000, 'دفعة نقدي');
  await insertPayment(10000, 'دفعة نقدي');
  await insertPayment(44000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(56000, 'دفعة نقدي');

  // Sharp & Tornado Sales
  await insertSaleToSupplier(35527, 'بيع جهاز 2.25ح شارب بارد ساخن');
  await insertSaleToSupplier(34093, 'بيع جهاز 3ح تورنيدو بارد');

  // Payments
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(45000, 'دفعة نقدي');
  await insertPayment(35000, 'دفعة نقدي');
  await insertPayment(40000, 'دفعة نقدي');
  await insertPayment(60000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(7500, 'دفعة نقدي');
  await insertPayment(40000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(132000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(25000, 'دفعة نقدي');
  await insertPayment(40000, 'دفعة نقدي');
  await insertPayment(130000, 'دفعة نقدي');
  await insertPayment(60000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(27500, 'دفعة نقدي');
  await insertPayment(40000, 'دفعة نقدي');
  await insertPayment(20000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(37500, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(25000, 'دفعة نقدي');
  await insertPayment(50000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(15000, 'دفعة نقدي');
  await insertPayment(15000, 'دفعة نقدي');
  await insertPayment(30000, 'دفعة نقدي');
  await insertPayment(100000, 'دفعة نقدي');

  console.log('\n✅ Tawfik data import completed successfully!');
}

run();
