const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const dirPath = 'C:\\Users\\LENOVO LEGION5\\Desktop\\فولدر تظبيط الشغل من  2026جديد';

if (!fs.existsSync(dirPath)) {
  console.error('Directory does not exist');
  process.exit(1);
}

const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

files.forEach(file => {
  console.log('=========================================');
  console.log(`FILE: ${file}`);
  const filePath = path.join(dirPath, file);
  try {
    const workbook = xlsx.readFile(filePath);
    console.log('Sheet Names:', workbook.SheetNames);
    
    // Inspect the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log('Total Rows:', data.length);
    console.log('First 5 Rows:');
    data.slice(0, 8).forEach((row, idx) => {
      console.log(`  Row ${idx}:`, row);
    });
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
});
