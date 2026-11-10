-- ขั้นที่ 1: profiles (role) + projects + RLS พื้นฐาน
-- รันใน Supabase Dashboard > SQL Editor

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'store'
    check (role in ('admin','accounting','purchasing','store','hr','management')),
  is_active boolean not null default false  -- ผู้ใช้ใหม่ต้องให้ admin เปิดใช้งานก่อน
);

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- อ่าน role ผู้ใช้ปัจจุบัน (security definer กัน policy บน profiles วนเรียกตัวเอง)
create function get_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create table projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique not null,
  project_name text not null,
  client_name text,
  site_address text,
  budget_total numeric(15,2) default 0,
  start_date date,
  end_date date,
  status text default 'planning',
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table projects enable row level security;

create policy "read_own_profile" on profiles for select
  using (id = auth.uid() or get_my_role() = 'admin');
create policy "admin_manage_profiles" on profiles for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

create policy "read_projects" on projects for select
  using (get_my_role() is not null);
create policy "write_projects" on projects for all
  using (get_my_role() in ('admin','management'))
  with check (get_my_role() in ('admin','management'));

-- หลังสร้างผู้ใช้คนแรกใน Authentication > Users ให้ตั้งเป็น admin เอง:
-- update profiles set role='admin', is_active=true, full_name='ชื่อคุณ' where id='<user uuid>';
