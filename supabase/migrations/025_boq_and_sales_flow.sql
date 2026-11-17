-- ============================================================================
-- MIGRATION 025: BOQ SYSTEM & SALES WORKFLOW ENHANCEMENTS
-- 1. เพิ่มฟิลด์การเซ็น PO ลูกค้าใน quotations (customer_po_no, customer_po_date, customer_po_file_url)
-- 2. สร้างตารางระบบ BOQ (boqs, boq_items) รองรับงานโซล่าเซลล์และรับเหมาก่อสร้าง
-- ============================================================================

-- 1. เพิ่มฟิลด์สำหรับขั้นตอน "ลูกค้าเซ็น PO / อนุมัติใบเสนอราคา"
alter table if exists public.quotations 
  add column if not exists customer_po_no text,
  add column if not exists customer_po_date date,
  add column if not exists customer_po_file_url text,
  add column if not exists customer_signer_name text;

-- 2. สร้างตาราง BOQ หลัก (Bill of Quantities)
create table if not exists public.boqs (
  id uuid primary key default gen_random_uuid(),
  boq_no text unique not null,
  title text not null,
  project_id uuid references public.projects(id) on delete set null,
  customer_name text,
  system_size_kwp numeric(10,2) default 0,
  status text not null default 'draft', -- 'draft', 'approved', 'converted_to_quotation', 'archived'
  total_material_cost numeric(15,2) default 0,
  total_labor_cost numeric(15,2) default 0,
  total_cost numeric(15,2) default 0,
  markup_percent numeric(5,2) default 15.00,
  markup_amount numeric(15,2) default 0,
  grand_total numeric(15,2) default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. สร้างตารางรายการย่อยใน BOQ (boq_items)
create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  boq_id uuid not null references public.boqs(id) on delete cascade,
  category text not null default 'แผงโซล่าเซลล์', -- หมวดหมู่งาน
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

-- 4. เปิดสิทธิ์การใช้งานตาราง (RLS & Grants)
alter table public.boqs enable row level security;
alter table public.boq_items enable row level security;

create policy "Allow all authenticated users to manage boqs" 
  on public.boqs for all using (true) with check (true);

create policy "Allow all authenticated users to manage boq_items" 
  on public.boq_items for all using (true) with check (true);

grant all on table public.boqs to authenticated, anon, public, service_role;
grant all on table public.boq_items to authenticated, anon, public, service_role;

-- 5. เพิ่ม Running Number prefix สำหรับ BOQ
if exists (select 1 from information_schema.tables where table_name = 'doc_sequences') then
  insert into public.doc_sequences (prefix, doc_year, last_no) 
  values ('BOQ', extract(year from current_date)::int, 0)
  on conflict do nothing;
end if;

