-- 032_fix_goods_receipt_items_unit_cost.sql
-- ปลดล็อก NOT NULL บน unit_cost ใน goods_receipt_items และปรับปรุงฟังก์ชัน confirm_goods_receipt

-- 1. ปลด NOT NULL constraint และกำหนดค่าเริ่มต้น 0
ALTER TABLE public.goods_receipt_items ALTER COLUMN unit_cost DROP NOT NULL;
ALTER TABLE public.goods_receipt_items ALTER COLUMN unit_cost SET DEFAULT 0;

-- 2. ปรับปรุงฟังก์ชัน confirm_goods_receipt ให้อ่านราคาต้นทุนจาก purchase_order_items เสมอ
create or replace function public.confirm_goods_receipt(
  p_po_id uuid,
  p_items jsonb
) returns uuid as $$
declare
  v_grn_id uuid;
  v_grn_no text;
  v_item jsonb;
  v_poi_id uuid;
  v_qty numeric(12,2);
  v_cost numeric(15,2);
  v_po purchase_orders%rowtype;
  v_all_received boolean := true;
  v_item_cur record;
begin
  -- คำนวณรหัส RI ใหม่
  begin
    v_grn_no := next_doc_no('RI');
  exception when others then
    v_grn_no := 'RI' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  insert into goods_receipts (grn_no, po_id, received_date)
  values (v_grn_no, p_po_id, current_date)
  returning id into v_grn_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_poi_id := (v_item->>'po_item_id')::uuid;
    v_qty := coalesce((v_item->>'qty_received')::numeric, 0);

    -- ค้นหาราคาต่อหน่วยจากรายการสั่งซื้อ
    select coalesce(unit_price, 0) into v_cost
    from purchase_order_items
    where id = v_poi_id;

    if v_cost is null then
      v_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
    end if;

    insert into goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (
      v_grn_id,
      v_poi_id,
      v_qty,
      coalesce(v_cost, 0)
    );

    -- อัปเดตยอดที่รับแล้วใน purchase_order_items
    update purchase_order_items
    set qty_received = coalesce(qty_received, 0) + v_qty
    where id = v_poi_id;
  end loop;

  -- ตรวจสอบว่ารับของครบทุกรายการแล้วหรือยัง
  for v_item_cur in select quantity, qty_received from purchase_order_items where po_id = p_po_id loop
    if coalesce(v_item_cur.qty_received, 0) < v_item_cur.quantity then
      v_all_received := false;
    end if;
  end loop;

  if v_all_received then
    update purchase_orders set status = 'received' where id = p_po_id;
  else
    update purchase_orders set status = 'partial' where id = p_po_id;
  end if;

  return v_grn_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_goods_receipt(uuid, jsonb) to public, authenticated, anon, service_role;

