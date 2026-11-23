const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelFile = path.resolve(__dirname, '../รายการสต็อกวัสดุและอุปกรณ์_พร้อมรูปและราคา.xlsx');
const wb = xlsx.readFile(excelFile, { bookFiles: true });

const drawXml = wb.files['xl/drawings/drawing1.xml'].content.toString('utf8');
const relsXml = wb.files['xl/drawings/_rels/drawing1.xml.rels'].content.toString('utf8');

const relMap = {};
// <Relationship Type="..." Target="/xl/media/image1.png" Id="rId1"/>
const relRegex = /Id="([^"]+)"[^>]*Target="([^"]+)"/g;
let m;
while ((m = relRegex.exec(relsXml)) !== null) {
  let target = m[2].replace(/^\//, '');
  if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\.\//, '');
  relMap[m[1]] = target;
}
console.log('RelMap count:', Object.keys(relMap).length, 'Sample:', Object.entries(relMap).slice(0, 3));

const anchors = drawXml.split('</oneCellAnchor>');
console.log('Anchors count:', anchors.length);

let matched = 0;
anchors.forEach((a, i) => {
  const rowMatch = a.match(/<row>(\d+)<\/row>/);
  const embedMatch = a.match(/r:embed="([^"]+)"/);
  if (rowMatch && embedMatch) {
    matched++;
    if (i < 3) {
      console.log('Match', i, 'row:', rowMatch[1], 'embed:', embedMatch[1], 'target:', relMap[embedMatch[1]]);
    }
  }
});
console.log('Total matched:', matched);
