-- 035_remove_duplicate_stock_lots.sql
-- ลบข้อมูลล็อตพัสดุรับเข้าที่ซ้ำซ้อน 2 รอบ (Duplicate Stock Lots)
-- เกิดจากก่อนหน้านี้เมื่อกดยืนยันรับของเข้าสโตร์ (confirm_goods_receipt) ฟังก์ชันฐานข้อมูลได้บันทึกเข้า stock_lots แล้วรอบที่ 1
-- แต่หน้าบ้าน (PODetail.jsx) ได้เรียก syncItemToStore ซ้ำอีกรอบที่ 2 (ทำให้เกิดล็อตซ้ำที่มี grn_item_id เป็น null)
-- สคริปต์นี้จะลบล็อตที่ซ้ำ และปรับปรุงยอดคงเหลือใน inventory_items ให้ถูกต้อง 100%

-- 1. สร้างตารางชั่วคราวเพื่อเก็บบันทึก ID ของ stock_lots ที่ซ้ำซ้อน
do $$
declare
  v_deleted_count int := 0;
begin
  -- ลบล็อตที่มีคู่แฝด (item_id, qty_received, unit_cost, received_date ตรงกัน)
  -- โดยเลือกลบแถวที่ grn_item_id เป็น null ก่อน หรือแถวที่สร้างขึ้นซ้ำกันในวันเดียวกัน
  with duplicates as (
    select 
      id,
      row_number() over (
        partition by item_id, coalesce(source_project_id, '00000000-0000-0000-0000-000000000000'::uuid), received_date, qty_received, unit_cost
        order by 
          (case when grn_item_id is not null then 0 else 1 end) asc, -- เก็บแถวที่ผูกกับใบรับของ (GRN) ไว้เป็นหลัก
          created_at asc,
          id asc
      ) as rn
    from public.stock_lots
    where lot_type = 'receipt'
  )
  delete from public.stock_lots
  where id in (
    select id from duplicates where rn > 1
  );

  get diagnostics v_deleted_count = row_count;
  raise notice 'ลบรายการสต็อกล็อตที่ซ้ำซ้อนออกจำนวน % รายการ', v_deleted_count;

  -- 2. อัปเดตยอดคงเหลือ (qty_on_hand) และต้นทุนเฉลี่ย (avg_unit_cost) ใน inventory_items ให้ตรงกับล็อตจริง
  update public.inventory_items ii
  set 
    qty_on_hand = coalesce(sub.total_qty, 0),
    avg_unit_cost = coalesce(sub.weighted_avg, ii.avg_unit_cost),
    updated_at = now()
  from (
    select 
      item_id,
      sum(qty_remaining) as total_qty,
      case 
        when sum(qty_remaining) > 0 then round(sum(qty_remaining * unit_cost) / sum(qty_remaining), 2)
        else 0
      end as weighted_avg
    from public.stock_lots
    group by item_id
  ) sub
  where ii.id = sub.item_id;

end $$;

