-- ============================================================
-- ANVA & CO., LTD. - Complete Enterprise Seed (Phase 10)
-- ข้อมูลจำลองครบทุกระบบ: งบประมาณ, สโตร์, บัญชีการเงิน, และ HR
-- ใช้ gen_random_uuid() อัตโนมัติ ปลอดภัย 100% ไม่มีข้อผิดพลาด UUID
-- ============================================================

-- ------------------------------------------------------------
-- 1) งบประมาณรายหมวดของแต่ละโครงการ (project_budget_items)
-- ------------------------------------------------------------
delete from project_budget_items;

insert into project_budget_items (project_id, category, budgeted_amount) values
  -- โครงการ 1: Solar Rooftop CPF สระบุรี (3,500,000 บ.)
  ((select id from projects where project_code = 'PRJ-2026-001' limit 1), 'ค่าวัสดุ', 2200000.00),
  ((select id from projects where project_code = 'PRJ-2026-001' limit 1), 'ค่าแรง', 650000.00),
  ((select id from projects where project_code = 'PRJ-2026-001' limit 1), 'ค่าเครื่องจักร', 250000.00),
  ((select id from projects where project_code = 'PRJ-2026-001' limit 1), 'ค่าผู้รับเหมาช่วง', 300000.00),
  ((select id from projects where project_code = 'PRJ-2026-001' limit 1), 'ค่าใช้จ่ายอื่น', 100000.00),

  -- โครงการ 2: ก่อสร้างอาคารและคลังสินค้า ไทยรุ่งพัฒนา (12,500,000 บ.)
  ((select id from projects where project_code = 'PRJ-2026-002' limit 1), 'ค่าวัสดุ', 7500000.00),
  ((select id from projects where project_code = 'PRJ-2026-002' limit 1), 'ค่าแรง', 2800000.00),
  ((select id from projects where project_code = 'PRJ-2026-002' limit 1), 'ค่าเครื่องจักร', 900000.00),
  ((select id from projects where project_code = 'PRJ-2026-002' limit 1), 'ค่าผู้รับเหมาช่วง', 1000000.00),
  ((select id from projects where project_code = 'PRJ-2026-002' limit 1), 'ค่าใช้จ่ายอื่น', 300000.00),

  -- โครงการ 3: ระบบไฟฟ้าและตู้ MDB รพ. ธนบุรี 2 (1,850,000 บ.)
  ((select id from projects where project_code = 'PRJ-2026-003' limit 1), 'ค่าวัสดุ', 1150000.00),
  ((select id from projects where project_code = 'PRJ-2026-003' limit 1), 'ค่าแรง', 450000.00),
  ((select id from projects where project_code = 'PRJ-2026-003' limit 1), 'ค่าใช้จ่ายอื่น', 250000.00);

-- ------------------------------------------------------------
-- 2) ประวัติการปรับปรุงยอดสต็อก (stock_adjustments)
-- ------------------------------------------------------------
delete from stock_adjustments;

insert into stock_adjustments (adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, reason, created_at) values
  ('ADJ202611-0001', (select id from inventory_items where item_code = 'EL-0002' limit 1), null, 10, 8, 85.00, 'หลอดไฟ LED ชำรุดแตกหักจากการเคลื่อนย้ายในสโตร์ 2 หลอด', '2026-11-10 10:30:00+07'),
  ('ADJ202611-0002', (select id from inventory_items where item_code = 'CV-0001' limit 1), (select id from projects where project_code = 'PRJ-2026-002' limit 1), 295, 300, 165.00, 'ตรวจนับสต็อกปูนซีเมนต์ปลายสัปดาห์ พบยอดคงเหลือจริง 300 ถุง', '2026-11-11 16:45:00+07');

-- ------------------------------------------------------------
-- 3) บัญชีและการเงิน: ตารางเตรียมจ่ายเจ้าหนี้ (accounts_payable)
-- ------------------------------------------------------------
create table if not exists accounts_payable (
  id uuid primary key default gen_random_uuid(),
  ap_no text unique not null,
  po_id uuid references purchase_orders(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  vendor_name text not null,
  invoice_no text,
  invoice_date date,
  due_date date not null,
  total_debt numeric(15,2) not null default 0,
  paid_amount numeric(15,2) not null default 0,
  remaining_amount numeric(15,2) not null default 0,
  status text default 'pending',
  payment_method text default 'โอนเงิน',
  alert_level text default 'normal',
  created_at timestamptz default now()
);

alter table accounts_payable enable row level security;
drop policy if exists "read_ap" on accounts_payable;
drop policy if exists "write_ap" on accounts_payable;
create policy "read_ap" on accounts_payable for select using (get_my_role() is not null);
create policy "write_ap" on accounts_payable for all using (get_my_role() in ('admin','accounting','management'))
  with check (get_my_role() in ('admin','accounting','management'));

delete from accounts_payable;

insert into accounts_payable (
  ap_no, po_id, vendor_id, vendor_name, invoice_no, invoice_date, due_date,
  total_debt, paid_amount, remaining_amount, status, payment_method, alert_level
) values
  ('AP202611-0001', (select id from purchase_orders where po_no = 'PO202611-0003' limit 1), (select id from vendors where vendor_code = 'V-0002' limit 1), 'ไทวัสดุ (สาขาบางบัวทอง)', 'INV-TW-8890', '2026-11-05', '2026-11-15', 12840.00, 0.00, 12840.00, 'pending', 'โอนเงิน', 'urgent'),
  ('AP202611-0002', (select id from purchase_orders where po_no = 'PO202611-0001' limit 1), (select id from vendors where vendor_code = 'V-0003' limit 1), 'บริษัท บางกอก โซล่า ซัพพลาย จำกัด', 'BKK-INV-2611', '2026-11-02', '2026-11-20', 472672.50, 200000.00, 272672.50, 'partial', 'เช็คสั่งจ่าย', 'warning'),
  ('AP202611-0003', (select id from purchase_orders where po_no = 'PO202611-0002' limit 1), (select id from vendors where vendor_code = 'V-0001' limit 1), 'SCG Home Solution (สาขาชัยพฤกษ์)', 'SCG-TAX-4412', '2026-11-04', '2026-12-04', 93600.00, 0.00, 93600.00, 'pending', 'โอนเงิน', 'normal');

-- ------------------------------------------------------------
-- 4) บัญชีและการเงิน: ค่าประกันผลงานช่าง (retention_guarantees)
-- ------------------------------------------------------------
create table if not exists retention_guarantees (
  id uuid primary key default gen_random_uuid(),
  retention_no text unique not null,
  contractor_name text not null,
  trade_type text not null,
  project_id uuid references projects(id) on delete set null,
  contract_amount numeric(15,2) not null,
  retention_rate numeric(5,2) default 5.00,
  retention_amount numeric(15,2) not null,
  release_date date not null,
  status text default 'held',
  created_at timestamptz default now()
);

alter table retention_guarantees enable row level security;
drop policy if exists "read_retention" on retention_guarantees;
drop policy if exists "write_retention" on retention_guarantees;
create policy "read_retention" on retention_guarantees for select using (get_my_role() is not null);
create policy "write_retention" on retention_guarantees for all using (get_my_role() in ('admin','accounting','management'))
  with check (get_my_role() in ('admin','accounting','management'));

delete from retention_guarantees;

insert into retention_guarantees (retention_no, contractor_name, trade_type, project_id, contract_amount, retention_rate, retention_amount, release_date, status) values
  ('RET-2026-001', 'ทีมช่างวิชาญ โซล่าร์เอ็นจิเนียริ่ง', 'solar', (select id from projects where project_code = 'PRJ-2026-001' limit 1), 300000.00, 5.00, 15000.00, '2027-05-30', 'held'),
  ('RET-2026-002', 'หจก. พัฒนาการโยธา 2019', 'civil', (select id from projects where project_code = 'PRJ-2026-002' limit 1), 1200000.00, 5.00, 60000.00, '2027-10-31', 'held'),
  ('RET-2026-003', 'ช่างสมหมาย งานระบบไฟฟ้าแรงสูง', 'electrical', (select id from projects where project_code = 'PRJ-2026-003' limit 1), 450000.00, 5.00, 22500.00, '2027-06-30', 'held');

-- ------------------------------------------------------------
-- 5) บัญชีและการเงิน: ค่าน้ำมันฟีดการ์ด (fleet_card_expenses)
-- ------------------------------------------------------------
create table if not exists fleet_card_expenses (
  id uuid primary key default gen_random_uuid(),
  slip_no text unique not null,
  vehicle_plate text not null,
  driver_name text not null,
  project_id uuid references projects(id) on delete set null,
  transaction_date date not null,
  fuel_type text default 'ดีเซล B7',
  liters numeric(10,2),
  amount numeric(15,2) not null,
  station_name text default 'ปตท. แก่งคอย',
  created_at timestamptz default now()
);

alter table fleet_card_expenses enable row level security;
drop policy if exists "read_fleet" on fleet_card_expenses;
drop policy if exists "write_fleet" on fleet_card_expenses;
create policy "read_fleet" on fleet_card_expenses for select using (get_my_role() is not null);
create policy "write_fleet" on fleet_card_expenses for all using (get_my_role() in ('admin','accounting','management'))
  with check (get_my_role() in ('admin','accounting','management'));

delete from fleet_card_expenses;

insert into fleet_card_expenses (slip_no, vehicle_plate, driver_name, project_id, transaction_date, fuel_type, liters, amount, station_name) values
  ('FLT-2611-01', '2ขข-4589 กทม.', 'สมชาย ใจมั่น (โฟร์แมน)', (select id from projects where project_code = 'PRJ-2026-001' limit 1), '2026-11-03', 'ดีเซล B7', 62.50, 1990.00, 'ปตท. นิคมแก่งคอย'),
  ('FLT-2611-02', '1ฒภ-9921 กทม.', 'ณรงค์ฤทธิ์ (วิศวกรสนาม)', (select id from projects where project_code = 'PRJ-2026-002' limit 1), '2026-11-06', 'ดีเซล B7', 58.00, 1850.00, 'บางจาก บางนา-ตราด กม.18'),
  ('FLT-2611-03', '3กบ-1144 นนทบุรี', 'สุรชัย (ฝ่ายสโตร์ขนส่ง)', null, '2026-11-08', 'ดีเซล B7', 45.20, 1440.00, 'ปตท. กาญจนาภิเษก-บางบัวทอง');

-- ------------------------------------------------------------
-- 6) ทะเบียนพนักงานบริษัท (employees)
-- ------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  emp_code text unique not null,
  full_name text not null,
  department text not null,
  position text not null,
  salary numeric(15,2) default 0,
  phone text,
  start_date date,
  status text default 'active',
  created_at timestamptz default now()
);

alter table employees enable row level security;
drop policy if exists "read_employees" on employees;
drop policy if exists "write_employees" on employees;
create policy "read_employees" on employees for select using (get_my_role() is not null);
create policy "write_employees" on employees for all using (get_my_role() in ('admin','hr','management'))
  with check (get_my_role() in ('admin','hr','management'));

delete from employees;

insert into employees (id, emp_code, full_name, department, position, salary, phone, start_date, status) values
  ('00000000-0000-0000-0000-000000000001', 'EMP-001', 'มาเรียม จะปะกียา', 'บริหาร / จัดซื้อ', 'หัวหน้าฝ่ายจัดซื้อและขายโครงการ', 42000.00, '089-111-2233', '2023-01-10', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'EMP-002', 'นายปริญญา ชัยชนะ', 'วิศวกรรมและโครงการ', 'วิศวกรไฟฟ้าอาวุโส (PM โซล่าเซลล์)', 55000.00, '081-444-5566', '2022-06-15', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'EMP-003', 'นายสมชาย ใจมั่น', 'วิศวกรรมและโครงการ', 'โฟร์แมนควบคุมงานสนาม', 28000.00, '086-777-8899', '2024-02-01', 'active'),
  ('00000000-0000-0000-0000-000000000004', 'EMP-004', 'นางสาวกนกพร สิทธิโชค', 'บัญชีและการเงิน', 'เจ้าหน้าที่บัญชีและการเงินอาวุโส', 35000.00, '082-333-4455', '2023-08-01', 'active'),
  ('00000000-0000-0000-0000-000000000005', 'EMP-005', 'นายสุรชัย มั่นคง', 'จัดซื้อและคลัง', 'หัวหน้าเจ้าหน้าที่คลังสินค้าสโตร์', 25000.00, '085-999-0011', '2024-05-15', 'active'),
  ('00000000-0000-0000-0000-000000000006', 'EMP-006', 'นายอานนท์ รัตนโชติ', 'วิศวกรรมและโครงการ', 'ช่างเทคนิคไฟฟ้าและโซล่าเซลล์', 20000.00, '084-222-3344', '2025-01-05', 'active');

-- ------------------------------------------------------------
-- 7) การลงเวลาทำงาน GPS & OT (attendance_records)
-- ------------------------------------------------------------
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  emp_id uuid references employees(id) on delete cascade,
  emp_name text not null,
  work_date date not null,
  check_in_time text,
  check_out_time text,
  gps_location text,
  ot_hours numeric(5,2) default 0,
  status text default 'normal',
  created_at timestamptz default now()
);

alter table attendance_records enable row level security;
drop policy if exists "read_attendance" on attendance_records;
drop policy if exists "write_attendance" on attendance_records;
create policy "read_attendance" on attendance_records for select using (get_my_role() is not null);
create policy "write_attendance" on attendance_records for all using (get_my_role() in ('admin','hr','management'))
  with check (get_my_role() in ('admin','hr','management'));

delete from attendance_records;

insert into attendance_records (emp_id, emp_name, work_date, check_in_time, check_out_time, gps_location, ot_hours, status) values
  ((select id from employees where emp_code = 'EMP-002' limit 1), 'นายปริญญา ชัยชนะ', '2026-11-12', '07:55', '17:30', '14.5821, 100.9982 (โรงงาน CPF สระบุรี)', 1.5, 'normal'),
  ((select id from employees where emp_code = 'EMP-003' limit 1), 'นายสมชาย ใจมั่น', '2026-11-12', '08:02', '18:00', '14.5823, 100.9980 (โรงงาน CPF สระบุรี)', 2.0, 'normal'),
  ((select id from employees where emp_code = 'EMP-005' limit 1), 'นายสุรชัย มั่นคง', '2026-11-12', '08:15', '17:05', '13.8824, 100.4120 (สโตร์กลางบริษัท นนทบุรี)', 0.0, 'late'),
  ((select id from employees where emp_code = 'EMP-004' limit 1), 'นางสาวกนกพร สิทธิโชค', '2026-11-12', '08:25', '17:40', '13.8510, 100.4890 (สำนักงานใหญ่ ANVA)', 0.5, 'normal');

-- ------------------------------------------------------------
-- 8) การขอลาและอนุมัติ (leave_requests)
-- ------------------------------------------------------------
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  emp_id uuid references employees(id) on delete cascade,
  emp_name text not null,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(4,1) default 1,
  reason text,
  status text default 'approved',
  approver text,
  created_at timestamptz default now()
);

alter table leave_requests enable row level security;
drop policy if exists "read_leaves" on leave_requests;
drop policy if exists "write_leaves" on leave_requests;
create policy "read_leaves" on leave_requests for select using (get_my_role() is not null);
create policy "write_leaves" on leave_requests for all using (get_my_role() in ('admin','hr','management'))
  with check (get_my_role() in ('admin','hr','management'));

delete from leave_requests;

insert into leave_requests (emp_id, emp_name, leave_type, start_date, end_date, days, reason, status, approver) values
  ((select id from employees where emp_code = 'EMP-006' limit 1), 'นายอานนท์ รัตนโชติ', 'sick', '2026-11-11', '2026-11-11', 1.0, 'มีไข้หวัด พบแพทย์ รพ.บางใหญ่ มีใบรับรองแพทย์', 'approved', 'ปริญญา (PM)'),
  ((select id from employees where emp_code = 'EMP-003' limit 1), 'นายสมชาย ใจมั่น', 'personal', '2026-11-18', '2026-11-18', 1.0, 'ติดต่อธุระทางราชการที่สำนักงานที่ดิน', 'pending', null);

-- ------------------------------------------------------------
-- 9) ทรัพย์สินและอุปกรณ์บริษัท (company_assets)
-- ------------------------------------------------------------
create table if not exists company_assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text unique not null,
  asset_name text not null,
  category text not null,
  serial_no text,
  assigned_to text,
  purchase_date date,
  purchase_cost numeric(15,2),
  status text default 'in_use',
  created_at timestamptz default now()
);

alter table company_assets enable row level security;
drop policy if exists "read_assets" on company_assets;
drop policy if exists "write_assets" on company_assets;
create policy "read_assets" on company_assets for select using (get_my_role() is not null);
create policy "write_assets" on company_assets for all using (get_my_role() in ('admin','hr','management'))
  with check (get_my_role() in ('admin','hr','management'));

delete from company_assets;

insert into company_assets (asset_code, asset_name, category, serial_no, assigned_to, purchase_date, purchase_cost, status) values
  ('AST-VEH-01', 'รถกระบะ Toyota Hilux Revo 4 ประตู (2ขข-4589)', 'ยานพาหนะ', 'MR0BA3CD2019882', 'นายสมชาย ใจมั่น (โฟร์แมน)', '2023-03-10', 785000.00, 'in_use'),
  ('AST-IT-01', 'โน้ตบุ๊ก Dell Latitude 5430 (Core i7 / RAM 16GB)', 'คอมพิวเตอร์และไอที', 'SN-DELL-8874102', 'นายปริญญา ชัยชนะ (วิศวกร)', '2024-01-15', 38900.00, 'in_use'),
  ('AST-TLS-01', 'เครื่องเชื่อมอินเวอร์เตอร์และชุดกล้องระดับ Topcon', 'เครื่องมือวัดและก่อสร้าง', 'TOP-AT-B4A-5591', 'ทีมช่างสนามประจำสโตร์', '2023-07-20', 45000.00, 'in_use');

notify pgrst, 'reload schema';
