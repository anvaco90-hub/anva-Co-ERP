const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelFile = path.resolve(__dirname, '../รายการสต็อกวัสดุและอุปกรณ์_พร้อมรูปและราคา.xlsx');
const wb = xlsx.readFile(excelFile, { bookFiles: true });
const relsXml = wb.files['xl/drawings/_rels/drawing1.xml.rels'].content.toString('utf8');
console.log(relsXml.slice(0, 300));
