import { isCancelledStatus } from './projectFinancials.js'
import { buildCustomerQuotationSummary } from './quotationPrintUtils.js'
import {
  extractPrSourceQuotation,
  getCustomerApprovalDisplay,
  isPoReceivedStatus,
} from './salesFlowUtils.js'

const getQuotationAmount = (q) =>
  Number(q?.grand_total ?? q?.total_amount ?? q?.net_amount ?? 0)

/**
 * Determine whether a quotation counts as customer-approved consistently across
 * KPI metrics, filters, table badges, and action menus.
 */
export function isQuotationApproved(quotation) {
  if (!quotation || isCancelledStatus(quotation.status) || quotation.status === 'expired') {
    return false
  }
  return getCustomerApprovalDisplay(quotation).isApproved
}

/**
 * Resolve initial status filter from legacy `?tab=` URL bookmarks after removing
 * redundant QT sub-tabs (Option 1A).
 */
export function resolveInitialStatusFilter(tabParam) {
  return tabParam === 'signed' ? 'approved' : 'all'
}

/**
 * Compute top-strip KPI metrics for the Quotations list.
 */
export function computeQuotationKpis(quotations = []) {
  let signedCount = 0
  let sentCount = 0
  let draftCount = 0
  let totalAmount = 0
  let signedAmount = 0

  for (const q of quotations || []) {
    if (!q) continue
    const amount = getQuotationAmount(q)
    const approved = isQuotationApproved(q)

    if (!isCancelledStatus(q.status)) {
      totalAmount += amount
    }
    if (approved) {
      signedCount += 1
      signedAmount += amount
    }
    if (q.status === 'sent') sentCount += 1
    if (q.status === 'draft') draftCount += 1
  }

  return {
    totalCount: (quotations || []).length,
    signedCount,
    sentCount,
    draftCount,
    totalAmount,
    signedAmount,
  }
}

/**
 * Filter quotations cleanly using KPI quick filter, dropdown filters, search term, and date bounds.
 */
export function filterQuotations(
  quotations = [],
  { filterStatus = 'all', filterProject = '', search = '', dateFrom = '', dateTo = '' } = {}
) {
  const term = String(search || '').toLowerCase().trim()

  return (quotations || []).filter((q) => {
    if (!q) return false

    if (filterStatus === 'approved') {
      if (!isQuotationApproved(q)) return false
    } else if (filterStatus && filterStatus !== 'all') {
      if (q.status !== filterStatus) return false
    }

    if (filterProject && q.project_id !== filterProject) return false

    if (term) {
      const haystack = [
        q.quotation_no,
        q.customer_name,
        q.sales_person,
        q.projects?.project_name,
        q.projects?.project_code,
        q.customer_po_no,
        q.customer_signer_name,
      ]
      const matched = haystack.some((val) => String(val || '').toLowerCase().includes(term))
      if (!matched) return false
    }

    const rawDate = q.quotation_date || q.issue_date
    const dateKey = rawDate ? String(rawDate).split('T')[0] : ''
    if (dateFrom && dateKey && dateKey < dateFrom) return false
    if (dateTo && dateKey && dateKey > dateTo) return false

    return true
  })
}

/**
 * Return formatted total amount and accurate VAT label using `buildCustomerQuotationSummary`.
 */
export function getQuotationRowAmountMeta(quotation) {
  const summary = buildCustomerQuotationSummary(quotation || {})
  return {
    amount: summary.grandTotal || getQuotationAmount(quotation),
    vatShortTag: summary.vatShortTag,
    taxType: summary.taxType,
  }
}

/**
 * Strictly link PRs and POs to each quotation without `project_id` leakage,
 * providing concise purchasing status summaries right in the main QT list.
 */
export function buildQuotationPurchasingMap(quotations = [], prs = [], pos = []) {
  const activePrs = (prs || []).filter((pr) => pr && !isCancelledStatus(pr.status))
  const activePos = (pos || []).filter((po) => po && !isCancelledStatus(po.status))

  const qtById = new Map()
  const qtByNo = new Map()
  const prIdsByQt = new Map()
  const prCountByQt = new Map()
  const posByQt = new Map()

  for (const q of quotations || []) {
    if (!q?.id) continue
    qtById.set(q.id, q)
    if (q.quotation_no) qtByNo.set(String(q.quotation_no).trim().toLowerCase(), q)
    prIdsByQt.set(q.id, new Set())
    prCountByQt.set(q.id, 0)
    posByQt.set(q.id, [])
  }

  for (const pr of activePrs) {
    const { quotationId, quotationNo } = extractPrSourceQuotation(pr)
    const matchedQt =
      (quotationId && qtById.get(quotationId)) ||
      (quotationNo && qtByNo.get(quotationNo.toLowerCase())) ||
      null
    if (!matchedQt) continue
    prIdsByQt.get(matchedQt.id).add(pr.id)
    prCountByQt.set(matchedQt.id, (prCountByQt.get(matchedQt.id) || 0) + 1)
  }

  for (const po of activePos) {
    const { quotationId, quotationNo } = extractPrSourceQuotation({
      quotation_id: po.quotation_id,
      sales_quotation_no: po.sales_quotation_no,
      notes: po.notes,
    })

    let matchedQt =
      (quotationId && qtById.get(quotationId)) ||
      (quotationNo && qtByNo.get(quotationNo.toLowerCase())) ||
      null

    if (!matchedQt && po.pr_id) {
      for (const [qtId, prSet] of prIdsByQt.entries()) {
        if (prSet.has(po.pr_id)) {
          matchedQt = qtById.get(qtId)
          break
        }
      }
    }

    if (matchedQt) {
      posByQt.get(matchedQt.id).push(po)
    }
  }

  const result = {}
  for (const q of quotations || []) {
    if (!q?.id) continue
    const prCount = prCountByQt.get(q.id) || 0
    const linkedPos = posByQt.get(q.id) || []
    const poCount = linkedPos.length
    const receivedPoCount = linkedPos.filter((po) => isPoReceivedStatus(po.status)).length
    const approved = isQuotationApproved(q)

    let stageLabel = ''
    let stageTone = 'slate'

    if (poCount > 0 && receivedPoCount === poCount) {
      stageLabel = 'รับของเข้าสโตร์ครบ'
      stageTone = 'emerald'
    } else if (poCount > 0) {
      stageLabel = `ออก PO แล้ว (${poCount})`
      stageTone = 'sky'
    } else if (prCount > 0) {
      stageLabel = `เปิด PR แล้ว (${prCount})`
      stageTone = 'sky'
    } else if (approved) {
      stageLabel = 'รอส่งต่อจัดซื้อ / เช็กสต็อก'
      stageTone = 'amber'
    }

    result[q.id] = {
      prCount,
      poCount,
      receivedPoCount,
      stageLabel,
      stageTone,
    }
  }

  return result
}
