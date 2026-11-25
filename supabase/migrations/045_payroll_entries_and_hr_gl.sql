-- ============================================================
-- Migration 045: payroll_entries — Payroll → GL/Expenses Integration
-- สร้างตาราง payroll_entries เพื่อบันทึกรอบจ่ายเงินเดือน/OT
-- พร้อมเชื่อม expenses และ journal_entries อัตโนมัติ
-- ============================================================

-- ── 1. COA accounts สำหรับเงินเดือน (ถ้ายังไม่มี) ──────────────────────────
insert into chart_of_accounts (account_code, account_name_th, account_name_en, account_category, is_system_default, is_active)
values
  ('5200-01', 'ค่าใช้จ่ายเงินเดือนพนักงาน',     'Employee Salary Expense',   'expenses', true, true),
  ('5200-02', 'ค่าล่วงเวลา (OT) พนักงาน',       'Overtime Expense',          'expenses', true, true),
  ('2130-01', 'เงินเดือนค้างจ่าย (Accrued Payroll)', 'Accrued Payroll Payable', 'liabilities', true, true),
  ('2140-01', 'ประกันสังคมค้างจ่าย',             'SSF Payable',               'liabilities', true, true)
on conflict (account_code) do nothing;

-- ── 2. ตาราง payroll_entries (รอบจ่ายเงินเดือน) ───────────────────────────
create table if not exists payroll_entries (
  id              uuid primary key default gen_random_uuid(),
  run_code        text not null,                        -- รหัสรอบ เช่น PAY-2026-11
  pay_period_start date not null,                       -- ต้นงวด
  pay_period_end   date not null,                       -- สิ้นงวด
  pay_date         date not null,                       -- วันจ่ายจริง
  emp_id          uuid references employees(id),
  emp_name        text,
  department      text,
  project_id      uuid references projects(id),         -- ถ้าเป็นค่าแรงโครงการ
  base_salary     numeric(14,2) not null default 0,
  ot_hours        numeric(8,2) not null default 0,
  ot_rate         numeric(14,2) not null default 0,     -- อัตรา OT ต่อชม.
  ot_amount       numeric(14,2) generated always as (ot_hours * ot_rate) stored,
  ssf_employee    numeric(14,2) not null default 0,     -- ประกันสังคม (ส่วนลูกจ้าง)
  ssf_employer    numeric(14,2) not null default 0,     -- ประกันสังคม (ส่วนนายจ้าง)
  wht_amount      numeric(14,2) not null default 0,     -- ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)
  net_pay         numeric(14,2) not null default 0,     -- ยอดโอนสุทธิ
  gross_pay       numeric(14,2) not null default 0,     -- เงินเดือน + OT รวมก่อนหัก
  status          text not null default 'draft'
                    check (status in ('draft','approved','paid','cancelled')),
  expense_id      uuid references expenses(id),         -- อ้างอิงไปยัง expenses row
  journal_entry_id uuid references journal_entries(id), -- อ้างอิง GL entry
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── 3. extend journal_entries.reference_type ──────────────────────────────
alter table journal_entries
  drop constraint if exists journal_entries_reference_type_check;

alter table journal_entries
  add constraint journal_entries_reference_type_check
  check (reference_type in (
    'INV','RC','RI','EXP','PAY','MANUAL','ISS','ADJ','PAY_PAYROLL'
  ));

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table payroll_entries enable row level security;

drop policy if exists "payroll_entries_all" on payroll_entries;
create policy "payroll_entries_all" on payroll_entries
  for all using (auth.role() = 'authenticated');

-- ── 5. index ────────────────────────────────────────────────────────────────
create index if not exists payroll_entries_emp_id_idx    on payroll_entries(emp_id);
create index if not exists payroll_entries_project_id_idx on payroll_entries(project_id);
create index if not exists payroll_entries_status_idx    on payroll_entries(status);
create index if not exists payroll_entries_run_code_idx  on payroll_entries(run_code);
