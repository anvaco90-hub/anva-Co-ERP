import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('--- TEST 1: purchase_orders with vendors(vendor_name) ---');
  const r1 = await supabase.from('purchase_orders').select('id, po_no, order_date, vendors(vendor_name)').order('order_date', { ascending: false }).limit(1);
  console.log('Result 1:', r1.status, r1.error ? r1.error : 'OK');

  console.log('\n--- TEST 2: purchase_orders select * ---');
  const r2 = await supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }).limit(1);
  console.log('Result 2:', r2.status, r2.error ? r2.error : 'OK');

  console.log('\n--- TEST 3: expenses with vendors(vendor_name) ---');
  const r3 = await supabase.from('expenses').select('id, vendors(vendor_name)').order('expense_date', { ascending: false }).limit(1);
  console.log('Result 3:', r3.status, r3.error ? r3.error : 'OK');

  console.log('\n--- TEST 4: stock_adjustments select id, adj_no, source_project_id ---');
  const r4 = await supabase.from('stock_adjustments').select('id, adj_no, source_project_id').limit(1);
  console.log('Result 4:', r4.status, r4.error ? r4.error : 'OK');
}

run();
