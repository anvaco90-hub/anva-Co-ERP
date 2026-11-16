-- ==============================================================================
-- ANVA & CO., LTD. (anva-Co-ERP) - Accounting Module
-- ส่วนที่ 2: การป้อนข้อมูลตั้งต้นและข้อมูลจำลอง (DML - Seed Data Only)
-- เรียงลำดับ 1 -> 2 -> 3 ไม่ติด Foreign Key และยอดเดบิต-เครดิตสมดุล 100%
-- ==============================================================================

-- ==============================================================================
-- ขั้นที่ 1: ป้อนข้อมูลหลัก (Master Data: ผังบัญชี และ ทะเบียนผู้ติดต่อ)
-- ==============================================================================

-- 1.1 ป้อนผังบัญชีมาตรฐานธุรกิจ SME ไทย (33 หมวดบัญชีหลัก)
insert into chart_of_accounts (account_code, account_name_th, account_name_en, account_category, is_system_default, is_active)
values
  -- [1] ASSETS (สินทรัพย์)
  ('1110-01', 'เงินสดในมือ', 'Cash on Hand', 'Asset', true, true),
  ('1110-02', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารกสิกรไทย', 'Bank Account - KBANK', 'Asset', true, true),
  ('1110-03', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารไทยพาณิชย์', 'Bank Account - SCB', 'Asset', true, true),
  ('1120-01', 'เงินสดย่อยสำนักงานและสโตร์', 'Petty Cash', 'Asset', true, true),
  ('1130-01', 'ลูกหนี้การค้า', 'Accounts Receivable - Trade', 'Asset', true, true),
  ('1130-02', 'ลูกหนี้เงินประกันผลงานโครงการ', 'Retention Receivable', 'Asset', true, true),
  ('1140-01', 'สินค้า/วัสดุก่อสร้างคงเหลือ', 'Inventory - Construction Materials', 'Asset', true, true),
  ('1150-01', 'ภาษีซื้อ', 'Input VAT', 'Asset', true, true),
  ('1150-02', 'ภาษีซื้อยังไม่ถึงกำหนดชำระ', 'Undue Input VAT', 'Asset', true, true),
  ('1160-01', 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก (รอนำส่ง)', 'Withholding Tax Deducted at Source', 'Asset', true, true),
  ('1510-01', 'อาคารสำนักงานและสโตร์', 'Buildings and Warehouses', 'Asset', true, true),
  ('1520-01', 'ยานพาหนะและเครื่องจักรกลหนัก', 'Vehicles and Heavy Machinery', 'Asset', true, true),

  -- [2] LIABILITIES (หนี้สิน)
  ('2110-01', 'เจ้าหนี้การค้า', 'Accounts Payable - Trade', 'Liability', true, true),
  ('2110-02', 'เจ้าหนี้ผู้รับเหมาช่วงและบริการ', 'Subcontractor Accounts Payable', 'Liability', true, true),
  ('2120-01', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด. 3)', 'Withholding Tax Payable - PND 3', 'Liability', true, true),
  ('2120-02', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด. 53)', 'Withholding Tax Payable - PND 53', 'Liability', true, true),
  ('2130-01', 'ภาษีขาย', 'Output VAT', 'Liability', true, true),
  ('2140-01', 'เงินค้ำประกันผลงานผู้รับเหมาค้างจ่าย', 'Retention Payable - Subcontractors', 'Liability', true, true),
  ('2150-01', 'ค่าใช้จ่ายค้างจ่าย', 'Accrued Expenses', 'Liability', true, true),
  ('2210-01', 'เงินกู้ยืมระยะยาวจากสถาบันการเงิน', 'Long-Term Bank Loans', 'Liability', true, true),

  -- [3] EQUITY (ส่วนของเจ้าของ)
  ('3110-01', 'ทุนจดทะเบียนที่ชำระแล้ว', 'Authorized & Paid-up Share Capital', 'Equity', true, true),
  ('3210-01', 'กำไร (ขาดทุน) สะสมยกมา', 'Retained Earnings', 'Equity', true, true),
  ('3220-01', 'กำไร (ขาดทุน) สุทธิประจำงวด', 'Current Year Net Income', 'Equity', true, true),

  -- [4] REVENUE (รายได้)
  ('4110-01', 'รายได้จากงานรับเหมาก่อสร้างและวิศวกรรม', 'Revenue from Construction & Engineering', 'Revenue', true, true),
  ('4110-02', 'รายได้จากงานติดตั้งระบบโซล่าเซลล์', 'Revenue from Solar Rooftop EPC', 'Revenue', true, true),
  ('4120-01', 'รายได้จากการขายสินค้าและวัสดุ', 'Sales Revenue - Construction Materials', 'Revenue', true, true),
  ('4210-01', 'รายได้อื่นและดอกเบี้ยรับ', 'Other Income & Interest Received', 'Revenue', true, true),

  -- [5] EXPENSES (ต้นทุนและค่าใช้จ่าย)
  ('5110-01', 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์', 'Cost of Materials and Equipment', 'Expense', true, true),
  ('5120-01', 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', 'Direct Construction Labor Cost', 'Expense', true, true),
  ('5130-01', 'ต้นทุนค่าจ้างผู้รับเหมาช่วง', 'Subcontractor Cost', 'Expense', true, true),
  ('5140-01', 'ต้นทุนค่าเช่าเครื่องจักรและยานพาหนะโครงการ', 'Machinery & Equipment Rental', 'Expense', true, true),
  ('5210-01', 'เงินเดือนและค่าตอบแทนพนักงาน', 'Salaries and Employee Benefits', 'Expense', true, true),
  ('5220-01', 'ค่าน้ำมันเชื้อเพลิงและค่าเดินทาง (Fleet Card)', 'Fuel & Traveling Expenses', 'Expense', true, true),
  ('5230-01', 'ค่าสาธารณูปโภค ค่าโทรศัพท์ และอินเทอร์เน็ต', 'Utilities & Communication', 'Expense', true, true),
  ('5240-01', 'ค่าเสื่อมราคาและค่าตัดจำหน่าย', 'Depreciation & Amortization', 'Expense', true, true),
  ('5250-01', 'ค่าธรรมเนียมธนาคารและค่าที่ปรึกษา', 'Bank Charges and Professional Fees', 'Expense', true, true)
on conflict (account_code) do update set
  account_name_th = excluded.account_name_th,
  account_name_en = excluded.account_name_en,
  account_category = excluded.account_category;

-- 1.2 ป้อนทะเบียนผู้ติดต่อ (Contacts Directory)
insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, address)
values
  ('CUST-0001', 'customer', 'บริษัท ซีพีเอฟ (ประเทศไทย) จำกัด (มหาชน)', '0107536000080', '00000', '02-766-8000', 'เลขที่ 313 อาคารซีพี ทาวเวอร์ ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500'),
  ('CUST-0002', 'customer', 'บริษัท ไทยรุ่งพัฒนา คลังสินค้า จำกัด', '0105558099881', '00001', '02-399-4455', '88 หมู่ 3 ตำบลบางเสาธง อำเภอบางเสาธง จังหวัดสมุทรปราการ 10540'),
  ('CUST-0003', 'customer', 'บริษัท โรงพยาบาลธนบุรี 2 จำกัด', '0105536087654', '00000', '02-487-4000', '43/4 ถนนบรมราชชนนี แขวงศาลาธรรมสพน์ เขตทวีวัฒนา กรุงเทพมหานคร 10170'),
  ('VEND-0001', 'vendor', 'บริษัท ปูนซิเมนต์ไทย (แก่งคอย) จำกัด', '0105512001122', '00000', '036-240-000', '1 หมู่ 7 ตำบลบ้านป่า อำเภอแก่งคอย จังหวัดสระบุรี 18110'),
  ('VEND-0002', 'vendor', 'บริษัท ไทยคูณสตีล จำกัด (มหาชน)', '0107555000123', '00000', '02-815-5000', '99/9 หมู่ 2 ถนนพระราม 2 ตำบลคอกกระบือ อำเภอเมืองสมุทรสาคร จังหวัดสมุทรสาคร 74000'),
  ('VEND-0003', 'vendor', 'บริษัท ยูไนเต็ด พาวเวอร์ กรีน โซลูชั่น จำกัด', '0105562088776', '00000', '02-555-7788', '555 อาคารรุ่งโรจน์ ถนนพหลโยธิน แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900'),
  ('VEND-0004', 'vendor', 'หจก. เพิ่มสิน เครนและเครื่องจักรกล', '0103548005544', '00000', '081-445-5667', '45 ถนนรังสิต-นครนายก ตำบลคลองหนึ่ง อำเภอคลองหลวง จังหวัดปทุมธานี 12120'),
  ('VEND-0005', 'vendor', 'นายสมคิด ช่างทอง (งานรับเหมาแรงงาน)', '1100500123456', '00000', '089-112-2334', '12/4 หมู่ 5 ตำบลหนองแค อำเภอหนองแค จังหวัดสระบุรี 18140')
on conflict (contact_code) do update set
  company_name = excluded.company_name,
  tax_id = excluded.tax_id,
  phone = excluded.phone,
  address = excluded.address;


-- ==============================================================================
-- ขั้นที่ 2: ป้อนข้อมูลธุรกรรม (Transactions: Invoices, Expenses, AP, Retention, Fleet)
-- ==============================================================================

-- 2.1 ป้อนข้อมูลใบแจ้งหนี้และลูกหนี้คงค้าง (sales_invoices)
insert into sales_invoices (invoice_no, customer_id, project_id, issue_date, due_date, subtotal, vat_rate, vat_amount, total_amount, paid_amount, remaining_amount, is_opening_balance, status, notes)
values
  -- ใบแจ้งหนี้ 1: Solar CPF สระบุรี งวดที่ 1 (ยังไม่ถึงกำหนด)
  ('INV202611-0001',
   (select id from customers where company_name like '%ซีพีเอฟ%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-001' limit 1),
   '2026-11-02', '2026-12-02', 1200000.00, 7.00, 84000.00, 1284000.00, 0, 1284000.00, false, 'รอเก็บเงิน', 'ส่งมอบแผงโซลาร์เซลล์งวดที่ 1'),

  -- ใบแจ้งหนี้ 2: คลังสินค้าไทยรุ่งพัฒนา งวดเปิดงาน (เกินกำหนด 1-30 วัน)
  ('INV202610-0002',
   (select id from customers where company_name like '%ไทยรุ่งพัฒนา%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-002' limit 1),
   '2026-10-05', '2026-11-05', 2500000.00, 7.00, 175000.00, 2675000.00, 500000.00, 2175000.00, false, 'รอเก็บเงิน', 'งานเสาเข็มและฐานรากอาคารคลังสินค้า'),

  -- ใบแจ้งหนี้ 3: ยอดยกมาโรงพยาบาลธนบุรี 2 (เกินกำหนด 31-60 วัน)
  ('INV202609-0003',
   (select id from customers where company_name like '%ธนบุรี%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-003' limit 1),
   '2026-09-15', '2026-10-15', 850000.00, 7.00, 59500.00, 909500.00, 0, 909500.00, true, 'รอเก็บเงิน', 'ยอดยกมางานติดตั้งตู้ Main Distribution Board')
on conflict (invoice_no) do update set
  total_amount = excluded.total_amount,
  remaining_amount = excluded.remaining_amount;

-- 2.2 ป้อนค่าใช้จ่ายโครงการและบริษัท (expenses)
insert into expenses (expense_no, vendor_id, project_id, expense_date, due_date, expense_category, account_code, description, payment_method, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total_amount, vendor_tax_invoice_no, tax_invoice_date, is_asset, accounting_status, status)
values
  -- ค่าใช้จ่าย 1: ซื้อเหล็กข้ออ้อย (มี VAT 7%)
  ('EXP202611-0001',
   (select id from vendors where vendor_name like '%ไทยคูณสตีล%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-002' limit 1),
   '2026-11-05', '2026-12-05', 'งานก่อสร้างและดำเนินงาน', '5110-01',
   'จัดซื้อเหล็กข้ออ้อย DB20 และ DB12 งานโครงสร้างเสา', 'โอนเงิน',
   280000.00, 7.00, 19600.00, 0, 0, 299600.00, 'INV-TKS-88912', '2026-11-05', false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),

  -- ค่าใช้จ่าย 2: ค่าจ้างแรงงานทำของ (หัก ณ ที่จ่าย 3% ภ.ง.ด.3 บุคคลธรรมดา)
  ('EXP202611-0002',
   (select id from vendors where vendor_name like '%สมคิด%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-001' limit 1),
   '2026-11-08', '2026-11-08', 'งานก่อสร้างและดำเนินงาน', '5120-01',
   'ค่าจ้างติดตั้งโครงสร้างแผงโซลาร์งวดที่ 1 (ช่างสมคิด)', 'โอนเงิน',
   75000.00, 0, 0, 3.00, 2250.00, 75000.00, null, null, false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),

  -- ค่าใช้จ่าย 3: ค่าเช่ารถเครน (หัก ณ ที่จ่าย 5% ภ.ง.ด.53 นิติบุคคล)
  ('EXP202611-0003',
   (select id from vendors where vendor_name like '%เพิ่มสิน%' limit 1),
   (select id from projects where project_code = 'PRJ-2026-002' limit 1),
   '2026-11-10', '2026-11-25', 'งานก่อสร้างและดำเนินงาน', '5140-01',
   'ค่าเช่ารถเครน 25 ตัน ยกแผ่นคอนกรีตสำเร็จรูป 5 วัน', 'เจ้าหนี้การค้า',
   60000.00, 7.00, 4200.00, 5.00, 3000.00, 64200.00, 'PS-CRANE-5541', '2026-11-10', false, 'รอดำเนินการ', 'รอดำเนินการ')
on conflict (expense_no) do update set
  total_amount = excluded.total_amount;

-- 2.3 ป้อนตารางนัดจ่ายเจ้าหนี้การค้า (accounts_payable)
insert into accounts_payable (ap_no, vendor_id, vendor_name, invoice_no, invoice_date, due_date, credit_days, total_debt, paid_amount, remaining_amount, status, payment_method)
values
  ('AP-202611-001',
   (select id from vendors where vendor_name like '%ปูนซิเมนต์ไทย%' limit 1),
   'บริษัท ปูนซิเมนต์ไทย (แก่งคอย) จำกัด',
   'SCG-INV-99012', '2026-10-25', '2026-11-24', 30,
   450000.00, 150000.00, 300000.00, 'partial', 'โอนเงิน'),

  ('AP-202611-002',
   (select id from vendors where vendor_name like '%ไทยคูณสตีล%' limit 1),
   'บริษัท ไทยคูณสตีล จำกัด (มหาชน)',
   'TKS-INV-44120', '2026-10-15', '2026-11-14', 30,
   820000.00, 0, 820000.00, 'pending', 'โอนเงิน'),

  ('AP-202611-003',
   (select id from vendors where vendor_name like '%ยูไนเต็ด พาวเวอร์%' limit 1),
   'บริษัท ยูไนเต็ด พาวเวอร์ กรีน โซลูชั่น จำกัด',
   'UPG-INV-2026-11', '2026-11-01', '2026-12-01', 30,
   1250000.00, 0, 1250000.00, 'pending', 'โอนเงิน')
on conflict (ap_no) do update set
  total_debt = excluded.total_debt,
  remaining_amount = excluded.remaining_amount;

-- 2.4 ป้อนเงินค้ำประกันผลงานโครงการ (retention_guarantees)
insert into retention_guarantees (retention_no, customer_name, contractor_name, trade_type, project_id, contract_amount, percentage, retention_rate, retention_amount, warranty_period_months, release_date, status)
values
  ('RET-2026-001',
   'บริษัท ซีพีเอฟ (ประเทศไทย) จำกัด (มหาชน)',
   'ทีมช่างวิชาญ โซล่าร์เอ็นจิเนียริ่ง', 'solar',
   (select id from projects where project_code = 'PRJ-2026-001' limit 1),
   3500000.00, 5.00, 5.00, 175000.00, 24, '2027-05-30', 'held'),

  ('RET-2026-002',
   'บริษัท ไทยรุ่งพัฒนา คลังสินค้า จำกัด',
   'หจก. พัฒนาการโยธา 2019', 'civil',
   (select id from projects where project_code = 'PRJ-2026-002' limit 1),
   12500000.00, 5.00, 5.00, 625000.00, 12, '2027-10-31', 'held'),

  ('RET-2026-003',
   'บริษัท โรงพยาบาลธนบุรี 2 จำกัด',
   'ช่างสมหมาย งานระบบไฟฟ้าแรงสูง', 'electrical',
   (select id from projects where project_code = 'PRJ-2026-003' limit 1),
   1850000.00, 5.00, 5.00, 92500.00, 12, '2027-06-30', 'held')
on conflict (retention_no) do update set
  retention_amount = excluded.retention_amount;

-- 2.5 ป้อนบันทึกค่าน้ำมัน Fleet Card (fleet_card_expenses)
insert into fleet_card_expenses (slip_no, vehicle_plate, driver_name, card_holder, project_id, transaction_date, fuel_type, liters, amount, station_name)
values
  ('FLT-2611-01', '2ขข-4589 กทม.', 'สมชาย ใจมั่น (โฟร์แมน)', 'สมชาย ใจมั่น',
   (select id from projects where project_code = 'PRJ-2026-001' limit 1),
   '2026-11-03', 'ดีเซล B7', 62.50, 1990.00, 'ปตท. นิคมแก่งคอย'),

  ('FLT-2611-02', '1ฒภ-9921 กทม.', 'ณรงค์ฤทธิ์ (วิศวกรสนาม)', 'ณรงค์ฤทธิ์ ชัยชนะ',
   (select id from projects where project_code = 'PRJ-2026-002' limit 1),
   '2026-11-06', 'ดีเซล B7', 58.00, 1850.00, 'บางจาก บางนา-ตราด กม.18'),

  ('FLT-2611-03', '3กบ-1144 นนทบุรี', 'สุรชัย (ฝ่ายสโตร์ขนส่ง)', 'สุรชัย มั่นคง',
   null,
   '2026-11-08', 'ดีเซล B7', 45.20, 1440.00, 'ปตท. กาญจนาภิเษก-บางบัวทอง')
on conflict (slip_no) do update set
  amount = excluded.amount;


-- ==============================================================================
-- ขั้นที่ 3: ป้อนข้อมูลสมุดรายวันทั่วไปและภาษี (General Ledger & Tax Records)
-- ==============================================================================

-- 3.1 สมุดรายวันรายการที่ 1: บันทึกตั้งลูกหนี้ตามใบแจ้งหนี้ INV202611-0001
do $$
declare
  v_jv_id uuid;
  v_ar_id uuid;
  v_rev_id uuid;
  v_vat_id uuid;
  v_prj_id uuid;
  v_cust_id uuid;
begin
  select id into v_ar_id from chart_of_accounts where account_code = '1130-01' limit 1;
  select id into v_rev_id from chart_of_accounts where account_code = '4110-02' limit 1;
  select id into v_vat_id from chart_of_accounts where account_code = '2130-01' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-001' limit 1;
  select id into v_cust_id from contacts where company_name like '%ซีพีเอฟ%' limit 1;

  -- ลบรายการเดิมถ้ามีเพื่อป้องกันซ้ำ
  delete from journal_entries where entry_no = 'JV2026110001';

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('JV2026110001', '2026-11-02', 'INV', v_prj_id, 'ตั้งลูกหนี้การค้าและภาษีขายตามใบแจ้งหนี้ INV202611-0001 (โครงการ Solar CPF)', 'อนุมัติแล้ว')
  returning id into v_jv_id;

  -- Dr. ลูกหนี้การค้า 1,284,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_ar_id, v_cust_id, 1284000.00, 0, 'ลูกหนี้การค้า - ซีพีเอฟ สระบุรี');

  -- Cr. รายได้จากการติดตั้งโซล่าเซลล์ 1,200,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_rev_id, v_cust_id, 0, 1200000.00, 'รายได้งานติดตั้งแผงโซล่าเซลล์งวดที่ 1');

  -- Cr. ภาษีขาย 84,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_vat_id, v_cust_id, 0, 84000.00, 'ภาษีขาย 7% - INV202611-0001');

  -- บันทึกภาษีขายเข้า tax_records
  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, contact_id, project_id, base_amount, vat_amount, status, journal_entry_id)
  values ('OUTPUT_VAT', 11, 2026, '2026-11-02', 'INV202611-0001', v_cust_id, v_prj_id, 1200000.00, 84000.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- 3.2 สมุดรายวันรายการที่ 2: บันทึกค่าใช้จ่ายซื้อเหล็ก EXP202611-0001
do $$
declare
  v_jv_id uuid;
  v_mat_id uuid;
  v_invat_id uuid;
  v_bank_id uuid;
  v_prj_id uuid;
  v_vend_id uuid;
begin
  select id into v_mat_id from chart_of_accounts where account_code = '5110-01' limit 1;
  select id into v_invat_id from chart_of_accounts where account_code = '1150-01' limit 1;
  select id into v_bank_id from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-002' limit 1;
  select id into v_vend_id from contacts where company_name like '%ไทยคูณสตีล%' limit 1;

  delete from journal_entries where entry_no = 'JV2026110002';

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('JV2026110002', '2026-11-05', 'EXP', v_prj_id, 'บันทึกค่าจัดซื้อเหล็กข้ออ้อยและภาษีซื้อตาม EXP202611-0001', 'อนุมัติแล้ว')
  returning id into v_jv_id;

  -- Dr. ต้นทุนวัสดุก่อสร้าง 280,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_mat_id, v_vend_id, 280000.00, 0, 'ค่าเหล็กข้ออ้อย DB20/DB12 คลังสินค้าไทยรุ่ง');

  -- Dr. ภาษีซื้อ 19,600.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_invat_id, v_vend_id, 19600.00, 0, 'ภาษีซื้อ 7% - INV-TKS-88912');

  -- Cr. เงินฝากธนาคารกสิกรไทย 299,600.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_vend_id, 0, 299600.00, 'จ่ายชำระเงินโอนผ่าน ธ.กสิกรไทย');

  -- บันทึกภาษีซื้อเข้า tax_records
  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no, contact_id, project_id, base_amount, vat_amount, status, journal_entry_id)
  values ('INPUT_VAT', 11, 2026, '2026-11-05', 'EXP202611-0001', 'INV-TKS-88912', v_vend_id, v_prj_id, 280000.00, 19600.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- 3.3 สมุดรายวันรายการที่ 3: บันทึกค่าจ้างแรงงานหัก ณ ที่จ่าย 3% (EXP202611-0002)
do $$
declare
  v_jv_id uuid;
  v_lab_id uuid;
  v_wht_id uuid;
  v_bank_id uuid;
  v_prj_id uuid;
  v_vend_id uuid;
begin
  select id into v_lab_id from chart_of_accounts where account_code = '5120-01' limit 1;
  select id into v_wht_id from chart_of_accounts where account_code = '2120-01' limit 1; -- ภ.ง.ด.3
  select id into v_bank_id from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-001' limit 1;
  select id into v_vend_id from contacts where company_name like '%สมคิด%' limit 1;

  delete from journal_entries where entry_no = 'JV2026110003';

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('JV2026110003', '2026-11-08', 'EXP', v_prj_id, 'บันทึกค่าแรงงานติดตั้งโซล่าเซลล์และหักภาษี ณ ที่จ่าย 3% (ช่างสมคิด)', 'อนุมัติแล้ว')
  returning id into v_jv_id;

  -- Dr. ต้นทุนค่าแรงงานก่อสร้าง 75,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_lab_id, v_vend_id, 75000.00, 0, 'ค่าแรงงานงวดที่ 1 ช่างสมคิด');

  -- Cr. ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.3) 2,250.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_wht_id, v_vend_id, 0, 2250.00, 'หักภาษี ณ ที่จ่าย 3% (บุคคลธรรมดา ภ.ง.ด.3)');

  -- Cr. เงินฝากธนาคารกสิกรไทย (สุทธิจ่าย) 72,750.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_vend_id, 0, 72750.00, 'จ่ายสุทธิผ่าน ธ.กสิกรไทย');

  -- บันทึกภาษีหัก ณ ที่จ่าย ภ.ง.ด.3 เข้า tax_records
  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, contact_id, project_id, base_amount, vat_amount, wht_rate, wht_amount, status, journal_entry_id)
  values ('WHT_3', 11, 2026, '2026-11-08', 'EXP202611-0002', v_vend_id, v_prj_id, 75000.00, 0, 3.00, 2250.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- 3.4 สมุดรายวันรายการที่ 4: รับชำระหนี้จากลูกค้าบางส่วน (RC)
do $$
declare
  v_jv_id uuid;
  v_bank_id uuid;
  v_ar_id uuid;
  v_prj_id uuid;
  v_cust_id uuid;
begin
  select id into v_bank_id from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_ar_id from chart_of_accounts where account_code = '1130-01' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-002' limit 1;
  select id into v_cust_id from contacts where company_name like '%ไทยรุ่งพัฒนา%' limit 1;

  delete from journal_entries where entry_no = 'RC2026110001';

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('RC2026110001', '2026-11-09', 'RC', v_prj_id, 'รับชำระเงินบางส่วนตามใบแจ้งหนี้ INV202610-0002 จาก บจก.ไทยรุ่งพัฒนา', 'อนุมัติแล้ว')
  returning id into v_jv_id;

  -- Dr. เงินฝากธนาคารกสิกรไทย 500,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_cust_id, 500000.00, 0, 'รับเงินโอนเข้าบัญชีกสิกรไทย');

  -- Cr. ลูกหนี้การค้า 500,000.00
  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_ar_id, v_cust_id, 0, 500000.00, 'ตัดยอดลูกหนี้การค้าตามใบเสร็จ RC2026110001');
end $$;

notify pgrst, 'reload schema';

