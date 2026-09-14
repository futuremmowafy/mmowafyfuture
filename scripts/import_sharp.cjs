require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function resolveSupplier(name) {
  const { data: existingSup, error: findSupErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', name)
    .single();

  if (findSupErr || !existingSup) {
    const { data: newSup, error: insSupErr } = await supabase
      .from('suppliers')
      .insert({ name: name })
      .select('id')
      .single();
    if (insSupErr) {
      console.error(`Error creating supplier ${name}:`, insSupErr.message);
      return null;
    }
    console.log(`Created supplier "${name}" with ID:`, newSup.id);
    return newSup.id;
  }
  console.log(`Found existing supplier "${name}" with ID:`, existingSup.id);
  return existingSup.id;
}

async function run() {
  console.log('🚀 Starting Sharp El-Araby clean data import...');

  // 1. Resolve both supplier names
  const futureId = await resolveSupplier('شارب العربي - فيوتشر');
  const artId = await resolveSupplier('شارب العربي - ارت كول');

  if (!futureId || !artId) {
    console.error('Failed to resolve one or both supplier IDs');
    return;
  }

  // Helper to insert device and purchase transaction
  async function insertDevicePurchase(supplierId, brand, capacity, cost, qty = 1, details = '', timestamp) {
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

  // Helper to insert raw purchase (brackets/accessories)
  async function insertMaterialPurchase(supplierId, amount, notes, timestamp) {
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'شراء',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting material purchase transaction:', txErr.message);
  }

  // Helper to insert cash payment
  async function insertCashPayment(supplierId, supplierName, amount, notes, timestamp) {
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
        description: `سداد دفعة حساب للمورد ${supplierName} (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow payment:', cashErr.message);
  }

  // Helper to insert rebate (ledger payment without cash flow)
  async function insertRebateSettlement(supplierId, amount, notes, timestamp) {
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: amount,
        notes: `🎁 [تسوية ريبيت/خصم]: ${notes}`,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting rebate transaction:', txErr.message);
  }

  // Helper to insert cash commission (collection)
  async function insertCommissionReceived(supplierId, supplierName, amount, notes, timestamp) {
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'تحصيل',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error('Error inserting commission transaction:', txErr.message);

    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'إيراد',
        amount: amount,
        description: `تحصيل عمولة إضافية نقداً من المورد ${supplierName} (${notes})`,
        created_at: timestamp
      });
    if (cashErr) console.error('Error inserting cash flow collection:', cashErr.message);
  }

  // =========================================================================
  // 1. شارب العربي - فيوتشر
  // =========================================================================
  console.log('\n--- Inserting شارب العربي - فيوتشر ---');
  let timeF = new Date('2026-07-09T10:00:00Z').getTime();
  const getNextTimeF = () => {
    timeF += 1800000;
    return new Date(timeF).toISOString();
  };

  // Purchases
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 50380, 2, 'بارد ساخن ديجيتال', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 56870, 2, 'بارد انفرتر', getNextTimeF());
  await insertMaterialPurchase(futureId, 15225, 'إذن مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'تورنيدو', '1.5-حصان', 19730, 1, 'بارد ديجيتال', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '3-حصان', 84140, 2, 'بارد ساخن ديجيتال', getNextTimeF());
  await insertDevicePurchase(futureId, 'تورنيدو', '2.25-حصان', 67840, 2, 'بارد', getNextTimeF()); // Tornado cool 2.25hp/3hp based on price
  await insertDevicePurchase(futureId, 'تورنيدو', '2.25-حصان', 28080, 1, 'بارد', getNextTimeF());
  await insertMaterialPurchase(futureId, 10950, 'إذن مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 18774, 1, 'بارد بدون بلازما', getNextTimeF());
  await insertMaterialPurchase(futureId, 2325, 'شراء 3 كابولي حديد', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '3-حصان', 42079, 1, 'بارد ساخن ديجيتال', getNextTimeF());
  await insertMaterialPurchase(futureId, 2350, 'مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '2.25-حصان', 30215, 1, 'بارد بدون بلازما', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 28435, 1, 'بارد انفرتر', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 25190, 1, 'بارد ساخن ديجيتال', getNextTimeF());
  await insertDevicePurchase(futureId, 'تورنيدو', '1.5-حصان', 18180, 1, 'بارد بدون شاشة', getNextTimeF());
  await insertMaterialPurchase(futureId, 6700, 'إذن مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 69270, 3, 'بارد ساخن بدون بلازما', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '3-حصان', 96440, 2, 'بارد انفرتر', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 90135, 3, 'بارد ساخن انفرتر', getNextTimeF());
  await insertMaterialPurchase(futureId, 10900, 'إذن مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'تورنيدو', '1.5-حصان', 18180, 1, 'بارد بدون شاشة', getNextTimeF());
  await insertMaterialPurchase(futureId, 22900, 'إذن مشتملات + كوابيل', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '1.5-حصان', 20830, 1, 'بارد بدون بلازما', getNextTimeF());
  await insertDevicePurchase(futureId, 'شارب', '2.25-حصان', 35595, 1, 'بارد ساخن ديجيتال', getNextTimeF());

  // Payments & Commissions
  await insertRebateSettlement(futureId, 23966, 'باقي ريبيت عام 2025 بضاعة', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 100000, 'دفعة نقدي', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 200000, 'دفعة نقدي', getNextTimeF());
  await insertCommissionReceived(futureId, 'شارب العربي - فيوتشر', 20321, 'عمولة اضافية نقدي', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 40000, 'دفعة نقدي', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 110000, 'دفعة نقدي', getNextTimeF());
  await insertCommissionReceived(futureId, 'شارب العربي - فيوتشر', 23167, 'عمولة اضافية نقدي', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 250000, 'دفعة نقدي', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 90000, 'دفعة نقدي', getNextTimeF());

  // =========================================================================
  // 2. شارب العربي - ارت كول
  // =========================================================================
  console.log('\n--- Inserting شارب العربي - ارت كول ---');
  let timeA = new Date('2026-07-10T10:00:00Z').getTime();
  const getNextTimeA = () => {
    timeA += 1800000;
    return new Date(timeA).toISOString();
  };

  // Purchases
  await insertDevicePurchase(artId, 'شارب', '1.5-حصان', 25190, 1, 'بارد ساخن ديجيتال', getNextTimeA());
  await insertDevicePurchase(artId, 'شارب', '1.5-حصان', 56870, 2, 'بارد انفرتر', getNextTimeA());
  await insertMaterialPurchase(artId, 8700, 'إذن مشتملات + كوابيل', getNextTimeA());
  await insertDevicePurchase(artId, 'تورنيدو', '1.5-حصان', 34738, 2, 'بارد', getNextTimeA());
  await insertMaterialPurchase(artId, 1460, 'إذن مشتملات + كوابيل', getNextTimeA());
  await insertDevicePurchase(artId, 'شارب', '1.5-حصان', 56869, 2, 'بارد انفرتر', getNextTimeA());
  await insertDevicePurchase(artId, 'تورنيدو', '1.5-حصان', 18180, 1, 'بارد بدون شاشة', getNextTimeA());
  await insertDevicePurchase(artId, 'شارب', '1.5-حصان', 25190, 1, 'بارد ساخن ديجيتال', getNextTimeA());
  await insertMaterialPurchase(artId, 6675, 'إذن مشتملات + كوابيل', getNextTimeA());
  await insertDevicePurchase(artId, 'تورنيدو', '2.25-حصان', 140400, 5, 'بارد', getNextTimeA());
  await insertMaterialPurchase(artId, 10650, 'إذن مشتملات + كوابيل', getNextTimeA());

  // Payments & Commissions
  await insertRebateSettlement(artId, 14515, 'تسوية ريبيت 2025 ميلاديا', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 10000, 'دفعة نقدي', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 68950, 'دفعة نقدي', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 25000, 'دفعة نقدي', getNextTimeA());
  await insertCommissionReceived(artId, 'شارب العربي - ارت كول', 12473, 'عمولة اضافية نقدي', getNextTimeA());
  await insertCommissionReceived(artId, 'شارب العربي - ارت كول', 14220, 'عمولة اضافية نقدي', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 90000, 'دفعة نقدي', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 130000, 'دفعة نقدي', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 10000, 'دفعة نقدي', getNextTimeA());

  console.log('\n✅ Sharp El-Araby clean import completed successfully!');
}

run();
