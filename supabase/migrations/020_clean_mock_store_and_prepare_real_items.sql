-- ============================================================================
-- MIGRATION 020: ลบข้อมูลจำลองสโตร์ทั้งหมด 100% และสร้างฟังก์ชันลบแบบ Cascade ปลอดภัย
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ฟังก์ชัน RPC: ลบวัสดุ 1 รายการพร้อมเคลียร์ความสัมพันธ์ทั้งหมด (Cascade Delete)
-- ----------------------------------------------------------------------------
create or replace function delete_inventory_item_cascade(p_item_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- ปลดล็อกความสัมพันธ์ในเอกสารจัดซื้อและเสนอราคา
  update purchase_order_items set item_id = null where item_id = p_item_id;
  update quotation_items set item_id = null where item_id = p_item_id;

  -- ลบประวัติการทำรายการสต็อกและล็อตที่ผูกกับสินค้านี้
  delete from stock_issue_items where item_id = p_item_id;
  delete from stock_adjustments where item_id = p_item_id;
  delete from stock_lots where item_id = p_item_id;
  delete from inventory_stock where item_id = p_item_id;

  -- ลบรายการพัสดุ
  delete from inventory_items where id = p_item_id;
end;
$$;

grant execute on function delete_inventory_item_cascade(uuid) to authenticated, anon, service_role, public;

-- ----------------------------------------------------------------------------
-- 2. ฟังก์ชัน RPC: ล้างข้อมูลจำลองในสโตร์ทั้งหมด (Wipe All Mock Store Data)
-- ----------------------------------------------------------------------------
create or replace function clear_mock_store_data()
returns void
language plpgsql
security definer
as $$
begin
  -- ปลดล็อกการเชื่อมโยงทั้งหมด
  update purchase_order_items set item_id = null where item_id is not null;
  update quotation_items set item_id = null where item_id is not null;

  -- ล้างประวัติสต็อกและการเบิกจ่ายจำลองทั้งหมด
  delete from stock_issue_items;
  delete from stock_issues;
  delete from stock_adjustments;
  delete from stock_lots;
  delete from inventory_stock;

  -- ลบรายการวัสดุจำลองทั้งหมดออกจาก inventory_items
  delete from inventory_items;
end;
$$;

grant execute on function clear_mock_store_data() to authenticated, anon, service_role, public;

-- ----------------------------------------------------------------------------
-- 3. เรียกใช้งานล้างข้อมูลจำลองทันที (Execute Wipe)
-- ----------------------------------------------------------------------------
select clear_mock_store_data();

-- ----------------------------------------------------------------------------
-- 4. จัดการหมวดหมู่วัสดุให้สะอาด พร้อมสำหรับเลือกใช้งานจริง
-- ----------------------------------------------------------------------------
delete from item_categories
where name in (
  'ปูน ทราย อิฐ หิน และงานโครงสร้าง',
  'เหล็กและโลหะรูปพรรณ',
  'ประปาและสุขภัณฑ์',
  'สีและเคมีภัณฑ์ก่อสร้าง',
  'ปูน ทราย และคอนกรีต',
  'วัสดุโครงสร้างและเหล็ก',
  'ท่อและฟิตติ้งสุขาภิบาล'
) or code_prefix in ('CV', 'ST', 'PL', 'PT', 'STE', 'CEM');

do $$
begin
  delete from item_categories
  where name in (
    'แผงโซลาร์เซลล์ (Solar Panels)',
    'อินเวอร์เตอร์และระบบกักเก็บ (Inverters & Battery)',
    'อุปกรณ์จับยึดและโครงสร้างราง (Mounting & Hardware)',
    'สายไฟโซล่าเซลล์และขั้วต่อ (Solar Cables & Connectors)',
    'ตู้ควบคุมและระบบป้องกันไฟฟ้า (Switchboards & Protections)',
    'ท่อร้อยสายไฟและรางเดินสาย (Conduits & Cable Trays)',
    'เครื่องมือช่างและอุปกรณ์ความปลอดภัย (Tools & Safety)'
  ) and code_prefix not in ('SOL', 'INV', 'MNT', 'CAB', 'ELC', 'PIP', 'TLS');

  -- 1. SOL
  if exists (select 1 from item_categories where code_prefix = 'SOL') then
    update item_categories set name = 'แผงโซลาร์เซลล์ (Solar Panels)', sort_order = 1 where code_prefix = 'SOL';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('แผงโซลาร์เซลล์ (Solar Panels)', 'SOL', 1);
  end if;

  -- 2. INV
  if exists (select 1 from item_categories where code_prefix = 'INV') then
    update item_categories set name = 'อินเวอร์เตอร์และระบบกักเก็บ (Inverters & Battery)', sort_order = 2 where code_prefix = 'INV';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('อินเวอร์เตอร์และระบบกักเก็บ (Inverters & Battery)', 'INV', 2);
  end if;

  -- 3. MNT
  if exists (select 1 from item_categories where code_prefix = 'MNT') then
    update item_categories set name = 'อุปกรณ์จับยึดและโครงสร้างราง (Mounting & Hardware)', sort_order = 3 where code_prefix = 'MNT';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('อุปกรณ์จับยึดและโครงสร้างราง (Mounting & Hardware)', 'MNT', 3);
  end if;

  -- 4. CAB
  if exists (select 1 from item_categories where code_prefix = 'CAB') then
    update item_categories set name = 'สายไฟโซล่าเซลล์และขั้วต่อ (Solar Cables & Connectors)', sort_order = 4 where code_prefix = 'CAB';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('สายไฟโซล่าเซลล์และขั้วต่อ (Solar Cables & Connectors)', 'CAB', 4);
  end if;

  -- 5. ELC
  if exists (select 1 from item_categories where code_prefix = 'ELC') then
    update item_categories set name = 'ตู้ควบคุมและระบบป้องกันไฟฟ้า (Switchboards & Protections)', sort_order = 5 where code_prefix = 'ELC';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('ตู้ควบคุมและระบบป้องกันไฟฟ้า (Switchboards & Protections)', 'ELC', 5);
  end if;

  -- 6. PIP
  if exists (select 1 from item_categories where code_prefix = 'PIP') then
    update item_categories set name = 'ท่อร้อยสายไฟและรางเดินสาย (Conduits & Cable Trays)', sort_order = 6 where code_prefix = 'PIP';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('ท่อร้อยสายไฟและรางเดินสาย (Conduits & Cable Trays)', 'PIP', 6);
  end if;

  -- 7. TLS
  if exists (select 1 from item_categories where code_prefix = 'TLS') then
    update item_categories set name = 'เครื่องมือช่างและอุปกรณ์ความปลอดภัย (Tools & Safety)', sort_order = 7 where code_prefix = 'TLS';
  else
    insert into item_categories (name, code_prefix, sort_order) values ('เครื่องมือช่างและอุปกรณ์ความปลอดภัย (Tools & Safety)', 'TLS', 7);
  end if;
end $$;
