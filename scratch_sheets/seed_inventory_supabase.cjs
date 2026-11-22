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

function request(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('🔄 1. ตรวจสอบ/สร้างหมวดหมู่สินค้า 3 ฝ่าย...');
  const catRes = await request('item_categories?select=*');
  let categories = catRes.data || [];

  const neededCats = [
    { name: 'สต็อกของโซล่าเซลล์', code_prefix: 'ANSL', sort_order: 1 },
    { name: 'สต็อกของงานโยธา', code_prefix: 'ANCT', sort_order: 2 },
    { name: 'สต็อกของ Office', code_prefix: 'ANVA', sort_order: 3 }
  ];

  for (const nc of neededCats) {
    let found = categories.find(c => c.code_prefix === nc.code_prefix);
    if (!found) {
      console.log(`➕ สร้างหมวดหมู่: ${nc.name}`);
      const createRes = await request('item_categories', 'POST', nc);
      if (createRes.data && createRes.data[0]) {
        categories.push(createRes.data[0]);
      }
    }
  }

  const catMap = {};
  categories.forEach(c => {
    catMap[c.code_prefix] = c.id;
  });

  console.log('✅ หมวดหมู่พร้อมใช้งาน:', catMap);

  console.log('📦 2. นำเข้าพัสดุ 534 รายการพร้อมราคาและรูปภาพ...');
  const items = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/full_items_with_images.json'), 'utf-8'));

  const payload = items.map(it => ({
    item_code: it.item_code,
    item_name: it.item_name,
    unit: it.unit,
    category_id: catMap[it.code_prefix] || null,
    qty_on_hand: it.qty_on_hand,
    avg_unit_cost: it.avg_unit_cost,
    image_url: it.image_url,
    reorder_point: 5
  }));

  // ส่งทีละ 50 รายการ (upsert)
  let inserted = 0;
  for (let i = 0; i < payload.length; i += 50) {
    const chunk = payload.slice(i, i + 50);
    const url = new URL(`${SUPABASE_URL}/rest/v1/inventory_items`);
    const res = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=representation'
        }
      }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ status: r.statusCode, data: d }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(chunk));
      req.end();
    });

    if (res.status >= 200 && res.status < 300) {
      inserted += chunk.length;
      process.stdout.write(`⏳ นำเข้าแล้ว: ${inserted}/${payload.length} รายการ...\r`);
    } else {
      console.error(`\n❌ Error at batch ${i}:`, res.status, res.data);
    }
  }

  console.log(`\n\n🎉 สำเร็จสมบูรณ์! นำเข้าข้อมูลพัสดุพร้อมราคาและรูปภาพแล้วทั้งหมด ${inserted} รายการ`);
}

main().catch(console.error);
