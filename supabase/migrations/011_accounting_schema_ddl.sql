-- ==============================================================================
-- ANVA & CO., LTD. (anva-Co-ERP) - Accounting Module
-- ส่วนที่ 1: การสร้างโครงสร้างตาราง ฟังก์ชัน ทริกเกอร์ และ RLS (DDL - Schema Only)
-- ไม่มีคำสั่ง INSERT ข้อมูลใดๆ ทั้งสิ้น รันได้ปลอดภัย 100%
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ฟังก์ชันช่วยตรวจสอบสิทธิ์ผู้ใช้งาน (Helper Functions)
-- ------------------------------------------------------------------------------
create or replace function get_my_role()
returns text
language sql
stable
security definer
set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active limit 1;
$$;

-- ------------------------------------------------------------------------------
-- 2. สร้างตารางทั้งหมด เรียงตามลำดับ Foreign Key Dependencies
-- ------------------------------------------------------------------------------

-- 2.1 สมุดทะเบียนผู้ติดต่อกลาง (Unified Contacts: ลูกค้า & ผู้จำหน่าย)
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

-- 2.2 ผังบัญชีมาตรฐานธุรกิจ SME ไทย (Chart of Accounts 5 หมวด)
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

-- 2.3 สมุดรายวันทั่วไป (General Ledger Journal Header)
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

-- ปรับปรุงตาราง journal_entries ให้มีคอลัมน์ระบบบัญชีครบถ้วน 100% แม้เคยสร้างจาก migration เดิม
alter table journal_entries add column if not exists accounting_status text default 'รอดำเนินการ';
alter table journal_entries add column if not exists reference_type text default 'MANUAL';
alter table journal_entries add column if not exists reference_id uuid;
alter table journal_entries add column if not exists approved_by uuid;
alter table journal_entries add column if not exists approved_at timestamptz;
alter table journal_entries add column if not exists updated_at timestamptz default now();

create index if not exists idx_journal_entries_date on journal_entries (entry_date desc);
create index if not exists idx_journal_entries_ref on journal_entries (reference_type, reference_id);
create index if not exists idx_journal_entries_status on journal_entries (accounting_status);

-- 2.4 รายการบันทึกบัญชีคู่ เดบิต/เครดิต (Journal Entry Lines)
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

create index if not exists idx_journal_lines_entry on journal_entry_lines (journal_entry_id);
create index if not exists idx_journal_lines_account on journal_entry_lines (account_id);
create index if not exists idx_journal_lines_contact on journal_entry_lines (contact_id);

-- 2.5 ทะเบียนภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย (Tax Records for ภ.พ.30, ภ.ง.ด.3, ภ.ง.ด.53)
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

-- 2.6 ใบแจ้งหนี้และบันทึกลูกหนี้ (Sales Invoices & AR)
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

-- 2.7 ค่าใช้จ่ายโครงการและบริษัท (Expenses - EXP)
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

-- 2.8 เจ้าหนี้การค้าและกำหนดชำระ (Accounts Payable - AP)
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

-- 2.9 เงินค้ำประกันผลงานโครงการ (Retention Guarantees 5-10%)
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

-- 2.10 บันทึกค่าน้ำมัน Fleet Card (Fleet Card Expenses)
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

-- ------------------------------------------------------------------------------
-- 3. ฟังก์ชันและระบบอัตโนมัติ (Functions, Sequences & Triggers)
-- ------------------------------------------------------------------------------

-- 3.1 ตัวสร้างเลขที่สมุดรายวันอัตโนมัติ (JV Running Number Generator)
create or replace function generate_journal_entry_no(p_date date default current_date, p_prefix text default 'JV')
returns text language plpgsql as $$
declare
  v_year text;
  v_month text;
  v_pattern text;
  v_seq int;
begin
  v_year := to_char(p_date, 'YYYY');
  v_month := to_char(p_date, 'MM');
  v_pattern := p_prefix || v_year || v_month || '%';

  select coalesce(max(nullif(regexp_replace(entry_no, '^' || p_prefix || v_year || v_month, ''), '')), '0')::int + 1
  into v_seq
  from journal_entries
  where entry_no like v_pattern;

  return p_prefix || v_year || v_month || lpad(v_seq::text, 4, '0');
end;
$$;

-- 3.2 ตัวตรวจความสมดุลเดบิต-เครดิต ก่อนอนุมัติ (Double-Entry Balance Verification)
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

-- 3.3 ล็อกรายการคู่บัญชีที่อนุมัติแล้ว ห้ามแก้ไข
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
-- 4. วิวรายงานทางการเงิน (Views: General Ledger & Trial Balance)
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

-- ------------------------------------------------------------------------------
-- 5. ความปลอดภัยระดับแถว (Row Level Security - RLS)
-- ------------------------------------------------------------------------------
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

-- Policies for Contacts
drop policy if exists "read_contacts" on contacts;
drop policy if exists "write_contacts" on contacts;
create policy "read_contacts" on contacts for select using (get_my_role() is not null);
create policy "write_contacts" on contacts for all using (get_my_role() in ('admin', 'accounting', 'purchasing', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'purchasing', 'management'));

-- Policies for Chart of Accounts
drop policy if exists "read_coa" on chart_of_accounts;
drop policy if exists "write_coa" on chart_of_accounts;
create policy "read_coa" on chart_of_accounts for select using (get_my_role() is not null);
create policy "write_coa" on chart_of_accounts for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Policies for General Ledger
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

-- Policies for Tax Records
drop policy if exists "read_tax" on tax_records;
drop policy if exists "write_tax" on tax_records;
create policy "read_tax" on tax_records for select using (get_my_role() is not null);
create policy "write_tax" on tax_records for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Policies for Invoices & Expenses
drop policy if exists "read_sales_inv" on sales_invoices;
drop policy if exists "write_sales_inv" on sales_invoices;
create policy "read_sales_inv" on sales_invoices for select using (get_my_role() is not null);
create policy "write_sales_inv" on sales_invoices for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

drop policy if exists "read_expenses" on expenses;
drop policy if exists "write_expenses" on expenses;
create policy "read_expenses" on expenses for select using (get_my_role() is not null);
create policy "write_expenses" on expenses for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

-- Policies for AP, Retention, Fleet
drop policy if exists "read_ap" on accounts_payable;
drop policy if exists "write_ap" on accounts_payable;
create policy "read_ap" on accounts_payable for select using (get_my_role() is not null);
create policy "write_ap" on accounts_payable for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

drop policy if exists "read_retention" on retention_guarantees;
drop policy if exists "write_retention" on retention_guarantees;
create policy "read_retention" on retention_guarantees for select using (get_my_role() is not null);
create policy "write_retention" on retention_guarantees for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

drop policy if exists "read_fleet" on fleet_card_expenses;
drop policy if exists "write_fleet" on fleet_card_expenses;
create policy "read_fleet" on fleet_card_expenses for select using (get_my_role() is not null);
create policy "write_fleet" on fleet_card_expenses for all using (get_my_role() in ('admin', 'accounting', 'management'))
  with check (get_my_role() in ('admin', 'accounting', 'management'));

notify pgrst, 'reload schema';

