-- ขั้นที่ 4: โมดูลสโตร์ — เบิกวัสดุเข้าหน้างาน (ตัดสต็อก + ลงบัญชีอัตโนมัติ)
-- รันใน SQL Editor (โปรเจกต์ dev ก่อน แล้วค่อยโปรเจกต์จริง) — ต้องรัน 003 มาก่อน

create table stock_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text unique not null,
  project_id uuid not null references projects(id),
  issue_date date not null,
  issued_by uuid references profiles(id),
  journal_entry_id uuid references journal_entries(id),
  notes text
);
create table stock_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references stock_issues(id) on delete cascade,
  item_id uuid not null references inventory_items(id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(15,2) not null
);
create index on stock_issue_items (issue_id);

alter table stock_issues enable row level security;
alter table stock_issue_items enable row level security;

-- อ่านได้ตามฝ่าย / ไม่มี policy เขียน (เขียนผ่าน confirm_stock_issue เท่านั้น)
create policy "read_issues" on stock_issues for select
  using (get_my_role() in ('admin','store','purchasing','management','accounting'));
create policy "read_issue_items" on stock_issue_items for select
  using (get_my_role() in ('admin','store','purchasing','management','accounting'));

-- สโตร์/admin แก้ได้เฉพาะ "จุดสั่งซื้อซ้ำ" ของสินค้า (ไม่ให้แก้ชื่อ/รหัส/จำนวนสต็อก)
revoke update on inventory_items from anon, authenticated;
grant update (reorder_point) on inventory_items to authenticated;
create policy "update_reorder_point" on inventory_items for update
  using (get_my_role() in ('admin','store')) with check (get_my_role() in ('admin','store'));

-- เบิกวัสดุเข้าหน้างาน: ตัดสต็อก + ลงบัญชี Dr.ต้นทุนวัสดุ / Cr.วัสดุคงเหลือ ใน transaction เดียว
-- ต้นทุนต่อหน่วยใช้ต้นทุนถัวเฉลี่ยของสต็อกในฐานข้อมูล (ไม่รับค่าจาก client)
-- p_items: [{ "item_id": uuid, "quantity": number }]
create function confirm_stock_issue(p_project_id uuid, p_items jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_qty numeric; v_item_id uuid; v_stock inventory_stock%rowtype; v_name text;
  v_issue uuid; v_issue_no text; v_je uuid; v_total numeric(15,2) := 0;
  v_acc_cost uuid; v_acc_inv uuid;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์เบิกวัสดุ';
  end if;
  if p_project_id is null then raise exception 'กรุณาเลือกโครงการ'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ไม่มีรายการเบิก'; end if;

  select id into v_acc_cost from chart_of_accounts where account_code = '5100';
  select id into v_acc_inv  from chart_of_accounts where account_code = '1140';
  if v_acc_cost is null or v_acc_inv is null then raise exception 'ยังไม่มีผังบัญชี 5100/1140'; end if;

  v_issue_no := generate_doc_no('ISS');
  insert into stock_issues (issue_no, project_id, issue_date, issued_by, notes)
  values (v_issue_no, p_project_id, current_date, auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_issue;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'จำนวนเบิกต้องมากกว่า 0'; end if;

    -- ล็อกแถวสต็อกกันเบิกซ้อนจนติดลบ (รายการซ้ำในใบเดียวกันก็เห็นยอดที่ตัดไปแล้ว)
    select * into v_stock from inventory_stock
      where item_id = v_item_id and project_id = p_project_id for update;
    select item_name into v_name from inventory_items where id = v_item_id;
    if not found or v_stock.id is null then
      raise exception 'ไม่มีสต็อกของรายการนี้ในโครงการ: %', coalesce(v_name, '-');
    end if;
    if v_stock.qty_on_hand < v_qty then
      raise exception 'สต็อกไม่พอ: % (คงเหลือ %)', v_name, v_stock.qty_on_hand;
    end if;

    update inventory_stock set qty_on_hand = qty_on_hand - v_qty where id = v_stock.id;
    insert into stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue, v_item_id, v_qty, v_stock.avg_unit_cost);
    v_total := v_total + round(v_qty * v_stock.avg_unit_cost, 2);
  end loop;

  if v_total > 0 then
    insert into journal_entries (entry_no, entry_date, description, project_id, source_module, source_ref, created_by)
    values (generate_doc_no('JV'), current_date, 'เบิกวัสดุเข้าหน้างาน ' || v_issue_no,
            p_project_id, 'store', v_issue_no, auth.uid())
    returning id into v_je;
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit) values
      (v_je, v_acc_cost, v_total, 0),
      (v_je, v_acc_inv, 0, v_total);
    update stock_issues set journal_entry_id = v_je where id = v_issue;
  end if;

  return v_issue;
end $$;

revoke all on function confirm_stock_issue(uuid, jsonb, text) from public, anon;
grant execute on function confirm_stock_issue(uuid, jsonb, text) to authenticated;
