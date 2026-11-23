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

async function run() {
  const catRes = await new Promise(resolve => {
    https.get(`${SUPABASE_URL}/rest/v1/item_categories?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    });
  });

  const catMap = {};
  catRes.forEach(c => catMap[c.code_prefix] = c.id);

  const items = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/full_items_with_images.json'), 'utf-8'));

  // ดึงรายการที่มีอยู่แล้วใน DB มาก่อน
  const existingItemsRes = await new Promise(resolve => {
    https.get(`${SUPABASE_URL}/rest/v1/inventory_items?select=item_code,item_name`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    });
  });

  const existingCodes = new Set((existingItemsRes || []).map(x => x.item_code));
  const existingNames = new Set((existingItemsRes || []).map(x => x.item_name));

  console.log(`📊 ในระบบมีอยู่แล้ว: ${existingCodes.size} รายการ`);

  let added = 0;
  for (const it of items) {
    if (existingCodes.has(it.item_code)) continue;

    let finalName = it.item_name;
    // ถ้าชื่อซ้ำ ให้ใส่รหัสพ่วงท้ายเพื่อไม่ให้ชน unique constraint ของชื่อ
    if (existingNames.has(finalName)) {
      finalName = `${finalName} (${it.item_code})`;
    }

    const payload = {
      item_code: it.item_code,
      item_name: finalName,
      unit: it.unit,
      category_id: catMap[it.code_prefix] || null,
      qty_on_hand: it.qty_on_hand,
      avg_unit_cost: it.avg_unit_cost,
      image_url: it.image_url,
      reorder_point: 5
    };

    const res = await new Promise(resolve => {
      const req = https.request(`${SUPABASE_URL}/rest/v1/inventory_items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal'
        }
      }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(r.statusCode));
      });
      req.write(JSON.stringify(payload));
      req.end();
    });

    if (res >= 200 && res < 300) {
      existingCodes.add(it.item_code);
      existingNames.add(finalName);
      added++;
    }
  }

  console.log(`✅ เพิ่มรายการที่เหลือสำเร็จ: ${added} รายการ`);

  // ตรวจสอบจำนวนรวมทั้งหมด
  https.get(`${SUPABASE_URL}/rest/v1/inventory_items?select=id`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Range-Unit': 'items',
      'Prefer': 'count=exact'
    }
  }, r => {
    console.log(`🏆 รวมรายการสินค้าในระบบทั้งหมดตอนนี้: ${r.headers['content-range'] || existingCodes.size} รายการ`);
  });
}

run();
