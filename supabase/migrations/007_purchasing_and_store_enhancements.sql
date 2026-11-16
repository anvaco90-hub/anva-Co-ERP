-- ขั้นที่ 7: ปรับปรุงระบบสโตร์และจัดซื้อเพิ่มเติม
-- ★ ไม่บังคับโครงการ (ซื้อ/รับของเข้าของกลางบริษัทได้)
-- ★ สโตร์รับของเข้าได้โดยตรง (ระบุจำนวน + ราคาต่อชิ้น)
-- ★ ประเภทการชำระเงิน ★ ใบเสนอราคา ★ ระบุภาษีและหัก ณ ที่จ่าย
-- ★ จัดการแก้ไข/ลบ หมวดหมู่วัสดุ

------------------------------------------------------------
-- 1) อนุญาตให้ PR และ PO ไม่ผูกโครงการ (ของกลางบริษัท / สโตร์กลาง HQ)
------------------------------------------------------------
alter table purchase_requisitions alter column project_id drop not null;
alter table purchase_orders alter column project_id drop not null;
alter table stock_lots alter column source_project_id drop not null;

------------------------------------------------------------
-- 2) เพิ่มฟิลด์การชำระเงิน, ใบเสนอราคา, และภาษีใน purchase_orders
------------------------------------------------------------
alter table purchase_orders add column if not exists payment_type text default 'credit_30';
alter table purchase_orders add column if not exists payment_term_days int default 30;
alter table purchase_orders add column if not exists quotation_no text;
alter table purchase_orders add column if not exists quotation_date date;
alter table purchase_orders add column if not exists quotation_url text;
alter table purchase_orders add column if not exists tax_type text default 'vat_included'; -- 'vat_included', 'vat_excluded', 'vat_exempt'
alter table purchase_orders add column if not exists vat_rate numeric(5,2) default 7.00;
alter table purchase_orders add column if not exists vat_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists wht_rate numeric(5,2) default 0.00;
alter table purchase_orders add column if not exists wht_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists net_amount numeric(15,2) default 0;

------------------------------------------------------------
-- 3) สโตร์รับวัสดุเข้าโดยตรง (ใส่จำนวน + ราคาต่อชิ้นได้ทันที)
------------------------------------------------------------
create or replace function store_direct_stock_in(
  p_item_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_source_project_id uuid default null,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv inventory_items%rowtype;
  v_lot_id uuid;
  v_new_qty numeric;
  v_new_avg numeric(15,2);
  v_grn_no text;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์รับวัสดุเข้าสโตร์';
  end if;
  if p_item_id is null then raise exception 'กรุณาเลือกวัสดุ'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'จำนวนรับเข้าต้องมากกว่า 0'; end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'ราคาต่อหน่วยต้องไม่ติดลบ'; end if;

  select * into v_inv from inventory_items where id = p_item_id for update;
  if not found then raise exception 'ไม่พบข้อมูลวัสดุในระบบ'; end if;

  -- 1. บันทึกล็อตสต็อกใหม่
  insert into stock_lots (
    item_id,
    source_project_id,
    lot_type,
    qty_received,
    qty_remaining,
    unit_cost,
    received_date
  ) values (
    p_item_id,
    p_source_project_id,
    'receipt',
    p_quantity,
    p_quantity,
    p_unit_price,
    current_date
  ) returning id into v_lot_id;

  -- 2. คำนวณต้นทุนเฉลี่ยถ่วงน้ำหนักใหม่ (Moving Average Cost)
  v_new_qty := coalesce(v_inv.qty_on_hand, 0) + p_quantity;
  if v_new_qty > 0 then
    v_new_avg := round(
      ((coalesce(v_inv.qty_on_hand, 0) * coalesce(v_inv.avg_unit_cost, 0)) + (p_quantity * p_unit_price)) / v_new_qty,
      2
    );
  else
    v_new_avg := p_unit_price;
  end if;

  -- 3. อัปเดตยอดคงเหลือและราคาเฉลี่ยในทะเบียนวัสดุ
  update inventory_items set
    qty_on_hand = v_new_qty,
    avg_unit_cost = v_new_avg,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_item_id;

  return v_lot_id;
end $$;

revoke all on function store_direct_stock_in(uuid, numeric, numeric, uuid, text) from public, anon;
grant execute on function store_direct_stock_in(uuid, numeric, numeric, uuid, text) to authenticated;

------------------------------------------------------------
-- 4) ฟังก์ชันลบและแก้ไขหมวดหมู่วัสดุ
------------------------------------------------------------
create or replace function delete_item_category(p_category_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์ลบหมวดหมู่';
  end if;

  -- ปลด category_id ของวัสดุที่ผูกอยู่ออกเป็น null ก่อน
  update inventory_items set category_id = null where category_id = p_category_id;

  delete from item_categories where id = p_category_id;
end $$;

revoke all on function delete_item_category(uuid) from public, anon;
grant execute on function delete_item_category(uuid) to authenticated;

notify pgrst, 'reload schema';

------------------------------------------------------------
-- 5) ปรับ create_purchase_requisition & create_purchase_order ไม่บังคับโครงการ
------------------------------------------------------------
create or replace function create_purchase_requisition(p_project_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
    raise exception 'ไม่มีสิทธิ์สร้างใบขอซื้อ';
  end if;
  -- ไม่บังคับโครงการ (null = ของกลางบริษัท / สโตร์กลาง HQ)
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

create or replace function create_purchase_order(p_pr_id uuid, p_project_id uuid, p_vendor_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_project uuid := p_project_id; v_item jsonb; v_total numeric(15,2) := 0;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then
    raise exception 'ไม่มีสิทธิ์สร้างใบสั่งซื้อ';
  end if;
  if p_pr_id is null then raise exception 'กรุณาเลือกใบขอซื้อ (PR) — การสั่งซื้อต้องผ่าน PR ทุกครั้ง'; end if;

  select project_id into v_project from purchase_requisitions
    where id = p_pr_id and status = 'pending' for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ หรือถูกแปลงเป็นใบสั่งซื้อแล้ว'; end if;

  -- v_project สามารถเป็น null ได้ (หมายถึง ของกลางบริษัท)
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
