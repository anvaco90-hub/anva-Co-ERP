import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQuotationPurchasingMap,
  computeQuotationKpis,
  filterQuotations,
  getQuotationRowAmountMeta,
  isQuotationApproved,
  resolveInitialStatusFilter,
} from '../src/lib/quotationListUtils.js'

const SAMPLE_QUOTATIONS = [
  {
    id: 'qt-1',
    quotation_no: 'QT-202611-9828',
    status: 'approved',
    customer_po_no: 'QT-202611-9828',
    customer_name: 'PTTสเตง',
    project_id: 'pj-2',
    projects: { project_code: 'PJ-000002', project_name: 'ติดตั้งตู้AC' },
    quotation_date: '2026-11-25',
    tax_type: 'vat_included',
    vat_rate: 7,
    vat_amount: 2755.51,
    grand_total: 42120,
  },
  {
    id: 'qt-2',
    quotation_no: 'QT-202611-6945',
    status: 'draft',
    customer_po_no: null,
    customer_name: 'PTTสเตง',
    project_id: 'pj-2',
    projects: { project_code: 'PJ-000002', project_name: 'ติดตั้งตู้AC' },
    quotation_date: '2026-11-25',
    tax_type: 'vat_exempt',
    vat_rate: 0,
    vat_amount: 0,
    grand_total: 16852.5,
  },
  {
    id: 'qt-3',
    quotation_no: 'QT-202611-5001',
    status: 'partial',
    customer_po_no: null,
    customer_name: 'บ.เอ็นเนอร์จี',
    project_id: 'pj-3',
    projects: { project_code: 'PJ-000003', project_name: 'โซลาร์ 100kW' },
    quotation_date: '2026-11-20',
    tax_type: 'vat_excluded',
    vat_rate: 7,
    vat_amount: 7000,
    after_discount: 100000,
    grand_total: 107000,
  },
  {
    id: 'qt-4',
    quotation_no: 'QT-202611-4000',
    status: 'sent',
    customer_po_no: '',
    customer_name: 'โรงพยาบาล ก',
    project_id: 'pj-4',
    quotation_date: '2026-11-18',
    tax_type: 'vat_included',
    grand_total: 50000,
  },
  {
    id: 'qt-5',
    quotation_no: 'QT-202611-3000',
    status: 'rejected',
    customer_po_no: 'OLD-PO-99',
    customer_name: 'ลูกค้ายกเลิก',
    project_id: 'pj-4',
    quotation_date: '2026-11-10',
    tax_type: 'vat_included',
    grand_total: 90000,
  },
]

describe('Quotation List KPIs, Approval Consistency & Filters (src/lib/quotationListUtils.js)', () => {
  it('treats approved, partial, or active customer_po_no uniformly as approved while excluding rejected rows', () => {
    assert.equal(isQuotationApproved(SAMPLE_QUOTATIONS[0]), true)
    assert.equal(isQuotationApproved(SAMPLE_QUOTATIONS[1]), false)
    assert.equal(isQuotationApproved(SAMPLE_QUOTATIONS[2]), true)
    assert.equal(isQuotationApproved(SAMPLE_QUOTATIONS[3]), false)
    assert.equal(isQuotationApproved(SAMPLE_QUOTATIONS[4]), false)

    const kpis = computeQuotationKpis(SAMPLE_QUOTATIONS)
    assert.equal(kpis.totalCount, 5)
    assert.equal(kpis.signedCount, 2)
    assert.equal(kpis.sentCount, 1)
    assert.equal(kpis.draftCount, 1)
    assert.equal(kpis.signedAmount, 42120 + 107000)
    assert.equal(kpis.totalAmount, 42120 + 16852.5 + 107000 + 50000)
  })

  it('filters identically to signedCount when clicking approved KPI card and supports project/search/date filters', () => {
    const approvedRows = filterQuotations(SAMPLE_QUOTATIONS, { filterStatus: 'approved' })
    const kpis = computeQuotationKpis(SAMPLE_QUOTATIONS)
    assert.equal(approvedRows.length, kpis.signedCount)
    assert.deepEqual(approvedRows.map((q) => q.id), ['qt-1', 'qt-3'])

    const draftRows = filterQuotations(SAMPLE_QUOTATIONS, { filterStatus: 'draft' })
    assert.deepEqual(draftRows.map((q) => q.id), ['qt-2'])

    const searchByProject = filterQuotations(SAMPLE_QUOTATIONS, { search: 'PJ-000003' })
    assert.deepEqual(searchByProject.map((q) => q.id), ['qt-3'])

    const dateBounded = filterQuotations(SAMPLE_QUOTATIONS, {
      dateFrom: '2026-11-19',
      dateTo: '2026-11-24',
    })
    assert.deepEqual(dateBounded.map((q) => q.id), ['qt-3'])
  })

  it('maps legacy URL tab parameters cleanly after removing redundant tabs (Option 1A)', () => {
    assert.equal(resolveInitialStatusFilter('signed'), 'approved')
    assert.equal(resolveInitialStatusFilter('pipeline'), 'all')
    assert.equal(resolveInitialStatusFilter('all'), 'all')
    assert.equal(resolveInitialStatusFilter(null), 'all')
  })

  it('computes accurate VAT tags per row instead of hardcoding รวม VAT 7%', () => {
    assert.equal(getQuotationRowAmountMeta(SAMPLE_QUOTATIONS[0]).vatShortTag, 'รวม VAT 7% แล้ว')
    assert.equal(getQuotationRowAmountMeta(SAMPLE_QUOTATIONS[1]).vatShortTag, 'ไม่มี VAT')
    assert.equal(getQuotationRowAmountMeta(SAMPLE_QUOTATIONS[2]).vatShortTag, 'มี VAT 7%')
  })

  it('summarizes strict PR and PO purchasing progress per quotation without project_id leakage', () => {
    const prs = [
      { id: 'pr-1', pr_no: 'PR2026-0008', quotation_id: 'qt-1', project_id: 'pj-2', status: 'open' },
      { id: 'pr-other', pr_no: 'PR2026-9999', quotation_id: 'qt-other', project_id: 'pj-2', status: 'open' },
      { id: 'pr-cancel', pr_no: 'PR2026-0001', quotation_id: 'qt-3', project_id: 'pj-3', status: 'cancelled' },
    ]
    const pos = [
      { id: 'po-1', po_no: 'PO2026-0009', pr_id: 'pr-1', project_id: 'pj-2', status: 'received' },
      // Same project_id as qt-2 (draft) and qt-1, MUST NOT match qt-2!
      { id: 'po-unrelated', po_no: 'PO2026-8888', pr_id: 'pr-other', project_id: 'pj-2', status: 'open' },
    ]

    const map = buildQuotationPurchasingMap(SAMPLE_QUOTATIONS, prs, pos)
    assert.equal(map['qt-1'].prCount, 1)
    assert.equal(map['qt-1'].poCount, 1)
    assert.equal(map['qt-1'].receivedPoCount, 1)
    assert.equal(map['qt-1'].stageLabel, 'รับของเข้าสโตร์ครบ')

    // qt-2 shares pj-2 with pr-other & po-unrelated -> must stay 0!
    assert.equal(map['qt-2'].prCount, 0)
    assert.equal(map['qt-2'].poCount, 0)

    // qt-3 is approved with only a cancelled PR -> prompt awaiting purchasing
    assert.equal(map['qt-3'].prCount, 0)
    assert.equal(map['qt-3'].stageLabel, 'รอส่งต่อจัดซื้อ / เช็กสต็อก')
  })
})
