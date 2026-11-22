const fs = require('fs');
const path = require('path');
const https = require('https');

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

const imageMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/extracted_images_map.json'), 'utf8'));

async function updateItem(itemCode, imgUrl) {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/inventory_items?item_code=eq.${encodeURIComponent(itemCode)}`);
    const postData = JSON.stringify({ image_url: imgUrl });

    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      }
    }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('🚀 กำลังอัปเดต URL รูปภาพ 534 รายการเข้าสู่ Supabase...');
  const entries = Object.entries(imageMap);
  let updated = 0;

  for (let i = 0; i < entries.length; i += 20) {
    const batch = entries.slice(i, i + 20);
    const results = await Promise.all(batch.map(([code, imgUrl]) => updateItem(code, imgUrl)));
    updated += results.filter(Boolean).length;
    process.stdout.write(`⏳ อัปเดตรูปแล้ว: ${Math.min(i + 20, entries.length)}/${entries.length} รายการ...\r`);
  }

  console.log(`\n🎉 สำเร็จ! อัปเดตรูปภาพเข้าฐานข้อมูลแล้ว ${updated} รายการ`);
}

run();
