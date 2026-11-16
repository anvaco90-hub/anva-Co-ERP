-- ============================================================================
-- MIGRATION 017: STORE & PURCHASING WORKFLOW HOTFIX (แก้ปัญหาเบิกของ และออก PR/PO)
-- ระบบ ERP บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)
-- ============================================================================
-- 1. แก้ไขบั๊ก confirm_stock_issue ฟังก์ชันซ้ำซ้อน 2 ตัว (Function Overload Ambiguity)
-- 2. ปลดล็อก Not-Null constraint บน project_id ใน purchase_requisitions & purchase_orders
--    (เพื่อรองรับการสั่งซื้อของกลาง/สต็อกส่วนกลางบริษัทโดยไม่ต้องระบุโครงการ)
-- 3. กำหนดค่าเริ่มต้น order_date & request_date เป็น current_date ป้องกัน Error Not-Null
-- 4. ปรับปรุง Stored Procedures: create_purchase_requisition, create_purchase_order, confirm_stock_issue
-- 5. ปลดล็อก RLS ให้สโตร์และจัดซื้อบันทึก แก้ไข และอัปเดตสต็อกได้ 100%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ตาราง PURCHASE_REQUISITIONS (แก้ Not-Null Constraint)
-- ----------------------------------------------------------------------------
alter table if exists purchase_requisitions alter column project_id drop not null;
alter table if exists purchase_requisitions alter column request_date set default current_date;
alter table if exists purchase_requisitions alter column status set default 'pending';

-- ----------------------------------------------------------------------------
-- 2. ตาราง PURCHASE_ORDERS (แก้ Not-Null Constraint บน order_date & project_id)
-- ----------------------------------------------------------------------------
alter table if exists purchase_orders alter column project_id drop not null;
alter table if exists purchase_orders alter column order_date set default current_date;
alter table if exists purchase_orders alter column status set default 'open';

-- ----------------------------------------------------------------------------
-- 3. ตาราง STOCK_ISSUES, STOCK_LOTS, STOCK_ADJUSTMENTS (แก้ Not-Null & เพิ่มคอลัมน์)
-- ----------------------------------------------------------------------------
alter table if exists stock_issues alter column project_id drop not null;
alter table if exists stock_issues add column if not exists created_at timestamptz default now();
alter table if exists stock_issues alter column issue_date set default current_date;
alter table if exists stock_lots alter column source_project_id drop not null;
alter table if exists stock_adjustments alter column source_project_id drop not null;

-- ----------------------------------------------------------------------------
-- 4. แก้ไขปัญหา FUNCTION OVERLOAD บน confirm_stock_issue (ลบฟังก์ชันเดิมที่ชนกันทิ้งทั้งหมด)
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_stock_issue(uuid, jsonb, text);
drop function if exists public.confirm_stock_issue(uuid, text, jsonb);
drop function if exists public.confirm_stock_issue(uuid, jsonb);
drop function if exists public.confirm_stock_issue(uuid, text);

-- สร้างฟังก์ชัน confirm_stock_issue ตัวหลักตัวเดียวที่มี Signature ชัดเจน
create or replace function public.confirm_stock_issue(
  p_project_id uuid,
  p_items jsonb,
  p_notes text default null
) returns uuid as $$
declare
  v_issue_id uuid;
  v_issue_no text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric(12,2);
  v_avg_cost numeric(15,2);
begin
  -- สร้างเลขที่ใบเบิก เช่น ISS2026110001
  v_issue_no := next_doc_no('ISS');

  insert into stock_issues (issue_no, project_id, issue_date, notes)
  values (v_issue_no, p_project_id, current_date, p_notes)
  returning id into v_issue_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    -- ดึงต้นทุนเฉลี่ยปัจจุบัน
    select coalesce(avg_unit_cost, 0) into v_avg_cost
    from inventory_items
    where id = v_item_id;

    -- บันทึกรายการเบิก
    insert into stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue_id, v_item_id, v_qty, v_avg_cost);

    -- ตัดยอดสต็อกคงเหลือในสโตร์หลัก
    update inventory_items
    set qty_on_hand = greatest(qty_on_hand - v_qty, 0),
        updated_at = now()
    where id = v_item_id;
  end loop;

  return v_issue_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_stock_issue(uuid, jsonb, text) to public, authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 5. ปรับปรุง CREATE_PURCHASE_REQUISITION (รองรับ project_id เป็น NULL ได้)
-- ----------------------------------------------------------------------------
create or replace function public.create_purchase_requisition(
  p_project_id uuid,
  p_notes text,
  p_items jsonb
) returns uuid as $$
declare
  v_pr_id uuid;
  v_pr_no text;
  v_item jsonb;
begin
  v_pr_no := next_doc_no('PR');

  insert into purchase_requisitions (pr_no, project_id, request_date, notes, status, created_at)
  values (v_pr_no, p_project_id, current_date, p_notes, 'pending', now())
  returning id into v_pr_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price)
    values (
      v_pr_id,
      v_item->>'item_name',
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'รายการ'),
      coalesce((v_item->>'estimated_price')::numeric, 0)
    );
  end loop;

  return v_pr_id;
end;
$$ language plpgsql security definer;

grant execute on function public.create_purchase_requisition(uuid, text, jsonb) to public, authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 6. ปรับปรุง CREATE_PURCHASE_ORDER (กำหนด order_date และ project_id เป็น NULL ได้)
-- ----------------------------------------------------------------------------
create or replace function public.create_purchase_order(
  p_pr_id uuid,
  p_project_id uuid,
  p_vendor_id uuid,
  p_items jsonb
) returns uuid as $$
declare
  v_po_id uuid;
  v_po_no text;
  v_item jsonb;
  v_total numeric(15,2) := 0;
begin
  v_po_no := next_doc_no('PO');

  insert into purchase_orders (po_no, pr_id, project_id, vendor_id, order_date, status, created_at)
  values (v_po_no, p_pr_id, p_project_id, p_vendor_id, current_date, 'open', now())
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0));
    insert into purchase_order_items (po_id, pr_item_id, item_name, quantity, unit, unit_price, total_amount)
    values (
      v_po_id,
      case when (v_item->>'pr_item_id') is not null and (v_item->>'pr_item_id') <> '' then (v_item->>'pr_item_id')::uuid else null end,
      v_item->>'item_name',
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'รายการ'),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0)
    );
  end loop;

  update purchase_orders set total_amount = v_total where id = v_po_id;

  -- อัปเดตสถานะ PR เป็น ordered
  if p_pr_id is not null then
    update purchase_requisitions set status = 'ordered', updated_at = now() where id = p_pr_id;
  end if;

  return v_po_id;
end;
$$ language plpgsql security definer;

grant execute on function public.create_purchase_order(uuid, uuid, uuid, jsonb) to public, authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 7. ปรับปรุง ADJUST_STOCK (บันทึกการปรับปรุงสต็อกและอัปเดตยอดคงเหลือ)
-- ----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_item_id uuid,
  p_source_project_id uuid,
  p_new_qty numeric,
  p_unit_cost numeric,
  p_reason text
) returns uuid as $$
declare
  v_adj_id uuid;
  v_adj_no text;
  v_cur_qty numeric := 0;
begin
  select coalesce(qty_on_hand, 0) into v_cur_qty from inventory_items where id = p_item_id;
  v_adj_no := next_doc_no('ADJ');

  insert into stock_adjustments (adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, reason, created_at)
  values (v_adj_no, p_item_id, p_source_project_id, coalesce(v_cur_qty, 0), p_new_qty, coalesce(p_unit_cost, 0), p_reason, now())
  returning id into v_adj_id;

  update inventory_items set qty_on_hand = p_new_qty, updated_at = now() where id = p_item_id;

  return v_adj_id;
end;
$$ language plpgsql security definer;

grant execute on function public.adjust_stock(uuid, uuid, numeric, numeric, text) to public, authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 8. ปลดล็อก RLS และคืนสิทธิ์การใช้งานตาราง (GRANT ALL) ทุกตารางสโตร์และจัดซื้อ
-- ----------------------------------------------------------------------------
-- คืนสิทธิ์ระดับตาราง (แก้ permission denied for table inventory_items จากการ revoke เดิม)
grant all on table public.inventory_items to authenticated, anon, public, service_role;
grant all on table public.item_categories to authenticated, anon, public, service_role;
grant all on table public.inventory_stock to authenticated, anon, public, service_role;
grant all on table public.stock_lots to authenticated, anon, public, service_role;
grant all on table public.stock_issues to authenticated, anon, public, service_role;
grant all on table public.stock_issue_items to authenticated, anon, public, service_role;
grant all on table public.stock_adjustments to authenticated, anon, public, service_role;
grant all on table public.purchase_requisitions to authenticated, anon, public, service_role;
grant all on table public.purchase_requisition_items to authenticated, anon, public, service_role;
grant all on table public.purchase_orders to authenticated, anon, public, service_role;
grant all on table public.purchase_order_items to authenticated, anon, public, service_role;
grant all on table public.goods_receipts to authenticated, anon, public, service_role;
grant all on table public.goods_receipt_items to authenticated, anon, public, service_role;

grant all on all sequences in schema public to authenticated, anon, public, service_role;
grant all on all routines in schema public to authenticated, anon, public, service_role;

-- ลบนโยบายเก่าที่จำกัดคอลัมน์ของ inventory_items
drop policy if exists "insert_items" on public.inventory_items;
drop policy if exists "update_items" on public.inventory_items;
drop policy if exists "update_reorder_point" on public.inventory_items;
drop policy if exists "read_inventory_items" on public.inventory_items;

do $$
declare
  tbl text;
  tables text[] := array[
    'inventory_items', 'item_categories', 'inventory_stock', 'stock_lots',
    'stock_issues', 'stock_issue_items', 'stock_adjustments',
    'purchase_requisitions', 'purchase_requisition_items',
    'purchase_orders', 'purchase_order_items', 'goods_receipts', 'goods_receipt_items'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table %I enable row level security;', tbl);
    execute format('drop policy if exists %I on %I;', 'allow_all_' || tbl, tbl);
    execute format('create policy %I on %I for all to public using (true) with check (true);', 'allow_all_' || tbl, tbl);
  end loop;
end $$;
