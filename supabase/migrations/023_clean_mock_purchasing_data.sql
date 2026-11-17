-- ============================================================================
-- MIGRATION 023: CLEAN MOCK PURCHASING DATA (ล้างข้อมูลจำลองฝ่ายจัดซื้อทั้งหมด)
-- ปลอดภัย 100% มีระบบตรวจสอบตารางก่อนลบ (Dynamic Check) ไม่ติด Relation Error
-- ============================================================================

DO $$
BEGIN
  -- 1. ตัดการเชื่อมโยง po_id จาก stock_issues (ถ้ามีตารางและมีคอลัมน์)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stock_issues' AND column_name = 'po_id'
  ) THEN
    EXECUTE 'UPDATE stock_issues SET po_id = NULL WHERE po_id IS NOT NULL;';
  END IF;

  -- 2. ตัดการเชื่อมโยง po_id จาก payment_transactions (ถ้ามี)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_transactions' AND column_name = 'po_id'
  ) THEN
    EXECUTE 'UPDATE payment_transactions SET po_id = NULL WHERE po_id IS NOT NULL;';
  END IF;

  -- 3. ลบ purchase_audit_log (ประวัติ audit จัดซื้อ)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_audit_log') THEN
    EXECUTE 'DELETE FROM purchase_audit_log WHERE true;';
  END IF;

  -- 4. ลบตรวจรับของเข้า (Goods Receipts)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipt_items') THEN
    EXECUTE 'DELETE FROM goods_receipt_items WHERE true;';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipts') THEN
    EXECUTE 'DELETE FROM goods_receipts WHERE true;';
  END IF;

  -- 5. ลบใบสั่งซื้อ (Purchase Orders: PO)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
    EXECUTE 'DELETE FROM purchase_order_items WHERE true;';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
    EXECUTE 'DELETE FROM purchase_orders WHERE true;';
  END IF;

  -- 6. ลบใบขอซื้อ (Purchase Requisitions: PR)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_requisition_items') THEN
    EXECUTE 'DELETE FROM purchase_requisition_items WHERE true;';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_requisitions') THEN
    EXECUTE 'DELETE FROM purchase_requisitions WHERE true;';
  END IF;

  -- 7. ลบข้อมูลคู่ค้า / ร้านค้า (Vendors)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors') THEN
    EXECUTE 'DELETE FROM vendors WHERE true;';
  END IF;

  -- 8. รีเซ็ตเลขรันเอกสารจัดซื้อ ให้เริ่มนับใหม่ที่ 1 (ลบแถว sequence เดิมออก)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doc_sequences') THEN
    EXECUTE 'DELETE FROM doc_sequences WHERE prefix IN (''PR'', ''PO'', ''GR'', ''V'', ''VEND'');';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doc_running_numbers') THEN
    EXECUTE 'DELETE FROM doc_running_numbers WHERE prefix IN (''PR'', ''PO'', ''GR'', ''V'', ''VEND'');';
  END IF;

  RAISE NOTICE 'ล้างข้อมูลจัดซื้อจำลองเรียบร้อยสมบูรณ์ พร้อมใช้งานข้อมูลจริง';
END $$;
