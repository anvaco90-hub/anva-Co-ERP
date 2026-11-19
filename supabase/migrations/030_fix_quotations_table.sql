-- 030_fix_quotations_table.sql
-- Ensure all quotation columns and relations exist and avoid constraint violations

alter table if exists quotations add column if not exists quotation_date date default current_date;
alter table if exists quotations add column if not exists issue_date date default current_date;
alter table if exists quotations add column if not exists valid_until date;
alter table if exists quotations add column if not exists expiry_date date;
alter table if exists quotations add column if not exists validity_days int default 30;
alter table if exists quotations add column if not exists sales_person text;
alter table if exists quotations add column if not exists currency text default 'THB';
alter table if exists quotations add column if not exists customer_name text;
alter table if exists quotations add column if not exists customer_address text;
alter table if exists quotations add column if not exists customer_postal_code text;
alter table if exists quotations add column if not exists customer_tax_id text;
alter table if exists quotations add column if not exists customer_branch text default 'สำนักงานใหญ่';
alter table if exists quotations add column if not exists ref_no text;
alter table if exists quotations add column if not exists warehouse_name text default 'สโตร์หลัก';
alter table if exists quotations add column if not exists subtotal numeric(15,2) default 0;
alter table if exists quotations add column if not exists discount_amount numeric(15,2) default 0;
alter table if exists quotations add column if not exists after_discount numeric(15,2) default 0;
alter table if exists quotations add column if not exists vat_rate numeric(5,2) default 7.00;
alter table if exists quotations add column if not exists vat_amount numeric(15,2) default 0;
alter table if exists quotations add column if not exists wht_rate numeric(5,2) default 0;
alter table if exists quotations add column if not exists wht_amount numeric(15,2) default 0;
alter table if exists quotations add column if not exists total_amount numeric(15,2) default 0;
alter table if exists quotations add column if not exists grand_total numeric(15,2) default 0;
alter table if exists quotations add column if not exists notes text;
alter table if exists quotations add column if not exists customer_notes text;
alter table if exists quotations add column if not exists internal_notes text;
alter table if exists quotations add column if not exists signature_url text;
alter table if exists quotations add column if not exists attachment_url text;
alter table if exists quotations add column if not exists status text default 'draft';
alter table if exists quotations add column if not exists created_by uuid;

-- Drop foreign key constraint on created_by if it blocks simulated users
alter table if exists quotations drop constraint if exists quotations_created_by_fkey;

-- Ensure RLS is permissive
alter table if exists quotations enable row level security;
alter table if exists quotation_items enable row level security;

drop policy if exists "allow_all_quotations" on quotations;
create policy "allow_all_quotations" on quotations for all using (true) with check (true);

drop policy if exists "allow_all_quotation_items" on quotation_items;
create policy "allow_all_quotation_items" on quotation_items for all using (true) with check (true);

