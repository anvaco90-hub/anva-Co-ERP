-- Migration 026: Add expected_delivery_date and delivery_address to purchase_orders
-- รองรับระบบติดตามวันครบกำหนดส่งของ (Due Date) และการพิมพ์หน้าจ่าซองส่งเอกสาร

DO $$ 
BEGIN
  -- เพิ่มคอลัมน์ วันที่กำหนดส่งมอบ / ครบกำหนด (expected_delivery_date)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_orders' AND column_name = 'expected_delivery_date'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN expected_delivery_date date;
    COMMENT ON COLUMN purchase_orders.expected_delivery_date IS 'วันที่กำหนดส่งมอบสินค้า / วันครบกำหนดส่งของ';
  END IF;

  -- เพิ่มคอลัมน์ สถานที่ส่งมอบ / ที่อยู่จัดส่ง (delivery_address)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_orders' AND column_name = 'delivery_address'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN delivery_address text;
    COMMENT ON COLUMN purchase_orders.delivery_address IS 'สถานที่ส่งมอบสินค้าหรือที่อยู่หน้างาน';
  END IF;

  -- เพิ่มคอลัมน์ หมายเหตุเพิ่มเติม (notes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_orders' AND column_name = 'notes'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN notes text;
    COMMENT ON COLUMN purchase_orders.notes IS 'หมายเหตุใบสั่งซื้อ';
  END IF;

  RAISE NOTICE 'Migration 026 completed successfully: Added expected_delivery_date, delivery_address, and notes to purchase_orders.';
END $$;

