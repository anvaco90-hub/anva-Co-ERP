-- 031_add_pr_item_id_and_fix_po_items.sql
-- เพิ่มคอลัมน์ pr_item_id ใน purchase_order_items และปรับปรุงตาราง purchase_orders / purchase_order_items ให้สมบูรณ์

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS pr_item_id uuid;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS qty_received numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS item_id uuid;

-- เพิ่มคอลัมน์สำคัญใน purchase_orders ให้ครบ
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS custom_project_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS custom_vendor_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'credit_30';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quotation_no text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quotation_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'vat_included';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) DEFAULT 7.00;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS vat_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS wht_rate numeric(5,2) DEFAULT 0.00;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS wht_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS grand_total numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS vendor_tax_invoice_no text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tax_invoice_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS has_deposit boolean DEFAULT false;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS deposit_percent numeric(5,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS deposit_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_channel_requested text DEFAULT 'transfer';

-- อัปเดตฟังก์ชัน create_purchase_order ให้ปลอดภัยและเสถียร
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
  -- คำนวณรหัส PO ใหม่
  begin
    v_po_no := next_doc_no('PO');
  exception when others then
    v_po_no := 'PO' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

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

  update purchase_orders set total_amount = v_total, grand_total = v_total where id = v_po_id;

  if p_pr_id is not null then
    update purchase_requisitions set status = 'ordered', updated_at = now() where id = p_pr_id;
  end if;

  return v_po_id;
end;
$$ language plpgsql security definer;

grant execute on function public.create_purchase_order(uuid, uuid, uuid, jsonb) to public, authenticated, anon, service_role;

