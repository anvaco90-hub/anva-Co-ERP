-- 044_po_payment_wht_and_deposit_account.sql
-- Ensure Chart of Accounts includes 1170-01 Advance Payment & Deposits to Vendors
-- (separating it from 1150-01 Input VAT) and add WHT tracking columns to payment_transactions.

do $$
declare
  v_asset_cat text := 'Asset';
begin
  select account_category
  into v_asset_cat
  from public.chart_of_accounts
  where account_code in ('1140-01', '1150-01', '1110-01')
  limit 1;

  v_asset_cat := coalesce(v_asset_cat, 'Asset');

  insert into public.chart_of_accounts (
    account_code, account_name_th, account_name_en, account_category, is_system_default, is_active
  ) values (
    '1170-01',
    'เงินมัดจำจ่ายล่วงหน้าค่าสินค้า/บริการ',
    'Advance Payment & Deposits to Vendors',
    v_asset_cat,
    true,
    true
  )
  on conflict (account_code) do update set
    account_name_th = excluded.account_name_th,
    account_name_en = excluded.account_name_en,
    is_system_default = true,
    is_active = true,
    updated_at = now();
exception when others then
  -- Fallback if chart_of_accounts lacks optional columns in legacy tables
  insert into public.chart_of_accounts (account_code, account_name_th, account_name_en, account_category)
  values ('1170-01', 'เงินมัดจำจ่ายล่วงหน้าค่าสินค้า/บริการ', 'Advance Payment & Deposits to Vendors', v_asset_cat)
  on conflict (account_code) do nothing;
end $$;

alter table if exists public.payment_transactions add column if not exists wht_rate numeric(5,2) default 0;
alter table if exists public.payment_transactions add column if not exists wht_amount numeric(15,2) default 0;
alter table if exists public.payment_transactions add column if not exists wht_form_type text;
alter table if exists public.payment_transactions add column if not exists tax_base_amount numeric(15,2) default 0;
alter table if exists public.payment_transactions add column if not exists is_pre_receipt_deposit boolean default false;
