-- ==============================================================================
-- ANVA & CO., LTD. (บริษัท แอนวา แอนด์ โค จำกัด) - Tax ID: 0105566012345
-- Complete Realistic Enterprise All-Module Operational Simulation (Phase 13)
-- ครอบคลุมการทำงานจริงของทุกฝ่าย:
-- 1) จัดซื้อ (Purchasing: PR, PO, Vendors)
-- 2) สโตร์และคลังสินค้า (Store: Items, Lots, Receipts GRN, Stock Issues)
-- 3) การตลาด/ฝ่ายขาย (Sales: Quotations, Customers)
-- 4) โครงการ (Projects: EPC & Solar Rooftop)
-- 5) บัญชีและการเงิน (Accounting: GL Journal Entries, AR, AP, VAT, WHT, ผังบัญชี)
-- 6) ฝ่ายบุคคล (HR: Employees, Attendance GPS, Leave Requests)
-- 7) ทรัพย์สินและยานพาหนะ (Company Assets & Fleet Card)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- ส่วนที่ 1: ตรวจสอบและสร้างโครงสร้างตาราง (DDL & Schema Evolution)
-- ------------------------------------------------------------------------------

create or replace function get_my_role()
returns text
language sql
stable
security definer
set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active limit 1;
$$;

-- 1.1 โครงการ (Projects)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique not null,
  project_name text not null,
  client_name text,
  site_address text,
  budget_total numeric(12,2) default 0,
  start_date date,
  end_date date,
  status text check (status in ('planning', 'in_progress', 'completed', 'on_hold')) default 'planning',
  created_at timestamptz default now()
);

-- 1.2 หมวดหมู่วัสดุและคลัง (Item Categories & Inventory Items)
create table if not exists item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code_prefix text,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table item_categories add column if not exists code_prefix text;
alter table item_categories add column if not exists sort_order int default 0;

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text unique not null,
  item_name text not null,
  unit text not null,
  category_id uuid references item_categories(id) on delete set null,
  qty_on_hand numeric(12,2) default 0,
  avg_unit_cost numeric(12,2) default 0,
  reorder_point numeric(12,2) default 0,
  image_url text,
  created_at timestamptz default now()
);

alter table inventory_items add column if not exists image_url text;
alter table inventory_items add column if not exists qty_on_hand numeric(12,2) default 0;
alter table inventory_items add column if not exists avg_unit_cost numeric(12,2) default 0;
alter table inventory_items add column if not exists reorder_point numeric(12,2) default 0;

-- 1.3 ผู้จำหน่ายและลูกค้า (Vendors & Customers)
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text unique not null,
  vendor_name text not null,
  contact_person text,
  phone text,
  tax_id text,
  address text,
  created_at timestamptz default now()
);

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

-- 1.4 สมุดทะเบียนผู้ติดต่อกลาง (Unified Contacts: ลูกค้า & ผู้จำหน่าย)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  contact_code text unique not null,
  contact_type text not null default 'both' check (contact_type in ('customer', 'vendor', 'both')),
  company_name text not null,
  branch_code text default '00000',
  tax_id text,
  contact_person text,
  phone text,
  email text,
  address text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
alter table contacts add column if not exists is_active boolean default true;

-- 1.5 ใบเสนอราคา (Quotations & Items)
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text unique not null,
  issue_date date not null default current_date,
  validity_days int default 30,
  expiry_date date,
  sales_person text,
  currency text default 'THB',
  customer_id uuid,
  customer_name text not null,
  customer_address text,
  customer_postal_code text,
  customer_tax_id text,
  customer_branch text default 'สำนักงานใหญ่',
  project_id uuid,
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
  accounting_status text default 'รอดำเนินการ',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table quotations add column if not exists accounting_status text default 'รอดำเนินการ';

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  item_id uuid,
  item_name text not null,
  description text,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text,
  unit_price numeric(15,2) not null default 0,
  discount_percent numeric(5,2) default 0,
  total_amount numeric(15,2) not null default 0
);

-- 1.6 ใบขอซื้อและใบสั่งซื้อ (PR & PO)
create table if not exists purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  pr_no text unique not null,
  project_id uuid,
  request_date date not null default current_date,
  status text default 'pending',
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references purchase_requisitions(id) on delete cascade,
  item_id uuid,
  item_name text not null,
  quantity numeric(12,2) not null,
  unit text,
  estimated_price numeric(15,2) default 0
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text unique not null,
  pr_id uuid,
  project_id uuid,
  vendor_id uuid,
  order_date date not null default current_date,
  total_amount numeric(15,2) default 0,
  status text default 'open',
  payment_type text default 'credit_30',
  payment_term_days int default 30,
  quotation_no text,
  quotation_date date,
  quotation_url text,
  tax_type text default 'vat_included',
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) default 0,
  wht_rate numeric(5,2) default 0.00,
  wht_amount numeric(15,2) default 0,
  net_amount numeric(15,2) default 0,
  accounting_status text default 'รอดำเนินการ',
  created_by uuid,
  created_at timestamptz default now()
);

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
alter table purchase_orders add column if not exists accounting_status text default 'รอดำเนินการ';
alter table purchase_orders add column if not exists deposit_type text default 'none';
alter table purchase_orders add column if not exists deposit_percent numeric(5,2) default 0;
alter table purchase_orders add column if not exists deposit_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists remaining_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists payment_channel_requested text default 'transfer';
alter table purchase_orders add column if not exists payment_status text default 'รอชำระเงิน';
alter table purchase_orders add column if not exists deposit_paid_amount numeric(15,2) default 0;

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid,
  item_name text not null,
  quantity numeric(12,2) not null,
  unit text,
  unit_price numeric(15,2) not null default 0,
  qty_received numeric(12,2) default 0
);

-- 1.7 ตรวจรับของเข้าสโตร์และล็อตสินค้า (Goods Receipts, Lots, Stock Issues)
create table if not exists goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_no text unique not null,
  po_id uuid,
  received_date date not null default current_date,
  vendor_tax_invoice_no text,
  tax_invoice_date date,
  accounting_status text default 'รอดำเนินการ',
  created_by uuid,
  created_at timestamptz default now()
);

alter table goods_receipts add column if not exists vendor_tax_invoice_no text;
alter table goods_receipts add column if not exists tax_invoice_date date;
alter table goods_receipts add column if not exists accounting_status text default 'รอดำเนินการ';

create table if not exists goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references goods_receipts(id) on delete cascade,
  po_item_id uuid,
  qty_received numeric(12,2) not null,
  unit_cost numeric(15,2) not null default 0
);

create table if not exists stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  source_project_id uuid,
  grn_item_id uuid,
  lot_type text default 'receipt',
  received_date date not null,
  qty_received numeric(12,2) not null,
  qty_remaining numeric(12,2) not null,
  unit_cost numeric(15,2) not null,
  created_at timestamptz default now()
);

create table if not exists stock_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text unique not null,
  project_id uuid,
  issue_date date not null default current_date,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists stock_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references stock_issues(id) on delete cascade,
  item_id uuid not null,
  quantity numeric(12,2) not null,
  unit_cost numeric(15,2) default 0
);

-- 1.8 ผังบัญชี (Chart of Accounts)
create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text unique not null,
  account_name_th text not null,
  account_name_en text,
  account_category text not null check (account_category in ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  is_system_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  alter table chart_of_accounts add column if not exists account_name text;
  alter table chart_of_accounts alter column account_name drop not null;
exception when others then null;
end $$;

do $$
begin
  alter table chart_of_accounts add column if not exists account_type text;
  alter table chart_of_accounts alter column account_type drop not null;
  alter table chart_of_accounts drop constraint if exists chart_of_accounts_account_type_check;
exception when others then null;
end $$;

alter table chart_of_accounts add column if not exists account_name_th text;
alter table chart_of_accounts add column if not exists account_name_en text;
alter table chart_of_accounts add column if not exists account_category text;
alter table chart_of_accounts add column if not exists is_system_default boolean default false;
alter table chart_of_accounts add column if not exists is_active boolean default true;

-- 1.9 สมุดรายวันทั่วไป (General Ledger & Double-Entry)
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text unique not null,
  entry_date date not null default current_date,
  reference_type text not null check (reference_type in ('INV', 'RC', 'RI', 'EXP', 'PAY', 'MANUAL')),
  reference_id uuid,
  project_id uuid references projects(id) on delete set null,
  description text,
  accounting_status text not null default 'รอดำเนินการ' check (accounting_status in ('รอดำเนินการ', 'อนุมัติแล้ว', 'ยกเลิก')),
  created_by uuid references profiles(id) default auth.uid(),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table journal_entries add column if not exists accounting_status text default 'รอดำเนินการ';
alter table journal_entries add column if not exists reference_type text default 'MANUAL';
alter table journal_entries add column if not exists reference_id uuid;
alter table journal_entries add column if not exists approved_by uuid;
alter table journal_entries add column if not exists approved_at timestamptz;
alter table journal_entries add column if not exists updated_at timestamptz default now();

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  contact_id uuid,
  debit numeric(15,2) not null default 0 check (debit >= 0),
  credit numeric(15,2) not null default 0 check (credit >= 0),
  line_description text,
  created_at timestamptz default now()
);

alter table journal_entry_lines add column if not exists contact_id uuid;
alter table journal_entry_lines add column if not exists line_description text;
alter table journal_entry_lines add column if not exists line_desc text;

-- 1.10 ทะเบียนภาษี (Tax Records)
create table if not exists tax_records (
  id uuid primary key default gen_random_uuid(),
  tax_type text not null check (tax_type in ('OUTPUT_VAT', 'INPUT_VAT', 'WHT_3', 'WHT_53')),
  tax_month int not null check (tax_month between 1 and 12),
  tax_year int not null check (tax_year >= 2000),
  document_date date not null,
  document_no text not null,
  vendor_tax_invoice_no text,
  contact_id uuid,
  project_id uuid references projects(id) on delete set null,
  base_amount numeric(15,2) not null default 0,
  vat_amount numeric(15,2) not null default 0,
  wht_rate numeric(5,2) default 0,
  wht_amount numeric(15,2) not null default 0,
  status text not null default 'รอยื่นภาษี' check (status in ('รอยื่นภาษี', 'ยื่นภาษีแล้ว', 'ยกเลิก')),
  journal_entry_id uuid references journal_entries(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tax_records add column if not exists journal_entry_id uuid;

-- 1.11 ใบแจ้งหนี้และลูกหนี้การค้า (Sales Invoices)
create table if not exists sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  quotation_id uuid,
  customer_id uuid,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  issue_date date not null default current_date,
  due_date date not null default current_date + interval '30 days',
  currency text default 'THB',
  subtotal numeric(15,2) not null default 0,
  discount_amount numeric(15,2) default 0,
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) not null default 0,
  wht_rate numeric(5,2) default 0,
  wht_amount numeric(15,2) not null default 0,
  total_amount numeric(15,2) not null default 0,
  paid_amount numeric(15,2) default 0,
  remaining_amount numeric(15,2) default 0,
  is_opening_balance boolean default false,
  status text not null default 'ฉบับร่าง' check (status in ('ฉบับร่าง', 'รอเก็บเงิน', 'เก็บเงินแล้ว', 'ยกเลิก')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sales_invoices add column if not exists quotation_id uuid;
alter table sales_invoices add column if not exists customer_id uuid;
alter table sales_invoices add column if not exists contact_id uuid;
alter table sales_invoices add column if not exists project_id uuid;
alter table sales_invoices add column if not exists issue_date date default current_date;
alter table sales_invoices add column if not exists due_date date;
alter table sales_invoices add column if not exists currency text default 'THB';
alter table sales_invoices add column if not exists subtotal numeric(15,2) default 0;
alter table sales_invoices add column if not exists discount_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists vat_rate numeric(5,2) default 7.00;
alter table sales_invoices add column if not exists vat_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists wht_rate numeric(5,2) default 0;
alter table sales_invoices add column if not exists wht_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists total_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists paid_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists remaining_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists is_opening_balance boolean default false;
alter table sales_invoices add column if not exists status text default 'ฉบับร่าง';
alter table sales_invoices add column if not exists notes text;

-- 1.12 บันทึกค่าใช้จ่าย (Expenses)
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text unique not null,
  vendor_id uuid,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  expense_date date not null default current_date,
  due_date date,
  expense_category text default 'งานก่อสร้างและดำเนินงาน',
  account_code text default '5110-01',
  description text not null,
  payment_method text default 'โอนเงิน',
  subtotal numeric(15,2) not null default 0,
  vat_rate numeric(5,2) default 7.00,
  vat_amount numeric(15,2) not null default 0,
  wht_rate numeric(5,2) default 0,
  wht_amount numeric(15,2) not null default 0,
  total_amount numeric(15,2) not null default 0,
  vendor_tax_invoice_no text,
  tax_invoice_date date,
  is_asset boolean default false,
  accounting_status text default 'รอดำเนินการ' check (accounting_status in ('รอดำเนินการ', 'อนุมัติแล้ว', 'ยกเลิก')),
  status text not null default 'รอดำเนินการ' check (status in ('รอดำเนินการ', 'อนุมัติแล้ว', 'จ่ายเงินแล้ว', 'ยกเลิก')),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table expenses add column if not exists vendor_id uuid;
alter table expenses add column if not exists contact_id uuid;
alter table expenses add column if not exists project_id uuid;
alter table expenses add column if not exists expense_date date default current_date;
alter table expenses add column if not exists due_date date;
alter table expenses add column if not exists expense_category text default 'งานก่อสร้างและดำเนินงาน';
alter table expenses add column if not exists account_code text default '5110-01';
alter table expenses add column if not exists description text;
alter table expenses add column if not exists payment_method text default 'โอนเงิน';
alter table expenses add column if not exists subtotal numeric(15,2) default 0;
alter table expenses add column if not exists vat_rate numeric(5,2) default 7.00;
alter table expenses add column if not exists vat_amount numeric(15,2) default 0;
alter table expenses add column if not exists wht_rate numeric(5,2) default 0;
alter table expenses add column if not exists wht_amount numeric(15,2) default 0;
alter table expenses add column if not exists total_amount numeric(15,2) default 0;
alter table expenses add column if not exists vendor_tax_invoice_no text;
alter table expenses add column if not exists tax_invoice_date date;
alter table expenses add column if not exists is_asset boolean default false;
alter table expenses add column if not exists accounting_status text default 'รอดำเนินการ';
alter table expenses add column if not exists status text default 'รอดำเนินการ';
alter table expenses add column if not exists approved_by uuid;
alter table expenses add column if not exists approved_at timestamptz;
alter table expenses add column if not exists payment_source text default 'company_bank';
alter table expenses add column if not exists company_bank_account text default '1110-02';
alter table expenses add column if not exists advance_payer_type text;
alter table expenses add column if not exists advance_payer_name text;
alter table expenses add column if not exists reimbursement_status text default 'none';
alter table expenses add column if not exists reimbursement_date date;
alter table expenses add column if not exists reimbursement_payment_id uuid;

-- 1.13 เจ้าหนี้การค้า (Accounts Payable)
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
  total_debt numeric(15,2) not null default 0,
  paid_amount numeric(15,2) not null default 0,
  remaining_amount numeric(15,2) not null default 0,
  status text default 'pending',
  payment_method text default 'โอนเงิน',
  alert_level text default 'normal',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 1.14 ทะเบียนบันทึกประวัติการจ่ายเงิน (Payment Transactions)
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_no text unique not null,
  document_type text not null check (document_type in ('PO', 'RI', 'EXP', 'INV', 'AP')),
  document_id uuid,
  document_no text not null,
  contact_id uuid,
  vendor_id uuid,
  project_id uuid references projects(id) on delete set null,
  payment_stage text not null default 'full' check (payment_stage in ('deposit', 'installment', 'remaining', 'full', 'advance_reimburse')),
  payment_method text not null check (payment_method in ('transfer', 'cheque', 'cash')),
  amount numeric(15,2) not null default 0 check (amount > 0),
  payment_date date not null default current_date,
  company_bank_account text,
  vendor_bank_name text,
  vendor_bank_account_no text,
  vendor_bank_account_name text,
  vendor_promptpay text,
  bank_fee numeric(15,2) default 0,
  cheque_no text,
  cheque_bank text,
  cheque_date date,
  cheque_payee_name text,
  cash_source text default '1110-01',
  slip_reference_no text,
  attachment_url text,
  notes text,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

alter table accounts_payable add column if not exists po_id uuid;
alter table accounts_payable add column if not exists vendor_id uuid;
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
alter table accounts_payable add column if not exists updated_at timestamptz default now();

-- 1.14 เงินประกันผลงาน (Retention Guarantees)
create table if not exists retention_guarantees (
  id uuid primary key default gen_random_uuid(),
  retention_no text unique not null,
  customer_name text,
  contractor_name text,
  trade_type text default 'general',
  project_id uuid references projects(id) on delete set null,
  contract_amount numeric(15,2) not null default 0,
  percentage numeric(5,2) default 5.00,
  retention_rate numeric(5,2) default 5.00,
  retention_amount numeric(15,2) not null default 0,
  warranty_period_months int default 12,
  release_date date not null,
  status text default 'held',
  created_at timestamptz default now()
);

alter table retention_guarantees add column if not exists customer_name text;
alter table retention_guarantees add column if not exists contractor_name text;
alter table retention_guarantees add column if not exists trade_type text default 'general';
alter table retention_guarantees add column if not exists contract_amount numeric(15,2) default 0;
alter table retention_guarantees add column if not exists percentage numeric(5,2) default 5.00;
alter table retention_guarantees add column if not exists retention_rate numeric(5,2) default 5.00;
alter table retention_guarantees add column if not exists retention_amount numeric(15,2) default 0;
alter table retention_guarantees add column if not exists warranty_period_months int default 12;
alter table retention_guarantees add column if not exists release_date date;
alter table retention_guarantees add column if not exists status text default 'held';

-- 1.15 บัตรน้ำมัน Fleet Card (Fleet Card Expenses)
create table if not exists fleet_card_expenses (
  id uuid primary key default gen_random_uuid(),
  slip_no text unique not null,
  vehicle_plate text not null,
  driver_name text,
  card_holder text,
  project_id uuid references projects(id) on delete set null,
  transaction_date date not null default current_date,
  fuel_type text default 'ดีเซล B7',
  liters numeric(10,2) default 0,
  amount numeric(15,2) not null default 0,
  station_name text default 'ปตท.',
  created_at timestamptz default now()
);

alter table fleet_card_expenses add column if not exists slip_no text;
alter table fleet_card_expenses add column if not exists vehicle_plate text;
alter table fleet_card_expenses add column if not exists driver_name text;
alter table fleet_card_expenses add column if not exists card_holder text;
alter table fleet_card_expenses add column if not exists transaction_date date default current_date;
alter table fleet_card_expenses add column if not exists fuel_type text default 'ดีเซล B7';
alter table fleet_card_expenses add column if not exists liters numeric(10,2) default 0;
alter table fleet_card_expenses add column if not exists amount numeric(15,2) default 0;
alter table fleet_card_expenses add column if not exists station_name text default 'ปตท.';

-- 1.16 ฝ่ายบุคคล (Employees, Attendance & Leaves)
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

alter table employees add column if not exists emp_code text;
alter table employees add column if not exists full_name text;
alter table employees add column if not exists department text;
alter table employees add column if not exists position text;
alter table employees add column if not exists salary numeric(15,2) default 0;
alter table employees add column if not exists phone text;
alter table employees add column if not exists start_date date;
alter table employees add column if not exists status text default 'active';

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

-- 1.17 ทรัพย์สินบริษัท (Company Assets)
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

alter table company_assets add column if not exists asset_code text;
alter table company_assets add column if not exists asset_name text;
alter table company_assets add column if not exists category text;
alter table company_assets add column if not exists serial_no text;
alter table company_assets add column if not exists assigned_to text;
alter table company_assets add column if not exists purchase_date date;
alter table company_assets add column if not exists purchase_cost numeric(15,2);
alter table company_assets add column if not exists status text default 'in_use';

-- 1.18 ทริกเกอร์ตรวจสอบความสมดุลเดบิต-เครดิต
create or replace function check_journal_entry_balance()
returns trigger language plpgsql as $$
declare
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_count int;
begin
  if new.accounting_status = 'อนุมัติแล้ว' and (tg_op = 'INSERT' or old.accounting_status is distinct from 'อนุมัติแล้ว') then
    select 
      coalesce(sum(debit), 0),
      coalesce(sum(credit), 0),
      count(*)
    into v_debit, v_credit, v_count
    from journal_entry_lines
    where journal_entry_id = new.id;

    if v_count = 0 then
      raise exception 'ไม่สามารถอนุมัติได้: ไม่มีรายการบันทึกบัญชีเดบิต/เครดิต (Journal Entry Lines)';
    end if;

    if abs(v_debit - v_credit) > 0.001 then
      raise exception 'รายการสมุดรายวันไม่ดุล: ยอดเดบิต (Dr. %) ไม่เท่ากับยอดเครดิต (Cr. %)', v_debit, v_credit;
    end if;

    if v_debit <= 0 then
      raise exception 'ไม่สามารถอนุมัติได้: ยอดเงินบันทึกบัญชีต้องมากกว่า 0';
    end if;

    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_verify_journal_balance on journal_entries;
create trigger trg_verify_journal_balance
  before insert or update of accounting_status on journal_entries
  for each row execute function check_journal_entry_balance();

-- 1.19 วิวสรุปแยกประเภทและงบทดลอง
create or replace view view_general_ledger as
select
  je.id as journal_entry_id,
  je.entry_no,
  je.entry_date,
  je.reference_type,
  je.reference_id,
  je.accounting_status,
  je.project_id,
  p.project_code,
  p.project_name,
  coa.account_code,
  coalesce(coa.account_name_th, coa.account_name) as account_name_th,
  coalesce(coa.account_category, initcap(coa.account_type)) as account_category,
  jel.id as line_id,
  jel.debit,
  jel.credit,
  coalesce(jel.line_description, jel.line_desc) as line_description,
  c.company_name as contact_name
from journal_entries je
join journal_entry_lines jel on jel.journal_entry_id = je.id
join chart_of_accounts coa on coa.id = jel.account_id
left join projects p on p.id = je.project_id
left join contacts c on c.id = jel.contact_id;

create or replace view view_trial_balance as
select
  coa.id as account_id,
  coa.account_code,
  coalesce(coa.account_name_th, coa.account_name) as account_name_th,
  coalesce(coa.account_category, initcap(coa.account_type)) as account_category,
  coalesce(sum(jel.debit), 0) as total_debit,
  coalesce(sum(jel.credit), 0) as total_credit,
  case 
    when coalesce(coa.account_category, initcap(coa.account_type)) in ('Asset', 'Expense') then coalesce(sum(jel.debit - jel.credit), 0)
    else coalesce(sum(jel.credit - jel.debit), 0)
  end as net_balance
from chart_of_accounts coa
left join journal_entry_lines jel on jel.account_id = coa.id
left join journal_entries je on je.id = jel.journal_entry_id and je.accounting_status = 'อนุมัติแล้ว'
where coalesce(coa.is_active, true) = true
group by coa.id, coa.account_code, coa.account_name_th, coa.account_name, coa.account_category, coa.account_type
order by coa.account_code;

-- 1.20 สิทธิ์ Row Level Security (RLS)
alter table contacts enable row level security;
alter table chart_of_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table tax_records enable row level security;
alter table sales_invoices enable row level security;
alter table expenses enable row level security;
alter table accounts_payable enable row level security;
alter table retention_guarantees enable row level security;
alter table fleet_card_expenses enable row level security;
alter table employees enable row level security;
alter table company_assets enable row level security;

drop policy if exists "allow_all_contacts" on contacts;
create policy "allow_all_contacts" on contacts for all using (true) with check (true);

drop policy if exists "allow_all_coa" on chart_of_accounts;
create policy "allow_all_coa" on chart_of_accounts for all using (true) with check (true);

drop policy if exists "allow_all_journals" on journal_entries;
create policy "allow_all_journals" on journal_entries for all using (true) with check (true);

drop policy if exists "allow_all_journal_lines" on journal_entry_lines;
create policy "allow_all_journal_lines" on journal_entry_lines for all using (true) with check (true);

drop policy if exists "allow_all_tax" on tax_records;
create policy "allow_all_tax" on tax_records for all using (true) with check (true);

drop policy if exists "allow_all_sales" on sales_invoices;
create policy "allow_all_sales" on sales_invoices for all using (true) with check (true);

drop policy if exists "allow_all_expenses" on expenses;
create policy "allow_all_expenses" on expenses for all using (true) with check (true);

drop policy if exists "allow_all_ap" on accounts_payable;
create policy "allow_all_ap" on accounts_payable for all using (true) with check (true);

drop policy if exists "allow_all_retention" on retention_guarantees;
create policy "allow_all_retention" on retention_guarantees for all using (true) with check (true);

drop policy if exists "allow_all_fleet" on fleet_card_expenses;
create policy "allow_all_fleet" on fleet_card_expenses for all using (true) with check (true);

drop policy if exists "allow_all_employees" on employees;
create policy "allow_all_employees" on employees for all using (true) with check (true);

drop policy if exists "allow_all_assets" on company_assets;
create policy "allow_all_assets" on company_assets for all using (true) with check (true);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 2: ล้างข้อมูลเดิมอย่างปลอดภัย (Safe Dynamic Truncate)
-- ------------------------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array[
    'tax_records',
    'journal_entry_lines',
    'journal_entries',
    'fleet_card_expenses',
    'retention_guarantees',
    'accounts_payable',
    'expenses',
    'sales_invoices',
    'quotation_items',
    'quotations',
    'stock_issue_items',
    'stock_issues',
    'stock_adjustments',
    'stock_lots',
    'goods_receipt_items',
    'goods_receipts',
    'purchase_order_items',
    'purchase_orders',
    'purchase_requisition_items',
    'purchase_requisitions',
    'leave_requests',
    'attendance_records',
    'company_assets',
    'employees',
    'inventory_items',
    'item_categories',
    'vendors',
    'customers',
    'contacts',
    'projects'
  ];
begin
  foreach t in array tbls loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('truncate table public.%I cascade', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- ส่วนที่ 3: โครงการหลัก (Projects - 4 โครงการ EPC & Solar)
-- ------------------------------------------------------------------------------
insert into projects (id, project_code, project_name, client_name, site_address, budget_total, start_date, end_date, status) values
  ('d1111111-0000-0000-0000-000000000001', 'PRJ-2026-001', 'โครงการติดตั้ง Solar Rooftop 120 kWp โรงงาน CPF สระบุรี', 'บจก. สยามพาณิชย์ พลังงานสะอาด', 'นิคมอุตสาหกรรมแก่งคอย จ.สระบุรี', 3500000.00, '2026-01-15', '2026-05-30', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000002', 'PRJ-2026-002', 'โครงการก่อสร้างอาคารสำนักงานและคลังสินค้า บจก. ไทยรุ่งพัฒนา', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', 'ถ.บางนา-ตราด กม.19 อ.บางพลี จ.สมุทรปราการ', 12500000.00, '2026-02-01', '2026-10-31', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000003', 'PRJ-2026-003', 'โครงการปรับปรุงระบบไฟฟ้าและตู้สวิตช์บอร์ด MDB กรีนเทค', 'บจก. กรีนเทค โลจิสติกส์', 'นิคมอุตสาหกรรมอมตะซิตี้ จ.ชลบุรี', 1850000.00, '2026-03-01', '2026-06-30', 'in_progress'),
  ('d1111111-0000-0000-0000-000000000004', 'PRJ-2026-004', 'โครงการปรับปรุงระบบประปา คอนโดมิเนียม ดิ แอร์เรียส', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', 'ถ.สุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ', 850000.00, '2026-03-10', '2026-04-30', 'planning');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 4: หมวดหมู่และทะเบียนวัสดุในสโตร์ (Item Categories & Inventory Items)
-- ------------------------------------------------------------------------------
insert into item_categories (id, name, code_prefix, sort_order) values
  ('c1111111-1111-1111-1111-111111111101', 'โซล่าเซลล์และพลังงานทางเลือก', 'SL', 1),
  ('c1111111-1111-1111-1111-111111111102', 'ระบบไฟฟ้าและสื่อสาร', 'EL', 2),
  ('c1111111-1111-1111-1111-111111111103', 'ปูน ทราย อิฐ หิน และงานโครงสร้าง', 'CV', 3),
  ('c1111111-1111-1111-1111-111111111104', 'เหล็กและโลหะรูปพรรณ', 'ST', 4),
  ('c1111111-1111-1111-1111-111111111105', 'ประปาและสุขภัณฑ์', 'PL', 5),
  ('c1111111-1111-1111-1111-111111111106', 'สีและเคมีภัณฑ์ก่อสร้าง', 'PT', 6);

insert into inventory_items (id, item_code, item_name, unit, category_id, qty_on_hand, avg_unit_cost, reorder_point) values
  ('a1111111-0000-0000-0000-000000000001', 'SL-0001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 'แผง', 'c1111111-1111-1111-1111-111111111101', 80, 3450.00, 20),
  ('a1111111-0000-0000-0000-000000000002', 'SL-0002', 'อินเวอร์เตอร์ Sungrow SG110CX พร้อม Smart Dongle', 'เครื่อง', 'c1111111-1111-1111-1111-111111111101', 2, 85000.00, 2),
  ('a1111111-0000-0000-0000-000000000003', 'EL-0001', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm. (100ม.)', 'ม้วน', 'c1111111-1111-1111-1111-111111111102', 10, 1850.00, 5),
  ('a1111111-0000-0000-0000-000000000004', 'EL-0002', 'ท่อร้อยสายไฟเหล็ก EMT 3/4 นิ้ว x 3 ม.', 'เส้น', 'c1111111-1111-1111-1111-111111111102', 220, 145.00, 50),
  ('a1111111-0000-0000-0000-000000000005', 'EL-0003', 'ตู้สวิตช์บอร์ด MDB 3 Phase เมนเบรกเกอร์ 250A', 'ตู้', 'c1111111-1111-1111-1111-111111111102', 2, 28500.00, 1),
  ('a1111111-0000-0000-0000-000000000006', 'CV-0001', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 'ถุง', 'c1111111-1111-1111-1111-111111111103', 300, 165.00, 100),
  ('a1111111-0000-0000-0000-000000000007', 'CV-0002', 'ทรายหยาบงานโครงสร้าง', 'คิว', 'c1111111-1111-1111-1111-111111111103', 45, 480.00, 15),
  ('a1111111-0000-0000-0000-000000000008', 'CV-0003', 'อิฐมวลเบา Q-CON ขนาด 7.5x20x60 ซม.', 'ก้อน', 'c1111111-1111-1111-1111-111111111103', 1200, 24.00, 300),
  ('a1111111-0000-0000-0000-000000000009', 'ST-0001', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 'เส้น', 'c1111111-1111-1111-1111-111111111104', 180, 245.00, 50),
  ('a1111111-0000-0000-0000-000000000010', 'PL-0001', 'ท่อ PVC สีฟ้า ท่อน้ำไทย ขนาด 2 นิ้ว ชั้น 8.5 (4ม.)', 'เส้น', 'c1111111-1111-1111-1111-111111111105', 80, 195.00, 20),
  ('a1111111-0000-0000-0000-000000000011', 'PT-0001', 'สีรองพื้นปูนใหม่กันด่าง TOA 4Seasons (5 แกลลอน)', 'ถัง', 'c1111111-1111-1111-1111-111111111106', 18, 1250.00, 5),
  ('a1111111-0000-0000-0000-000000000012', 'EL-0004', 'หลอดไฟ LED T8 18W แสงขาว Daylight ฟิลิปส์', 'หลอด', 'c1111111-1111-1111-1111-111111111102', 8, 85.00, 30);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 5: ผู้จำหน่าย ลูกค้า และผู้ติดต่อกลาง (Vendors, Customers & Contacts)
-- ------------------------------------------------------------------------------
insert into vendors (id, vendor_code, vendor_name, contact_person, phone, tax_id, address, bank_name, bank_account_no, bank_account_name, promptpay_no) values
  ('b1111111-0000-0000-0000-000000000001', 'V-0001', 'SCG Home Solution (สาขาชัยพฤกษ์)', 'คุณมนัส', '02-555-1234', '0105538012345', '99/1 ถ.ชัยพฤกษ์ ต.บางพลับ อ.ปากเกร็ด จ.นนทบุรี 11120', 'ธนาคารไทยพาณิชย์ (SCB)', '111-3-45678-9', 'SCG Home Solution', '0105538012345'),
  ('b1111111-0000-0000-0000-000000000002', 'V-0002', 'ไทวัสดุ (สาขาบางบัวทอง)', 'ฝ่ายขายโครงการ', '02-920-5678', '0105553018899', '88 หมู่ 3 ถ.กาญจนาภิเษก ต.บางบัวทอง จ.นนทบุรี 11110', 'ธนาคารกสิกรไทย (KBANK)', '023-1-99882-0', 'บจก. ซีอาร์ซี ไทวัสดุ', '0105553018899'),
  ('b1111111-0000-0000-0000-000000000003', 'V-0003', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', 'คุณธนากร', '02-118-9900', '0105561023451', '1 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 28 ถ.สาทรใต้ กรุงเทพฯ 10120', 'ธนาคารกสิกรไทย (KBANK)', '045-2-88192-3', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451'),
  ('b1111111-0000-0000-0000-000000000004', 'V-0004', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', 'คุณสมบูรณ์', '02-693-7800', '0105563044123', '252/89 อาคารเมืองไทย-ภัทร ถ.รัชดาภิเษก กรุงเทพฯ 10310', 'ธนาคารกรุงเทพ (BBL)', '238-0-91234-5', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123'),
  ('b1111111-0000-0000-0000-000000000005', 'V-0005', 'นายสมคิด ช่างฝีมือดี (ผู้รับเหมาค่าแรงงาน)', 'ช่างสมคิด', '089-771-4567', '1100400234112', '14/2 หมู่ 3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120', 'ธนาคารกสิกรไทย (KBANK)', '743-2-11982-1', 'นายสมคิด ช่างฝีมือดี', '089-771-4567');

insert into customers (id, customer_code, customer_name, tax_id, branch_type, branch_no, address, postal_code, contact_person, phone, email) values
  ('e1111111-0000-0000-0000-000000000001', 'CUST-0001', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', '0107560000112', 'head_office', '00000', '999 อาคารสยามทาวเวอร์ ถ.พหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900', '10900', 'คุณวิศรุต (ฝ่ายจัดซื้อ)', '02-555-1234', 'procure@sc-cleanenergy.co.th'),
  ('e1111111-0000-0000-0000-000000000002', 'CUST-0002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', 'branch', '00001', '88/2 หมู่ 4 นิคมอุตสาหกรรมบางพลี ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ', '10570', 'คุณเกียรติศักดิ์', '02-315-4422', 'contact@thairung-eng.co.th'),
  ('e1111111-0000-0000-0000-000000000003', 'CUST-0003', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', '0105562098711', 'head_office', '00000', '123/45 นิคมอุตสาหกรรมอมตะซิตี้ ต.ดอนหัวฬ่อ อ.เมืองชลบุรี จ.ชลบุรี', '20000', 'คุณปริวัตร', '038-490-888', 'solar@greentech-logistics.com'),
  ('e1111111-0000-0000-0000-000000000004', 'CUST-0004', 'นิติบุคคลอาคารชุด ดิ แอร์เรียส เรสซิเดนซ์', '0994000187654', 'head_office', '00000', '155 ซอยสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร', '10110', 'ผู้จัดการนิติบุคคล', '02-711-3322', 'juristic@thearies.co.th');

insert into contacts (id, contact_code, contact_type, company_name, tax_id, branch_code, phone, email, address, bank_name, bank_account_no, bank_account_name, promptpay_no) values
  ('e1111111-0000-0000-0000-000000000001', 'CUST-0001', 'customer', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', '0107560000112', '00000', '02-555-1234', 'procure@sc-cleanenergy.co.th', '999 อาคารสยามทาวเวอร์ ถ.พหลโยธิน แขวงจตุจักร กรุงเทพฯ 10900', 'ธนาคารไทยพาณิชย์ (SCB)', '001-4-88992-1', 'บมจ. สยามพาณิชย์ พลังงานสะอาด', '0107560000112'),
  ('e1111111-0000-0000-0000-000000000002', 'CUST-0002', 'customer', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '0105558012345', '00001', '02-315-4422', 'contact@thairung-eng.co.th', '88/2 หมู่ 4 นิคมอุตสาหกรรมบางพลี ต.บางเสาธง สมุทรปราการ 10570', 'ธนาคารกสิกรไทย (KBANK)', '188-2-45129-0', 'บจก. ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง', '0105558012345'),
  ('e1111111-0000-0000-0000-000000000003', 'CUST-0003', 'customer', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', '0105562098711', '00000', '038-490-888', 'solar@greentech-logistics.com', '123/45 นิคมอมตะซิตี้ อ.เมืองชลบุรี จ.ชลบุรี 20000', 'ธนาคารกรุงเทพ (BBL)', '902-1-33214-5', 'บจก. กรีนเทค โลจิสติกส์', '0105562098711'),
  ('b1111111-0000-0000-0000-000000000003', 'VEND-0001', 'vendor', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451', '00000', '02-118-9900', 'sales-th@sungrowpower.com', '1 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 28 ถ.สาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120', 'ธนาคารกสิกรไทย (KBANK)', '045-2-88192-3', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', '0105561023451'),
  ('b1111111-0000-0000-0000-000000000004', 'VEND-0002', 'vendor', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123', '00000', '02-693-7800', 'thailand@jasolar.com', '252/89 อาคารเมืองไทย-ภัทร คอมเพล็กซ์ ถ.รัชดาภิเษก กรุงเทพฯ 10310', 'ธนาคารกรุงเทพ (BBL)', '238-0-91234-5', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', '0105563044123'),
  ('b1111111-0000-0000-0000-000000000005', 'VEND-0004', 'vendor', 'นายสมคิด ช่างฝีมือดี (ผู้รับเหมาค่าแรงงาน)', '1100400234112', '00000', '089-771-4567', 'somkid.builder@gmail.com', '14/2 หมู่ 3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120', 'ธนาคารกสิกรไทย (KBANK)', '743-2-11982-1', 'นายสมคิด ช่างฝีมือดี', '089-771-4567')
on conflict (contact_code) do update set
  company_name = excluded.company_name,
  bank_name = excluded.bank_name,
  bank_account_no = excluded.bank_account_no,
  bank_account_name = excluded.bank_account_name,
  promptpay_no = excluded.promptpay_no;

-- ------------------------------------------------------------------------------
-- ส่วนที่ 6: ใบเสนอราคา (Quotations & Quotation Items)
-- ------------------------------------------------------------------------------
insert into quotations (
  id, quotation_no, issue_date, validity_days, expiry_date, sales_person, currency,
  customer_id, customer_name, customer_address, customer_postal_code, customer_tax_id, customer_branch,
  project_id, ref_no, warehouse_name, subtotal, discount_amount, after_discount, vat_rate, vat_amount,
  wht_rate, wht_amount, grand_total, customer_notes, internal_notes, status, accounting_status
) values
  ('fa111111-0000-0000-0000-000000000001', 'QT2026110001', '2026-11-01', 30, '2026-12-01', 'คุณปริญญา ชัยชนะ', 'THB',
   'e1111111-0000-0000-0000-000000000001', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', '999 อาคารสยามทาวเวอร์ ถ.พหลโยธิน กรุงเทพฯ', '10900', '0107560000112', 'สำนักงานใหญ่',
   'd1111111-0000-0000-0000-000000000001', 'CPF-SOLAR-01', 'สโตร์หลัก', 2500000.00, 0, 2500000.00, 7.00, 175000.00, 0, 0, 2675000.00,
   'รวมค่าติดตั้ง อุปกรณ์โครงสร้างยึด และงานขออนุญาตเชื่อมต่อโครงข่าย กฟภ.', 'ลูกค้ารายใหญ่เซ็นอนุมัติแล้ว พร้อมเริ่มงานงวด 1', 'approved', 'อนุมัติแล้ว'),

  ('fa111111-0000-0000-0000-000000000002', 'QT2026110002', '2026-11-04', 30, '2026-12-04', 'คุณปริญญา ชัยชนะ', 'THB',
   'e1111111-0000-0000-0000-000000000002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', '88/2 หมู่ 4 นิคมบางพลี สมุทรปราการ', '10570', '0105558012345', 'สาขาที่ 00001',
   'd1111111-0000-0000-0000-000000000002', 'TR-BLD-02', 'สโตร์หลัก', 1800000.00, 0, 1800000.00, 7.00, 126000.00, 0, 0, 1926000.00,
   'งานก่อสร้างโครงสร้างอาคารคลังสินค้าและหลังคารับน้ำหนักแผงโซลาร์', 'อยู่ระหว่างส่งใบเสนอราคาให้ฝ่ายบริหารเซ็นรับรอง', 'sent', 'รอดำเนินการ'),

  ('fa111111-0000-0000-0000-000000000003', 'QT2026110003', '2026-11-08', 30, '2026-12-08', 'คุณอานนท์ วาณิชย์กุล', 'THB',
   'e1111111-0000-0000-0000-000000000003', 'บริษัท กรีนเทค โลจิสติกส์ เซ็นเตอร์ จำกัด', '123/45 นิคมอมตะซิตี้ จ.ชลบุรี', '20000', '0105562098711', 'สำนักงานใหญ่',
   'd1111111-0000-0000-0000-000000000003', 'GT-ELEC-03', 'สโตร์หลัก', 850000.00, 0, 850000.00, 7.00, 59500.00, 0, 0, 909500.00,
   'ปรับปรุงระบบตู้สวิตช์บอร์ด MDB และระบบป้องกันไฟกระชาก', 'ฉบับร่างเตรียมเสนอราคาในสัปดาห์หน้า', 'draft', 'รอดำเนินการ');

insert into quotation_items (quotation_id, item_id, item_name, description, quantity, unit, unit_price, discount_percent, total_amount) values
  ('fa111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 'รับประกันประสิทธิภาพ 25 ปี Tier 1 BloombergNEF', 240, 'แผง', 3450.00, 0, 828000.00),
  ('fa111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000002', 'อินเวอร์เตอร์ Sungrow SG110CX พร้อม Smart Dongle', 'กำลังผลิต 110 kW รองรับ 9 MPPT', 2, 'เครื่อง', 85000.00, 0, 170000.00),
  ('fa111111-0000-0000-0000-000000000001', null, 'งานติดตั้งโครงสร้าง อุปกรณ์เดินสายไฟ และทดสอบระบบ (Turnkey EPC)', 'ค่าแรงและอุปกรณ์ประกอบติดตั้งมาตรฐานสากล', 1, 'งาน', 1502000.00, 0, 1502000.00),
  ('fa111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000006', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 'งานเทฐานรากและเสาคานอาคาร', 600, 'ถุง', 165.00, 0, 99000.00),
  ('fa111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000009', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 'เหล็กโรงใหญ่ มอก. งานรับแรงดัดโครงสร้าง', 400, 'เส้น', 245.00, 0, 98000.00),
  ('fa111111-0000-0000-0000-000000000002', null, 'งานโครงสร้างอาคารและระบบหลังคาเมทัลชีท', 'เสา โครงหลังคาเหล็กถัก พร้อมฉนวนกันความร้อน PU', 1, 'งาน', 1603000.00, 0, 1603000.00);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 7: ฝ่ายจัดซื้อ (Purchase Requisitions PR & Purchase Orders PO)
-- ------------------------------------------------------------------------------
insert into purchase_requisitions (id, pr_no, project_id, request_date, status, notes, created_at) values
  ('f1111111-0000-0000-0000-000000000001', 'PR202611-0001', 'd1111111-0000-0000-0000-000000000001', '2026-11-01', 'ordered', 'สั่งซื้อแผงโซล่าเซลล์และสายไฟ PV สำหรับหน้างาน CPF สระบุรี', '2026-11-01 09:30:00+07'),
  ('f1111111-0000-0000-0000-000000000002', 'PR202611-0002', 'd1111111-0000-0000-0000-000000000002', '2026-11-03', 'ordered', 'สั่งซื้อปูนซีเมนต์และเหล็กเส้นสำหรับงานฐานรากอาคารคลังสินค้า', '2026-11-03 11:15:00+07'),
  ('f1111111-0000-0000-0000-000000000003', 'PR202611-0003', 'd1111111-0000-0000-0000-000000000004', '2026-11-10', 'pending', 'ขอสั่งซื้อท่อและหลอดไฟ LED สำหรับโครงการปรับปรุงประปาและแสงสว่าง', '2026-11-10 14:00:00+07');

insert into purchase_requisition_items (pr_id, item_id, item_name, quantity, unit, estimated_price) values
  ('f1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 120, 'แผง', 3450.00),
  ('f1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000003', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm.', 15, 'ม้วน', 1850.00),
  ('f1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000006', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 300, 'ถุง', 165.00),
  ('f1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000009', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 180, 'เส้น', 245.00),
  ('f1111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000004', 'ท่อร้อยสายไฟเหล็ก EMT 3/4 นิ้ว x 3 ม.', 80, 'เส้น', 145.00);

insert into purchase_orders (
  id, po_no, pr_id, project_id, vendor_id, order_date, total_amount, status,
  payment_type, payment_term_days, quotation_no, quotation_date, tax_type, vat_rate, vat_amount, wht_rate, wht_amount, net_amount, accounting_status
) values
  ('ba111111-0000-0000-0000-000000000001', 'PO202611-0001', 'f1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000003', '2026-11-02', 441750.00, 'received', 'credit_30', 30, 'QT-SG-9821', '2026-10-28', 'vat_excluded', 7.00, 30922.50, 0.00, 0.00, 472672.50, 'อนุมัติแล้ว'),
  ('ba111111-0000-0000-0000-000000000002', 'PO202611-0002', 'f1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000002', 'b1111111-0000-0000-0000-000000000001', '2026-11-04', 93600.00, 'open', 'credit_60', 60, 'SCG-QT-202611', '2026-11-01', 'vat_included', 7.00, 6123.36, 0.00, 0.00, 93600.00, 'รอดำเนินการ'),
  ('ba111111-0000-0000-0000-000000000003', 'PO202611-0003', 'f1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000004', 'b1111111-0000-0000-0000-000000000002', '2026-11-05', 12840.00, 'received', 'cash', 0, 'TW-2026-441', '2026-11-05', 'vat_included', 7.00, 840.00, 0.00, 0.00, 12840.00, 'อนุมัติแล้ว');

insert into purchase_order_items (id, po_id, item_id, item_name, quantity, unit, unit_price, qty_received) values
  ('ba111111-1111-0000-0000-000000000001', 'ba111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'แผงโซล่าเซลล์ Mono Half-Cell 550W Tier 1', 120, 'แผง', 3450.00, 120),
  ('ba111111-1111-0000-0000-000000000002', 'ba111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000003', 'สายไฟโซล่าเซลล์ Solar Cable PV1-F 1x4 sq.mm.', 15, 'ม้วน', 1850.00, 15),
  ('ba111111-1111-0000-0000-000000000003', 'ba111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000006', 'ปูนซีเมนต์ปอร์ตแลนด์ ตราช้าง SCG 50 กก.', 300, 'ถุง', 165.00, 0),
  ('ba111111-1111-0000-0000-000000000004', 'ba111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000009', 'เหล็กเส้นข้ออ้อย DB12 SD40 มอก. ยาว 10 ม.', 180, 'เส้น', 245.00, 0),
  ('ba111111-1111-0000-0000-000000000005', 'ba111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000004', 'ท่อร้อยสายไฟเหล็ก EMT 3/4 นิ้ว x 3 ม.', 80, 'เส้น', 145.00, 80);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 8: ฝ่ายสโตร์ (Goods Receipts GRN, Stock Lots & Stock Issues)
-- ------------------------------------------------------------------------------
insert into goods_receipts (id, grn_no, po_id, received_date, vendor_tax_invoice_no, tax_invoice_date, accounting_status) values
  ('ca111111-0000-0000-0000-000000000001', 'GRN202611-0001', 'ba111111-0000-0000-0000-000000000001', '2026-11-04', 'SG-TAX-20261104', '2026-11-04', 'อนุมัติแล้ว'),
  ('ca111111-0000-0000-0000-000000000002', 'GRN202611-0002', 'ba111111-0000-0000-0000-000000000003', '2026-11-06', 'TW-TAX-889021', '2026-11-06', 'อนุมัติแล้ว');

insert into goods_receipt_items (id, grn_id, po_item_id, qty_received, unit_cost) values
  ('ca111111-1111-0000-0000-000000000001', 'ca111111-0000-0000-0000-000000000001', 'ba111111-1111-0000-0000-000000000001', 120, 3450.00),
  ('ca111111-1111-0000-0000-000000000002', 'ca111111-0000-0000-0000-000000000001', 'ba111111-1111-0000-0000-000000000002', 15, 1850.00),
  ('ca111111-1111-0000-0000-000000000003', 'ca111111-0000-0000-0000-000000000002', 'ba111111-1111-0000-0000-000000000005', 80, 145.00);

insert into stock_lots (id, item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost) values
  ('da111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 'ca111111-1111-0000-0000-000000000001', 'receipt', '2026-11-04', 120, 80, 3450.00),
  ('da111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001', 'ca111111-1111-0000-0000-000000000002', 'receipt', '2026-11-04', 15, 10, 1850.00),
  ('da111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000004', 'd1111111-0000-0000-0000-000000000004', 'ca111111-1111-0000-0000-000000000003', 'receipt', '2026-11-06', 80, 50, 145.00);

insert into stock_issues (id, issue_no, project_id, issue_date, notes) values
  ('ea111111-0000-0000-0000-000000000001', 'ISS202611-0001', 'd1111111-0000-0000-0000-000000000001', '2026-11-07', 'เบิกแผงโซล่าเซลล์และสายไฟชุดแรก เพื่อเตรียมติดตั้งโครงสร้างหลังคา CPF สระบุรี'),
  ('ea111111-0000-0000-0000-000000000002', 'ISS202611-0002', 'd1111111-0000-0000-0000-000000000002', '2026-11-08', 'เบิกท่อ EMT เดินระบบไฟฟ้าในสำนักงานชั่วคราว ไทยรุ่งพัฒนา');

insert into stock_issue_items (issue_id, item_id, quantity, unit_cost) values
  ('ea111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 40, 3450.00),
  ('ea111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000003', 5, 1850.00),
  ('ea111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000004', 30, 145.00);

-- ------------------------------------------------------------------------------
-- ส่วนที่ 9: ผังบัญชีมาตรฐานธุรกิจ SME ไทย (Chart of Accounts - 33 หมวด)
-- ------------------------------------------------------------------------------
insert into chart_of_accounts (account_code, account_name, account_name_th, account_name_en, account_category, account_type, is_system_default, is_active)
values
  -- [1] สินทรัพย์ (Assets)
  ('1110-01', 'เงินสดในมือ', 'เงินสดในมือ', 'Cash on Hand', 'Asset', 'asset', true, true),
  ('1110-02', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารกสิกรไทย', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารกสิกรไทย', 'Bank Account - KBANK', 'Asset', 'asset', true, true),
  ('1110-03', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารไทยพาณิชย์', 'เงินฝากกระแสรายวัน/ออมทรัพย์ ธนาคารไทยพาณิชย์', 'Bank Account - SCB', 'Asset', 'asset', true, true),
  ('1120-01', 'เงินสดย่อยสำนักงานและสโตร์', 'เงินสดย่อยสำนักงานและสโตร์', 'Petty Cash', 'Asset', 'asset', true, true),
  ('1130-01', 'ลูกหนี้การค้า', 'ลูกหนี้การค้า', 'Accounts Receivable - Trade', 'Asset', 'asset', true, true),
  ('1130-02', 'ลูกหนี้เงินประกันผลงานโครงการ', 'ลูกหนี้เงินประกันผลงานโครงการ', 'Retention Receivable', 'Asset', 'asset', true, true),
  ('1140-01', 'สินค้า/วัสดุก่อสร้างคงเหลือ', 'สินค้า/วัสดุก่อสร้างคงเหลือ', 'Inventory - Construction Materials', 'Asset', 'asset', true, true),
  ('1150-01', 'ภาษีซื้อ', 'ภาษีซื้อ', 'Input VAT', 'Asset', 'asset', true, true),
  ('1150-02', 'ภาษีซื้อยังไม่ถึงกำหนดชำระ', 'ภาษีซื้อยังไม่ถึงกำหนดชำระ', 'Undue Input VAT', 'Asset', 'asset', true, true),
  ('1160-01', 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก (รอนำส่ง)', 'ภาษีเงินได้หัก ณ ที่จ่ายถูกหัก (รอนำส่ง)', 'Withholding Tax Deducted at Source', 'Asset', 'asset', true, true),
  ('1510-01', 'อาคารสำนักงานและสโตร์', 'อาคารสำนักงานและสโตร์', 'Buildings and Warehouses', 'Asset', 'asset', true, true),
  ('1520-01', 'เครื่องจักรและยานพาหนะโครงการ', 'เครื่องจักรและยานพาหนะโครงการ', 'Machinery and Vehicles', 'Asset', 'asset', true, true),
  ('1530-01', 'อุปกรณ์เครื่องมือช่างและคอมพิวเตอร์', 'อุปกรณ์เครื่องมือช่างและคอมพิวเตอร์', 'Tools and Computer Equipment', 'Asset', 'asset', true, true),
  ('1540-01', 'ค่าเสื่อมราคาสะสม', 'ค่าเสื่อมราคาสะสม', 'Accumulated Depreciation', 'Asset', 'asset', true, true),

  -- [2] หนี้สิน (Liabilities)
  ('2110-01', 'เจ้าหนี้การค้า', 'เจ้าหนี้การค้า', 'Accounts Payable - Trade', 'Liability', 'liability', true, true),
  ('2110-02', 'เจ้าหนี้ผู้รับเหมาช่วง (Sub-contractor AP)', 'เจ้าหนี้ผู้รับเหมาช่วง (Sub-contractor AP)', 'Sub-contractor Payable', 'Liability', 'liability', true, true),
  ('2120-01', 'เงินมัดจำรับล่วงหน้าจากลูกค้า', 'เงินมัดจำรับล่วงหน้าจากลูกค้า', 'Customer Advances / Retention Payable', 'Liability', 'liability', true, true),
  ('2130-01', 'ภาษีขาย', 'ภาษีขาย', 'Output VAT', 'Liability', 'liability', true, true),
  ('2130-02', 'ภาษีขายยังไม่ถึงกำหนดชำระ', 'ภาษีขายยังไม่ถึงกำหนดชำระ', 'Undue Output VAT', 'Liability', 'liability', true, true),
  ('2140-01', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.3/53)', 'ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.3/53)', 'Withholding Tax Payable', 'Liability', 'liability', true, true),
  ('2150-01', 'เงินประกันผลงานค้างจ่ายผู้รับเหมา', 'เงินประกันผลงานค้างจ่ายผู้รับเหมา', 'Retention Payable to Sub-contractor', 'Liability', 'liability', true, true),
  ('2160-01', 'ค่าใช้จ่ายค้างจ่าย', 'ค่าใช้จ่ายค้างจ่าย', 'Accrued Expenses', 'Liability', 'liability', true, true),

  -- [3] ส่วนของเจ้าของ (Equity)
  ('3110-01', 'ทุนจดทะเบียนชำระแล้ว', 'ทุนจดทะเบียนชำระแล้ว', 'Issued and Paid-up Capital', 'Equity', 'equity', true, true),
  ('3210-01', 'กำไรสะสมยังไม่ได้จัดสรร', 'กำไรสะสมยังไม่ได้จัดสรร', 'Retained Earnings', 'Equity', 'equity', true, true),

  -- [4] รายได้ (Revenue)
  ('4110-01', 'รายได้จากการรับเหมาก่อสร้างและติดตั้ง Solar Rooftop', 'รายได้จากการรับเหมาก่อสร้างและติดตั้ง Solar Rooftop', 'Revenue from Construction & Solar EPC', 'Revenue', 'revenue', true, true),
  ('4120-01', 'รายได้จากงานบริการบำรุงรักษา (O&M)', 'รายได้จากงานบริการบำรุงรักษา (O&M)', 'Revenue from Maintenance Service', 'Revenue', 'revenue', true, true),
  ('4210-01', 'รายได้อื่นและดอกเบี้ยรับ', 'รายได้อื่นและดอกเบี้ยรับ', 'Other Income', 'Revenue', 'revenue', true, true),

  -- [5] ค่าใช้จ่ายและต้นทุน (Expenses)
  ('5110-01', 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์ Solar Rooftop', 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์ Solar Rooftop', 'Cost of Construction Materials & Solar Equipment', 'Expense', 'expense', true, true),
  ('5120-01', 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', 'Direct Labor Costs', 'Expense', 'expense', true, true),
  ('5130-01', 'ต้นทุนค่าจ้างเหมาช่วง (Sub-contractor Cost)', 'ต้นทุนค่าจ้างเหมาช่วง (Sub-contractor Cost)', 'Sub-contractor Costs', 'Expense', 'expense', true, true),
  ('5210-01', 'เงินเดือนและสวัสดิการพนักงาน', 'เงินเดือนและสวัสดิการพนักงาน', 'Salaries and Employee Benefits', 'Expense', 'expense', true, true),
  ('5220-01', 'ค่าน้ำมันเชื้อเพลิงและยานพาหนะ (Fleet Card)', 'ค่าน้ำมันเชื้อเพลิงและยานพาหนะ (Fleet Card)', 'Fuel and Transportation Expenses', 'Expense', 'expense', true, true),
  ('5230-01', 'ค่าธรรมเนียมธนาคาร', 'ค่าธรรมเนียมธนาคาร', 'Bank Transfer Fees', 'Expense', 'expense', true, true)
on conflict (account_code) do update set
  account_name = excluded.account_name,
  account_name_th = excluded.account_name_th,
  account_name_en = excluded.account_name_en,
  account_category = excluded.account_category,
  account_type = excluded.account_type,
  is_active = true;

-- ------------------------------------------------------------------------------
-- ส่วนที่ 10: ลูกหนี้การค้าและใบแจ้งหนี้ (Sales Invoices & AR Aging Data)
-- ------------------------------------------------------------------------------
insert into sales_invoices (invoice_no, contact_id, project_id, issue_date, due_date, subtotal, vat_rate, vat_amount, total_amount, paid_amount, remaining_amount, is_opening_balance, status, notes) values
  ('INV202610-0001', 'e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', '2026-10-01', '2026-10-31', 2500000.00, 7.00, 175000.00, 2675000.00, 0, 2675000.00, false, 'รอเก็บเงิน', 'ค่างวดที่ 1 งานติดตั้งแผงโซลาร์เซลล์ 120 kWp สระบุรี'),
  ('INV202610-0002', 'e1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000002', '2026-10-25', '2026-11-25', 1800000.00, 7.00, 126000.00, 1926000.00, 500000.00, 1426000.00, false, 'รอเก็บเงิน', 'ค่างวดโครงสร้างอาคารคลังสินค้าและหลังคารับแรง'),
  ('INV202609-0001', 'e1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000003', '2026-09-10', '2026-10-10', 850000.00, 7.00, 59500.00, 909500.00, 0, 909500.00, false, 'รอเก็บเงิน', 'ค่างานระบบไฟฟ้าและตู้สวิตช์บอร์ด MDB ชลบุรี'),
  ('AR-OPEN-001', 'e1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000002', '2026-06-15', '2026-07-15', 420000.00, 0.00, 0.00, 420000.00, 0, 420000.00, true, 'รอเก็บเงิน', 'ยอดยกมาจากระบบเดิม: งานปรับระดับพื้นที่และฐานรากคอนกรีต');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 11: ค่าใช้จ่าย (Expenses - EXP)
-- ------------------------------------------------------------------------------
insert into expenses (expense_no, contact_id, project_id, expense_date, due_date, expense_category, account_code, description, payment_method, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total_amount, vendor_tax_invoice_no, tax_invoice_date, is_asset, accounting_status, status) values
  ('EXP202611-0001', 'b1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001', '2026-11-05', '2026-12-05', 'งานก่อสร้างและดำเนินงาน', '5110-01', 'ซื้ออินเวอร์เตอร์ Sungrow SG110CX พร้อมอุปกรณ์ติดตั้ง', 'โอนเงิน', 480000.00, 7.00, 33600.00, 0, 0, 513600.00, 'SG-INV-2026-9901', '2026-11-05', false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),
  ('EXP202611-0002', 'b1111111-0000-0000-0000-000000000005', 'd1111111-0000-0000-0000-000000000001', '2026-11-08', '2026-11-08', 'งานก่อสร้างและดำเนินงาน', '5120-01', 'ค่าจ้างแรงงานติดตั้งโครงสร้าง Solar งวดที่ 1', 'โอนเงิน', 75000.00, 0.00, 0.00, 3.00, 2250.00, 72750.00, null, null, false, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว'),
  ('EXP202611-0003', null, null, '2026-11-10', '2026-11-10', 'สำนักงานและบริหาร', '1530-01', 'ซื้อโดรนสำรวจหน้างานและหลังคา DJI Mavic 3 Enterprise', 'บัตรเครดิต', 145000.00, 7.00, 10150.00, 0, 0, 155150.00, 'DJI-TAX-4591', '2026-11-10', true, 'อนุมัติแล้ว', 'จ่ายเงินแล้ว');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 12: เจ้าหนี้การค้า (Accounts Payable Aging Data)
-- ------------------------------------------------------------------------------
insert into accounts_payable (ap_no, vendor_name, invoice_no, invoice_date, due_date, credit_days, total_debt, paid_amount, remaining_amount, status, payment_method, alert_level) values
  ('AP202611-0001', 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด', 'SG-2026-1102', '2026-11-02', '2026-12-02', 30, 513600.00, 0, 513600.00, 'pending', 'โอนเงิน', 'urgent'),
  ('AP202610-0002', 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด', 'JA-TH-88910', '2026-10-15', '2026-11-14', 30, 890000.00, 400000.00, 490000.00, 'pending', 'โอนเงิน', 'warning'),
  ('AP202609-0003', 'SCG Home Solution (สาขาชัยพฤกษ์)', 'SCG-TAX-4412', '2026-09-20', '2026-10-20', 30, 93600.00, 0, 93600.00, 'pending', 'โอนเงิน', 'normal');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 13: เงินค้ำประกันผลงานและบัตรน้ำมัน Fleet Card
-- ------------------------------------------------------------------------------
insert into retention_guarantees (retention_no, customer_name, contractor_name, trade_type, project_id, contract_amount, percentage, retention_rate, retention_amount, warranty_period_months, release_date, status) values
  ('RET-2026-001', 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)', 'บริษัท แอนวา แอนด์ โค จำกัด', 'solar_epc', 'd1111111-0000-0000-0000-000000000001', 2675000.00, 5.00, 5.00, 133750.00, 24, '2028-05-30', 'held'),
  ('RET-2026-002', 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด', 'บริษัท แอนวา แอนด์ โค จำกัด', 'construction', 'd1111111-0000-0000-0000-000000000002', 1926000.00, 5.00, 5.00, 96300.00, 12, '2027-10-31', 'held');

insert into fleet_card_expenses (slip_no, vehicle_plate, driver_name, card_holder, project_id, transaction_date, fuel_type, liters, amount, station_name) values
  ('FLT-202611-001', '2ขข-4589', 'นายสมชาย ใจมั่น (โฟร์แมน)', 'บริษัท แอนวา แอนด์ โค จำกัด', 'd1111111-0000-0000-0000-000000000001', '2026-11-02', 'ดีเซล B7', 65.40, 2150.00, 'ปตท. สระบุรี มิตรภาพ กม.15'),
  ('FLT-202611-002', '3ฒฒ-8812', 'นายปริญญา ชัยชนะ (วิศวกร)', 'บริษัท แอนวา แอนด์ โค จำกัด', 'd1111111-0000-0000-0000-000000000002', '2026-11-06', 'ดีเซล B7', 58.20, 1920.00, 'บางจาก บางนา-ตราด กม.19');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 14: ฝ่ายบุคคลและทรัพย์สิน (Employees, Attendance, Leaves & Assets)
-- ------------------------------------------------------------------------------
insert into employees (id, emp_code, full_name, department, position, salary, phone, start_date, status) values
  ('ee111111-0000-0000-0000-000000000001', 'EMP-001', 'นายอานนท์ วาณิชย์กุล', 'ผู้บริหาร', 'กรรมการผู้จัดการ', 120000.00, '081-999-1111', '2023-01-01', 'active'),
  ('ee111111-0000-0000-0000-000000000002', 'EMP-002', 'น.ส.วิภาดา ภัทรเดช', 'บัญชีและการเงิน', 'สมุห์บัญชีอาวุโส', 55000.00, '089-222-3344', '2023-02-15', 'active'),
  ('ee111111-0000-0000-0000-000000000003', 'EMP-003', 'นายปริญญา ชัยชนะ', 'วิศวกรรมโครงการ', 'หัวหน้าวิศวกร Solar EPC', 65000.00, '086-444-5566', '2023-03-01', 'active'),
  ('ee111111-0000-0000-0000-000000000004', 'EMP-004', 'นายสมชาย ใจมั่น', 'ปฏิบัติการหน้างาน', 'โฟร์แมนคุมงานก่อสร้าง', 35000.00, '085-777-8899', '2023-04-10', 'active'),
  ('ee111111-0000-0000-0000-000000000005', 'EMP-005', 'นายสุรชัย มั่นคง', 'สโตร์และโลจิสติกส์', 'เจ้าหน้าที่ควบคุมพัสดุและคลัง', 28000.00, '084-555-6677', '2023-05-01', 'active'),
  ('ee111111-0000-0000-0000-000000000006', 'EMP-006', 'นางสาวกนกพร สิทธิโชค', 'ธุรการและจัดซื้อ', 'เจ้าหน้าที่จัดซื้อโครงการ', 30000.00, '082-333-4455', '2023-06-01', 'active');

insert into attendance_records (emp_id, emp_name, work_date, check_in_time, check_out_time, gps_location, ot_hours, status) values
  ('ee111111-0000-0000-0000-000000000003', 'นายปริญญา ชัยชนะ', '2026-11-12', '07:55', '17:30', '14.5821, 100.9982 (โรงงาน CPF สระบุรี)', 1.5, 'normal'),
  ('ee111111-0000-0000-0000-000000000004', 'นายสมชาย ใจมั่น', '2026-11-12', '08:02', '18:00', '14.5823, 100.9980 (โรงงาน CPF สระบุรี)', 2.0, 'normal'),
  ('ee111111-0000-0000-0000-000000000005', 'นายสุรชัย มั่นคง', '2026-11-12', '08:15', '17:05', '13.8824, 100.4120 (สโตร์กลางบริษัท นนทบุรี)', 0.0, 'late'),
  ('ee111111-0000-0000-0000-000000000006', 'นางสาวกนกพร สิทธิโชค', '2026-11-12', '08:25', '17:40', '13.8510, 100.4890 (สำนักงานใหญ่ ANVA)', 0.5, 'normal');

insert into leave_requests (emp_id, emp_name, leave_type, start_date, end_date, days, reason, status, approver) values
  ('ee111111-0000-0000-0000-000000000006', 'นางสาวกนกพร สิทธิโชค', 'sick', '2026-11-11', '2026-11-11', 1.0, 'มีไข้หวัด พบแพทย์ รพ.บางใหญ่ มีใบรับรองแพทย์', 'approved', 'ปริญญา (PM)'),
  ('ee111111-0000-0000-0000-000000000004', 'นายสมชาย ใจมั่น', 'personal', '2026-11-18', '2026-11-18', 1.0, 'ติดต่อธุระทางราชการที่สำนักงานที่ดิน', 'pending', null);

insert into company_assets (asset_code, asset_name, category, serial_no, assigned_to, purchase_date, purchase_cost, status) values
  ('AST-VEH-01', 'รถกระบะ Toyota Hilux Revo 4 ประตู (2ขข-4589)', 'ยานพาหนะ', 'MR0BA3CD2019882', 'นายสมชาย ใจมั่น', '2023-03-10', 785000.00, 'in_use'),
  ('AST-IT-01', 'โน้ตบุ๊ก Dell Latitude 5430 (Core i7 / RAM 16GB)', 'คอมพิวเตอร์และไอที', 'SN-DELL-8874102', 'นายปริญญา ชัยชนะ', '2024-01-15', 38900.00, 'in_use'),
  ('AST-TLS-01', 'เครื่องเชื่อมอินเวอร์เตอร์และชุดกล้องระดับ Topcon', 'เครื่องมือวัดและก่อสร้าง', 'TOP-AT-B4A-5591', 'ทีมช่างสนาม', '2023-07-20', 45000.00, 'in_use');

-- ------------------------------------------------------------------------------
-- ส่วนที่ 15: สมุดรายวันทั่วไป (General Ledger & Double-Entry Verification)
-- ------------------------------------------------------------------------------

-- JV 1: บันทึกรับรู้รายได้และภาษีขายค่างวด 1 (INV202610-0001)
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
  select id into v_rev_id from chart_of_accounts where account_code = '4110-01' limit 1;
  select id into v_vat_id from chart_of_accounts where account_code = '2130-01' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-001' limit 1;
  select id into v_cust_id from contacts where company_name like '%สยามพาณิชย์%' limit 1;

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('INV202610-0001', '2026-10-01', 'INV', v_prj_id, 'ตั้งลูกหนี้การค้าและรับรู้รายได้งานติดตั้งแผงโซลาร์เซลล์ งวดที่ 1', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_ar_id, v_cust_id, 2675000.00, 0, 'ลูกหนี้การค้า บมจ.สยามพาณิชย์ พลังงานสะอาด');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_rev_id, v_cust_id, 0, 2500000.00, 'รายได้งานติดตั้งแผงโซลาร์เซลล์ 120 kWp สระบุรี');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_vat_id, v_cust_id, 0, 175000.00, 'ภาษีขาย 7% ตามใบกำกับภาษี INV202610-0001');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, contact_id, project_id, base_amount, vat_amount, status, journal_entry_id)
  values ('OUTPUT_VAT', 10, 2026, '2026-10-01', 'INV202610-0001', v_cust_id, v_prj_id, 2500000.00, 175000.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- JV 2: บันทึกรับรู้รายได้และภาษีขายค่างวดอาคาร (INV202610-0002)
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
  select id into v_rev_id from chart_of_accounts where account_code = '4110-01' limit 1;
  select id into v_vat_id from chart_of_accounts where account_code = '2130-01' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-002' limit 1;
  select id into v_cust_id from contacts where company_name like '%ไทยรุ่ง%' limit 1;

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('INV202610-0002', '2026-10-25', 'INV', v_prj_id, 'ตั้งลูกหนี้การค้าและรับรู้รายได้ค่างวดโครงสร้างอาคารคลังสินค้า', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_ar_id, v_cust_id, 1926000.00, 0, 'ลูกหนี้การค้า บจก.ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_rev_id, v_cust_id, 0, 1800000.00, 'รายได้โครงสร้างอาคารคลังสินค้า');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_vat_id, v_cust_id, 0, 126000.00, 'ภาษีขาย 7% ตามใบกำกับภาษี INV202610-0002');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, contact_id, project_id, base_amount, vat_amount, status, journal_entry_id)
  values ('OUTPUT_VAT', 10, 2026, '2026-10-25', 'INV202610-0002', v_cust_id, v_prj_id, 1800000.00, 126000.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- JV 3: ซื้ออินเวอร์เตอร์และบันทึกภาษีซื้อ (EXP202611-0001)
do $$
declare
  v_jv_id uuid;
  v_mat_id uuid;
  v_vat_id uuid;
  v_bank_id uuid;
  v_prj_id uuid;
  v_vend_id uuid;
begin
  select id into v_mat_id from chart_of_accounts where account_code = '5110-01' limit 1;
  select id into v_vat_id from chart_of_accounts where account_code = '1150-01' limit 1;
  select id into v_bank_id from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-001' limit 1;
  select id into v_vend_id from contacts where company_name like '%ซันโกรว์%' limit 1;

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('EXP202611-0001', '2026-11-05', 'EXP', v_prj_id, 'จ่ายเงินซื้ออินเวอร์เตอร์ Sungrow SG110CX พร้อมภาษีซื้อ', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_mat_id, v_vend_id, 480000.00, 0, 'อินเวอร์เตอร์ Sungrow SG110CX จำนวน 2 ชุด');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_vat_id, v_vend_id, 33600.00, 0, 'ภาษีซื้อ 7% ใบกำกับ SG-INV-2026-9901');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_vend_id, 0, 513600.00, 'โอนชำระเงินผ่าน ธ.กสิกรไทย');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no, contact_id, project_id, base_amount, vat_amount, status, journal_entry_id)
  values ('INPUT_VAT', 11, 2026, '2026-11-05', 'EXP202611-0001', 'SG-INV-2026-9901', v_vend_id, v_prj_id, 480000.00, 33600.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- JV 4: จ่ายค่าจ้างแรงงานติดตั้งพร้อมหักภาษี ณ ที่จ่าย 3% ภ.ง.ด.3 (EXP202611-0002)
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
  select id into v_wht_id from chart_of_accounts where account_code = '2140-01' limit 1;
  select id into v_bank_id from chart_of_accounts where account_code = '1110-02' limit 1;
  select id into v_prj_id from projects where project_code = 'PRJ-2026-001' limit 1;
  select id into v_vend_id from contacts where contact_code = 'VEND-0004' limit 1;

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('EXP202611-0002', '2026-11-08', 'EXP', v_prj_id, 'จ่ายค่าจ้างแรงงานติดตั้งแผงโซลาร์ หัก ณ ที่จ่าย 3% (ภ.ง.ด.3)', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_lab_id, v_vend_id, 75000.00, 0, 'ค่าแรงงานงวดที่ 1 งานติดตั้งโครงสร้างแผงโซลาร์');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_wht_id, v_vend_id, 0, 2250.00, 'หักภาษี ณ ที่จ่าย 3% ค่าจ้างทำของบุคคลธรรมดา');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_vend_id, 0, 72750.00, 'จ่ายสุทธิเข้าบัญชีช่างสมคิด ธ.กสิกรไทย');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;

  insert into tax_records (tax_type, tax_month, tax_year, document_date, document_no, contact_id, project_id, base_amount, vat_amount, wht_rate, wht_amount, status, journal_entry_id)
  values ('WHT_3', 11, 2026, '2026-11-08', 'EXP202611-0002', v_vend_id, v_prj_id, 75000.00, 0, 3.00, 2250.00, 'รอยื่นภาษี', v_jv_id);
end $$;

-- JV 5: บันทึกรับชำระหนี้บางส่วนจากลูกค้า (RC2026110001)
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
  select id into v_cust_id from contacts where company_name like '%ไทยรุ่ง%' limit 1;

  insert into journal_entries (entry_no, entry_date, reference_type, project_id, description, accounting_status)
  values ('RC2026110001', '2026-11-09', 'RC', v_prj_id, 'รับชำระเงินค่างวดบางส่วนตามใบแจ้งหนี้ INV202610-0002 จาก บจก.ไทยรุ่งพัฒนา', 'รอดำเนินการ')
  returning id into v_jv_id;

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_bank_id, v_cust_id, 500000.00, 0, 'รับเงินโอนเข้าบัญชีกระแสรายวัน ธ.กสิกรไทย');

  insert into journal_entry_lines (journal_entry_id, account_id, contact_id, debit, credit, line_description)
  values (v_jv_id, v_ar_id, v_cust_id, 0, 500000.00, 'ตัดยอดลูกหนี้การค้าตามใบเสร็จรับเงิน RC2026110001');

  update journal_entries set accounting_status = 'อนุมัติแล้ว' where id = v_jv_id;
end $$;

notify pgrst, 'reload schema';
