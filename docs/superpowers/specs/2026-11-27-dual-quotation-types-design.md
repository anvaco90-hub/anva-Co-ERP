# Dual Quotation Types (รับงาน & ขายสินค้า) — Design Spec

## Intent & Why

ระบบใบเสนอราคาเดิมรองรับเพียงรูปแบบเดียว (ไม่มี `type`) ทำให้ไม่สามารถแยกงานรับเหมา/ติดตั้งโซลาร์ (ที่ต้องถอด BOQ และแสดงลูกค้าเฉพาะรายการกับยอดรวม) ออกจากงานขายสินค้าหน้าร้าน/สต็อก (ที่ไม่ต้องผ่าน BOQ, ดึงต้นทุนเฉลี่ยจากสโตร์, บวกมาร์กอัป % ทั้งใบ, เลือกส่วนลดทั้งใบหรือต่อรายการ และให้ลูกค้าเห็นราคาต่อหน่วยรวมกำไรแล้ว)

การเพิ่มฟิลด์ `type` (`'project' | 'product'`) ในตาราง `quotations` เดียว พร้อมรวมสูตรคำนวณราคา-มาร์กอัป-ส่วนลด-VAT เป็นชุดเดียวกับ BOQ จะช่วยให้:
1. เอกสาร 2 ประเภทแยกหมวดหมู่, รหัสเอกสาร, และรูปแบบ PDF ลูกค้าได้อย่างชัดเจนโดยไม่ต้องแยกตารางหรือระบบ PR/PO
2. ยอดรวม BOQ และใบเสนอราคาตรงกันระดับสตางค์จากการปัดเศษต่อหน่วย 2 ตำแหน่งแล้วรวมผลรวมบรรทัด
3. คุมความถูกต้องเชิงธุรกิจครบ: Snapshot ต้นทุน/ราคา, เตือนขาดทุนพร้อมบันทึกผู้ออกใบ, เช็กสต็อกตอนออกใบโดยไม่เปิด PR อัตโนมัติ, และล็อกการเปิด PR/เบิกสต็อกจนกว่าลูกค้าจะอนุมัติ

## Approaches Considered

| Approach | Summary | Verdict |
|----------|---------|---------|
| **A. Single `quotations` table + `type` (`'project' \| 'product'`) + split prefixes (`QT-P-` / `QT-S-`)** | เพิ่มคอลัมน์ `type`, `markup_percent`, `discount_mode`, `header_discount_*`, `total_cost`, `issued_by*` ใน `quotations` และ `base_cost`, `item_code` ใน `quotation_items` | **Selected ✅** (ตารางเดียว, backward-compatible, เข้ากับ QT→PR→PO เดิม) |
| **B. Separate `product_quotations` table** | แยกตารางใหม่และ UI ใหม่ทั้งหมด | Rejected ❌ (ต้องเขียน RLS, PR/PO/AR, list query ซ้ำทั้งหมด) |
| **C. Implicit via `boq_id IS NOT NULL`** | ไม่เพิ่มคอลัมน์ `type` | Rejected ❌ (แยก prefix รหัสเอกสารไม่ได้, QT โปรเจกต์ที่ไม่ได้ผูก BOQ จะกำกวม) |

## Confirmed Business Rules & Flow Decisions

1. **Quotation Types (`quotations.type`):**
   - `'project'` (**รับงาน**): Prefix `QT-P-YYYYMM-NNNN`. สร้างจากปุ่มในหน้า BOQ (หรือเลือกผ่าน Modal `+ สร้างใบเสนอราคา` → รับงาน → เลือก BOQ). ดึงราคาขายสุทธิจาก BOQ (`applyMarkup(directCost, boq.markup_percent)`), ปิดส่วนลดทั้งหมด (`discount_mode = 'none'`, `discount = 0`), และ PDF ลูกค้าแสดงเฉพาะรายการสินค้า (ซ่อนค่าแรง), จำนวน, หน่วย, และยอดรวมสุทธิ (ซ่อนราคา/หน่วยและส่วนลด).
   - `'product'` (**ขายสินค้า**): Prefix `QT-S-YYYYMM-NNNN`. ไม่ผ่าน BOQ — เลือกสินค้าจาก Store (`inventory_items`) โดยตั้ง `base_cost = avg_unit_cost` (แก้ไขได้). กรอก `markup_percent` (% เท่านั้น, ห้ามติดลบ `>= 0`) ครั้งเดียวทั้งใบโดยทุกบทบาทที่เข้าหน้า QT สามารถกรอกได้. ลูกค้าเห็นราคาต่อหน่วยที่รวมกำไรแล้ว (`round2(base_cost * (1 + markup/100))`) + ราคารวมบรรทัด + ยอดรวม.
2. **Discount Modes for `product`:**
   - ผู้ใช้สามารถสลับเลือกได้ 2 แบบ:
     - `whole_bill` (**ส่วนลดทั้งใบ**): กรอกเป็นจำนวนเงิน (บาท) หรือสลับเป็น % จาก `subtotal` (ปิดส่วนลดต่อบรรทัด = 0)
     - `per_item` (**ส่วนลดต่อรายการ**): กรอก `discount_percent` รายบรรทัด (ปิดส่วนลดท้ายใบ)
   - สำหรับ `project`: ปิดส่วนลดทั้งสองแบบ (`discount_mode = 'none'`).
3. **Single Unified Pricing Engine (No Duplicate Formulas):**
   - รวมไว้ที่ `src/lib/tax.js` (`applyMarkup`, `calculateDocumentPricing`, `evaluateBelowCost`) และใช้ร่วมกับ `BOQForm.jsx`, `boqToQuotation.js`, `QuotationForm.jsx`, `QuotationDetail.jsx`, `quotationPrintUtils.js`.
   - ลำดับคำนวณ: `ต้นทุน (base_cost) → มาร์กอัป % (round2 ต่อชิ้น) → ผลรวมบรรทัด → ส่วนลด → VAT (3 โหมดเดิม: vat_excluded / vat_included / vat_exempt)`.
   - กฎการปัดเศษ: ปัดราคาต่อชิ้นหลังมาร์กอัปเป็นทศนิยม 2 ตำแหน่ง (`round2`), `lineTotal = round2(unitSellingPrice * qty)` (หรือหักส่วนลดรายบรรทัดที่ปัด 2 ตำแหน่งแล้ว), แล้วคิด `subtotal` และ `afterDiscount` จากผลรวมของบรรทัดเสมอ.
4. **Below-Cost Warning & Responsibility Tracking:**
   - เมื่อ `totalCost > 0 && afterDiscount < totalCost`: แสดงแบนเนอร์เตือนชัดเจน (ไม่บล็อกการบันทึก/ออกใบ — ไม่ต้องมีขั้นอนุมัติ) และบันทึกผู้รับผิดชอบ (`issued_by`, `issued_by_name`, `issued_at`).
5. **Snapshot Lifecycle:**
   - บันทึก Snapshot `base_cost`, `unit_price`, `total_amount`, `markup_percent`, `total_cost` ลง DB ทันทีตั้งแต่กด Save — การแก้ไขราคาใน Store (`avg_unit_cost`) หรือ BOQ ในภายหลังไม่มีผลย้อนหลัง.
   - เฉพาะสถานะ `'draft'` เท่านั้นที่มีปุ่มให้ผู้ใช้กด `"ซิงค์ต้นทุนล่าสุดจาก Store"` ได้ด้วยตนเอง.
   - เมื่อเปลี่ยนสถานะเป็น `'sent'` (หรือกด `"ออกใบเสนอราคา / ส่งลูกค้า"`) ระบบจะบันทึก `issued_by`, `issued_by_name`, `issued_at` และล็อกไม่ให้ซิงค์ราคาจาก Store อีก.
6. **Print / PDF Privacy:**
   - `QuotationPrintModal.jsx` และ `quotationPrintUtils.js` ห้ามแสดง `base_cost`, `total_cost`, `markup_percent`, คำเตือนขาดทุน, หรือสถานะสต็อกในทุกกรณี.
7. **Stock Check & Approval-Gated PR Creation:**
   - ตอนออกใบเสนอราคา: เช็กสต็อกกับ `inventory_items` แบบ Live และแสดงสถานะบนหน้าจอดูเอกสารภายในเท่านั้น — **ไม่เปิด PR อัตโนมัติ** และ **ล็อก/ปิดปุ่มเปิด PR และปุ่มเบิกสต็อก** จนกว่าลูกค้าจะเซ็นอนุมัติ (`isQuotationApproved(q) === true`).
   - หลังลูกค้าอนุมัติ: ฝ่ายจัดซื้อกดเปิด PR เอง ระบบจะ re-check สต็อก ณ เวลานั้นและสร้างรายการ PR เฉพาะส่วนที่ขาดจริง (`buildShortfallPrItems`).
   - รายการสินค้าจาก Store ที่มี `item_id` ตรงกับ `inventory_items` ต้องถูกเช็กสต็อกเสมอ (ไม่ถูกข้ามเป็นค่าแรง/บริการแม้หน่วยจะเป็นคำอย่าง `'จุด'` หรือ `'งาน'`).
8. **Quotation List UI:**
   - ปุ่ม `+ สร้างใบเสนอราคา` เปิด `CreateQuotationModal` ให้เลือก **ขายสินค้า (จาก Store)** หรือ **รับงาน (จาก BOQ)**.
   - ตารางหน้าแรกแสดงป้ายประเภทเอกสาร (`รับงาน` / `ขายสินค้า`) และมีตัวกรองเลือกดูตามประเภท.
