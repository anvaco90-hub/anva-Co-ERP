# Quotation Stock Check — Design Doc

## Intent & Why

เมื่อใบเสนอราคาถูกอนุมัติแล้ว ฝ่ายจัดซื้อต้องรู้ว่าของที่ต้องใช้มีพอในสต็อกหรือไม่
ก่อนหน้านี้หน้า QuotationDetail แสดงแค่รายการ ไม่เทียบกับคลังสินค้า
ทำให้ต้องเปิดหน้าสต็อกดูแยก แล้ว manual เปรียบเทียบเอง

ต้องการ: แสดงสถานะสต็อกรายบรรทัดในหน้า QuotationDetail
- ของพอ → กดไปหน้าเบิกได้เลย
- ของไม่พอ → เห็นจำนวนที่ขาด + ปุ่มเปิด PR เฉพาะส่วนขาด
- ค่าแรง/บริการ → ข้ามไม่เช็ค

## Goals

1. ฝ่ายจัดซื้อเห็นสถานะสต็อกทันทีเมื่อเปิดดู QuotationDetail
2. กดเบิกของ (Issue) หรือเปิด PR (เฉพาะส่วนขาด) ได้จากหน้านี้โดยตรง
3. ไม่เปลี่ยน flow เดิม — เป็นข้อมูลเสริม ไม่บังคับ

## Non-Goals

- ไม่สร้างใบเบิกอัตโนมัติ (แสดงสถานะ → คนกดเอง)
- ไม่แก้ BOQDetail, BOQForm, หรือ QuotationForm
- ไม่เพิ่ม column ใน DB
- ไม่เช็คสต็อกสำหรับค่าแรง/ค่าบริการ

## Anti-Goals

- ระบบไม่ควรบล็อกการเปิด PO/PR แม้สต็อกจะพอ (เป็นแค่ advisory)
- ไม่แสดงข้อมูลต้นทุน/ราคาซื้อให้ลูกค้าเห็น (เอกสาร PDF ไม่เปลี่ยน)

## Constraints

- ใช้ `inventory_items` table ที่มีอยู่ (field `qty_on_hand`, `item_name`, `item_code`, `unit`, `avg_unit_cost`)
- Match รายการด้วย `item_id` ก่อน แล้ว fallback ด้วย normalized `item_name` (lowercase, trim, collapse whitespace) — เหมือน `purchasingPricing.js`
- ข้ามรายการที่ `unit` เป็น 'งาน', 'Watt', 'เหมา', 'lot', 'LS' ฯลฯ หรือ `item_name` มีคำว่า 'ค่าแรง', 'ค่าบริการ', 'ค่าติดตั้ง', 'Installation', 'Commissioning', 'labor'
- อนุญาตสิทธิ์ `purchasing` ให้เบิกของจาก `/store/issue/new` ได้โดยตรง (`canIssueStock` + route guard) ตามกติกาธุรกิจ

## Approaches Considered

| Approach | Verdict |
|----------|---------|
| A. Stock Badge ใน QuotationDetail (pure helper + UI badge) | ✅ เลือก — แก้น้อย, TDD ง่าย |
| B. แยก Component `<QuotationStockPanel>` | ❌ YAGNI — ใช้ที่เดียว |
| C. เช็คสต็อกใน BOQDetail ก่อนแปลง | ❌ scope เกิน, BOQ ไม่มี matched item |

## Design

### 1. Pure helper: `src/lib/quotationStockCheck.js`

ฟังก์ชัน pure (ไม่เรียก DB):
- `isServiceOrLaborItem(item)` → ตรวจว่าข้ามเช็กสต็อกหรือไม่
- `checkQuotationStock(quotationItems, inventoryItems)` → เทียบรายบรรทัดจาก `inventory_items.qty_on_hand` คืน `{ itemName, needed, inStock, issueQty, shortfall, status, itemId, itemCode }` โดย `status` คือ `'enough' | 'partial' | 'out_of_stock' | 'not_in_inventory' | 'service'`
- `summarizeQuotationStock(stockRows)` → สรุปจำนวนรายการพร้อมเบิก / ส่วนขาด / ข้ามบริการ
- `buildShortfallPrItems({ quotation, quotationItems, boqItems, inventoryItems, mode })` → สร้างรายการเปิด PR เฉพาะรายการที่ขาดด้วยจำนวน `shortfall = needed - qty_on_hand`
- `buildIssuableStockLines(quotationItems, inventoryItems)` → สร้างรายการพร้อมเบิกสำหรับหน้าเบิกของ (คุมไม่ให้เกิน `floor(qty_on_hand)`)

### 2. UI & Workflow Links

- **`QuotationDetail.jsx`**:
  - `fetchDetail()` ดึง `inventory_items` (`id, item_code, item_name, unit, qty_on_hand, avg_unit_cost`)
  - Section 5 แสดงแถบสรุปเช็กสต็อกภายใน + คอลัมน์ `เช็กสต็อกภายใน` รายบรรทัด:
    - `enough`: 🟢 `พร้อมเบิก (มี X)` → ลิงก์ `/store/issue/new?item_id=...&qty=...&project_id=...&quotation_id=...`
    - `partial`: 🟡 `มีบางส่วน (X/Y) · ขาด Z` → ลิงก์เบิกที่มี + เปิด PR ส่วนขาด
    - `out_of_stock` / `not_in_inventory`: 🔴 `ของหมด` / `ไม่มีในคลัง` → ลิงก์ `/purchasing/pr/new?quotation_id=...&shortfall_only=1`
    - `service`: ⚪ `ค่าแรง/บริการ (ข้ามเช็ก)`
- **`PRForm.jsx`**: รองรับ `?shortfall_only=1` เพื่อโหลดเฉพาะส่วนที่ขาดจาก `buildShortfallPrItems`
- **`IssueForm.jsx`**: รองรับ `?item_id=...&qty=...` และ `?quotation_id=...` เพื่อพรีฟิลรายการพร้อมเบิกจากใบเสนอราคา
- **`store.js` & `App.jsx`**: เพิ่ม `'purchasing'` ใน `canIssueStock` และ route `/store/issue/new`

**คอลัมน์สต็อกจะเห็นเฉพาะ internal (`QuotationDetail.jsx`)** — ไม่มีใน `QuotationPrintModal.jsx` (PDF ที่ลูกค้าเห็น)

### 3. ไฟล์ที่แก้ไข

| ไฟล์ | การแก้ |
|------|-------|
| `src/lib/quotationStockCheck.js` | **ใหม่** — pure helper |
| `tests/quotationStockCheck.test.js` | **ใหม่** — unit tests (TDD) |
| `src/lib/store.js` | แก้ — เพิ่ม `'purchasing'` ใน `canIssueStock` |
| `src/App.jsx` | แก้ — เปิดสิทธิ์ `purchasing` เข้าหน้า `/store/issue/new` |
| `src/pages/store/IssueForm.jsx` | แก้ — รองรับ `qty` และ `quotation_id` params |
| `src/pages/purchasing/PRForm.jsx` | แก้ — รองรับ `shortfall_only=1` |
| `src/pages/quotations/QuotationDetail.jsx` | แก้ — fetch `inventory_items` + แสดง badge และปุ่มเบิก/PR |

### 4. สิ่งที่ไม่เปลี่ยน

- QuotationForm.jsx (สวิตช์ VAT ทำงานอยู่แล้ว)
- QuotationPrintModal.jsx (PDF ลูกค้าเห็นแค่ยอดรวม)
- boqToQuotation.js, tax.js, purchasingPricing.js, salesFlowUtils.js
- Schema/migration (ไม่เพิ่ม column)

## What's Left to the Builder

- ตำแหน่ง exact ของ badge column ใน table (ขวาสุดหรือหลัง unit)
- สี badge ให้เข้ากับ dark mode ที่มีอยู่
- จะ cache ผล items_master query หรือ fetch ทุกครั้ง (แนะนำ: fetch ทุกครั้ง เพราะสต็อกเปลี่ยนบ่อย)
