const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. อ่านไฟล์ .env เองโดยตรง (ไม่ต้องพึ่ง dotenv)
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    value = value.trim().replace(/^['"]|['"]$/g, '');
    env[match[1]] = value;
  }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ไม่พบ VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY ใน .env');
  process.exit(1);
}

// 2. อ่านไฟล์ stock.json ที่แปลงไว้
const stockPath = path.resolve(__dirname, '../src/data/stock.json');
const stockItems = JSON.parse(fs.readFileSync(stockPath, 'utf-8'));

console.log(`📦 โหลดข้อมูลทั้งหมด ${stockItems.length} รายการจาก stock.json`);

// 3. ฟังก์ชันส่งคำขอ PATCH ไปยัง Supabase REST API
function updateItem(itemCode, price, imageUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/inventory_items?item_code=eq.${encodeURIComponent(itemCode)}`);
    const postData = JSON.stringify({
      avg_unit_cost: price,
      image_url: imageUrl
    });

    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          resolve({ error: data, status: res.statusCode });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    req.write(postData);
    req.end();
  });
}

// 4. วนลูปอัปเดตข้อมูลทีละชุด (Batch ละ 10 รายการเพื่อความเสถียร)
async function run() {
  console.log('🚀 เริ่มต้นอัปเดตราคาและรูปภาพเข้าสู่ Supabase...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < stockItems.length; i += 10) {
    const batch = stockItems.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(item => updateItem(item.item_code, item.avg_unit_cost, item.image_url))
    );

    results.forEach(res => {
      if (res === true) successCount++;
      else failCount++;
    });

    const progress = Math.min(i + 10, stockItems.length);
    process.stdout.write(`⏳ กำลังอัปเดต: ${progress}/${stockItems.length} รายการ...\r`);
  }

  console.log(`\n\n🎉 อัปเดตเสร็จสมบูรณ์!`);
  console.log(`✅ สำเร็จ: ${successCount} รายการ`);
  if (failCount > 0) {
    console.log(`⚠️ ไม่สำเร็จ/ไม่พบรหัสในฐานข้อมูล: ${failCount} รายการ`);
  }
}

run();
