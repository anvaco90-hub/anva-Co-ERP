-- ============================================================================
-- MIGRATION 027: REALISTIC SALES & PURCHASING SIMULATION SEED DATA (BULLETPROOF)
-- จำลองข้อมูลครบวงจร: ใบเสนอราคา (Quotation) -> ลูกค้าเซ็น PO -> ขอซื้อ (PR) -> สั่งซื้อ (PO) -> กำหนดส่ง (Due Date) -> ตรวจรับ (GR)
-- ============================================================================

-- ============================================================================
-- เฟสที่ 1 (DDL Phase): สร้างตารางและเพิ่มคอลัมน์ทั้งหมดที่จำเป็นก่อน 100%
-- ป้องกัน Error: column "..." does not exist
-- ============================================================================

-- 0. projects (โครงการ)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS site_address text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS budget_total numeric(15,2) DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'in_progress';

-- 1. purchase_orders & purchase_order_items
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_term_days int default 30;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quotation_no text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quotation_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tax_type text default 'vat_included';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) default 7.00;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS vat_amount numeric(15,2) default 0;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS qty_received numeric(12,2) DEFAULT 0;

-- 2. purchase_requisitions & items
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_requisition_items ADD COLUMN IF NOT EXISTS estimated_price numeric(15,2) DEFAULT 0;

-- 3. quotations & quotation_items
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_po_no text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_po_date date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_po_file_url text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_signer_name text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS quotation_date date DEFAULT current_date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS issue_date date DEFAULT current_date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS grand_total numeric(15,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_notes text;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;

-- 4. customers & vendors
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_name text;

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS vendor_code text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS vendor_name text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;

-- 5. goods_receipts & goods_receipt_items (ตรวจรับของเข้า)
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS received_by uuid;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS attachments jsonb default '[]';
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS created_at timestamptz default now();

ALTER TABLE public.goods_receipt_items ADD COLUMN IF NOT EXISTS po_item_id uuid;
ALTER TABLE public.goods_receipt_items ADD COLUMN IF NOT EXISTS unit_cost numeric(15,2) default 0;

-- 6. boqs and boq_items (ตาราง BOQ สำหรับจำลองข้อมูล)
CREATE TABLE IF NOT EXISTS public.boqs (
  id uuid primary key default gen_random_uuid(),
  boq_no text unique not null,
  title text not null,
  project_id uuid,
  customer_name text,
  system_size_kwp numeric(10,2) default 0,
  status text not null default 'draft',
  total_material_cost numeric(15,2) default 0,
  total_labor_cost numeric(15,2) default 0,
  total_cost numeric(15,2) default 0,
  markup_percent numeric(5,2) default 15.00,
  markup_amount numeric(15,2) default 0,
  grand_total numeric(15,2) default 0,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.boq_items (
  id uuid primary key default gen_random_uuid(),
  boq_id uuid not null references public.boqs(id) on delete cascade,
  category text not null default 'แผงโซล่าเซลล์',
  item_code text,
  item_name text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit text default 'ชุด',
  material_unit_cost numeric(15,2) default 0,
  labor_unit_cost numeric(15,2) default 0,
  total_material_cost numeric(15,2) default 0,
  total_labor_cost numeric(15,2) default 0,
  total_amount numeric(15,2) default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================================
-- เฟสที่ 2 (DML Phase): ป้อนข้อมูลจำลองครบวงจร (จัดซื้อ + ใบเสนอราคา + ลูกค้าเซ็น PO + BOQ)
-- ============================================================================

DO $$
DECLARE
  v_user_id uuid;
  v_prj1_id uuid;
  v_prj2_id uuid;
  v_prj3_id uuid;

  v_cust1_id uuid;
  v_cust2_id uuid;
  v_cust3_id uuid;

  v_vend1_id uuid;
  v_vend2_id uuid;
  v_vend3_id uuid;

  v_boq1_id uuid;
  v_qt1_id uuid;
  v_qt2_id uuid;
  v_qt3_id uuid;

  v_pr1_id uuid;
  v_pr2_id uuid;
  v_pr3_id uuid;
  v_pr1_item1_id uuid;
  v_pr1_item2_id uuid;

  v_po1_id uuid;
  v_po2_id uuid;
  v_po3_id uuid;
  v_po4_id uuid;

  v_gr1_id uuid;
BEGIN
  -- 1. หา User ID สำหรับ created_by
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- 2. รับประกันโครงการ (Projects)
  SELECT id INTO v_prj1_id FROM public.projects WHERE project_code = 'PRJ-2026-001' LIMIT 1;
  IF v_prj1_id IS NULL THEN
    INSERT INTO public.projects (project_code, project_name, client_name, site_address, budget_total, start_date, end_date, status)
    VALUES ('PRJ-2026-001', 'โครงการติดตั้ง Solar Rooftop 120 kWp โรงงาน CPF สระบุรี', 'บมจ. เจริญโภคภัณฑ์อาหาร', 'นิคมอุตสาหกรรมแก่งคอย จ.สระบุรี', 3500000.00, '2026-01-15', '2026-05-30', 'in_progress')
    RETURNING id INTO v_prj1_id;
  END IF;

  SELECT id INTO v_prj2_id FROM public.projects WHERE project_code = 'PRJ-2026-002' LIMIT 1;
  IF v_prj2_id IS NULL THEN
    INSERT INTO public.projects (project_code, project_name, client_name, site_address, budget_total, start_date, end_date, status)
    VALUES ('PRJ-2026-002', 'โครงการก่อสร้างอาคารสำนักงานและคลังสินค้า บจก. ไทยรุ่งพัฒนา', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', 'ถ.บางนา-ตราด กม.19 อ.บางพลี จ.สมุทรปราการ', 12500000.00, '2026-02-01', '2026-10-31', 'in_progress')
    RETURNING id INTO v_prj2_id;
  END IF;

  SELECT id INTO v_prj3_id FROM public.projects WHERE project_code = 'PRJ-2026-003' LIMIT 1;
  IF v_prj3_id IS NULL THEN
    INSERT INTO public.projects (project_code, project_name, client_name, site_address, budget_total, start_date, end_date, status)
    VALUES ('PRJ-2026-003', 'โครงการปรับปรุงระบบไฟฟ้าและตู้ MDB รพ. ธนบุรี 2', 'บริษัท โรงพยาบาลธนบุรี 2 จำกัด', 'ถ.บรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพฯ', 1850000.00, '2026-03-01', '2026-06-30', 'in_progress')
    RETURNING id INTO v_prj3_id;
  END IF;

  -- 3. รับประกันลูกค้า (Customers)
  SELECT id INTO v_cust1_id FROM public.customers WHERE customer_code = 'CUST-001' LIMIT 1;
  IF v_cust1_id IS NULL THEN
    INSERT INTO public.customers (customer_code, customer_name, tax_id, address, phone, contact_person)
    VALUES ('CUST-001', 'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)', '0107537000249', '313 อาคารซี.พี.ทาวเวอร์ ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500', '02-766-8000', 'คุณประสิทธิ์ เจริญกิจการ (ฝ่ายวิศวกรรมอาคาร)')
    RETURNING id INTO v_cust1_id;
  END IF;

  SELECT id INTO v_cust2_id FROM public.customers WHERE customer_code = 'CUST-002' LIMIT 1;
  IF v_cust2_id IS NULL THEN
    INSERT INTO public.customers (customer_code, customer_name, tax_id, address, phone, contact_person)
    VALUES ('CUST-002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', '88 หมู่ 7 ถ.บางนา-ตราด ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540', '02-316-9900', 'คุณวิชัย รุ่งพัฒนา (กรรมการผู้จัดการ)')
    RETURNING id INTO v_cust2_id;
  END IF;

  -- 4. รับประกันคู่ค้า / ร้านค้าผู้ขาย (Vendors)
  SELECT id INTO v_vend1_id FROM public.vendors WHERE vendor_code = 'VEND-001' LIMIT 1;
  IF v_vend1_id IS NULL THEN
    INSERT INTO public.vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address)
    VALUES ('VEND-001', 'บริษัท โซลาร์ ซัพพลาย แอนด์ เอ็นจิเนียริ่ง จำกัด', 'คุณสมชาย ยอดเยี่ยม (ฝ่ายขายโครงการ)', '02-888-9999', '0105560012341', '123/45 ถนนร่มเกล้า แขวงคลองสามประเวศ เขตลาดกระบัง กรุงเทพฯ 10520')
    RETURNING id INTO v_vend1_id;
  END IF;

  SELECT id INTO v_vend2_id FROM public.vendors WHERE vendor_code = 'VEND-002' LIMIT 1;
  IF v_vend2_id IS NULL THEN
    INSERT INTO public.vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address)
    VALUES ('VEND-002', 'บริษัท เอสซีจี ดีสทริบิวชั่น จำกัด (SCG)', 'คุณกานดา ก่อสร้างดี', '02-586-4444', '0105505001234', '1 ถนนปูนซิเมนต์ไทย แขวงบางซื่อ เขตบางซื่อ กรุงเทพฯ 10800')
    RETURNING id INTO v_vend2_id;
  END IF;

  SELECT id INTO v_vend3_id FROM public.vendors WHERE vendor_code = 'VEND-003' LIMIT 1;
  IF v_vend3_id IS NULL THEN
    INSERT INTO public.vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address)
    VALUES ('VEND-003', 'บริษัท สยามเทค อินเวอร์เตอร์ แอนด์ ออโตเมชั่น จำกัด', 'คุณอนุรักษ์ ไฟฟ้าไทย', '02-999-1122', '0105559098765', '456 ถนนพหลโยธิน แขวงอนุสาวรีย์ เขตบางเขน กรุงเทพฯ 10220')
    RETURNING id INTO v_vend3_id;
  END IF;

  -- ============================================================================
  -- ล้างข้อมูลจำลองเก่าในโมดูลจัดซื้อและใบเสนอราคา
  -- ============================================================================
  DELETE FROM public.goods_receipt_items WHERE grn_id IN (SELECT id FROM public.goods_receipts WHERE grn_no LIKE 'GR-SIM-%' OR grn_no LIKE 'GR-2026-%');
  DELETE FROM public.goods_receipts WHERE grn_no LIKE 'GR-SIM-%' OR grn_no LIKE 'GR-2026-%';
  DELETE FROM public.purchase_order_items WHERE po_id IN (SELECT id FROM public.purchase_orders WHERE po_no LIKE 'PO-2026-%' OR po_no LIKE 'PO-SIM-%');
  DELETE FROM public.purchase_orders WHERE po_no LIKE 'PO-2026-%' OR po_no LIKE 'PO-SIM-%';
  DELETE FROM public.purchase_requisition_items WHERE pr_id IN (SELECT id FROM public.purchase_requisitions WHERE pr_no LIKE 'PR-2026-%' OR pr_no LIKE 'PR-SIM-%');
  DELETE FROM public.purchase_requisitions WHERE pr_no LIKE 'PR-2026-%' OR pr_no LIKE 'PR-SIM-%';
  
  DELETE FROM public.quotation_items WHERE quotation_id IN (SELECT id FROM public.quotations WHERE quotation_no LIKE 'QT-2026-%' OR quotation_no LIKE 'QT-SIM-%');
  DELETE FROM public.quotations WHERE quotation_no LIKE 'QT-2026-%' OR quotation_no LIKE 'QT-SIM-%';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boqs') THEN
    DELETE FROM public.boq_items WHERE boq_id IN (SELECT id FROM public.boqs WHERE boq_no LIKE 'BOQ-2026-%');
    DELETE FROM public.boqs WHERE boq_no LIKE 'BOQ-2026-%';
  END IF;

  -- ============================================================================
  -- 5. จำลองใบเสนอราคา (Quotations)
  -- ============================================================================
  
  -- ใบที่ 1: QT-2026-001 (สถานะ: approved - ลูกค้าเซ็น PO ส่งต่อเข้าจัดซื้อเรียบร้อย)
  INSERT INTO public.quotations (
    quotation_no, issue_date, quotation_date, expiry_date, valid_until, validity_days, sales_person, currency,
    customer_id, customer_name, customer_address, customer_tax_id, customer_branch,
    project_id, ref_no, subtotal, discount_amount, after_discount, vat_rate, vat_amount, grand_total, total_amount,
    status, customer_po_no, customer_po_date, customer_signer_name, customer_po_file_url, customer_notes, notes
  ) VALUES (
    'QT-2026-001', CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE + INTERVAL '18 days', CURRENT_DATE + INTERVAL '18 days', 30, 'วิศวกรฝ่ายขาย (คุณชูศักดิ์)', 'THB',
    v_cust1_id, 'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)', '313 อาคารซี.พี.ทาวเวอร์ ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500', '0107537000249', 'สำนักงานใหญ่',
    v_prj1_id, 'REF-SOLAR-CPF-01', 2500000.00, 0.00, 2500000.00, 7.00, 175000.00, 2675000.00, 2675000.00,
    'approved', 'PO-CPF-2026-088', CURRENT_DATE - INTERVAL '5 days', 'คุณประสิทธิ์ เจริญกิจการ (ผู้มีอำนาจลงนาม)', 'https://example.com/uploads/po-cpf-signed.pdf',
    'เสนอราคาโครงการติดตั้ง Solar Rooftop 120 kWp สระบุรี ลูกค้าเซ็นอนุมัติ PO เรียบร้อยแล้ว พร้อมส่งต่อฝ่ายจัดซื้อสั่งของ',
    'เสนอราคาโครงการติดตั้ง Solar Rooftop 120 kWp สระบุรี ลูกค้าเซ็นอนุมัติ PO เรียบร้อยแล้ว พร้อมส่งต่อฝ่ายจัดซื้อสั่งของ'
  ) RETURNING id INTO v_qt1_id;

  INSERT INTO public.quotation_items (quotation_id, item_name, description, quantity, unit, unit_price, total_amount) VALUES
  (v_qt1_id, 'แผงโซล่าเซลล์ Jinko Solar 550W Tiger Pro Mono Half-cell', E'แผงโซล่าเซลล์เกรด Tier-1 ประสิทธิภาพสูง 21.3%\nรับประกันวัสดุ 12 ปี รับประกันประสิทธิภาพการผลิตไฟ 25 ปี\nผ่านการรับรอง IEC, CE, TUV และ กฟภ./กฟน.', 220, 'แผง', 4200.00, 924000.00),
  (v_qt1_id, 'อินเวอร์เตอร์ Huawei SUN2000-100KTL-M1 (100kW)', E'อินเวอร์เตอร์ On-Grid 3 เฟส ประสิทธิภาพ 98.6%\nพร้อมโมดูล Smart Dongle-WLAN-FE เชื่อมต่อ FusionSolar Portal\nระบบตัดวงจรไฟฟ้าฉุกเฉิน AFCI ในตัว ป้องกันเพลิงไหม้', 1, 'เครื่อง', 380000.00, 380000.00),
  (v_qt1_id, 'โครงสร้างอลูมิเนียม Mounting Rail & Solar Clamp AL6005-T5', E'ชุดรางอลูมิเนียมทนต่อการกัดกร่อนมาตรฐานชายฝั่งทะเล\nรวม Mid-Clamp, End-Clamp, และ Hook ยึดหลังคา Metal Sheet ไร้รอยรั่วซึม', 1, 'ชุดงาน', 280000.00, 280000.00),
  (v_qt1_id, 'ตู้รวมสายไฟ AC/DC Combiner Box & Surge Protection Class II', E'ตู้กันน้ำกันฝุ่น IP65 พร้อมอุปกรณ์ป้องกันเสิร์จฟ้าผ่า SPD\nและเบรกเกอร์ DC Disconnector Switch 1000V จาก Schneider Electric', 1, 'ตู้', 160000.00, 160000.00),
  (v_qt1_id, 'งานบริการติดตั้ง ทดสอบระบบ และยื่นขอขนานไฟ กฟภ.', E'รวมทีมวิศวกรและช่างผู้ชำนาญการติดตั้งบนที่สูง (Working at Heights)\nการตรวจสอบความปลอดภัยทางวิศวกรรม และประสานงานยื่นเอกสาร กฟภ. จนจบกระบวนการ', 1, 'งาน', 756000.00, 756000.00);

  -- ใบที่ 2: QT-2026-002 (สถานะ: sent - ส่งให้ลูกค้าพิจารณา กำลังรอเซ็น PO)
  INSERT INTO public.quotations (
    quotation_no, issue_date, quotation_date, expiry_date, valid_until, validity_days, sales_person, currency,
    customer_id, customer_name, customer_address, customer_tax_id, customer_branch,
    project_id, ref_no, subtotal, discount_amount, after_discount, vat_rate, vat_amount, grand_total, total_amount,
    status, customer_notes, notes
  ) VALUES (
    'QT-2026-002', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '27 days', CURRENT_DATE + INTERVAL '27 days', 30, 'วิศวกรฝ่ายขาย (คุณพงษ์ศักดิ์)', 'THB',
    v_cust2_id, 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '88 หมู่ 7 ถ.บางนา-ตราด ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ', '0105558012345', 'สำนักงานใหญ่',
    v_prj2_id, 'REF-CONST-TRP-02', 1800000.00, 0.00, 1800000.00, 7.00, 126000.00, 1926000.00, 1926000.00,
    'sent', 'เสนอราคาโครงสร้างฐานรากและเสาเข็มอาคารสำนักงานและคลังสินค้า ส่งให้ผู้บริหารลูกค้าตรวจทานแล้ว',
    'เสนอราคาโครงสร้างฐานรากและเสาเข็มอาคารสำนักงานและคลังสินค้า ส่งให้ผู้บริหารลูกค้าตรวจทานแล้ว'
  ) RETURNING id INTO v_qt2_id;

  INSERT INTO public.quotation_items (quotation_id, item_name, description, quantity, unit, unit_price, total_amount) VALUES
  (v_qt2_id, 'เสาเข็มคอนกรีตอัดแรง I-26 มอก. ยาว 21 เมตร (2 ท่อนต่อ)', E'คอนกรีตกำลังอัดประลัย 350 ksc\nลวดอัดแรง PC Wire 4 มม. 6 เส้น พร้อมหัวเหล็กเชื่อมต่อ', 45, 'ต้น', 8500.00, 382500.00),
  (v_qt2_id, 'เหล็กเส้นข้ออ้อย DB20 SD40 มาตรฐาน TATA / SYS', E'เหล็กเต็ม มอก. ความยาว 10 เมตร สำหรับงานหล่อฐานรากและตอม่อ', 12, 'ตัน', 28500.00, 342000.00),
  (v_qt2_id, 'คอนกรีตผสมเสร็จ Strength 280 ksc (Cube) ตราซีแพค (CPAC)', E'ค่ายุบตัว 10-15 ซม. รวมน้ำยายึดเหนี่ยวและปั๊มคอนกรีตบูม 36 เมตร', 85, 'คิว', 2600.00, 221000.00),
  (v_qt2_id, 'งานบริการตอกเสาเข็มด้วยปั้นจั่นไฮดรอลิก Drop Hammer', E'รวมค่าตรวจสอบการทรุดตัว Last 10 Blows Count โดยวิศวกรควบคุมงาน', 45, 'ต้น', 3500.00, 157500.00),
  (v_qt2_id, 'งานโครงสร้างเหล็กรูปพรรณ H-Beam SS400', E'เสาและคานโครงหลังคาอาคารคลังสินค้า พ่นสีกันสนิม Epoxy 2 ชั้น', 25, 'ตัน', 27880.00, 697000.00);

  -- ใบที่ 3: QT-2026-003 (สถานะ: draft - ฉบับร่าง วิศวกรกำลังคำนวณ)
  INSERT INTO public.quotations (
    quotation_no, issue_date, quotation_date, expiry_date, valid_until, validity_days, sales_person, currency,
    customer_name, customer_address, project_id, subtotal, discount_amount, after_discount, vat_rate, vat_amount, grand_total, total_amount,
    status, customer_notes, notes
  ) VALUES (
    'QT-2026-003', CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '30 days', 30, 'วิศวกรไฟฟ้า (คุณอนุชา)', 'THB',
    'บริษัท โรงพยาบาลธนบุรี 2 จำกัด', 'ถ.บรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพฯ', v_prj3_id,
    850000.00, 0.00, 850000.00, 7.00, 59500.00, 909500.00, 909500.00,
    'draft', 'ใบเสนอราคาปรับปรุงระบบตู้สวิตช์บอร์ด MDB กำลังจัดเตรียมรายการวัสดุและเบรกเกอร์',
    'ใบเสนอราคาปรับปรุงระบบตู้สวิตช์บอร์ด MDB กำลังจัดเตรียมรายการวัสดุและเบรกเกอร์'
  ) RETURNING id INTO v_qt3_id;

  INSERT INTO public.quotation_items (quotation_id, item_name, description, quantity, unit, unit_price, total_amount) VALUES
  (v_qt3_id, 'ตู้สวิตช์บอร์ด Main Distribution Board (MDB) 3P 1600A', E'ตู้เหล็กมาตรฐาน Form 2b พ่นสีฝุ่นอบอย่างดี IP43\nประกอบด้วย ACB 1600A 3P 65kA Fixed type Schneider', 1, 'ตู้', 450000.00, 450000.00),
  (v_qt3_id, 'สายไฟทองแดงหุ้มฉนวน XLPE 0.6/1kV ขนาด 4x185 sq.mm.', E'มาตรฐาน TIS 2143-2555 ทองแดงแท้ 99.9% ความยาวตามแนวเดินสาย', 200, 'เมตร', 1600.00, 320000.00),
  (v_qt3_id, 'งานทดสอบและตัดต่อสลับระบบไฟโรงพยาบาล (Testing & Cut-over)', E'ดำเนินงานช่วงเวลากลางคืนเพื่อไม่ให้กระทบต่อระบบทางการแพทย์', 1, 'งาน', 80000.00, 80000.00);

  -- ============================================================================
  -- 6. จำลองใบขอซื้อ (Purchase Requisitions - PR)
  -- หมายเหตุ: ใช้ status = 'ordered' หรือ 'pending' ตาม check constraint
  -- ============================================================================
  
  -- PR-2026-001 (สถานะ: ordered - ออก PO เรียบร้อย)
  INSERT INTO public.purchase_requisitions (
    pr_no, request_date, status, project_id, notes, requested_by, created_by
  ) VALUES (
    'PR-2026-001', CURRENT_DATE - INTERVAL '10 days', 'ordered', v_prj1_id,
    'ขออนุมัติสั่งซื้อแผงโซล่าเซลล์และอินเวอร์เตอร์ โครงการติดตั้ง Solar Rooftop CPF สระบุรี ตามใบเสนอราคา QT-2026-001', v_user_id, v_user_id
  ) RETURNING id INTO v_pr1_id;

  INSERT INTO public.purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price) VALUES
  (v_pr1_id, 'แผงโซล่าเซลล์ Jinko Solar 550W Tiger Pro Mono Half-cell', 220, 'แผง', 4200.00) RETURNING id INTO v_pr1_item1_id;
  INSERT INTO public.purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price) VALUES
  (v_pr1_id, 'อินเวอร์เตอร์ On-Grid Huawei SUN2000-100KTL-M1 (100kW)', 1, 'เครื่อง', 380000.00) RETURNING id INTO v_pr1_item2_id;

  -- PR-2026-002 (สถานะ: ordered - ออก PO เรียบร้อย)
  INSERT INTO public.purchase_requisitions (
    pr_no, request_date, status, project_id, notes, requested_by, created_by
  ) VALUES (
    'PR-2026-002', CURRENT_DATE - INTERVAL '8 days', 'ordered', v_prj2_id,
    'ขอซื้อเสาเข็มคอนกรีต I-26 และเหล็กเส้นข้ออ้อย DB20 งานฐานรากอาคารคลังสินค้า ไทยรุ่งพัฒนา', v_user_id, v_user_id
  ) RETURNING id INTO v_pr2_id;

  INSERT INTO public.purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price) VALUES
  (v_pr2_id, 'เสาเข็มคอนกรีตอัดแรง I-26 มอก. ยาว 21 เมตร', 45, 'ต้น', 8500.00),
  (v_pr2_id, 'เหล็กเส้นข้ออ้อย DB20 SD40 มาตรฐาน มอก.', 12, 'ตัน', 28500.00);

  -- PR-2026-003 (สถานะ: pending - รอฝ่ายจัดซื้อออก PO)
  INSERT INTO public.purchase_requisitions (
    pr_no, request_date, status, project_id, notes, requested_by, created_by
  ) VALUES (
    'PR-2026-003', CURRENT_DATE - INTERVAL '1 days', 'pending', v_prj3_id,
    'ขอซื้อสายไฟทองแดง XLPE และท่อร้อยสายไฟฟ้า EMT สำหรับงานเดินสายตู้ MDB รพ.ธนบุรี 2 (ของด่วนหน้างาน)', v_user_id, v_user_id
  ) RETURNING id INTO v_pr3_id;

  INSERT INTO public.purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price) VALUES
  (v_pr3_id, 'สายไฟทองแดงหุ้มฉนวน XLPE 0.6/1kV ขนาด 4x185 sq.mm.', 120, 'เมตร', 1550.00),
  (v_pr3_id, 'ท่อร้อยสายไฟฟ้าโลหะบาง EMT 2 นิ้ว พร้อมข้อต่อและแคล้มป์', 40, 'เส้น', 420.00),
  (v_pr3_id, 'รางไวร์เวย์ Wireway ขนาด 100x100 มม. หนา 1.2 มม. ชุบกัลวาไนซ์', 15, 'ท่อน', 850.00);

  -- ============================================================================
  -- 7. จำลองใบสั่งซื้อ (Purchase Orders - PO) ครบ 4 สถานะวันครบกำหนดส่งมอบ
  -- ============================================================================

  -- PO 1: PO-2026-001 (สถานะ: received ✅ ส่งมอบครบถ้วนแล้ว เข้าสโตร์เรียบร้อย)
  INSERT INTO public.purchase_orders (
    po_no, pr_id, project_id, vendor_id, order_date, expected_delivery_date, delivery_address,
    total_amount, net_amount, status, payment_type, payment_term_days,
    quotation_no, quotation_date, buyer_name, tax_type, vat_rate, vat_amount, notes, created_by
  ) VALUES (
    'PO-2026-001', v_pr1_id, v_prj1_id, v_vend3_id,
    CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '5 days', 'ไซต์งานโรงงาน CPF แก่งคอย สระบุรี',
    406600.00, 406600.00, 'received', 'credit_30', 30,
    'QT-HW-88910', CURRENT_DATE - INTERVAL '22 days', 'นายสมศักดิ์ จัดซื้อ', 'vat_included', 7.00, 26599.07,
    'สั่งซื้ออินเวอร์เตอร์ Huawei 100kW ตรวจรับของเข้าหน้างานเรียบร้อยแล้ว', v_user_id
  ) RETURNING id INTO v_po1_id;

  INSERT INTO public.purchase_order_items (po_id, item_name, quantity, unit, unit_price, total_amount, qty_received) VALUES
  (v_po1_id, 'อินเวอร์เตอร์ On-Grid Huawei SUN2000-100KTL-M1 (100kW)', 1, 'เครื่อง', 380000.00, 380000.00, 1),
  (v_po1_id, 'Smart Dongle-WLAN-FE เชื่อมต่อระบบ Cloud', 1, 'ชิ้น', 26600.00, 26600.00, 1);

  -- บันทึกใบตรวจรับของเข้า (Goods Receipt - GR) ให้ PO 1
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goods_receipts' AND column_name = 'received_by') THEN
    INSERT INTO public.goods_receipts (grn_no, po_id, received_date, notes, received_by)
    VALUES ('GR-2026-001', v_po1_id, CURRENT_DATE - INTERVAL '5 days', 'ตรวจรับอินเวอร์เตอร์เรียบร้อย อุปกรณ์ครบถ้วน ไม่ชำรุด พร้อมติดตั้ง', v_user_id)
    RETURNING id INTO v_gr1_id;
  ELSE
    INSERT INTO public.goods_receipts (grn_no, po_id, received_date, notes)
    VALUES ('GR-2026-001', v_po1_id, CURRENT_DATE - INTERVAL '5 days', 'ตรวจรับอินเวอร์เตอร์เรียบร้อย อุปกรณ์ครบถ้วน ไม่ชำรุด พร้อมติดตั้ง')
    RETURNING id INTO v_gr1_id;
  END IF;

  -- PO 2: PO-2026-002 (สถานะ: open 🚨 เกินกำหนดส่งมอบ - OVERDUE 7 วัน! แดงกระพริบเตือนเร่งรัด)
  INSERT INTO public.purchase_orders (
    po_no, pr_id, project_id, vendor_id, order_date, expected_delivery_date, delivery_address,
    total_amount, net_amount, status, payment_type, payment_term_days,
    quotation_no, quotation_date, buyer_name, tax_type, vat_rate, vat_amount, notes, created_by
  ) VALUES (
    'PO-2026-002', v_pr2_id, v_prj2_id, v_vend2_id,
    CURRENT_DATE - INTERVAL '18 days', CURRENT_DATE - INTERVAL '7 days', 'หน้างานก่อสร้างอาคารคลังสินค้า กม.19 ถ.บางนา-ตราด บางพลี',
    724500.00, 724500.00, 'open', 'credit_30', 30,
    'QT-SCG-2026-09', CURRENT_DATE - INTERVAL '19 days', 'นายสมศักดิ์ จัดซื้อ', 'vat_included', 7.00, 47397.20,
    'สั่งซื้อเสาเข็มและเหล็กเส้น เกินกำหนดส่งมอบมาแล้ว 7 วัน! อยู่ระหว่างโทรเร่งรัดรถจัดส่งจากโรงงาน SCG', v_user_id
  ) RETURNING id INTO v_po2_id;

  INSERT INTO public.purchase_order_items (po_id, item_name, quantity, unit, unit_price, total_amount, qty_received) VALUES
  (v_po2_id, 'เสาเข็มคอนกรีตอัดแรง I-26 มอก. ยาว 21 เมตร', 45, 'ต้น', 8500.00, 382500.00, 0),
  (v_po2_id, 'เหล็กเส้นข้ออ้อย DB20 SD40 มาตรฐาน TATA / SYS', 12, 'ตัน', 28500.00, 342000.00, 0);

  -- PO 3: PO-2026-003 (สถานะ: open ⏰ ใกล้ครบกำหนดส่งมอบ - Due in 3 days! สีส้มเตือนติดตาม)
  INSERT INTO public.purchase_orders (
    po_no, pr_id, project_id, vendor_id, order_date, expected_delivery_date, delivery_address,
    total_amount, net_amount, status, payment_type, payment_term_days,
    quotation_no, quotation_date, buyer_name, tax_type, vat_rate, vat_amount, notes, created_by
  ) VALUES (
    'PO-2026-003', v_pr1_id, v_prj1_id, v_vend1_id,
    CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '3 days', 'สโตร์หลักบริษัท อันวาแอนด์โค แขวงลาดยาว เขตจตุจักร กรุงเทพฯ',
    988680.00, 988680.00, 'open', 'credit_30', 30,
    'QT-SSP-2026-55', CURRENT_DATE - INTERVAL '6 days', 'นายสมศักดิ์ จัดซื้อ', 'vat_included', 7.00, 64681.31,
    'สั่งซื้อแผงโซล่าเซลล์ Jinko 550W จำนวน 220 แผง กำหนดส่งมอบในอีก 3 วัน ผู้ขายแจ้งตารางขนส่งแล้ว', v_user_id
  ) RETURNING id INTO v_po3_id;

  INSERT INTO public.purchase_order_items (po_id, item_name, quantity, unit, unit_price, total_amount, qty_received) VALUES
  (v_po3_id, 'แผงโซล่าเซลล์ Jinko Solar 550W Tiger Pro Mono Half-cell', 220, 'แผง', 4200.00, 924000.00, 0),
  (v_po3_id, 'ชุดรางอลูมิเนียม Mounting Rail & Clamp AL6005-T5', 1, 'ชุด', 64680.00, 64680.00, 0);

  -- PO 4: PO-2026-004 (สถานะ: partial 🚚 รอนำส่งตามกำหนด - On Track อีก 14 วัน และรับบางส่วนแล้ว)
  INSERT INTO public.purchase_orders (
    po_no, pr_id, project_id, vendor_id, order_date, expected_delivery_date, delivery_address,
    total_amount, net_amount, status, payment_type, payment_term_days,
    buyer_name, tax_type, vat_rate, vat_amount, notes, created_by
  ) VALUES (
    'PO-2026-004', NULL, v_prj3_id, v_vend1_id,
    CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '14 days', 'หน้างานแผนกช่างอาคาร รพ. ธนบุรี 2 ถ.บรมราชชนนี',
    216140.00, 216140.00, 'partial', 'cash', 0,
    'นายสมศักดิ์ จัดซื้อ', 'vat_included', 7.00, 14140.00,
    'สั่งตรงอุปกรณ์ไฟฟ้าตู้ MDB ได้รับท่อและอุปกรณ์รางบางส่วนแล้ว รอสายไฟ XLPE เข้าส่งมอบงวดถัดไป', v_user_id
  ) RETURNING id INTO v_po4_id;

  INSERT INTO public.purchase_order_items (po_id, item_name, quantity, unit, unit_price, total_amount, qty_received) VALUES
  (v_po4_id, 'สายไฟทองแดงหุ้มฉนวน XLPE 0.6/1kV ขนาด 4x185 sq.mm.', 100, 'เมตร', 1600.00, 160000.00, 0),
  (v_po4_id, 'ท่อร้อยสายไฟฟ้าโลหะบาง EMT 2 นิ้ว พร้อมข้อต่อ', 40, 'เส้น', 420.00, 16800.00, 40),
  (v_po4_id, 'รางไวร์เวย์ Wireway ขนาด 100x100 มม. หนา 1.2 มม.', 15, 'ท่อน', 850.00, 12750.00, 15);

  -- ============================================================================
  -- 8. จำลองระบบ BOQ (Bill of Quantities)
  -- ============================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boqs') THEN
    INSERT INTO public.boqs (
      boq_no, title, project_id, customer_name, system_size_kwp, status,
      total_material_cost, total_labor_cost, total_cost, markup_percent, markup_amount, grand_total, notes, created_by
    ) VALUES (
      'BOQ-2026-001', 'ประมาณราคาติดตั้ง Solar Rooftop 120 kWp โรงงาน CPF สระบุรี', v_prj1_id,
      'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)', 120.00, 'converted_to_quotation',
      1744000.00, 380000.00, 2124000.00, 17.70, 376000.00, 2500000.00,
      'BOQ วิศวกรรมระบบโซล่าเซลล์ แปลงเป็นใบเสนอราคา QT-2026-001 และออกใบสั่งซื้อเรียบร้อยแล้ว', v_user_id
    ) RETURNING id INTO v_boq1_id;

    INSERT INTO public.boq_items (boq_id, category, item_code, item_name, description, quantity, unit, material_unit_cost, labor_unit_cost, total_material_cost, total_labor_cost, total_amount) VALUES
    (v_boq1_id, 'แผงโซล่าเซลล์', 'SOLAR-PANEL-550', 'แผงโซล่าเซลล์ Jinko Solar 550W Tiger Pro Mono Half-cell', 'เกรด Tier-1 รับประกัน 12/25 ปี', 220, 'แผง', 3900.00, 300.00, 858000.00, 66000.00, 924000.00),
    (v_boq1_id, 'อินเวอร์เตอร์', 'INV-HUAWEI-100K', 'อินเวอร์เตอร์ On-Grid Huawei SUN2000-100KTL-M1', '100kW 3 Phase 380V พร้อม Smart Dongle', 1, 'เครื่อง', 350000.00, 30000.00, 350000.00, 30000.00, 380000.00),
    (v_boq1_id, 'โครงสร้างติดตั้ง', 'MOUNT-AL-01', 'โครงสร้างอลูมิเนียม Mounting Rail & Clamp AL6005-T5', 'รางอลูมิเนียมและข้อต่อกันสนิมตลอดอายุการใช้งาน', 1, 'ชุดงาน', 240000.00, 40000.00, 240000.00, 40000.00, 280000.00),
    (v_boq1_id, 'ตู้สวิตช์บอร์ด', 'PANEL-ACDC-01', 'ตู้รวมสายไฟ AC/DC Combiner Box & Surge Protection', 'ตู้สแตนเลส IP65 พร้อม SPD Class II', 1, 'ตู้', 130000.00, 30000.00, 130000.00, 30000.00, 160000.00),
    (v_boq1_id, 'งานบริการและยื่นขออนุญาต', 'SRV-PERMIT-01', 'งานบริการติดตั้ง ทดสอบระบบ และยื่นขอขนานไฟ กฟภ.', 'รวมวิศวกรเซ็นรับรองแบบและประสานงานราชการ', 1, 'งาน', 166000.00, 214000.00, 166000.00, 214000.00, 380000.00);
  END IF;

  RAISE NOTICE 'Migration 027 executed successfully: Seeded realistic Quotations, Customer PO sign, PRs, POs with Due Dates, and BOQ.';
END $$;
