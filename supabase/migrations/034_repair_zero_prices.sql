-- 034_repair_zero_prices.sql
-- ซ่อมแซมข้อมูลราคา 0.00 บาท ย้อนหลังสำหรับ purchase_order_items, goods_receipt_items, stock_lots และ inventory_items
-- อ้างอิงกรณี PO มีมูลค่ารวม (total_amount > 0) แต่รายการสินค้าในแถวถูกบันทึกเป็น 0.00

-- 1. ซ่อมแซมตาราง purchase_order_items (สำหรับใบสั่งซื้อที่มี 1 รายการ และ total_amount > 0)
update public.purchase_order_items poi
set 
  unit_price = round(po.total_amount / nullif(poi.quantity, 0), 2),
  total_amount = po.total_amount
from public.purchase_orders po
where poi.po_id = po.id
  and (poi.unit_price is null or poi.unit_price = 0)
  and coalesce(po.total_amount, 0) > 0
  and (
    select count(*) from public.purchase_order_items where po_id = po.id
  ) = 1;

-- ซ่อมแซม purchase_order_items ที่ผูกกับ purchase_requisition_items ที่มี estimated_price
update public.purchase_order_items poi
set 
  unit_price = pri.estimated_price,
  total_amount = round(coalesce(pri.estimated_price, 0) * coalesce(poi.quantity, 1), 2)
from public.purchase_requisition_items pri
where poi.pr_item_id = pri.id
  and (poi.unit_price is null or poi.unit_price = 0)
  and coalesce(pri.estimated_price, 0) > 0;

-- 2. ซ่อมแซมตาราง goods_receipt_items จาก purchase_order_items ที่มีราคาแล้ว
update public.goods_receipt_items gri
set unit_cost = poi.unit_price
from public.purchase_order_items poi
where gri.po_item_id = poi.id
  and (gri.unit_cost is null or gri.unit_cost = 0)
  and coalesce(poi.unit_price, 0) > 0;

-- ถ้ายังเป็น 0 ให้อัปเดตจาก PO total_amount สำหรับใบรับของที่มี 1 รายการ
update public.goods_receipt_items gri
set unit_cost = round(po.total_amount / nullif(gri.qty_received, 0), 2)
from public.goods_receipts gr
join public.purchase_orders po on gr.po_id = po.id
where gri.grn_id = gr.id
  and (gri.unit_cost is null or gri.unit_cost = 0)
  and coalesce(po.total_amount, 0) > 0
  and (
    select count(*) from public.goods_receipt_items where grn_id = gr.id
  ) = 1;

-- 3. ซ่อมแซมตาราง stock_lots
update public.stock_lots sl
set unit_cost = gri.unit_cost
from public.goods_receipt_items gri
where sl.grn_item_id = gri.id
  and (sl.unit_cost is null or sl.unit_cost = 0)
  and coalesce(gri.unit_cost, 0) > 0;

-- 4. ซ่อมแซมต้นทุนเฉลี่ยใน inventory_items (avg_unit_cost)
update public.inventory_items ii
set avg_unit_cost = sub.calc_cost,
    updated_at = now()
from (
  select item_id, round(sum(qty_remaining * unit_cost) / nullif(sum(qty_remaining), 0), 2) as calc_cost
  from public.stock_lots
  where unit_cost > 0
  group by item_id
) sub
where ii.id = sub.item_id
  and (ii.avg_unit_cost is null or ii.avg_unit_cost = 0)
  and sub.calc_cost is not null;

