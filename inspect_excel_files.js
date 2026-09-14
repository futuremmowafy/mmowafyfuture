import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const excelDir = 'C:\\Users\\LENOVO LEGION5\\Desktop\\عملاء';
const logFile = 'c:\\Users\\LENOVO LEGION5\\Desktop\\futureairpro\\excel_structure_utf8.txt';

function inspect() {
  let output = '';
  if (!fs.existsSync(excelDir)) {
    output += `Directory not found: ${excelDir}\n`;
    fs.writeFileSync(logFile, output, 'utf8');
    return;
  }

  const files = fs.readdirSync(excelDir).filter(f => f.endsWith('.xlsx'));
  output += `Found ${files.length} Excel files.\n`;

  files.forEach(file => {
    const filePath = path.join(excelDir, file);
    output += `\n========================================\n`;
    output += `FILE: ${file}\n`;
    output += `========================================\n`;
    
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetNames = workbook.SheetNames;
      output += `Sheets in workbook: ${sheetNames.join(', ')}\n`;

      sheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        output += `Sheet: "${sheetName}" | Range: ${sheet['!ref']}\n`;
        
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 15);
        output += `First 15 rows:\n`;
        rows.forEach((row, i) => {
          output += `Row ${i}: ${JSON.stringify(row)}\n`;
        });
      });
    } catch (e) {
      output += `Failed to parse ${file}: ${e.message}\n`;
    }
  });

  fs.writeFileSync(logFile, output, 'utf8');
  console.log('Inspection complete. Saved to excel_structure_utf8.txt');
}

inspect();
