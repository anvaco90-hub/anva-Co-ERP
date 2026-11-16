-- ขั้นที่ 8: โมดูลใบเสนอราคา (Quotation Module - QT)
-- รองรับการออกใบเสนอราคา รันเลขอัตโนมัติ (เช่น QT2026110012)
-- ข้อมูลลูกค้า, โครงการ, คลังสินค้า, ส่วนลด %, ภาษี VAT/WHT, ลายเซ็น, โน้ตภายใน, และไฟล์แนบ

------------------------------------------------------------
-- 1) ตารางลูกค้า (Customers)
------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  customer_name text not null,
  tax_id text,
  branch_type text default 'head_office', -- 'head_office' | 'branch'
  branch_no text default '00000',
  address text,
  postal_code text,
  contact_person text,
  phone text,
  email text,
  created_at timestamptz default now()
);

alter table customers enable row level security;
create policy "read_customers" on customers for select using (get_my_role() is not null);
create policy "write_customers" on customers for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

------------------------------------------------------------
-- 2) ตารางใบเสนอราคา (Quotations)
------------------------------------------------------------
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text unique not null,
  issue_date date not null default current_date,
  validity_days int default 30,
  expiry_date date,
  sales_person text,
  currency text default 'THB',
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_address text,
  customer_postal_code text,
  customer_tax_id text,
  customer_branch text default 'สำนักงานใหญ่',
  project_id uuid references projects(id),
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
  status text default 'draft' check (status in ('draft','sent','approved','rejected','expired')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  item_id uuid references inventory_items(id),
  item_name text not null,
  description text,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text,
  unit_price numeric(15,2) not null default 0,
  discount_percent numeric(5,2) default 0,
  total_amount numeric(15,2) not null default 0
);

alter table quotations enable row level security;
alter table quotation_items enable row level security;

create policy "read_quotations" on quotations for select using (get_my_role() is not null);
create policy "write_quotations" on quotations for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

create policy "read_quotation_items" on quotation_items for select using (get_my_role() is not null);
create policy "write_quotation_items" on quotation_items for all using (get_my_role() in ('admin','management','accounting','purchasing','store'))
  with check (get_my_role() in ('admin','management','accounting','purchasing','store'));

------------------------------------------------------------
-- 3) ฟังก์ชันรันเลขที่ใบเสนอราคาอัตโนมัติ (เช่น QT2026110012)
------------------------------------------------------------
create or replace function generate_quotation_no()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := 'QT' || to_char(current_date, 'YYYYMM');
  v_next int;
begin
  insert into doc_sequences (prefix, doc_year, last_no)
  values (v_prefix, 0, 1)
  on conflict (prefix, doc_year)
  do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_next;

  return v_prefix || lpad(v_next::text, 4, '0');
end $$;

revoke all on function generate_quotation_no() from public, anon;
grant execute on function generate_quotation_no() to authenticated;

notify pgrst, 'reload schema';

