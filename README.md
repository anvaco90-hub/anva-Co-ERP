# ERP ก่อสร้าง (Supabase + Cloudflare) — ขั้นที่ 1: โครงสร้างโปรเจกต์

## เริ่มใช้งาน
1. `npm install`
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าจาก Supabase (Project Settings > API)
3. รัน `supabase/migrations/001_auth_and_projects.sql` ใน SQL Editor
4. สร้างผู้ใช้ใน Authentication > Users แล้วตั้งเป็น admin (คำสั่งอยู่ท้ายไฟล์ SQL)
5. `npm run dev`

## Deploy ที่ Cloudflare Pages
Build command: `npm run build` / Output: `dist` / ตั้ง env ทั้ง 2 ตัวใน Pages settings

## แผนขั้นตอน
1. โครงสร้างโปรเจกต์ + login + role  <- ขั้นนี้
2. โมดูลโครงการ  3. จัดซื้อ  4. สโตร์  5. บัญชี  6. HR  7. อัปโหลดไฟล์ R2  8. แดชบอร์ดต้นทุน
