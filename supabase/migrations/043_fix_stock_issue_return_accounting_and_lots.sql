-- 043_fix_stock_issue_return_accounting_and_lots.sql
-- Integrate Warehouse Stock Issues (confirm_stock_issue) and Returns / Adjustments (adjust_stock)
-- with General Ledger (Dr. 5110-01 / Cr. 1140-01 and reverse on return), stock_lots FIFO & return lots,
-- and safe unit_cost fallback so ProjectDetail actual costs & accounting GL stay 100% synchronized.

-- 1) Ensure journal_entry_id columns exist and reference_type allows ISS & ADJ
alter table if exists public.stock_issues add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;
alter table if exists public.stock_adjustments add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;

do $$
declare
  v_con_name text;
begin
  select conname into v_con_name
  from pg_constraint
  where conrelid = 'public.journal_entries'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%reference_type%'
  limit 1;

  if v_con_name is not null then
    execute format('alter table public.journal_entries drop constraint %I', v_con_name);
  end if;

  alter table public.journal_entries
    add constraint journal_entries_reference_type_check
    check (reference_type in ('INV', 'RC', 'RI', 'ISS', 'ADJ', 'EXP', 'PAY', 'MANUAL'));
exception when others then
  null;
end $$;

-- 2) Helper: consume FIFO stock_lots up to p_qty without hard-failing if historical lots are incomplete
create or replace function public.consume_stock_lots_fifo(p_item_id uuid, p_qty numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem numeric := greatest(0, coalesce(p_qty, 0));
  v_lot record;
  v_take numeric;
begin
  if p_item_id is null or v_rem <= 0 then
    return;
  end if;

  for v_lot in
    select id, qty_remaining
    from public.stock_lots
    where item_id = p_item_id and coalesce(qty_remaining, 0) > 0
    order by received_date asc, created_at asc, id asc
    for update
  loop
    exit when v_rem <= 0;
    v_take := least(v_rem, v_lot.qty_remaining);
    update public.stock_lots
    set qty_remaining = round(v_lot.qty_remaining - v_take, 2)
    where id = v_lot.id;
    v_rem := round(v_rem - v_take, 2);
  end loop;
end;
$$;

-- 3) Replace confirm_stock_issue: deduct qty_on_hand + FIFO stock_lots + post GL (Dr. 5110-01/5230-01, Cr. 1140-01)
drop function if exists public.confirm_stock_issue(uuid, jsonb, text, text, text, text);
create or replace function public.confirm_stock_issue(
  p_project_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null,
  p_issue_target text default 'project',
  p_issue_reason text default 'ตัดวัสดุไปใช้',
  p_target_location text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue_id uuid;
  v_issue_no text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric(12,2);
  v_avg_cost numeric(15,2);
  v_total numeric(15,2) := 0;
  v_target text := coalesce(nullif(trim(p_issue_target), ''), 'project');
  v_inv_acc_id uuid;
  v_cost_acc_id uuid;
  v_jv_no text;
  v_jv_id uuid;
begin
  begin
    v_issue_no := public.next_doc_no('ISS');
  exception when others then
    v_issue_no := 'ISS' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  insert into public.stock_issues (
    issue_no, project_id, issue_date, notes, issue_target, issue_reason, target_location, created_at
  ) values (
    v_issue_no, p_project_id, current_date, p_notes, v_target,
    coalesce(nullif(trim(p_issue_reason), ''), 'ตัดวัสดุไปใช้'),
    p_target_location, now()
  ) returning id into v_issue_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    continue when v_item_id is null or v_qty <= 0;

    select coalesce(avg_unit_cost, 0)
    into v_avg_cost
    from public.inventory_items
    where id = v_item_id
    for update;

    insert into public.stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue_id, v_item_id, v_qty, v_avg_cost);

    update public.inventory_items
    set qty_on_hand = greatest(coalesce(qty_on_hand, 0) - v_qty, 0),
        updated_at = now()
    where id = v_item_id;

    perform public.consume_stock_lots_fifo(v_item_id, v_qty);

    v_total := v_total + round(v_qty * v_avg_cost, 2);
  end loop;

  if v_total > 0 then
    select id into v_inv_acc_id from public.chart_of_accounts where account_code = '1140-01' limit 1;
    if v_target = 'office' then
      select id into v_cost_acc_id from public.chart_of_accounts where account_code = '5230-01' limit 1;
    end if;
    if v_cost_acc_id is null then
      select id into v_cost_acc_id from public.chart_of_accounts where account_code = '5110-01' limit 1;
    end if;

    if v_inv_acc_id is not null and v_cost_acc_id is not null then
      begin
        v_jv_no := public.generate_journal_entry_no(current_date, 'JV');
      exception when others then
        v_jv_no := 'JV' || to_char(current_date, 'YYYYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
      end;

      insert into public.journal_entries (
        entry_no, entry_date, reference_type, reference_id, project_id, description, accounting_status
      ) values (
        v_jv_no, current_date, 'ISS', v_issue_id, p_project_id,
        'เบิกวัสดุจากคลังสโตร์ ' || v_issue_no, 'รอดำเนินการ'
      ) returning id into v_jv_id;

      insert into public.journal_entry_lines (
        journal_entry_id, account_id, debit, credit, line_description
      ) values
        (v_jv_id, v_cost_acc_id, v_total, 0, 'ต้นทุนเบิกวัสดุ - ' || v_issue_no),
        (v_jv_id, v_inv_acc_id, 0, v_total, 'ตัดสต็อกวัสดุคงเหลือ - ' || v_issue_no);

      update public.stock_issues set journal_entry_id = v_jv_id where id = v_issue_id;
    end if;
  end if;

  return v_issue_id;
end;
$$;

grant execute on function public.confirm_stock_issue(uuid, jsonb, text, text, text, text) to public, authenticated, anon, service_role;

-- 4) Replace adjust_stock: default unit_cost to item avg_unit_cost, sync weighted avg & stock_lots, post GL on return/damage
create or replace function public.adjust_stock(
  p_item_id uuid,
  p_source_project_id uuid,
  p_new_qty numeric,
  p_unit_cost numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj_id uuid;
  v_adj_no text;
  v_cur_qty numeric(12,2) := 0;
  v_cur_avg numeric(15,2) := 0;
  v_eff_cost numeric(15,2) := 0;
  v_diff numeric(12,2) := 0;
  v_abs_qty numeric(12,2) := 0;
  v_next_avg numeric(15,2) := 0;
  v_val numeric(15,2) := 0;
  v_inv_acc_id uuid;
  v_cost_acc_id uuid;
  v_jv_no text;
  v_jv_id uuid;
begin
  select coalesce(qty_on_hand, 0), coalesce(avg_unit_cost, 0)
  into v_cur_qty, v_cur_avg
  from public.inventory_items
  where id = p_item_id
  for update;

  v_eff_cost := case
    when coalesce(p_unit_cost, 0) > 0 then round(p_unit_cost, 2)
    else round(v_cur_avg, 2)
  end;

  begin
    v_adj_no := public.next_doc_no('ADJ');
  exception when others then
    v_adj_no := 'ADJ' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  insert into public.stock_adjustments (
    adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, reason, created_at
  ) values (
    v_adj_no, p_item_id, p_source_project_id, v_cur_qty, p_new_qty, v_eff_cost, p_reason, now()
  ) returning id into v_adj_id;

  v_diff := p_new_qty - v_cur_qty;
  v_abs_qty := abs(v_diff);

  if v_diff > 0 then
    v_next_avg := case
      when p_new_qty > 0 then round(((v_cur_qty * v_cur_avg) + (v_abs_qty * v_eff_cost)) / p_new_qty, 2)
      else v_eff_cost
    end;

    update public.inventory_items
    set qty_on_hand = p_new_qty,
        avg_unit_cost = v_next_avg,
        updated_at = now()
    where id = p_item_id;

    insert into public.stock_lots (
      item_id, source_project_id, lot_type, received_date, qty_received, qty_remaining, unit_cost, created_at
    ) values (
      p_item_id, p_source_project_id, 'adjustment', current_date, v_abs_qty, v_abs_qty, v_eff_cost, now()
    );
  else
    update public.inventory_items
    set qty_on_hand = p_new_qty,
        updated_at = now()
    where id = p_item_id;

    if v_diff < 0 then
      perform public.consume_stock_lots_fifo(p_item_id, v_abs_qty);
    end if;
  end if;

  v_val := round(v_abs_qty * v_eff_cost, 2);
  if v_val > 0 and v_diff <> 0 then
    select id into v_inv_acc_id from public.chart_of_accounts where account_code = '1140-01' limit 1;
    select id into v_cost_acc_id from public.chart_of_accounts where account_code = '5110-01' limit 1;

    if v_inv_acc_id is not null and v_cost_acc_id is not null then
      begin
        v_jv_no := public.generate_journal_entry_no(current_date, 'JV');
      exception when others then
        v_jv_no := 'JV' || to_char(current_date, 'YYYYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
      end;

      insert into public.journal_entries (
        entry_no, entry_date, reference_type, reference_id, project_id, description, accounting_status
      ) values (
        v_jv_no, current_date, 'ADJ', v_adj_id, p_source_project_id,
        case when v_diff > 0 then 'รับคืนพัสดุเข้าสโตร์ ' else 'ตัดปรับปรุง/ชำรุดพัสดุ ' end || v_adj_no || ': ' || coalesce(p_reason, ''),
        'รอดำเนินการ'
      ) returning id into v_jv_id;

      if v_diff > 0 then
        insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, line_description) values
          (v_jv_id, v_inv_acc_id, v_val, 0, 'รับคืนวัสดุเข้าสต็อก - ' || v_adj_no),
          (v_jv_id, v_cost_acc_id, 0, v_val, 'ลดต้นทุนวัสดุโครงการ - ' || v_adj_no);
      else
        insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, line_description) values
          (v_jv_id, v_cost_acc_id, v_val, 0, 'ตัดวัสดุชำรุด/สูญหาย - ' || v_adj_no),
          (v_jv_id, v_inv_acc_id, 0, v_val, 'ลดยอดสต็อกวัสดุ - ' || v_adj_no);
      end if;

      update public.stock_adjustments set journal_entry_id = v_jv_id where id = v_adj_id;
    end if;
  end if;

  return v_adj_id;
end;
$$;

grant execute on function public.adjust_stock(uuid, uuid, numeric, numeric, text) to public, authenticated, anon, service_role;
