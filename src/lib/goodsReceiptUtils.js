import { computePoTotals, inferPoTaxType, round2 } from './tax.js'

/**
 * Resolve pre-VAT inventory unit cost for a PO item being received into Store (RI).
 * When PO has `vat_included` pricing, strips VAT (e.g. 7/107) so inventory valuation
 * and General Ledger Debit Inventory (1140-01) never double-count VAT.
 */
export function resolvePoReceiveUnitCost({
  rawUnitPrice,
  fallbackPoTotal = 0,
  poItemQuantity = 1,
  po = null,
}) {
  let raw = Number(rawUnitPrice) || 0
  if (raw <= 0 && Number(fallbackPoTotal) > 0) {
    raw = round2(Number(fallbackPoTotal) / (Number(poItemQuantity) || 1))
  }
  if (raw <= 0) return 0

  const taxType = inferPoTaxType(po, Number(po?.total_amount) || fallbackPoTotal || raw)
  const vatRate = taxType === 'vat_exempt' ? 0 : Number(po?.vat_rate ?? 7)

  if (taxType === 'vat_included' && vatRate > 0) {
    return round2((raw * 100) / (100 + vatRate))
  }
  return round2(raw)
}

/**
 * Build RPC / fallback `receiveItems` payload with pre-VAT `unit_cost`.
 */
export function buildReceivePayloadItems({ po, poItems = [], receiveQtyMap = {} }) {
  return (poItems || [])
    .filter((it) => Number(receiveQtyMap[it.id] || 0) > 0)
    .map((it) => {
      const qtyNum = Number(receiveQtyMap[it.id]) || 0
      const remain = Math.max(0, Number(it.quantity || 0) - Number(it.qty_received || 0))
      const actualQty = Math.min(qtyNum, remain > 0 ? remain : qtyNum)
      const rawPrice = Number(it.unit_price) || 0
      const unitCost = resolvePoReceiveUnitCost({
        rawUnitPrice: rawPrice,
        fallbackPoTotal: po?.total_amount,
        poItemQuantity: it.quantity,
        po,
      })

      return {
        po_item_id: it.id,
        item_id: it.item_id || null,
        item_name: it.item_name || '',
        unit: it.unit || 'หน่วย',
        qty_received: actualQty,
        unit_cost: unitCost,
        raw_unit_price: rawPrice,
      }
    })
}

/**
 * Extract numeric credit days from PO payment terms.
 */
export function getCreditDaysFromPo(po) {
  if (!po) return 30
  if (po.credit_days !== undefined && po.credit_days !== null && !Number.isNaN(Number(po.credit_days))) {
    return Math.max(0, Math.round(Number(po.credit_days)))
  }
  const paymentType = String(po.payment_type || 'credit_30').toLowerCase()
  if (paymentType === 'cash' || paymentType === 'cbd') return 0
  if (paymentType === 'advance_deposit') return 7
  const creditMatch = paymentType.match(/credit_(\d+)/)
  if (creditMatch) return Number(creditMatch[1]) || 30
  return 30
}

/**
 * Add calendar days to an ISO date string (YYYY-MM-DD) safely in UTC.
 */
export function addDaysToIsoDate(dateStr, days = 0) {
  const base = String(dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const parts = base.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date(Date.now() + (Number(days) || 0) * 86400000).toISOString().slice(0, 10)
  }
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + (Number(days) || 0)))
  return dt.toISOString().slice(0, 10)
}

/**
 * Compute GL journal amounts (pre-VAT inventory debit, Input VAT debit, AP credit)
 * for a single GRN/RI batch, plus cumulative Accounts Payable summary for the PO.
 */
export function computeGrnFinancials({
  po,
  itemsReceived = [],
  cumulativePreVat = null,
  poItems = [],
  paidFromTransactions = null,
  receivedDate = new Date().toISOString().slice(0, 10),
}) {
  const taxType = inferPoTaxType(po)
  const vatRate = taxType === 'vat_exempt' ? 0 : Number(po?.vat_rate ?? 7)
  const whtRate = Number(po?.wht_rate || 0)

  const subtotalPreVat = round2(
    (itemsReceived || []).reduce(
      (sum, it) => sum + (Number(it.qty_received) || 0) * (Number(it.unit_cost) || 0),
      0
    )
  )

  const vatAmount = vatRate > 0 && subtotalPreVat > 0 ? round2(subtotalPreVat * (vatRate / 100)) : 0
  const totalWithVat = round2(subtotalPreVat + vatAmount)

  // Cumulative AP liability across all GRNs received on this PO
  const effectiveCumulativePreVat =
    cumulativePreVat !== null && cumulativePreVat !== undefined
      ? round2(cumulativePreVat)
      : subtotalPreVat
  const cumulativeVat =
    vatRate > 0 && effectiveCumulativePreVat > 0
      ? round2(effectiveCumulativePreVat * (vatRate / 100))
      : 0
  const cumulativeWht =
    whtRate > 0 && effectiveCumulativePreVat > 0
      ? round2(effectiveCumulativePreVat * (whtRate / 100))
      : 0

  const poTotals = computePoTotals(po, poItems)
  const cumulativeNetDebt = Math.max(
    0,
    round2(effectiveCumulativePreVat + cumulativeVat - cumulativeWht)
  )
  const apTotalDebt =
    cumulativeNetDebt > 0 ? cumulativeNetDebt : round2(poTotals.netPayable || totalWithVat)

  const paidFromPo = round2(po?.deposit_paid_amount || 0)
  const paidAmount =
    paidFromTransactions !== null && paidFromTransactions !== undefined
      ? round2(Math.max(Number(paidFromTransactions) || 0, paidFromPo))
      : paidFromPo

  const remainingAmount = Math.max(0, round2(apTotalDebt - paidAmount))
  const apStatus = remainingAmount <= 0.05 && apTotalDebt > 0
    ? 'paid'
    : paidAmount > 0
    ? 'partial'
    : 'pending'

  const invoiceDate = String(po?.tax_invoice_date || receivedDate || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const creditDays = getCreditDaysFromPo(po)
  const dueDate = addDaysToIsoDate(invoiceDate, creditDays)

  return {
    taxType,
    vatRate,
    whtRate,
    subtotalPreVat,
    vatAmount,
    totalWithVat,
    apTotalDebt,
    paidAmount,
    remainingAmount,
    apStatus,
    creditDays,
    invoiceDate,
    dueDate,
  }
}
