import { BUDGET_CATEGORIES } from './projects'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Check whether a document status represents a cancelled or rejected state.
 */
export function isCancelledStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return (
    s === 'ยกเลิก' ||
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'rejected' ||
    s === 'ไม่อนุมัติ'
  )
}

/**
 * Check whether a quotation status indicates customer approval or conversion.
 */
export function isApprovedQuotationStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return (
    s.includes('approved') ||
    s.includes('ลูกค้าอนุมัติ') ||
    s.includes('accepted') ||
    s.includes('converted') ||
    s === 'won'
  )
}

/**
 * Normalize legacy short budget category names into canonical 6 categories.
 */
export function normalizeBudgetCategory(rawCat) {
  const c = String(rawCat || '').trim()
  if (!c) return BUDGET_CATEGORIES[0]
  if (BUDGET_CATEGORIES.includes(c)) return c

  if (c.includes('วัสดุ') || c.includes('อุปกรณ์')) return BUDGET_CATEGORIES[0]
  if (c.includes('แรง')) return BUDGET_CATEGORIES[1]
  if (c.includes('เครื่องจักร') || c.includes('เช่า')) return BUDGET_CATEGORIES[2]
  if (c.includes('ผู้รับเหมา')) return BUDGET_CATEGORIES[3]
  if (c.includes('สำรอง') || c.includes('ฉุกเฉิน')) return BUDGET_CATEGORIES[5]
  if (c.includes('ใช้จ่าย') || c.includes('ดำเนินการ') || c.includes('โสหุ้ย')) {
    return BUDGET_CATEGORIES[4]
  }
  return BUDGET_CATEGORIES[0]
}

/**
 * Map an expense record (`expenses`) to the matching canonical project budget category.
 */
export function resolveExpenseBudgetCategory(exp) {
  const code = String(exp?.account_code || '').trim()
  if (code.startsWith('511')) return BUDGET_CATEGORIES[0]
  if (code.startsWith('512')) return BUDGET_CATEGORIES[1]
  if (code.startsWith('514') || code.startsWith('152')) return BUDGET_CATEGORIES[2]
  if (code.startsWith('513')) return BUDGET_CATEGORIES[3]
  if (code.startsWith('52') || code.startsWith('53')) return BUDGET_CATEGORIES[4]

  const catText = `${exp?.expense_category || ''} ${exp?.description || ''}`
  if (/แรง|ช่าง/i.test(catText)) return BUDGET_CATEGORIES[1]
  if (/เครื่องจักร|เครน|รถ|เช่า/i.test(catText)) return BUDGET_CATEGORIES[2]
  if (/รับเหมา/i.test(catText)) return BUDGET_CATEGORIES[3]
  if (/วัสดุ|อุปกรณ์|สาย|ท่อ|แผง|อินเวอร์เตอร์/i.test(catText)) return BUDGET_CATEGORIES[0]
  return BUDGET_CATEGORIES[4]
}

/**
 * Resolve true contract amount for a project without fake hardcoded constants.
 * Priority:
 *   1. Explicit `project.contract_amount > 0`
 *   2. Approved/accepted quotations linked to `project_id`
 *   3. Latest active (non-cancelled) quotation linked to `project_id`
 *   4. Latest active BOQ selling price (`grand_total`)
 */
export function resolveProjectContractInfo(project, quotations = [], boqs = []) {
  const explicitContract = Number(project?.contract_amount || 0)
  if (explicitContract > 0) {
    return {
      amount: round2(explicitContract),
      sourceLabel: 'มูลค่าสัญญาที่บันทึกไว้ในโครงการ',
      sourceType: 'project',
      docNo: null,
    }
  }

  const activeQuotes = (quotations || []).filter((q) => !isCancelledStatus(q?.status))
  const approvedQuotes = activeQuotes.filter((q) => isApprovedQuotationStatus(q?.status))

  if (approvedQuotes.length > 0) {
    const sumApproved = approvedQuotes.reduce(
      (s, q) => s + Number(q?.grand_total > 0 ? q.grand_total : q?.total_amount || 0),
      0
    )
    if (sumApproved > 0) {
      return {
        amount: round2(sumApproved),
        sourceLabel:
          approvedQuotes.length === 1
            ? `อ้างอิงใบเสนอราคาที่อนุมัติ (${approvedQuotes[0].quotation_no})`
            : `รวมจาก ${approvedQuotes.length} ใบเสนอราคาที่อนุมัติ`,
        sourceType: 'quotation_approved',
        docNo: approvedQuotes[0].quotation_no || null,
      }
    }
  }

  if (activeQuotes.length > 0) {
    const latestQuote = activeQuotes[0]
    const quoteAmt = Number(
      latestQuote?.grand_total > 0 ? latestQuote.grand_total : latestQuote?.total_amount || 0
    )
    if (quoteAmt > 0) {
      return {
        amount: round2(quoteAmt),
        sourceLabel: `อ้างอิงใบเสนอราคาล่าสุด (${latestQuote.quotation_no})`,
        sourceType: 'quotation_pending',
        docNo: latestQuote.quotation_no || null,
      }
    }
  }

  const activeBoqs = (boqs || []).filter((b) => !isCancelledStatus(b?.status))
  if (activeBoqs.length > 0) {
    const boqSelling = Number(activeBoqs[0]?.grand_total || 0)
    if (boqSelling > 0) {
      return {
        amount: round2(boqSelling),
        sourceLabel: `ประมาณการขายจาก ${activeBoqs[0].boq_no || 'BOQ'}`,
        sourceType: 'boq',
        docNo: activeBoqs[0].boq_no || null,
      }
    }
  }

  return {
    amount: 0,
    sourceLabel: 'ยังไม่ได้ระบุสัญญาหรือใบเสนอราคา',
    sourceType: 'none',
    docNo: null,
  }
}

/**
 * Compute warehouse material issue cost minus returns (`stock_adjustments` where qty_after > qty_before).
 */
export function calculateStoreMaterialNetCost(stockIssues = [], stockAdjustments = []) {
  let issuedTotal = 0
  for (const iss of stockIssues || []) {
    if (!iss || isCancelledStatus(iss.status)) continue
    for (const line of iss.stock_issue_items || []) {
      issuedTotal += Number(line?.quantity || 0) * Number(line?.unit_cost || 0)
    }
  }

  let returnedTotal = 0
  for (const adj of stockAdjustments || []) {
    if (!adj) continue
    const diff = Number(adj.qty_after || 0) - Number(adj.qty_before || 0)
    if (diff > 0) {
      returnedTotal += diff * Number(adj.unit_cost || 0)
    }
  }

  return {
    issuedTotal: round2(issuedTotal),
    returnedTotal: round2(returnedTotal),
    netStoreCost: Math.max(0, round2(issuedTotal - returnedTotal)),
  }
}

/**
 * Compute full live financial metrics, cross-module spend breakdown, and 6-category rollup
 * for a real project from live database tables.
 */
export function computeProjectFinancialSummary({
  project,
  budgetItems = [],
  purchaseOrders = [],
  expenses = [],
  stockIssues = [],
  stockAdjustments = [],
  quotations = [],
  boqs = [],
  salesInvoices = [],
}) {
  const activePOs = (purchaseOrders || []).filter((po) => !isCancelledStatus(po?.status))
  const activeExpenses = (expenses || []).filter((exp) => !isCancelledStatus(exp?.status))
  const activeInvoices = (salesInvoices || []).filter((inv) => !isCancelledStatus(inv?.status))

  const poTotalSpent = round2(
    activePOs.reduce(
      (sum, po) => sum + Number(po?.grand_total > 0 ? po.grand_total : po?.total_amount || 0),
      0
    )
  )
  const poPaidTotal = round2(
    activePOs.reduce((sum, po) => sum + Number(po?.paid_amount || 0), 0)
  )
  const expTotalSpent = round2(
    activeExpenses.reduce((sum, exp) => sum + Number(exp?.total_amount || 0), 0)
  )
  const storeMetrics = calculateStoreMaterialNetCost(stockIssues, stockAdjustments)

  const allocatedBudget = round2(
    (budgetItems || []).reduce((sum, item) => sum + Number(item?.budgeted_amount || 0), 0)
  )
  const explicitBudget = Number(project?.budget_total || 0)
  const totalBudget = round2(explicitBudget > 0 ? explicitBudget : allocatedBudget)

  const itemReportedSpent = round2(
    (budgetItems || []).reduce((sum, item) => sum + Number(item?.actual_spent || 0), 0)
  )
  const liveDocumentsSpent = round2(poTotalSpent + expTotalSpent + storeMetrics.netStoreCost)
  const totalActualSpent = Math.max(itemReportedSpent, liveDocumentsSpent)

  const contractInfo = resolveProjectContractInfo(project, quotations, boqs)
  const contractAmount = contractInfo.amount

  const remainingBudget = round2(totalBudget - totalActualSpent)
  const budgetUsagePct =
    totalBudget > 0 ? ((totalActualSpent / totalBudget) * 100).toFixed(1) : '0.0'

  const hasContract = contractAmount > 0
  const projectedGrossMargin = hasContract ? round2(contractAmount - totalBudget) : 0
  const projectedGrossMarginPct = hasContract
    ? ((projectedGrossMargin / contractAmount) * 100).toFixed(1)
    : '0.0'
  const actualGrossProfit = hasContract ? round2(contractAmount - totalActualSpent) : 0

  const billedTotal = round2(
    activeInvoices.reduce((s, inv) => s + Number(inv?.total_amount || 0), 0)
  )
  const collectedTotal = round2(
    activeInvoices.reduce(
      (s, inv) =>
        s +
        Number(
          inv?.paid_amount != null
            ? inv.paid_amount
            : Math.max(0, Number(inv?.total_amount || 0) - Number(inv?.remaining_amount || 0))
        ),
      0
    )
  )

  // Category aggregation across planned items + real documents (PO, Store, EXP)
  const catMap = {}
  BUDGET_CATEGORIES.forEach((cat) => {
    catMap[cat] = {
      name: cat,
      itemsCount: 0,
      budgeted: 0,
      itemReportedSpent: 0,
      liveDocSpent: 0,
      actualSpent: 0,
      itemsList: [],
    }
  })

  for (const item of budgetItems || []) {
    const cat = normalizeBudgetCategory(item?.category)
    if (!catMap[cat]) {
      catMap[cat] = {
        name: cat,
        itemsCount: 0,
        budgeted: 0,
        itemReportedSpent: 0,
        liveDocSpent: 0,
        actualSpent: 0,
        itemsList: [],
      }
    }
    catMap[cat].itemsCount += 1
    catMap[cat].budgeted = round2(catMap[cat].budgeted + Number(item?.budgeted_amount || 0))
    catMap[cat].itemReportedSpent = round2(
      catMap[cat].itemReportedSpent + Number(item?.actual_spent || 0)
    )
    catMap[cat].itemsList.push(item)
  }

  // Attribute real POs & Net Store Material Cost into Material/Equipment category
  catMap[BUDGET_CATEGORIES[0]].liveDocSpent = round2(
    catMap[BUDGET_CATEGORIES[0]].liveDocSpent + poTotalSpent + storeMetrics.netStoreCost
  )

  // Attribute each EXP to its accounting cost category
  for (const exp of activeExpenses) {
    const expCat = resolveExpenseBudgetCategory(exp)
    if (!catMap[expCat]) continue
    catMap[expCat].liveDocSpent = round2(
      catMap[expCat].liveDocSpent + Number(exp?.total_amount || 0)
    )
  }

  const categorySummary = Object.values(catMap).map((c) => ({
    ...c,
    actualSpent: Math.max(c.itemReportedSpent, c.liveDocSpent),
  }))

  return {
    contractAmount,
    contractSourceLabel: contractInfo.sourceLabel,
    contractSourceType: contractInfo.sourceType,
    totalBudget,
    budgetFromItemsOnly: explicitBudget <= 0 && allocatedBudget > 0,
    allocatedBudget,
    poTotalSpent,
    poPaidTotal,
    expTotalSpent,
    storeIssuedTotal: storeMetrics.issuedTotal,
    storeReturnedTotal: storeMetrics.returnedTotal,
    netStoreCost: storeMetrics.netStoreCost,
    liveDocumentsSpent,
    totalActualSpent,
    remainingBudget,
    budgetUsagePct,
    projectedGrossMargin,
    projectedGrossMarginPct,
    actualGrossProfit,
    billedTotal,
    collectedTotal,
    activePOs,
    activeExpenses,
    activeInvoices,
    categorySummary,
  }
}
