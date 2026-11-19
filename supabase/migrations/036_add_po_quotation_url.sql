-- 036_add_po_quotation_url.sql
-- เพิ่มคอลัมน์ quotation_url ใน purchase_orders เพื่อรองรับการแนบไฟล์/รูปภาพใบเสนอราคาจากผู้ขาย

alter table if exists public.purchase_orders 
add column if not exists quotation_url text;

grant all on table public.purchase_orders to authenticated, anon, public, service_role;

