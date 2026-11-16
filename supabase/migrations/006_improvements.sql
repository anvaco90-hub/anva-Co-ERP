-- ขั้นที่ 6: ปรับปรุงระบบสโตร์ + จัดซื้อ
-- ต้องรัน 005 มาก่อน
-- ★ สโตร์สร้าง PR/PO ได้ ★ รูปวัสดุ ★ รหัสอัตโนมัติตามหมวด ★ ชื่อวัสดุไม่ซ้ำ
-- ★ ผู้ซื้อ ★ บังคับ PR ก่อน PO ★ auto-suggest วัสดุ

------------------------------------------------------------
-- 1) รูปภาพวัสดุ
------------------------------------------------------------
alter table inventory_items add column if not exists image_url text;

-- grant update image_url
grant update (image_url) on inventory_items to authenticated;

------------------------------------------------------------
-- 2) รหัสหมวด (prefix) สำหรับ auto-generate item_code
------------------------------------------------------------
alter table item_categories add column if not exists code_prefix text unique;

update item_categories set code_prefix = 'CM' where name = 'ปูน ทราย หิน' and code_prefix is null;
update item_categories set code_prefix = 'ST' where name = 'เหล็ก' and code_prefix is null;
update item_categories set code_prefix = 'WD' where name = 'ไม้และแผ่นไม้' and code_prefix is null;
update item_categories set code_prefix = 'EL' where name = 'ไฟฟ้า' and code_prefix is null;
update item_categories set code_prefix = 'PL' where name = 'ประปาและสุขภัณฑ์' and code_prefix is null;
update item_categories set code_prefix = 'CH' where name = 'สีและเคมีภัณฑ์' and code_prefix is null;
update item_categories set code_prefix = 'TL' where name = 'อุปกรณ์/เครื่องมือ' and code_prefix is null;
update item_categories set code_prefix = 'OT' where name = 'อื่น ๆ' and code_prefix is null;

-- ฟังก์ชัน: สร้างรหัสวัสดุอัตโนมัติตามหมวด เช่น EL-0001, CM-0002
create or replace function generate_item_code(p_category_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_next int;
begin
  if p_category_id is null then
    v_prefix := 'ITM';
  else
    select code_prefix into v_prefix from item_categories where id = p_category_id;
    if v_prefix is null then v_prefix := 'ITM'; end if;
  end if;

  -- ใช้ doc_sequences เพื่อกัน race condition
  insert into doc_sequences (prefix, doc_year, last_no) values (v_prefix, 0, 1)
  on conflict (prefix, doc_year) do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_next;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end $$;
revoke all on function generate_item_code(uuid) from public, anon, authenticated;

------------------------------------------------------------
-- 3) ชื่อวัสดุห้ามซ้ำ (case-insensitive)
------------------------------------------------------------
-- ลบรายการซ้ำก่อน (เก็บรายการที่มีสต็อก หรือรายการแรก)
-- ถ้าไม่มีซ้ำจะไม่ทำอะไร
do $$
declare
  v_dup record;
  v_keep uuid;
begin
  for v_dup in
    select lower(item_name) as ln, array_agg(id order by qty_on_hand desc, created_at) as ids
    from inventory_items
    group by lower(item_name) having count(*) > 1
  loop
    v_keep := v_dup.ids[1];
    -- ย้าย references ไปรายการที่เก็บ
    update stock_lots set item_id = v_keep where item_id = any(v_dup.ids[2:]);
    update stock_issue_items set item_id = v_keep where item_id = any(v_dup.ids[2:]);
    update purchase_order_items set item_id = v_keep where item_id = any(v_dup.ids[2:]);
    update stock_adjustments set item_id = v_keep where item_id = any(v_dup.ids[2:]);
    delete from inventory_items where id = any(v_dup.ids[2:]);
  end loop;
end $$;

create unique index if not exists inventory_items_name_unique on inventory_items (lower(item_name));

------------------------------------------------------------
-- 4) ผู้ซื้อใน PO
------------------------------------------------------------
alter table purchase_orders add column if not exists buyer_name text;

------------------------------------------------------------
-- 5) ปรับ RPC: สโตร์สร้างใบขอซื้อได้
------------------------------------------------------------
create or replace function create_purchase_requisition(p_project_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  -- ★ เพิ่ม store ให้สร้าง PR ได้
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
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

------------------------------------------------------------
-- 6) ปรับ RPC: สโตร์สร้างใบสั่งซื้อได้ + บังคับผ่าน PR
------------------------------------------------------------
create or replace function create_purchase_order(p_pr_id uuid, p_project_id uuid, p_vendor_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_project uuid := p_project_id; v_item jsonb; v_total numeric(15,2) := 0;
begin
  -- ★ เพิ่ม store ให้สร้าง PO ได้
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
    raise exception 'ไม่มีสิทธิ์สร้างใบสั่งซื้อ';
  end if;
  -- ★ บังคับผ่าน PR เสมอ
  if p_pr_id is null then raise exception 'กรุณาเลือกใบขอซื้อ (PR) — การสั่งซื้อต้องผ่าน PR ทุกครั้ง'; end if;

  select project_id into v_project from purchase_requisitions
    where id = p_pr_id and status = 'pending' for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ หรือถูกแปลงเป็นใบสั่งซื้อแล้ว'; end if;

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
  update purchase_requisitions set status = 'ordered' where id = p_pr_id;
  return v_id;
end $$;

------------------------------------------------------------
-- 7) ปรับ RPCs อื่นๆ ให้ store แก้ไข/ลบ PR/PO ได้
------------------------------------------------------------
create or replace function update_purchase_requisition(p_pr_id uuid, p_project_id uuid, p_notes text, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr purchase_requisitions%rowtype; v_old jsonb; v_item jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบขอซื้อ'; end if;
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

create or replace function delete_purchase_requisition(p_pr_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr purchase_requisitions%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ลบใบขอซื้อ'; end if;
  select * into v_pr from purchase_requisitions where id = p_pr_id for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if exists (select 1 from purchase_orders where pr_id = p_pr_id) then
    raise exception 'ลบไม่ได้ เพราะมีใบสั่งซื้ออ้างอิงอยู่ (ลบหรือแก้ใบสั่งซื้อก่อน)';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data)
  values ('PR', p_pr_id, v_pr.pr_no, 'delete', p_reason, _pr_snapshot(p_pr_id));
  delete from purchase_requisitions where id = p_pr_id;
end $$;

create or replace function update_purchase_order(p_po_id uuid, p_vendor_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype; v_poi purchase_order_items%rowtype; v_item jsonb; v_old jsonb;
  v_keep uuid[] := '{}'; v_id uuid; v_name text; v_unit text; v_qty numeric; v_price numeric;
  v_total numeric(15,2); v_open int; v_any boolean;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบสั่งซื้อ'; end if;
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

create or replace function cancel_purchase_order(p_po_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype; v_old jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผลการยกเลิก'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status = 'cancelled' then raise exception 'ใบสั่งซื้อนี้ยกเลิกแล้ว'; end if;
  v_old := _po_snapshot(p_po_id);
  update purchase_orders set status = 'cancelled', updated_by = auth.uid(), updated_at = now() where id = p_po_id;
  if v_po.pr_id is not null and not exists (select 1 from goods_receipts where po_id = p_po_id) then
    update purchase_requisitions set status = 'pending' where id = v_po.pr_id and status = 'ordered';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data, new_data)
  values ('PO', p_po_id, v_po.po_no, 'cancel', trim(p_reason), v_old, _po_snapshot(p_po_id));
end $$;

create or replace function delete_purchase_order(p_po_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ลบใบสั่งซื้อ'; end if;
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
-- 8) ฟังก์ชันเพิ่มวัสดุจากสโตร์ (รหัส auto ตามหมวด + ตรวจชื่อซ้ำ)
------------------------------------------------------------
create or replace function store_add_item(
  p_item_name text, p_unit text, p_category_id uuid, p_reorder_point numeric, p_image_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์เพิ่มวัสดุ';
  end if;
  if coalesce(trim(p_item_name), '') = '' then raise exception 'กรุณาระบุชื่อวัสดุ'; end if;

  -- ตรวจชื่อซ้ำ
  if exists (select 1 from inventory_items where lower(item_name) = lower(trim(p_item_name))) then
    raise exception 'มีวัสดุชื่อ "%" ในระบบแล้ว', trim(p_item_name);
  end if;

  v_code := generate_item_code(p_category_id);

  insert into inventory_items (item_code, item_name, unit, category_id, reorder_point, image_url, created_by)
  values (v_code, trim(p_item_name), nullif(trim(coalesce(p_unit,'')), ''),
          p_category_id, coalesce(p_reorder_point, 0), p_image_url, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function store_add_item(text, text, uuid, numeric, text) from public, anon;
grant execute on function store_add_item(text, text, uuid, numeric, text) to authenticated;

------------------------------------------------------------
-- 9) Supabase Storage: bucket สำหรับรูปวัสดุ
------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict do nothing;

create policy "item_images_read" on storage.objects for select
  using (bucket_id = 'item-images');
create policy "item_images_insert" on storage.objects for insert
  with check (bucket_id = 'item-images' and (select get_my_role()) in ('admin','store'));
create policy "item_images_delete" on storage.objects for delete
  using (bucket_id = 'item-images' and (select get_my_role()) in ('admin','store'));

------------------------------------------------------------
-- 10) สิทธิ์ RPC ใหม่
------------------------------------------------------------
revoke all on function generate_item_code(uuid) from public, anon;
grant execute on function store_add_item(text, text, uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
