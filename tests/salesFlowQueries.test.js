import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQuotationPoQuerySpecs,
  buildQuotationPrQuerySpecs,
  buildQuotationIssueQuerySpecs,
  extractPrSourceQuotation,
  computeQuotationWorkflow,
} from '../src/lib/salesFlowUtils.js'

const VALID_PO_COLUMNS = new Set([
  'id',
  'po_no',
  'pr_id',
  'project_id',
  'vendor_id',
  'order_date',
  'total_amount',
  'status',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
  'buyer_name',
  'payment_type',
  'payment_term_days',
  'quotation_no',
  'quotation_date',
  'quotation_url',
  'tax_type',
  'vat_rate',
  'vat_amount',
  'wht_rate',
  'wht_amount',
  'net_amount',
  'deposit_type',
  'deposit_percent',
  'deposit_amount',
  'remaining_amount',
  'payment_channel_requested',
  'payment_status',
  'deposit_paid_amount',
  'vendor_tax_invoice_no',
  'tax_invoice_date',
  'subtotal',
  'expected_delivery_date',
  'delivery_address',
  'notes',
  'customer_name',
  'custom_project_name',
  'custom_vendor_name',
  'grand_total',
  'has_deposit',
  'quotation_id',
  'sales_quotation_no',
])

const VALID_PR_COLUMNS = new Set([
  'id',
  'pr_no',
  'project_id',
  'requested_by',
  'request_date',
  'status',
  'notes',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
  'customer_name',
  'custom_project_name',
  'suggested_vendor',
  'quotation_id',
  'sales_quotation_no',
])

const VALID_ISSUE_COLUMNS = new Set([
  'id',
  'issue_no',
  'issue_date',
  'project_id',
  'notes',
  'created_at',
  'issue_target',
  'issue_reason',
  'target_location',
  'issued_by',
])

describe('Quotation Linked PO/PR/Issue Query Specs (src/lib/salesFlowUtils.js)', () => {
  it('links POs strictly by QT ID, sales_quotation_no, notes, and matched PR IDs without project_id or vendor quotation_no leakage', () => {
    const specs = buildQuotationPoQuerySpecs(
      {
        id: '767ae2bb-e599-4713-8a4b-02308f9bba6a',
        quotation_no: 'QT-202611-9828',
        project_id: '8e01ed62-39d7-4df1-8ddf-93d545e050eb',
      },
      ['pr-111', 'pr-222']
    )

    for (const col of specs.primarySelect.split(',').map((s) => s.trim())) {
      assert.ok(VALID_PO_COLUMNS.has(col), `Invalid primary purchase_orders column: ${col}`)
    }
    for (const col of specs.fallbackSelect.split(',').map((s) => s.trim())) {
      assert.ok(VALID_PO_COLUMNS.has(col), `Invalid fallback purchase_orders column: ${col}`)
    }

    assert.match(specs.primaryOr, /quotation_id\.eq\.767ae2bb-e599-4713-8a4b-02308f9bba6a/)
    assert.match(specs.primaryOr, /sales_quotation_no\.eq\.QT-202611-9828/)
    assert.match(specs.primaryOr, /notes\.ilike\.%QT-202611-9828%/)
    assert.match(specs.primaryOr, /pr_id\.eq\.pr-111/)
    assert.match(specs.primaryOr, /pr_id\.eq\.pr-222/)

    // Must NEVER match whole project_id or vendor quotation_no
    assert.doesNotMatch(specs.primaryOr, /project_id\.eq\./)
    assert.doesNotMatch(specs.primaryOr, /(^|,)quotation_no\.eq\./)
    assert.doesNotMatch(specs.fallbackOr, /project_id\.eq\./)
    assert.doesNotMatch(specs.fallbackOr, /(^|,)quotation_no\.eq\./)

    assert.match(specs.fallbackOr, /notes\.ilike\.%QT-202611-9828%/)
    assert.match(specs.fallbackOr, /pr_id\.eq\.pr-111/)
  })

  it('links PRs strictly by QT ID, sales_quotation_no, and notes without project_id leakage', () => {
    const poEmpty = buildQuotationPoQuerySpecs({ id: 'qt-only' })
    assert.equal(poEmpty.fallbackOr, '')

    const prSpecs = buildQuotationPrQuerySpecs({
      id: 'qt-only',
      quotation_no: 'QT-1',
      project_id: 'prj-999',
    })
    for (const col of prSpecs.primarySelect.split(',').map((s) => s.trim())) {
      assert.ok(VALID_PR_COLUMNS.has(col), `Invalid PR primary column: ${col}`)
    }
    for (const col of prSpecs.fallbackSelect.split(',').map((s) => s.trim())) {
      assert.ok(VALID_PR_COLUMNS.has(col), `Invalid PR fallback column: ${col}`)
    }

    assert.match(prSpecs.primaryOr, /quotation_id\.eq\.qt-only/)
    assert.match(prSpecs.primaryOr, /sales_quotation_no\.eq\.QT-1/)
    assert.match(prSpecs.primaryOr, /notes\.ilike\.%QT-1%/)
    assert.doesNotMatch(prSpecs.primaryOr, /project_id\.eq\./)
    assert.doesNotMatch(prSpecs.fallbackOr, /project_id\.eq\./)
    assert.equal(prSpecs.fallbackOr, 'notes.ilike.%QT-1%')
  })

  it('builds valid stock_issues query specs matching quotation_no in notes', () => {
    const issueSpecs = buildQuotationIssueQuerySpecs({
      id: 'qt-1',
      quotation_no: 'QT-202611-9828',
      project_id: 'prj-1',
    })

    for (const col of issueSpecs.select.split(',').map((s) => s.trim())) {
      assert.ok(VALID_ISSUE_COLUMNS.has(col), `Invalid stock_issues column: ${col}`)
    }
    assert.equal(issueSpecs.orFilter, 'notes.ilike.%QT-202611-9828%')
    assert.equal(buildQuotationIssueQuerySpecs({ id: 'qt-no-num' }).orFilter, '')
  })

  it('extracts source quotation ID and QT number from PR columns or notes cleanly', () => {
    assert.deepEqual(
      extractPrSourceQuotation({
        quotation_id: 'qt-uuid-1',
        sales_quotation_no: 'QT-202611-9828',
        notes: '',
      }),
      { quotationId: 'qt-uuid-1', quotationNo: 'QT-202611-9828' }
    )

    assert.deepEqual(
      extractPrSourceQuotation({
        quotation_id: null,
        sales_quotation_no: null,
        notes: 'ขอสั่งซื้อของเพิ่ม [QT ขาย: QT-202611-9828] โครงการ PJ-000002',
      }),
      { quotationId: null, quotationNo: 'QT-202611-9828' }
    )

    assert.deepEqual(extractPrSourceQuotation({ notes: 'จัดซื้อวัสดุทั่วไป' }), {
      quotationId: null,
      quotationNo: null,
    })
  })
})

describe('computeQuotationWorkflow Step 4 with Stock & Issues (src/lib/salesFlowUtils.js)', () => {
  const approvedQt = {
    id: 'qt-1',
    quotation_no: 'QT-202611-9828',
    status: 'approved',
    customer_po_no: 'QT-202611-9828',
  }

  it('keeps Step 4 non-done (ready/in_progress) when shortages exist and no PR/PO has been created yet, even if some items are in stock', () => {
    const wf = computeQuotationWorkflow({
      quotation: approvedQt,
      prs: [],
      pos: [],
      invoices: [],
      stockSummary: { totalChecked: 3, shortageCount: 2, issuableCount: 1 },
      issues: [],
    })
    assert.equal(wf.step4State, 'ready')
    assert.notEqual(wf.step4State, 'done')
  })

  it('keeps Step 4 in_progress when PO is received but issuable store stock has not been issued yet', () => {
    const wf = computeQuotationWorkflow({
      quotation: approvedQt,
      prs: [{ id: 'pr-1', pr_no: 'PR2026-0007', status: 'ordered' }],
      pos: [{ id: 'po-1', po_no: 'PO2026-0010', status: 'received' }],
      invoices: [],
      stockSummary: { totalChecked: 3, shortageCount: 2, issuableCount: 1 },
      issues: [],
    })
    assert.equal(wf.step4State, 'in_progress')
    assert.match(wf.step4Badge, /เบิก|รอเบิก/)
    assert.match(wf.step4Detail, /เบิก/)
  })

  it('marks Step 4 done only when shortages are received via PO AND issuable store stock has an active issue', () => {
    const wf = computeQuotationWorkflow({
      quotation: approvedQt,
      prs: [{ id: 'pr-1', pr_no: 'PR2026-0007', status: 'ordered' }],
      pos: [{ id: 'po-1', po_no: 'PO2026-0010', status: 'received' }],
      invoices: [],
      stockSummary: { totalChecked: 3, shortageCount: 2, issuableCount: 1 },
      issues: [{ id: 'iss-1', issue_no: 'ISS-202611-001' }],
    })
    assert.equal(wf.step4State, 'done')
    assert.equal(wf.activeIssues.length, 1)
    assert.equal(wf.latestIssue.issue_no, 'ISS-202611-001')
  })

  it('keeps Step 4 in_progress when all items are in stock (shortageCount=0) until a stock issue is created', () => {
    const wfPendingIssue = computeQuotationWorkflow({
      quotation: approvedQt,
      prs: [],
      pos: [],
      invoices: [],
      stockSummary: { totalChecked: 2, shortageCount: 0, issuableCount: 2 },
      issues: [],
    })
    assert.equal(wfPendingIssue.step4State, 'ready')

    const wfIssued = computeQuotationWorkflow({
      quotation: approvedQt,
      prs: [],
      pos: [],
      invoices: [],
      stockSummary: { totalChecked: 2, shortageCount: 0, issuableCount: 2 },
      issues: [{ id: 'iss-2', issue_no: 'ISS-202611-002' }],
    })
    assert.equal(wfIssued.step4State, 'done')
  })

  it('does NOT let an unrelated Draft quotation mark Step 4 done from missing approval when stockSummary has items', () => {
    const wfDraft = computeQuotationWorkflow({
      quotation: { id: 'qt-draft', quotation_no: 'QT-202611-9999', status: 'draft' },
      prs: [],
      pos: [],
      invoices: [],
      stockSummary: { totalChecked: 2, shortageCount: 2, issuableCount: 0 },
      issues: [],
    })
    assert.equal(wfDraft.step4State, 'pending')
  })
})
