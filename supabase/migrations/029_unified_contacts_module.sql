-- ==============================================================================
-- Migration 029: Unified Contacts Module (Customers & Vendors / Multi-Role)
-- ==============================================================================
-- สถาปัตยกรรมข้อมูลคู่ค้าแบบรวมศูนย์ (FlowAccount Multi-Role Architecture)
-- ตารางเดียวรองรับทั้ง ลูกค้า (is_customer) และ ผู้จำหน่าย/ร้านค้า (is_vendor)

-- 1. สร้าง/ปรับปรุงตารางหลัก contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_code text UNIQUE,
  contact_type text DEFAULT 'both',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- เพิ่มฟิลด์ Identity & Role
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_code text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'corporate';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_customer boolean DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS branch_type text DEFAULT 'head_office';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS branch_code text DEFAULT '00000';

-- เพิ่มฟิลด์ Address & Contact Info
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS location_type text DEFAULT 'thailand';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS registered_address text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS shipping_address text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS office_phone text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS fax text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS website text;

-- เพิ่มฟิลด์ บุคคลผู้ประสานงาน (Contact Person)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_person_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_person_email text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_person_mobile text;

-- เพิ่มฟิลด์ เครดิตเทอม & หมายเหตุ
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS credit_days integer DEFAULT 30;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ฟิลด์บัญชีธนาคารในตารางหลัก (Legacy Compatibility)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS promptpay_no text;

-- 2. สร้างตารางบัญชีธนาคารของคู่ค้า (contact_bank_accounts)
CREATE TABLE IF NOT EXISTS public.contact_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  branch_name text,
  account_type text DEFAULT 'savings',
  qr_code_url text,
  is_international boolean DEFAULT false,
  swift_code text,
  bank_address text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3. สร้างตารางไฟล์แนบประจำตัวคู่ค้า (contact_attachments)
CREATE TABLE IF NOT EXISTS public.contact_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text DEFAULT 'document',
  file_size text,
  created_at timestamptz DEFAULT now()
);

-- 4. อัปเดตและเชื่อมต่อข้อมูลเดิม (Sync Customers & Vendors into Contacts)
DO $$
BEGIN
  -- ซิงค์ชื่อบริษัท และตั้งสถานะ Role
  UPDATE public.contacts
  SET 
    business_name = COALESCE(business_name, company_name),
    company_name = COALESCE(company_name, business_name),
    registered_address = COALESCE(registered_address, address),
    office_phone = COALESCE(office_phone, phone),
    contact_person_name = COALESCE(contact_person_name, contact_person),
    is_customer = CASE WHEN contact_type IN ('customer', 'both') THEN true ELSE is_customer END,
    is_vendor = CASE WHEN contact_type IN ('vendor', 'both') THEN true ELSE is_vendor END
  WHERE business_name IS NULL OR is_customer IS NULL OR is_vendor IS NULL;

  -- ดึงข้อมูลลูกค้าจากตาราง customers มาเก็บใน contacts
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    INSERT INTO public.contacts (
      contact_code, business_name, company_name, tax_id, branch_type, branch_code,
      registered_address, shipping_address, office_phone, phone, contact_person_name,
      contact_person, is_customer, is_vendor, entity_type, is_active
    )
    SELECT 
      c.customer_code,
      c.customer_name,
      c.customer_name,
      c.tax_id,
      'head_office',
      '00000',
      c.address,
      c.address,
      c.phone,
      c.phone,
      c.contact_person,
      c.contact_person,
      true,
      false,
      'corporate',
      true
    FROM public.customers c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contacts ct 
      WHERE (ct.tax_id IS NOT NULL AND ct.tax_id = c.tax_id)
         OR ct.business_name = c.customer_name
         OR ct.contact_code = c.customer_code
    );
  END IF;

  -- ดึงข้อมูลผู้จำหน่ายจากตาราง vendors มาเก็บใน contacts
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vendors') THEN
    INSERT INTO public.contacts (
      contact_code, business_name, company_name, tax_id, branch_type, branch_code,
      registered_address, shipping_address, office_phone, phone, contact_person_name,
      contact_person, is_customer, is_vendor, entity_type, is_active
    )
    SELECT 
      v.vendor_code,
      v.vendor_name,
      v.vendor_name,
      v.tax_id,
      'head_office',
      '00000',
      v.address,
      v.address,
      v.phone,
      v.phone,
      v.contact_person,
      v.contact_person,
      false,
      true,
      'corporate',
      true
    FROM public.vendors v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contacts ct 
      WHERE (ct.tax_id IS NOT NULL AND ct.tax_id = v.tax_id)
         OR ct.business_name = v.vendor_name
         OR ct.contact_code = v.vendor_code
    );
  END IF;
END $$;

-- 5. RLS Policies
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_contacts_authenticated" ON public.contacts;
CREATE POLICY "read_contacts_authenticated" ON public.contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_contacts_authenticated" ON public.contacts;
CREATE POLICY "write_contacts_authenticated" ON public.contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read_contact_bank_accounts" ON public.contact_bank_accounts;
CREATE POLICY "read_contact_bank_accounts" ON public.contact_bank_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_contact_bank_accounts" ON public.contact_bank_accounts;
CREATE POLICY "write_contact_bank_accounts" ON public.contact_bank_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read_contact_attachments" ON public.contact_attachments;
CREATE POLICY "read_contact_attachments" ON public.contact_attachments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_contact_attachments" ON public.contact_attachments;
CREATE POLICY "write_contact_attachments" ON public.contact_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

