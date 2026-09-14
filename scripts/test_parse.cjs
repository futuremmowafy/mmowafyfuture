const xlsx = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\LENOVO LEGION5\\Desktop\\فولدر تظبيط الشغل من  2026جديد\\كشوف حساب عبير جديده2026.xlsx';
const wb = xlsx.readFile(filePath);

function parseSheet(sheetName) {
  console.log(`\n=========================================\nPARSING: ${sheetName}\n=========================================`);
  const sheet = wb.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Classify by content!
  const isTypeB = data.some(row => row && row.some(cell => cell && cell.toString().includes('نوع النقدية من فيوتشر')));

  if (isTypeB) {
    console.log('Classified as Type B');
    
    // Find header row containing "نوع النقدية من فيوتشر"
    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].some(cell => cell && cell.toString().includes('نوع النقدية من فيوتشر'))) {
        headerIdx = i;
        break;
      }
    }
    
    console.log('Header Row:', data[headerIdx]);
    
    let count = 0;
    for (let idx = headerIdx + 1; idx < data.length; idx++) {
      const r = data[idx];
      if (!r) continue;

      const payNotes = r[0] ? r[0].toString().trim() : '';
      const payAmount = Number(r[1]);
      const payDate = r[2];

      const buyDesc = r[3] ? r[3].toString().trim() : '';
      const buyAmount = Number(r[4]);
      const buyDate = r[5];

      // Skip rows with no amount
      if (!payAmount && !buyAmount) continue;

      if (payAmount > 0) {
        console.log(`  Row ${idx} [PAYMENT]: ${payAmount} EGP | Date: ${payDate} | Notes: ${payNotes}`);
        count++;
      }
      if (buyAmount > 0) {
        console.log(`  Row ${idx} [PURCHASE]: ${buyAmount} EGP | Date: ${buyDate} | Item: ${buyDesc}`);
        count++;
      }
      if (count > 15) {
        console.log('  ... (truncated)');
        break;
      }
    }
  } else {
    console.log('Classified as Type A');
    // Find header row containing 'التاريخ'
    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].some(cell => cell && cell.toString().includes('التاريخ'))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      console.log('❌ Could not find header row!');
      return;
    }

    const header = data[headerIdx];
    console.log('Header Row:', header.slice(0, 15));

    // Map column indices
    const dateCol = header.findIndex(c => c && c.toString().includes('التاريخ'));
    const typeCol = header.findIndex(c => c && (c.toString().includes('نوع الاذن') || c.toString().includes('نوع الحساب') || c.toString().includes('البيان')));
    const descCol = header.findIndex(c => c && (c.toString().includes('اسم الجهاز') || c.toString().includes('البيان') || c.toString().includes('ملاحظات')));
    const debitCol = header.findIndex(c => c && c.toString().trim().includes('مدين'));
    const creditCol = header.findIndex(c => c && c.toString().trim().includes('دائن'));

    console.log(`Column Mapping: date=${dateCol}, type=${typeCol}, desc=${descCol}, debit=${debitCol}, credit=${creditCol}`);

    let count = 0;
    let lastDate = '';

    for (let idx = headerIdx + 1; idx < data.length; idx++) {
      const r = data[idx];
      if (!r) continue;

      // Extract raw values
      const typeStr = r[typeCol] ? r[typeCol].toString().trim() : '';
      const dateVal = r[dateCol];
      const descVal = r[descCol] ? r[descCol].toString().trim() : '';
      const debitVal = Number(r[debitCol]);
      const creditVal = Number(r[creditCol]);

      // Ignore empty formula dragged rows
      if (!typeStr && (isNaN(debitVal) || debitVal === 0) && (isNaN(creditVal) || creditVal === 0)) continue;

      if (dateVal) {
        lastDate = dateVal;
      }

      if (debitVal > 0) {
        console.log(`  Row ${idx} [PAYMENT (Debit)]: ${debitVal} EGP | Date: ${dateVal || lastDate} | Notes: ${descVal || typeStr}`);
        count++;
      }
      if (creditVal > 0) {
        console.log(`  Row ${idx} [PURCHASE (Credit)]: ${creditVal} EGP | Date: ${dateVal || lastDate} | Notes: ${descVal || typeStr}`);
        count++;
      }

      if (count > 15) {
        console.log('  ... (truncated)');
        break;
      }
    }
  }
}

parseSheet('توفيق سالم 5');
parseSheet('محمد سعيد 2026');
parseSheet('محمد سعيد 2');
