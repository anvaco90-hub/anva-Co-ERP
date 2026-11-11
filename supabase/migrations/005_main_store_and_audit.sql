-- ปรับโครงสร้าง: สโตร์หลัก (ของกลาง) + ล็อตตามโครงการต้นทาง + หมวดวัสดุ + ปรับปรุงสต็อก
--               + CRUD ใบขอซื้อ/ใบสั่งซื้อ พร้อมประวัติการแก้ไข
-- ต้องรัน 003 และ 004 มาก่อน (ถ้ายังไม่เคยรัน 004 ให้รัน 004 ก่อน แล้วค่อยรันไฟล์นี้)
-- ข้อมูลทดสอบเดิมใน inventory_stock จะถูกย้ายเป็น "ล็อตยกมา" อัตโนมัติ

------------------------------------------------------------
-- 1) หมวดวัสดุ
------------------------------------------------------------
create table item_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);
insert into item_categories (name, sort_order) values
  ('ปูน ทราย หิน', 1), ('เหล็ก', 2), ('ไม้และแผ่นไม้', 3), ('ไฟฟ้า', 4),
  ('ประปาและสุขภัณฑ์', 5), ('สีและเคมีภัณฑ์', 6), ('อุปกรณ์/เครื่องมือ', 7), ('อื่น ๆ', 99);

alter table item_categories enable row level security;
create policy "read_categories" on item_categories for select using (get_my_role() is not null);
create policy "write_categories" on item_categories for all
  using (get_my_role() in ('admin','store')) with check (get_my_role() in ('admin','store'));

------------------------------------------------------------
-- 2) สโตร์หลัก: ยอดรวมอยู่ที่ตัววัสดุ, รายละเอียดแยกตามโครงการต้นทางอยู่ที่ stock_lots
------------------------------------------------------------
alter table inventory_items
  add column category_id uuid references item_categories(id),
  add column qty_on_hand numeric(12,2) not null default 0,
  add column avg_unit_cost numeric(15,2) not null default 0,
  add column created_by uuid references profiles(id) default auth.uid(),
  add column created_at timestamptz not null default now(),
  add column updated_by uuid references profiles(id),
  add column updated_at timestamptz;
alter table inventory_items alter column item_code
  set default ('ITM-' || lpad(nextval('inventory_item_code_seq')::text, 5, '0'));
-- reorder_point (เดิม) = จุดแจ้งเตือน "ใกล้หมด" ของวัสดุแต่ละรายการ

create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  source_project_id uuid references projects(id),   -- โครงการต้นทาง (null = ไม่ระบุ/ของกลาง)
  grn_item_id uuid references goods_receipt_items(id),
  lot_type text not null default 'receipt' check (lot_type in ('receipt','adjustment','migration')),
  received_date date not null default current_date,
  qty_received numeric(12,2) not null check (qty_received > 0),
  qty_remaining numeric(12,2) not null check (qty_remaining >= 0),
  unit_cost numeric(15,2) not null,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on stock_lots (item_id, received_date, created_at) where qty_remaining > 0;

-- ย้ายข้อมูลเดิม (สต็อกรายโครงการ) -> ล็อตยกมา + ยอดรวมต่อวัสดุ
insert into stock_lots (item_id, source_project_id, lot_type, qty_received, qty_remaining, unit_cost)
select item_id, project_id, 'migration', qty_on_hand, qty_on_hand, avg_unit_cost
from inventory_stock where qty_on_hand > 0;

update inventory_items i set qty_on_hand = s.q, avg_unit_cost = s.avg
from (select item_id, sum(qty_on_hand) q,
             round(sum(qty_on_hand * avg_unit_cost) / nullif(sum(qty_on_hand), 0), 2) avg
      from inventory_stock where qty_on_hand > 0 group by item_id) s
where s.item_id = i.id;

drop table inventory_stock;

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adj_no text unique not null,
  item_id uuid not null references inventory_items(id),
  source_project_id uuid references projects(id),
  qty_before numeric(12,2) not null,
  qty_after numeric(12,2) not null,
  unit_cost numeric(15,2) not null,
  reason text not null,
  journal_entry_id uuid references journal_entries(id),
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

insert into chart_of_accounts (account_code, account_name, account_type)
values ('5900', 'ปรับปรุงสต็อก (ส่วนเกิน/ขาด)', 'expense') on conflict do nothing;

-- ประทับ "ใครแก้ / เมื่อไร" เฉพาะเมื่อแก้ข้อมูลหลักของวัสดุ (ไม่นับการเปลี่ยนจำนวนสต็อก)
create function stamp_item_update() returns trigger language plpgsql as $$
begin
  if (new.item_name, new.unit, new.category_id, new.reorder_point)
     is distinct from (old.item_name, old.unit, old.category_id, old.reorder_point) then
    new.updated_at := now(); new.updated_by := auth.uid();
  end if;
  return new;
end $$;
create trigger inventory_items_stamp before update on inventory_items
  for each row execute function stamp_item_update();

-- สโตร์/admin เพิ่ม-แก้ข้อมูลหลักวัสดุได้ (ชื่อ/หน่วย/หมวด/จุดเตือน) แต่แก้จำนวน/ต้นทุนตรง ๆ ไม่ได้
revoke insert, update on inventory_items from anon, authenticated;
grant insert (item_name, unit, category_id, reorder_point) on inventory_items to authenticated;
grant update (item_name, unit, category_id, reorder_point) on inventory_items to authenticated;
drop policy if exists "update_reorder_point" on inventory_items;
create policy "update_items" on inventory_items for update
  using (get_my_role() in ('admin','store')) with check (get_my_role() in ('admin','store'));
create policy "insert_items" on inventory_items for insert
  with check (get_my_role() in ('admin','store') and qty_on_hand = 0 and avg_unit_cost = 0);

alter table stock_lots enable row level security;
alter table stock_adjustments enable row level security;
create policy "read_lots" on stock_lots for select
  using (get_my_role() in ('admin','store','purchasing','management','accounting'));
create policy "read_adjustments" on stock_adjustments for select
  using (get_my_role() in ('admin','store','purchasing','management','accounting'));

-- ให้ทุกคนที่เปิดใช้งานเห็น "ชื่อ" ผู้ทำรายการ (ใช้แสดงว่าใครเพิ่ม/แก้ไข)
create policy "read_profile_names" on profiles for select using (get_my_role() is not null);

------------------------------------------------------------
-- 3) ฟังก์ชันภายใน: ตัดล็อตแบบเข้าก่อนออกก่อน (FIFO) คืนค่าจำนวนที่ตัดไม่ครบ
------------------------------------------------------------
create function _consume_lots(p_item_id uuid, p_qty numeric, p_filter_source boolean, p_source uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_lot stock_lots%rowtype; v_left numeric := p_qty; v_take numeric;
begin
  for v_lot in
    select * from stock_lots
    where item_id = p_item_id and qty_remaining > 0
      and (not p_filter_source or source_project_id is not distinct from p_source)
    order by received_date, created_at, id for update
  loop
    v_take := least(v_lot.qty_remaining, v_left);
    update stock_lots set qty_remaining = qty_remaining - v_take where id = v_lot.id;
    v_left := v_left - v_take;
    exit when v_left <= 0;
  end loop;
  return v_left;
end $$;
revoke all on function _consume_lots(uuid, numeric, boolean, uuid) from public, anon, authenticated;

------------------------------------------------------------
-- 4) รับของ: เข้าสโตร์หลัก สร้างล็อตติดโครงการต้นทาง (โครงการที่สั่งซื้อ)
------------------------------------------------------------
create or replace function confirm_goods_receipt(p_po_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype; v_poi purchase_order_items%rowtype; v_inv inventory_items%rowtype;
  v_item jsonb; v_qty numeric; v_item_id uuid; v_grn uuid; v_grn_no text; v_gri uuid; v_je uuid;
  v_total numeric(15,2) := 0; v_acc_inv uuid; v_acc_ap uuid; v_open int;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
    raise exception 'ไม่มีสิทธิ์ยืนยันรับของ';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ไม่มีรายการรับของ'; end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
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

    v_item_id := v_poi.item_id;
    if v_item_id is null then
      select id into v_item_id from inventory_items
        where lower(item_name) = lower(v_poi.item_name) and coalesce(unit,'') = coalesce(v_poi.unit,'') limit 1;
      if v_item_id is null then
        insert into inventory_items (item_name, unit) values (v_poi.item_name, v_poi.unit)
        returning id into v_item_id;
      end if;
      update purchase_order_items set item_id = v_item_id where id = v_poi.id;
    end if;

    select * into v_inv from inventory_items where id = v_item_id for update;
    insert into goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (v_grn, v_poi.id, v_qty, v_poi.unit_price) returning id into v_gri;
    insert into stock_lots (item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost)
    values (v_item_id, v_po.project_id, v_gri, 'receipt', current_date, v_qty, v_qty, v_poi.unit_price);
    update inventory_items set
      avg_unit_cost = round((v_inv.qty_on_hand * v_inv.avg_unit_cost + v_qty * v_poi.unit_price)
                            / (v_inv.qty_on_hand + v_qty), 2),
      qty_on_hand = v_inv.qty_on_hand + v_qty
    where id = v_item_id;

    update purchase_order_items set qty_received = qty_received + v_qty where id = v_poi.id;
    v_total := v_total + round(v_qty * v_poi.unit_price, 2);
  end loop;

  if v_total = 0 then raise exception 'ไม่มีจำนวนที่รับ'; end if;

  insert into journal_entries (entry_no, entry_date, description, project_id, source_module, source_ref, created_by)
  values (generate_doc_no('JV'), current_date, 'รับวัสดุเข้าสโตร์หลัก ' || v_grn_no || ' (' || v_po.po_no || ')',
          v_po.project_id, 'purchasing', v_grn_no, auth.uid())
  returning id into v_je;
  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
    (v_je, v_acc_inv, v_total, 0), (v_je, v_acc_ap, 0, v_total);
  update goods_receipts set journal_entry_id = v_je where id = v_grn;

  select count(*) into v_open from purchase_order_items where po_id = p_po_id and qty_received < quantity;
  update purchase_orders set status = case when v_open = 0 then 'received' else 'partial' end where id = p_po_id;
  return v_grn;
end $$;

------------------------------------------------------------
-- 5) เบิกวัสดุ: ตัดจากสโตร์หลัก ต้นทุน (ถัวเฉลี่ย) เข้าโครงการปลายทาง
------------------------------------------------------------
create or replace function confirm_stock_issue(p_project_id uuid, p_items jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_qty numeric; v_item_id uuid; v_inv inventory_items%rowtype; v_left numeric;
  v_issue uuid; v_issue_no text; v_je uuid; v_total numeric(15,2) := 0; v_acc_cost uuid; v_acc_inv uuid;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์เบิกวัสดุ';
  end if;
  if p_project_id is null then raise exception 'กรุณาเลือกโครงการปลายทาง'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ไม่มีรายการเบิก'; end if;

  select id into v_acc_cost from chart_of_accounts where account_code = '5100';
  select id into v_acc_inv  from chart_of_accounts where account_code = '1140';
  if v_acc_cost is null or v_acc_inv is null then raise exception 'ยังไม่มีผังบัญชี 5100/1140'; end if;

  v_issue_no := generate_doc_no('ISS');
  insert into stock_issues (issue_no, project_id, issue_date, issued_by, notes)
  values (v_issue_no, p_project_id, current_date, auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_issue;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'จำนวนเบิกต้องมากกว่า 0'; end if;

    select * into v_inv from inventory_items where id = v_item_id for update;
    if not found then raise exception 'ไม่พบวัสดุที่เลือก'; end if;
    if v_inv.qty_on_hand < v_qty then
      raise exception 'สต็อกไม่พอ: % (คงเหลือ %)', v_inv.item_name, v_inv.qty_on_hand;
    end if;

    v_left := _consume_lots(v_item_id, v_qty, false, null);
    if v_left > 0 then raise exception 'ล็อตสต็อกไม่ตรงกับยอดคงเหลือ: % — แจ้งผู้ดูแลระบบ', v_inv.item_name; end if;

    update inventory_items set qty_on_hand = qty_on_hand - v_qty where id = v_item_id;
    insert into stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue, v_item_id, v_qty, v_inv.avg_unit_cost);
    v_total := v_total + round(v_qty * v_inv.avg_unit_cost, 2);
  end loop;

  if v_total > 0 then
    insert into journal_entries (entry_no, entry_date, description, project_id, source_module, source_ref, created_by)
    values (generate_doc_no('JV'), current_date, 'เบิกวัสดุเข้าหน้างาน ' || v_issue_no, p_project_id, 'store', v_issue_no, auth.uid())
    returning id into v_je;
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
      (v_je, v_acc_cost, v_total, 0), (v_je, v_acc_inv, 0, v_total);
    update stock_issues set journal_entry_id = v_je where id = v_issue;
  end if;
  return v_issue;
end $$;

------------------------------------------------------------
-- 6) ปรับปรุงสต็อก (เพิ่ม/แก้จำนวนของโครงการต้นทางนั้น) บังคับเหตุผล + ลงบัญชีส่วนต่าง
------------------------------------------------------------
create function adjust_stock(p_item_id uuid, p_source_project_id uuid, p_new_qty numeric, p_unit_cost numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv inventory_items%rowtype; v_cur numeric; v_diff numeric; v_cost numeric; v_left numeric;
  v_adj uuid; v_amount numeric(15,2); v_je uuid; v_acc_inv uuid; v_acc_adj uuid; v_adj_no text;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์ปรับปรุงสต็อก';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผลการปรับปรุง'; end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'จำนวนใหม่ต้องไม่ติดลบ'; end if;

  select * into v_inv from inventory_items where id = p_item_id for update;
  if not found then raise exception 'ไม่พบวัสดุ'; end if;
  select id into v_acc_inv from chart_of_accounts where account_code = '1140';
  select id into v_acc_adj from chart_of_accounts where account_code = '5900';
  if v_acc_inv is null or v_acc_adj is null then raise exception 'ยังไม่มีผังบัญชี 1140/5900'; end if;

  select coalesce(sum(qty_remaining), 0) into v_cur from stock_lots
    where item_id = p_item_id and source_project_id is not distinct from p_source_project_id;
  v_diff := p_new_qty - v_cur;
  if v_diff = 0 then raise exception 'จำนวนไม่เปลี่ยนแปลง'; end if;

  if v_diff > 0 then
    v_cost := coalesce(p_unit_cost, v_inv.avg_unit_cost);
    if v_cost < 0 then raise exception 'ต้นทุนต่อหน่วยต้องไม่ติดลบ'; end if;
    insert into stock_lots (item_id, source_project_id, lot_type, qty_received, qty_remaining, unit_cost)
    values (p_item_id, p_source_project_id, 'adjustment', v_diff, v_diff, v_cost);
    update inventory_items set
      avg_unit_cost = round((v_inv.qty_on_hand * v_inv.avg_unit_cost + v_diff * v_cost) / (v_inv.qty_on_hand + v_diff), 2),
      qty_on_hand = v_inv.qty_on_hand + v_diff
    where id = p_item_id;
    v_amount := round(v_diff * v_cost, 2);
  else
    v_cost := v_inv.avg_unit_cost;
    v_left := _consume_lots(p_item_id, -v_diff, true, p_source_project_id);
    if v_left > 0 then raise exception 'ล็อตสต็อกไม่ตรงกับยอดคงเหลือ'; end if;
    update inventory_items set qty_on_hand = qty_on_hand + v_diff where id = p_item_id;
    v_amount := round(-v_diff * v_cost, 2);
  end if;

  v_adj_no := generate_doc_no('ADJ');
  insert into stock_adjustments (adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, reason)
  values (v_adj_no, p_item_id, p_source_project_id, v_cur, p_new_qty, v_cost, trim(p_reason))
  returning id into v_adj;

  if v_amount > 0 then
    insert into journal_entries (entry_no, entry_date, description, project_id, source_module, source_ref, created_by)
    values (generate_doc_no('JV'), current_date, 'ปรับปรุงสต็อก ' || v_adj_no || ': ' || trim(p_reason),
            p_source_project_id, 'store', v_adj_no, auth.uid())
    returning id into v_je;
    if v_diff > 0 then   -- ส่วนเกิน: Dr.วัสดุคงเหลือ / Cr.ปรับปรุงสต็อก
      insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
        (v_je, v_acc_inv, v_amount, 0), (v_je, v_acc_adj, 0, v_amount);
    else                 -- ส่วนขาด: Dr.ปรับปรุงสต็อก / Cr.วัสดุคงเหลือ
      insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
        (v_je, v_acc_adj, v_amount, 0), (v_je, v_acc_inv, 0, v_amount);
    end if;
    update stock_adjustments set journal_entry_id = v_je where id = v_adj;
  end if;
  return v_adj;
end $$;

------------------------------------------------------------
-- 7) ใบขอซื้อ/ใบสั่งซื้อ: ผู้สร้าง/ผู้แก้ + ประวัติการแก้ไข + RPC แก้/ยกเลิก/ลบ
------------------------------------------------------------
alter table purchase_requisitions
  add column created_by uuid references profiles(id) default auth.uid(),
  add column created_at timestamptz not null default now(),
  add column updated_by uuid references profiles(id),
  add column updated_at timestamptz;
alter table purchase_orders
  add column created_by uuid references profiles(id) default auth.uid(),
  add column created_at timestamptz not null default now(),
  add column updated_by uuid references profiles(id),
  add column updated_at timestamptz;
update purchase_requisitions set created_by = requested_by where created_by is null;

create table purchase_audit_log (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('PR','PO')),
  doc_id uuid not null,          -- ไม่ผูก FK เพื่อให้ประวัติของเอกสารที่ถูกลบยังอยู่
  doc_no text,
  action text not null check (action in ('update','cancel','delete')),
  reason text,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references profiles(id) default auth.uid(),
  changed_at timestamptz not null default now()
);
create index on purchase_audit_log (doc_id, changed_at desc);
alter table purchase_audit_log enable row level security;
create policy "read_audit" on purchase_audit_log for select
  using (get_my_role() in ('admin','purchasing','store','management','accounting'));

create function _pr_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pr_no', pr.pr_no, 'project', p.project_code, 'status', pr.status, 'notes', pr.notes,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity,
        'unit', i.unit, 'estimated_price', i.estimated_price) order by i.item_name, i.id)
      from purchase_requisition_items i where i.pr_id = pr.id), '[]'::jsonb))
  from purchase_requisitions pr left join projects p on p.id = pr.project_id where pr.id = p_id
$$;
create function _po_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('po_no', po.po_no, 'vendor', v.vendor_name, 'status', po.status, 'total_amount', po.total_amount,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity,
        'unit', i.unit, 'unit_price', i.unit_price) order by i.item_name, i.id)
      from purchase_order_items i where i.po_id = po.id), '[]'::jsonb))
  from purchase_orders po left join vendors v on v.id = po.vendor_id where po.id = p_id
$$;
revoke all on function _pr_snapshot(uuid) from public, anon, authenticated;
revoke all on function _po_snapshot(uuid) from public, anon, authenticated;

-- แก้ใบขอซื้อ (แก้ได้ตลอด ยกเว้นที่ยกเลิกแล้ว) — เก็บค่าเดิม/ค่าใหม่ลงประวัติ
create function update_purchase_requisition(p_pr_id uuid, p_project_id uuid, p_notes text, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr purchase_requisitions%rowtype; v_old jsonb; v_item jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบขอซื้อ'; end if;
  select * into v_pr from purchase_requisitions where id = p_pr_id for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if v_pr.status = 'cancelled' then raise exception 'ใบขอซื้อที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
  if p_project_id is null then raise exception 'กรุณาเลือกโครงการ'; end if;
  if v_pr.status = 'ordered' and p_project_id <> v_pr.project_id then
    raise exception 'เปลี่ยนโครงการไม่ได้ เพราะออกใบสั่งซื้อแล้ว';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  v_old := _pr_snapshot(p_pr_id);
  update purchase_requisitions set project_id = p_project_id, notes = p_notes,
    updated_by = auth.uid(), updated_at = now() where id = p_pr_id;
  delete from purchase_requisition_items where pr_id = p_pr_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'item_name'), '') = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    insert into purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price)
    values (p_pr_id, trim(v_item->>'item_name'), (v_item->>'quantity')::numeric,
            nullif(trim(coalesce(v_item->>'unit','')), ''), coalesce((v_item->>'estimated_price')::numeric, 0));
  end loop;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, old_data, new_data)
  values ('PR', p_pr_id, v_pr.pr_no, 'update', v_old, _pr_snapshot(p_pr_id));
end $$;

create function delete_purchase_requisition(p_pr_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr purchase_requisitions%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then raise exception 'ไม่มีสิทธิ์ลบใบขอซื้อ'; end if;
  select * into v_pr from purchase_requisitions where id = p_pr_id for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if exists (select 1 from purchase_orders where pr_id = p_pr_id) then
    raise exception 'ลบไม่ได้ เพราะมีใบสั่งซื้ออ้างอิงอยู่ (ลบหรือแก้ใบสั่งซื้อก่อน)';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data)
  values ('PR', p_pr_id, v_pr.pr_no, 'delete', p_reason, _pr_snapshot(p_pr_id));
  delete from purchase_requisitions where id = p_pr_id;
end $$;

-- แก้ใบสั่งซื้อ: แก้ได้ตลอดแม้รับของแล้ว แต่รายการที่รับแล้วแก้ได้เฉพาะ "จำนวน" (ห้ามต่ำกว่าที่รับแล้ว)
-- เพื่อไม่ให้ยอดสต็อก/บัญชีที่ลงไปแล้วไม่ตรงกับเอกสาร
-- p_items: [{ "id"?: uuid, "item_name", "quantity", "unit", "unit_price" }]
create function update_purchase_order(p_po_id uuid, p_vendor_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype; v_poi purchase_order_items%rowtype; v_item jsonb; v_old jsonb;
  v_keep uuid[] := '{}'; v_id uuid; v_name text; v_unit text; v_qty numeric; v_price numeric;
  v_total numeric(15,2); v_open int; v_any boolean;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบสั่งซื้อ'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status = 'cancelled' then raise exception 'ใบสั่งซื้อที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
  if p_vendor_id is null then raise exception 'กรุณาเลือกผู้ขาย'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  v_old := _po_snapshot(p_po_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := trim(coalesce(v_item->>'item_name', ''));
    v_unit := nullif(trim(coalesce(v_item->>'unit', '')), '');
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    if v_name = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
    if v_price is null or v_price < 0 then raise exception 'ราคาต่อหน่วยไม่ถูกต้อง'; end if;

    if (v_item->>'id') is not null then
      select * into v_poi from purchase_order_items where id = (v_item->>'id')::uuid and po_id = p_po_id for update;
      if not found then raise exception 'มีรายการที่ไม่อยู่ในใบสั่งซื้อนี้'; end if;
      if v_poi.qty_received > 0 then
        if v_name <> v_poi.item_name or v_unit is distinct from v_poi.unit or v_price <> v_poi.unit_price then
          raise exception 'รายการ "%" รับของแล้ว แก้ได้เฉพาะจำนวน', v_poi.item_name;
        end if;
        if v_qty < v_poi.qty_received then
          raise exception 'จำนวนของ "%" ต่ำกว่าที่รับแล้ว (%)', v_poi.item_name, v_poi.qty_received;
        end if;
      end if;
      update purchase_order_items set item_name = v_name, quantity = v_qty, unit = v_unit, unit_price = v_price
      where id = v_poi.id;
      v_id := v_poi.id;
    else
      insert into purchase_order_items (po_id, item_name, quantity, unit, unit_price)
      values (p_po_id, v_name, v_qty, v_unit, v_price) returning id into v_id;
    end if;
    v_keep := array_append(v_keep, v_id);
  end loop;

  if exists (select 1 from purchase_order_items where po_id = p_po_id and id <> all(v_keep) and qty_received > 0) then
    raise exception 'ลบรายการที่รับของแล้วไม่ได้';
  end if;
  delete from purchase_order_items where po_id = p_po_id and id <> all(v_keep);

  select coalesce(sum(round(quantity * unit_price, 2)), 0) into v_total from purchase_order_items where po_id = p_po_id;
  select count(*) filter (where qty_received < quantity), bool_or(qty_received > 0)
    into v_open, v_any from purchase_order_items where po_id = p_po_id;

  update purchase_orders set vendor_id = p_vendor_id, total_amount = v_total,
    status = case when not coalesce(v_any, false) then 'open' when v_open = 0 then 'received' else 'partial' end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_po_id;

  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, old_data, new_data)
  values ('PO', p_po_id, v_po.po_no, 'update', v_old, _po_snapshot(p_po_id));
end $$;

create function cancel_purchase_order(p_po_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype; v_old jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then raise exception 'ไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผลการยกเลิก'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status = 'cancelled' then raise exception 'ใบสั่งซื้อนี้ยกเลิกแล้ว'; end if;
  v_old := _po_snapshot(p_po_id);
  update purchase_orders set status = 'cancelled', updated_by = auth.uid(), updated_at = now() where id = p_po_id;
  -- ยังไม่เคยรับของ -> คืนใบขอซื้อให้กลับมาสั่งซื้อใหม่ได้
  if v_po.pr_id is not null and not exists (select 1 from goods_receipts where po_id = p_po_id) then
    update purchase_requisitions set status = 'pending' where id = v_po.pr_id and status = 'ordered';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data, new_data)
  values ('PO', p_po_id, v_po.po_no, 'cancel', trim(p_reason), v_old, _po_snapshot(p_po_id));
end $$;

create function delete_purchase_order(p_po_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','admin') then raise exception 'ไม่มีสิทธิ์ลบใบสั่งซื้อ'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if exists (select 1 from goods_receipts where po_id = p_po_id) then
    raise exception 'ลบไม่ได้ เพราะมีการรับของแล้ว — ใช้ "ยกเลิก" แทน';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data)
  values ('PO', p_po_id, v_po.po_no, 'delete', p_reason, _po_snapshot(p_po_id));
  if v_po.pr_id is not null then
    update purchase_requisitions set status = 'pending' where id = v_po.pr_id and status = 'ordered';
  end if;
  delete from purchase_orders where id = p_po_id;
end $$;

------------------------------------------------------------
-- 8) สิทธิ์เรียกใช้ RPC
------------------------------------------------------------
revoke all on function adjust_stock(uuid, uuid, numeric, numeric, text) from public, anon;
revoke all on function update_purchase_requisition(uuid, uuid, text, jsonb) from public, anon;
revoke all on function delete_purchase_requisition(uuid, text) from public, anon;
revoke all on function update_purchase_order(uuid, uuid, jsonb) from public, anon;
revoke all on function cancel_purchase_order(uuid, text) from public, anon;
revoke all on function delete_purchase_order(uuid, text) from public, anon;
grant execute on function adjust_stock(uuid, uuid, numeric, numeric, text) to authenticated;
grant execute on function update_purchase_requisition(uuid, uuid, text, jsonb) to authenticated;
grant execute on function delete_purchase_requisition(uuid, text) to authenticated;
grant execute on function update_purchase_order(uuid, uuid, jsonb) to authenticated;
grant execute on function cancel_purchase_order(uuid, text) to authenticated;
grant execute on function delete_purchase_order(uuid, text) to authenticated;
grant execute on function confirm_goods_receipt(uuid, jsonb) to authenticated;
grant execute on function confirm_stock_issue(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';  -- ให้ API เห็นฟังก์ชัน/ตารางใหม่ทันที
