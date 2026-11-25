# Customer Quotation Approval Design Doc (Approach A)

## Intent & Why

ลูกค้าส่วนมากเซ็นอนุมัติรับงานบน **ใบเสนอราคา (`QT-...`)** โดยตรง ไม่ได้ออกใบสั่งซื้อ (`PO`) ของบริษัทลูกค้าแยกกลับมา แต่หน้าต่างบันทึกการอนุมัติเดิมเขียนหัวข้อและบังคับกรอกเฉพาะ `"บันทึกการเซ็น PO ของลูกค้า"` / `"เลขที่ใบสั่งซื้อของลูกค้า *"` ทำให้พนักงานขายต้องตั้งเลขหลอกและข้อความในเอกสาร/AR ไม่ตรงกับความจริงทางธุรกิจ นอกจากนี้ยังมี Modal ซ้ำซ้อนอยู่ 2 จุด (`CustomerPoModal.jsx` และโค้ด inline ใน `QuotationDetail.jsx`)

## Goals

1. เปลี่ยนข้อความและ Flow การอนุมัติให้สอดคล้องกับการเซ็นรับ **ใบเสนอราคา** เป็นหลัก (`CUSTOMER APPROVAL`)
2. เมื่อลูกค้าเซ็นใบเสนอราคาโดยตรง ระบบเติมรหัสของใบเสนอราคานั้น (`quotation_no`, เช่น `QT-202611-9828`) ให้อัตโนมัติเป็นเลขอ้างอิงหลัก
3. ยังคงรองรับการกรอกเลขที่ PO ลูกค้าแยกได้ กรณีลูกค้านิติบุคคลออกใบ PO มาให้จริง (เลือกสลับได้ใน Modal)
4. รวม Modal ซ้ำซ้อน 2 จุดให้ใช้ `CustomerPoModal.jsx` ร่วมกันจุดเดียว

## Non-Goals

- ไม่เพิ่ม/แก้คอลัมน์ในฐานข้อมูล (ยังคงใช้ `customer_po_no`, `customer_po_date`, `customer_signer_name`, `customer_po_file_url`, `status = 'approved'` บนตาราง `quotations` เพื่อไม่ให้กระทบ DB schema และ AR/Purchasing flow เดิม)
- ไม่เปลี่ยนพฤติกรรมการปลดล็อก Workflow ขั้น 3 -> 4/5 และการออก AR Invoice อัตโนมัติ

## Constraints

- หาก `customer_po_no` เท่ากับ `quotation_no` (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง) ให้ระบบตีความเป็น **"ลูกค้าเซ็นอนุมัติตามใบเสนอราคา"** (`mode = 'signed_qt'`) แทนที่จะแสดงป้ายผิดว่าเป็น `"PO: QT-..."`
- แสดงผลให้ถูกต้องสอดคล้องกันทั้งหน้า `QuotationDetail`, `QuotationList`, `QuotationPrintModal`, `CustomerPoPrintModal`, `QuotationShareModal` และหมายเหตุใบแจ้งหนี้ AR (`buildSalesInvoicePayload`)

## Approach Selected

**Approach A — ยึดรหัสใบ QT เป็นค่าเริ่มต้น + สลับกรอกเลข PO ลูกค้าแยกได้**
(ปฏิเสธ Approach B เพราะลูกค้านิติบุคคลยังต้องอ้างอิงเลข PO ได้ และปฏิเสธ Approach C เพื่อไม่เพิ่ม DB migration เกินความจำเป็น)

## Design

### 1. Pure Helpers ใน `src/lib/salesFlowUtils.js`

- `resolveCustomerApprovalRef({ mode, quotationNo, customPoNo })`: คืน `quotationNo` เมื่อ `mode === 'signed_qt'` หรือ `customPoNo` เมื่อ `mode === 'customer_po'`
- `getCustomerApprovalDisplay(quotation)`: ตรวจเทียบ `customer_po_no` กับ `quotation_no` เพื่อคืน `{ mode, refNo, isDirectQt, badgeLabel, shortLabel, docTitle }`
  - `isDirectQt === true`: `badgeLabel = 'อนุมัติตาม QT'`, `shortLabel = 'อ้างอิง QT: <quotation_no>'`, `docTitle = 'เอกสารยืนยันการอนุมัติใบเสนอราคา'`
  - `isDirectQt === false`: `badgeLabel = 'CUSTOMER PO VERIFIED'`, `shortLabel = 'PO ลูกค้า: <customer_po_no>'`, `docTitle = 'ใบสั่งซื้อจากลูกค้า'`
- ปรับ `buildSalesInvoicePayload`: เมื่อ `customerPoNo` ตรงกับ `quotation_no` ให้ลงหมายเหตุ `(อนุมัติตามใบเสนอราคา)` แทน `(PO ลูกค้า: QT-...)`

### 2. รวม Modal เป็นชุดเดียวใน `src/components/quotations/CustomerPoModal.jsx`

- หัวข้อ Modal: `CUSTOMER APPROVAL` — `บันทึกการอนุมัติใบเสนอราคา (QT-...)`
- สวิตช์เลือกประเภทการอนุมัติ 2 แบบ:
  1. `ลูกค้าเซ็นรับตามใบเสนอราคา (ใช้เลข QT-...)` *(ค่าเริ่มต้นเมื่อยังไม่มีเลข PO แยก)*
  2. `ลูกค้าออกใบ PO แยกต่างหาก` *(กรอกเลข PO ของลูกค้าเอง)*
- ป้ายช่องไฟล์แนบ: `แนบหลักฐานใบเสนอราคาที่ลูกค้าเซ็นรับ หรือใบสั่งซื้อลูกค้า (PDF/รูปภาพ)`
- รับ props เสริม `defaultAutoCreateAr` และ `initialValues` เพื่อใช้แทน modal inline ใน `QuotationDetail.jsx` ได้ทันที

### 3. ปรับจุดแสดงผลตาม `getCustomerApprovalDisplay(q)`

- `QuotationDetail.jsx`: ลบ inline modal ที่ซ้ำออก ใช้ `<CustomerPoModal />` ร่วมกัน และอัปเดต Banner / Step 3 / ปุ่มให้ใช้ข้อความที่ถูกตามประเภทเอกสาร
- `QuotationList.jsx`: ปรับป้าย `รอลูกค้าเซ็น PO` -> `รอลูกค้าอนุมัติ`, `+ บันทึก PO ก่อน` -> `+ บันทึกการอนุมัติ` และแสดงแท็กตาม `getCustomerApprovalDisplay`
- `CustomerPoPrintModal.jsx`, `QuotationPrintModal.jsx`, `QuotationShareModal.jsx`: ปรับหัวเอกสารและข้อความอ้างอิงไม่ให้เรียกเลข `QT-...` ว่าเป็น `"PO ลูกค้า"`

## Files to Create / Modify

- Modify: `src/lib/salesFlowUtils.js`, `src/components/quotations/CustomerPoModal.jsx`, `src/pages/quotations/QuotationDetail.jsx`, `src/pages/quotations/QuotationList.jsx`, `src/components/reports/CustomerPoPrintModal.jsx`, `src/components/reports/QuotationPrintModal.jsx`, `src/components/quotations/QuotationShareModal.jsx`
- Create / Update Tests: `tests/salesFlowQueries.test.js` (หรือ `tests/customerApproval.test.js`) ครอบคลุม helper ใหม่ทั้งหมดตาม TDD

## What's Left to the Builder

- จัดสไตล์ปุ่มสลับ `เซ็นตามใบเสนอราคา / มีใบ PO แยก` ใน `CustomerPoModal.jsx` ให้รองรับทั้ง Light/Dark theme
