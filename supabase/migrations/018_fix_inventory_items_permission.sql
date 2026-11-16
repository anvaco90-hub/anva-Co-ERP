-- ============================================================================
-- MIGRATION 018: FIX INVENTORY_ITEMS PERMISSION & GRANT TABLE ACCESS
-- ระบบ ERP บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)
-- ============================================================================
-- แก้ไขปัญหา: permission denied for table inventory_items
-- สาเหตุ: มีการ revoke insert, update on inventory_items ใน migration เก่า (005)
--        และให้สิทธิ์เฉพาะบางคอลัมน์ (item_name, unit, category_id, reorder_point)
--        ทำให้เวลาเพิ่มหรือแก้ไข qty_on_hand, avg_unit_cost, image_url เกิด Error ทันที
-- ============================================================================

-- 1. เพิ่มคอลัมน์ created_at และตั้งค่าเริ่มต้น issue_date ใน stock_issues (แก้ column "created_at" does not exist)
alter table if exists public.stock_issues add column if not exists created_at timestamptz default now();
alter table if exists public.stock_issues alter column issue_date set default current_date;
alter table if exists public.stock_issues alter column project_id drop not null;

-- อัปเดตฟังก์ชัน confirm_stock_issue ให้ใช้ issue_date และ current_date อย่างถูกต้อง
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
  v_issue_no := next_doc_no('ISS');

  insert into stock_issues (issue_no, project_id, issue_date, notes)
  values (v_issue_no, p_project_id, current_date, p_notes)
  returning id into v_issue_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    select coalesce(avg_unit_cost, 0) into v_avg_cost
    from inventory_items
    where id = v_item_id;

    insert into stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue_id, v_item_id, v_qty, v_avg_cost);

    update inventory_items
    set qty_on_hand = greatest(coalesce(qty_on_hand, 0) - v_qty, 0),
        updated_at = now()
    where id = v_item_id;
  end loop;

  return v_issue_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_stock_issue(uuid, jsonb, text) to public, authenticated, anon, service_role;

-- 2. คืนสิทธิ์การใช้งาน Table Level (GRANT ALL) ให้กับ authenticated, anon, public
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

-- ให้สิทธิ์ Sequence และ Functions ทั้งหมดใน schema public
grant all on all sequences in schema public to authenticated, anon, public, service_role;
grant all on all routines in schema public to authenticated, anon, public, service_role;

-- 2. ลบนโยบาย RLS เก่าที่จำกัดคอลัมน์และบทบาท (Restrictive Policies)
drop policy if exists "insert_items" on public.inventory_items;
drop policy if exists "update_items" on public.inventory_items;
drop policy if exists "update_reorder_point" on public.inventory_items;
drop policy if exists "read_inventory_items" on public.inventory_items;

-- 3. ปลดล็อก RLS ทุกตารางสโตร์และจัดซื้อ (CRUD 100%)
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

-- 5. ให้สิทธิ์ Storage Bucket item-images สำหรับการอัปโหลดรูปภาพสินค้า
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do update set public = true;

drop policy if exists "item_images_read" on storage.objects;
drop policy if exists "item_images_insert" on storage.objects;
drop policy if exists "allow_all_item_images" on storage.objects;
drop policy if exists "allow_all_item_images_select" on storage.objects;
drop policy if exists "allow_all_item_images_insert" on storage.objects;
drop policy if exists "allow_all_item_images_update" on storage.objects;
drop policy if exists "allow_all_item_images_delete" on storage.objects;

create policy "allow_all_item_images_select" on storage.objects
  for select using (bucket_id = 'item-images');

create policy "allow_all_item_images_insert" on storage.objects
  for insert with check (bucket_id = 'item-images');

create policy "allow_all_item_images_update" on storage.objects
  for update using (bucket_id = 'item-images');

create policy "allow_all_item_images_delete" on storage.objects
  for delete using (bucket_id = 'item-images');

