-- ==============================================================================
-- ANVA & CO., LTD. (anva-Co-ERP)
-- Migration 014: Purchasing to Accounting End-to-End Payment Workflow
-- รองรับ:
-- 1) จัดการเงื่อนไขการชำระเงิน (ไม่มีมัดจำ / มีมัดจำ % หรือบาท)
-- 2) ข้อมูลธนาคารและพร้อมเพย์ของคู่ค้าใน Contacts & Vendors
-- 3) ตาราง payment_transactions สำหรับฝ่ายบัญชีทำจ่าย (โอน / เช็ค / เงินสด)
-- 4) การบันทึกแหล่งเงินค่าใช้จ่าย (โอน-บริษัท / เงินสำรองจ่าย-หัวหน้า/อื่นๆ)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. เพิ่มฟิลด์ข้อมูลการเงินในตาราง vendors และ contacts
-- ------------------------------------------------------------------------------
alter table vendors add column if not exists bank_name text;
alter table vendors add column if not exists bank_account_no text;
alter table vendors add column if not exists bank_account_name text;
alter table vendors add column if not exists promptpay_no text;

alter table contacts add column if not exists bank_name text;
alter table contacts add column if not exists bank_account_no text;
alter table contacts add column if not exists bank_account_name text;
alter table contacts add column if not exists promptpay_no text;

-- ------------------------------------------------------------------------------
-- 2. เพิ่มฟิลด์เงื่อนไขมัดจำและการชำระเงินใน purchase_orders และ goods_receipts
-- ------------------------------------------------------------------------------
alter table purchase_orders add column if not exists deposit_type text default 'none' check (deposit_type in ('none', 'percent', 'amount'));
alter table purchase_orders add column if not exists deposit_percent numeric(5,2) default 0;
alter table purchase_orders add column if not exists deposit_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists remaining_amount numeric(15,2) default 0;
alter table purchase_orders add column if not exists payment_channel_requested text default 'transfer' check (payment_channel_requested in ('transfer', 'cheque', 'cash'));
alter table purchase_orders add column if not exists payment_status text default 'รอชำระเงิน' check (payment_status in ('รอชำระเงิน', 'จ่ายมัดจำแล้ว', 'ชำระครบแล้ว', 'ยกเลิก'));
alter table purchase_orders add column if not exists deposit_paid_amount numeric(15,2) default 0;

alter table goods_receipts add column if not exists payment_status text default 'รอชำระเงิน';

-- ------------------------------------------------------------------------------
-- 3. เพิ่มฟิลด์แหล่งเงินที่ใช้จ่ายในตาราง expenses (EXP)
-- ------------------------------------------------------------------------------
alter table expenses add column if not exists payment_source text default 'company_bank' check (payment_source in ('company_bank', 'advance_payment'));
alter table expenses add column if not exists company_bank_account text default '1110-02';
alter table expenses add column if not exists advance_payer_type text check (advance_payer_type in ('manager', 'other'));
alter table expenses add column if not exists advance_payer_name text;
alter table expenses add column if not exists reimbursement_status text default 'none' check (reimbursement_status in ('none', 'รอคืนเงินสำรองจ่าย', 'คืนเงินแล้ว'));
alter table expenses add column if not exists reimbursement_date date;
alter table expenses add column if not exists reimbursement_payment_id uuid;

-- ------------------------------------------------------------------------------
-- 4. ตารางบันทึกประวัติการทำจ่ายเงินของฝ่ายบัญชี (payment_transactions)
-- ------------------------------------------------------------------------------
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
  
  -- กรณีโอนเงิน (Transfer)
  company_bank_account text,
  vendor_bank_name text,
  vendor_bank_account_no text,
  vendor_bank_account_name text,
  vendor_promptpay text,
  bank_fee numeric(15,2) default 0,
  
  -- กรณีเช็ค (Cheque)
  cheque_no text,
  cheque_bank text,
  cheque_date date,
  cheque_payee_name text,
  
  -- กรณีเงินสด (Cash)
  cash_source text default '1110-01',
  
  -- เอกสารแนบและบันทึก
  slip_reference_no text,
  attachment_url text,
  notes text,
  
  -- เชื่อมโยงบัญชีและผู้ทำรายการ
  journal_entry_id uuid references journal_entries(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

create index if not exists idx_payment_tx_doc on payment_transactions (document_type, document_id);
create index if not exists idx_payment_tx_date on payment_transactions (payment_date desc);

-- ------------------------------------------------------------------------------
-- 5. สิทธิ์ความปลอดภัย (Row Level Security - RLS)
-- ------------------------------------------------------------------------------
alter table payment_transactions enable row level security;
drop policy if exists "allow_all_payment_transactions" on payment_transactions;
create policy "allow_all_payment_transactions" on payment_transactions for all using (true) with check (true);

-- ------------------------------------------------------------------------------
-- 6. อัปเดตข้อมูลบัญชีธนาคารคู่ค้าตัวอย่าง (Seed Realistic Vendor Bank Accounts)
-- ------------------------------------------------------------------------------
update vendors set
  bank_name = 'ธนาคารกสิกรไทย (KBANK)',
  bank_account_no = '045-2-88192-3',
  bank_account_name = 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด',
  promptpay_no = '0105561023451'
where vendor_name like '%ซันโกรว์%';

update vendors set
  bank_name = 'ธนาคารไทยพาณิชย์ (SCB)',
  bank_account_no = '111-3-45678-9',
  bank_account_name = 'SCG Home Solution',
  promptpay_no = '0105538012345'
where vendor_name like '%SCG%';

update vendors set
  bank_name = 'ธนาคารกรุงเทพ (BBL)',
  bank_account_no = '238-0-91234-5',
  bank_account_name = 'บริษัท เจเอ โซลาร์ อินเตอร์เนชั่นแนล จำกัด',
  promptpay_no = '0105563044123'
where vendor_name like '%เจเอ โซลาร์%';

update vendors set
  bank_name = 'ธนาคารกสิกรไทย (KBANK)',
  bank_account_no = '743-2-11982-1',
  bank_account_name = 'นายสมคิด ช่างฝีมือดี',
  promptpay_no = '089-771-4567'
where vendor_name like '%สมคิด%';

update contacts set
  bank_name = 'ธนาคารกสิกรไทย (KBANK)',
  bank_account_no = '045-2-88192-3',
  bank_account_name = 'บริษัท ซันโกรว์ เพาเวอร์ (ประเทศไทย) จำกัด',
  promptpay_no = '0105561023451'
where company_name like '%ซันโกรว์%';

notify pgrst, 'reload schema';

