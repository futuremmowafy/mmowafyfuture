require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const dirPath = 'C:\\Users\\LENOVO LEGION5\\Desktop\\فولدر تظبيط الشغل من  2026جديد';

function convertExcelDate(excelDate) {
  try {
    if (!excelDate) return new Date().toISOString();
    if (typeof excelDate === 'string') {
      const parts = excelDate.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const testDate = new Date(y, m, d);
        if (!isNaN(testDate.getTime())) return testDate.toISOString();
      }
      const parsed = new Date(excelDate);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
      return new Date().toISOString();
    }
    const num = Number(excelDate);
    if (!isNaN(num)) {
      const date = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    return new Date().toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

function cleanSupplierName(sheetName) {
  // Clean name from digits and trailing words
  return sheetName.replace(/\d+$/, '').replace(/تجارى$/, '').trim();
}

async function runMigration() {
  console.log('🚀 Starting Clean Data Migration from Excel files...');

  // ==========================================
  // 0. RESET ENTIRE DATABASE FOR A CLEAN SLATE
  // ==========================================
  console.log('\n🧹 Clearing old tables to prevent duplicates...');
  
  await supabase.from('supplier_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('salary_advances').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('cash_flow').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('devices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('technicians').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('suppliers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log('✨ Database reset complete.');

  // ==========================================
  // 1. IMPORT TECHNICIANS (Staff list)
  // ==========================================
  console.log('\n--- Importing Technicians & Staff ---');
  const techNames = [
    'شعراوي', 'عبده', 'أحمد', 'اسلام', // Active staff
    'هشام', 'بوده', 'ناصر', 'ياسر', 'اشرف', 'بدر', 'مصطفى', 'عاطف', 'محمد الصغير', 'مودى', 'عبير' // Historical references
  ];
  
  const techMap = {}; // name -> id
  for (const name of techNames) {
    const { data: tech, error } = await supabase
      .from('technicians')
      .insert({ name: name, monthly_salary: 6000 })
      .select('id')
      .single();
    if (error) {
      console.error(`Error inserting tech ${name}:`, error.message);
    } else {
      techMap[name] = tech.id;
      console.log(`Created employee: ${name}`);
    }
  }

  // ==========================================
  // 2. IMPORT SUPPLIERS
  // ==========================================
  console.log('\n--- Importing Suppliers/Traders ---');
  const supplierFile = 'كشوف حساب عبير جديده2026.xlsx';
  const supplierFilePath = path.join(dirPath, supplierFile);
  const supplierMap = {}; // name -> id
  
  if (fs.existsSync(supplierFilePath)) {
    const wb = xlsx.readFile(supplierFilePath);
    for (const sheetName of wb.SheetNames) {
      const cleanedName = cleanSupplierName(sheetName);
      if (!cleanedName || 
          cleanedName.includes('مهم') || 
          cleanedName.includes('طباعه') || 
          cleanedName.includes('كشوف') || 
          cleanedName.includes('رصيد') || 
          cleanedName.includes('جميع الكشوف') || 
          cleanedName.includes('ورق')) {
        continue;
      }

      if (!supplierMap[cleanedName]) {
        const { data: sup, error } = await supabase
          .from('suppliers')
          .insert({ name: cleanedName })
          .select('id')
          .single();
        if (error) {
          console.error(`Error inserting supplier ${cleanedName}:`, error.message);
        } else {
          supplierMap[cleanedName] = sup.id;
          console.log(`Created supplier: ${cleanedName}`);
        }
      }
    }
  }

  // ==========================================
  // 3. IMPORT CLIENTS & SOLD DEVICES
  // ==========================================
  console.log('\n--- Importing Clients & Sold Devices ---');
  const clientFile = 'عملاء عـــام 2026.xlsx';
  const clientFilePath = path.join(dirPath, clientFile);
  
  if (fs.existsSync(clientFilePath)) {
    const wb = xlsx.readFile(clientFilePath);
    for (const sheetName of wb.SheetNames) {
      console.log(`Processing client sheet: "${sheetName}"`);
      const sheet = wb.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      for (let idx = 2; idx < rows.length; idx++) {
        const r = rows[idx];
        if (!r || !r[0]) continue;
        
        const customerName = r[0].toString().trim();
        const phone = r[1] ? r[1].toString().replace(/-$/, '').trim() : '';
        const address = `${r[2] || ''} - ${r[3] || ''}`.trim();
        const model = r[4] ? r[4].toString().trim() : '';
        const installDateStr = r[5];
        const crew = r[9] ? r[9].toString().trim() : '';

        let brand = 'شارب';
        if (model.includes('كاريير') || model.toLowerCase().includes('carrier')) brand = 'كاريير';
        else if (model.includes('ميديا') || model.toLowerCase().includes('midea')) brand = 'ميديا';
        else if (model.includes('ال ج') || model.toLowerCase().includes('lg')) brand = 'LG';
        else if (model.includes('فريش') || model.toLowerCase().includes('fresh')) brand = 'فريش';
        else if (model.includes('هاير') || model.toLowerCase().includes('haier')) brand = 'هاير';

        let capacity = '1.5 حصان';
        if (model.includes('1.5')) capacity = '1.5 حصان';
        else if (model.includes('2.25')) capacity = '2.25 حصان';
        else if (model.includes('3')) capacity = '3 حصان';
        else if (model.includes('4')) capacity = '4 حصان';
        else if (model.includes('5')) capacity = '5 حصان';

        let techId = null;
        for (const name of techNames) {
          if (crew.includes(name)) {
            techId = techMap[name];
            break;
          }
        }

        const serial = `HIST-SOLD-${sheetName.replace(/\s+/g, '')}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`;

        const { error } = await supabase
          .from('devices')
          .insert({
            brand: brand,
            capacity: capacity,
            serial_number: serial,
            status: 'تم التركيب',
            customer_name: customerName,
            customer_phone: phone,
            customer_address: address,
            technician_id: techId,
            sale_price: 0,
            amount_paid: 0,
            amount_remaining: 0,
            installed_at: convertExcelDate(installDateStr),
            assigned_at: convertExcelDate(installDateStr)
          });

        if (error) {
          console.error(`Error inserting sold device for ${customerName}:`, error.message);
        }
      }
      console.log(`Finished sheet: "${sheetName}"`);
    }
  }

  // ==========================================
  // 4. IMPORT AVAILABLE INVENTORY DEVICES
  // ==========================================
  console.log('\n--- Importing Available Inventory ---');
  const inventoryFile = 'مخزن مختلف لعام 2026.xlsx';
  const inventoryFilePath = path.join(dirPath, inventoryFile);

  if (fs.existsSync(inventoryFilePath)) {
    const wb = xlsx.readFile(inventoryFilePath);
    const sheet = wb.Sheets['جرد مخزن المختلف '];
    if (sheet) {
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      for (let idx = 5; idx < rows.length; idx++) {
        const r = rows[idx];
        if (!r) continue;

        if (r[1] && Number(r[2]) > 0) {
          await insertAvailableUnits('كاريير', r[1], Number(r[2]), idx);
        }
        if (r[3] && Number(r[4]) > 0) {
          await insertAvailableUnits('ميديا', r[3], Number(r[4]), idx);
        }
        if (r[5] && Number(r[6]) > 0) {
          let brand = 'فريش';
          if (r[5].includes('هاير') || r[5].includes('هايير')) brand = 'هاير';
          else if (r[5].includes('ال ج')) brand = 'LG';
          await insertAvailableUnits(brand, r[5], Number(r[6]), idx);
        }
      }
    }
  }

  async function insertAvailableUnits(brand, modelName, count, rowIdx) {
    let capacity = '1.5 حصان';
    if (modelName.includes('1.5')) capacity = '1.5 حصان';
    else if (modelName.includes('2.25')) capacity = '2.25 حصان';
    else if (modelName.includes('3')) capacity = '3 حصان';
    else if (modelName.includes('4')) capacity = '4 حصان';
    else if (modelName.includes('5')) capacity = '5 حصان';

    for (let i = 0; i < count; i++) {
      const serial = `HIST-AVAIL-${brand.slice(0,3).toUpperCase()}-${capacity.replace(' ', '')}-${rowIdx}-${i}`;
      await supabase
        .from('devices')
        .insert({
          brand: brand,
          capacity: capacity,
          serial_number: serial,
          status: 'متاح',
          cost_price: 0,
          amount_paid: 0,
          amount_remaining: 0
        });
    }
    console.log(`Added available units: ${count} of ${brand} (${capacity})`);
  }

  // ==========================================
  // 5. IMPORT SUPPLIER LEDGER TRANSACTIONS (Type A & Type B Parsers)
  // ==========================================
  console.log('\n--- Importing Corrected Supplier Ledgers ---');
  if (fs.existsSync(supplierFilePath)) {
    const wb = xlsx.readFile(supplierFilePath);
    for (const sheetName of wb.SheetNames) {
      const cleanedName = cleanSupplierName(sheetName);
      if (!cleanedName || 
          cleanedName.includes('مهم') || 
          cleanedName.includes('طباعه') || 
          cleanedName.includes('كشوف') || 
          cleanedName.includes('رصيد') || 
          cleanedName.includes('جميع الكشوف') || 
          cleanedName.includes('ورق')) {
        continue;
      }

      const supplierId = supplierMap[cleanedName];
      if (!supplierId) continue;

      console.log(`Parsing sheet "${sheetName}" for supplier: ${cleanedName}`);
      const sheet = wb.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Classify sheet by content to ensure 100% correct parsing
      const isTypeB = data.some(row => row && row.some(cell => cell && cell.toString().includes('نوع النقدية من فيوتشر')));

      if (isTypeB) {
        // --- Type B Parser ---
        let headerIdx = -1;
        for (let i = 0; i < data.length; i++) {
          if (data[i] && data[i].some(cell => cell && cell.toString().includes('نوع النقدية من فيوتشر'))) {
            headerIdx = i;
            break;
          }
        }
        
        for (let idx = headerIdx + 1; idx < data.length; idx++) {
          const r = data[idx];
          if (!r) continue;

          const payNotes = r[0] ? r[0].toString().trim() : '';
          const payAmount = Number(r[1]);
          const payDate = r[2];

          const buyDesc = r[3] ? r[3].toString().trim() : '';
          const buyAmount = Number(r[4]);
          const buyDate = r[5];

          if (payAmount > 0) {
            const formattedDate = convertExcelDate(payDate);
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplierId,
              transaction_type: 'دفع',
              amount: payAmount,
              notes: payNotes || 'سداد دفعة حساب',
              created_at: formattedDate
            });
            await supabase.from('cash_flow').insert({
              type: 'مصروف',
              amount: payAmount,
              description: `سداد دفعة حساب للمورد: ${cleanedName} (${payNotes || ''})`,
              created_at: formattedDate
            });
          }

          if (buyAmount > 0) {
            const formattedDate = convertExcelDate(buyDate);
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplierId,
              transaction_type: 'شراء',
              amount: buyAmount,
              notes: buyDesc || 'شراء تكييف/بضاعة',
              created_at: formattedDate
            });
          }
        }
      } else {
        // --- Type A Parser ---
        let headerIdx = -1;
        for (let i = 0; i < data.length; i++) {
          if (data[i] && data[i].some(cell => cell && cell.toString().includes('التاريخ'))) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          console.log(`⚠️ Skipped sheet "${sheetName}" (could not find Date header).`);
          continue;
        }

        const header = data[headerIdx];
        const dateCol = header.findIndex(c => c && c.toString().includes('التاريخ'));
        const typeCol = header.findIndex(c => c && (c.toString().includes('نوع الاذن') || c.toString().includes('نوع الحساب') || c.toString().includes('البيان')));
        const descCol = header.findIndex(c => c && (c.toString().includes('اسم الجهاز') || c.toString().includes('البيان') || c.toString().includes('ملاحظات')));
        const debitCol = header.findIndex(c => c && c.toString().trim().includes('مدين'));
        const creditCol = header.findIndex(c => c && c.toString().trim().includes('دائن'));

        let lastDate = '';

        for (let idx = headerIdx + 1; idx < data.length; idx++) {
          const r = data[idx];
          if (!r) continue;

          const typeStr = r[typeCol] ? r[typeCol].toString().trim() : '';
          const dateVal = r[dateCol];
          const descVal = r[descCol] ? r[descCol].toString().trim() : '';
          const debitVal = Number(r[debitCol]);
          const creditVal = Number(r[creditCol]);

          // Ignore trailing empty rows / formula dragged zeroes
          if (!typeStr && (isNaN(debitVal) || debitVal === 0) && (isNaN(creditVal) || creditVal === 0)) continue;

          if (dateVal) {
            lastDate = dateVal;
          }
          const formattedDate = convertExcelDate(dateVal || lastDate);

          // Debit (مدين) = Payments we made to them
          if (debitVal > 0) {
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplierId,
              transaction_type: 'دفع',
              amount: debitVal,
              notes: descVal || typeStr || 'سداد دفعة حساب',
              created_at: formattedDate
            });
            await supabase.from('cash_flow').insert({
              type: 'مصروف',
              amount: debitVal,
              description: `سداد دفعة حساب للمورد: ${cleanedName} (${descVal || typeStr || ''})`,
              created_at: formattedDate
            });
          }

          // Credit (دائن) = Purchases we bought from them
          if (creditVal > 0) {
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplierId,
              transaction_type: 'شراء',
              amount: creditVal,
              notes: descVal || typeStr || 'شراء تكييف/بضاعة',
              created_at: formattedDate
            });
          }
        }
      }
    }
  }

  // ==========================================
  // 6. IMPORT SALARY ADVANCES
  // ==========================================
  console.log('\n--- Importing Salary Advances ---');
  const advanceFile = 'تأخيرات ذيـــــاده.xlsx';
  const advanceFilePath = path.join(dirPath, advanceFile);

  if (fs.existsSync(advanceFilePath)) {
    const wb = xlsx.readFile(advanceFilePath);
    const sheet = wb.Sheets['سلفيـات'];
    if (sheet) {
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      const islamTechId = techMap['اسلام'];
      if (islamTechId) {
        for (let idx = 2; idx < rows.length; idx++) {
          const r = rows[idx];
          if (!r) continue;

          const dateVal = r[1];
          const amount = Number(r[2]);
          
          if (amount > 0) {
            const formattedDate = convertExcelDate(dateVal);
            await supabase.from('salary_advances').insert({
              technician_id: islamTechId,
              amount: amount,
              date: formattedDate.slice(0,10),
              notes: 'سلفة تاريخية مستوردة من الإكسيل',
              created_at: formattedDate
            });
            await supabase.from('cash_flow').insert({
              type: 'مصروف',
              amount: amount,
              description: `سلفة نقدية للفني: اسلام (مستوردة)`,
              created_at: formattedDate
            });
          }
        }
      }
    }
  }

  console.log('\n✅ Corrected Data Migration completed successfully!');
}

runMigration().catch(err => {
  console.error('Fatal Migration error:', err);
});
