-- ============================================================================
-- MIGRATION 022: FIX STORE NAME UNIQUE CONSTRAINT & ENHANCE ADJUSTMENTS
-- 1. ปลดล็อก index "inventory_items_name_unique" เพื่อให้เพิ่มวัสดุที่มีชื่อเดียวกันในต่างหมวดหมู่ได้
-- 2. ขยายตาราง stock_adjustments ให้รองรับ target_type ('project', 'office', 'site') และ target_location
-- ============================================================================

-- 1. ลบ Unique Index บน item_name ที่ขัดขวางการเพิ่มรายการพัสดุ
drop index if exists public.inventory_items_name_unique;

-- 2. เพิ่มคอลัมน์ใน stock_adjustments เพื่อรองรับ โครงการ / ออฟฟิศ / หน้างาน
alter table if exists public.stock_adjustments add column if not exists target_type text default 'project';
alter table if exists public.stock_adjustments add column if not exists target_location text;
alter table if exists public.stock_adjustments alter column source_project_id drop not null;

-- 3. ให้สิทธิ์ table
grant all on table public.stock_adjustments to authenticated, anon, public, service_role;
grant all on table public.inventory_items to authenticated, anon, public, service_role;

