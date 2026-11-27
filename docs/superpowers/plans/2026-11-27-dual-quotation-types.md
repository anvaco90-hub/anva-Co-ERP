# Dual Quotation Types (Project vs Product Sales) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dual quotation types (`'project'` BOQ-based and `'product'` Store-based) on the single `quotations` table with shared BOQ markup/pricing formulas, snapshot lifecycle, below-cost warnings, type-aware PDF output, and approval-gated shortfall PR creation.

**Architecture:** All money calculations (`cost -> markup -> discount -> VAT`) live once in `src/lib/tax.js` and power `BOQForm.jsx`, `boqToQuotation.js`, `QuotationForm.jsx`, `QuotationDetail.jsx`, and `quotationPrintUtils.js`. Quotation rows snapshot `base_cost` and `unit_price` on save, lock Store re-sync upon issuance (`sent`), gate PR/issue triggers behind `canCreatePrFromQuotation()`, and filter Print/PDF output per quotation type without exposing costs or stock status.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Supabase (PostgreSQL + RLS), Node built-in test runner (`node --test`).

**Spec:** [2026-11-27-dual-quotation-types-design.md](file:///e:/ERPV3/anva-Co-ERP/docs/superpowers/specs/2026-11-27-dual-quotation-types-design.md)

## Global Constraints

- Single `quotations` table with `type IN ('project', 'product')`, default `'project'`.
- Separated document numbers: `QT-P-YYYYMM-NNNN` (`project`) and `QT-S-YYYYMM-NNNN` (`product`).
- Single unified pricing function (`cost -> markup -> discount -> VAT`) shared across BOQ and Quotations — zero duplicated markup or VAT formulas.
- Markup is non-negative percentage only (`>= 0`), applied once per document (`applyMarkup(baseCost, markupPercent) = round2(baseCost * (1 + pct / 100))`). Any role with quotation access can edit Markup %.
- Rounding rule: round per-unit selling price to 2 decimal places (`round2`), compute each line total (`round2`), then sum line totals for `subtotal` / `after_discount` so line sums always match document totals cleanly.
- Product quotations support switching between `'whole_bill'` discount (`amount` Baht or `percent` %) and `'per_item'` discount (`discount_percent`); Project quotations force `'none'` (`0` discount).
- Retain 3-mode VAT switch (`vat_excluded`, `vat_included`, `vat_exempt`).
- Warn (do not block) when `after_discount < total_cost`, and record `issued_by`, `issued_by_name`, `issued_at`.
- Snapshot prices on save; manual Store sync allowed only while `status === 'draft'`; permanently locked from Store/BOQ price drift once issued (`sent`/`approved`).
- Customer Print/PDF never shows `base_cost`, `total_cost`, `markup_percent`, or stock status; `'project'` hides unit prices, line totals, discounts, and labor lines, while `'product'` shows markup-included unit price, line totals, optional discount, and grand total.
- Live stock check displays status at issuance/view, does NOT auto-create PR, and **locks PR/issue action triggers until customer approval** (`isQuotationApproved(q) === true`), then re-checks stock live on shortfall PR creation.

## Review Focus

- **BOQ ↔ QT-P penny parity:** With `base_cost = 10.01`, `qty = 7`, `markup = 15%`, unit selling price rounds to `11.51` BEFORE multiplying by `qty` (`80.57`), so `BOQForm` grand total equals `buildQuotationPayloadFromBoq` subtotal (`0.00` discrepancy).
- **Negative markup & over-discount guards:** Negative markup clamps to `0`; `whole_bill` discount (Baht or %) exceeding `subtotal` caps cleanly at `subtotal` so `after_discount >= 0` and `grand_total >= 0`.
- **Snapshot isolation & draft-only Store re-sync:** Editing `inventory_items.avg_unit_cost` or `boq_items` after saving never alters saved quotation `base_cost` / `unit_price`; manual re-sync is permitted strictly when `status === 'draft'`.
- **Customer PDF data leak & column isolation:** `'project'` print strips `unit_price`, `total_amount`, `discount_percent`, `base_cost`, and stock; `'product'` print strips `base_cost`, `markup_percent`, and stock while preserving customer selling prices.
- **Pre-approval PR lock & tracked `item_id` stock check:** Before customer approval (`status === 'draft' | 'sent'` without `customer_po_no`), `canCreatePrFromQuotation()` returns `false` and PR links remain disabled; Store items with valid `item_id` are never skipped as `'service'` even when unit is `'จุด'` or `'งาน'`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/046_dual_quotation_types.sql` | Add quotation `type`, `markup_percent`, `discount_mode`, `header_discount_*`, `total_cost`, `issued_by*` columns + `quotation_items.base_cost`, `item_code` + indexes & safe backfill |
| `dev_schema.sql` | Sync reference schema with migration 046 columns & constraints |
| `src/lib/tax.js` | Unified pricing engine: `QUOTATION_TYPES`, `applyMarkup`, `calculateDocumentPricing`, `evaluateBelowCost`, `generateTypedQuotationNo`, existing tax helpers |
| `src/lib/boqToQuotation.js` | Refactor BOQ conversion to use `applyMarkup` & `calculateDocumentPricing`, set `type: 'project'`, snapshot `base_cost` & `item_code`, add `saveQuotationItemsWithFallback` |
| `src/lib/quotationPrintUtils.js` | Type-aware customer PDF projection (`resolveQuotationType`, `getCustomerPrintMode`, `getCustomerPrintTableData`, cost/stock sanitization) |
| `src/lib/quotationListUtils.js` | Add `filterType` (`'all' \| 'project' \| 'product'`) and quotation type label metadata |
| `src/lib/quotationStockCheck.js` | Add `canCreatePrFromQuotation(quotation)` gate & prevent false `'service'` skip when `item_id` matches Store inventory |
| `src/lib/purchasingPricing.js` | Support snapshotted `qIt.base_cost` fallback cleanly when initializing PR cost baseline |
| `src/lib/salesFlowUtils.js` | Update `step4Detail` pre-approval messaging cleanly while keeping strict QT↔PR↔PO matching (`QT-P-` / `QT-S-` already match regex) |
| `src/pages/boq/BOQForm.jsx` | Replace inline `(totalCost * markupRate) / 100` with shared `calculateDocumentPricing` so BOQ and QT-P share exact formulas |
| `src/pages/boq/BOQDetail.jsx` | Use `generateTypedQuotationNo('project')`, pass `type: 'project'` snapshot fields, use `saveQuotationItemsWithFallback` |
| `src/components/quotations/CreateQuotationModal.jsx` | New modal on `+ สร้างใบเสนอราคา`: choose **ขายสินค้า (จาก Store)** or **รับงาน (จาก BOQ)** with BOQ selector |
| `src/pages/quotations/QuotationForm.jsx` | Full dual-type creation/editing UI: Store item picker (`SearchableItemSelect`), editable `base_cost`, whole-doc `markup_percent`, discount mode switch (`whole_bill` Baht/% vs `per_item`), live stock preview badge, below-cost warning, draft-only Store sync button, `issued_by` tracking |
| `src/pages/quotations/QuotationDetail.jsx` | Show type badge, below-cost warning + issuer metadata, `"ออกใบเสนอราคา / ส่งลูกค้า"` button (`draft -> sent` + locks snapshot + sets `issued_by`), hide/show discount column per mode, **lock PR & stock-issue actions before customer approval** |
| `src/components/reports/QuotationPrintModal.jsx` | Render type-specific columns (`project`: no prices/discounts; `product`: unit price with profit + line total + optional discount) using `quotationPrintUtils` |
| `src/pages/quotations/QuotationList.jsx` | Launch `CreateQuotationModal`, add `ประเภท` filter + row type badge |
| `tests/*.test.js` | Unit tests covering all 5 Review Focus edge cases + module behaviors |

---

### Task 1: Schema Migration & Reference Schema Sync

**Files:**
- Create: `supabase/migrations/046_dual_quotation_types.sql`
- Modify: `dev_schema.sql:1494-1556`
- Modify: `tests/salesFlowQueries.test.js` (optional column sanity check if needed)

**Interfaces:**
- Produces DB schema columns:
  - `quotations`: `type`, `markup_percent`, `discount_mode`, `header_discount_type`, `header_discount_value`, `total_cost`, `issued_by`, `issued_by_name`, `issued_at`
  - `quotation_items`: `base_cost`, `item_code`

- [ ] **Step 1: Write migration `supabase/migrations/046_dual_quotation_types.sql`**

Create `supabase/migrations/046_dual_quotation_types.sql` adding idempotent `ADD COLUMN IF NOT EXISTS` statements, `CHECK` constraints (`type IN ('project', 'product')`, `markup_percent >= 0`, `discount_mode IN ('none', 'whole_bill', 'per_item')`, `header_discount_type IN ('amount', 'percent')`, `header_discount_value >= 0`), `issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL`, `CREATE INDEX IF NOT EXISTS idx_quotations_type`, backfill `UPDATE public.quotations SET type = 'project' WHERE type IS NULL`, and `base_cost numeric(15,2) DEFAULT 0`, `item_code text` on `public.quotation_items`.

- [ ] **Step 2: Mirror exact columns in `dev_schema.sql`**

Add matching columns, constraints, and `idx_quotations_type` / FK constraint inside `dev_schema.sql` around `quotation_items` (`L1494-1507`) and `quotations` (`L1512-1556`) so schema readers and local setups match migration `046`.

- [ ] **Step 3: Validate SQL syntax & existing tests**

Run: `node --test tests/*.test.js`
Expected: PASS (44 existing tests remain green).

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/046_dual_quotation_types.sql dev_schema.sql
git commit -m "chore: add dual quotation type and cost snapshot schema migration 046"
```

---

### Task 2: Unified Pricing Pipeline & Typed Quotation Number Helpers (`src/lib/tax.js`)

**Files:**
- Modify: `src/lib/tax.js`
- Test: `tests/dualQuotationPricing.test.js` (new)

**Interfaces:**
- Produces in `src/lib/tax.js`:
  - `QUOTATION_TYPES = { PROJECT: 'project', PRODUCT: 'product' }`
  - `generateTypedQuotationNo(type = 'project', date = new Date(), randomDigits = null) -> string` (`QT-P-YYYYMM-NNNN` / `QT-S-YYYYMM-NNNN`)
  - `applyMarkup(baseUnitCost, markupPercent = 0) -> number` (clamps both `>= 0`, returns `round2(cost * (1 + pct / 100))`)
  - `calculateDocumentPricing({ items, markupPercent, pricingFromCost, discountMode, headerDiscountType, headerDiscountValue, taxType, vatRate, whtRate }) -> { lineRows, totalCost, markupAmount, grossSubtotal, subtotal, discountAmount, afterDiscount, amountBeforeVat, vatAmount, totalWithVat, whtAmount, netPayable, grandTotal, isBelowCost, belowCostAmount, profitAmount }`

- [ ] **Step 1: Write the failing unit tests in `tests/dualQuotationPricing.test.js`**

Write tests verifying:
1. `applyMarkup(10.01, 15)` returns `11.51`, and `applyMarkup(100, -10)` clamps negative markup to `0` (`100`).
2. `calculateDocumentPricing` Review Focus #1 (BOQ/QT per-unit rounding parity): `items: [{ quantity: 7, base_cost: 10.01 }]`, `markupPercent: 15` yields `unit_price: 11.51`, `lineTotal: 80.57`, `subtotal: 80.57`, `totalCost: 70.07`, `markupAmount: 10.5`.
3. `calculateDocumentPricing` product `whole_bill` discount (both `'amount'` Baht and `'percent'` %) and Review Focus #2 (discount > subtotal caps `discountAmount === subtotal`, `afterDiscount === 0`, `grandTotal === 0`).
4. `calculateDocumentPricing` product `per_item` discount (`lineDiscount = round2(lineGross * pct / 100)`, `lineTotal = round2(lineGross - lineDiscount)`, verifying `sum(lineTotals) === afterDiscount` and `subtotal - discountAmount === afterDiscount`).
5. `calculateDocumentPricing` all 3 VAT modes (`vat_excluded`, `vat_included`, `vat_exempt`) and `isBelowCost === true` + `belowCostAmount` when `afterDiscount < totalCost`.
6. `generateTypedQuotationNo('project', new Date('2026-11-27'), '1234')` -> `'QT-P-202611-1234'` and `'product'` -> `'QT-S-202611-1234'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dualQuotationPricing.test.js`
Expected: FAIL (`applyMarkup` / `calculateDocumentPricing` / `generateTypedQuotationNo` are not exported yet).

- [ ] **Step 3: Implement `applyMarkup`, `calculateDocumentPricing`, `generateTypedQuotationNo`, `QUOTATION_TYPES` in `src/lib/tax.js`**

Follow `cost -> applyMarkup(baseCost, markupPercent) [round2] -> lineTotal [round2] -> sum lines -> discount (none | whole_bill [amount|percent, capped <= subtotal] | per_item) -> calculateTaxBreakdown -> below-cost evaluation`. Reuse existing `round2` and `calculateTaxBreakdown`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dualQuotationPricing.test.js tests/purchasingFlow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tax.js tests/dualQuotationPricing.test.js
git commit -m "feat: add unified applyMarkup, calculateDocumentPricing, and typed QT numbers"
```

---

### Task 3: Unify `boqToQuotation.js` & `BOQForm.jsx` onto Shared Pricing Pipeline

**Files:**
- Modify: `src/lib/boqToQuotation.js:1-223`
- Modify: `src/pages/boq/BOQForm.jsx:410-445`
- Modify: `src/pages/boq/BOQDetail.jsx:239-278`
- Test: `tests/dualQuotationPricing.test.js` (append BOQ↔QT parity & `saveQuotationItemsWithFallback` tests)

**Interfaces:**
- Consumes from `src/lib/tax.js`: `applyMarkup`, `calculateDocumentPricing`, `generateTypedQuotationNo`, `round2`, `QUOTATION_TYPES`
- Produces in `src/lib/boqToQuotation.js`:
  - `buildQuotationItemsFromBoq(boq, boqItems)` returning `{ item_id?, item_code, item_name, description, quantity, unit, base_cost, unit_price, discount_percent: 0, total_amount }`
  - `buildQuotationPayloadFromBoq({ ..., salesPersonId = null })` setting `type: 'project'`, `discount_mode: 'none'`, `markup_percent: Number(boq?.markup_percent) || 0`, `total_cost`, `issued_by: salesPersonId || null`, `issued_by_name: salesPerson || null`, defaulting `quotationNo` via `generateTypedQuotationNo('project')`
  - `syncDraftItemsFromStore(items = [], inventoryItems = [], status = 'draft') -> Array` (returns refreshed `base_cost` from `inventory_items.avg_unit_cost` ONLY when `status === 'draft'`, returning unmodified items unchanged once `status !== 'draft'`)
  - `saveQuotationWithFallback` updating duplicate retry prefix cleanly using `generateTypedQuotationNo(activePayload.type || 'project')`
  - `saveQuotationItemsWithFallback(client, itemRows)` inserting into `quotation_items` with column-missing fallback stripping `base_cost` / `item_code` / `item_id` if needed

- [ ] **Step 1: Write failing parity, snapshot & fallback tests in `tests/dualQuotationPricing.test.js`**

Write tests verifying:
1. Review Focus #1: Computing BOQ totals via `calculateDocumentPricing` and converting via `buildQuotationPayloadFromBoq` with fractional unit costs (`material_unit_cost: 10.01, qty: 7, markup_percent: 15`) produces exact `boqGrandTotal === payload.subtotal`, sets `payload.type === 'project'`, `payload.discount_mode === 'none'`, `payload.discount_amount === 0`, and snapshots `itemRows[0].base_cost === 10.01`, `itemRows[0].unit_price === 11.51`.
2. Review Focus #3: `syncDraftItemsFromStore` updates `base_cost` from changed `inventory_items.avg_unit_cost` ONLY when `status === 'draft'`, and leaves items completely frozen when `status === 'sent'` or `'approved'`.
3. Duplicate `quotation_no` retry preserves typed prefix (`QT-P-` vs `QT-S-`).
4. `saveQuotationItemsWithFallback` strips `base_cost` / `item_code` cleanly when mock Supabase returns missing-column error and succeeds on retry.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dualQuotationPricing.test.js`
Expected: FAIL (`base_cost` missing, `type: 'project'` missing, `syncDraftItemsFromStore` / `saveQuotationItemsWithFallback` undefined).

- [ ] **Step 3: Refactor `src/lib/boqToQuotation.js`, `src/pages/boq/BOQForm.jsx`, and `src/pages/boq/BOQDetail.jsx`**

1. In `src/lib/boqToQuotation.js`: replace inline `markupRatio` in `buildQuotationItemsFromBoq` with `applyMarkup(rawUnitCost, boq?.markup_percent)`, compute `base_cost: round2(rawUnitCost)`, include `item_code: it?.item_code || null`, `item_id: it?.item_id || null`. Use `calculateDocumentPricing` in `buildQuotationPayloadFromBoq` setting `type: 'project'`, `markup_percent`, `discount_mode: 'none'`, `total_cost`, `issued_by: salesPersonId || null`, `issued_by_name: salesPerson || null`, and add `syncDraftItemsFromStore` + `saveQuotationItemsWithFallback`. Preserve existing fallback behavior in `saveQuotationWithFallback` with `generateTypedQuotationNo(activePayload.type || 'project')`.
2. In `src/pages/boq/BOQForm.jsx`: replace lines 441-444 with `calculateDocumentPricing({ items: [...materialPricingRows, ...laborPricingRows], markupPercent, pricingFromCost: true, discountMode: 'none', taxType: 'vat_exempt' })` so `totalCost`, `markupAmount`, and `grandTotal` use the exact same shared function as Quotations.
3. In `src/pages/boq/BOQDetail.jsx`: replace `QT-${ym}-${rand}` with `generateTypedQuotationNo('project')`, pass `salesPersonId: profile?.id || null` into `buildQuotationPayloadFromBoq`, and save item rows (`base_cost`, `item_code`) via `saveQuotationItemsWithFallback`.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/dualQuotationPricing.test.js tests/boqLabor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/boqToQuotation.js src/pages/boq/BOQForm.jsx src/pages/boq/BOQDetail.jsx tests/dualQuotationPricing.test.js
git commit -m "feat: unify BOQ and quotation pricing and add project QT snapshot fallback"
```

---

### Task 4: Type-Aware Customer Print/PDF Projections (`src/lib/quotationPrintUtils.js`)

**Files:**
- Modify: `src/lib/quotationPrintUtils.js`
- Test: `tests/quotationPrintUtils.test.js`

**Interfaces:**
- Produces in `src/lib/quotationPrintUtils.js`:
  - `resolveQuotationType(quotation) -> 'project' | 'product'`
  - `getCustomerPrintMode(quotation) -> { type, showUnitPrice, showLineTotal, showDiscount }`
  - `getCustomerPrintItems(items = [], quotation = null)` -> for `'project'` filters out `isServiceOrLaborItem`, strips `unit_price`, `total_amount`, `discount_percent`, `base_cost`, stock metadata; for `'product'` keeps Store items with selling `unit_price`, `discount_percent` (only when `discount_mode === 'per_item'`), `total_amount`, stripping `base_cost`, `markup_percent`, stock metadata.
  - `buildCustomerQuotationSummary(quotation)` -> hides `discountAmount` when `type === 'project'` (`discountAmount = 0`), preserves full VAT & net total summary for both types without any cost fields.

- [ ] **Step 1: Write failing tests in `tests/quotationPrintUtils.test.js`**

Add tests verifying Review Focus #4:
1. `'project'` quotation: `getCustomerPrintMode` returns `{ showUnitPrice: false, showLineTotal: false, showDiscount: false }`; `getCustomerPrintItems(rawItems, { type: 'project' })` hides labor lines and ensures printed row objects do NOT contain `unit_price`, `base_cost`, `stock`, or `qty_on_hand`.
2. `'product'` quotation (`discount_mode: 'whole_bill'` vs `'per_item'`): `getCustomerPrintMode` returns `showUnitPrice: true, showLineTotal: true`; rows preserve markup-included `unit_price` and `total_amount` while stripping `base_cost`, `markup_percent`, `inStock`, `qty_on_hand`; `buildCustomerQuotationSummary` shows `discountAmount` for `'product'` and forces `discountAmount: 0` for `'project'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/quotationPrintUtils.test.js`
Expected: FAIL (`resolveQuotationType` / `getCustomerPrintMode` undefined; `base_cost` not stripped).

- [ ] **Step 3: Implement type-aware Customer Print helpers in `src/lib/quotationPrintUtils.js`**

Preserve signature compatibility for existing callers calling `getCustomerPrintItems(items)` with 1 argument (`quotation = null` defaults cleanly to `'project'` labor filtering + cost sanitization).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/quotationPrintUtils.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/quotationPrintUtils.js tests/quotationPrintUtils.test.js
git commit -m "feat: add type-aware customer quotation print formatting without cost leaks"
```

---

### Task 5: List Filter by Quotation Type & PR/Stock Gate (`quotationListUtils.js`, `quotationStockCheck.js`, `purchasingPricing.js`)

**Files:**
- Modify: `src/lib/quotationListUtils.js`
- Modify: `src/lib/quotationStockCheck.js`
- Modify: `src/lib/purchasingPricing.js`
- Modify: `src/lib/salesFlowUtils.js`
- Test: `tests/quotationListUtils.test.js`, `tests/quotationStockCheck.test.js`

**Interfaces:**
- Produces in `src/lib/quotationListUtils.js`:
  - `getQuotationTypeMeta(quotation) -> { type: 'project' | 'product', label, shortLabel }`
  - `filterQuotations(quotations, { filterStatus, filterType = 'all', filterProject, search, dateFrom, dateTo })`
- Produces in `src/lib/quotationStockCheck.js`:
  - `canCreatePrFromQuotation(quotation) -> boolean` (delegates to `isQuotationApproved` semantics: true ONLY when `status === 'approved' || status === 'partial' || Boolean(customer_po_no)` and not cancelled/rejected/expired)
  - Tracked `item_id` inventory matching check in `checkQuotationStock`: if `qItem.item_id` matches `invById`, never skip as `'service'`.
- Updates in `src/lib/purchasingPricing.js`:
  - Include `qIt.base_cost` as tertiary `cost_baseline` fallback before leaving `''`, preserving existing `boqMatCost -> inv.avg_unit_cost` precedence.

- [ ] **Step 1: Write failing tests in `tests/quotationListUtils.test.js` & `tests/quotationStockCheck.test.js`**

Add tests verifying:
1. `filterQuotations(..., { filterType: 'product' | 'project' | 'all' })` filters accurately (treating legacy rows without `type` as `'project'`), and `getQuotationTypeMeta` returns clear badges.
2. Review Focus #5: `canCreatePrFromQuotation` returns `false` for `'draft'`, `'sent'`, `'rejected'`, `'expired'` and `true` only when customer approved; `checkQuotationStock` checks stock for Store product items with `item_id` matching inventory even if `unit === 'จุด'` or `'งาน'`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/quotationListUtils.test.js tests/quotationStockCheck.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement type filters, PR lock gate, tracked `item_id` stock check, and `base_cost` PR fallback**

Update `src/lib/quotationListUtils.js`, `src/lib/quotationStockCheck.js`, `src/lib/purchasingPricing.js`, and check `src/lib/salesFlowUtils.js` (`computeQuotationWorkflow` already treats `!isApproved` as `step4State = 'pending'` `'รออนุมัติ QT'`; add `canOpenPr: isApproved` flag cleanly on workflow return object).

- [ ] **Step 4: Run all library unit tests**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/quotationListUtils.js src/lib/quotationStockCheck.js src/lib/purchasingPricing.js src/lib/salesFlowUtils.js tests/quotationListUtils.test.js tests/quotationStockCheck.test.js
git commit -m "feat: add quotation type filtering, pre-approval PR gate, and tracked Store stock checks"
```

---

### Task 6: Create Type Selector Modal & Update `QuotationList.jsx`

**Files:**
- Create: `src/components/quotations/CreateQuotationModal.jsx`
- Modify: `src/pages/quotations/QuotationList.jsx`

**Interfaces:**
- Consumes: `fetchUnifiedCustomers` / `boqs` list (from Supabase inside `CreateQuotationModal`), `getQuotationTypeMeta`, `filterQuotations` with `filterType`
- Props for `CreateQuotationModal`: `{ isOpen, onClose }`

- [ ] **Step 1: Create `src/components/quotations/CreateQuotationModal.jsx`**

Modal presented when clicking `+ สร้างใบเสนอราคา` on `QuotationList`:
- Two clear option cards:
  1. **ขายสินค้า (Product Sales — จาก Store)** -> navigates directly to `/quotations/new?type=product`
  2. **รับงาน (Project / BOQ — อ้างอิง BOQ)** -> loads available BOQs (`draft` / `approved`), lets user pick a BOQ and jump straight to `/boq/:id` (to trigger `"แปลงเป็นใบเสนอราคา"` with VAT preview) OR click `"ไปหน้าระบบ BOQ"` (`/boq`) to create a BOQ first.

- [ ] **Step 2: Update `src/pages/quotations/QuotationList.jsx`**

- Change `+ สร้างใบเสนอราคา` link to a button opening `CreateQuotationModal`.
- Add `filterType` state (`'all' | 'project' | 'product'`), toolbar filter pills/dropdown (`ทุกประเภท` / `รับงาน (BOQ)` / `ขายสินค้า (Store)`), include `filterType` in `filterQuotations`, `hasFilter`, `clearAllFilters`, and `useEffect` page reset.
- Display concise Type badge (`รับงาน` vs `ขายสินค้า`) under/beside `quotation_no` using `getQuotationTypeMeta(q)`.
- Support dark mode classes matching existing `QuotationList.jsx` palette.

- [ ] **Step 3: Build & smoke-check**

Run: `npm.cmd run build`
Expected: Vite production build passes with 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add src/components/quotations/CreateQuotationModal.jsx src/pages/quotations/QuotationList.jsx
git commit -m "feat: add quotation type creation modal and type filter/badges in QuotationList"
```

---

### Task 7: Dual-Mode `QuotationForm.jsx` (Store Picker, Editable Cost, Markup %, Dual Discount, Warning & Snapshot)

**Files:**
- Modify: `src/pages/quotations/QuotationForm.jsx`

**Interfaces:**
- Consumes from `src/lib/tax.js`: `calculateDocumentPricing`, `generateTypedQuotationNo`, `round2`
- Consumes from `src/lib/quotationStockCheck.js`: `checkQuotationStock`
- Consumes from `src/lib/boqToQuotation.js`: `buildQuotationItemsFromBoq`, `syncDraftItemsFromStore`, `saveQuotationWithFallback`, `saveQuotationItemsWithFallback`
- Consumes component: `SearchableItemSelect` (`src/components/SearchableItemSelect.jsx`)

- [ ] **Step 1: Add dual-type & pricing state in `QuotationForm.jsx`**

- Read `?type=product|project` (default `'product'` if opened directly without `boq_id`, or `'project'` if `boq_id` is passed; on edit/duplicate load `q.type || (q.boq_id ? 'project' : 'product')`).
- Regenerate typed prefix (`QT-S-YYYYMM-NNNN` / `QT-P-YYYYMM-NNNN`) when creating new or switching type cleanly (avoid overriding user-edited `quotationNo` on edit).
- Fetch `inventory_items` including `qty_on_hand` (`id, item_code, item_name, unit, qty_on_hand, avg_unit_cost`) so Store picker & live stock preview work cleanly.
- Add state: `markupPercent` (`'0'` default for product, non-negative `>= 0`), `discountMode` (`'whole_bill' | 'per_item'` for `'product'`; `'none'` forced for `'project'`), `headerDiscountType` (`'amount' | 'percent'`), `headerDiscountValue` (`'0'`), `issuedBy`, `issuedByName`, `issuedAt`.
- Add top type switcher / header badge on create mode (confirming before clearing incompatible lines if user toggles manually), while locking `type` on edit if already sent/approved.

- [ ] **Step 2: Implement Product Sales Item Rows & Live Stock Preview (`type === 'product'`)**

- Each item row stores `{ id?, item_id, item_code, item_name, description, quantity, unit, base_cost, unit_price, discount_percent }`.
- When `type === 'product'`: render `SearchableItemSelect` (picking from Store `inventory_items`) populating `item_id`, `item_code`, `item_name`, `unit`, `base_cost = String(round2(avg_unit_cost || 0))`.
- Make `base_cost` (ต้นทุน/หน่วย จาก Store) directly editable per item! Show computed selling `unit_price` (`applyMarkup(base_cost, markupPercent)`) clearly as read-only customer price column per row so user sees real-time `ต้นทุน → ราคาขาย (รวมมาร์กอัป)`.
- When `status === 'draft'` in edit mode (`type === 'product'`), provide manual `"ซิงค์ต้นทุนล่าสุดจาก Store"` button (re-populates `base_cost` from current `inventory_items.avg_unit_cost` only when clicked, never auto-overwrites!). Hide/disable button once `status !== 'draft'`.
- Show live stock badge (`checkQuotationStock` against loaded `inventory_items`) per row without any auto-PR action.

- [ ] **Step 3: Wire Unified Pricing Engine, Discount Mode Toggle & Below-Cost Warning Banner**

- Replace old lines 336-361 math in `QuotationForm.jsx` completely with `calculateDocumentPricing(...)`.
- In Card 4 (`Financial Calculations`):
  - For `'product'`: show single whole-quotation `Markup %` input (`min="0"`, `step="0.5"`, non-negative enforced; open to all roles with quotation access) AND Discount Mode toggle (`ส่วนลดทั้งใบ [บาท/%]` vs `ส่วนลดต่อรายการ [%]`).
  - For `'project'`: hide discount controls completely (`discount = 0`) and show `markup_percent` info badge if loaded from BOQ.
  - Keep existing 3-mode VAT selector & WHT selector.
  - When `pricing.isBelowCost === true`: render prominent amber/rose non-blocking warning banner showing exact gap (`ราคาหลังหักส่วนลดต่ำกว่าต้นทุนรวม -฿X`) + label `"ระบบไม่ล็อกการบันทึก แต่จะบันทึกชื่อผู้ออกใบเสนอราคา (${profile?.full_name || salesPerson})"`.
- In `save()`:
  - Persist `type`, `markup_percent`, `discount_mode`, `header_discount_type`, `header_discount_value`, `total_cost`, `subtotal`, `discount_amount`, `after_discount`, `vat_*`, `wht_*`, `grand_total`, plus `created_by`, `issued_by`, `issued_by_name` (`profile?.id`, `profile?.full_name || salesPerson`), `issued_at`.
  - Persist items via `saveQuotationWithFallback` + `saveQuotationItemsWithFallback` writing `item_id`, `item_code`, `base_cost`, `unit_price`, `discount_percent`, `total_amount`.

- [ ] **Step 4: Verify Build & Manual Check**

Run: `node --test tests/*.test.js` and `npm.cmd run build`
Expected: All unit tests pass and Vite build completes cleanly.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/quotations/QuotationForm.jsx
git commit -m "feat: implement dual-type QuotationForm with Store picker, single markup, discount modes, and snapshot"
```

---

### Task 8: Update `QuotationDetail.jsx` & `QuotationPrintModal.jsx` (Issuance Lock, Below-Cost Display, Type-Specific PDF, Pre-Approval PR Gate)

**Files:**
- Modify: `src/pages/quotations/QuotationDetail.jsx`
- Modify: `src/components/reports/QuotationPrintModal.jsx`

**Interfaces:**
- Consumes from `src/lib/quotationStockCheck.js`: `canCreatePrFromQuotation`
- Consumes from `src/lib/quotationPrintUtils.js`: `buildCustomerQuotationSummary`, `getCustomerPrintItems`, `getCustomerPrintMode`
- Consumes from `src/lib/quotationListUtils.js`: `getQuotationTypeMeta`

- [ ] **Step 1: Update `QuotationDetail.jsx` Header, Issuance Action, Cost/Margin Guardrail & PR Lock**

1. Header badge & banner: show `getQuotationTypeMeta(quotation)` badge (`รับงาน (BOQ)` vs `ขายสินค้า (Store)`). If `status === 'draft'`, add primary action button `"ออกใบเสนอราคา / ส่งลูกค้า"` that sets `status: 'sent'`, `issued_by: profile?.id`, `issued_by_name: profile?.full_name || quotation.sales_person`, `issued_at: new Date().toISOString()` via `saveQuotationWithFallback`.
2. Status dropdown `handleStatusChange`: when transitioning to `'sent'` or `'approved'` without existing `issued_by`, persist `issued_by`, `issued_by_name`, `issued_at` cleanly.
3. Below-cost internal warning: if `total_cost > 0 && after_discount < total_cost` (comparing persisted snapshot fields or computed item `base_cost * qty`), render an internal warning box (`no-print`) showing `ต้นทุนรวม`, `ราคาหลังส่วนลด`,ส่วนต่างขาดทุน, และชื่อ `ผู้ออกใบเสนอราคา (issued_by_name || sales_person)`.
4. Table columns in `QuotationDetail`:
   - For `'product'`: show internal `ต้นทุน/หน่วย` badge under price (or internal column with `no-print`), `ราคาขาย/หน่วย`, `ส่วนลด` (only if `discount_mode === 'per_item'`), `ราคารวม`, and `เช็กสต็อกภายใน`.
   - For `'project'`: hide discount column when `discount_amount === 0`, keep BOQ unit price & stock check internal.
5. **Pre-approval PR & Stock Issue Gate (`canCreatePrFromQuotation(quotation)`):**
   - Check BOTH Step 4 workflow card (`L787-830`) AND Section 5 stock summary bar (`L1221-1260`) AND per-row `"เปิด PR"` / `"เบิกสต็อก"` links (`L1328-1425`)!
   - When `!canCreatePrFromQuotation(quotation)`: hide/disable active `/purchasing/pr/new` and `/store/issue/new` links; instead show informational lock badge `"รอลูกค้าเซ็นอนุมัติก่อนเปิด PR / เบิกสโตร์"` (while STILL displaying all live stock status badges `พร้อมเบิก / มีบางส่วน / ของหมด` per row!).
   - Also check Banner right button `"ส่งต่อจัดซื้อ (เปิด PO)"` stays only visible when `quotation.customer_po_no` / approved (`L394-411`).

- [ ] **Step 2: Update `QuotationPrintModal.jsx` for Type-Specific Customer PDF**

- Use `getCustomerPrintMode(quotation)` and `getCustomerPrintItems(items, quotation)`:
  - Title badge optionally displays `ใบเสนอราคา` cleanly without internal jargon.
  - When `mode.showUnitPrice === false` (`type === 'project'`): keep the 4-column table (`ลำดับ | รายการสินค้า / รายละเอียด | จำนวน | หน่วย`), hide discount block in summary (`summary.discountAmount === 0`), show VAT breakdown + `ยอดรวมทั้งสิ้น (สุทธิ)`.
  - When `mode.showUnitPrice === true` (`type === 'product'`): render 6 columns (or 7 columns when `mode.showDiscount && quotation.discount_mode === 'per_item'`): `ลำดับ | รายการสินค้า / รายละเอียด | จำนวน | หน่วย | ราคา/หน่วย (รวมกำไรแล้ว) | [ส่วนลด %] | จำนวนเงิน`, and in summary show `มูลค่ารวม (Subtotal)` + `ส่วนลดทั้งใบ` (if `discountAmount > 0`) + VAT breakdown + `ยอดรวมทั้งสิ้น (สุทธิ)`.
  - **Strict guardrail:** Zero `base_cost`, `total_cost`, `markup_percent`, or stock status anywhere inside `QuotationPrintModal.jsx`.

- [ ] **Step 3: Build & Run Unit Tests**

Run: `node --test tests/*.test.js` and `npm.cmd run build`
Expected: PASS and build cleanly.

- [ ] **Step 4: Commit**

```powershell
git add src/pages/quotations/QuotationDetail.jsx src/components/reports/QuotationPrintModal.jsx
git commit -m "feat: add approval-gated PR locks, issuer warning, and type-specific customer PDF"
```

---

### Task 9: Verify Live Shortfall PR Flow (`PRForm.jsx`), Final Verification & Knowledge Graph Update

**Files:**
- Check/Modify (only if needed): `src/pages/purchasing/PRForm.jsx`
- Run full test suite, Vite production build, and `graphify update .`

- [ ] **Step 1: Verify `PRForm.jsx` shortfall live stock re-check with `product` quotations**

Inspect `PRForm.jsx` (`L101-247`) when opened via `/purchasing/pr/new?quotation_id=...&shortfall_only=1` for a `'product'` quotation:
- Confirm `inventory_items` is freshly fetched from Supabase on mount and passed to `buildShortfallPrItems`.
- Confirm `purchasingPricing.js` picks up snapshotted `qIt.base_cost` or Store `avg_unit_cost` without pulling customer markup into PR estimated cost.
- Confirm if user visits `/purchasing/pr/new?quotation_id=...` manually for an unapproved quotation, display a clear amber warning badge `"คำเตือน: ใบเสนอราคานี้ยังไม่มีบันทึกการอนุมัติจากลูกค้า"`.

- [ ] **Step 2: Run full test suite and Vite build**

Run (PowerShell):
```powershell
node --test tests/*.test.js; if ($LASTEXITCODE -eq 0) { npm.cmd run build }
```
Expected: All test suites PASS (0 failures) and `vite build` succeeds with 0 errors.

- [ ] **Step 3: Update graphify knowledge graph (per user rules)**

Run:
```powershell
python -m graphify update .
```
Expected: AST update completes with 0 errors.

- [ ] **Step 4: Final Commit**

```powershell
git add -A
git commit -m "feat: complete dual quotation types integration, verification, and graph update"
```
