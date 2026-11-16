-- ==============================================================================
-- ANVA & CO., LTD. (anva-Co-ERP) - Accounting Module (Phase 3 / General Ledger)
-- Inspired by FlowAccount: Double-Entry Bookkeeping & Single Entry of Truth
-- Migration: 003_accounting_module.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Helper Function: Current User Role (if not already defined)
-- ------------------------------------------------------------------------------
create or replace function get_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

-- ------------------------------------------------------------------------------
-- 1) Master Contacts Table (Unified Customer / Vendor Directory)
-- ------------------------------------------------------------------------------
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

-- Sync initial contacts from customers & vendors if they exist
insert into contacts (contact_code, contact_type, company_name, tax_id, phone, address)
select 'CUST-' || lpad(row_number() over ()::text, 4, '0'), 'customer', company_name, tax_id, phone, address
from customers
on conflict (contact_code) do nothing;

insert into contacts (contact_code, contact_type, company_name, tax_id, phone, address)
select vendor_code, 'vendor', vendor_name, tax_id, phone, address
from vendors
on conflict (contact_code) do nothing;

-- ------------------------------------------------------------------------------
-- 2) Chart of Accounts (ผังบัญชีมาตรฐานธุรกิจ SME ไทย)
-- ------------------------------------------------------------------------------
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

-- Upgrade existing columns if chart_of_accounts was created previously
alter table chart_of_accounts add column if not exists account_name_th text;
alter table chart_of_accounts add column if not exists account_name_en text;
alter table chart_of_accounts add column if not exists account_category text;
alter table chart_of_accounts add column if not exists is_system_default boolean default false;
alter table chart_of_accounts add column if not exists is_active boolean default true;
alter table chart_of_accounts add column if not exists created_at timestamptz default now();
alter table chart_of_accounts add column if not exists updated_at timestamptz default now();

-- Seed Standard Thai SME Chart of Accounts (FlowAccount Aligned)
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
  account_category = excluded.account_category,
  is_system_default = excluded.is_system_default,
  is_active = excluded.is_active;

-- ------------------------------------------------------------------------------
-- 3) General Ledger: journal_entries & journal_entry_lines
-- ------------------------------------------------------------------------------
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

-- Indexing for high-speed General Ledger lookups
create index if not exists idx_journal_entries_date on journal_entries (entry_date desc);
create index if not exists idx_journal_entries_ref on journal_entries (reference_type, reference_id);
create index if not exists idx_journal_entries_status on journal_entries (accounting_status);

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

create index if not exists idx_journal_lines_entry on journal_entry_lines (journal_entry_id);
create index if not exists idx_journal_lines_account on journal_entry_lines (account_id);
create index if not exists idx_journal_lines_contact on journal_entry_lines (contact_id);

-- ------------------------------------------------------------------------------
-- 4) Double-Entry Balance Verification Constraint (Dr. = Cr.)
-- ------------------------------------------------------------------------------
create or replace function check_journal_entry_balance()
returns trigger language plpgsql as $$
declare
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_count int;
begin
  -- Validate balance whenever a journal entry is marked as 'อนุมัติแล้ว'
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

-- Prevent altering lines of an approved Journal Entry
create or replace function prevent_modifying_approved_journal_lines()
returns trigger language plpgsql as $$
declare
  v_status text;
begin
  select accounting_status into v_status
  from journal_entries
  where id = coalesce(new.journal_entry_id, old.journal_entry_id);

  if v_status = 'อนุมัติแล้ว' then
    raise exception 'ไม่อนุญาตให้แก้ไขหรือลบรายการบัญชีที่ได้รับการอนุมัติแล้ว (ต้องยกเลิกสถานะอนุมัติก่อน)';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_approved_lines_mod on journal_entry_lines;
create trigger trg_prevent_approved_lines_mod
  before update or delete on journal_entry_lines
  for each row execute function prevent_modifying_approved_journal_lines();

-- ------------------------------------------------------------------------------
-- 5) Tax Records Table (VAT & Withholding Tax Compliance - ภ.พ.30, ภ.ง.ด.3, ภ.ง.ด.53)
-- ------------------------------------------------------------------------------
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

create index if not exists idx_tax_records_period on tax_records (tax_year, tax_month, tax_type);
create index if not exists idx_tax_records_doc on tax_records (document_no);

-- ------------------------------------------------------------------------------
-- 6) Supporting Transaction Tables: sales_invoices & expenses (If not present)
-- ------------------------------------------------------------------------------
create table if not exists sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  quotation_id uuid references quotations(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
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
  status text not null default 'ฉบับร่าง' check (status in ('ฉบับร่าง', 'รอเก็บเงิน', 'เก็บเงินแล้ว', 'ยกเลิก')),
  paid_amount numeric(15,2) default 0,
  remaining_amount numeric(15,2) default 0,
  is_opening_balance boolean default false,
  notes text,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sales_invoices add column if not exists paid_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists remaining_amount numeric(15,2) default 0;
alter table sales_invoices add column if not exists is_opening_balance boolean default false;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text unique not null,
  vendor_id uuid references vendors(id) on delete set null,
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
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table expenses add column if not exists vendor_tax_invoice_no text;
alter table expenses add column if not exists tax_invoice_date date;
alter table expenses add column if not exists is_asset boolean default false;
alter table expenses add column if not exists accounting_status text default 'รอดำเนินการ';

-- ------------------------------------------------------------------------------
-- 7) Atomic Journal Entry Number Generator (JVYYYYMM####)
-- ------------------------------------------------------------------------------
create or replace function generate_journal_entry_no(p_date date default current_date, p_prefix text default 'JV')
returns text language plpgsql as $$
declare
  v_year text;
  v_month text;
  v_pattern text;
  v_seq int;
  v_result text;
begin
  v_year := to_char(p_date, 'YYYY');
  v_month := to_char(p_date, 'MM');
  v_pattern := p_prefix || v_year || v_month || '%';

  select coalesce(max(nullif(regexp_replace(entry_no, '^' || p_prefix || v_year || v_month, ''), '')), '0')::int + 1
  into v_seq
  from journal_entries
  where entry_no like v_pattern;

  v_result := p_prefix || v_year || v_month || lpad(v_seq::text, 4, '0');
  return v_result;
end;
$$;

-- ------------------------------------------------------------------------------
-- 8) Automated Trigger 1: Sales Invoice (INV) -> Journal Entry + Tax Record
-- Dr. Accounts Receivable (1130-01)
--   Cr. Sales Revenue (4110-01)
--   Cr. Output VAT (2130-01)
-- ------------------------------------------------------------------------------
create or replace function on_sales_invoice_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ar_id uuid;
  v_rev_id uuid;
  v_vat_id uuid;
  v_jv_id uuid;
  v_jv_no text;
  v_doc_date date;
  v_subtotal numeric(15,2);
  v_vat numeric(15,2);
  v_total numeric(15,2);
  v_contact uuid;
begin
  -- Trigger when invoice moves to 'รอเก็บเงิน'
  if new.status = 'รอเก็บเงิน' and (tg_op = 'INSERT' or old.status is distinct from 'รอเก็บเงิน') then
    -- Check if draft JV already created
    if exists (select 1 from journal_entries where reference_type = 'INV' and reference_id = new.id) then
      return new;
    end if;

    -- Lookup Chart of Accounts
    select id into v_ar_id from chart_of_accounts where account_code = '1130-01' limit 1;
    select id into v_rev_id from chart_of_accounts where account_code = '4110-01' limit 1;
    select id into v_vat_id from chart_of_accounts where account_code = '2130-01' limit 1;

    v_doc_date := coalesce(new.issue_date, current_date);
    v_subtotal := round(coalesce(new.subtotal, 0), 2);
    v_vat := round(coalesce(new.vat_amount, 0), 2);
    v_total := round(coalesce(new.total_amount, v_subtotal + v_vat), 2);
    v_contact := coalesce(new.contact_id, new.customer_id);
    v_jv_no := generate_journal_entry_no(v_doc_date, 'JV');

    -- Insert Draft Journal Entry
    insert into journal_entries (
      entry_no, entry_date, reference_type, reference_id, project_id,
      description, accounting_status, created_by
    ) values (
      v_jv_no, v_doc_date, 'INV', new.id, new.project_id,
      'ตั้งลูกหนี้การค้าและบันทึกรายได้ตามใบแจ้งหนี้ ' || new.invoice_no,
      'รอดำเนินการ', new.created_by
    ) returning id into v_jv_id;

    -- Dr. ลูกหนี้การค้า (Accounts Receivable)
    insert into journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_ar_id, v_contact, v_total, 0,
      'ลูกหนี้การค้า - ' || new.invoice_no
    );

    -- Cr. รายได้จากงานรับเหมาก่อสร้างและวิศวกรรม (Sales Revenue)
    insert into journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_rev_id, v_contact, 0, v_subtotal,
      'รายได้จากงานรับเหมา/ขาย - ' || new.invoice_no
    );

    -- Cr. ภาษีขาย (Output VAT)
    if v_vat > 0 and v_vat_id is not null then
      insert into journal_entry_lines (
        journal_entry_id, account_id, contact_id, debit, credit, line_description
      ) values (
        v_jv_id, v_vat_id, v_contact, 0, v_vat,
        'ภาษีขาย 7% - ' || new.invoice_no
      );
    end if;

    -- Insert Output VAT into tax_records
    if v_vat > 0 then
      insert into tax_records (
        tax_type, tax_month, tax_year, document_date, document_no,
        contact_id, project_id, base_amount, vat_amount, status, journal_entry_id
      ) values (
        'OUTPUT_VAT',
        extract(month from v_doc_date)::int,
        extract(year from v_doc_date)::int,
        v_doc_date,
        new.invoice_no,
        v_contact,
        new.project_id,
        v_subtotal,
        v_vat,
        'รอยื่นภาษี',
        v_jv_id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_invoice_accounting on sales_invoices;
create trigger trg_sales_invoice_accounting
  after insert or update of status on sales_invoices
  for each row execute function on_sales_invoice_status_change();

-- ------------------------------------------------------------------------------
-- 9) Automated Trigger 2: Goods Receipt (RI) -> Journal Entry + Tax Record
-- Dr. Inventory (1140-01)
-- Dr. Input VAT (1150-01) [if applicable]
--   Cr. Accounts Payable (2110-01)
-- ------------------------------------------------------------------------------
create or replace function on_goods_receipt_accounting()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_inv_id uuid;
  v_input_vat_id uuid;
  v_ap_id uuid;
  v_jv_id uuid;
  v_jv_no text;
  v_doc_date date;
  v_subtotal numeric(15,2) := 0;
  v_vat numeric(15,2) := 0;
  v_net numeric(15,2) := 0;
  v_vendor_id uuid;
  v_project_id uuid;
  v_tax_inv text;
begin
  -- Prevent duplicate JV generation
  if exists (select 1 from journal_entries where reference_type = 'RI' and reference_id = new.id) then
    return new;
  end if;

  -- Calculate total received inventory cost
  select coalesce(sum(qty_received * unit_cost), 0)
  into v_subtotal
  from goods_receipt_items
  where grn_id = new.id;

  if v_subtotal <= 0 then
    return new;
  end if;

  -- Lookup PO info
  if new.po_id is not null then
    select 
      vendor_id, 
      project_id,
      case when coalesce(vat_rate, 7) > 0 then round(v_subtotal * (coalesce(vat_rate, 7) / 100.0), 2) else 0 end
    into v_vendor_id, v_project_id, v_vat
    from purchase_orders
    where id = new.po_id;
  end if;

  v_net := v_subtotal + v_vat;
  v_doc_date := coalesce(new.received_date, current_date);
  v_jv_no := generate_journal_entry_no(v_doc_date, 'JV');
  v_tax_inv := coalesce(new.grn_no, 'GRN-' || to_char(v_doc_date, 'YYYYMMDD'));

  -- Lookup Chart of Accounts
  select id into v_inv_id from chart_of_accounts where account_code = '1140-01' limit 1;
  select id into v_input_vat_id from chart_of_accounts where account_code = '1150-01' limit 1;
  select id into v_ap_id from chart_of_accounts where account_code = '2110-01' limit 1;

  -- Insert Draft Journal Entry
  insert into journal_entries (
    entry_no, entry_date, reference_type, reference_id, project_id,
    description, accounting_status, created_by
  ) values (
    v_jv_no, v_doc_date, 'RI', new.id, v_project_id,
    'รับวัสดุก่อสร้างเข้าคลังสโตร์และตั้งเจ้าหนี้ตามใบรับของ ' || new.grn_no,
    'รอดำเนินการ', new.received_by
  ) returning id into v_jv_id;

  -- Dr. สินค้า/วัสดุก่อสร้างคงเหลือ (Inventory)
  insert into journal_entry_lines (
    journal_entry_id, account_id, contact_id, debit, credit, line_description
  ) values (
    v_jv_id, v_inv_id, v_vendor_id, v_subtotal, 0,
    'รับวัสดุเข้าสโตร์ - ' || new.grn_no
  );

  -- Dr. ภาษีซื้อ (Input VAT) if > 0
  if v_vat > 0 and v_input_vat_id is not null then
    insert into journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_input_vat_id, v_vendor_id, v_vat, 0,
      'ภาษีซื้อรอใบกำกับ - ' || new.grn_no
    );
  end if;

  -- Cr. เจ้าหนี้การค้า (Accounts Payable)
  insert into journal_entry_lines (
    journal_entry_id, account_id, contact_id, debit, credit, line_description
  ) values (
    v_jv_id, v_ap_id, v_vendor_id, 0, v_net,
    'เจ้าหนี้การค้า - ' || new.grn_no
  );

  -- Link journal_entry_id back to goods_receipts
  update goods_receipts set journal_entry_id = v_jv_id where id = new.id;

  -- Insert Input VAT into tax_records if applicable
  if v_vat > 0 then
    insert into tax_records (
      tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no,
      contact_id, project_id, base_amount, vat_amount, status, journal_entry_id
    ) values (
      'INPUT_VAT',
      extract(month from v_doc_date)::int,
      extract(year from v_doc_date)::int,
      v_doc_date,
      new.grn_no,
      v_tax_inv,
      v_vendor_id,
      v_project_id,
      v_subtotal,
      v_vat,
      'รอยื่นภาษี',
      v_jv_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_goods_receipt_accounting on goods_receipts;
create trigger trg_goods_receipt_accounting
  after insert on goods_receipts
  for each row execute function on_goods_receipt_accounting();

-- ------------------------------------------------------------------------------
-- 10) Automated Trigger 3: Expense (EXP) -> Journal Entry + Tax Record
-- Dr. Expense Account (e.g., 5110-01 or 5210-01)
-- Dr. Input VAT (1150-01) [if applicable]
--   Cr. Accounts Payable (2110-01) or Cash (1110-01)
--   Cr. Withholding Tax Payable (2120-01 / 2120-02) [if applicable]
-- ------------------------------------------------------------------------------
create or replace function on_expense_accounting()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exp_acc_id uuid;
  v_input_vat_id uuid;
  v_ap_id uuid;
  v_cash_id uuid;
  v_credit_acc_id uuid;
  v_wht_id uuid;
  v_jv_id uuid;
  v_jv_no text;
  v_doc_date date;
  v_subtotal numeric(15,2);
  v_vat numeric(15,2);
  v_wht numeric(15,2);
  v_net_pay numeric(15,2);
  v_contact uuid;
begin
  if new.status = 'อนุมัติแล้ว' and (tg_op = 'INSERT' or old.status is distinct from 'อนุมัติแล้ว') then
    -- Prevent duplicate
    if exists (select 1 from journal_entries where reference_type = 'EXP' and reference_id = new.id) then
      return new;
    end if;

    v_doc_date := coalesce(new.expense_date, current_date);
    v_subtotal := round(coalesce(new.subtotal, 0), 2);
    v_vat := round(coalesce(new.vat_amount, 0), 2);
    v_wht := round(coalesce(new.wht_amount, 0), 2);
    v_net_pay := round(v_subtotal + v_vat - v_wht, 2);
    v_contact := coalesce(new.contact_id, new.vendor_id);
    v_jv_no := generate_journal_entry_no(v_doc_date, 'JV');

    -- Account mappings
    if coalesce(new.is_asset, false) = true then
      select id into v_exp_acc_id from chart_of_accounts where account_code = '1520-01' limit 1;
    else
      select id into v_exp_acc_id from chart_of_accounts where account_code = coalesce(new.account_code, '5110-01') limit 1;
    end if;
    if v_exp_acc_id is null then
      select id into v_exp_acc_id from chart_of_accounts where account_category in ('Expense', 'Asset') order by account_code limit 1;
    end if;

    select id into v_input_vat_id from chart_of_accounts where account_code = '1150-01' limit 1;
    select id into v_ap_id from chart_of_accounts where account_code = '2110-01' limit 1;
    select id into v_cash_id from chart_of_accounts where account_code = '1110-01' limit 1;

    -- Select Credit Account: Cash/Bank if direct payment, else Accounts Payable
    if new.payment_method in ('เงินสด', 'โอนเงิน') then
      v_credit_acc_id := v_cash_id;
    else
      v_credit_acc_id := v_ap_id;
    end if;

    -- WHT Account selection (ภ.ง.ด.3 or ภ.ง.ด.53)
    if coalesce(new.wht_rate, 0) = 3 then
      select id into v_wht_id from chart_of_accounts where account_code = '2120-01' limit 1;
    else
      select id into v_wht_id from chart_of_accounts where account_code = '2120-02' limit 1;
    end if;

    -- Insert Draft JV
    insert into journal_entries (
      entry_no, entry_date, reference_type, reference_id, project_id,
      description, accounting_status, created_by, approved_by, approved_at
    ) values (
      v_jv_no, v_doc_date, 'EXP', new.id, new.project_id,
      'บันทึกค่าใช้จ่าย ' || new.expense_no || ': ' || coalesce(new.description, ''),
      'รอดำเนินการ', new.created_by, new.approved_by, new.approved_at
    ) returning id into v_jv_id;

    -- Dr. ค่าใช้จ่าย (Expense)
    insert into journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_exp_acc_id, v_contact, v_subtotal, 0,
      new.description
    );

    -- Dr. ภาษีซื้อ (Input VAT) if > 0
    if v_vat > 0 and v_input_vat_id is not null then
      insert into journal_entry_lines (
        journal_entry_id, account_id, contact_id, debit, credit, line_description
      ) values (
        v_jv_id, v_input_vat_id, v_contact, v_vat, 0,
        'ภาษีซื้อ - ' || new.expense_no
      );
    end if;

    -- Cr. ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (Withholding Tax Payable) if > 0
    if v_wht > 0 and v_wht_id is not null then
      insert into journal_entry_lines (
        journal_entry_id, account_id, contact_id, debit, credit, line_description
      ) values (
        v_jv_id, v_wht_id, v_contact, 0, v_wht,
        'ภาษีหัก ณ ที่จ่ายค้างจ่าย - ' || new.expense_no
      );
    end if;

    -- Cr. เจ้าหนี้การค้า / เงินสด (Accounts Payable or Cash)
    insert into journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_credit_acc_id, v_contact, 0, v_net_pay,
      'จ่ายชำระค่าใช้จ่าย / ตั้งเจ้าหนี้ - ' || new.expense_no
    );

    -- Insert Input VAT Record
    if v_vat > 0 then
      insert into tax_records (
        tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no,
        contact_id, project_id, base_amount, vat_amount, status, journal_entry_id
      ) values (
        'INPUT_VAT',
        extract(month from coalesce(new.tax_invoice_date, v_doc_date))::int,
        extract(year from coalesce(new.tax_invoice_date, v_doc_date))::int,
        coalesce(new.tax_invoice_date, v_doc_date),
        new.expense_no,
        coalesce(new.vendor_tax_invoice_no, new.expense_no),
        v_contact,
        new.project_id,
        v_subtotal,
        v_vat,
        'รอยื่นภาษี',
        v_jv_id
      );
    end if;

    -- Insert WHT Record
    if v_wht > 0 then
      insert into tax_records (
        tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no,
        contact_id, project_id, base_amount, vat_amount, wht_rate, wht_amount, status, journal_entry_id
      ) values (
        case when coalesce(new.wht_rate, 3) = 3 then 'WHT_3' else 'WHT_53' end,
        extract(month from v_doc_date)::int,
        extract(year from v_doc_date)::int,
        v_doc_date,
        new.expense_no,
        coalesce(new.vendor_tax_invoice_no, new.expense_no),
        v_contact,
        new.project_id,
        v_subtotal,
        0,
        new.wht_rate,
        v_wht,
        'รอยื่นภาษี',
        v_jv_id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_accounting on expenses;
create trigger trg_expense_accounting
  after insert or update of status on expenses
  for each row execute function on_expense_accounting();

-- ------------------------------------------------------------------------------
-- 11) Analytical Views (Trial Balance, General Ledger, Tax Reports)
-- ------------------------------------------------------------------------------
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
  coa.account_name_th,
  coa.account_category,
  jel.id as line_id,
  jel.debit,
  jel.credit,
  jel.line_description,
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
  coa.account_name_th,
  coa.account_category,
  coalesce(sum(jel.debit), 0) as total_debit,
  coalesce(sum(jel.credit), 0) as total_credit,
  case 
    when coa.account_category in ('Asset', 'Expense') then coalesce(sum(jel.debit - jel.credit), 0)
    else coalesce(sum(jel.credit - jel.debit), 0)
  end as net_balance
from chart_of_accounts coa
left join journal_entry_lines jel on jel.account_id = coa.id
left join journal_entries je on je.id = jel.journal_entry_id and je.accounting_status = 'อนุมัติแล้ว'
where coa.is_active = true
group by coa.id, coa.account_code, coa.account_name_th, coa.account_category
order by coa.account_code;

-- ------------------------------------------------------------------------------
-- 12) Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------
alter table contacts enable row level security;
alter table chart_of_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table tax_records enable row level security;
alter table sales_invoices enable row level security;
alter table expenses enable row level security;

-- Contacts RLS
drop policy if exists "read_contacts" on contacts;
drop policy if exists "write_contacts" on contacts;
create policy "read_contacts" on contacts for select using (get_my_role() is not null);
create policy "write_contacts" on contacts for all using (get_my_role() in ('admin', 'accounting', 'purchasing', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'purchasing', 'management'));

-- Chart of Accounts RLS
drop policy if exists "read_coa" on chart_of_accounts;
drop policy if exists "write_coa" on chart_of_accounts;
create policy "read_coa" on chart_of_accounts for select using (get_my_role() is not null);
create policy "write_coa" on chart_of_accounts for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- General Ledger RLS
drop policy if exists "read_journal" on journal_entries;
drop policy if exists "write_journal" on journal_entries;
create policy "read_journal" on journal_entries for select using (get_my_role() is not null);
create policy "write_journal" on journal_entries for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

drop policy if exists "read_journal_lines" on journal_entry_lines;
drop policy if exists "write_journal_lines" on journal_entry_lines;
create policy "read_journal_lines" on journal_entry_lines for select using (get_my_role() is not null);
create policy "write_journal_lines" on journal_entry_lines for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Tax Records RLS
drop policy if exists "read_tax" on tax_records;
drop policy if exists "write_tax" on tax_records;
create policy "read_tax" on tax_records for select using (get_my_role() is not null);
create policy "write_tax" on tax_records for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Sales Invoices RLS
drop policy if exists "read_sales_inv" on sales_invoices;
drop policy if exists "write_sales_inv" on sales_invoices;
create policy "read_sales_inv" on sales_invoices for select using (get_my_role() is not null);
create policy "write_sales_inv" on sales_invoices for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Expenses RLS
drop policy if exists "read_expenses" on expenses;
drop policy if exists "write_expenses" on expenses;
create policy "read_expenses" on expenses for select using (get_my_role() is not null);
create policy "write_expenses" on expenses for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- ------------------------------------------------------------------------------
-- 13) Reload Schema Cache
-- ------------------------------------------------------------------------------
notify pgrst, 'reload schema';

