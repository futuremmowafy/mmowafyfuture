const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const dirPath = 'C:\\Users\\LENOVO LEGION5\\Desktop\\فولدر تظبيط الشغل من  2026جديد';

function inspectFile(filename, rowsCount = 20) {
  console.log('\n==================================================================');
  console.log(`DETAILED INSPECTION: ${filename}`);
  console.log('==================================================================');
  const filePath = path.join(dirPath, filename);
  if (!fs.existsSync(filePath)) {
    console.error('File not found');
    return;
  }
  const workbook = xlsx.readFile(filePath);
  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: "${sheetName}" ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Total rows in sheet: ${data.length}`);
    data.slice(0, rowsCount).forEach((row, idx) => {
      // Clean row to print nicely
      const cleanRow = row.map(cell => (cell === null || cell === undefined) ? '' : cell);
      // Only print if there is some content in the row
      if (cleanRow.some(c => c !== '')) {
        console.log(`Row ${String(idx).padStart(2, ' ')}:`, JSON.stringify(cleanRow));
      }
    });
  });
}

// Inspect specific files of interest
inspectFile('عملاء عـــام 2026.xlsx', 15);
inspectFile('كشوف حساب عبير جديده2026.xlsx', 25);
inspectFile('سلفيات الموظفــــــين.xlsx', 20);
inspectFile('مخزن مختلف لعام 2026.xlsx', 35);
inspectFile('تأخيرات ذيـــــاده.xlsx', 20);
