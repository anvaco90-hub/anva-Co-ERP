-- 041_purchasing_sales_quotation_link.sql
-- Separate Sales Quotation linkage (`quotation_id`, `sales_quotation_no`) from Vendor Quotation (`quotation_no`)

ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_quotation_no text;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_quotation_no text;

CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_quotation_id ON public.purchase_requisitions (quotation_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_quotation_id ON public.purchase_orders (quotation_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_sales_quotation_no ON public.purchase_orders (sales_quotation_no);
