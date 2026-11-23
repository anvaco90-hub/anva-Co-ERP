-- 038_fix_boq_rls_policies.sql
-- แก้ไข RLS Policies สำหรับตาราง boqs และ boq_items ให้สามารถบันทึกและแก้ไขข้อมูลได้

-- 1. ลบ Policy เดิมหากมี
DROP POLICY IF EXISTS "boqs_allow_all" ON public.boqs;
DROP POLICY IF EXISTS "Allow all authenticated users to manage boqs" ON public.boqs;
DROP POLICY IF EXISTS "boq_items_allow_all" ON public.boq_items;
DROP POLICY IF EXISTS "Allow all authenticated users to manage boq_items" ON public.boq_items;

-- 2. สร้าง Policy อนุญาตสิทธิ์เต็มเหมือนตารางอื่นๆ ในระบบ (quotations, purchase_orders ฯลฯ)
CREATE POLICY "boqs_allow_all" ON public.boqs
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "boq_items_allow_all" ON public.boq_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. มอบสิทธิ์การเข้าถึงตาราง
GRANT ALL ON TABLE public.boqs TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.boq_items TO authenticated, anon, service_role;
