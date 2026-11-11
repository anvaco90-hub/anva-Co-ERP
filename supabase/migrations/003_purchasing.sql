-- ขั้นที่ 3: โมดูลจัดซื้อ (PR -> PO -> รับของเข้าสโตร์ + ลงบัญชีอัตโนมัติ)
-- รันใน SQL Editor (โปรเจกต์ dev ก่อน แล้วค่อยโปรเจกต์จริง)
-- หลักการ: ตารางเอกสาร/สต็อก/บัญชี "ไม่มี policy เขียน" — เขียนได้ผ่านฟังก์ชัน RPC เท่านั้น

------------------------------------------------------------
-- 1) ตารางพื้นฐาน
------------------------------------------------------------
create table doc_sequences (
  prefix text not null,
  doc_year int not null,
  last_no int not null default 0,
  primary key (prefix, doc_year)
);
alter table doc_sequences enable row level security;  -- ไม่มี policy = client เข้าไม่ได้

create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text unique not null,
  account_name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense'))
);
-- ผังบัญชีตั้งต้น (ขั้นที่ 5 จะทำหน้าจัดการเพิ่มเติม)
insert into chart_of_accounts (account_code, account_name, account_type) values
  ('1110','เงินสด/เงินฝากธนาคาร','asset'),
  ('1140','วัสดุก่อสร้างคงเหลือ','asset'),
  ('2110','เจ้าหนี้การค้า','liability'),
  ('5100','ต้นทุนวัสดุ','expense'),
  ('5200','ต้นทุนแรงงาน','expense');

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text unique not null,
  entry_date date not null,
  description text,
  project_id uuid references projects(id),
  source_module text default 'manual' check (source_module in ('manual','purchasing','store','hr')),
  source_ref text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  account_id uuid references chart_of_accounts(id),
  debit numeric(15,2) default 0,
  credit numeric(15,2) default 0
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text unique not null,
  vendor_name text not null,
  contact_person text,
  phone text,
  tax_id text,
  address text
);

create sequence inventory_item_code_seq;
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text unique not null,
  item_name text not null,
  unit text,
  reorder_point numeric(12,2) default 0
);
create table inventory_stock (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  project_id uuid not null references projects(id),
  qty_on_hand numeric(12,2) not null default 0,
  avg_unit_cost numeric(15,2) not null default 0,
  unique (item_id, project_id)
);

create table purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  pr_no text unique not null,
  project_id uuid not null references projects(id),
  requested_by uuid references profiles(id),
  request_date date not null,
  status text not null default 'pending' check (status in ('pending','ordered','cancelled')),
  notes text
);
create table purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references purchase_requisitions(id) on delete cascade,
  item_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text,
  estimated_price numeric(15,2) default 0
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text unique not null,
  pr_id uuid references purchase_requisitions(id),
  project_id uuid not null references projects(id),
  vendor_id uuid not null references vendors(id),
  order_date date not null,
  total_amount numeric(15,2) default 0,
  status text not null default 'open' check (status in ('open','partial','received','cancelled'))
);
create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid references inventory_items(id),  -- ผูกกับสินค้าคงคลังตอนรับของครั้งแรก
  item_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text,
  unit_price numeric(15,2) not null check (unit_price >= 0),
  qty_received numeric(12,2) not null default 0
);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_no text unique not null,
  po_id uuid not null references purchase_orders(id),
  received_date date not null,
  received_by uuid references profiles(id),
  journal_entry_id uuid references journal_entries(id),
  attachments jsonb default '[]'  -- ขั้นที่ 7: [{r2Key, name, contentType}]
);
create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references goods_receipts(id) on delete cascade,
  po_item_id uuid not null references purchase_order_items(id),
  qty_received numeric(12,2) not null,
  unit_cost numeric(15,2) not null
);

create index on purchase_requisition_items (pr_id);
create index on purchase_order_items (po_id);
create index on goods_receipts (po_id);

------------------------------------------------------------
-- 2) RLS: อ่านตามฝ่าย / ไม่มี policy เขียน (ยกเว้นผู้ขายกับผังบัญชี)
------------------------------------------------------------
alter table chart_of_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table vendors enable row level security;
alter table inventory_items enable row level security;
alter table inventory_stock enable row level security;
alter table purchase_requisitions enable row level security;
alter table purchase_requisition_items enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table goods_receipts enable row level security;
alter table goods_receipt_items enable row level security;

create policy "read_coa" on chart_of_accounts for select
  using (get_my_role() in ('admin','accounting','management'));
create policy "write_coa" on chart_of_accounts for all
  using (get_my_role() in ('admin','accounting')) with check (get_my_role() in ('admin','accounting'));
create policy "read_journal" on journal_entries for select
  using (get_my_role() in ('admin','accounting','management'));
create policy "read_journal_lines" on journal_entry_lines for select
  using (get_my_role() in ('admin','accounting','management'));

create policy "read_vendors" on vendors for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "write_vendors" on vendors for all
  using (get_my_role() in ('admin','purchasing')) with check (get_my_role() in ('admin','purchasing'));

create policy "read_inventory_items" on inventory_items for select using (get_my_role() is not null);
create policy "read_inventory_stock" on inventory_stock for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));

create policy "read_pr" on purchase_requisitions for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "read_pr_items" on purchase_requisition_items for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "read_po" on purchase_orders for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "read_po_items" on purchase_order_items for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "read_grn" on goods_receipts for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));
create policy "read_grn_items" on goods_receipt_items for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));

------------------------------------------------------------
-- 3) ฟังก์ชัน
------------------------------------------------------------
-- รันเลขเอกสาร (PR-2026-0001) แบบ atomic กันเลขซ้ำ — เรียกจากฟังก์ชันอื่นเท่านั้น
create function generate_doc_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from current_date)::int; v_no int;
begin
  insert into doc_sequences (prefix, doc_year, last_no) values (p_prefix, v_year, 1)
  on conflict (prefix, doc_year) do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_no;
  return p_prefix || '-' || v_year || '-' || lpad(v_no::text, 4, '0');
end $$;
revoke all on function generate_doc_no(text) from public, anon, authenticated;

-- สร้างใบขอซื้อ
create function create_purchase_requisition(p_project_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then
    raise exception 'ไม่มีสิทธิ์สร้างใบขอซื้อ';
  end if;
  if p_project_id is null then raise exception 'กรุณาเลือกโครงการ'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ';
  end if;

  insert into purchase_requisitions (pr_no, project_id, requested_by, request_date, notes)
  values (generate_doc_no('PR'), p_project_id, auth.uid(), current_date, p_notes)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'item_name'), '') = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    insert into purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price)
    values (v_id, trim(v_item->>'item_name'), (v_item->>'quantity')::numeric,
            nullif(trim(v_item->>'unit'), ''), coalesce((v_item->>'estimated_price')::numeric, 0));
  end loop;
  return v_id;
end $$;

-- สร้างใบสั่งซื้อ (จากใบขอซื้อ หรือสั่งตรงโดยระบุโครงการ)
create function create_purchase_order(p_pr_id uuid, p_project_id uuid, p_vendor_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_project uuid := p_project_id; v_item jsonb; v_total numeric(15,2) := 0;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then
    raise exception 'ไม่มีสิทธิ์สร้างใบสั่งซื้อ';
  end if;
  if p_pr_id is not null then
    select project_id into v_project from purchase_requisitions
      where id = p_pr_id and status = 'pending' for update;
    if not found then raise exception 'ไม่พบใบขอซื้อ หรือถูกแปลงเป็นใบสั่งซื้อแล้ว'; end if;
  end if;
  if v_project is null then raise exception 'กรุณาเลือกโครงการ'; end if;
  if p_vendor_id is null then raise exception 'กรุณาเลือกผู้ขาย'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ';
  end if;

  insert into purchase_orders (po_no, pr_id, project_id, vendor_id, order_date)
  values (generate_doc_no('PO'), p_pr_id, v_project, p_vendor_id, current_date)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'item_name'), '') = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    insert into purchase_order_items (po_id, item_name, quantity, unit, unit_price)
    values (v_id, trim(v_item->>'item_name'), (v_item->>'quantity')::numeric,
            nullif(trim(v_item->>'unit'), ''), (v_item->>'unit_price')::numeric);
    v_total := v_total + round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2);
  end loop;

  update purchase_orders set total_amount = v_total where id = v_id;
  if p_pr_id is not null then
    update purchase_requisitions set status = 'ordered' where id = p_pr_id;
  end if;
  return v_id;
end $$;

-- ยืนยันรับของเข้าสโตร์: อัปเดตสต็อก (ถัวเฉลี่ย) + ลงบัญชี Dr.วัสดุคงเหลือ / Cr.เจ้าหนี้ ใน transaction เดียว
-- ต้นทุนต่อหน่วยใช้ราคาจากใบสั่งซื้อเสมอ (ไม่รับค่าจาก client กันแก้ตัวเลข)
-- p_items: [{ "po_item_id": uuid, "qty_received": number }]
create function confirm_goods_receipt(p_po_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype; v_poi purchase_order_items%rowtype; v_stock inventory_stock%rowtype;
  v_item jsonb; v_qty numeric; v_item_id uuid; v_grn uuid; v_grn_no text; v_je uuid;
  v_total numeric(15,2) := 0; v_acc_inv uuid; v_acc_ap uuid; v_open int;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
    raise exception 'ไม่มีสิทธิ์ยืนยันรับของ';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ไม่มีรายการรับของ'; end if;

  select * into v_po from purchase_orders where id = p_po_id for update;  -- ล็อกกันรับซ้อน
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status in ('received','cancelled') then raise exception 'ใบสั่งซื้อนี้ปิดแล้ว'; end if;

  select id into v_acc_inv from chart_of_accounts where account_code = '1140';
  select id into v_acc_ap  from chart_of_accounts where account_code = '2110';
  if v_acc_inv is null or v_acc_ap is null then raise exception 'ยังไม่มีผังบัญชี 1140/2110'; end if;

  v_grn_no := generate_doc_no('GRN');
  insert into goods_receipts (grn_no, po_id, received_date, received_by)
  values (v_grn_no, p_po_id, current_date, auth.uid()) returning id into v_grn;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty_received')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then raise exception 'จำนวนรับต้องไม่ติดลบ'; end if;

    select * into v_poi from purchase_order_items
      where id = (v_item->>'po_item_id')::uuid and po_id = p_po_id for update;
    if not found then raise exception 'มีรายการที่ไม่อยู่ในใบสั่งซื้อนี้'; end if;
    if v_qty > v_poi.quantity - v_poi.qty_received then
      raise exception 'รับเกินจำนวนที่สั่ง: %', v_poi.item_name;
    end if;

    -- หาสินค้าคงคลัง (ตามชื่อ+หน่วย) ถ้าไม่มีให้สร้างใหม่
    v_item_id := v_poi.item_id;
    if v_item_id is null then
      select id into v_item_id from inventory_items
        where lower(item_name) = lower(v_poi.item_name) and coalesce(unit,'') = coalesce(v_poi.unit,'') limit 1;
      if v_item_id is null then
        insert into inventory_items (item_code, item_name, unit)
        values ('ITM-' || lpad(nextval('inventory_item_code_seq')::text, 5, '0'), v_poi.item_name, v_poi.unit)
        returning id into v_item_id;
      end if;
      update purchase_order_items set item_id = v_item_id where id = v_poi.id;
    end if;

    -- สต็อกต่อโครงการ + ต้นทุนถัวเฉลี่ยถ่วงน้ำหนัก
    insert into inventory_stock (item_id, project_id) values (v_item_id, v_po.project_id)
    on conflict (item_id, project_id) do nothing;
    select * into v_stock from inventory_stock
      where item_id = v_item_id and project_id = v_po.project_id for update;
    update inventory_stock set
      avg_unit_cost = round((v_stock.qty_on_hand * v_stock.avg_unit_cost + v_qty * v_poi.unit_price)
                            / (v_stock.qty_on_hand + v_qty), 2),
      qty_on_hand = v_stock.qty_on_hand + v_qty
    where id = v_stock.id;

    update purchase_order_items set qty_received = qty_received + v_qty where id = v_poi.id;
    insert into goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (v_grn, v_poi.id, v_qty, v_poi.unit_price);
    v_total := v_total + round(v_qty * v_poi.unit_price, 2);
  end loop;

  if v_total = 0 then raise exception 'ไม่มีจำนวนที่รับ'; end if;

  insert into journal_entries (entry_no, entry_date, description, project_id, source_module, source_ref, created_by)
  values (generate_doc_no('JV'), current_date,
          'รับวัสดุเข้าสโตร์ ' || v_grn_no || ' (' || v_po.po_no || ')',
          v_po.project_id, 'purchasing', v_grn_no, auth.uid())
  returning id into v_je;
  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
    (v_je, v_acc_inv, v_total, 0),
    (v_je, v_acc_ap, 0, v_total);
  update goods_receipts set journal_entry_id = v_je where id = v_grn;

  select count(*) into v_open from purchase_order_items where po_id = p_po_id and qty_received < quantity;
  update purchase_orders set status = case when v_open = 0 then 'received' else 'partial' end
  where id = p_po_id;

  return v_grn;
end $$;

-- อนุญาตเฉพาะผู้ล็อกอินเรียก RPC (สิทธิ์ละเอียดตรวจในฟังก์ชันแล้ว)
revoke all on function create_purchase_requisition(uuid, text, jsonb) from public, anon;
revoke all on function create_purchase_order(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function confirm_goods_receipt(uuid, jsonb) from public, anon;
grant execute on function create_purchase_requisition(uuid, text, jsonb) to authenticated;
grant execute on function create_purchase_order(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function confirm_goods_receipt(uuid, jsonb) to authenticated;
