require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const futureId = '5390dc3f-a041-48bb-a94a-e31a9733431d';
const artId = '8efc3173-bb35-4aa2-b94d-45d3704e4605';

async function run() {
  console.log('🧹 Cleaning old Sharp transactions and devices...');
  
  // Clear supplier transactions
  await supabase.from('supplier_transactions').delete().eq('supplier_id', futureId);
  await supabase.from('supplier_transactions').delete().eq('supplier_id', artId);

  // Clear devices associated with these suppliers
  await supabase.from('devices').delete().eq('supplier_id', futureId);
  await supabase.from('devices').delete().eq('supplier_id', artId);

  // Clear cash flow records that were created for these suppliers' commissions
  // Since we are rebuilding cash flow, let's delete the previous cash flows associated with Sharp commissions
  // In the previous import, the commissions were logged as cash_flow description like "تحصيل نقدي من المورد شارب العربي..."
  // We can delete cash_flow records matching those descriptions.
  await supabase.from('cash_flow').delete().ilike('description', '%شارب العربي%');

  console.log('✨ Clean slate ready. Re-importing with corrected ledger logic...');

  let baseTime = new Date('2026-07-09T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 1800000; // Increment by 30 minutes
    return new Date(baseTime).toISOString();
  };

  // Helper to insert device and purchase transaction
  async function insertDevicePurchase(supplierId, brand, capacity, cost, qty = 1, details = '', timestamp) {
    const cleanCost = Math.round(cost / qty);
    
    for (let i = 0; i < qty; i++) {
      const serial = `DEV-${brand.substring(0,3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      await supabase
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
    }

    await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'شراء',
        amount: cost,
        notes: `شراء ${qty} جهاز ${brand} (${capacity}) ${details}`.trim(),
        created_at: timestamp
      });
  }

  // Helper to insert raw purchase
  async function insertMaterialPurchase(supplierId, amount, notes, timestamp) {
    await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'شراء',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
  }

  // Helper to insert cash payment (reduces debt AND reduces cash vault)
  async function insertCashPayment(supplierId, supplierName, amount, notes, timestamp) {
    await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });

    await supabase
      .from('cash_flow')
      .insert({
        type: 'مصروف',
        amount: amount,
        description: `سداد دفعة حساب للمورد ${supplierName} (${notes})`,
        created_at: timestamp
      });
  }

  // Helper to insert rebate/commission settlement (reduces debt but does NOT touch cash vault)
  async function insertRebateOrCommission(supplierId, amount, notes, timestamp) {
    await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
  }

  // =========================================================================
  // 1. شارب العربي - فيوتشر
  // =========================================================================
  console.log('\n--- Re-inserting شارب العربي - فيوتشر ---');
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
  await insertDevicePurchase(futureId, 'تورنيدو', '2.25-حصان', 67840, 2, 'بارد', getNextTimeF());
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

  // Payments & Non-cash settlements
  await insertRebateOrCommission(futureId, 23966, '🎁 [تسوية ريبيت/خصم]: باقي ريبيت عام 2025 بضاعة', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 100000, 'دفعة نقدي للجزنة', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 200000, 'دفعة نقدي للجزنة', getNextTimeF());
  await insertRebateOrCommission(futureId, 20321, '🎁 [تسوية ريبيت/خصم]: عمولة اضافية دفترياً سداد مديونية', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 40000, 'دفعة نقدي للجزنة', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 110000, 'دفعة نقدي للجزنة', getNextTimeF());
  await insertRebateOrCommission(futureId, 23167, '🎁 [تسوية ريبيت/خصم]: عمولة اضافية دفترياً سداد مديونية', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 250000, 'دفعة نقدي للجزنة', getNextTimeF());
  await insertCashPayment(futureId, 'شارب العربي - فيوتشر', 90000, 'دفعة نقدي للجزنة', getNextTimeF());

  // =========================================================================
  // 2. شارب العربي - ارت كول
  // =========================================================================
  console.log('\n--- Re-inserting شارب العربي - ارت كول ---');
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

  // Payments & Non-cash settlements
  await insertRebateOrCommission(artId, 14515, '🎁 [تسوية ريبيت/خصم]: ريبيت عام 2025 دفترياً سداد مديونية', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 10000, 'دفعة نقدي للجزنة', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 68950, 'دفعة نقدي للجزنة', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 25000, 'دفعة نقدي للجزنة', getNextTimeA());
  await insertRebateOrCommission(artId, 12473, '🎁 [تسوية ريبيت/خصم]: عمولة اضافية دفترياً سداد مديونية', getNextTimeA());
  await insertRebateOrCommission(artId, 14220, '🎁 [تسوية ريبيت/خصم]: عمولة اضافية دفترياً سداد مديونية', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 90000, 'دفعة نقدي للجزنة', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 130000, 'دفعة نقدي للجزنة', getNextTimeA());
  await insertCashPayment(artId, 'شارب العربي - ارت كول', 10000, 'دفعة نقدي للجزنة', getNextTimeA());

  console.log('\n✅ Sharp El-Araby clean re-import completed successfully!');
}

run();
