# Design Spec: QT Print Product-Only, QT→PR Anti-Duplicate Linkage, PO Form Redesign, and Purchasing Handoff (4A / 1A)

**Date:** 2026-11-26  
**Status:** Approved (`1A`, `4A`)

## 1. Quotation PDF Print (`1A` — Product Items Only)
- **File(s):** `src/lib/quotationPrintUtils.js`, `src/components/reports/QuotationPrintModal.jsx`
- **Decision (`1A`):** Filter out service and labor lines using existing `isServiceOrLaborItem(item)` when rendering the A4 PDF item table in `QuotationPrintModal`.
- **Financial Integrity:** Keep customer package totals (`subtotal`, `discountAmount`, `amountBeforeVat`, `vatAmount`, `whtAmount`, `grandTotal`, and VAT status badge) untouched via `buildCustomerQuotationSummary(quotation)`. The customer still sees the full contract price & VAT status cleanly without seeing internal Watt/labor line breakdowns.
- **Fallback:** If a quotation contains *only* service/labor lines, display a concise single summary notice row instead of an empty table body.

## 2. QT ↔ PR Linkage & Anti-Duplicate Guard
- **Files:** `src/lib/quotationStockCheck.js`, `src/lib/salesBilling.js`, `src/pages/quotations/QuotationDetail.jsx`, `src/pages/purchasing/PRForm.jsx`
- **Behavior:**
  1. `fetchQuotationLinkedDocs` also loads `purchase_requisition_items` for `matchedPrIds` and attaches items to each PR.
  2. `summarizeQuotationPrCoverage(shortfallItems, existingPrItems)` compares shortfall items against items already requested on active linked PRs (by normalized item name / `item_id`), returning `{ uncoveredItems, uncoveredCount, requestedByName }`.
  3. In `QuotationDetail.jsx`:
     - Step 4 and Section 5 stock banner/rows display linked PR number pills (e.g. `PR2026-0008 →`).
     - When `activePRs.length > 0 && uncoveredCount === 0`, primary CTA becomes `ดูใบขอซื้อ (${latestPR.pr_no})` (no misleading `"เปิด PR ส่วนที่ขาด"` duplicate prompt), with only a subtle secondary `+ เปิด PR เพิ่ม` link.
     - When `uncoveredCount > 0`, show remaining uncovered count (`เปิด PR ส่วนที่ยังไม่ขอ (${uncoveredCount})`).
  4. In `PRForm.jsx`: When opened with `?quotation_id=...`, check for active linked PRs; show a prominent warning banner linking to existing PR(s) and exclude already-requested items when `shortfall_only=1` (with an optional override toggle).

## 3. Remove Disbursement Execution (`PAY`) from Purchasing (`4A`)
- **Domain Boundary:** Purchasing manages procurement terms (*how* a PO is to be paid: credit term, cash, deposit agreement, channel), goods ordering, and warehouse receiving (`GR/RI`). Actual disbursement execution, payment vouchers (`PV`), cumulative paid amounts, and remaining AP balances belong to the upcoming Accounting module and are removed from PO views. (AR customer receipts `RC` on Quotations remain untouched.)
- **Files:**
  - `src/components/purchasing/ProcurementWorkflowStepper.jsx`: Refactor `computeProcurementFlow`, `CompactProcurementSteps`, and `ProcurementWorkflowStepper` into a **4-step Purchasing Pipeline**: `1. PR → 2. PO → 3. ตรวจรับเข้าสโตร์ (GR/RI) → 4. ปิดงานจัดซื้อ (ส่งต่อบัญชี)`. Completion = `!isCancelled && isFullyReceived` (or `allReceived` in `pr` mode).
  - `src/pages/purchasing/PODetail.jsx`: Remove `PaymentActionModal`, `PAY` header CTA, `payments` history state/tab/fetch, paid/remaining badges, and Step 4 PV card; retain Payment *Terms* summary in Tab 1 & Card 3.
  - `src/pages/purchasing/PurchasingHub.jsx`: Remove `PaymentActionModal`, `จ่าย` row/card/dropdown buttons, `receivedUnpaidPos` / `fullyClosedPos` metrics, and switch Pipeline KPI grid to 4 Purchasing stages ending at `4. รับของครบ · ปิดงานจัดซื้อ`.

## 4. PO Form Redesign (`/frontend-design`)
- **File:** `src/pages/purchasing/POForm.jsx`
- **Aesthetic & Layout Plan:**
  - **Surface / Tokens:** Crisp light/dark-compatible industrial ERP sheet (`#FFFFFF` / `#0F172A` header, `#F8FAFC` / `#1E293B` section panels, `#0284C7` primary sky action, `#D97706` amber highlight for active PR/multi-PO context, `#0F766E` / `#047857` emerald net totals). Zero empty `<span></span>` placeholders, consistent `rounded-xl` cards (`border-slate-200 dark:border-slate-800`).
  - **Information Architecture (Buyer Mental Order):**
    1. **Document Header + PR/QT Source & Counterparties:** PR selector (`SearchableSelect` / Direct PO) + Multi-PO remaining banner -> 2-column Partner grid (`Project Cost Center & Client` | `Vendor & Buyer` + Vendor suggestions).
    2. **Order Items & QT Cost Baseline (`ItemsEditor`):** Sales QT pricing baseline toggle + `ItemsEditor` positioned *before* financial/deposit calculations so quantities & unit prices establish `netAmount` first.
    3. **Two-Column Bottom Workspace (`lg:grid-cols-12` — 7 cols Logistics & Payment Terms / 5 cols Tax & Net Summary):**
       - Left (7 cols): Delivery schedule & address/notes, **Payment Terms Plan** ("รูปแบบและเงื่อนไขการชำระเงินที่ตกลง" — credit/cash/channel & optional deposit split calculated live from entered items), plus Vendor Quote attachment & optional post-receipt Vendor Tax Invoice reference (no scary red mandatory `*` when opening a PO).
       - Right (5 cols): Live Financial & Tax Calculator (`VAT`, `WHT ภ.ง.ด.3/53`, Breakdown Card + Deposit/Remaining preview).
    4. **Clean Action Footer:** Clear purchasing wording: `"บันทึกใบสั่งซื้อ (PO)"` and `"บันทึกฉบับร่าง"` (replacing accounting-execution phrasing `"ส่งเรื่องไปยังฝ่ายบัญชี (รอชำระเงิน)"`).
