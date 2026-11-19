-- ==============================================================================
-- Migration 028: Custom Customer, Vendor, and Project Fields for Purchasing
-- ==============================================================================
-- รองรับการพิมพ์/คีย์ชื่อลูกค้า ร้านค้า และโครงการได้โดยตรงในโมดูลจัดซื้อและพัสดุ (PO & PR)

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS custom_project_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS custom_vendor_name text;

ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS custom_project_name text;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS suggested_vendor text;

