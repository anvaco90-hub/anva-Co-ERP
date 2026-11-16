-- ============================================================================
-- MIGRATION 019: ENHANCE STOCK ISSUES FOR OFFICE, SITE, AND DAMAGE REASONS
-- ระบบ ERP บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)
-- ============================================================================
-- 1. เพิ่มคอลัมน์ใน stock_issues เพื่อรองรับ:
--    - issue_target: 'office' (ออฟฟิศ), 'project' (โครงการ), 'site' (หน้างาน)
--    - issue_reason: ตัดวัสดุไปใช้, ปรับจำนวนจากการนับ, สูญหาย, ทำลาย, ชำรุด/เสื่อมสภาพ, ภัยพิบัติ, อื่นๆ
--    - target_location: รายละเอียดสถานที่/แผนก
-- ============================================================================

-- 1. เพิ่มคอลัมน์ใน stock_issues
alter table if exists public.stock_issues add column if not exists issue_target text default 'project';
alter table if exists public.stock_issues add column if not exists issue_reason text default 'ตัดวัสดุไปใช้';
alter table if exists public.stock_issues add column if not exists target_location text;
alter table if exists public.stock_issues alter column project_id drop not null;

-- 2. ปรับปรุง RPC confirm_stock_issue
-- ลบ signature เก่าก่อนเพื่อป้องกันปัญหา Function Overload
drop function if exists public.confirm_stock_issue(uuid, jsonb, text);
drop function if exists public.confirm_stock_issue(uuid, text, jsonb);
drop function if exists public.confirm_stock_issue(uuid, jsonb, text, text, text);
drop function if exists public.confirm_stock_issue(uuid, jsonb, text, text, text, text);

create or replace function public.confirm_stock_issue(
  p_project_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null,
  p_issue_target text default 'project',
  p_issue_reason text default 'ตัดวัสดุไปใช้',
  p_target_location text default null
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

  insert into public.stock_issues (
    issue_no,
    project_id,
    issue_date,
    notes,
    issue_target,
    issue_reason,
    target_location,
    created_at
  )
  values (
    v_issue_no,
    p_project_id,
    current_date,
    p_notes,
    coalesce(p_issue_target, 'project'),
    coalesce(p_issue_reason, 'ตัดวัสดุไปใช้'),
    p_target_location,
    now()
  )
  returning id into v_issue_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    select coalesce(avg_unit_cost, 0) into v_avg_cost
    from public.inventory_items
    where id = v_item_id;

    insert into public.stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue_id, v_item_id, v_qty, v_avg_cost);

    update public.inventory_items
    set qty_on_hand = greatest(coalesce(qty_on_hand, 0) - v_qty, 0),
        updated_at = now()
    where id = v_item_id;
  end loop;

  return v_issue_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_stock_issue(uuid, jsonb, text, text, text, text) to public, authenticated, anon, service_role;

-- 3. ให้สิทธิ์ table และ sequence ทุกอย่าง
grant all on table public.stock_issues to authenticated, anon, public, service_role;
grant all on table public.stock_issue_items to authenticated, anon, public, service_role;
grant all on table public.inventory_items to authenticated, anon, public, service_role;

