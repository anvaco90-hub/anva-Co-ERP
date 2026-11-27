


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_consume_lots"("p_item_id" "uuid", "p_qty" numeric, "p_filter_source" boolean, "p_source" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_lot stock_lots%rowtype; v_left numeric := p_qty; v_take numeric;
begin
  for v_lot in
    select * from stock_lots
    where item_id = p_item_id and qty_remaining > 0
      and (not p_filter_source or source_project_id is not distinct from p_source)
    order by received_date, created_at, id for update
  loop
    v_take := least(v_lot.qty_remaining, v_left);
    update stock_lots set qty_remaining = qty_remaining - v_take where id = v_lot.id;
    v_left := v_left - v_take;
    exit when v_left <= 0;
  end loop;
  return v_left;
end $$;


ALTER FUNCTION "public"."_consume_lots"("p_item_id" "uuid", "p_qty" numeric, "p_filter_source" boolean, "p_source" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_po_snapshot"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object('po_no', po.po_no, 'vendor', v.vendor_name, 'status', po.status, 'total_amount', po.total_amount,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity,
        'unit', i.unit, 'unit_price', i.unit_price) order by i.item_name, i.id)
      from purchase_order_items i where i.po_id = po.id), '[]'::jsonb))
  from purchase_orders po left join vendors v on v.id = po.vendor_id where po.id = p_id
$$;


ALTER FUNCTION "public"."_po_snapshot"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pr_snapshot"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object('pr_no', pr.pr_no, 'project', p.project_code, 'status', pr.status, 'notes', pr.notes,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity,
        'unit', i.unit, 'estimated_price', i.estimated_price) order by i.item_name, i.id)
      from purchase_requisition_items i where i.pr_id = pr.id), '[]'::jsonb))
  from purchase_requisitions pr left join projects p on p.id = pr.project_id where pr.id = p_id
$$;


ALTER FUNCTION "public"."_pr_snapshot"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_item_id" "uuid", "p_source_project_id" "uuid", "p_new_qty" numeric, "p_unit_cost" numeric, "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_adj_id uuid;
  v_adj_no text;
  v_cur_qty numeric := 0;
begin
  select coalesce(qty_on_hand, 0) into v_cur_qty from inventory_items where id = p_item_id;
  v_adj_no := next_doc_no('ADJ');

  insert into stock_adjustments (adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, reason, created_at)
  values (v_adj_no, p_item_id, p_source_project_id, coalesce(v_cur_qty, 0), p_new_qty, coalesce(p_unit_cost, 0), p_reason, now())
  returning id into v_adj_id;

  update inventory_items set qty_on_hand = p_new_qty, updated_at = now() where id = p_item_id;

  return v_adj_id;
end;
$$;


ALTER FUNCTION "public"."adjust_stock"("p_item_id" "uuid", "p_source_project_id" "uuid", "p_new_qty" numeric, "p_unit_cost" numeric, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_purchase_order"("p_po_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_po purchase_orders%rowtype; v_old jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผลการยกเลิก'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status = 'cancelled' then raise exception 'ใบสั่งซื้อนี้ยกเลิกแล้ว'; end if;
  v_old := _po_snapshot(p_po_id);
  update purchase_orders set status = 'cancelled', updated_by = auth.uid(), updated_at = now() where id = p_po_id;
  if v_po.pr_id is not null and not exists (select 1 from goods_receipts where po_id = p_po_id) then
    update purchase_requisitions set status = 'pending' where id = v_po.pr_id and status = 'ordered';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data, new_data)
  values ('PO', p_po_id, v_po.po_no, 'cancel', trim(p_reason), v_old, _po_snapshot(p_po_id));
end $$;


ALTER FUNCTION "public"."cancel_purchase_order"("p_po_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_journal_entry_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_count int;
begin
  -- ตรวจสอบเฉพาะเมื่อสถานะถูกเปลี่ยนเป็น 'อนุมัติแล้ว' และเป็นการ UPDATE
  if new.accounting_status in ('อนุมัติแล้ว', 'approved') and (tg_op = 'UPDATE' and (old.accounting_status is distinct from new.accounting_status)) then
    select 
      coalesce(sum(debit), 0),
      coalesce(sum(credit), 0),
      count(*)
    into v_debit, v_credit, v_count
    from journal_entry_lines
    where journal_entry_id = new.id;

    if v_count > 0 and abs(v_debit - v_credit) > 0.01 then
      raise exception 'รายการสมุดรายวันไม่ดุล: ยอดเดบิต (Dr. %) ไม่เท่ากับยอดเครดิต (Cr. %)', v_debit, v_credit;
    end if;

    new.approved_at := coalesce(new.approved_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."check_journal_entry_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_mock_store_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update purchase_order_items set item_id = null where item_id is not null;
  update quotation_items set item_id = null where item_id is not null;

  delete from stock_issue_items;
  delete from stock_issues;
  delete from stock_adjustments;
  delete from stock_lots;
  delete from inventory_stock;

  delete from inventory_items;
end;
$$;


ALTER FUNCTION "public"."clear_mock_store_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_goods_receipt"("p_po_id" "uuid", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
  v_cost numeric(15,2);
  v_project_id uuid;
  v_gri_id uuid;
  v_cur_qty numeric(12,2);
  v_cur_cost numeric(15,2);
  v_all_received boolean := true;
  v_item_cur record;
begin
  -- 1. สร้างรหัสเอกสารรับของ RI
  begin
    v_grn_no := next_doc_no('RI');
  exception when others then
    v_grn_no := 'RI' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  -- 2. ดึง project_id จาก PO
  select project_id into v_project_id from purchase_orders where id = p_po_id;

  -- 3. บันทึกหัวเอกสารรับของเข้าคลัง (goods_receipts)
  insert into goods_receipts (grn_no, po_id, received_date, created_at)
  values (v_grn_no, p_po_id, current_date, now())
  returning id into v_grn_id;

  -- 4. วนลูปรายการที่รับเข้า
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_poi_id := (v_item->>'po_item_id')::uuid;
    v_qty := coalesce((v_item->>'qty_received')::numeric, 0);
    continue when v_qty <= 0;

    -- ค้นหาข้อมูลสินค้าและราคาจาก purchase_order_items
    select item_id, item_name, unit, coalesce(unit_price, 0)
    into v_item_id, v_item_name, v_item_unit, v_cost
    from purchase_order_items
    where id = v_poi_id;

    if v_cost is null or v_cost = 0 then
      v_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
    end if;

    -- หากยังไม่มี item_id หรือไม่พบ ให้ค้นหาจาก inventory_items ด้วยชื่อ
    if v_item_id is null then
      select id into v_item_id
      from inventory_items
      where lower(trim(item_name)) = lower(trim(v_item_name))
      limit 1;
    end if;

    -- หากยังไม่มีในสโตร์เลย ให้สร้างรายการวัสดุใหม่ใน inventory_items ทันที
    if v_item_id is null then
      v_item_code := 'MAT-' || to_char(current_date, 'YY') || lpad(floor(random()*90000 + 10000)::text, 5, '0');
      insert into inventory_items (item_code, item_name, unit, qty_on_hand, avg_unit_cost, created_at, updated_at)
      values (v_item_code, v_item_name, coalesce(v_item_unit, 'หน่วย'), 0, v_cost, now(), now())
      returning id into v_item_id;

      -- ผูกกลับไปที่ purchase_order_items
      update purchase_order_items set item_id = v_item_id where id = v_poi_id;
    end if;

    -- บันทึกรายการลง goods_receipt_items
    insert into goods_receipt_items (grn_id, po_item_id, qty_received, unit_cost)
    values (v_grn_id, v_poi_id, v_qty, v_cost)
    returning id into v_gri_id;

    -- บันทึกลง stock_lots (ล็อตสินค้าเข้าสโตร์ เพื่อให้หน้าประวัติการรับเข้าและคำนวณ FIFO มองเห็น)
    insert into stock_lots (item_id, source_project_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost, created_at)
    values (v_item_id, v_project_id, v_gri_id, 'receipt', current_date, v_qty, v_qty, v_cost, now());

    -- อัปเดตยอดคงเหลือและต้นทุนเฉลี่ยใน inventory_items
    select coalesce(qty_on_hand, 0), coalesce(avg_unit_cost, 0)
    into v_cur_qty, v_cur_cost
    from inventory_items
    where id = v_item_id;

    update inventory_items set
      qty_on_hand = v_cur_qty + v_qty,
      avg_unit_cost = case
        when (v_cur_qty + v_qty) > 0 then round(((v_cur_qty * v_cur_cost) + (v_qty * v_cost)) / (v_cur_qty + v_qty), 2)
        else v_cost
      end,
      updated_at = now()
    where id = v_item_id;

    -- อัปเดตจำนวนรับแล้วใน purchase_order_items
    update purchase_order_items
    set qty_received = coalesce(qty_received, 0) + v_qty
    where id = v_poi_id;
  end loop;

  -- ตรวจสอบว่ารับครบแล้วหรือไม่ เพื่อเปลี่ยนสถานะ PO
  for v_item_cur in select quantity, qty_received from purchase_order_items where po_id = p_po_id loop
    if coalesce(v_item_cur.qty_received, 0) < v_item_cur.quantity then
      v_all_received := false;
    end if;
  end loop;

  if v_all_received then
    update purchase_orders set status = 'received', updated_at = now() where id = p_po_id;
  else
    update purchase_orders set status = 'partial', updated_at = now() where id = p_po_id;
  end if;

  return v_grn_id;
end;
$$;


ALTER FUNCTION "public"."confirm_goods_receipt"("p_po_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_stock_issue"("p_project_id" "uuid" DEFAULT NULL::"uuid", "p_items" "jsonb" DEFAULT '[]'::"jsonb", "p_notes" "text" DEFAULT NULL::"text", "p_issue_target" "text" DEFAULT 'project'::"text", "p_issue_reason" "text" DEFAULT 'ตัดวัสดุไปใช้'::"text", "p_target_location" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_issue_id uuid;
  v_issue_no text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric(12,2);
  v_avg_cost numeric(15,2);
begin
  v_issue_no := next_doc_no('ISS');

  insert into public.stock_issues (
    issue_no,
    project_id,
    issue_date,
    notes,
    issue_target,
    issue_reason,
    target_location,
    created_at
  )
  values (
    v_issue_no,
    p_project_id,
    current_date,
    p_notes,
    coalesce(p_issue_target, 'project'),
    coalesce(p_issue_reason, 'ตัดวัสดุไปใช้'),
    p_target_location,
    now()
  )
  returning id into v_issue_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    select coalesce(avg_unit_cost, 0) into v_avg_cost
    from public.inventory_items
    where id = v_item_id;

    insert into public.stock_issue_items (issue_id, item_id, quantity, unit_cost)
    values (v_issue_id, v_item_id, v_qty, v_avg_cost);

    update public.inventory_items
    set qty_on_hand = greatest(coalesce(qty_on_hand, 0) - v_qty, 0),
        updated_at = now()
    where id = v_item_id;
  end loop;

  return v_issue_id;
end;
$$;


ALTER FUNCTION "public"."confirm_stock_issue"("p_project_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_issue_target" "text", "p_issue_reason" "text", "p_target_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_order"("p_pr_id" "uuid", "p_project_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_po_id uuid;
  v_po_no text;
  v_item jsonb;
  v_total numeric(15,2) := 0;
begin
  -- คำนวณรหัส PO ใหม่
  begin
    v_po_no := next_doc_no('PO');
  exception when others then
    v_po_no := 'PO' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
  end;

  insert into purchase_orders (po_no, pr_id, project_id, vendor_id, order_date, status, created_at)
  values (v_po_no, p_pr_id, p_project_id, p_vendor_id, current_date, 'open', now())
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0));
    insert into purchase_order_items (po_id, pr_item_id, item_name, quantity, unit, unit_price, total_amount)
    values (
      v_po_id,
      case when (v_item->>'pr_item_id') is not null and (v_item->>'pr_item_id') <> '' then (v_item->>'pr_item_id')::uuid else null end,
      v_item->>'item_name',
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'รายการ'),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0)
    );
  end loop;

  update purchase_orders set total_amount = v_total, grand_total = v_total where id = v_po_id;

  if p_pr_id is not null then
    update purchase_requisitions set status = 'ordered', updated_at = now() where id = p_pr_id;
  end if;

  return v_po_id;
end;
$$;


ALTER FUNCTION "public"."create_purchase_order"("p_pr_id" "uuid", "p_project_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_requisition"("p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_pr_id uuid;
  v_pr_no text;
  v_item jsonb;
begin
  v_pr_no := next_doc_no('PR');

  insert into purchase_requisitions (pr_no, project_id, request_date, notes, status, created_at)
  values (v_pr_no, p_project_id, current_date, p_notes, 'pending', now())
  returning id into v_pr_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price)
    values (
      v_pr_id,
      v_item->>'item_name',
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'รายการ'),
      coalesce((v_item->>'estimated_price')::numeric, 0)
    );
  end loop;

  return v_pr_id;
end;
$$;


ALTER FUNCTION "public"."create_purchase_requisition"("p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_inventory_item_cascade"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update purchase_order_items set item_id = null where item_id = p_item_id;
  update quotation_items set item_id = null where item_id = p_item_id;

  delete from stock_issue_items where item_id = p_item_id;
  delete from stock_adjustments where item_id = p_item_id;
  delete from stock_lots where item_id = p_item_id;
  delete from inventory_stock where item_id = p_item_id;

  delete from inventory_items where id = p_item_id;
end;
$$;


ALTER FUNCTION "public"."delete_inventory_item_cascade"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_purchase_order"("p_po_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_po purchase_orders%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ลบใบสั่งซื้อ'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if exists (select 1 from goods_receipts where po_id = p_po_id) then
    raise exception 'ลบไม่ได้ เพราะมีการรับของแล้ว — ใช้ "ยกเลิก" แทน';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data)
  values ('PO', p_po_id, v_po.po_no, 'delete', p_reason, _po_snapshot(p_po_id));
  if v_po.pr_id is not null then
    update purchase_requisitions set status = 'pending' where id = v_po.pr_id and status = 'ordered';
  end if;
  delete from purchase_orders where id = p_po_id;
end $$;


ALTER FUNCTION "public"."delete_purchase_order"("p_po_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_purchase_requisition"("p_pr_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_pr purchase_requisitions%rowtype;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์ลบใบขอซื้อ'; end if;
  select * into v_pr from purchase_requisitions where id = p_pr_id for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if exists (select 1 from purchase_orders where pr_id = p_pr_id) then
    raise exception 'ลบไม่ได้ เพราะมีใบสั่งซื้ออ้างอิงอยู่ (ลบหรือแก้ใบสั่งซื้อก่อน)';
  end if;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, reason, old_data)
  values ('PR', p_pr_id, v_pr.pr_no, 'delete', p_reason, _pr_snapshot(p_pr_id));
  delete from purchase_requisitions where id = p_pr_id;
end $$;


ALTER FUNCTION "public"."delete_purchase_requisition"("p_pr_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_doc_no"("p_prefix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_year int := extract(year from current_date)::int; v_no int;
begin
  insert into doc_sequences (prefix, doc_year, last_no) values (p_prefix, v_year, 1)
  on conflict (prefix, doc_year) do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_no;
  return p_prefix || '-' || v_year || '-' || lpad(v_no::text, 4, '0');
end $$;


ALTER FUNCTION "public"."generate_doc_no"("p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_item_code"("p_category_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prefix text;
  v_next int;
begin
  if p_category_id is null then
    v_prefix := 'ITM';
  else
    select code_prefix into v_prefix from item_categories where id = p_category_id;
    if v_prefix is null then v_prefix := 'ITM'; end if;
  end if;

  -- ใช้ doc_sequences เพื่อกัน race condition
  insert into doc_sequences (prefix, doc_year, last_no) values (v_prefix, 0, 1)
  on conflict (prefix, doc_year) do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_next;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end $$;


ALTER FUNCTION "public"."generate_item_code"("p_category_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_journal_entry_no"("p_date" "date" DEFAULT CURRENT_DATE, "p_prefix" "text" DEFAULT 'JV'::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."generate_journal_entry_no"("p_date" "date", "p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from profiles where id = auth.uid() and is_active limit 1;
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_doc_no"("p_prefix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_year int := extract(year from current_date);
  v_no int;
begin
  insert into doc_sequences (prefix, doc_year, last_no)
  values (p_prefix, v_year, 1)
  on conflict (prefix, doc_year)
  do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_no;

  return p_prefix || v_year::text || '-' || lpad(v_no::text, 4, '0');
end;
$$;


ALTER FUNCTION "public"."next_doc_no"("p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_modifying_approved_journal_lines"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_status text;
begin
  select accounting_status into v_status
  from journal_entries
  where id = coalesce(old.journal_entry_id, new.journal_entry_id);

  -- ถ้าเป็นระบบ maintenance หรือไม่ได้อนุมัติ ยอมให้แก้ไขได้
  if v_status in ('approved', 'อนุมัติแล้ว', 'posted') and current_setting('app.override_protection', true) is distinct from 'on' then
    -- อนุญาตให้อัปเดตถ้าเป็นการยกเลิก
    null;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."prevent_modifying_approved_journal_lines"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_item_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (new.item_name, new.unit, new.category_id, new.reorder_point)
     is distinct from (old.item_name, old.unit, old.category_id, old.reorder_point) then
    new.updated_at := now(); new.updated_by := auth.uid();
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."stamp_item_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_add_item"("p_item_name" "text", "p_unit" "text", "p_category_id" "uuid", "p_reorder_point" numeric, "p_image_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid; v_code text;
begin
  if get_my_role() is null or get_my_role() not in ('store','admin') then
    raise exception 'ไม่มีสิทธิ์เพิ่มวัสดุ';
  end if;
  if coalesce(trim(p_item_name), '') = '' then raise exception 'กรุณาระบุชื่อวัสดุ'; end if;

  -- ตรวจชื่อซ้ำ
  if exists (select 1 from inventory_items where lower(item_name) = lower(trim(p_item_name))) then
    raise exception 'มีวัสดุชื่อ "%" ในระบบแล้ว', trim(p_item_name);
  end if;

  v_code := generate_item_code(p_category_id);

  insert into inventory_items (item_code, item_name, unit, category_id, reorder_point, image_url, created_by)
  values (v_code, trim(p_item_name), nullif(trim(coalesce(p_unit,'')), ''),
          p_category_id, coalesce(p_reorder_point, 0), p_image_url, auth.uid())
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."store_add_item"("p_item_name" "text", "p_unit" "text", "p_category_id" "uuid", "p_reorder_point" numeric, "p_image_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_purchase_order"("p_po_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_po purchase_orders%rowtype; v_poi purchase_order_items%rowtype; v_item jsonb; v_old jsonb;
  v_keep uuid[] := '{}'; v_id uuid; v_name text; v_unit text; v_qty numeric; v_price numeric;
  v_total numeric(15,2); v_open int; v_any boolean;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบสั่งซื้อ'; end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if v_po.status = 'cancelled' then raise exception 'ใบสั่งซื้อที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
  if p_vendor_id is null then raise exception 'กรุณาเลือกผู้ขาย'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  v_old := _po_snapshot(p_po_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := trim(coalesce(v_item->>'item_name', ''));
    v_unit := nullif(trim(coalesce(v_item->>'unit', '')), '');
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    if v_name = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
    if v_price is null or v_price < 0 then raise exception 'ราคาต่อหน่วยไม่ถูกต้อง'; end if;

    if (v_item->>'id') is not null then
      select * into v_poi from purchase_order_items where id = (v_item->>'id')::uuid and po_id = p_po_id for update;
      if not found then raise exception 'มีรายการที่ไม่อยู่ในใบสั่งซื้อนี้'; end if;
      if v_poi.qty_received > 0 then
        if v_name <> v_poi.item_name or v_unit is distinct from v_poi.unit or v_price <> v_poi.unit_price then
          raise exception 'รายการ "%" รับของแล้ว แก้ได้เฉพาะจำนวน', v_poi.item_name;
        end if;
        if v_qty < v_poi.qty_received then
          raise exception 'จำนวนของ "%" ต่ำกว่าที่รับแล้ว (%)', v_poi.item_name, v_poi.qty_received;
        end if;
      end if;
      update purchase_order_items set item_name = v_name, quantity = v_qty, unit = v_unit, unit_price = v_price
      where id = v_poi.id;
      v_id := v_poi.id;
    else
      insert into purchase_order_items (po_id, item_name, quantity, unit, unit_price)
      values (p_po_id, v_name, v_qty, v_unit, v_price) returning id into v_id;
    end if;
    v_keep := array_append(v_keep, v_id);
  end loop;

  if exists (select 1 from purchase_order_items where po_id = p_po_id and id <> all(v_keep) and qty_received > 0) then
    raise exception 'ลบรายการที่รับของแล้วไม่ได้';
  end if;
  delete from purchase_order_items where po_id = p_po_id and id <> all(v_keep);

  select coalesce(sum(round(quantity * unit_price, 2)), 0) into v_total from purchase_order_items where po_id = p_po_id;
  select count(*) filter (where qty_received < quantity), bool_or(qty_received > 0)
    into v_open, v_any from purchase_order_items where po_id = p_po_id;

  update purchase_orders set vendor_id = p_vendor_id, total_amount = v_total,
    status = case when not coalesce(v_any, false) then 'open' when v_open = 0 then 'received' else 'partial' end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_po_id;

  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, old_data, new_data)
  values ('PO', p_po_id, v_po.po_no, 'update', v_old, _po_snapshot(p_po_id));
end $$;


ALTER FUNCTION "public"."update_purchase_order"("p_po_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_purchase_requisition"("p_pr_id" "uuid", "p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_pr purchase_requisitions%rowtype; v_old jsonb; v_item jsonb;
begin
  if get_my_role() is null or get_my_role() not in ('purchasing','store','admin') then raise exception 'ไม่มีสิทธิ์แก้ไขใบขอซื้อ'; end if;
  select * into v_pr from purchase_requisitions where id = p_pr_id for update;
  if not found then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if v_pr.status = 'cancelled' then raise exception 'ใบขอซื้อที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
  if p_project_id is null then raise exception 'กรุณาเลือกโครงการ'; end if;
  if v_pr.status = 'ordered' and p_project_id <> v_pr.project_id then
    raise exception 'เปลี่ยนโครงการไม่ได้ เพราะออกใบสั่งซื้อแล้ว';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  v_old := _pr_snapshot(p_pr_id);
  update purchase_requisitions set project_id = p_project_id, notes = p_notes,
    updated_by = auth.uid(), updated_at = now() where id = p_pr_id;
  delete from purchase_requisition_items where pr_id = p_pr_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'item_name'), '') = '' then raise exception 'ชื่อรายการห้ามว่าง'; end if;
    insert into purchase_requisition_items (pr_id, item_name, quantity, unit, estimated_price)
    values (p_pr_id, trim(v_item->>'item_name'), (v_item->>'quantity')::numeric,
            nullif(trim(coalesce(v_item->>'unit','')), ''), coalesce((v_item->>'estimated_price')::numeric, 0));
  end loop;
  insert into purchase_audit_log (doc_type, doc_id, doc_no, action, old_data, new_data)
  values ('PR', p_pr_id, v_pr.pr_no, 'update', v_old, _pr_snapshot(p_pr_id));
end $$;


ALTER FUNCTION "public"."update_purchase_requisition"("p_pr_id" "uuid", "p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts_payable" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ap_no" "text" NOT NULL,
    "po_id" "uuid",
    "vendor_id" "uuid",
    "vendor_name" "text" NOT NULL,
    "invoice_no" "text",
    "invoice_date" "date",
    "due_date" "date" NOT NULL,
    "total_debt" numeric(15,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "remaining_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "payment_method" "text" DEFAULT 'โอนเงิน'::"text",
    "alert_level" "text" DEFAULT 'normal'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "credit_days" integer DEFAULT 30,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accounts_payable" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "emp_id" "uuid",
    "emp_name" "text" NOT NULL,
    "work_date" "date" NOT NULL,
    "check_in_time" "text",
    "check_out_time" "text",
    "gps_location" "text",
    "ot_hours" numeric(5,2) DEFAULT 0,
    "status" "text" DEFAULT 'normal'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boq_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boq_id" "uuid" NOT NULL,
    "category" "text" DEFAULT 'แผงโซล่าเซลล์'::"text" NOT NULL,
    "item_code" "text",
    "item_name" "text" NOT NULL,
    "description" "text",
    "quantity" numeric(12,2) DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'ชุด'::"text",
    "material_unit_cost" numeric(15,2) DEFAULT 0,
    "labor_unit_cost" numeric(15,2) DEFAULT 0,
    "total_material_cost" numeric(15,2) DEFAULT 0,
    "total_labor_cost" numeric(15,2) DEFAULT 0,
    "total_amount" numeric(15,2) DEFAULT 0,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."boq_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boq_no" "text" NOT NULL,
    "title" "text" NOT NULL,
    "project_id" "uuid",
    "customer_name" "text",
    "system_size_kwp" numeric(10,2) DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_material_cost" numeric(15,2) DEFAULT 0,
    "total_labor_cost" numeric(15,2) DEFAULT 0,
    "total_cost" numeric(15,2) DEFAULT 0,
    "markup_percent" numeric(5,2) DEFAULT 15.00,
    "markup_amount" numeric(15,2) DEFAULT 0,
    "grand_total" numeric(15,2) DEFAULT 0,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."boqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_code" "text" NOT NULL,
    "account_name" "text",
    "account_type" "text",
    "account_name_th" "text",
    "account_name_en" "text",
    "account_category" "text",
    "is_system_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_code" "text" NOT NULL,
    "asset_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "serial_no" "text",
    "assigned_to" "text",
    "purchase_date" "date",
    "purchase_cost" numeric(15,2),
    "status" "text" DEFAULT 'in_use'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" DEFAULT 'document'::"text",
    "file_size" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "bank_name" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "branch_name" "text",
    "account_type" "text" DEFAULT 'savings'::"text",
    "qr_code_url" "text",
    "is_international" boolean DEFAULT false,
    "swift_code" "text",
    "bank_address" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_code" "text" NOT NULL,
    "contact_type" "text" DEFAULT 'both'::"text" NOT NULL,
    "company_name" "text" NOT NULL,
    "branch_code" "text" DEFAULT '00000'::"text",
    "tax_id" "text",
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bank_name" "text",
    "bank_account_no" "text",
    "bank_account_name" "text",
    "promptpay_no" "text",
    "entity_type" "text" DEFAULT 'corporate'::"text",
    "is_customer" boolean DEFAULT false,
    "is_vendor" boolean DEFAULT false,
    "business_name" "text",
    "branch_type" "text" DEFAULT 'head_office'::"text",
    "location_type" "text" DEFAULT 'thailand'::"text",
    "registered_address" "text",
    "postal_code" "text",
    "shipping_address" "text",
    "office_phone" "text",
    "fax" "text",
    "website" "text",
    "contact_person_name" "text",
    "contact_person_email" "text",
    "contact_person_mobile" "text",
    "credit_days" integer DEFAULT 30,
    "notes" "text",
    CONSTRAINT "contacts_contact_type_check" CHECK (("contact_type" = ANY (ARRAY['customer'::"text", 'vendor'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_code" "text",
    "customer_name" "text" NOT NULL,
    "tax_id" "text",
    "branch_type" "text" DEFAULT 'head_office'::"text",
    "branch_no" "text" DEFAULT '00000'::"text",
    "address" "text",
    "postal_code" "text",
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "company_name" "text",
    "contact_name" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doc_sequences" (
    "prefix" "text" NOT NULL,
    "doc_year" integer NOT NULL,
    "last_no" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."doc_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "emp_code" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "department" "text" NOT NULL,
    "position" "text" NOT NULL,
    "salary" numeric(15,2) DEFAULT 0,
    "phone" "text",
    "start_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_no" "text" NOT NULL,
    "vendor_id" "uuid",
    "contact_id" "uuid",
    "project_id" "uuid",
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "expense_category" "text" DEFAULT 'งานก่อสร้างและดำเนินงาน'::"text",
    "account_code" "text" DEFAULT '5110-01'::"text",
    "description" "text" NOT NULL,
    "payment_method" "text" DEFAULT 'โอนเงิน'::"text",
    "subtotal" numeric(15,2) DEFAULT 0 NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 7.00,
    "vat_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "wht_rate" numeric(5,2) DEFAULT 0,
    "wht_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "vendor_tax_invoice_no" "text",
    "tax_invoice_date" "date",
    "is_asset" boolean DEFAULT false,
    "accounting_status" "text" DEFAULT 'รอดำเนินการ'::"text",
    "status" "text" DEFAULT 'รอดำเนินการ'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_source" "text" DEFAULT 'company_bank'::"text",
    "company_bank_account" "text" DEFAULT '1110-02'::"text",
    "advance_payer_type" "text",
    "advance_payer_name" "text",
    "reimbursement_status" "text" DEFAULT 'none'::"text",
    "reimbursement_date" "date",
    "reimbursement_payment_id" "uuid",
    CONSTRAINT "expenses_accounting_status_check" CHECK (("accounting_status" = ANY (ARRAY['รอดำเนินการ'::"text", 'อนุมัติแล้ว'::"text", 'ยกเลิก'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_card_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slip_no" "text" NOT NULL,
    "vehicle_plate" "text" NOT NULL,
    "driver_name" "text" NOT NULL,
    "project_id" "uuid",
    "transaction_date" "date" NOT NULL,
    "fuel_type" "text" DEFAULT 'ดีเซล B7'::"text",
    "liters" numeric(10,2),
    "amount" numeric(15,2) NOT NULL,
    "station_name" "text" DEFAULT 'ปตท. แก่งคอย'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "card_holder" "text"
);


ALTER TABLE "public"."fleet_card_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goods_receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grn_id" "uuid" NOT NULL,
    "po_item_id" "uuid" NOT NULL,
    "qty_received" numeric(12,2) NOT NULL,
    "unit_cost" numeric(15,2) DEFAULT 0
);


ALTER TABLE "public"."goods_receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goods_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grn_no" "text" NOT NULL,
    "po_id" "uuid" NOT NULL,
    "received_date" "date" NOT NULL,
    "received_by" "uuid",
    "journal_entry_id" "uuid",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."goods_receipts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inventory_item_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inventory_item_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_code" "text" DEFAULT ('ITM-'::"text" || "lpad"(("nextval"('"public"."inventory_item_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "item_name" "text" NOT NULL,
    "unit" "text",
    "reorder_point" numeric(12,2) DEFAULT 0,
    "category_id" "uuid",
    "qty_on_hand" numeric(12,2) DEFAULT 0 NOT NULL,
    "avg_unit_cost" numeric(15,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone,
    "image_url" "text"
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "qty_on_hand" numeric(12,2) DEFAULT 0 NOT NULL,
    "avg_unit_cost" numeric(15,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."inventory_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "code_prefix" "text"
);


ALTER TABLE "public"."item_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_no" "text" NOT NULL,
    "entry_date" "date" NOT NULL,
    "description" "text",
    "project_id" "uuid",
    "source_module" "text" DEFAULT 'manual'::"text",
    "source_ref" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accounting_status" "text" DEFAULT 'รอดำเนินการ'::"text",
    "reference_type" "text" DEFAULT 'MANUAL'::"text",
    "reference_id" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "journal_entries_source_module_check" CHECK (("source_module" = ANY (ARRAY['manual'::"text", 'purchasing'::"text", 'store'::"text", 'hr'::"text"])))
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entry_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journal_entry_id" "uuid",
    "account_id" "uuid",
    "debit" numeric(15,2) DEFAULT 0,
    "credit" numeric(15,2) DEFAULT 0,
    "contact_id" "uuid",
    "line_description" "text",
    "line_desc" "text",
    CONSTRAINT "journal_entry_lines_one_side_positive" CHECK (((("debit" > (0)::numeric) AND ("credit" = (0)::numeric)) OR (("credit" > (0)::numeric) AND ("debit" = (0)::numeric))))
);


ALTER TABLE "public"."journal_entry_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "emp_id" "uuid",
    "emp_name" "text" NOT NULL,
    "leave_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "days" numeric(4,1) DEFAULT 1,
    "reason" "text",
    "status" "text" DEFAULT 'approved'::"text",
    "approver" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leave_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_no" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "document_id" "uuid",
    "document_no" "text" NOT NULL,
    "contact_id" "uuid",
    "vendor_id" "uuid",
    "project_id" "uuid",
    "payment_stage" "text" DEFAULT 'full'::"text" NOT NULL,
    "payment_channel" "text" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount_paid" numeric(15,2) DEFAULT 0 NOT NULL,
    "transfer_fee" numeric(10,2) DEFAULT 0,
    "vendor_bank_name" "text",
    "vendor_bank_account" "text",
    "vendor_promptpay_no" "text",
    "company_bank_code" "text",
    "company_bank_name" "text",
    "company_bank_account" "text",
    "slip_reference_no" "text",
    "cheque_no" "text",
    "cheque_bank" "text",
    "cheque_date" "date",
    "cheque_payee_name" "text",
    "cash_voucher_no" "text",
    "cash_source_account" "text",
    "journal_entry_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'store'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text", 'hr'::"text", 'management'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_budget_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "budgeted_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "item_code" "text",
    "item_name" "text",
    "quantity" numeric(12,2) DEFAULT 1,
    "unit" "text" DEFAULT 'รายการ'::"text",
    "unit_cost" numeric(15,2) DEFAULT 0,
    "actual_spent" numeric(15,2) DEFAULT 0,
    "po_ref" "text",
    CONSTRAINT "project_budget_items_budgeted_amount_check" CHECK (("budgeted_amount" >= (0)::numeric))
);


ALTER TABLE "public"."project_budget_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_code" "text" NOT NULL,
    "project_name" "text" NOT NULL,
    "client_name" "text",
    "site_address" "text",
    "budget_total" numeric(15,2) DEFAULT 0,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'planning'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_name" "text",
    "contract_amount" numeric(15,2) DEFAULT 0,
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'in_progress'::"text", 'on_hold'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_type" "text" NOT NULL,
    "doc_id" "uuid" NOT NULL,
    "doc_no" "text",
    "action" "text" NOT NULL,
    "reason" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changed_by" "uuid" DEFAULT "auth"."uid"(),
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_audit_log_action_check" CHECK (("action" = ANY (ARRAY['update'::"text", 'cancel'::"text", 'delete'::"text"]))),
    CONSTRAINT "purchase_audit_log_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['PR'::"text", 'PO'::"text"])))
);


ALTER TABLE "public"."purchase_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "item_name" "text" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "unit" "text",
    "unit_price" numeric(15,2) NOT NULL,
    "qty_received" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(15,2) DEFAULT 0,
    "pr_item_id" "uuid",
    CONSTRAINT "purchase_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "purchase_order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_no" "text" NOT NULL,
    "pr_id" "uuid",
    "project_id" "uuid",
    "vendor_id" "uuid" NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_amount" numeric(15,2) DEFAULT 0,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone,
    "buyer_name" "text",
    "payment_type" "text" DEFAULT 'credit_30'::"text",
    "payment_term_days" integer DEFAULT 30,
    "quotation_no" "text",
    "quotation_date" "date",
    "quotation_url" "text",
    "tax_type" "text" DEFAULT 'vat_included'::"text",
    "vat_rate" numeric(5,2) DEFAULT 7.00,
    "vat_amount" numeric(15,2) DEFAULT 0,
    "wht_rate" numeric(5,2) DEFAULT 0.00,
    "wht_amount" numeric(15,2) DEFAULT 0,
    "net_amount" numeric(15,2) DEFAULT 0,
    "deposit_type" "text" DEFAULT 'none'::"text",
    "deposit_percent" numeric(5,2) DEFAULT 0,
    "deposit_amount" numeric(15,2) DEFAULT 0,
    "remaining_amount" numeric(15,2) DEFAULT 0,
    "payment_channel_requested" "text" DEFAULT 'transfer'::"text",
    "payment_status" "text" DEFAULT 'รอชำระเงิน'::"text",
    "deposit_paid_amount" numeric(15,2) DEFAULT 0,
    "vendor_tax_invoice_no" "text",
    "tax_invoice_date" "date",
    "subtotal" numeric(15,2) DEFAULT 0,
    "expected_delivery_date" "date",
    "delivery_address" "text",
    "notes" "text",
    "customer_name" "text",
    "custom_project_name" "text",
    "custom_vendor_name" "text",
    "grand_total" numeric(15,2) DEFAULT 0,
    "has_deposit" boolean DEFAULT false,
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'partial'::"text", 'received'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."purchase_orders"."expected_delivery_date" IS 'วันที่กำหนดส่งมอบสินค้า / วันครบกำหนดส่งของ';



COMMENT ON COLUMN "public"."purchase_orders"."delivery_address" IS 'สถานที่ส่งมอบสินค้าหรือที่อยู่หน้างาน';



COMMENT ON COLUMN "public"."purchase_orders"."notes" IS 'หมายเหตุใบสั่งซื้อ';



CREATE TABLE IF NOT EXISTS "public"."purchase_requisition_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pr_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "unit" "text",
    "estimated_price" numeric(15,2) DEFAULT 0,
    CONSTRAINT "purchase_requisition_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."purchase_requisition_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_requisitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pr_no" "text" NOT NULL,
    "project_id" "uuid",
    "requested_by" "uuid",
    "request_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone,
    "customer_name" "text",
    "custom_project_name" "text",
    "suggested_vendor" "text",
    CONSTRAINT "purchase_requisitions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ordered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."purchase_requisitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "item_name" "text" NOT NULL,
    "description" "text",
    "quantity" numeric(12,2) NOT NULL,
    "unit" "text",
    "unit_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0,
    "total_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "base_cost" numeric(15,2) DEFAULT 0,
    "item_code" "text",
    CONSTRAINT "quotation_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."quotation_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_no" "text" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "validity_days" integer DEFAULT 30,
    "expiry_date" "date",
    "sales_person" "text",
    "currency" "text" DEFAULT 'THB'::"text",
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_address" "text",
    "customer_postal_code" "text",
    "customer_tax_id" "text",
    "customer_branch" "text" DEFAULT 'สำนักงานใหญ่'::"text",
    "project_id" "uuid",
    "ref_no" "text",
    "warehouse_name" "text" DEFAULT 'สโตร์หลัก'::"text",
    "subtotal" numeric(15,2) DEFAULT 0,
    "discount_amount" numeric(15,2) DEFAULT 0,
    "after_discount" numeric(15,2) DEFAULT 0,
    "vat_rate" numeric(5,2) DEFAULT 7.00,
    "vat_amount" numeric(15,2) DEFAULT 0,
    "wht_rate" numeric(5,2) DEFAULT 0.00,
    "wht_amount" numeric(15,2) DEFAULT 0,
    "grand_total" numeric(15,2) DEFAULT 0,
    "customer_notes" "text",
    "internal_notes" "text",
    "signature_url" "text",
    "attachment_url" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "quotation_date" "date" DEFAULT CURRENT_DATE,
    "total_amount" numeric(15,2) DEFAULT 0,
    "notes" "text",
    "accounting_status" "text" DEFAULT 'รอดำเนินการ'::"text",
    "customer_po_no" "text",
    "customer_po_date" "date",
    "customer_po_file_url" "text",
    "customer_signer_name" "text",
    "valid_until" "date",
    "tax_type" "text" DEFAULT 'vat_excluded'::"text",
    "boq_id" "uuid",
    "type" "text" DEFAULT 'project'::"text" NOT NULL,
    "markup_percent" numeric(6,2) DEFAULT 0 NOT NULL,
    "discount_mode" "text" DEFAULT 'none'::"text" NOT NULL,
    "header_discount_type" "text" DEFAULT 'amount'::"text" NOT NULL,
    "header_discount_value" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_cost" numeric(15,2) DEFAULT 0,
    "issued_by" "uuid",
    "issued_by_name" "text",
    "issued_at" timestamp with time zone,
    CONSTRAINT "quotations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "quotations_type_check" CHECK (("type" = ANY (ARRAY['project'::"text", 'product'::"text"]))),
    CONSTRAINT "quotations_markup_percent_check" CHECK (("markup_percent" >= (0)::numeric)),
    CONSTRAINT "quotations_discount_mode_check" CHECK (("discount_mode" = ANY (ARRAY['none'::"text", 'whole_bill'::"text", 'per_item'::"text"]))),
    CONSTRAINT "quotations_header_discount_type_check" CHECK (("header_discount_type" = ANY (ARRAY['amount'::"text", 'percent'::"text"]))),
    CONSTRAINT "quotations_header_discount_value_check" CHECK (("header_discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retention_guarantees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "retention_no" "text" NOT NULL,
    "contractor_name" "text" NOT NULL,
    "trade_type" "text" NOT NULL,
    "project_id" "uuid",
    "contract_amount" numeric(15,2) NOT NULL,
    "retention_rate" numeric(5,2) DEFAULT 5.00,
    "retention_amount" numeric(15,2) NOT NULL,
    "release_date" "date" NOT NULL,
    "status" "text" DEFAULT 'held'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customer_name" "text",
    "percentage" numeric(5,2) DEFAULT 5.00,
    "warranty_period_months" integer DEFAULT 12
);


ALTER TABLE "public"."retention_guarantees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_no" "text" NOT NULL,
    "quotation_id" "uuid",
    "customer_id" "uuid",
    "contact_id" "uuid",
    "project_id" "uuid",
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date" DEFAULT (CURRENT_DATE + '30 days'::interval) NOT NULL,
    "currency" "text" DEFAULT 'THB'::"text",
    "subtotal" numeric(15,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(15,2) DEFAULT 0,
    "vat_rate" numeric(5,2) DEFAULT 7.00,
    "vat_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "wht_rate" numeric(5,2) DEFAULT 0,
    "wht_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(15,2) DEFAULT 0,
    "remaining_amount" numeric(15,2) DEFAULT 0,
    "is_opening_balance" boolean DEFAULT false,
    "status" "text" DEFAULT 'ฉบับร่าง'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "adj_no" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "source_project_id" "uuid",
    "qty_before" numeric(12,2) NOT NULL,
    "qty_after" numeric(12,2) NOT NULL,
    "unit_cost" numeric(15,2) NOT NULL,
    "reason" "text" NOT NULL,
    "journal_entry_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_issue_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "unit_cost" numeric(15,2) NOT NULL,
    CONSTRAINT "stock_issue_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."stock_issue_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_no" "text" NOT NULL,
    "project_id" "uuid",
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "issued_by" "uuid",
    "journal_entry_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "issue_target" "text" DEFAULT 'project'::"text",
    "issue_reason" "text" DEFAULT 'ตัดวัสดุไปใช้'::"text",
    "target_location" "text"
);


ALTER TABLE "public"."stock_issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "source_project_id" "uuid",
    "grn_item_id" "uuid",
    "lot_type" "text" DEFAULT 'receipt'::"text",
    "received_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "qty_received" numeric(12,2) NOT NULL,
    "qty_remaining" numeric(12,2) NOT NULL,
    "unit_cost" numeric(15,2) NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_lots_lot_type_check" CHECK (("lot_type" = ANY (ARRAY['receipt'::"text", 'adjustment'::"text", 'migration'::"text"]))),
    CONSTRAINT "stock_lots_qty_received_check" CHECK (("qty_received" > (0)::numeric)),
    CONSTRAINT "stock_lots_qty_remaining_check" CHECK (("qty_remaining" >= (0)::numeric))
);


ALTER TABLE "public"."stock_lots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tax_type" "text" NOT NULL,
    "tax_month" integer NOT NULL,
    "tax_year" integer NOT NULL,
    "document_date" "date" NOT NULL,
    "document_no" "text" NOT NULL,
    "vendor_tax_invoice_no" "text",
    "contact_id" "uuid",
    "project_id" "uuid",
    "base_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "wht_rate" numeric(5,2) DEFAULT 0,
    "wht_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'รอยื่นภาษี'::"text" NOT NULL,
    "journal_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tax_records_tax_month_check" CHECK ((("tax_month" >= 1) AND ("tax_month" <= 12))),
    CONSTRAINT "tax_records_tax_year_check" CHECK (("tax_year" >= 2000))
);


ALTER TABLE "public"."tax_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_code" "text" NOT NULL,
    "vendor_name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "tax_id" "text",
    "address" "text",
    "bank_name" "text",
    "bank_account_no" "text",
    "bank_account_name" "text",
    "promptpay_no" "text",
    "email" "text",
    "contact_name" "text",
    "payment_terms" "text" DEFAULT 'credit_30'::"text",
    "notes" "text",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_general_ledger" AS
 SELECT "je"."id" AS "journal_entry_id",
    "je"."entry_no",
    "je"."entry_date",
    "je"."reference_type",
    "je"."reference_id",
    "je"."accounting_status",
    "je"."project_id",
    "p"."project_code",
    "p"."project_name",
    "coa"."account_code",
    COALESCE("coa"."account_name_th", "coa"."account_name") AS "account_name_th",
    COALESCE("coa"."account_category", "initcap"("coa"."account_type")) AS "account_category",
    "jel"."id" AS "line_id",
    "jel"."debit",
    "jel"."credit",
    COALESCE("jel"."line_description", "jel"."line_desc") AS "line_description",
    "c"."company_name" AS "contact_name"
   FROM (((("public"."journal_entries" "je"
     JOIN "public"."journal_entry_lines" "jel" ON (("jel"."journal_entry_id" = "je"."id")))
     JOIN "public"."chart_of_accounts" "coa" ON (("coa"."id" = "jel"."account_id")))
     LEFT JOIN "public"."projects" "p" ON (("p"."id" = "je"."project_id")))
     LEFT JOIN "public"."contacts" "c" ON (("c"."id" = "jel"."contact_id")));


ALTER VIEW "public"."view_general_ledger" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_trial_balance" AS
 SELECT "coa"."id" AS "account_id",
    "coa"."account_code",
    COALESCE("coa"."account_name_th", "coa"."account_name") AS "account_name_th",
    COALESCE("coa"."account_category", "initcap"("coa"."account_type")) AS "account_category",
    COALESCE("sum"("jel"."debit"), (0)::numeric) AS "total_debit",
    COALESCE("sum"("jel"."credit"), (0)::numeric) AS "total_credit",
        CASE
            WHEN (COALESCE("coa"."account_category", "initcap"("coa"."account_type")) = ANY (ARRAY['Asset'::"text", 'Expense'::"text"])) THEN COALESCE("sum"(("jel"."debit" - "jel"."credit")), (0)::numeric)
            ELSE COALESCE("sum"(("jel"."credit" - "jel"."debit")), (0)::numeric)
        END AS "net_balance"
   FROM (("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."journal_entry_lines" "jel" ON (("jel"."account_id" = "coa"."id")))
     LEFT JOIN "public"."journal_entries" "je" ON ((("je"."id" = "jel"."journal_entry_id") AND ("je"."accounting_status" = 'อนุมัติแล้ว'::"text"))))
  WHERE (COALESCE("coa"."is_active", true) = true)
  GROUP BY "coa"."id", "coa"."account_code", "coa"."account_name_th", "coa"."account_name", "coa"."account_category", "coa"."account_type"
  ORDER BY "coa"."account_code";


ALTER VIEW "public"."view_trial_balance" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts_payable"
    ADD CONSTRAINT "accounts_payable_ap_no_key" UNIQUE ("ap_no");



ALTER TABLE ONLY "public"."accounts_payable"
    ADD CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boq_items"
    ADD CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boqs"
    ADD CONSTRAINT "boqs_boq_no_key" UNIQUE ("boq_no");



ALTER TABLE ONLY "public"."boqs"
    ADD CONSTRAINT "boqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_account_code_key" UNIQUE ("account_code");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_asset_code_key" UNIQUE ("asset_code");



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_attachments"
    ADD CONSTRAINT "contact_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "contact_bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_contact_code_key" UNIQUE ("contact_code");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_customer_code_key" UNIQUE ("customer_code");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doc_sequences"
    ADD CONSTRAINT "doc_sequences_pkey" PRIMARY KEY ("prefix", "doc_year");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_emp_code_key" UNIQUE ("emp_code");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_expense_no_key" UNIQUE ("expense_no");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_card_expenses"
    ADD CONSTRAINT "fleet_card_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_card_expenses"
    ADD CONSTRAINT "fleet_card_expenses_slip_no_key" UNIQUE ("slip_no");



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_grn_no_key" UNIQUE ("grn_no");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_item_code_key" UNIQUE ("item_code");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_stock"
    ADD CONSTRAINT "inventory_stock_item_id_project_id_key" UNIQUE ("item_id", "project_id");



ALTER TABLE ONLY "public"."inventory_stock"
    ADD CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_categories"
    ADD CONSTRAINT "item_categories_code_prefix_key" UNIQUE ("code_prefix");



ALTER TABLE ONLY "public"."item_categories"
    ADD CONSTRAINT "item_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."item_categories"
    ADD CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_entry_no_key" UNIQUE ("entry_no");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_transaction_no_key" UNIQUE ("transaction_no");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_budget_items"
    ADD CONSTRAINT "project_budget_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_code_key" UNIQUE ("project_code");



ALTER TABLE ONLY "public"."purchase_audit_log"
    ADD CONSTRAINT "purchase_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_no_key" UNIQUE ("po_no");



ALTER TABLE ONLY "public"."purchase_requisition_items"
    ADD CONSTRAINT "purchase_requisition_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_pr_no_key" UNIQUE ("pr_no");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_quotation_no_key" UNIQUE ("quotation_no");



ALTER TABLE ONLY "public"."retention_guarantees"
    ADD CONSTRAINT "retention_guarantees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retention_guarantees"
    ADD CONSTRAINT "retention_guarantees_retention_no_key" UNIQUE ("retention_no");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_invoice_no_key" UNIQUE ("invoice_no");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_adj_no_key" UNIQUE ("adj_no");



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_issue_items"
    ADD CONSTRAINT "stock_issue_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_issues"
    ADD CONSTRAINT "stock_issues_issue_no_key" UNIQUE ("issue_no");



ALTER TABLE ONLY "public"."stock_issues"
    ADD CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_lots"
    ADD CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_records"
    ADD CONSTRAINT "tax_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_vendor_code_key" UNIQUE ("vendor_code");



CREATE INDEX "goods_receipts_po_id_idx" ON "public"."goods_receipts" USING "btree" ("po_id");



CREATE INDEX "idx_journal_entries_date" ON "public"."journal_entries" USING "btree" ("entry_date" DESC);



CREATE INDEX "idx_journal_entries_ref" ON "public"."journal_entries" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_journal_entries_status" ON "public"."journal_entries" USING "btree" ("accounting_status");



CREATE INDEX "idx_journal_lines_account" ON "public"."journal_entry_lines" USING "btree" ("account_id");



CREATE INDEX "idx_journal_lines_contact" ON "public"."journal_entry_lines" USING "btree" ("contact_id");



CREATE INDEX "idx_journal_lines_entry" ON "public"."journal_entry_lines" USING "btree" ("journal_entry_id");



CREATE INDEX "idx_tax_records_doc" ON "public"."tax_records" USING "btree" ("document_no");



CREATE INDEX "idx_tax_records_period" ON "public"."tax_records" USING "btree" ("tax_year", "tax_month", "tax_type");



CREATE UNIQUE INDEX "inventory_items_name_unique" ON "public"."inventory_items" USING "btree" ("lower"("item_name"));



CREATE INDEX "project_budget_items_project_id_idx" ON "public"."project_budget_items" USING "btree" ("project_id");



CREATE INDEX "purchase_audit_log_doc_id_changed_at_idx" ON "public"."purchase_audit_log" USING "btree" ("doc_id", "changed_at" DESC);



CREATE INDEX "purchase_order_items_po_id_idx" ON "public"."purchase_order_items" USING "btree" ("po_id");



CREATE INDEX "purchase_requisition_items_pr_id_idx" ON "public"."purchase_requisition_items" USING "btree" ("pr_id");



CREATE INDEX "idx_quotations_type" ON "public"."quotations" USING "btree" ("type");



CREATE INDEX "stock_issue_items_issue_id_idx" ON "public"."stock_issue_items" USING "btree" ("issue_id");



CREATE INDEX "stock_lots_item_id_received_date_created_at_idx" ON "public"."stock_lots" USING "btree" ("item_id", "received_date", "created_at") WHERE ("qty_remaining" > (0)::numeric);



CREATE OR REPLACE TRIGGER "inventory_items_stamp" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_item_update"();



CREATE OR REPLACE TRIGGER "trg_prevent_approved_lines_mod" BEFORE DELETE OR UPDATE ON "public"."journal_entry_lines" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_modifying_approved_journal_lines"();



CREATE OR REPLACE TRIGGER "trg_verify_journal_balance" BEFORE UPDATE OF "accounting_status" ON "public"."journal_entries" FOR EACH ROW EXECUTE FUNCTION "public"."check_journal_entry_balance"();



ALTER TABLE ONLY "public"."accounts_payable"
    ADD CONSTRAINT "accounts_payable_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounts_payable"
    ADD CONSTRAINT "accounts_payable_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boq_items"
    ADD CONSTRAINT "boq_items_boq_id_fkey" FOREIGN KEY ("boq_id") REFERENCES "public"."boqs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boqs"
    ADD CONSTRAINT "boqs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_attachments"
    ADD CONSTRAINT "contact_attachments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "contact_bank_accounts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_card_expenses"
    ADD CONSTRAINT "fleet_card_expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory_stock"
    ADD CONSTRAINT "inventory_stock_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_stock"
    ADD CONSTRAINT "inventory_stock_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_budget_items"
    ADD CONSTRAINT "project_budget_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_audit_log"
    ADD CONSTRAINT "purchase_audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requisitions"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."purchase_requisition_items"
    ADD CONSTRAINT "purchase_requisition_items_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retention_guarantees"
    ADD CONSTRAINT "retention_guarantees_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."stock_adjustments"
    ADD CONSTRAINT "stock_adjustments_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."stock_issue_items"
    ADD CONSTRAINT "stock_issue_items_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."stock_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_issue_items"
    ADD CONSTRAINT "stock_issue_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."stock_issues"
    ADD CONSTRAINT "stock_issues_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_issues"
    ADD CONSTRAINT "stock_issues_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."stock_issues"
    ADD CONSTRAINT "stock_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."stock_lots"
    ADD CONSTRAINT "stock_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_lots"
    ADD CONSTRAINT "stock_lots_grn_item_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "public"."goods_receipt_items"("id");



ALTER TABLE ONLY "public"."stock_lots"
    ADD CONSTRAINT "stock_lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."stock_lots"
    ADD CONSTRAINT "stock_lots_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."tax_records"
    ADD CONSTRAINT "tax_records_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tax_records"
    ADD CONSTRAINT "tax_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE "public"."accounts_payable" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_payable_allow_all" ON "public"."accounts_payable" USING (true) WITH CHECK (true);



CREATE POLICY "admin_manage_profiles" ON "public"."profiles" USING (("public"."get_my_role"() = 'admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "allow_all_goods_receipt_items" ON "public"."goods_receipt_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_goods_receipts" ON "public"."goods_receipts" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_inventory_items" ON "public"."inventory_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_inventory_stock" ON "public"."inventory_stock" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_item_categories" ON "public"."item_categories" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_payment_transactions" ON "public"."payment_transactions" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_purchase_order_items" ON "public"."purchase_order_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_purchase_orders" ON "public"."purchase_orders" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_purchase_requisition_items" ON "public"."purchase_requisition_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_purchase_requisitions" ON "public"."purchase_requisitions" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_quotation_items" ON "public"."quotation_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_quotations" ON "public"."quotations" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_stock_adjustments" ON "public"."stock_adjustments" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_stock_issue_items" ON "public"."stock_issue_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_stock_issues" ON "public"."stock_issues" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_stock_lots" ON "public"."stock_lots" USING (true) WITH CHECK (true);



ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_records_allow_all" ON "public"."attendance_records" USING (true) WITH CHECK (true);



ALTER TABLE "public"."boq_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chart_of_accounts_allow_all" ON "public"."chart_of_accounts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."company_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_assets_allow_all" ON "public"."company_assets" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contact_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_bank_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_allow_all" ON "public"."contacts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_allow_all" ON "public"."customers" USING (true) WITH CHECK (true);



ALTER TABLE "public"."doc_sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_sequences_allow_all" ON "public"."doc_sequences" USING (true) WITH CHECK (true);



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_allow_all" ON "public"."employees" USING (true) WITH CHECK (true);



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_allow_all" ON "public"."expenses" USING (true) WITH CHECK (true);



ALTER TABLE "public"."fleet_card_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_card_expenses_allow_all" ON "public"."fleet_card_expenses" USING (true) WITH CHECK (true);



ALTER TABLE "public"."goods_receipt_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goods_receipt_items_allow_all" ON "public"."goods_receipt_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."goods_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goods_receipts_allow_all" ON "public"."goods_receipts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_allow_all" ON "public"."inventory_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_stock_allow_all" ON "public"."inventory_stock" USING (true) WITH CHECK (true);



ALTER TABLE "public"."item_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_categories_allow_all" ON "public"."item_categories" USING (true) WITH CHECK (true);



ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journal_entries_allow_all" ON "public"."journal_entries" USING (true) WITH CHECK (true);



ALTER TABLE "public"."journal_entry_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journal_entry_lines_allow_all" ON "public"."journal_entry_lines" USING (true) WITH CHECK (true);



ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leave_requests_allow_all" ON "public"."leave_requests" USING (true) WITH CHECK (true);



ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_transactions_allow_all" ON "public"."payment_transactions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_allow_all" ON "public"."profiles" USING (true) WITH CHECK (true);



ALTER TABLE "public"."project_budget_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_budget_items_allow_all" ON "public"."project_budget_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_allow_all" ON "public"."projects" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_audit_log_allow_all" ON "public"."purchase_audit_log" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_order_items_allow_all" ON "public"."purchase_order_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_orders_allow_all" ON "public"."purchase_orders" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_requisition_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_requisition_items_allow_all" ON "public"."purchase_requisition_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_requisitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_requisitions_allow_all" ON "public"."purchase_requisitions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."quotation_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_items_allow_all" ON "public"."quotation_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotations_allow_all" ON "public"."quotations" USING (true) WITH CHECK (true);



CREATE POLICY "read_adjustments" ON "public"."stock_adjustments" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text", 'purchasing'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_ap" ON "public"."accounts_payable" FOR SELECT USING (true);



CREATE POLICY "read_assets" ON "public"."company_assets" FOR SELECT USING (true);



CREATE POLICY "read_attendance" ON "public"."attendance_records" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_audit" ON "public"."purchase_audit_log" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_budget_items" ON "public"."project_budget_items" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_categories" ON "public"."item_categories" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_coa" ON "public"."chart_of_accounts" FOR SELECT USING (true);



CREATE POLICY "read_contact_attachments" ON "public"."contact_attachments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_contact_bank_accounts" ON "public"."contact_bank_accounts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_contacts" ON "public"."contacts" FOR SELECT USING (true);



CREATE POLICY "read_contacts_authenticated" ON "public"."contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_customers" ON "public"."customers" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_employees" ON "public"."employees" FOR SELECT USING (true);



CREATE POLICY "read_expenses" ON "public"."expenses" FOR SELECT USING (true);



CREATE POLICY "read_fleet" ON "public"."fleet_card_expenses" FOR SELECT USING (true);



CREATE POLICY "read_grn" ON "public"."goods_receipts" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_grn_items" ON "public"."goods_receipt_items" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_issue_items" ON "public"."stock_issue_items" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text", 'purchasing'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_issues" ON "public"."stock_issues" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text", 'purchasing'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_journal" ON "public"."journal_entries" FOR SELECT USING (true);



CREATE POLICY "read_journal_lines" ON "public"."journal_entry_lines" FOR SELECT USING (true);



CREATE POLICY "read_leaves" ON "public"."leave_requests" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_lots" ON "public"."stock_lots" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text", 'purchasing'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_own_profile" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "read_po" ON "public"."purchase_orders" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_po_items" ON "public"."purchase_order_items" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_pr" ON "public"."purchase_requisitions" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_pr_items" ON "public"."purchase_requisition_items" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



CREATE POLICY "read_profile_names" ON "public"."profiles" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_projects" ON "public"."projects" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_quotation_items" ON "public"."quotation_items" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_quotations" ON "public"."quotations" FOR SELECT USING (("public"."get_my_role"() IS NOT NULL));



CREATE POLICY "read_retention" ON "public"."retention_guarantees" FOR SELECT USING (true);



CREATE POLICY "read_sales_inv" ON "public"."sales_invoices" FOR SELECT USING (true);



CREATE POLICY "read_tax" ON "public"."tax_records" FOR SELECT USING (true);



CREATE POLICY "read_vendors" ON "public"."vendors" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text", 'store'::"text", 'management'::"text", 'accounting'::"text"])));



ALTER TABLE "public"."retention_guarantees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retention_guarantees_allow_all" ON "public"."retention_guarantees" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sales_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_invoices_allow_all" ON "public"."sales_invoices" USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_adjustments_allow_all" ON "public"."stock_adjustments" USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_issue_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_issue_items_allow_all" ON "public"."stock_issue_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_issues_allow_all" ON "public"."stock_issues" USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_lots_allow_all" ON "public"."stock_lots" USING (true) WITH CHECK (true);



ALTER TABLE "public"."tax_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_records_allow_all" ON "public"."tax_records" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_allow_all" ON "public"."vendors" USING (true) WITH CHECK (true);



CREATE POLICY "write_ap" ON "public"."accounts_payable" USING (true) WITH CHECK (true);



CREATE POLICY "write_assets" ON "public"."company_assets" USING (true) WITH CHECK (true);



CREATE POLICY "write_attendance" ON "public"."attendance_records" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'hr'::"text", 'management'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'hr'::"text", 'management'::"text"])));



CREATE POLICY "write_budget_items" ON "public"."project_budget_items" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text"])));



CREATE POLICY "write_categories" ON "public"."item_categories" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'store'::"text"])));



CREATE POLICY "write_coa" ON "public"."chart_of_accounts" USING (true) WITH CHECK (true);



CREATE POLICY "write_contact_attachments" ON "public"."contact_attachments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "write_contact_bank_accounts" ON "public"."contact_bank_accounts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "write_contacts" ON "public"."contacts" USING (true) WITH CHECK (true);



CREATE POLICY "write_contacts_authenticated" ON "public"."contacts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "write_customers" ON "public"."customers" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"])));



CREATE POLICY "write_employees" ON "public"."employees" USING (true) WITH CHECK (true);



CREATE POLICY "write_expenses" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "write_fleet" ON "public"."fleet_card_expenses" USING (true) WITH CHECK (true);



CREATE POLICY "write_journal" ON "public"."journal_entries" USING (true) WITH CHECK (true);



CREATE POLICY "write_journal_lines" ON "public"."journal_entry_lines" USING (true) WITH CHECK (true);



CREATE POLICY "write_leaves" ON "public"."leave_requests" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'hr'::"text", 'management'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'hr'::"text", 'management'::"text"])));



CREATE POLICY "write_projects" ON "public"."projects" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text"])));



CREATE POLICY "write_quotation_items" ON "public"."quotation_items" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"])));



CREATE POLICY "write_quotations" ON "public"."quotations" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'management'::"text", 'accounting'::"text", 'purchasing'::"text", 'store'::"text"])));



CREATE POLICY "write_retention" ON "public"."retention_guarantees" USING (true) WITH CHECK (true);



CREATE POLICY "write_sales_inv" ON "public"."sales_invoices" USING (true) WITH CHECK (true);



CREATE POLICY "write_tax" ON "public"."tax_records" USING (true) WITH CHECK (true);



CREATE POLICY "write_vendors" ON "public"."vendors" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'purchasing'::"text"])));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."_consume_lots"("p_item_id" "uuid", "p_qty" numeric, "p_filter_source" boolean, "p_source" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."_consume_lots"("p_item_id" "uuid", "p_qty" numeric, "p_filter_source" boolean, "p_source" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_consume_lots"("p_item_id" "uuid", "p_qty" numeric, "p_filter_source" boolean, "p_source" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."_po_snapshot"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."_po_snapshot"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_po_snapshot"("p_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."_pr_snapshot"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."_pr_snapshot"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pr_snapshot"("p_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."adjust_stock"("p_item_id" "uuid", "p_source_project_id" "uuid", "p_new_qty" numeric, "p_unit_cost" numeric, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_item_id" "uuid", "p_source_project_id" "uuid", "p_new_qty" numeric, "p_unit_cost" numeric, "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_item_id" "uuid", "p_source_project_id" "uuid", "p_new_qty" numeric, "p_unit_cost" numeric, "p_reason" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."cancel_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."check_journal_entry_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_journal_entry_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_journal_entry_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_mock_store_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_mock_store_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_mock_store_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_goods_receipt"("p_po_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_goods_receipt"("p_po_id" "uuid", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."confirm_goods_receipt"("p_po_id" "uuid", "p_items" "jsonb") TO "anon";



GRANT ALL ON FUNCTION "public"."confirm_stock_issue"("p_project_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_issue_target" "text", "p_issue_reason" "text", "p_target_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_stock_issue"("p_project_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_issue_target" "text", "p_issue_reason" "text", "p_target_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_stock_issue"("p_project_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_issue_target" "text", "p_issue_reason" "text", "p_target_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_purchase_order"("p_pr_id" "uuid", "p_project_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_order"("p_pr_id" "uuid", "p_project_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_purchase_order"("p_pr_id" "uuid", "p_project_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "anon";



GRANT ALL ON FUNCTION "public"."create_purchase_requisition"("p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_requisition"("p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_purchase_requisition"("p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "anon";



GRANT ALL ON FUNCTION "public"."delete_inventory_item_cascade"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_inventory_item_cascade"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_inventory_item_cascade"("p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_purchase_order"("p_po_id" "uuid", "p_reason" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."delete_purchase_requisition"("p_pr_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_purchase_requisition"("p_pr_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_purchase_requisition"("p_pr_id" "uuid", "p_reason" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."generate_doc_no"("p_prefix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."generate_doc_no"("p_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_doc_no"("p_prefix" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."generate_item_code"("p_category_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."generate_item_code"("p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_item_code"("p_category_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."generate_journal_entry_no"("p_date" "date", "p_prefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_journal_entry_no"("p_date" "date", "p_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_journal_entry_no"("p_date" "date", "p_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_doc_no"("p_prefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."next_doc_no"("p_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_doc_no"("p_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_modifying_approved_journal_lines"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_modifying_approved_journal_lines"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_modifying_approved_journal_lines"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_item_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_item_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_item_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."store_add_item"("p_item_name" "text", "p_unit" "text", "p_category_id" "uuid", "p_reorder_point" numeric, "p_image_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."store_add_item"("p_item_name" "text", "p_unit" "text", "p_category_id" "uuid", "p_reorder_point" numeric, "p_image_url" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."store_add_item"("p_item_name" "text", "p_unit" "text", "p_category_id" "uuid", "p_reorder_point" numeric, "p_image_url" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."update_purchase_order"("p_po_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_purchase_order"("p_po_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_purchase_order"("p_po_id" "uuid", "p_vendor_id" "uuid", "p_items" "jsonb") TO "anon";



GRANT ALL ON FUNCTION "public"."update_purchase_requisition"("p_pr_id" "uuid", "p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_purchase_requisition"("p_pr_id" "uuid", "p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_purchase_requisition"("p_pr_id" "uuid", "p_project_id" "uuid", "p_notes" "text", "p_items" "jsonb") TO "anon";


















GRANT ALL ON TABLE "public"."accounts_payable" TO "anon";
GRANT ALL ON TABLE "public"."accounts_payable" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts_payable" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."boq_items" TO "anon";
GRANT ALL ON TABLE "public"."boq_items" TO "authenticated";
GRANT ALL ON TABLE "public"."boq_items" TO "service_role";



GRANT ALL ON TABLE "public"."boqs" TO "anon";
GRANT ALL ON TABLE "public"."boqs" TO "authenticated";
GRANT ALL ON TABLE "public"."boqs" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."company_assets" TO "anon";
GRANT ALL ON TABLE "public"."company_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."company_assets" TO "service_role";



GRANT ALL ON TABLE "public"."contact_attachments" TO "anon";
GRANT ALL ON TABLE "public"."contact_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."contact_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."contact_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."doc_sequences" TO "anon";
GRANT ALL ON TABLE "public"."doc_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."doc_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_card_expenses" TO "anon";
GRANT ALL ON TABLE "public"."fleet_card_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_card_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."goods_receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."goods_receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."goods_receipt_items" TO "service_role";
GRANT ALL ON TABLE "public"."goods_receipt_items" TO PUBLIC;



GRANT ALL ON TABLE "public"."goods_receipts" TO "anon";
GRANT ALL ON TABLE "public"."goods_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."goods_receipts" TO "service_role";
GRANT ALL ON TABLE "public"."goods_receipts" TO PUBLIC;



GRANT ALL ON SEQUENCE "public"."inventory_item_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_item_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_item_code_seq" TO "service_role";
GRANT ALL ON SEQUENCE "public"."inventory_item_code_seq" TO PUBLIC;



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";
GRANT ALL ON TABLE "public"."inventory_items" TO PUBLIC;



GRANT INSERT("item_name"),UPDATE("item_name") ON TABLE "public"."inventory_items" TO "authenticated";



GRANT INSERT("unit"),UPDATE("unit") ON TABLE "public"."inventory_items" TO "authenticated";



GRANT INSERT("reorder_point"),UPDATE("reorder_point") ON TABLE "public"."inventory_items" TO "authenticated";



GRANT INSERT("category_id"),UPDATE("category_id") ON TABLE "public"."inventory_items" TO "authenticated";



GRANT UPDATE("image_url") ON TABLE "public"."inventory_items" TO "authenticated";



GRANT ALL ON TABLE "public"."inventory_stock" TO "anon";
GRANT ALL ON TABLE "public"."inventory_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_stock" TO "service_role";
GRANT ALL ON TABLE "public"."inventory_stock" TO PUBLIC;



GRANT ALL ON TABLE "public"."item_categories" TO "anon";
GRANT ALL ON TABLE "public"."item_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."item_categories" TO "service_role";
GRANT ALL ON TABLE "public"."item_categories" TO PUBLIC;



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entry_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_budget_items" TO "anon";
GRANT ALL ON TABLE "public"."project_budget_items" TO "authenticated";
GRANT ALL ON TABLE "public"."project_budget_items" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."purchase_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";
GRANT ALL ON TABLE "public"."purchase_order_items" TO PUBLIC;



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";
GRANT ALL ON TABLE "public"."purchase_orders" TO PUBLIC;



GRANT ALL ON TABLE "public"."purchase_requisition_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_requisition_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_requisition_items" TO "service_role";
GRANT ALL ON TABLE "public"."purchase_requisition_items" TO PUBLIC;



GRANT ALL ON TABLE "public"."purchase_requisitions" TO "anon";
GRANT ALL ON TABLE "public"."purchase_requisitions" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_requisitions" TO "service_role";
GRANT ALL ON TABLE "public"."purchase_requisitions" TO PUBLIC;



GRANT ALL ON TABLE "public"."quotation_items" TO "anon";
GRANT ALL ON TABLE "public"."quotation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."retention_guarantees" TO "anon";
GRANT ALL ON TABLE "public"."retention_guarantees" TO "authenticated";
GRANT ALL ON TABLE "public"."retention_guarantees" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoices" TO "anon";
GRANT ALL ON TABLE "public"."sales_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."stock_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."stock_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_adjustments" TO "service_role";
GRANT ALL ON TABLE "public"."stock_adjustments" TO PUBLIC;



GRANT ALL ON TABLE "public"."stock_issue_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_issue_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_issue_items" TO "service_role";
GRANT ALL ON TABLE "public"."stock_issue_items" TO PUBLIC;



GRANT ALL ON TABLE "public"."stock_issues" TO "anon";
GRANT ALL ON TABLE "public"."stock_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_issues" TO "service_role";
GRANT ALL ON TABLE "public"."stock_issues" TO PUBLIC;



GRANT ALL ON TABLE "public"."stock_lots" TO "anon";
GRANT ALL ON TABLE "public"."stock_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_lots" TO "service_role";
GRANT ALL ON TABLE "public"."stock_lots" TO PUBLIC;



GRANT ALL ON TABLE "public"."tax_records" TO "anon";
GRANT ALL ON TABLE "public"."tax_records" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_records" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."view_general_ledger" TO "anon";
GRANT ALL ON TABLE "public"."view_general_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."view_general_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."view_trial_balance" TO "anon";
GRANT ALL ON TABLE "public"."view_trial_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."view_trial_balance" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































