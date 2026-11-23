-- 037_add_boq_updated_at.sql
-- เพิ่มคอลัมน์ updated_at ในตาราง boqs (ถ้าต้องการเก็บประวัติเวลาแก้ไขล่าสุด)
ALTER TABLE public.boqs 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
