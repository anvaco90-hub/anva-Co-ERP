-- 042_fix_goods_receipt_accounting_and_ap.sql
-- Fix Goods Receipt (RI) integration with Store Stock Cost, General Ledger (GL), Input VAT (ภ.พ.30), and Accounts Payable (AP):
--   1. When a PO uses `vat_included`, strip VAT (e.g. 7/107) BEFORE writing to goods_receipt_items.unit_cost,
--      stock_lots.unit_cost, and inventory_items.avg_unit_cost (stops 7% stock overvaluation & double VAT counting).
--   2. Drop broken AFTER INSERT trigger on goods_receipts (which ran before goods_receipt_items rows existed -> v_subtotal = 0).
--   3. Post GL (Dr. 1140-01 Inventory pre-VAT, Dr. 1150-01 Input VAT, Cr. 2110-01 AP) + tax_records (INPUT_VAT)
--      + upsert accounts_payable (with payment term credit days & existing PO deposit deduction) inside confirm_goods_receipt
--      and via AFTER INSERT/UPDATE/DELETE trigger on goods_receipt_items for direct table inserts.

-- 1) Ensure required columns exist safely
alter table if exists public.purchase_orders add column if not exists tax_type text default 'vat_included';
alter table if exists public.purchase_orders add column if not exists vat_rate numeric(5,2) default 7.00;
alter table if exists public.purchase_orders add column if not exists wht_rate numeric(5,2) default 0.00;
alter table if exists public.purchase_orders add column if not exists deposit_paid_amount numeric(15,2) default 0;
alter table if exists public.accounts_payable add column if not exists po_no text;
alter table if exists public.payment_transactions add column if not exists amount_paid numeric(15,2) default 0;

-- 2) Remove broken legacy trigger that fired on goods_receipts header BEFORE items were inserted
drop trigger if exists trg_goods_receipt_accounting on public.goods_receipts;

-- 3) Resolve effective PO tax mode ('vat_included' | 'vat_excluded' | 'vat_exempt') & VAT rate
create or replace function public.resolve_po_effective_tax(p_po_id uuid)
returns table(eff_tax_type text, eff_vat_rate numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_po record;
  v_rate numeric;
  v_vat_val numeric;
  v_total_ref numeric;
  v_expected_incl numeric;
  v_expected_excl numeric;
begin
  select tax_type, vat_rate, vat_amount, total_amount
  into v_po
  from public.purchase_orders
  where id = p_po_id;

  if not found then
    return query select 'vat_excluded'::text, 7::numeric;
    return;
  end if;

  v_rate := coalesce(v_po.vat_rate, 7);
  v_vat_val := coalesce(v_po.vat_amount, 0);
  v_total_ref := coalesce(v_po.total_amount, 0);

  if v_po.tax_type = 'vat_exempt'
     or (v_rate = 0 and v_vat_val = 0)
     or (v_po.tax_type is null and v_vat_val = 0) then
    return query select 'vat_exempt'::text, 0::numeric;
    return;
  end if;

  v_rate := case when v_rate > 0 then v_rate else 7 end;

  if v_po.tax_type = 'vat_included' then
    return query select 'vat_included'::text, v_rate;
    return;
  end if;

  if v_total_ref >= 100 and v_vat_val > 0 then
    v_expected_incl := round((v_total_ref * v_rate) / (100.0 + v_rate), 2);
    v_expected_excl := round(v_total_ref * (v_rate / 100.0), 2);
    if abs(v_vat_val - v_expected_incl) <= 0.05 and abs(v_vat_val - v_expected_excl) > 1 then
      return query select 'vat_included'::text, v_rate;
      return;
    end if;
  end if;

  return query select 'vat_excluded'::text, v_rate;
end;
$$;

-- 4) Idempotent function: Post/refresh GL journal entry, INPUT_VAT tax record, and Accounts Payable for a GRN
create or replace function public.post_goods_receipt_accounting_and_ap(p_grn_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gr record;
  v_po record;
  v_eff_tax_type text := 'vat_excluded';
  v_eff_vat_rate numeric := 7;
  v_subtotal numeric(15,2) := 0;
  v_vat numeric(15,2) := 0;
  v_net numeric(15,2) := 0;
  v_doc_date date;
  v_tax_inv_date date;
  v_tax_inv_no text;
  v_jv_no text;
  v_jv_id uuid;
  v_jv_status text;
  v_inv_acc_id uuid;
  v_vat_acc_id uuid;
  v_ap_acc_id uuid;
  v_existing_tax_id uuid;
  v_existing_tax_status text;
  v_vendor_name text;
  v_cum_pre_vat numeric(15,2) := 0;
  v_cum_vat numeric(15,2) := 0;
  v_cum_wht numeric(15,2) := 0;
  v_wht_rate numeric(5,2) := 0;
  v_ap_total_debt numeric(15,2) := 0;
  v_paid_from_tx numeric(15,2) := 0;
  v_paid_amount numeric(15,2) := 0;
  v_remaining numeric(15,2) := 0;
  v_ap_status text := 'pending';
  v_credit_days int := 30;
  v_due_date date;
  v_existing_ap_id uuid;
  v_existing_ap_paid numeric(15,2) := 0;
  v_ap_no text;
begin
  select * into v_gr from public.goods_receipts where id = p_grn_id;
  if not found then
    return null;
  end if;

  select coalesce(sum(qty_received * coalesce(unit_cost, 0)), 0)
  into v_subtotal
  from public.goods_receipt_items
  where grn_id = p_grn_id;

  if v_subtotal <= 0 then
    return null;
  end if;

  if v_gr.po_id is not null then
    select * into v_po from public.purchase_orders where id = v_gr.po_id;
    select eff_tax_type, eff_vat_rate
    into v_eff_tax_type, v_eff_vat_rate
    from public.resolve_po_effective_tax(v_gr.po_id);
  end if;

  v_vat := case when v_eff_vat_rate > 0 then round(v_subtotal * (v_eff_vat_rate / 100.0), 2) else 0 end;
  v_net := round(v_subtotal + v_vat, 2);
  v_doc_date := coalesce(v_gr.received_date, current_date);
  v_tax_inv_no := coalesce(nullif(trim(v_po.vendor_tax_invoice_no), ''), v_gr.grn_no, 'GRN-' || to_char(v_doc_date, 'YYYYMMDD'));
  v_tax_inv_date := coalesce(v_po.tax_invoice_date, v_doc_date);

  -- A. Chart of Accounts lookup
  select id into v_inv_acc_id from public.chart_of_accounts where account_code = '1140-01' limit 1;
  select id into v_vat_acc_id from public.chart_of_accounts where account_code = '1150-01' limit 1;
  select id into v_ap_acc_id from public.chart_of_accounts where account_code = '2110-01' limit 1;

  -- B. Upsert Draft Journal Entry for this RI
  select id, accounting_status
  into v_jv_id, v_jv_status
  from public.journal_entries
  where reference_type = 'RI'
    and reference_id = p_grn_id
    and accounting_status <> 'ยกเลิก'
  order by created_at asc
  limit 1;

  if v_jv_id is null and v_inv_acc_id is not null and v_ap_acc_id is not null then
    begin
      v_jv_no := public.generate_journal_entry_no(v_doc_date, 'JV');
    exception when others then
      v_jv_no := 'JV' || to_char(v_doc_date, 'YYYYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
    end;

    insert into public.journal_entries (
      entry_no, entry_date, reference_type, reference_id, project_id,
      description, accounting_status, created_by
    ) values (
      v_jv_no, v_doc_date, 'RI', p_grn_id, v_po.project_id,
      'รับวัสดุก่อสร้างเข้าคลังสโตร์และตั้งเจ้าหนี้ตามใบรับของ ' || v_gr.grn_no,
      'รอดำเนินการ', v_gr.received_by
    ) returning id into v_jv_id;

    v_jv_status := 'รอดำเนินการ';
  end if;

  if v_jv_id is not null and v_jv_status = 'รอดำเนินการ' then
    delete from public.journal_entry_lines where journal_entry_id = v_jv_id;

    insert into public.journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_inv_acc_id, v_po.vendor_id, v_subtotal, 0,
      'รับวัสดุเข้าสโตร์ - ' || v_gr.grn_no
    );

    if v_vat > 0 and v_vat_acc_id is not null then
      insert into public.journal_entry_lines (
        journal_entry_id, account_id, contact_id, debit, credit, line_description
      ) values (
        v_jv_id, v_vat_acc_id, v_po.vendor_id, v_vat, 0,
        'ภาษีซื้อ - ' || v_gr.grn_no
      );
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id, account_id, contact_id, debit, credit, line_description
    ) values (
      v_jv_id, v_ap_acc_id, v_po.vendor_id, 0, v_net,
      'เจ้าหนี้การค้า - ' || v_gr.grn_no
    );

    update public.goods_receipts
    set journal_entry_id = v_jv_id
    where id = p_grn_id and (journal_entry_id is null or journal_entry_id <> v_jv_id);
  end if;

  -- C. Upsert Input VAT into tax_records (ภ.พ.30 ภาษีซื้อ)
  if v_vat > 0 then
    select id, status
    into v_existing_tax_id, v_existing_tax_status
    from public.tax_records
    where tax_type = 'INPUT_VAT'
      and document_no = v_gr.grn_no
      and status <> 'ยกเลิก'
    limit 1;

    if v_existing_tax_id is null then
      insert into public.tax_records (
        tax_type, tax_month, tax_year, document_date, document_no, vendor_tax_invoice_no,
        contact_id, project_id, base_amount, vat_amount, status, journal_entry_id
      ) values (
        'INPUT_VAT',
        extract(month from v_tax_inv_date)::int,
        extract(year from v_tax_inv_date)::int,
        v_tax_inv_date,
        v_gr.grn_no,
        v_tax_inv_no,
        v_po.vendor_id,
        v_po.project_id,
        v_subtotal,
        v_vat,
        'รอยื่นภาษี',
        v_jv_id
      );
    elsif v_existing_tax_status = 'รอยื่นภาษี' then
      update public.tax_records set
        tax_month = extract(month from v_tax_inv_date)::int,
        tax_year = extract(year from v_tax_inv_date)::int,
        document_date = v_tax_inv_date,
        vendor_tax_invoice_no = v_tax_inv_no,
        base_amount = v_subtotal,
        vat_amount = v_vat,
        journal_entry_id = coalesce(journal_entry_id, v_jv_id),
        updated_at = now()
      where id = v_existing_tax_id;
    end if;
  end if;

  -- D. Upsert Accounts Payable (ตั้งเจ้าหนี้ใน accounts_payable) linked to PO
  if v_gr.po_id is not null then
    select coalesce(sum(gri.qty_received * coalesce(gri.unit_cost, 0)), 0)
    into v_cum_pre_vat
    from public.goods_receipt_items gri
    join public.goods_receipts gr on gr.id = gri.grn_id
    where gr.po_id = v_gr.po_id;

    v_cum_vat := case when v_eff_vat_rate > 0 then round(v_cum_pre_vat * (v_eff_vat_rate / 100.0), 2) else 0 end;
    v_wht_rate := coalesce(v_po.wht_rate, 0);
    v_cum_wht := case when v_wht_rate > 0 then round(v_cum_pre_vat * (v_wht_rate / 100.0), 2) else 0 end;
    v_ap_total_debt := greatest(0, round(v_cum_pre_vat + v_cum_vat - v_cum_wht, 2));

    if v_ap_total_debt > 0 then
      select coalesce(sum(coalesce(nullif(amount_paid, 0), amount, 0)), 0)
      into v_paid_from_tx
      from public.payment_transactions
      where document_id = v_gr.po_id;

      select id, coalesce(paid_amount, 0)
      into v_existing_ap_id, v_existing_ap_paid
      from public.accounts_payable
      where po_id = v_gr.po_id
      order by created_at asc
      limit 1;

      v_paid_amount := greatest(coalesce(v_po.deposit_paid_amount, 0), v_paid_from_tx, v_existing_ap_paid);
      v_remaining := greatest(0, round(v_ap_total_debt - v_paid_amount, 2));
      v_ap_status := case
        when v_remaining <= 0.05 then 'paid'
        when v_paid_amount > 0 then 'partial'
        else 'pending'
      end;

      v_credit_days := coalesce(
        v_po.payment_term_days,
        case
          when lower(coalesce(v_po.payment_type, '')) in ('cash', 'cbd') then 0
          when lower(coalesce(v_po.payment_type, '')) = 'credit_60' then 60
          when lower(coalesce(v_po.payment_type, '')) = 'advance_deposit' then 7
          else 30
        end
      );
      v_due_date := v_tax_inv_date + v_credit_days;

      if v_po.vendor_id is not null then
        select vendor_name into v_vendor_name from public.vendors where id = v_po.vendor_id limit 1;
      end if;
      v_vendor_name := coalesce(nullif(trim(v_vendor_name), ''), nullif(trim(v_po.custom_vendor_name), ''), 'ผู้จำหน่าย/คู่ค้า');

      if v_existing_ap_id is not null then
        update public.accounts_payable set
          po_no = coalesce(po_no, v_po.po_no),
          vendor_id = coalesce(v_po.vendor_id, vendor_id),
          vendor_name = v_vendor_name,
          invoice_no = v_tax_inv_no,
          invoice_date = v_tax_inv_date,
          due_date = v_due_date,
          credit_days = v_credit_days,
          total_debt = v_ap_total_debt,
          paid_amount = v_paid_amount,
          remaining_amount = v_remaining,
          status = v_ap_status,
          updated_at = now()
        where id = v_existing_ap_id;
      else
        v_ap_no := 'AP-' || coalesce(nullif(trim(v_po.po_no), ''), v_gr.grn_no);
        if exists (select 1 from public.accounts_payable where ap_no = v_ap_no) then
          v_ap_no := v_ap_no || '-' || lpad(floor(random()*900 + 100)::text, 3, '0');
        end if;

        insert into public.accounts_payable (
          ap_no, po_id, po_no, vendor_id, vendor_name,
          invoice_no, invoice_date, due_date, credit_days,
          total_debt, paid_amount, remaining_amount, status, alert_level
        ) values (
          v_ap_no, v_gr.po_id, v_po.po_no, v_po.vendor_id, v_vendor_name,
          v_tax_inv_no, v_tax_inv_date, v_due_date, v_credit_days,
          v_ap_total_debt, v_paid_amount, v_remaining, v_ap_status, 'normal'
        );
      end if;
    end if;
  end if;

  return v_jv_id;
end;
$$;

grant execute on function public.post_goods_receipt_accounting_and_ap(uuid) to public, authenticated, anon, service_role;

-- 5) Replace confirm_goods_receipt: strip VAT on vat_included POs + post GL, INPUT_VAT & AP after items exist
create or replace function public.confirm_goods_receipt(
  p_po_id uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn_id uuid;
  v_grn_no text;
  v_item jsonb;
  v_poi_id uuid;
  v_item_id uuid;
  v_item_code text;
  v_item_name text;
  v_item_unit text;
  v_qty numeric(12,2);
  v_po_unit_price numeric(15,2);
  v_cost numeric(15,2);
  v_project_id uuid;
  v_eff_tax_type text := 'vat_excluded';
  v_eff_vat_rate numeric := 7;
  v_gri_id uuid;
  v_cur_qty numeric(12,2);
  v_cur_cost numeric(15,2);
  v_all_received boolean := true;
  v_item_cur record;
begin
  perform set_config('anva.skip_gri_trigger', 'on', true);

  begin
    v_grn_no := public.next_doc_no('RI');
  exception when others then
    v_grn_no := 'RI' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  select project_id into v_project_id from public.purchase_orders where id = p_po_id;
  select eff_tax_type, eff_vat_rate into v_eff_tax_type, v_eff_vat_rate
  from public.resolve_po_effective_tax(p_po_id);

  insert into public.goods_receipts (grn_no, po_id, received_date, created_at)
  values (v_grn_no, p_po_id, current_date, now())
  returning id into v_grn_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_poi_id := (v_item->>'po_item_id')::uuid;
    v_qty := coalesce((v_item->>'qty_received')::numeric, 0);
    continue when v_qty <= 0;

    select item_id, item_name, unit, coalesce(unit_price, 0)
    into v_item_id, v_item_name, v_item_unit, v_po_unit_price
    from public.purchase_order_items
    where id = v_poi_id;

    if v_po_unit_price > 0 then
      if v_eff_tax_type = 'vat_included' and v_eff_vat_rate > 0 then
        v_cost := round((v_po_unit_price * 100.0) / (100.0 + v_eff_vat_rate), 2);
      else
        v_cost := round(v_po_unit_price, 2);
      end if;
    else
      v_cost := round(coalesce((v_item->>'unit_cost')::numeric, 0), 2);
    end if;

    if v_item_id is null and v_item_name is not null then
      select id into v_item_id
      from public.inventory_items
      where lower(trim(item_name)) = lower(trim(v_item_name))
      limit 1;
    end if;

    if v_item_id is null then
      v_item_code := 'MAT-' || to_char(current_date, 'YY') || lpad(floor(random()*90000 + 10000)::text, 5, '0');
      insert into public.inventory_items (item_code, item_name, unit, qty_on_hand, avg_unit_cost, created_at, updated_at)
      values (v_item_code, coalesce(v_item_name, 'วัสดุใหม่'), coalesce(v_item_unit, 'หน่วย'), 0, v_cost, now(), now())
      returning id into v_item_id;

      update public.purchase_order_items set item_id = v_item_id where id = v_poi_id;
    end if;

    insert into public.goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (v_grn_id, v_poi_id, v_qty, v_cost)
    returning id into v_gri_id;

    insert into public.stock_lots (item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost, created_at)
    values (v_item_id, v_project_id, v_gri_id, 'receipt', current_date, v_qty, v_qty, v_cost, now());

    select coalesce(qty_on_hand, 0), coalesce(avg_unit_cost, 0)
    into v_cur_qty, v_cur_cost
    from public.inventory_items
    where id = v_item_id;

    update public.inventory_items set
      qty_on_hand = v_cur_qty + v_qty,
      avg_unit_cost = case
        when (v_cur_qty + v_qty) > 0 then round(((v_cur_qty * v_cur_cost) + (v_qty * v_cost)) / (v_cur_qty + v_qty), 2)
        else v_cost
      end,
      updated_at = now()
    where id = v_item_id;

    update public.purchase_order_items
    set qty_received = coalesce(qty_received, 0) + v_qty
    where id = v_poi_id;
  end loop;

  for v_item_cur in select quantity, qty_received from public.purchase_order_items where po_id = p_po_id loop
    if coalesce(v_item_cur.qty_received, 0) < v_item_cur.quantity then
      v_all_received := false;
    end if;
  end loop;

  update public.purchase_orders set
    status = case when v_all_received then 'received' else 'partial' end,
    updated_at = now()
  where id = p_po_id;

  -- Post GL, Input VAT & AP now that all goods_receipt_items rows are committed
  perform public.post_goods_receipt_accounting_and_ap(v_grn_id);

  return v_grn_id;
end;
$$;

grant execute on function public.confirm_goods_receipt(uuid, jsonb) to public, authenticated, anon, service_role;

-- 6) Trigger on goods_receipt_items for direct table inserts/updates outside confirm_goods_receipt
create or replace function public.on_goods_receipt_items_accounting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn_id uuid;
begin
  if current_setting('anva.skip_gri_trigger', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_grn_id := coalesce(new.grn_id, old.grn_id);
  if v_grn_id is not null then
    perform public.post_goods_receipt_accounting_and_ap(v_grn_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_goods_receipt_items_accounting on public.goods_receipt_items;
create trigger trg_goods_receipt_items_accounting
  after insert or update or delete on public.goods_receipt_items
  for each row execute function public.on_goods_receipt_items_accounting();
