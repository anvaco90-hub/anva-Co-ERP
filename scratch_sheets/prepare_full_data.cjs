const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.resolve(__dirname, '../รายการสต็อกวัสดุและอุปกรณ์_พร้อมรูปและราคา.xlsx');
const workbook = xlsx.readFile(excelPath);

const targetSheets = [
  { name: '1. สต็อกงานโยธา', prefix: 'ANCT', catName: 'สต็อกของงานโยธา' },
  { name: '2. สต็อกงานโซล่าเซลล์', prefix: 'ANSL', catName: 'สต็อกของโซล่าเซลล์' },
  { name: '3. สต็อกของ Office', prefix: 'ANVA', catName: 'สต็อกของ Office' }
];

function getImageUrl(name, category) {
  const text = (name + ' ' + (category || '')).toLowerCase();
  if (text.includes('สกรู') || text.includes('น็อต') || text.includes('พุก') || text.includes('แหวน') || text.includes('เกลียว')) {
    return 'https://images.unsplash.com/photo-1586864387789-628af9feed72?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สี') || text.includes('ทินเนอร์') || text.includes('กาว') || text.includes('ซิลิโคน') || text.includes('ซีลแลนท์') || text.includes('ปูน')) {
    return 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('ท่อ') || text.includes('ข้องอ') || text.includes('วาล์ว') || text.includes('pvc') || text.includes('hdpe') || text.includes('ก๊อก') || text.includes('สายน้ำดี')) {
    return 'https://images.unsplash.com/photo-1542013936693-884638332954?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สายไฟ') || text.includes('เบรกเกอร์') || text.includes('ไฟฟ้า') || text.includes('ตู้คอนโทรล') || text.includes('thw') || text.includes('nyy') || text.includes('vct') || text.includes('spd') || text.includes('rcbo')) {
    return 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('โซล่า') || text.includes('แผง') || text.includes('mid clamp') || text.includes('end clamp') || text.includes('rail') || text.includes('l-feet') || text.includes('mc4')) {
    return 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('สว่าน') || text.includes('เครื่องมือ') || text.includes('คีม') || text.includes('ประแจ') || text.includes('ตลับเมตร') || text.includes('ระดับน้ำ') || text.includes('เลื่อย') || text.includes('ค้อน') || text.includes('แท่นชาร์จ') || text.includes('แบตเตอรี่')) {
    return 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&auto=format&fit=crop&q=60';
  }
  if (text.includes('กระดาษ') || text.includes('แฟ้ม') || text.includes('ปากกา') || text.includes('หมึก') || text.includes('เทป') || text.includes('คลิป') || text.includes('ซอง')) {
    return 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=60';
  }
  return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=60';
}

const allItems = [];

targetSheets.forEach(target => {
  const sheet = workbook.Sheets[target.name];
  if (!sheet) return;

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i].some(c => String(c).includes('รหัสสินค้า'))) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return;

  const header = rows[headerIndex].map(h => String(h).trim());
  const idxCode = header.findIndex(h => h.includes('รหัสสินค้า'));
  const idxName = header.findIndex(h => h.includes('รายการสินค้า'));
  const idxSpec = header.findIndex(h => h.includes('หมวดหมู่'));
  const idxQty = header.findIndex(h => h.includes('จำนวนคงเหลือ'));
  const idxUnit = header.findIndex(h => h.includes('หน่วย'));
  const idxPrice = header.findIndex(h => h.includes('ราคาต่อหน่วย'));

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[idxCode]) continue;

    const code = String(r[idxCode]).trim();
    if (!code.startsWith('AN')) continue;

    const name = r[idxName] ? String(r[idxName]).trim() : '';
    const spec = r[idxSpec] ? String(r[idxSpec]).trim() : '';
    const unit = r[idxUnit] ? String(r[idxUnit]).trim() : 'ชิ้น';
    const rawQty = r[idxQty];
    const qty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty || '0').replace(/[^0-9.]/g, '')) || 0;
    const rawPrice = r[idxPrice];
    const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || '0').replace(/[^0-9.]/g, '')) || 0;

    allItems.push({
      item_code: code,
      item_name: name,
      unit: unit,
      qty_on_hand: qty,
      avg_unit_cost: price,
      image_url: getImageUrl(name, spec),
      code_prefix: target.prefix,
      reorder_point: 5
    });
  }
});

fs.writeFileSync(path.resolve(__dirname, '../src/data/full_items_with_images.json'), JSON.stringify(allItems, null, 2), 'utf-8');
console.log(`✅ บันทึก full_items_with_images.json เรียบร้อย (${allItems.length} รายการ)`);
