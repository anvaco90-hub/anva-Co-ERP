const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 1. ระบุตำแหน่งไฟล์ Excel
const excelPath = path.resolve(__dirname, '../รายการสต็อกวัสดุและอุปกรณ์_พร้อมรูปและราคา.xlsx');

if (!fs.existsSync(excelPath)) {
  console.error('❌ ไม่พบไฟล์ Excel ที่:', excelPath);
  process.exit(1);
}

// 2. อ่านไฟล์ Excel
const workbook = xlsx.readFile(excelPath);

// 3. ระบุชื่อชีตที่ต้องการดึงข้อมูล
const targetSheets = [
  '1. สต็อกงานโยธา',
  '2. สต็อกงานโซล่าเซลล์',
  '3. สต็อกของ Office'
];

const items = [];

// ฟังก์ชันจำแนกรูปภาพพื้นฐานตามหมวดหมู่/ชื่อสินค้า
function getImageUrl(name, category) {
  const text = (name + ' ' + (category || '')).toLowerCase();
  if (text.includes('สกรู') || text.includes('น็อต') || text.includes('พุก')) {
    return 'https://images.unsplash.com/photo-1586864387789-628af9feed72?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สี') || text.includes('ทินเนอร์') || text.includes('กาว') || text.includes('ซิลิโคน')) {
    return 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('ท่อ') || text.includes('ข้องอ') || text.includes('วาล์ว') || text.includes('pvc')) {
    return 'https://images.unsplash.com/photo-1542013936693-884638332954?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สายไฟ') || text.includes('เบรกเกอร์') || text.includes('ไฟฟ้า') || text.includes('ตู้คอนโทรล')) {
    return 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('โซล่า') || text.includes('แผง') || text.includes('mid clamp') || text.includes('rail')) {
    return 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สว่าน') || text.includes('เครื่องมือ') || text.includes('คีม') || text.includes('ประแจ')) {
    return 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('กระดาษ') || text.includes('แฟ้ม') || text.includes('ปากกา') || text.includes('หมึก') || text.includes('เทป')) {
    return 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=60';
  }
  return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=60';
}

// 4. วนลูปอ่านข้อมูลในแต่ละชีต
targetSheets.forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.warn(`⚠️ ไม่พบชีต: ${sheetName}`);
    return;
  }

  // แปลงชีตเป็น JSON
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // หาบรรทัดที่เป็น Header (มีคำว่า "รหัสสินค้า")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i].some(cell => String(cell).includes('รหัสสินค้า'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) return;

  const header = rows[headerRowIndex].map(h => String(h).trim());
  const idxCode = header.findIndex(h => h.includes('รหัสสินค้า'));
  const idxName = header.findIndex(h => h.includes('รายการสินค้า'));
  const idxCategory = header.findIndex(h => h.includes('หมวดหมู่'));
  const idxPrice = header.findIndex(h => h.includes('ราคาต่อหน่วย'));

  // ดึงข้อมูลแถวถัดจาก Header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[idxCode]) continue;

    const itemCode = String(row[idxCode]).trim();
    if (!itemCode.startsWith('AN')) continue; // รหัสสินค้าของบริษัท เช่น ANCT, ANSL, ANVA

    const itemName = row[idxName] ? String(row[idxName]).trim() : '';
    const category = row[idxCategory] ? String(row[idxCategory]).trim() : '';
    const rawPrice = row[idxPrice];
    const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || '0').replace(/[^0-9.]/g, '')) || 0;

    items.push({
      item_code: itemCode,
      name: itemName,
      avg_unit_cost: price,
      image_url: getImageUrl(itemName, category)
    });
  }
});

// 5. บันทึกผลลัพธ์เป็น JSON
const outDir = path.resolve(__dirname, '../src/data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'stock.json');
fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8');

console.log(`✅ สำเร็จ! แปลงข้อมูลทั้งหมด ${items.length} รายการ`);
console.log(`📁 บันทึกไฟล์ไว้ที่: ${outPath}`);