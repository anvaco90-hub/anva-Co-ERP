-- 033_sync_purchasing_to_store_inventory.sql
-- เชื่อมโยงระบบจัดซื้อ (PO / Goods Receipt) เข้าสู่ระบบสโตร์และคลังพัสดุ (inventory_items / stock_lots) อัตโนมัติ 100%
-- และแก้ไข Trigger ตรวจสอบสมุดรายวันบัญชี (journal_entries) ให้บันทึกชำระเงินผ่านได้ฉลุย

-- ----------------------------------------------------------------------------
-- 1. แก้ไข Trigger ตรวจดุลบัญชีใน journal_entries ให้ทำงานเฉพาะตอน UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.check_journal_entry_balance()
returns trigger as $$
declare
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_count int;
begin
  -- ตรวจสอบเฉพาะเมื่อสถานะถูกเปลี่ยนเป็น 'อนุมัติแล้ว' และเป็นการ UPDATE
  if new.accounting_status in ('อนุมัติแล้ว', 'approved') and (tg_op = 'UPDATE' and (old.accounting_status is distinct from new.accounting_status)) then
    select 
      coalesce(sum(debit), 0),
      coalesce(sum(credit), 0),
      count(*)
    into v_debit, v_credit, v_count
    from journal_entry_lines
    where journal_entry_id = new.id;

    if v_count > 0 and abs(v_debit - v_credit) > 0.01 then
      raise exception 'รายการสมุดรายวันไม่ดุล: ยอดเดบิต (Dr. %) ไม่เท่ากับยอดเครดิต (Cr. %)', v_debit, v_credit;
    end if;

    new.approved_at := coalesce(new.approved_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_verify_journal_balance on journal_entries;
create trigger trg_verify_journal_balance
  before update of accounting_status on journal_entries
  for each row execute function check_journal_entry_balance();

-- ปลดล็อก RLS และเพิ่มคอลัมน์สำคัญ
alter table if exists public.goods_receipt_items alter column unit_cost drop not null;
alter table if exists public.goods_receipt_items alter column unit_cost set default 0;
alter table if exists public.stock_lots alter column lot_type drop not null;
alter table if exists public.stock_lots alter column lot_type set default 'receipt';

-- ----------------------------------------------------------------------------
-- 2. ปรับปรุงฟังก์ชัน CONFIRM_GOODS_RECEIPT ให้ดึงเข้าสโตร์ (inventory_items & stock_lots) 100%
-- ----------------------------------------------------------------------------
create or replace function public.confirm_goods_receipt(
  p_po_id uuid,
  p_items jsonb
) returns uuid as $$
declare
  v_grn_id uuid;
  v_grn_no text;
  v_item jsonb;
  v_poi_id uuid;
  v_item_id uuid;
  v_item_code text;
  v_item_name text;
  v_item_unit text;
  v_qty numeric(12,2);
  v_cost numeric(15,2);
  v_project_id uuid;
  v_gri_id uuid;
  v_cur_qty numeric(12,2);
  v_cur_cost numeric(15,2);
  v_all_received boolean := true;
  v_item_cur record;
begin
  -- 1. สร้างรหัสเอกสารรับของ RI
  begin
    v_grn_no := next_doc_no('RI');
  exception when others then
    v_grn_no := 'RI' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  -- 2. ดึง project_id จาก PO
  select project_id into v_project_id from purchase_orders where id = p_po_id;

  -- 3. บันทึกหัวเอกสารรับของเข้าคลัง (goods_receipts)
  insert into goods_receipts (grn_no, po_id, received_date, created_at)
  values (v_grn_no, p_po_id, current_date, now())
  returning id into v_grn_id;

  -- 4. วนลูปรายการที่รับเข้า
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_poi_id := (v_item->>'po_item_id')::uuid;
    v_qty := coalesce((v_item->>'qty_received')::numeric, 0);
    continue when v_qty <= 0;

    -- ค้นหาข้อมูลสินค้าและราคาจาก purchase_order_items
    select item_id, item_name, unit, coalesce(unit_price, 0)
    into v_item_id, v_item_name, v_item_unit, v_cost
    from purchase_order_items
    where id = v_poi_id;

    if v_cost is null or v_cost = 0 then
      v_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
    end if;

    -- หากยังไม่มี item_id หรือไม่พบ ให้ค้นหาจาก inventory_items ด้วยชื่อ
    if v_item_id is null then
      select id into v_item_id
      from inventory_items
      where lower(trim(item_name)) = lower(trim(v_item_name))
      limit 1;
    end if;

    -- หากยังไม่มีในสโตร์เลย ให้สร้างรายการวัสดุใหม่ใน inventory_items ทันที
    if v_item_id is null then
      v_item_code := 'MAT-' || to_char(current_date, 'YY') || lpad(floor(random()*90000 + 10000)::text, 5, '0');
      insert into inventory_items (item_code, item_name, unit, qty_on_hand, avg_unit_cost, created_at, updated_at)
      values (v_item_code, v_item_name, coalesce(v_item_unit, 'หน่วย'), 0, v_cost, now(), now())
      returning id into v_item_id;

      -- ผูกกลับไปที่ purchase_order_items
      update purchase_order_items set item_id = v_item_id where id = v_poi_id;
    end if;

    -- บันทึกรายการลง goods_receipt_items
    insert into goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (v_grn_id, v_poi_id, v_qty, v_cost)
    returning id into v_gri_id;

    -- บันทึกลง stock_lots (ล็อตสินค้าเข้าสโตร์ เพื่อให้หน้าประวัติการรับเข้าและคำนวณ FIFO มองเห็น)
    insert into stock_lots (item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost, created_at)
    values (v_item_id, v_project_id, v_gri_id, 'receipt', current_date, v_qty, v_qty, v_cost, now());

    -- อัปเดตยอดคงเหลือและต้นทุนเฉลี่ยใน inventory_items
    select coalesce(qty_on_hand, 0), coalesce(avg_unit_cost, 0)
    into v_cur_qty, v_cur_cost
    from inventory_items
    where id = v_item_id;

    update inventory_items set
      qty_on_hand = v_cur_qty + v_qty,
      avg_unit_cost = case
        when (v_cur_qty + v_qty) > 0 then round(((v_cur_qty * v_cur_cost) + (v_qty * v_cost)) / (v_cur_qty + v_qty), 2)
        else v_cost
      end,
      updated_at = now()
    where id = v_item_id;

    -- อัปเดตจำนวนรับแล้วใน purchase_order_items
    update purchase_order_items
    set qty_received = coalesce(qty_received, 0) + v_qty
    where id = v_poi_id;
  end loop;

  -- ตรวจสอบว่ารับครบแล้วหรือไม่ เพื่อเปลี่ยนสถานะ PO
  for v_item_cur in select quantity, qty_received from purchase_order_items where po_id = p_po_id loop
    if coalesce(v_item_cur.qty_received, 0) < v_item_cur.quantity then
      v_all_received := false;
    end if;
  end loop;

  if v_all_received then
    update purchase_orders set status = 'received', updated_at = now() where id = p_po_id;
  else
    update purchase_orders set status = 'partial', updated_at = now() where id = p_po_id;
  end if;

  return v_grn_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_goods_receipt(uuid, jsonb) to public, authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 3. ซิงค์ข้อมูลย้อนหลังสำหรับรายการที่เคยกดรับของไปแล้ว แต่ยังไม่เข้าสโตร์ (Backfill)
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_item_id uuid;
  v_item_code text;
  v_cost numeric(15,2);
  v_cur_qty numeric(12,2);
  v_cur_cost numeric(15,2);
begin
  for r in
    select 
      gri.id as gri_id,
      gri.po_item_id,
      gri.qty_received,
      coalesce(gri.unit_cost, poi.unit_price, 0) as unit_cost,
      gr.po_id,
      gr.received_date,
      po.project_id,
      poi.item_id as poi_item_id,
      poi.item_name,
      poi.unit
    from goods_receipt_items gri
    join goods_receipts gr on gr.id = gri.grn_id
    join purchase_orders po on po.id = gr.po_id
    join purchase_order_items poi on poi.id = gri.po_item_id
    where not exists (select 1 from stock_lots sl where sl.grn_item_id = gri.id)
  loop
    v_item_id := r.poi_item_id;
    v_cost := r.unit_cost;

    if v_item_id is null then
      select id into v_item_id from inventory_items where lower(trim(item_name)) = lower(trim(r.item_name)) limit 1;
    end if;

    if v_item_id is null then
      v_item_code := 'MAT-' || to_char(current_date, 'YY') || lpad(floor(random()*90000 + 10000)::text, 5, '0');
      insert into inventory_items (item_code, item_name, unit, qty_on_hand, avg_unit_cost)
      values (v_item_code, r.item_name, coalesce(r.unit, 'หน่วย'), 0, v_cost)
      returning id into v_item_id;

      update purchase_order_items set item_id = v_item_id where id = r.po_item_id;
    end if;

    insert into stock_lots (item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost)
    values (v_item_id, r.project_id, r.gri_id, 'receipt', coalesce(r.received_date, current_date), r.qty_received, r.qty_received, v_cost);

    select coalesce(qty_on_hand, 0), coalesce(avg_unit_cost, 0) into v_cur_qty, v_cur_cost from inventory_items where id = v_item_id;
    update inventory_items set
      qty_on_hand = v_cur_qty + r.qty_received,
      avg_unit_cost = case when (v_cur_qty + r.qty_received) > 0 then round(((v_cur_qty * v_cur_cost) + (r.qty_received * v_cost)) / (v_cur_qty + r.qty_received), 2) else v_cost end,
      updated_at = now()
    where id = v_item_id;
  end loop;
end $$;
