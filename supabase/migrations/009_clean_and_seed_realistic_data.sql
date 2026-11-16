-- ============================================================
-- ANVA & CO., LTD. - All-in-One Master Setup & Seed Script
-- สร้างโครงสร้างตารางที่จำเป็น + ล้างข้อมูลเดิม + ใส่ข้อมูลจำลอง 10 ตาราง
-- ============================================================

-- ------------------------------------------------------------
-- ขั้นตอนที่ 0: ตรวจสอบและสร้างคอลัมน์/ตารางที่จำเป็นให้อัตโนมัติ
-- ------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  customer_name text not null,
  tax_id text,
  branch_type text default 'head_office',
  branch_no text default '00000',
  address text,
  postal_code text,
  contact_person text,
  phone text,
  email text,
  created_at timestamptz default now()
);

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text unique not null,
  issue_date date not null default current_date,
  validity_days int default 30,
  expiry_date date,
  sales_person text,
  currency text default 'THB',
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_address text,
  customer_postal_code text,
  customer_tax_id text,
  customer_branch text default 'สำนักงานใหญ่',
  project_id uuid references projects(id),
  ref_no text,
  warehouse_name text default 'สโตร์หลัก',
  subtotal numeric(15,2) default 0,
  discount_amount numeric(15,2) default 0,
  after_discount numeric(15,2) default 0,
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) default 0,
  wht_rate numeric(5,2) default 0.00,
  wht_amount numeric(15,2) default 0,
  grand_total numeric(15,2) default 0,
  customer_notes text,
  internal_notes text,
  signature_url text,
  attachment_url text,
  status text default 'draft',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  item_id uuid references inventory_items(id),
  item_name text not null,
  description text,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text,
  unit_price numeric(15,2) not null default 0,
  discount_percent numeric(5,2) default 0,
  total_amount numeric(15,2) not null default 0
);

-- เพิ่มคอลัมน์รหัสย่อหมวดหมู่ และรูปภาพ
alter table item_categories add column if not exists code_prefix text;
alter table inventory_items add column if not exists image_url text;

-- ปลดล็อก project_id
alter table purchase_requisitions alter column project_id drop not null;
alter table purchase_orders alter column project_id drop not null;
alter table stock_lots alter column source_project_id drop not null;

-- RLS permissions
alter table customers enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;

drop policy if exists "read_customers" on customers;
drop policy if exists "write_customers" on customers;
create policy "read_customers" on customers for select using (get_my_role() is not null);
create policy "write_customers" on customers for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

drop policy if exists "read_quotations" on quotations;
drop policy if exists "write_quotations" on quotations;
create policy "read_quotations" on quotations for select using (get_my_role() is not null);
create policy "write_quotations" on quotations for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

drop policy if exists "read_quotation_items" on quotation_items;
drop policy if exists "write_quotation_items" on quotation_items;
create policy "read_quotation_items" on quotation_items for select using (get_my_role() is not null);
create policy "write_quotation_items" on quotation_items for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

-- ------------------------------------------------------------
-- ขั้นตอนที่ 1: ล้างข้อมูลเดิมทั้งหมด (Clean Up Old Records)
-- ------------------------------------------------------------
truncate table
  quotation_items,
  quotations,
  stock_issue_items,
  stock_issues,
  stock_adjustments,
  stock_lots,
  goods_receipt_items,
  goods_receipts,
  purchase_order_items,
  purchase_orders,
  purchase_requisition_items,
  purchase_requisitions,
  journal_entry_lines,
  journal_entries,
  inventory_items,
  item_categories,
  vendors,
  projects,
  customers
cascade;

-- ------------------------------------------------------------
-- ตารางที่ 1: item_categories (หมวดหมู่วัสดุ 6 หมวดหลัก พร้อม Prefix)
-- ------------------------------------------------------------
insert into item_categories (id, name, code_prefix, sort_order) values
  ('c1111111-1111-1111-1111-111111111101', 'โซล่าเซลล์และพลังงานทางเลือก', 'SL', 1),
  ('c1111111-1111-1111-1111-111111111102', 'ระบบไฟฟ้าและสื่อสาร', 'EL', 2),
  ('c1111111-1111-1111-1111-111111111103', 'ปูน ทราย อิฐ หิน และงานโครงสร้าง', 'CV', 3),
  ('c1111111-1111-1111-1111-111111111104', 'เหล็กและโลหะรูปพรรณ', 'ST', 4),
  ('c1111111-1111-1111-1111-111111111105', 'ประปาและสุขภัณฑ์', 'PL', 5),
  ('c1111111-1111-1111-1111-111111111106', 'สีและเคมีภัณฑ์ก่อสร้าง', 'PT', 6);

-- ------------------------------------------------------------
-- ตารางที่ 2: inventory_items (ทะเบียนวัสดุกลาง 12 รายการสมจริง)
-- ------------------------------------------------------------
insert into inventory_items (id, item_code, item_name, unit, category_id, qty_on_hand, avg_unit_cost, reorder_point) values
  ('a1111111-0000-0000-0000-000000000001', 'SL-0001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 'แผง', 'c1111111-1111-1111-1111-111111111101', 120, 3450.00, 20),
  ('a1111111-0000-0000-0000-000000000002', 'SL-0002', 'อินเวอร์เตอร์ Huawei SUN2000-50KTL-M3 (50kW)', 'เครื่อง', 'c1111111-1111-1111-1111-111111111101', 4, 72000.00, 2),
  ('a1111111-0000-0000-0000-000000000003', 'EL-0001', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm. (100ม.)', 'ม้วน', 'c1111111-1111-1111-1111-111111111102', 15, 1850.00, 5),
  ('a1111111-0000-0000-0000-000000000004', 'EL-0002', 'ท่อร้อยสายไฟเหล็ก EMT 3/4 นิ้ว x 3 ม.', 'เส้น', 'c1111111-1111-1111-1111-111111111102', 250, 145.00, 50),
  ('a1111111-0000-0000-0000-000000000005', 'EL-0003', 'ตู้สวิตช์บอร์ด MDB 3 Phase เมนเบรกเกอร์ 250A', 'ตู้', 'c1111111-1111-1111-1111-111111111102', 2, 28500.00, 1),
  ('a1111111-0000-0000-0000-000000000006', 'CV-0001', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 'ถุง', 'c1111111-1111-1111-1111-111111111103', 300, 165.00, 100),
  ('a1111111-0000-0000-0000-000000000007', 'CV-0002', 'ทรายหยาบงานโครงสร้าง', 'คิว', 'c1111111-1111-1111-1111-111111111103', 45, 480.00, 15),
  ('a1111111-0000-0000-0000-000000000008', 'CV-0003', 'อิฐมวลเบา Q-CON ขนาด 7.5x20x60 ซม.', 'ก้อน', 'c1111111-1111-1111-1111-111111111103', 1200, 24.00, 300),
  ('a1111111-0000-0000-0000-000000000009', 'ST-0001', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 'เส้น', 'c1111111-1111-1111-1111-111111111104', 180, 245.00, 50),
  ('a1111111-0000-0000-0000-000000000010', 'PL-0001', 'ท่อ PVC สีฟ้า ท่อน้ำไทย ขนาด 2 นิ้ว ชั้น 8.5 (4ม.)', 'เส้น', 'c1111111-1111-1111-1111-111111111105', 80, 195.00, 20),
  ('a1111111-0000-0000-0000-000000000011', 'PT-0001', 'สีรองพื้นปูนใหม่กันด่าง TOA 4Seasons (5 แกลลอน)', 'ถัง', 'c1111111-1111-1111-1111-111111111106', 18, 1250.00, 5),
  ('a1111111-0000-0000-0000-000000000012', 'EL-0004', 'หลอดไฟ LED T8 18W แสงขาว Daylight ฟิลิปส์', 'หลอด', 'c1111111-1111-1111-1111-111111111102', 8, 85.00, 30);

-- ------------------------------------------------------------
-- ตารางที่ 3: vendors (ร้านค้า / ผู้จำหน่าย 5 เจ้า)
-- ------------------------------------------------------------
insert into vendors (id, vendor_code, vendor_name, contact_person, phone, tax_id, address) values
  ('b1111111-0000-0000-0000-000000000001', 'V-0001', 'SCG Home Solution (สาขาชัยพฤกษ์)', 'คุณมนัส', '02-555-1234', '0105538012345', '99/1 ถ.ชัยพฤกษ์ ต.บางพลับ อ.ปากเกร็ด จ.นนทบุรี 11120'),
  ('b1111111-0000-0000-0000-000000000002', 'V-0002', 'ไทวัสดุ (สาขาบางบัวทอง)', 'ฝ่ายขายโครงการ', '02-920-5678', '0105553018899', '88 หมู่ 3 ถ.กาญจนาภิเษก ต.บางบัวทอง จ.นนทบุรี 11110'),
  ('b1111111-0000-0000-0000-000000000003', 'V-0003', 'บริษัท บางกอก โซล่า ซัพพลาย จำกัด', 'คุณธนากร', '02-888-9900', '0105562088771', '120/5 ถ.ร่มเกล้า แขวงคลองสามประเวศ เขตลาดกระบัง กรุงเทพฯ 10520'),
  ('b1111111-0000-0000-0000-000000000004', 'V-0004', 'ห้างหุ้นส่วนจำกัด สหภัณฑ์การไฟฟ้า', 'คุณสมบูรณ์', '02-432-8765', '0103541005544', '45/8 ถ.เพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพฯ 10160'),
  ('b1111111-0000-0000-0000-000000000005', 'V-0005', 'ร้าน ช.รุ่งเรือง ฮาร์ดแวร์ & คอนสตรัคชั่น', 'เจ๊ดา', '081-445-6789', '3100500891234', '12/3 หมู่ 5 ต.เสาธงหิน อ.บางใหญ่ จ.นนทบุรี 11140');

-- ------------------------------------------------------------
-- ตารางที่ 4: projects (โครงการก่อสร้าง 4 โครงการ)
-- ------------------------------------------------------------
insert into projects (id, project_code, project_name, client_name, site_address, budget_total, start_date, end_date, status) values
  ('d1111111-0000-0000-0000-000000000001', 'PRJ-2026-001', 'โครงการติดตั้ง Solar Rooftop 120 kWp โรงงาน CPF สระบุรี', 'บมจ. เจริญโภคภัณฑ์อาหาร', 'นิคมอุตสาหกรรมแก่งคอย จ.สระบุรี', 3500000.00, '2026-01-15', '2026-05-30', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000002', 'PRJ-2026-002', 'โครงการก่อสร้างอาคารสำนักงานและคลังสินค้า บจก. ไทยรุ่งพัฒนา', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', 'ถ.บางนา-ตราด กม.19 อ.บางพลี จ.สมุทรปราการ', 12500000.00, '2026-02-01', '2026-10-31', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000003', 'PRJ-2026-003', 'โครงการปรับปรุงระบบไฟฟ้าและตู้ MDB รพ. ธนบุรี 2', 'บริษัท โรงพยาบาลธนบุรี 2 จำกัด', 'ถ.บรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพฯ', 1850000.00, '2026-03-01', '2026-06-30', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000004', 'PRJ-2026-004', 'โครงการปรับปรุงระบบประปา คอนโดมิเนียม ดิ แอร์เรียส', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', 'ถ.สุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ', 850000.00, '2026-03-10', '2026-04-30', 'planning');

-- ------------------------------------------------------------
-- ตารางที่ 5: customers (ลูกค้าบริษัท 4 ราย สำหรับใบเสนอราคา)
-- ------------------------------------------------------------
insert into customers (id, customer_code, customer_name, tax_id, branch_type, branch_no, address, postal_code, contact_person, phone, email) values
  ('e1111111-0000-0000-0000-000000000001', 'CUST-0001', 'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)', '0107537000246', 'head_office', '00000', '313 อาคารซี.พี.ทาวเวอร์ ถ.สีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร', '10500', 'คุณวิศรุต (ฝ่ายจัดซื้อโครงการ)', '02-766-8000', 'purchase@cpf.co.th'),
  ('e1111111-0000-0000-0000-000000000002', 'CUST-0002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', 'branch', '00001', '88/2 หมู่ 4 นิคมอุตสาหกรรมบางพลี ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ', '10570', 'คุณเกียรติศักดิ์', '02-315-4422', 'kiattisak@thairung.co.th'),
  ('e1111111-0000-0000-0000-000000000003', 'CUST-0003', 'บริษัท โรงพยาบาลธนบุรี 2 จำกัด', '0105536009871', 'head_office', '00000', '43/4 ถ.บรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพมหานคร', '10170', 'ฝ่ายอาคารสถานที่', '02-487-2100', 'facility@thonburi2.com'),
  ('e1111111-0000-0000-0000-000000000004', 'CUST-0004', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', '0994000187654', 'head_office', '00000', '155 ซอยสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร', '10110', 'ผู้จัดการนิติบุคคล', '02-711-3322', 'juristic@thearies.co.th');

-- ------------------------------------------------------------
-- ตารางที่ 6: purchase_requisitions & pr_items (ใบขอซื้อ PR 3 ฉบับ)
-- ------------------------------------------------------------
insert into purchase_requisitions (id, pr_no, project_id, request_date, status, created_at) values
  ('f1111111-0000-0000-0000-000000000001', 'PR202611-0001', 'd1111111-0000-0000-0000-000000000001', '2026-11-01', 'ordered', '2026-11-01 09:30:00+07'),
  ('f1111111-0000-0000-0000-000000000002', 'PR202611-0002', 'd1111111-0000-0000-0000-000000000002', '2026-11-03', 'ordered', '2026-11-03 11:15:00+07'),
  ('f1111111-0000-0000-0000-000000000003', 'PR202611-0003', 'd1111111-0000-0000-0000-000000000004', '2026-11-10', 'pending', '2026-11-10 14:00:00+07');

insert into purchase_requisition_items (id, pr_id, item_name, quantity, unit, estimated_price) values
  ('f1111111-1111-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 120, 'แผง', 3450.00),
  ('f1111111-1111-0000-0000-000000000002', 'f1111111-0000-0000-0000-000000000001', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm.', 15, 'ม้วน', 1850.00),
  ('f1111111-1111-0000-0000-000000000003', 'f1111111-0000-0000-0000-000000000002', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 300, 'ถุง', 165.00),
  ('f1111111-1111-0000-0000-000000000004', 'f1111111-0000-0000-0000-000000000002', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 180, 'เส้น', 245.00),
  ('f1111111-1111-0000-0000-000000000005', 'f1111111-0000-0000-0000-000000000003', 'หลอดไฟ LED T8 18W แสงขาว Daylight ฟิลิปส์', 50, 'หลอด', 85.00);

-- ------------------------------------------------------------
-- ตารางที่ 7: purchase_orders & po_items (ใบสั่งซื้อ PO 3 ฉบับ)
-- ------------------------------------------------------------
-- Ensure payment and tax columns exist even if migration 007 has not been run.
alter table purchase_orders add column if not exists payment_type text default 'credit_30';
alter table purchase_orders add column if not exists payment_term_days int default 30;
alter table purchase_orders add column if not exists quotation_no text;
alter table purchase_orders add column if not exists quotation_date date;
alter table purchase_orders add column if not exists quotation_url text;
alter table purchase_orders add column if not exists tax_type text default 'vat_included';
alter table purchase_orders add column if not exists vat_rate numeric(5,2) default 7.00;
alter table purchase_orders add column if not exists vat_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists wht_rate numeric(5,2) default 0.00;
alter table purchase_orders add column if not exists wht_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists net_amount numeric(15,2) default 0;

insert into purchase_orders (
  id, po_no, pr_id, project_id, vendor_id, order_date, total_amount, status,
  payment_type, payment_term_days, quotation_no, quotation_date, tax_type, vat_rate, vat_amount, wht_rate, wht_amount, net_amount
) values
  ('ba111111-0000-0000-0000-000000000001', 'PO202611-0001', 'f1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000003', '2026-11-02', 441750.00, 'received', 'credit_30', 30, 'QT-BKK-9821', '2026-10-28', 'vat_excluded', 7.00, 30922.50, 0.00, 0.00, 472672.50),
  ('ba111111-0000-0000-0000-000000000002', 'PO202611-0002', 'f1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000002', 'b1111111-0000-0000-0000-000000000001', '2026-11-04', 93600.00, 'open', 'credit_60', 60, 'SCG-QT-202611', '2026-11-01', 'vat_included', 7.00, 6123.36, 0.00, 0.00, 93600.00),
  ('ba111111-0000-0000-0000-000000000003', 'PO202611-0003', 'f1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000004', 'b1111111-0000-0000-0000-000000000002', '2026-11-05', 12840.00, 'received', 'cash', 0, null, null, 'vat_included', 7.00, 840.00, 0.00, 0.00, 12840.00);

insert into purchase_order_items (id, po_id, item_id, item_name, quantity, unit, unit_price, qty_received) values
  ('ba111111-1111-0000-0000-000000000001', 'ba111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 120, 'แผง', 3450.00, 120),
  ('ba111111-1111-0000-0000-000000000002', 'ba111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000003', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm.', 15, 'ม้วน', 1850.00, 15),
  ('ba111111-1111-0000-0000-000000000003', 'ba111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000006', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 300, 'ถุง', 165.00, 0),
  ('ba111111-1111-0000-0000-000000000004', 'ba111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000009', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 180, 'เส้น', 245.00, 0),
  ('ba111111-1111-0000-0000-000000000005', 'ba111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000004', 'ท่อร้อยสายไฟเหล็ก EMT 3/4 นิ้ว x 3 ม.', 80, 'เส้น', 145.00, 80);

-- ------------------------------------------------------------
-- ตารางที่ 8: goods_receipts & goods_receipt_items (ใบตรวจรับของเข้าสโตร์ 2 ฉบับ)
-- ------------------------------------------------------------
insert into goods_receipts (id, grn_no, po_id, received_date) values
  ('ca111111-0000-0000-0000-000000000001', 'GRN202611-0001', 'ba111111-0000-0000-0000-000000000001', '2026-11-04'),
  ('ca111111-0000-0000-0000-000000000002', 'GRN202611-0002', 'ba111111-0000-0000-0000-000000000003', '2026-11-06');

insert into goods_receipt_items (id, grn_id, po_item_id, qty_received, unit_cost) values
  ('ca111111-1111-0000-0000-000000000001', 'ca111111-0000-0000-0000-000000000001', 'ba111111-1111-0000-0000-000000000001', 120, 3450.00),
  ('ca111111-1111-0000-0000-000000000002', 'ca111111-0000-0000-0000-000000000001', 'ba111111-1111-0000-0000-000000000002', 15, 1850.00),
  ('ca111111-1111-0000-0000-000000000003', 'ca111111-0000-0000-0000-000000000002', 'ba111111-1111-0000-0000-000000000005', 80, 145.00);

insert into stock_lots (id, item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost) values
  ('da111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 'ca111111-1111-0000-0000-000000000001', 'receipt', '2026-11-04', 120, 120, 3450.00),
  ('da111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001', 'ca111111-1111-0000-0000-000000000002', 'receipt', '2026-11-04', 15, 15, 1850.00),
  ('da111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000004', 'd1111111-0000-0000-0000-000000000004', 'ca111111-1111-0000-0000-000000000003', 'receipt', '2026-11-06', 80, 80, 145.00);

-- ------------------------------------------------------------
-- ตารางที่ 9: stock_issues & stock_issue_items (การเบิกวัสดุเข้าหน้างาน 2 ฉบับ)
-- ------------------------------------------------------------
insert into stock_issues (id, issue_no, project_id, issue_date, notes) values
  ('ea111111-0000-0000-0000-000000000001', 'ISS202611-0001', 'd1111111-0000-0000-0000-000000000001', '2026-11-07', 'เบิกแผงโซล่าเซลล์และสายไฟชุดแรก เพื่อเตรียมติดตั้งโครงสร้างหลังคา'),
  ('ea111111-0000-0000-0000-000000000002', 'ISS202611-0002', 'd1111111-0000-0000-0000-000000000002', '2026-11-08', 'เบิกท่อ EMT เดินระบบไฟฟ้าในสำนักงานชั่วคราว');

insert into stock_issue_items (id, issue_id, item_id, quantity, unit_cost) values
  ('ea111111-1111-0000-0000-000000000001', 'ea111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 40, 3450.00),
  ('ea111111-1111-0000-0000-000000000002', 'ea111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000003', 5, 1850.00),
  ('ea111111-1111-0000-0000-000000000003', 'ea111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000004', 30, 145.00);

-- ------------------------------------------------------------
-- ตารางที่ 10: quotations & quotation_items (ใบเสนอราคา 3 ฉบับ)
-- ------------------------------------------------------------
insert into quotations (
  id, quotation_no, issue_date, validity_days, expiry_date, sales_person, currency,
  customer_id, customer_name, customer_address, customer_postal_code, customer_tax_id, customer_branch,
  project_id, ref_no, warehouse_name, subtotal, discount_amount, after_discount, vat_rate, vat_amount,
  wht_rate, wht_amount, grand_total, customer_notes, internal_notes, status
) values
  (
    'fa111111-0000-0000-0000-000000000001',
    'QT2026110001',
    '2026-11-01',
    30,
    '2026-12-01',
    'มาเรียม จะปะกียา',
    'THB',
    'e1111111-0000-0000-0000-000000000001',
    'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)',
    '313 อาคารซี.พี.ทาวเวอร์ ถ.สีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร',
    '10500',
    '0107537000246',
    'สำนักงานใหญ่',
    'd1111111-0000-0000-0000-000000000001',
    'CPF-SR-2026',
    'สโตร์หลัก (Main Store)',
    2400000.00,
    100000.00,
    2300000.00,
    7.00,
    161000.00,
    0.00,
    0.00,
    2461000.00,
    '1. ยืนราคา 30 วันนับจากวันที่เสนอราคา
2. กำหนดส่งมอบและติดตั้งแล้วเสร็จภายใน 60 วันหลังลงนามในสัญญา
3. การชำระเงิน: งวดที่ 1 มัดจำ 30%, งวดที่ 2 ส่งของครบ 40%, งวดที่ 3 ส่งมอบงาน 30%',
    'ลูกค้ารายใหญ่ ประสานงานผ่านคุณวิศรุต อนุมัติงบเรียบร้อยแล้ว',
    'approved'
  ),
  (
    'fa111111-0000-0000-0000-000000000002',
    'QT2026110002',
    '2026-11-05',
    15,
    '2026-11-20',
    'มาเรียม จะปะกียา',
    'THB',
    'e1111111-0000-0000-0000-000000000003',
    'บริษัท โรงพยาบาลธนบุรี 2 จำกัด',
    '43/4 ถ.บรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพมหานคร',
    '10170',
    '0105536009871',
    'สำนักงานใหญ่',
    'd1111111-0000-0000-0000-000000000003',
    'TH2-ELEC-01',
    'สโตร์หลัก (Main Store)',
    600000.00,
    0.00,
    600000.00,
    7.00,
    42000.00,
    0.00,
    0.00,
    642000.00,
    '1. กำหนดยืนราคา 15 วัน
2. รับประกันงานติดตั้งระบบไฟฟ้าและตู้ MDB 2 ปีเต็ม
3. เครดิตเทอม 30 วันหลังตรวจรับงาน',
    'ส่งเอกสารให้คณะกรรมการโรงพยาบาลพิจารณาแล้ว รอผลการประชุมบอร์ด',
    'sent'
  ),
  (
    'fa111111-0000-0000-0000-000000000003',
    'QT2026110003',
    '2026-11-09',
    30,
    '2026-12-09',
    'มาเรียม จะปะกียา',
    'THB',
    'e1111111-0000-0000-0000-000000000002',
    'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด',
    '88/2 นิคมอุตสาหกรรมบางพลี ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ',
    '10570',
    '0105558012345',
    'สาขา 00001',
    'd1111111-0000-0000-0000-000000000002',
    'TRP-WH-EXT',
    'คลังสินค้าส่วนกลาง (HQ)',
    360000.00,
    0.00,
    360000.00,
    7.00,
    25200.00,
    0.00,
    0.00,
    385200.00,
    '1. ยืนราคา 30 วัน
2. งานเทพื้นคอนกรีตและเหล็กโครงสร้างคลังสินค้าส่วนต่อขยาย',
    'ร่างเอกสารเตรียมส่งลูกค้าสัปดาห์หน้า',
    'draft'
  );

insert into quotation_items (id, quotation_id, item_id, item_name, description, quantity, unit, unit_price, discount_percent, total_amount) values
  ('fa111111-1111-0000-0000-000000000001', 'fa111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 'รับประกันประสิทธิภาพ 25 ปี แบรนด์ Tier 1 สากล', 500, 'แผง', 3800.00, 0, 1900000.00),
  ('fa111111-1111-0000-0000-000000000002', 'fa111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000002', 'อินเวอร์เตอร์ Huawei SUN2000-50KTL-M3 (50kW)', 'ระบบ On-grid พร้อมอุปกรณ์ Smart Dongle และกันไฟย้อน', 2, 'เครื่อง', 85000.00, 0, 170000.00),
  ('fa111111-1111-0000-0000-000000000003', 'fa111111-0000-0000-0000-000000000001', null, 'ค่าติดตั้งโครงสร้าง Mounting อะลูมิเนียม และเดินสายระบบ AC/DC', 'รวมอุปกรณ์จับยึดหลังคาเมทัลชีทและตู้ Combiner Box', 1, 'งาน', 330000.00, 0, 330000.00),
  ('fa111111-1111-0000-0000-000000000004', 'fa111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000005', 'ตู้สวิตช์บอร์ด MDB 3 Phase เมนเบรกเกอร์ 250A', 'ตู้สวิตช์บอร์ด Schneider IP54 พ่นสีกันฝุ่นมาตรฐานโรงพยาบาล', 2, 'ตู้', 35000.00, 0, 70000.00),
  ('fa111111-1111-0000-0000-000000000005', 'fa111111-0000-0000-0000-000000000002', null, 'งานปรับปรุงสายป้อนเมนและระบบกราวด์ทองแดงบริสุทธิ์', 'รวมงานทดสอบค่าความต้านทานดิน (Ground Test < 5 โอห์ม)', 1, 'งาน', 530000.00, 0, 530000.00),
  ('fa111111-1111-0000-0000-000000000006', 'fa111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000006', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 'งานเทพื้นคอนกรีตเสริมเหล็กหนา 15 ซม.', 600, 'ถุง', 170.00, 0, 102000.00),
  ('fa111111-1111-0000-0000-000000000007', 'fa111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000009', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 'เหล็กตะแกรงเสริมแรงพื้นคลังสินค้า', 400, 'เส้น', 255.00, 0, 102000.00),
  ('fa111111-1111-0000-0000-000000000008', 'fa111111-0000-0000-0000-000000000003', null, 'ค่าแรงงานเทคอนกรีต ขัดมันพื้น และตัด Joint ยาซิลิโคน', 'พื้นที่รวม 400 ตร.ม.', 1, 'งาน', 156000.00, 0, 156000.00);

notify pgrst, 'reload schema';
