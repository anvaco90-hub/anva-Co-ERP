# Unified Sales (QT) ↔ Stock Issue / Procurement (PR → Multi-PO → GR) Workflow Design Doc

## Intent & Why

1. หน้า `QuotationDetail` แสดง Step 4 (`ส่งต่อจัดซื้อ & สโตร์`) ผิดพลาดเป็น `✅ รับของครบ (2 PO)` และดึง `PO2026-0005` ของงานอื่นมาแสดงทั้งที่เพิ่งสร้างใบ QT และยังไม่ได้ทำ PR/PO เพราะ query เดิมค้นหาด้วย `OR project_id = ...` และ `quotation_no = ...` (ซึ่งเป็นคอลัมน์เลข QT ของร้านค้า ไม่ใช่ QT ขาย)
2. ฝั่ง `PRDetail` / `ProcurementWorkflowStepper` ยังไม่เชื่อมกลับหาใบเสนอราคาต้นทาง (`QT-...`) และฝั่ง QT ยังไม่เห็นความคืบหน้าย่อยของ PR → PO → รับของ
3. ระบบ UI เดิมซ่อนปุ่มสร้าง PO ทันทีเมื่อ PR มี PO แล้ว 1 ใบ ทำให้ 1 PR แยกเปิดหลาย PO (สั่งของคนละร้านค้า) ไม่สะดวก
4. ใน `QuotationDetail` ถ้ามีของคงเหลือในสต็อก การบอกได้ว่ามาจากล็อต/โครงการไหนด้วย `stock_lots` ที่มีอยู่แล้วจะช่วยให้ทีมเบิกตัดสินใจง่ายขึ้นโดยไม่ต้องเพิ่มตาราง/คอลัมน์ใหม่

## Goals

1. เชื่อมข้อมูล `QT ↔ PR ↔ PO ↔ GR` และ `QT → Stock Issue` เฉพาะเอกสารของใบ QT นั้นจริง ๆ ไม่ดึง PO/PR อื่นในโครงการเดียวกันมาปน
2. คำนวณสถานะ Step 4 บน `QuotationDetail` ตามความเป็นจริงของสต็อก, PR, PO, และใบเบิก (`stock_issues`)
3. ฝังแถบสถานะย่อย (`CompactProcurementSteps`) ลงใน Step 4 ของ `QuotationDetail` และเพิ่มลิงก์กลับ `อ้างอิง QT-...` ใน Step 1 ของ `PRDetail` / `ProcurementWorkflowStepper`
4. แสดงแหล่งโครงการของสต็อกที่เหลือจาก `stock_lots` (`qty_remaining > 0`) ในหน้าเช็กสต็อกของ `QuotationDetail` โดยไม่แก้ database schema
5. รองรับ **1 PR → หลาย PO** ได้สะดวก พร้อมช่วยหักยอดที่เคยเปิด PO ไปแล้วให้อัตโนมัติใน `POForm.jsx`

## Non-Goals

- ไม่เปลี่ยนแปลง Supabase schema หรือสร้าง SQL migration ใหม่
- ไม่รวมหน้าตา 5 ขั้นตอนฝั่งขาย (`QT → AR`) กับ 5 ขั้นตอนฝั่งจัดซื้อ (`PR → PO → GR → AP`) เป็นการ์ดเดียว เพื่อไม่ให้ AP กับ AR ปะปนกัน และไม่กระทบ PR/PO ของกลาง

## Constraints & Real Schema Facts

- `purchase_requisitions` และ `purchase_orders` มี `quotation_id`, `sales_quotation_no`, `notes`, `project_id`, `pr_id`
- `stock_issues` ไม่มี `quotation_id` แต่มี `issue_no`, `issue_date`, `project_id`, `notes`, `issue_target`, `issue_reason` (ซึ่ง `IssueForm.jsx` บันทึก `เบิกวัสดุตามใบเสนอราคา ${qt.quotation_no}` ใน `notes` อยู่แล้ว)
- `stock_lots` มี `item_id`, `source_project_id`, `qty_remaining`, `projects(project_code, project_name)`

## Design Details

### 1. แก้การเชื่อมโยง QT → PR → PO & Stock Issues (`salesFlowUtils.js`, `salesBilling.js`)

- **`buildQuotationPrQuerySpecs(quotation)`**:
  - **เอา `project_id.eq.${prjId}` ออกเด็ดขาด** เพื่อไม่ให้ดึง PR ของใบ QT อื่นในโครงการเดียวกันมาปน
  - ดึง PR เฉพาะ `quotation_id.eq.${qId}`, `sales_quotation_no.eq.${qNo}`, หรือ `notes.ilike.%${qNo}%`
- **`buildQuotationPoQuerySpecs(quotation, matchedPrIds = [])`**:
  - **เอา `project_id.eq.${prjId}` และ `quotation_no.eq.${qNo}` ออก** (`quotation_no` บน PO เป็นเลขใบเสนอราคาของผู้ขาย)
  - ดึง PO เฉพาะ `quotation_id.eq.${qId}`, `sales_quotation_no.eq.${qNo}`, `notes.ilike.%QT ขาย: ${qNo}%`, หรือ `pr_id.in.(...)` สำหรับ PR ที่เป็นของใบ QT นี้จริง ๆ เท่านั้น
- **Query `stock_issues` ใน `fetchQuotationLinkedDocs`**:
  - ดึงใบเบิกของ QT นี้จาก `stock_issues` ด้วย `notes.ilike.%${qNo}%` (เฉพาะเมื่อมี `qNo`), ส่งกลับเป็น `{ prs, pos, invoices, issues }`

### 2. ปรับ `computeQuotationWorkflow` + แสดง Sub-pipeline ใน `QuotationDetail.jsx`

- รับพารามิเตอร์เพิ่ม: `stockSummary = null`, `issues = []`
- ลำดับการตัดสินสถานะ Step 4 (`step4State`):
  1. มี `activePOs.length > 0`:
     - ถ้ารับของใน PO ครบทุกใบ **และ** (`stockSummary?.issuableCount || 0 === 0` หรือ `activeIssues.length > 0`) **และ** ไม่มีของขาดค้างจาก PR? → ตรวจว่า `allPosReceived` และ (ไม่ต้องเบิกสโตร์เพิ่ม หรือมีการเบิกแล้ว) → `'done'`
     - ถ้ายังรับ PO ไม่ครบ หรือยังมีรายการพร้อมเบิกที่ยังไม่เบิก → `'in_progress'`
  2. ไม่มี PO แต่มี `activePRs.length > 0` → `'in_progress'` (`มี PR แล้ว (${activePRs.length}) · รอออก PO`)
  3. ยังไม่มีทั้ง PR และ PO ของ QT นี้:
     - ถ้ามี `activeIssues.length > 0` และ `(stockSummary?.shortageCount || 0) === 0` → `'done'` (`เบิกจากสต็อกครบแล้ว`)
     - ถ้ามีของขาด (`shortageCount > 0`) → `'ready'` (`รอเบิก & เปิด PR ส่วนที่ขาด (${shortageCount})`)
     - ถ้าสต็อกพร้อมเบิกครบ (`shortageCount === 0 && issuableCount > 0`) → `'ready'` (`สต็อกพร้อมเบิก (${issuableCount} รายการ)`) — **ไม่ติ๊กถูกจนกว่าจะเบิกจริง**
     - ถ้ามีแต่อัตราค่าแรง/บริการล้วน → `'done'` (`ไม่ต้องสั่งซื้อ/เบิกพัสดุ`) เมื่ออนุมัติแล้ว, หรือ `'pending'` ก่อนอนุมัติ
- UI ใน Step 4 Card (`QuotationDetail.jsx`):
  - แสดงลิงก์ PR (`PR2026-0007`) / PO หลายใบ / ใบเบิกสต็อก (`ISS-...`)
  - ฝัง `<CompactProcurementSteps flow={computeProcurementFlow(...)} />` เมื่อ QT นี้มี `PR` หรือ `PO` จริง

### 3. แสดงแหล่งโครงการของสต็อกคงเหลือจาก `stock_lots`

- ใน `quotationStockCheck.js` เพิ่มฟังก์ชัน pure `summarizeItemLotSources(stockLots = [])` คืน map `item_id -> [{ projectLabel, qty }]` (เช่น `[PJ-000001] โครงการเดิม (4)` หรือ `สต็อกกลาง / คลังหลัก`)
- ใน `QuotationDetail.jsx` ดึง `stock_lots` (`qty_remaining > 0`) มาแสดงป้ายเล็ก ๆ ใต้สถานะสต็อก (ฝั่งภายในเท่านั้น ไม่แสดงใน PDF ลูกค้า)

### 4. เชื่อมย้อนจาก PR → QT & รองรับ 1 PR → หลาย PO

- **`ProcurementWorkflowStepper.jsx` & `PRDetail.jsx`**:
  - เพิ่ม helper `extractPrSourceQuotation(pr)` (เช็ก `pr.quotation_id`, `pr.sales_quotation_no`, หรือ parse `QT-[A-Z0-9-]+` จาก `pr.notes`) เพื่อแสดงป้ายลิงก์กลับ `QT-...` บน Step 1 ของ `ProcurementWorkflowStepper` (ทั้งโหมด `pr` และ `po`) และแถบข้อมูลหัวเอกสารของ `PRDetail`
  - ในโหมด `pr` Step 2: แสดงรายการ PO ที่เชื่อมอยู่ **ทุกใบ** (ไม่ใช่แค่ `primaryLinkedPo` ใบเดียว) พร้อมปุ่ม `+ เพิ่ม PO อีกร้าน` แม้ PR จะมีสถานะ `'ordered'` แล้วก็ตาม
- **`PRDetail.jsx` & `PurchasingHub.jsx`**:
  - Header และ Section 4 (PO Linkage Card) คงปุ่ม `+ เปิด PO เพิ่มอีกร้าน` ให้เปิด PO ที่ 2, 3... จาก PR เดิมได้เสมอ (ตราบใดที่ PR ไม่ถูกยกเลิก)
- **`src/lib/purchasing.js` (หรือ `purchasingPricing.js`) + `POForm.jsx`**:
  - เพิ่ม pure helper `computeRemainingPrItems(prItems = [], existingPoItems = [])` หักจำนวนที่เคยออก PO ที่ยังไม่ยกเลิกไปแล้ว (`remainingQty = prQty - alreadyOrderedQty`)
  - ใน `POForm.jsx` (`loadPrData`): ดึง PO/PO items ที่ผูก `pr_id` นี้ (สถานะ `!= 'cancelled'`) มาคำนวณยอดคงเหลือให้กรอกอัตโนมัติ พร้อมแถบแจ้งว่ามี PO เดิมแล้วกี่ใบ

## Files to Create / Modify

- Modify: `src/lib/salesFlowUtils.js`, `src/lib/salesBilling.js`, `src/lib/quotationStockCheck.js`, `src/lib/purchasingPricing.js`, `src/pages/quotations/QuotationDetail.jsx`, `src/components/purchasing/ProcurementWorkflowStepper.jsx`, `src/pages/purchasing/PRDetail.jsx`, `src/pages/purchasing/POForm.jsx`, `src/pages/purchasing/PurchasingHub.jsx`
- Add/Update TDD Tests: `tests/salesFlowQueries.test.js`, `tests/quotationStockCheck.test.js`, `tests/prMultiPo.test.js`
