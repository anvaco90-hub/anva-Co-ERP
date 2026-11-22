const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelFile = path.resolve(__dirname, '../รายการสต็อกวัสดุและอุปกรณ์_พร้อมรูปและราคา.xlsx');
const wb = xlsx.readFile(excelFile, { bookFiles: true });

const outDir = path.resolve(__dirname, '../public/stock_images');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const drawingSheetMap = [
  { drawingNum: 1, sheetName: '1. สต็อกงานโยธา' },
  { drawingNum: 2, sheetName: '2. สต็อกงานโซล่าเซลล์' },
  { drawingNum: 3, sheetName: '3. สต็อกของ Office' }
];

const itemImageMap = {};

drawingSheetMap.forEach(({ drawingNum, sheetName }) => {
  const sheet = wb.Sheets[sheetName];
  const drawXmlKey = `xl/drawings/drawing${drawingNum}.xml`;
  const relsXmlKey = `xl/drawings/_rels/drawing${drawingNum}.xml.rels`;

  const relsXml = wb.files[relsXmlKey]?.content?.toString('utf8');
  const drawXml = wb.files[drawXmlKey]?.content?.toString('utf8');

  if (!relsXml || !drawXml) return;

  const relMap = {};
  // <Relationship Type="..." Target="/xl/media/image1.png" Id="rId1"/>
  const relRegex = /Target="([^"]+)"\s+Id="([^"]+)"/g;
  let rm;
  while ((rm = relRegex.exec(relsXml)) !== null) {
    let target = rm[1].replace(/^\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\.\//, '');
    relMap[rm[2]] = target;
  }

  const anchors = drawXml.split('</oneCellAnchor>');
  anchors.forEach(block => {
    const rowMatch = block.match(/<row>(\d+)<\/row>/);
    const embedMatch = block.match(/r:embed="([^"]+)"/);

    if (rowMatch && embedMatch) {
      const rowIdx = parseInt(rowMatch[1], 10);
      const cellAddress = 'A' + (rowIdx + 1);
      const itemCode = sheet[cellAddress] ? String(sheet[cellAddress].v).trim() : null;
      const mediaKey = relMap[embedMatch[1]];

      if (itemCode && itemCode.startsWith('AN') && mediaKey && wb.files[mediaKey]) {
        const ext = path.extname(mediaKey) || '.png';
        const filename = `${itemCode}${ext}`;
        fs.writeFileSync(path.join(outDir, filename), wb.files[mediaKey].content);
        itemImageMap[itemCode] = `/stock_images/${filename}`;
      }
    }
  });
});

console.log(`✅ สกัดรูปภาพลง public/stock_images สำเร็จ: ${Object.keys(itemImageMap).length} ไฟล์`);
fs.writeFileSync(path.resolve(__dirname, '../src/data/extracted_images_map.json'), JSON.stringify(itemImageMap, null, 2), 'utf8');
