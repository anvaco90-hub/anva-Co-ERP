const fs = require('fs');
const path = require('path');

// แมปปิ้งอีโมจิที่ใช้บ่อย -> แทนที่ด้วยข้อความว่าง หรือคำบรรยายที่ไม่มีอีโมจิ
const emojiReplacements = [
  // สัญลักษณ์ลูกศรและปุ่ม
  { regex: /🔤\s*/g, replace: '' },
  { regex: /🔢\s*/g, replace: '' },
  { regex: /📅\s*/g, replace: '' },
  { regex: /📦\s*/g, replace: '' },
  { regex: /🏢\s*/g, replace: '' },
  { regex: /📄\s*/g, replace: '' },
  { regex: /📝\s*/g, replace: '' },
  { regex: /📊\s*/g, replace: '' },
  { regex: /🛒\s*/g, replace: '' },
  { regex: /📥\s*/g, replace: '' },
  { regex: /📤\s*/g, replace: '' },
  { regex: /📜\s*/g, replace: '' },
  { regex: /🔄\s*/g, replace: '' },
  { regex: /📑\s*/g, replace: '' },
  { regex: /🏗️\s*/g, replace: '' },
  { regex: /💸\s*/g, replace: '' },
  { regex: /📋\s*/g, replace: '' },
  { regex: /📈\s*/g, replace: '' },
  { regex: /📒\s*/g, replace: '' },
  { regex: /🧾\s*/g, replace: '' },
  { regex: /💰\s*/g, replace: '' },
  { regex: /👥\s*/g, replace: '' },
  { regex: /🧑‍💼\s*/g, replace: '' },
  { regex: /🎯\s*/g, replace: '' },
  { regex: /⚙️\s*/g, replace: '' },
  { regex: /⚡\s*/g, replace: '' },
  { regex: /🏷️\s*/g, replace: '' },
  { regex: /🗂️\s*/g, replace: '' },
  { regex: /✨\s*/g, replace: '' },
  { regex: /🚨\s*/g, replace: '' },
  { regex: /⚠️\s*/g, replace: '' },
  { regex: /✅\s*/g, replace: '' },
  { regex: /❌\s*/g, replace: '' },
  { regex: /🔍\s*/g, replace: '' },
  { regex: /💡\s*/g, replace: '' },
  { regex: /📌\s*/g, replace: '' },
  { regex: /🔗\s*/g, replace: '' },
  { regex: /🔒\s*/g, replace: '' },
  { regex: /🟢\s*/g, replace: '' },
  { regex: /🟡\s*/g, replace: '' },
  { regex: /🔴\s*/g, replace: '' },
  { regex: /🔵\s*/g, replace: '' },
  { regex: /⚪\s*/g, replace: '' },
  { regex: /⭐\s*/g, replace: '' },
  { regex: /🎉\s*/g, replace: '' },
  { regex: /🚀\s*/g, replace: '' }
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const allSrcFiles = getAllFiles(path.resolve(__dirname, '../src'));
let totalCleanedFiles = 0;
let totalReplacedOccurrences = 0;

allSrcFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. นำ emoji list ออก
  emojiReplacements.forEach(({ regex, replace }) => {
    content = content.replace(regex, replace);
  });

  // 2. นำ regex สากลสำหรับ emoji ทั่วไปออก
  const universalEmojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF]/g;
  content = content.replace(universalEmojiRegex, '');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalCleanedFiles++;
  }
});

console.log(`✅ ทำความสะอาดเรียบร้อย: ${totalCleanedFiles} ไฟล์ถูกตัดอีโมจิออกทั้งหมด`);
