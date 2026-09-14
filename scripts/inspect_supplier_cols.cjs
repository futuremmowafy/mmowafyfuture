const xlsx = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\LENOVO LEGION5\\Desktop\\فولدر تظبيط الشغل من  2026جديد\\كشوف حساب عبير جديده2026.xlsx';
const wb = xlsx.readFile(filePath);
const sheet = wb.Sheets['توفيق سالم 5'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log('Inspecting توفيق سالم 5:');
// Print rows 140 to 165
for (let idx = 140; idx <= 165; idx++) {
  if (data[idx]) {
    console.log(`Row ${idx}:`, data[idx]);
  }
}
