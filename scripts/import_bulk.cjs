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
  console.log('🚀 Starting Bulk Merchants Clean Data Import...');

  let baseTime = new Date('2026-07-07T10:00:00Z').getTime();
  const getNextTimestamp = () => {
    baseTime += 1800000; // Increment by 30 minutes
    return new Date(baseTime).toISOString();
  };

  // Helper to insert supplier transactions & cash flow
  async function addTx(supplierId, type, amount, notes, hasCashFlow = false, supplierName = '') {
    const timestamp = getNextTimestamp();
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: type,
        amount: amount,
        notes: notes,
        created_at: timestamp
      });
    if (txErr) console.error(`Error inserting ${type} transaction:`, txErr.message);

    if (hasCashFlow) {
      const { error: cashErr } = await supabase
        .from('cash_flow')
        .insert({
          type: type === 'تحصيل' ? 'إيراد' : 'مصروف',
          amount: amount,
          description: `${type === 'تحصيل' ? 'تحصيل نقدي من' : 'سداد دفعة حساب لـ'} التاجر/المورد ${supplierName} (${notes})`,
          created_at: timestamp
        });
      if (cashErr) console.error(`Error inserting cash flow:`, cashErr.message);
    }
  }

  // ==========================================
  // 1. مايكل عزبة النخل
  // ==========================================
  console.log('\n--- 1. مايكل عزبة النخل ---');
  const michaelId = await resolveSupplier('مايكل عزبة النخل');
  if (michaelId) {
    await addTx(michaelId, 'بيع', 23750, 'بيع جهاز 1.5 ح بارد ميديا انفرتر');
    await addTx(michaelId, 'بيع', 39300, 'بيع جهاز 3ح بارد ميديا انفرتر');
    await addTx(michaelId, 'تحصيل', 63050, 'دفعة نقدي', true, 'مايكل عزبة النخل');
  }

  // ==========================================
  // 2. وائل جمال
  // ==========================================
  console.log('\n--- 2. وائل جمال ---');
  const waelId = await resolveSupplier('وائل جمال');
  if (waelId) {
    await addTx(waelId, 'بيع', 40750, 'بيع جهاز 3ح بارد عادي كاريير');
    await addTx(waelId, 'بيع', 33000, 'بيع جهاز 2.25 بارد كاريير');
    await addTx(waelId, 'بيع', 23500, 'بيع جهاز 1.5 بارد كاريير');
    await addTx(waelId, 'بيع', 20200, 'بيع جهاز 1.5 بارد ميديا');
    await addTx(waelId, 'بيع', 23500, 'بيع جهاز 1.5 بارد كاريير');
    await addTx(waelId, 'بيع', 33500, 'بيع جهاز 2.25 بارد كاريير');
    await addTx(waelId, 'بيع', 38000, 'بيع جهاز 3ح بارد ميديا');
    await addTx(waelId, 'بيع', 1200, 'بيع 2 فاتورة إجمالي');
    
    // Payments he made to us
    await addTx(waelId, 'تحصيل', 40750, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 33000, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 23500, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 20200, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 51000, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 6000, 'دفعة نقدي', true, 'وائل جمال');
    await addTx(waelId, 'تحصيل', 39200, 'دفعة نقدي', true, 'وائل جمال');
  }

  // ==========================================
  // 3. نعيم
  // ==========================================
  console.log('\n--- 3. نعيم ---');
  const naeemId = await resolveSupplier('نعيم');
  if (naeemId) {
    await addTx(naeemId, 'بيع', 24850, 'بيع جهاز 1.5 بارد كاريير انفرتر');
    await addTx(naeemId, 'بيع', 750, 'أجر تركيب جهاز له');
    await addTx(naeemId, 'بيع', 23000, 'بيع جهاز 1.5 بارد كاريير');
    await addTx(naeemId, 'بيع', 23000, 'بيع جهاز 1.5 بارد كاريير');
    await addTx(naeemId, 'بيع', 24150, 'بيع جهاز كاريير 1.5 بارد + التركيب');

    // Payments he made to us
    await addTx(naeemId, 'تحصيل', 24850, 'دفعة نقدي', true, 'نعيم');
    await addTx(naeemId, 'تحصيل', 750, 'دفعة نقدي للتركيب', true, 'نعيم');
    await addTx(naeemId, 'تحصيل', 23000, 'دفعة نقدي', true, 'نعيم');
    await addTx(naeemId, 'تحصيل', 23000, 'دفعة نقدي', true, 'نعيم');
    await addTx(naeemId, 'تحصيل', 24150, 'دفعة نقدي', true, 'نعيم');
  }

  // ==========================================
  // 4. فرج (مورد - اشترينا منه)
  // ==========================================
  console.log('\n--- 4. فرج ---');
  const farajId = await resolveSupplier('فرج');
  if (farajId) {
    // 3 Devices purchased from him, we log them as 'شراء'
    await addTx(farajId, 'شراء', 22500, 'شراء جهاز 1.5 بارد كاريير (ناقص كابولي)');
    // Let's also insert these into inventory
    const serial1 = `DEV-CAR-${Math.floor(100000 + Math.random() * 900000)}`;
    await supabase.from('devices').insert({ brand: 'كاريير', capacity: '1.5-حصان', serial_number: serial1, cost_price: 22500, status: 'متاح', supplier_id: farajId, created_at: getNextTimestamp() });

    await addTx(farajId, 'شراء', 19955, 'شراء جهاز 1.5 بارد ميديا (ناقص كابولي)');
    const serial2 = `DEV-MID-${Math.floor(100000 + Math.random() * 900000)}`;
    await supabase.from('devices').insert({ brand: 'ميديا', capacity: '1.5-حصان', serial_number: serial2, cost_price: 19955, status: 'متاح', supplier_id: farajId, created_at: getNextTimestamp() });

    await addTx(farajId, 'شراء', 39800, 'شراء جهاز 3ح ميديا بارد انفرتر');
    const serial3 = `DEV-MID-${Math.floor(100000 + Math.random() * 900000)}`;
    await supabase.from('devices').insert({ brand: 'ميديا', capacity: '3-حصان', serial_number: serial3, cost_price: 39800, status: 'متاح', supplier_id: farajId, created_at: getNextTimestamp() });

    // Payments we made to him, we log as 'دفع'
    await addTx(farajId, 'دفع', 42625, 'دفعة نقدي', true, 'فرج');
    await addTx(farajId, 'دفع', 39800, 'دفعة نقدي', true, 'فرج');
  }

  // ==========================================
  // 5. عبدالعزيز عين شمس
  // ==========================================
  console.log('\n--- 5. عبدالعزيز عين شمس ---');
  const azizId = await resolveSupplier('عبدالعزيز عين شمس');
  if (azizId) {
    await addTx(azizId, 'بيع', 36500, 'بيع جهاز 2.25 بارد ميديا انفرتر');
    await addTx(azizId, 'تحصيل', 36500, 'دفعة نقدي', true, 'عبدالعزيز عين شمس');
  }

  console.log('\n✅ Bulk data import completed successfully!');
}

run();
