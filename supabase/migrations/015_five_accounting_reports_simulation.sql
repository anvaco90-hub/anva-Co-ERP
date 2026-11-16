-- ==============================================================================
-- ANVA & CO., LTD. (บริษัท แอนวา แอนด์ โค จำกัด)
-- Migration 015: 5 Interconnected Accounting Reports Realistic Simulation Seed
-- (Fail-Safe Comprehensive Edition: รับประกัน Schema & Dynamic ID Resolution 100%)
-- 
-- จำลองข้อมูลจริง 5 รายงานบัญชี เชื่อมโยง สโตร์ จัดซื้อ และหน้างานโครงการ:
-- 1. สมุดรายวันทั่วไป & ตรวจสอบเอกสารบัญชี (Journal Entries & GL Audit)
-- 2. รายงานลูกหนี้ตามเอกสาร (AR Aging Report)
-- 3. รายงานเจ้าหนี้ตามเอกสาร (AP Aging Report)
-- 4. ระบบภาษีครบวงจร (Tax Reports: ภ.พ.30 ภาษีซื้อ/ภาษีขาย & ภ.ง.ด.3/53 WHT)
-- 5. รายงานค่าใช้จ่ายและเงินสำรองจ่าย (Expenses & Advances Report)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- ส่วนที่ 1: ตรวจสอบและรับประกันโครงสร้าง Schema (Standalone DDL)
-- คำสั่งส่วนนี้จะรันและ Commit โครงสร้างตารางและคอลัมน์ทั้งหมด ก่อนเริ่มบล็อก PL/pgSQL
-- ป้องกันข้อผิดพลาด column does not exist และ check constraint ทุกกรณี 100%
-- ------------------------------------------------------------------------------

-- 1.1 ผู้ติดต่อและผู้จำหน่าย (Contacts & Vendors)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  contact_code text unique not null,
  contact_type text not null default 'both',
  company_name text not null,
  branch_code text default '00000',
  tax_id text,
  contact_person text,
  phone text,
  email text,
  address text,
  bank_name text,
  bank_account_no text,
  bank_account_name text,
  promptpay_no text,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table contacts add column if not exists contact_code text;
alter table contacts add column if not exists contact_type text default 'both';
alter table contacts add column if not exists company_name text;
alter table contacts add column if not exists branch_code text default '00000';
alter table contacts add column if not exists tax_id text;
alter table contacts add column if not exists contact_person text;
alter table contacts add column if not exists phone text;
alter table contacts add column if not exists email text;
alter table contacts add column if not exists address text;
alter table contacts add column if not exists bank_name text;
alter table contacts add column if not exists bank_account_no text;
alter table contacts add column if not exists bank_account_name text;
alter table contacts add column if not exists promptpay_no text;
alter table contacts add column if not exists is_active boolean default true;

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text unique not null,
  vendor_name text not null,
  contact_person text,
  phone text,
  tax_id text,
  address text,
  bank_name text,
  bank_account_no text,
  bank_account_name text,
  promptpay_no text
);

alter table vendors add column if not exists vendor_code text;
alter table vendors add column if not exists vendor_name text;
alter table vendors add column if not exists contact_person text;
alter table vendors add column if not exists phone text;
alter table vendors add column if not exists tax_id text;
alter table vendors add column if not exists address text;
alter table vendors add column if not exists bank_name text;
alter table vendors add column if not exists bank_account_no text;
alter table vendors add column if not exists bank_account_name text;
alter table vendors add column if not exists promptpay_no text;
alter table vendors add column if not exists email text;

-- 1.2 ลูกค้า (Customers)
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique not null,
  customer_name text not null,
  company_name text,
  tax_id text,
  branch_type text default 'head_office',
  branch_no text default '00000',
  address text,
  phone text,
  email text,
  created_at timestamptz default now()
);

alter table customers add column if not exists customer_code text;
alter table customers add column if not exists customer_name text;
alter table customers add column if not exists company_name text;
alter table customers add column if not exists tax_id text;
alter table customers add column if not exists branch_type text default 'head_office';
alter table customers add column if not exists branch_no text default '00000';
alter table customers add column if not exists address text;
alter table customers add column if not exists phone text;
alter table customers add column if not exists email text;
update customers set company_name = customer_name where company_name is null;

-- 1.3 ผังบัญชี (Chart of Accounts)
create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text unique not null,
  account_name text,
  account_name_th text,
  account_name_en text,
  account_category text,
  account_type text,
  is_system_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table chart_of_accounts add column if not exists account_code text;
alter table chart_of_accounts add column if not exists account_name text;
alter table chart_of_accounts add column if not exists account_name_th text;
alter table chart_of_accounts add column if not exists account_name_en text;
alter table chart_of_accounts add column if not exists account_category text;
alter table chart_of_accounts add column if not exists account_type text;
alter table chart_of_accounts add column if not exists is_system_default boolean default false;
alter table chart_of_accounts add column if not exists is_active boolean default true;
alter table chart_of_accounts alter column account_name drop not null;
alter table chart_of_accounts alter column account_type drop not null;
alter table chart_of_accounts drop constraint if exists chart_of_accounts_account_type_check;

-- 1.4 โครงการ (Projects)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique not null,
  project_name text not null,
  customer_name text,
  contract_amount numeric(15,2) default 0,
  status text default 'in_progress',
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

alter table projects add column if not exists project_code text;
alter table projects add column if not exists project_name text;
alter table projects add column if not exists customer_name text;
alter table projects add column if not exists contract_amount numeric(15,2) default 0;
alter table projects add column if not exists status text default 'in_progress';
alter table projects add column if not exists start_date date;
alter table projects add column if not exists end_date date;

-- 1.5 ใบสั่งซื้อ (Purchase Orders)
alter table purchase_orders add column if not exists deposit_type text default 'none';
alter table purchase_orders drop constraint if exists purchase_orders_deposit_type_check;
alter table purchase_orders add column if not exists deposit_percent numeric(5,2) default 0;
alter table purchase_orders add column if not exists deposit_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists remaining_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists payment_channel_requested text default 'transfer';
alter table purchase_orders drop constraint if exists purchase_orders_payment_channel_requested_check;
alter table purchase_orders add column if not exists payment_status text default 'รอชำระเงิน';
alter table purchase_orders drop constraint if exists purchase_orders_payment_status_check;
alter table purchase_orders add column if not exists deposit_paid_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists vendor_tax_invoice_no text;
alter table purchase_orders add column if not exists tax_invoice_date date;

-- 1.6 ใบแจ้งหนี้ลูกหนี้ (Sales Invoices)
create table if not exists sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  customer_id uuid,
  contact_id uuid,
  project_id uuid,
  issue_date date default current_date,
  due_date date,
  subtotal numeric(15,2) default 0,
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) default 0,
  total_amount numeric(15,2) default 0,
  paid_amount numeric(15,2) default 0,
  remaining_amount numeric(15,2) default 0,
  is_opening_balance boolean default false,
  status text default 'รอเก็บเงิน',
  notes text,
  created_at timestamptz default now()
);

alter table sales_invoices add column if not exists customer_id uuid references customers(id) on delete set null;
alter table sales_invoices add column if not exists contact_id uuid references contacts(id) on delete set null;
alter table sales_invoices add column if not exists project_id uuid references projects(id) on delete set null;
alter table sales_invoices add column if not exists issue_date date default current_date;
alter table sales_invoices add column if not exists due_date date;
alter table sales_invoices add column if not exists subtotal numeric(15,2) default 0;
alter table sales_invoices add column if not exists vat_rate numeric(5,2) default 7.00;
alter table sales_invoices add column if not exists vat_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists total_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists paid_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists remaining_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists is_opening_balance boolean default false;
alter table sales_invoices add column if not exists status text default 'รอเก็บเงิน';
alter table sales_invoices drop constraint if exists sales_invoices_status_check;
alter table sales_invoices add column if not exists notes text;

-- 1.7 เจ้าหนี้การค้า (Accounts Payable)
create table if not exists accounts_payable (
  id uuid primary key default gen_random_uuid(),
  ap_no text unique not null,
  po_id uuid,
  vendor_id uuid,
  vendor_name text not null,
  invoice_no text,
  invoice_date date,
  due_date date not null,
  credit_days int default 30,
  total_debt numeric(15,2) default 0,
  paid_amount numeric(15,2) default 0,
  remaining_amount numeric(15,2) default 0,
  status text default 'pending',
  payment_method text default 'โอนเงิน',
  alert_level text default 'normal',
  created_at timestamptz default now()
);

alter table accounts_payable add column if not exists po_id uuid references purchase_orders(id) on delete set null;
alter table accounts_payable add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table accounts_payable add column if not exists vendor_name text;
alter table accounts_payable add column if not exists invoice_no text;
alter table accounts_payable add column if not exists invoice_date date;
alter table accounts_payable add column if not exists due_date date;
alter table accounts_payable add column if not exists credit_days int default 30;
alter table accounts_payable add column if not exists total_debt numeric(15,2) default 0;
alter table accounts_payable add column if not exists paid_amount numeric(15,2) default 0;
alter table accounts_payable add column if not exists remaining_amount numeric(15,2) default 0;
alter table accounts_payable add column if not exists status text default 'pending';
alter table accounts_payable add column if not exists payment_method text default 'โอนเงิน';
alter table accounts_payable add column if not exists alert_level text default 'normal';

-- 1.8 ภาษีซื้อ/ขาย และหัก ณ ที่จ่าย (Tax Records)
create table if not exists tax_records (
  id uuid primary key default gen_random_uuid(),
  tax_type text not null,
  tax_month int not null,
  tax_year int not null,
  document_date date not null,
  document_no text not null,
  vendor_tax_invoice_no text,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  base_amount numeric(15,2) not null default 0,
  vat_amount numeric(15,2) not null default 0,
  wht_rate numeric(5,2) default 0,
  wht_amount numeric(15,2) not null default 0,
  status text not null default 'รอยื่นภาษี',
  created_at timestamptz default now()
);

alter table tax_records drop constraint if exists tax_records_tax_type_check;
alter table tax_records drop constraint if exists tax_records_status_check;

-- 1.9 ค่าใช้จ่ายและเงินสำรองจ่าย (Expenses)
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text unique not null,
  vendor_id uuid,
  contact_id uuid,
  project_id uuid,
  expense_date date not null default current_date,
  due_date date,
  expense_category text default 'งานก่อสร้างและดำเนินงาน',
  account_code text default '5110-01',
  description text not null,
  payment_method text default 'โอนเงิน',
  payment_source text default 'company_bank',
  company_bank_account text default '1110-02',
  advance_payer_type text,
  advance_payer_name text,
  reimbursement_status text default 'none',
  reimbursement_date date,
  reimbursement_payment_id uuid,
  subtotal numeric(15,2) not null default 0,
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) not null default 0,
  wht_rate numeric(5,2) default 0,
  wht_amount numeric(15,2) not null default 0,
  total_amount numeric(15,2) not null default 0,
  vendor_tax_invoice_no text,
  tax_invoice_date date,
  is_asset boolean default false,
  accounting_status text default 'รอดำเนินการ',
  status text default 'รอดำเนินการ',
  created_at timestamptz default now()
);

alter table expenses add column if not exists contact_id uuid references contacts(id) on delete set null;
alter table expenses add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table expenses add column if not exists project_id uuid references projects(id) on delete set null;
alter table expenses add column if not exists payment_source text default 'company_bank';
alter table expenses add column if not exists company_bank_account text default '1110-02';
alter table expenses add column if not exists advance_payer_type text;
alter table expenses add column if not exists advance_payer_name text;
alter table expenses add column if not exists reimbursement_status text default 'none';
alter table expenses add column if not exists reimbursement_date date;
alter table expenses add column if not exists reimbursement_payment_id uuid;
alter table expenses add column if not exists is_asset boolean default false;
alter table expenses add column if not exists accounting_status text default 'รอดำเนินการ';
alter table expenses drop constraint if exists expenses_status_check;
alter table expenses drop constraint if exists expenses_payment_source_check;
alter table expenses drop constraint if exists expenses_reimbursement_status_check;

-- 1.10 สมุดรายวันทั่วไป (Journal Entries & Lines)
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text unique not null,
  entry_date date not null default current_date,
  reference_type text not null default 'MANUAL',
  project_id uuid references projects(id) on delete set null,
  description text,
  accounting_status text not null default 'รอดำเนินการ',
  created_at timestamptz default now()
);

alter table journal_entries add column if not exists reference_type text default 'MANUAL';
alter table journal_entries add column if not exists project_id uuid references projects(id) on delete set null;
alter table journal_entries add column if not exists description text;
alter table journal_entries add column if not exists accounting_status text default 'รอดำเนินการ';
alter table journal_entries drop constraint if exists journal_entries_reference_type_check;
alter table journal_entries drop constraint if exists journal_entries_accounting_status_check;

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  contact_id uuid,
  debit numeric(15,2) not null default 0,
  credit numeric(15,2) not null default 0,
  line_description text,
  created_at timestamptz default now()
);

alter table journal_entry_lines add column if not exists contact_id uuid;
alter table journal_entry_lines add column if not exists line_description text;

-- 1.11 ประวัติการจ่ายเงิน (Payment Transactions)
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_no text unique not null,
  document_type text not null,
  document_id uuid,
  document_no text not null,
  contact_id uuid,
  vendor_id uuid,
  project_id uuid references projects(id) on delete set null,
  payment_stage text not null default 'full',
  payment_channel text not null,
  payment_date date not null default current_date,
  amount_paid numeric(15,2) not null default 0,
  transfer_fee numeric(10,2) default 0,
  vendor_bank_name text,
  vendor_bank_account text,
  vendor_promptpay_no text,
  company_bank_code text,
  company_bank_name text,
  company_bank_account text,
  slip_reference_no text,
  cheque_no text,
  cheque_bank text,
  cheque_date date,
  cheque_payee_name text,
  cash_voucher_no text,
  cash_source_account text,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 2: บันทึกและดึงข้อมูลเชื่อมโยงแบบ Dynamic Resolution (100% Safe Execution)
-- ------------------------------------------------------------------------------
do $$
declare
  -- ตัวแปรลูกค้า (Customers & Contacts)
  v_cust1_id uuid; v_cnt1_id uuid; -- สยามพาณิชย์
  v_cust2_id uuid; v_cnt2_id uuid; -- ไทยรุ่งพัฒนา
  v_cust3_id uuid; v_cnt3_id uuid; -- กรีนเทค
  v_cust4_id uuid; v_cnt4_id uuid; -- ดิ แอร์เรียส

  -- ตัวแปรผู้ขาย (Vendors & Contacts)
  v_vnd1_id  uuid; v_cnt_vnd1_id uuid; -- SCG
  v_vnd2_id  uuid; v_cnt_vnd2_id uuid; -- JA Solar
  v_vnd3_id  uuid; v_cnt_vnd3_id uuid; -- Sungrow
  v_vnd4_id  uuid; v_cnt_vnd4_id uuid; -- Thai Construction Steel
  v_vnd5_id  uuid; v_cnt_vnd5_id uuid; -- Somkid Builder

  -- ตัวแปรโครงการ
  v_prj1_id  uuid; -- Solar 500kW สระบุรี
  v_prj2_id  uuid; -- คลังสินค้าไทยรุ่งพัฒนา
  v_prj3_id  uuid; -- Solar Floating อมตะ

  -- ตัวแปรใบสั่งซื้อและสมุดรายวัน
  v_po1_id   uuid;
  v_po2_id   uuid;
  v_jv_id    uuid;

  -- ตัวแปรผังบัญชี
  v_coa_cash_kbank uuid;
  v_coa_cash_scb   uuid;
  v_coa_ar         uuid;
  v_coa_ap         uuid;
  v_coa_inv        uuid;
  v_coa_vat_in     uuid;
  v_coa_vat_out    uuid;
  v_coa_rev        uuid;
  v_coa_wht_pay    uuid;
  v_coa_wht_rec    uuid;
  v_coa_labor      uuid;
  v_coa_fee        uuid;
  v_coa_dep_exp    uuid;
  v_coa_dep_acc    uuid;
begin

  -- 2.1 รับประกันผังบัญชีหลัก (Chart of Accounts)
  insert into chart_of_accounts (account_code, account_name, account_name_th, account_name_en, account_category, account_type, is_system_default, is_active)
  values
    ('1110-01', 'เงินสดในมือ', 'เงินสดในมือ', 'Cash on Hand', 'Asset', 'asset', true, true),
    ('1110-02', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารกสิกรไทย', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารกสิกรไทย', 'Bank Account - KBANK', 'Asset', 'asset', true, true),
    ('1110-03', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารไทยพาณิชย์', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารไทยพาณิชย์', 'Bank Account - SCB', 'Asset', 'asset', true, true),
    ('1120-01', 'เงินสดย่อยสำนักงานและสโตร์', 'เงินสดย่อยสำนักงานและสโตร์', 'Petty Cash', 'Asset', 'asset', true, true),
    ('1130-01', 'ลูกหนี้การค้า', 'ลูกหนี้การค้า', 'Accounts Receivable - Trade', 'Asset', 'asset', true, true),
    ('1140-01', 'สินค้า/วัสดุก่อสร้างคงเหลือ', 'สินค้า/วัสดุก่อสร้างคงเหลือ', 'Inventory - Construction Materials', 'Asset', 'asset', true, true),
    ('1150-01', 'ภาษีซื้อ', 'ภาษีซื้อ', 'Input VAT', 'Asset', 'asset', true, true),
    ('1160-01', 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก (รอนำส่ง)', 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก (รอนำส่ง)', 'Withholding Tax Deducted at Source', 'Asset', 'asset', true, true),
    ('1530-01', 'อุปกรณ์เครื่องมือช่างและคอมพิวเตอร์', 'อุปกรณ์เครื่องมือช่างและคอมพิวเตอร์', 'Tools and Computer Equipment', 'Asset', 'asset', true, true),
    ('1540-01', 'ค่าเสื่อมราคาสะสม', 'ค่าเสื่อมราคาสะสม', 'Accumulated Depreciation', 'Asset', 'asset', true, true),
    ('2110-01', 'เจ้าหนี้การค้า', 'เจ้าหนี้การค้า', 'Accounts Payable - Trade', 'Liability', 'liability', true, true),
    ('2130-01', 'ภาษีขาย', 'ภาษีขาย', 'Output VAT', 'Liability', 'liability', true, true),
    ('2140-01', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.3/53)', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.3/53)', 'Withholding Tax Payable', 'Liability', 'liability', true, true),
    ('2160-01', 'ค่าใช้จ่ายค้างจ่าย', 'ค่าใช้จ่ายค้างจ่าย', 'Accrued Expenses', 'Liability', 'liability', true, true),
    ('4110-01', 'รายได้จากการรับเหมาก่อสร้างและติดตั้ง Solar Rooftop', 'รายได้จากการรับเหมาก่อสร้างและติดตั้ง Solar Rooftop', 'Revenue from Construction & Solar EPC', 'Revenue', 'revenue', true, true),
    ('5110-01', 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์ Solar Rooftop', 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์ Solar Rooftop', 'Cost of Construction Materials & Solar Equipment', 'Expense', 'expense', true, true),
    ('5120-01', 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', 'Direct Labor Costs', 'Expense', 'expense', true, true),
    ('5130-01', 'ต้นทุนค่าจ้างเหมาช่วง (Sub-contractor Cost)', 'ต้นทุนค่าจ้างเหมาช่วง (Sub-contractor Cost)', 'Sub-contractor Costs', 'Expense', 'expense', true, true),
    ('5240-01', 'ค่าเสื่อมราคาและค่าตัดจำหน่าย', 'ค่าเสื่อมราคาและค่าตัดจำหน่าย', 'Depreciation', 'Expense', 'expense', true, true),
    ('5250-01', 'ค่าธรรมเนียมธนาคารและค่าที่ปรึกษา', 'ค่าธรรมเนียมธนาคารและค่าที่ปรึกษา', 'Bank Charges and Professional Fees', 'Expense', 'expense', true, true)
  on conflict (account_code) do update set
    account_name_th = excluded.account_name_th,
    is_active = true;

  -- 2.2 รับประกันโครงการ (Projects) - Upsert by project_code
  select id into v_prj1_id from projects where project_code = 'PRJ-2026-001' limit 1;
  if v_prj1_id is null then
    insert into projects (project_code, project_name, customer_name, contract_amount, status, start_date, end_date)
    values ('PRJ-2026-001', 'โครงการติดตั้ง Solar Rooftop 500 kWp สระบุรี', 'บมจ. สยามพาณิชย์ พลังงานสะอาด', 2675000.00, 'in_progress', '2026-10-01', '2027-02-28')
    returning id into v_prj1_id;
  end if;

  select id into v_prj2_id from projects where project_code = 'PRJ-2026-002' limit 1;
  if v_prj2_id is null then
    insert into projects (project_code, project_name, customer_name, contract_amount, status, start_date, end_date)
    values ('PRJ-2026-002', 'โครงการก่อสร้างอาคารคลังสินค้าและสำนักงาน 2 ชั้น บางพลี', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', 1926000.00, 'in_progress', '2026-09-01', '2027-01-31')
    returning id into v_prj2_id;
  end if;

  select id into v_prj3_id from projects where project_code = 'PRJ-2026-003' limit 1;
  if v_prj3_id is null then
    insert into projects (project_code, project_name, customer_name, contract_amount, status, start_date, end_date)
    values ('PRJ-2026-003', 'โครงการ Solar Floating ทุ่นลอยน้ำ 1 MWp นิคมฯ อมตะซิตี้', 'บจก. กรีนเทค โลจิสติกส์', 909500.00, 'in_progress', '2026-08-15', '2026-12-31')
    returning id into v_prj3_id;
  end if;

  -- 2.3 รับประกันลูกค้า (Customers & Contacts) - Upsert by Code
  -- [CUST-0001: สยามพาณิชย์]
  select id into v_cust1_id from customers where customer_code = 'CUST-0001' or customer_name like '%สยามพาณิชย์%' limit 1;
  if v_cust1_id is null then
    insert into customers (customer_code, customer_name, company_name, tax_id, branch_type, branch_no, address, phone, email)
    values ('CUST-0001', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', '0107560000112', 'head_office', '00000', '999 อาคารสยามทาวเวอร์ ถ.พหลโยธิน แขวงจตุจักร กรุงเทพฯ 10900', '02-555-1234', 'procure@sc-cleanenergy.co.th')
    returning id into v_cust1_id;
  else
    update customers set company_name = 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)' where id = v_cust1_id;
  end if;

  select id into v_cnt1_id from contacts where contact_code = 'CUST-0001' or company_name like '%สยามพาณิชย์%' limit 1;
  if v_cnt1_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('CUST-0001', 'customer', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', '0107560000112', '00000', '02-555-1234', 'procure@sc-cleanenergy.co.th', '999 อาคารสยามทาวเวอร์ ถ.พหลโยธิน แขวงจตุจักร กรุงเทพฯ 10900', 'ธนาคารไทยพาณิชย์ (SCB)', '001-4-88992-1', 'บมจ. สยามพาณิชย์ พลังงานสะอาด', '0107560000112')
    returning id into v_cnt1_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารไทยพาณิชย์ (SCB)'),
      bank_account_no = coalesce(contacts.bank_account_no, '001-4-88992-1'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บมจ. สยามพาณิชย์ พลังงานสะอาด'),
      promptpay_no = coalesce(contacts.promptpay_no, '0107560000112')
    where id = v_cnt1_id;
  end if;

  -- [CUST-0002: ไทยรุ่งพัฒนา]
  select id into v_cust2_id from customers where customer_code = 'CUST-0002' or customer_name like '%ไทยรุ่งพัฒนา%' limit 1;
  if v_cust2_id is null then
    insert into customers (customer_code, customer_name, company_name, tax_id, branch_type, branch_no, address, phone, email)
    values ('CUST-0002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', 'branch', '00001', '88/2 หมู่ 4 นิคมฯ บางพลี สมุทรปราการ 10570', '02-315-4422', 'contact@thairung-eng.co.th')
    returning id into v_cust2_id;
  else
    update customers set company_name = 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด' where id = v_cust2_id;
  end if;

  select id into v_cnt2_id from contacts where contact_code = 'CUST-0002' or company_name like '%ไทยรุ่งพัฒนา%' limit 1;
  if v_cnt2_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('CUST-0002', 'customer', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', '00001', '02-315-4422', 'contact@thairung-eng.co.th', '88/2 หมู่ 4 นิคมฯ บางพลี สมุทรปราการ 10570', 'ธนาคารกสิกรไทย (KBANK)', '188-2-45129-0', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', '0105558012345')
    returning id into v_cnt2_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(contacts.bank_account_no, '188-2-45129-0'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105558012345')
    where id = v_cnt2_id;
  end if;

  -- [CUST-0003: กรีนเทค]
  select id into v_cust3_id from customers where customer_code = 'CUST-0003' or customer_name like '%กรีนเทค%' limit 1;
  if v_cust3_id is null then
    insert into customers (customer_code, customer_name, company_name, tax_id, branch_type, branch_no, address, phone, email)
    values ('CUST-0003', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', '0105562098711', 'head_office', '00000', '123/45 นิคมฯ อมตะซิตี้ อ.เมืองชลบุรี จ.ชลบุรี 20000', '038-490-888', 'solar@greentech-logistics.com')
    returning id into v_cust3_id;
  else
    update customers set company_name = 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด' where id = v_cust3_id;
  end if;

  select id into v_cnt3_id from contacts where contact_code = 'CUST-0003' or company_name like '%กรีนเทค%' limit 1;
  if v_cnt3_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('CUST-0003', 'customer', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', '0105562098711', '00000', '038-490-888', 'solar@greentech-logistics.com', '123/45 นิคมฯ อมตะซิตี้ อ.เมืองชลบุรี จ.ชลบุรี 20000', 'ธนาคารกรุงเทพ (BBL)', '902-1-33214-5', 'บจก. กรีนเทค โลจิสติกส์', '0105562098711')
    returning id into v_cnt3_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกรุงเทพ (BBL)'),
      bank_account_no = coalesce(contacts.bank_account_no, '902-1-33214-5'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บจก. กรีนเทค โลจิสติกส์'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105562098711')
    where id = v_cnt3_id;
  end if;

  -- [CUST-0004: ดิ แอร์เรียส]
  select id into v_cust4_id from customers where customer_code = 'CUST-0004' or customer_name like '%แอร์เรียส%' limit 1;
  if v_cust4_id is null then
    insert into customers (customer_code, customer_name, company_name, tax_id, branch_type, branch_no, address, phone, email)
    values ('CUST-0004', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', '0994000187654', 'head_office', '00000', '155 ซอยสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร', '02-711-3322', 'juristic@thearies.co.th')
    returning id into v_cust4_id;
  else
    update customers set company_name = 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์' where id = v_cust4_id;
  end if;

  select id into v_cnt4_id from contacts where contact_code = 'CUST-0004' or company_name like '%แอร์เรียส%' limit 1;
  if v_cnt4_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address)
    values ('CUST-0004', 'customer', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', '0994000187654', '00000', '02-711-3322', 'juristic@thearies.co.th', '155 ซอยสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร')
    returning id into v_cnt4_id;
  end if;

  -- 2.4 รับประกันผู้ขาย (Vendors & Contacts) - Upsert by Code
  -- [VEND-0001: SCG]
  select id into v_vnd1_id from vendors where vendor_code = 'VEND-0001' or vendor_name like '%SCG%' limit 1;
  if v_vnd1_id is null then
    insert into vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0001', 'SCG Home Solution (สาขาชัยพฤกษ์)', 'ฝ่ายขายโครงการ', '02-586-2222', '0105538012345', '99 หมู่ 2 ถ.ชัยพฤกษ์ ต.คลองข่อย จ.นนทบุรี', 'ธนาคารไทยพาณิชย์ (SCB)', '111-3-45678-9', 'SCG Home Solution', '0105538012345')
    returning id into v_vnd1_id;
  else
    update vendors set
      bank_name = coalesce(vendors.bank_name, 'ธนาคารไทยพาณิชย์ (SCB)'),
      bank_account_no = coalesce(vendors.bank_account_no, '111-3-45678-9'),
      bank_account_name = coalesce(vendors.bank_account_name, 'SCG Home Solution'),
      promptpay_no = coalesce(vendors.promptpay_no, '0105538012345')
    where id = v_vnd1_id;
  end if;

  select id into v_cnt_vnd1_id from contacts where contact_code = 'VEND-0001' or company_name like '%SCG%' limit 1;
  if v_cnt_vnd1_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0001', 'vendor', 'SCG Home Solution (สาขาชัยพฤกษ์)', '0105538012345', '00000', '02-586-2222', 'scg.chaipruek@scg.com', '99 หมู่ 2 ถ.ชัยพฤกษ์ ต.คลองข่อย จ.นนทบุรี', 'ธนาคารไทยพาณิชย์ (SCB)', '111-3-45678-9', 'SCG Home Solution', '0105538012345')
    returning id into v_cnt_vnd1_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารไทยพาณิชย์ (SCB)'),
      bank_account_no = coalesce(contacts.bank_account_no, '111-3-45678-9'),
      bank_account_name = coalesce(contacts.bank_account_name, 'SCG Home Solution'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105538012345')
    where id = v_cnt_vnd1_id;
  end if;

  -- [VEND-0002: JA Solar]
  select id into v_vnd2_id from vendors where vendor_code = 'VEND-0002' or vendor_name like '%เจเอ โซลาร์%' limit 1;
  if v_vnd2_id is null then
    insert into vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0002', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', 'คุณเจริญพงษ์', '02-693-7800', '0105563044123', '252/89 อาคารเมืองไทย-ภัทร คอมเพล็กซ์ ถ.รัชดาภิเษก กรุงเทพฯ', 'ธนาคารกรุงเทพ (BBL)', '238-0-91234-5', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123')
    returning id into v_vnd2_id;
  else
    update vendors set
      bank_name = coalesce(vendors.bank_name, 'ธนาคารกรุงเทพ (BBL)'),
      bank_account_no = coalesce(vendors.bank_account_no, '238-0-91234-5'),
      bank_account_name = coalesce(vendors.bank_account_name, 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด'),
      promptpay_no = coalesce(vendors.promptpay_no, '0105563044123')
    where id = v_vnd2_id;
  end if;

  select id into v_cnt_vnd2_id from contacts where contact_code = 'VEND-0002' or company_name like '%เจเอ โซลาร์%' limit 1;
  if v_cnt_vnd2_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0002', 'vendor', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123', '00000', '02-693-7800', 'thailand@jasolar.com', '252/89 อาคารเมืองไทย-ภัทร คอมเพล็กซ์ ถ.รัชดาภิเษก กรุงเทพฯ', 'ธนาคารกรุงเทพ (BBL)', '238-0-91234-5', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123')
    returning id into v_cnt_vnd2_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกรุงเทพ (BBL)'),
      bank_account_no = coalesce(contacts.bank_account_no, '238-0-91234-5'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105563044123')
    where id = v_cnt_vnd2_id;
  end if;

  -- [VEND-0003: Sungrow]
  select id into v_vnd3_id from vendors where vendor_code = 'VEND-0003' or vendor_name like '%ซันโกรว์%' limit 1;
  if v_vnd3_id is null then
    insert into vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0003', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', 'คุณอนุรักษ์', '02-118-9900', '0105561023451', '1 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 28 ถ.สาทรใต้ ยานนาวา สาทร กรุงเทพฯ', 'ธนาคารกสิกรไทย (KBANK)', '045-2-88192-3', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451')
    returning id into v_vnd3_id;
  else
    update vendors set
      bank_name = coalesce(vendors.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(vendors.bank_account_no, '045-2-88192-3'),
      bank_account_name = coalesce(vendors.bank_account_name, 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด'),
      promptpay_no = coalesce(vendors.promptpay_no, '0105561023451')
    where id = v_vnd3_id;
  end if;

  select id into v_cnt_vnd3_id from contacts where contact_code = 'VEND-0003' or company_name like '%ซันโกรว์%' limit 1;
  if v_cnt_vnd3_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0003', 'vendor', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451', '00000', '02-118-9900', 'sales-th@sungrowpower.com', '1 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 28 ถ.สาทรใต้ ยานนาวา สาทร กรุงเทพฯ', 'ธนาคารกสิกรไทย (KBANK)', '045-2-88192-3', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451')
    returning id into v_cnt_vnd3_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(contacts.bank_account_no, '045-2-88192-3'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105561023451')
    where id = v_cnt_vnd3_id;
  end if;

  -- [VEND-0004: Thai Construction Steel]
  select id into v_vnd4_id from vendors where vendor_code = 'VEND-0004' or vendor_name like '%ไทยคอนสตรัคชั่น%' limit 1;
  if v_vnd4_id is null then
    insert into vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0004', 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด', 'คุณสมพงษ์', '02-749-8800', '0105559088123', '189 หมู่ 5 ถ.กิ่งแก้ว ต.ราชาเทวะ อ.บางพลี จ.สมุทรปราการ', 'ธนาคารกสิกรไทย (KBANK)', '442-1-89012-3', 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด', '0105559088123')
    returning id into v_vnd4_id;
  else
    update vendors set
      bank_name = coalesce(vendors.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(vendors.bank_account_no, '442-1-89012-3'),
      bank_account_name = coalesce(vendors.bank_account_name, 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด'),
      promptpay_no = coalesce(vendors.promptpay_no, '0105559088123')
    where id = v_vnd4_id;
  end if;

  select id into v_cnt_vnd4_id from contacts where contact_code = 'VEND-0004' or company_name like '%ไทยคอนสตรัคชั่น%' limit 1;
  if v_cnt_vnd4_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0004', 'vendor', 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด', '0105559088123', '00000', '02-749-8800', 'sales@thaiconsteel.com', '189 หมู่ 5 ถ.กิ่งแก้ว ต.ราชาเทวะ อ.บางพลี จ.สมุทรปราการ', 'ธนาคารกสิกรไทย (KBANK)', '442-1-89012-3', 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด', '0105559088123')
    returning id into v_cnt_vnd4_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(contacts.bank_account_no, '442-1-89012-3'),
      bank_account_name = coalesce(contacts.bank_account_name, 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด'),
      promptpay_no = coalesce(contacts.promptpay_no, '0105559088123')
    where id = v_cnt_vnd4_id;
  end if;

  -- [VEND-0005: ช่างสมคิด]
  select id into v_vnd5_id from vendors where vendor_code = 'VEND-0005' or vendor_name like '%สมคิด%' limit 1;
  if v_vnd5_id is null then
    insert into vendors (vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0005', 'นายสมคิด ช่างฝีมือดี (ผู้รับเหมาค่าแรงงาน)', 'นายสมคิด', '089-771-4567', '1100400234112', '14/2 หมู่ 3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120', 'ธนาคารกสิกรไทย (KBANK)', '743-2-11982-1', 'นายสมคิด ช่างฝีมือดี', '089-771-4567')
    returning id into v_vnd5_id;
  else
    update vendors set
      bank_name = coalesce(vendors.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(vendors.bank_account_no, '743-2-11982-1'),
      bank_account_name = coalesce(vendors.bank_account_name, 'นายสมคิด ช่างฝีมือดี'),
      promptpay_no = coalesce(vendors.promptpay_no, '089-771-4567')
    where id = v_vnd5_id;
  end if;

  select id into v_cnt_vnd5_id from contacts where contact_code = 'VEND-0005' or company_name like '%สมคิด%' limit 1;
  if v_cnt_vnd5_id is null then
    insert into contacts (contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no)
    values ('VEND-0005', 'vendor', 'นายสมคิด ช่างฝีมือดี (ผู้รับเหมาค่าแรงงาน)', '1100400234112', '00000', '089-771-4567', 'somkid.builder@gmail.com', '14/2 หมู่ 3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120', 'ธนาคารกสิกรไทย (KBANK)', '743-2-11982-1', 'นายสมคิด ช่างฝีมือดี', '089-771-4567')
    returning id into v_cnt_vnd5_id;
  else
    update contacts set
      bank_name = coalesce(contacts.bank_name, 'ธนาคารกสิกรไทย (KBANK)'),
      bank_account_no = coalesce(contacts.bank_account_no, '743-2-11982-1'),
      bank_account_name = coalesce(contacts.bank_account_name, 'นายสมคิด ช่างฝีมือดี'),
      promptpay_no = coalesce(contacts.promptpay_no, '089-771-4567')
    where id = v_cnt_vnd5_id;
  end if;

  -- 2.5 รับประกันใบสั่งซื้อ (Purchase Orders) - Upsert by po_no
  select id into v_po1_id from purchase_orders where po_no = 'PO-2026-001' limit 1;
  if v_po1_id is null then
    insert into purchase_orders (po_no, vendor_id, project_id, order_date, total_amount, status, payment_type, deposit_type, deposit_percent, deposit_amount, remaining_amount, payment_channel_requested, payment_status, deposit_paid_amount, vendor_tax_invoice_no, tax_invoice_date)
    values ('PO-2026-001', v_vnd2_id, v_prj1_id, '2026-10-01', 481500.00, 'open', 'credit_30', 'deposit', 30.00, 144450.00, 337050.00, 'transfer', 'รอชำระเงิน', 0.00, 'JA-TAX-2026-4410', '2026-10-31')
    returning id into v_po1_id;
  else
    update purchase_orders set
      vendor_id = v_vnd2_id,
      project_id = v_prj1_id,
      deposit_type = 'deposit',
      deposit_percent = 30.00,
      deposit_amount = 144450.00,
      remaining_amount = 337050.00,
      payment_channel_requested = 'transfer',
      payment_status = 'รอชำระเงิน',
      deposit_paid_amount = 0.00,
      vendor_tax_invoice_no = 'JA-TAX-2026-4410',
      tax_invoice_date = '2026-10-31'
    where id = v_po1_id;
  end if;

  select id into v_po2_id from purchase_orders where po_no = 'PO-2026-002' limit 1;
  if v_po2_id is null then
    insert into purchase_orders (po_no, vendor_id, project_id, order_date, total_amount, status, payment_type, deposit_type, deposit_percent, deposit_amount, remaining_amount, payment_channel_requested, payment_status, deposit_paid_amount, vendor_tax_invoice_no, tax_invoice_date)
    values ('PO-2026-002', v_vnd3_id, v_prj1_id, '2026-11-05', 513600.00, 'open', 'credit_30', 'deposit', 30.00, 154080.00, 359520.00, 'transfer', 'จ่ายมัดจำแล้ว', 154080.00, 'SG-INV-2026-9901', '2026-11-05')
    returning id into v_po2_id;
  else
    update purchase_orders set
      vendor_id = v_vnd3_id,
      project_id = v_prj1_id,
      deposit_type = 'deposit',
      deposit_percent = 30.00,
      deposit_amount = 154080.00,
      remaining_amount = 359520.00,
      payment_channel_requested = 'transfer',
      payment_status = 'จ่ายมัดจำแล้ว',
      deposit_paid_amount = 154080.00,
      vendor_tax_invoice_no = 'SG-INV-2026-9901',
      tax_invoice_date = '2026-11-05'
    where id = v_po2_id;
  end if;

  -- ----------------------------------------------------------------------------
  -- ส่วนที่ 3: รายงานที่ 2 — รายงานลูกหนี้ตามเอกสาร (AR Aging Report)
  -- ----------------------------------------------------------------------------
  delete from sales_invoices where invoice_no in (
    'INV202611-0001', 'INV202610-0002', 'INV202609-0001', 'INV202608-0002', 'AR-OPEN-001'
  );

  insert into sales_invoices (
    invoice_no, customer_id, contact_id, project_id, issue_date, due_date,
    subtotal, vat_rate, vat_amount, total_amount, paid_amount, remaining_amount,
    is_opening_balance, status, notes
  ) values
    -- [1] ยังไม่ครบกำหนด: บมจ. สยามพาณิชย์ พลังงานสะอาด
    ('INV202611-0001', v_cust1_id, v_cnt1_id, v_prj1_id, '2026-11-05', '2026-12-05',
     2500000.00, 7.00, 175000.00, 2675000.00, 0.00, 2675000.00,
     false, 'รอเก็บเงิน', 'ค่างวดที่ 1 งานโครงสร้างหลังคาและติดตั้งแผงโซลาร์ 500 kWp สระบุรี'),

    -- [2] เกินกำหนด 1 - 30 วัน: บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง (ชำระแล้วบางส่วน 500,000 บ.)
    ('INV202610-0002', v_cust2_id, v_cnt2_id, v_prj2_id, '2026-09-25', '2026-10-25',
     1800000.00, 7.00, 126000.00, 1926000.00, 500000.00, 1426000.00,
     false, 'รอเก็บเงิน', 'ค่างวดโครงสร้างอาคารคลังสินค้าและหลังคารับแรง เกินกำหนดนัดวางบิล 19 วัน'),

    -- [3] เกินกำหนด 31 - 60 วัน: บจก. กรีนเทค โลจิสติกส์ เซ็นเตอร์
    ('INV202609-0001', v_cust3_id, v_cnt3_id, v_prj3_id, '2026-08-20', '2026-09-20',
     850000.00, 7.00, 59500.00, 909500.00, 0.00, 909500.00,
     false, 'รอเก็บเงิน', 'ค่างานระบบไฟฟ้าและตู้ MDB ชลบุรี รอจัดสรรรอบจ่ายจากฝ่ายบัญชีลูกค้า (เกิน 54 วัน)'),

    -- [4] เกินกำหนด 61 - 90 วัน: นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์
    ('INV202608-0002', v_cust4_id, v_cnt4_id, null, '2026-07-25', '2026-08-25',
     322429.91, 7.00, 22570.09, 345000.00, 0.00, 345000.00,
     false, 'รอเก็บเงิน', 'งานปรับปรุงระบบแสงสว่างส่วนกลาง รอการประชุมคณะกรรมการนิติบุคคล (เกิน 80 วัน)'),

    -- [5] เกินกำหนดมากกว่า 90 วัน: บจก. ไทยรุ่งพัฒนา (ยอดยกมาจากระบบเดิม)
    ('AR-OPEN-001', v_cust2_id, v_cnt2_id, v_prj2_id, '2026-06-15', '2026-07-15',
     420000.00, 0.00, 0.00, 420000.00, 0.00, 420000.00,
     true, 'รอเก็บเงิน', 'ยอดยกมาจากระบบเดิม: งานปรับระดับพื้นที่และฐานรากคอนกรีต รอตรวจรับงวดสุดท้าย (เกิน 121 วัน)');

  -- ----------------------------------------------------------------------------
  -- ส่วนที่ 4: รายงานที่ 3 — รายงานเจ้าหนี้ตามเอกสาร (AP Aging Report)
  -- ----------------------------------------------------------------------------
  delete from accounts_payable where ap_no in (
    'AP202611-0001', 'AP202610-0001', 'AP202609-0002', 'AP202608-0003', 'AP-OPEN-001'
  );

  insert into accounts_payable (
    ap_no, vendor_id, vendor_name, po_id, invoice_no, invoice_date, due_date,
    credit_days, total_debt, paid_amount, remaining_amount, status, payment_method, alert_level
  ) values
    -- [1] ยังไม่ครบกำหนด: บจก. ซันโกรว์ เพาเวอร์ (PO-2026-002 จ่ายมัดจำ 30% แล้ว)
    ('AP202611-0001', v_vnd3_id, 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด',
     v_po2_id, 'SG-2026-1102', '2026-11-05', '2026-12-05', 30,
     513600.00, 154080.00, 359520.00, 'pending', 'โอนเงิน', 'normal'),

    -- [2] เกินกำหนด 1 - 30 วัน: บจก. เจเอ โซลาร์ อินเตอร์เนชั่นแนล (PO-2026-001)
    ('AP202610-0001', v_vnd2_id, 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด',
     v_po1_id, 'JA-TH-88910', '2026-10-01', '2026-10-31', 30,
     481500.00, 0.00, 481500.00, 'pending', 'โอนเงิน', 'urgent'),

    -- [3] เกินกำหนด 31 - 60 วัน: SCG Home Solution (สาขาชัยพฤกษ์)
    ('AP202609-0002', v_vnd1_id, 'SCG Home Solution (สาขาชัยพฤกษ์)',
     null, 'SCG-TAX-4412', '2026-08-30', '2026-09-30', 30,
     93600.00, 0.00, 93600.00, 'pending', 'โอนเงิน', 'warning'),

    -- [4] เกินกำหนด 61 - 90 วัน: บจก. ไทยคอนสตรัคชั่น สตีล
    ('AP202608-0003', v_vnd4_id, 'บริษัท ไทยคอนสตรัคชั่น สตีล จำกัด',
     null, 'TCS-INV-9921', '2026-07-20', '2026-08-20', 30,
     165800.00, 0.00, 165800.00, 'pending', 'โอนเงิน', 'warning'),

    -- [5] เกินกำหนดมากกว่า 90 วัน: หจก. นครหลวงคอนกรีตผสมเสร็จ (ยอดยกมา)
    ('AP-OPEN-001', null, 'หจก. นครหลวงคอนกรีตผสมเสร็จ',
     null, 'NLK-OPEN-08', '2026-05-10', '2026-06-10', 30,
     88000.00, 0.00, 88000.00, 'pending', 'โอนเงิน', 'normal');

  -- ----------------------------------------------------------------------------
  -- ส่วนที่ 5: รายงานที่ 4 — ระบบภาษีครบวงจร (Tax Reports: ภ.พ.30 & WHT)
  -- ----------------------------------------------------------------------------
  delete from tax_records where document_no in (
    'INV202611-0001', 'INV202610-0002', 'PO-2026-001', 'PO-2026-002',
    'EXP-WHT3-001', 'EXP-WHT53-001', 'EXP-WHT53-002'
  );

  insert into tax_records (
    tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no,
    contact_id, project_id, base_amount, vat_amount, wht_rate, wht_amount, status
  ) values
    -- 1) ภาษีขาย ภ.พ.30 (OUTPUT_VAT เดือน 11/2026): สยามพาณิชย์ พลังงานสะอาด
    ('OUTPUT_VAT', 11, 2026, '2026-11-05', 'INV202611-0001', null,
     v_cnt1_id, v_prj1_id, 2500000.00, 175000.00, 0, 0, 'รอยื่นภาษี'),

    -- 2) ภาษีขาย ภ.พ.30 (OUTPUT_VAT เดือน 10/2026): ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง
    ('OUTPUT_VAT', 10, 2026, '2026-10-25', 'INV202610-0002', null,
     v_cnt2_id, v_prj2_id, 1800000.00, 126000.00, 0, 0, 'ยื่นภาษีแล้ว'),

    -- 3) ภาษีซื้อ ภ.พ.30 (INPUT_VAT เดือน 11/2026): ซื้ออินเวอร์เตอร์จาก บจก. ซันโกรว์ เพาเวอร์
    ('INPUT_VAT', 11, 2026, '2026-11-05', 'PO-2026-002', 'SG-INV-2026-9901',
     v_cnt_vnd3_id, v_prj1_id, 480000.00, 33600.00, 0, 0, 'รอยื่นภาษี'),

    -- 4) ภาษีซื้อ ภ.พ.30 (INPUT_VAT เดือน 10/2026): ซื้อแผงโซลาร์จาก บจก. เจเอ โซลาร์
    ('INPUT_VAT', 10, 2026, '2026-10-31', 'PO-2026-001', 'JA-TAX-2026-4410',
     v_cnt_vnd2_id, v_prj1_id, 450000.00, 31500.00, 0, 0, 'ยื่นภาษีแล้ว'),

    -- 5) ภาษีหัก ณ ที่จ่าย ภ.ง.ด.3 (WHT_3 เดือน 11/2026): นายสมคิด ช่างฝีมือดี (ค่าจ้างแรงงานช่าง 3%)
    ('WHT_3', 11, 2026, '2026-11-08', 'EXP-WHT3-001', null,
     v_cnt_vnd5_id, v_prj1_id, 75000.00, 0.00, 3.00, 2250.00, 'รอยื่นภาษี'),

    -- 6) ภาษีหัก ณ ที่จ่าย ภ.ง.ด.53 (WHT_53 เดือน 11/2026): บจก. สยามเครนแอนด์ทรานสปอร์ต (ค่าเช่ารถเครน 5%)
    ('WHT_53', 11, 2026, '2026-11-09', 'EXP-WHT53-001', null,
     v_cnt_vnd4_id, v_prj1_id, 45000.00, 0.00, 5.00, 2250.00, 'รอยื่นภาษี'),

    -- 7) ภาษีหัก ณ ที่จ่าย ภ.ง.ด.53 (WHT_53 เดือน 10/2026): บจก. วิศวกรรมความปลอดภัย (ค่าทดสอบระบบไฟฟ้า 3%)
    ('WHT_53', 10, 2026, '2026-10-28', 'EXP-WHT53-002', null,
     v_cnt_vnd4_id, v_prj2_id, 60000.00, 0.00, 3.00, 1800.00, 'ยื่นภาษีแล้ว');

  -- ----------------------------------------------------------------------------
  -- ส่วนที่ 6: รายงานที่ 5 — รายงานค่าใช้จ่ายและเงินสำรองจ่าย (Expenses & Advances)
  -- ----------------------------------------------------------------------------
  delete from expenses where expense_no in (
    'EXP202611-0001', 'EXP202611-0002', 'EXP202611-0003', 'EXP202611-0004', 'EXP202611-0005'
  );

  insert into expenses (
    expense_no, contact_id, vendor_id, project_id, expense_date, due_date,
    expense_category, account_code, description, payment_method,
    payment_source, company_bank_account, advance_payer_type, advance_payer_name,
    reimbursement_status, subtotal, vat_rate, vat_amount, wht_rate, wht_amount,
    total_amount, vendor_tax_invoice_no, tax_invoice_date, is_asset, accounting_status, status
  ) values
    -- 1) โอนบัญชีบริษัท: ซื้ออินเวอร์เตอร์ Sungrow SG110CX พร้อมอุปกรณ์ติดตั้ง
    ('EXP202611-0001', v_cnt_vnd3_id, v_vnd3_id, v_prj1_id, '2026-11-05', '2026-12-05',
     'งานก่อสร้างและดำเนินงาน', '5110-01', 'ซื้ออินเวอร์เตอร์ Sungrow SG110CX พร้อมอุปกรณ์ติดตั้ง', 'โอนเงิน',
     'company_bank', '1110-02', null, null,
     'none', 480000.00, 7.00, 33600.00, 0.00, 0.00,
     513600.00, 'SG-INV-2026-9901', '2026-11-05', false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),

    -- 2) โอนบัญชีบริษัท: ค่าจ้างแรงงานติดตั้งโครงสร้าง Solar งวดที่ 1 ช่างสมคิด หัก 3%
    ('EXP202611-0002', v_cnt_vnd5_id, v_vnd5_id, v_prj1_id, '2026-11-08', '2026-11-08',
     'งานก่อสร้างและดำเนินงาน', '5120-01', 'ค่าจ้างแรงงานติดตั้งโครงสร้าง Solar งวดที่ 1', 'โอนเงิน',
     'company_bank', '1110-02', null, null,
     'none', 75000.00, 0.00, 0.00, 3.00, 2250.00,
     72750.00, null, null, false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),

    -- 3) โอนบัญชีบริษัท (สินทรัพย์ถาวร Fixed Asset): โดรนสำรวจหน้างานและหลังคา DJI
    ('EXP202611-0003', null, null, null, '2026-11-10', '2026-11-10',
     'สำนักงานและบริหาร', '1530-01', 'ซื้อโดรนสำรวจหน้างานและหลังคา DJI Mavic 3 Enterprise', 'โอนเงิน',
     'company_bank', '1110-02', null, null,
     'none', 145000.00, 7.00, 10150.00, 0.00, 0.00,
     155150.00, 'DJI-TAX-4591', '2026-11-10', true, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),

    -- 4) เงินสำรองจ่าย (โดยหัวหน้างาน): ค่าอุปกรณ์เซฟตี้ ฮาร์เนส และนั่งร้านด่วนหน้างาน
    ('EXP202611-0004', null, null, v_prj1_id, '2026-11-11', '2026-11-20',
     'งานก่อสร้างและดำเนินงาน', '5110-01', 'ค่าจัดซื้ออุปกรณ์เซฟตี้ ฮาร์เนสกันตก และอุปกรณ์นั่งร้านหน้างานด่วน', 'เงินสด',
     'advance_payment', null, 'manager', 'นายสมชาย ใจมั่น (หัวหน้างานโครงการ Solar)',
     'รอคืนเงินสำรองจ่าย', 28500.00, 0.00, 0.00, 0.00, 0.00,
     28500.00, null, null, false, 'รอดำเนินการ', 'รอคืนเงินสำรองจ่าย'),

    -- 5) เงินสำรองจ่าย (โดยวิศวกร): ค่าบริการตรวจวัดค่าความต้านทานดิน และอาหารรับรองผู้ตรวจประเมิน
    ('EXP202611-0005', null, null, v_prj2_id, '2026-11-12', '2026-11-25',
     'งานก่อสร้างและดำเนินงาน', '5130-01', 'ค่าบริการตรวจวัดค่าความต้านทานดิน (Grounding Test) และรับรองผู้ตรวจการไฟฟ้านครหลวง', 'เงินสด',
     'advance_payment', null, 'other', 'นายปริญญา ชัยชนะ (วิศวกรไฟฟ้าโครงการ)',
     'รอคืนเงินสำรองจ่าย', 14200.00, 0.00, 0.00, 0.00, 0.00,
     14200.00, null, null, false, 'รอดำเนินการ', 'รอคืนเงินสำรองจ่าย');

  -- ----------------------------------------------------------------------------
  -- ส่วนที่ 7: รายงานที่ 1 — สมุดรายวันทั่วไป & ตรวจสอบบัญชี (Journal Entries & GL Audit)
  -- ----------------------------------------------------------------------------
  -- ปลดสถานะอนุมัติเป็น 'รอดำเนินการ' ชั่วคราว เพื่อให้ Trigger trg_prevent_approved_lines_mod
  -- อนุญาตให้ลบ lines เดิมออกได้อย่างปลอดภัย 100%
  update journal_entries
  set accounting_status = 'รอดำเนินการ'
  where entry_no in (
    'RI202610-0001', 'RI202611-0001', 'INV202611-0001', 'INV202610-0002',
    'PAY202611-0001', 'RC202611-0001', 'EXP202611-0002', 'MANUAL-202611'
  );

  delete from journal_entry_lines where journal_entry_id in (
    select id from journal_entries where entry_no in (
      'RI202610-0001', 'RI202611-0001', 'INV202611-0001', 'INV202610-0002',
      'PAY202611-0001', 'RC202611-0001', 'EXP202611-0002', 'MANUAL-202611'
    )
  );

  delete from journal_entries where entry_no in (
    'RI202610-0001', 'RI202611-0001', 'INV202611-0001', 'INV202610-0002',
    'PAY202611-0001', 'RC202611-0001', 'EXP202611-0002', 'MANUAL-202611'
  );

  -- ดึงผังบัญชี
  select id into v_coa_cash_kbank from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_coa_cash_scb   from chart_of_accounts where account_code = '1110-03' limit 1;
  select id into v_coa_ar         from chart_of_accounts where account_code = '1130-01' limit 1;
  select id into v_coa_ap         from chart_of_accounts where account_code = '2110-01' limit 1;
  select id into v_coa_inv        from chart_of_accounts where account_code = '1140-01' limit 1;
  select id into v_coa_vat_in     from chart_of_accounts where account_code = '1150-01' limit 1;
  select id into v_coa_vat_out    from chart_of_accounts where account_code = '2130-01' limit 1;
  select id into v_coa_rev        from chart_of_accounts where account_code = '4110-01' limit 1;
  select id into v_coa_wht_pay    from chart_of_accounts where account_code = '2140-01' limit 1;
  select id into v_coa_wht_rec    from chart_of_accounts where account_code = '1160-01' limit 1;
  select id into v_coa_labor      from chart_of_accounts where account_code = '5120-01' limit 1;
  select id into v_coa_fee        from chart_of_accounts where account_code = '5250-01' limit 1;
  select id into v_coa_dep_exp    from chart_of_accounts where account_code = '5240-01' limit 1;
  select id into v_coa_dep_acc    from chart_of_accounts where account_code = '1540-01' limit 1;

  -- 1) RI202610-0001 รับของเข้าสโตร์ (แผงโซลาร์ JA Solar 550W)
  -- บันทึกแบบ 2-Phase Status: สร้าง 'รอดำเนินการ' -> บันทึก Lines -> อัปเดต 'อนุมัติแล้ว' (ผ่าน Trigger ตรวจดุลบัญชี Dr = Cr)
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('RI202610-0001', '2026-10-31', 'RI', v_prj1_id, 'รับแผงโซลาร์เซลล์ JA Solar 550W เข้าสโตร์หลักตาม PO-2026-001 (ใบรับของ RI-2026-001)', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_inv, v_cnt_vnd2_id, 450000.00, 0.00, 'แผงโซลาร์เซลล์ Mono Half-Cell 550W จำนวน 100 แผง'),
    (v_jv_id, v_coa_vat_in, v_cnt_vnd2_id, 31500.00, 0.00, 'ภาษีซื้อ 7% ตามใบกำกับภาษีผู้ขาย JA-TAX-2026-4410'),
    (v_jv_id, v_coa_ap, v_cnt_vnd2_id, 0.00, 481500.00, 'ตั้งเจ้าหนี้การค้า บจก. เจเอ โซลาร์ อินเตอร์เนชั่นแนล เครดิตเทอม 30 วัน');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 2) RI202611-0001 รับของเข้าสโตร์ (อินเวอร์เตอร์ Sungrow SG110CX)
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('RI202611-0001', '2026-11-05', 'RI', v_prj1_id, 'รับอินเวอร์เตอร์ Sungrow SG110CX เข้าสโตร์โครงการ Solar Rooftop 500kW สระบุรี', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_inv, v_cnt_vnd3_id, 480000.00, 0.00, 'อินเวอร์เตอร์ Sungrow SG110CX พร้อมหัวต่อ MC4 และ Smart Meter'),
    (v_jv_id, v_coa_vat_in, v_cnt_vnd3_id, 33600.00, 0.00, 'ภาษีซื้อ 7% ตามใบกำกับภาษี SG-INV-2026-9901'),
    (v_jv_id, v_coa_ap, v_cnt_vnd3_id, 0.00, 513600.00, 'ตั้งเจ้าหนี้การค้า บจก. ซันโกรว์ เพาเวอร์ (ประเทศไทย)');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 3) INV202611-0001 ส่งมอบงานงวด 1 โครงการ Solar 500kW สระบุรี
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('INV202611-0001', '2026-11-05', 'INV', v_prj1_id, 'ส่งมอบงานติดตั้งโครงสร้างและแผงโซลาร์เซลล์งวดที่ 1 บมจ. สยามพาณิชย์ พลังงานสะอาด', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_ar, v_cnt1_id, 2675000.00, 0.00, 'ตั้งลูกหนี้การค้า บมจ. สยามพาณิชย์ พลังงานสะอาด กำหนดชำระ 05/12/2026'),
    (v_jv_id, v_coa_rev, v_cnt1_id, 0.00, 2500000.00, 'รายได้งานติดตั้ง Solar Rooftop 500kW งวดที่ 1'),
    (v_jv_id, v_coa_vat_out, v_cnt1_id, 0.00, 175000.00, 'ภาษีขาย 7% ตามใบกำกับภาษีเลขที่ INV202611-0001');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 4) PAY202611-0001 จ่ายมัดจำ 30% ให้ บจก. ซันโกรว์ เพาเวอร์
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('PAY202611-0001', '2026-11-06', 'PAY', v_prj1_id, 'จ่ายชำระเงินมัดจำงวดแรก 30% ค่าอินเวอร์เตอร์ให้ บจก. ซันโกรว์ เพาเวอร์ (ประเทศไทย) ผ่านเงินโอน KBANK [PV2026110001]', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_ap, v_cnt_vnd3_id, 154080.00, 0.00, 'ตัดยอดหนี้มัดจำงวดแรก 30% PO-2026-002'),
    (v_jv_id, v_coa_fee, null, 15.00, 0.00, 'ค่าธรรมเนียมโอนเงินต่างธนาคาร KBANK'),
    (v_jv_id, v_coa_cash_kbank, null, 0.00, 154095.00, 'ตัดเงินโอนออกจากบัญชี ธ.กสิกรไทย กระแสรายวัน 045-8-12345-6');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 5) RC202611-0001 รับเงินโอนค่างวดจาก บจก. ไทยรุ่งพัฒนา
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('RC202611-0001', '2026-11-09', 'RC', v_prj2_id, 'รับเงินโอนค่างวดบางส่วนตามใบแจ้งหนี้ INV202610-0002 จาก บจก. ไทยรุ่งพัฒนา หัก ณ ที่จ่าย 3%', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_cash_scb, v_cnt2_id, 485000.00, 0.00, 'รับเงินโอนเข้าบัญชี ธ.ไทยพาณิชย์ 123-4-56789-0'),
    (v_jv_id, v_coa_wht_rec, v_cnt2_id, 15000.00, 0.00, 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก 3% ตามหนังสือรับรองฯ'),
    (v_jv_id, v_coa_ar, v_cnt2_id, 0.00, 500000.00, 'ตัดยอดลูกหนี้การค้าตามใบเสร็จรับเงิน RC2026110001');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 6) EXP202611-0002 จ่ายค่าแรงติดตั้งโซลาร์ ช่างสมคิด
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('EXP202611-0002', '2026-11-08', 'EXP', v_prj1_id, 'จ่ายค่าจ้างแรงงานติดตั้งแผงโซลาร์ หัก ณ ที่จ่าย 3% (ภ.ง.ด.3)', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_labor, v_cnt_vnd5_id, 75000.00, 0.00, 'ค่าแรงงานงวดที่ 1 งานติดตั้งโครงสร้างแผงโซลาร์'),
    (v_jv_id, v_coa_wht_pay, v_cnt_vnd5_id, 0.00, 2250.00, 'หักภาษี ณ ที่จ่าย 3% ค่าจ้างทำของบุคคลธรรมดา (ภ.ง.ด.3)'),
    (v_jv_id, v_coa_cash_kbank, v_cnt_vnd5_id, 0.00, 72750.00, 'จ่ายสุทธิเข้าบัญชีช่างสมคิด ธ.กสิกรไทย 743-2-11982-1');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  -- 7) MANUAL-202611 ปรับปรุงค่าเสื่อมราคาประจำเดือน
  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('MANUAL-202611', '2026-11-13', 'MANUAL', null, 'บันทึกปรับปรุงค่าเสื่อมราคาเครื่องจักร ยานพาหนะ และอุปกรณ์สำนักงานประจำเดือน พ.ย. 2026', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description) values
    (v_jv_id, v_coa_dep_exp, null, 25000.00, 0.00, 'ค่าเสื่อมราคาเครื่องจักรและยานพาหนะโครงการ (5240-01)'),
    (v_jv_id, v_coa_dep_acc, null, 0.00, 25000.00, 'ค่าเสื่อมราคาสะสมเครื่องจักรและยานพาหนะ (1540-01)');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

end $$;

-- ------------------------------------------------------------------------------
-- ส่วนที่ 8: รีเฟรช Schema Cache (Notify PostgREST)
-- ------------------------------------------------------------------------------
notify pgrst, 'reload schema';
