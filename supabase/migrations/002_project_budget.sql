-- ขั้นที่ 2: โมดูลโครงการ — งบประมาณรายหมวด + จำกัดค่า status
-- รันใน SQL Editor (โปรเจกต์ dev ก่อน แล้วค่อยโปรเจกต์จริง)

alter table projects
  add constraint projects_status_check
  check (status in ('planning','in_progress','on_hold','completed'));

create table project_budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  category text not null,
  budgeted_amount numeric(15,2) not null default 0 check (budgeted_amount >= 0)
);
create index on project_budget_items (project_id);

alter table project_budget_items enable row level security;

-- ผู้ใช้ที่เปิดใช้งานแล้วอ่านได้, เฉพาะ admin/management แก้ได้
create policy "read_budget_items" on project_budget_items for select
  using (get_my_role() is not null);
create policy "write_budget_items" on project_budget_items for all
  using (get_my_role() in ('admin','management'))
  with check (get_my_role() in ('admin','management'));
