const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Determine whether Supabase returned any real operational records across ERP modules.
 * Prevents Dashboard from forcing fake simulation data just because `sales_invoices` is empty.
 */
export function hasAnyLiveData(realData) {
  if (!realData || typeof realData !== 'object') return false
  const keys = [
    'invoices',
    'quotations',
    'purchaseOrders',
    'apList',
    'expenses',
    'paymentTx',
    'projects',
    'inventoryItems',
  ]
  return keys.some((k) => Array.isArray(realData[k]) && realData[k].length > 0)
}

/**
 * Resolve reference date for AR aging buckets (fixed reference date only in Demo Mode).
 */
export function getDashboardAgingReferenceDate(isDemoMode) {
  return isDemoMode ? new Date('2026-11-13') : new Date()
}

/**
 * Aggregate total payments executed and payment channel shares from live `payment_transactions`
 * (including pre-receipt PO deposits) with fallback to AP + Expense records.
 */
export function computeDashboardPaymentMetrics({
  apList = [],
  expenses = [],
  paymentTx = [],
}) {
  const apPaidAmount = round2(
    (apList || []).reduce((sum, ap) => sum + Number(ap?.paid_amount || 0), 0)
  )
  const expensesPaidAmount = round2(
    (expenses || [])
      .filter((exp) => exp?.status === 'จ่ายเงินแล้ว' || exp?.accounting_status === 'อนุมัติแล้ว')
      .reduce((sum, exp) => sum + Number(exp?.total_amount || 0), 0)
  )

  const disburseTx = (paymentTx || []).filter(
    (t) => t?.document_type !== 'INV' && t?.document_type !== 'RC'
  )

  let transfer = 0
  let cash = 0
  let cheque = 0

  if (disburseTx.length > 0) {
    for (const tx of disburseTx) {
      const amt = Number(tx?.amount_paid ?? tx?.amount ?? 0)
      if (amt <= 0) continue
      const ch = String(tx?.payment_channel || tx?.payment_method || '').toLowerCase()
      if (ch.includes('สด') || ch.includes('cash')) cash += amt
      else if (ch.includes('เช็ค') || ch.includes('cheque')) cheque += amt
      else transfer += amt
    }
  } else {
    for (const exp of expenses || []) {
      const amt = Number(exp?.total_amount || 0)
      if (exp?.payment_method === 'เงินสด') cash += amt
      else if (exp?.payment_method === 'เช็ค') cheque += amt
      else transfer += amt
    }
    transfer += apPaidAmount
  }

  const txTotal = round2(transfer + cash + cheque)
  const fallbackTotal = round2(apPaidAmount + expensesPaidAmount)
  const totalPaymentsExecuted = disburseTx.length > 0 ? Math.max(txTotal, fallbackTotal) : fallbackTotal

  const distTotal = txTotal || 1
  return {
    apPaidAmount,
    expensesPaidAmount,
    totalPaymentsExecuted,
    transfer: round2(transfer),
    cash: round2(cash),
    cheque: round2(cheque),
    transferPct: ((transfer / distTotal) * 100).toFixed(0),
    cashPct: ((cash / distTotal) * 100).toFixed(0),
    chequePct: ((cheque / distTotal) * 100).toFixed(0),
  }
}
