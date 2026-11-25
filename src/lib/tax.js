/**
 * Shared VAT / WHT tax calculation & inference utilities for Quotations and Purchase Orders.
 * Ensures VAT 7% is never double-counted when syncing Quotation -> PR -> PO or viewing PO details.
 */

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

/**
 * Infer a quotation's VAT mode ('vat_excluded' | 'vat_included' | 'vat_exempt').
 * Works whether or not `tax_type` exists as a column in `quotations`.
 */
export function inferQuotationTaxType(q) {
  if (!q) return 'vat_excluded'

  const vatRate = Number(q.vat_rate ?? 7)
  const vatAmount = Number(q.vat_amount || 0)

  if (q.tax_type === 'vat_exempt' || vatRate === 0 || (q.vat_amount !== undefined && q.vat_amount !== null && vatAmount === 0)) {
    return 'vat_exempt'
  }
  if (q.tax_type === 'vat_included' || q.tax_type === 'vat_excluded') {
    return q.tax_type
  }

  const afterDiscount = Number(
    q.after_discount ?? Math.max(0, Number(q.subtotal || 0) - Number(q.discount_amount || 0))
  )
  const whtAmount = Number(q.wht_amount || 0)
  const grandTotal = Number(q.grand_total ?? q.total_amount ?? 0)

  if (vatAmount > 0 && afterDiscount > 0 && Math.abs((afterDiscount - whtAmount) - grandTotal) <= 0.1) {
    return 'vat_included'
  }
  return 'vat_excluded'
}

/**
 * Calculate pre-VAT amount, VAT, total with VAT, WHT (always on pre-VAT base), and net payable.
 */
export function calculateTaxBreakdown({ rawTotal, taxType = 'vat_excluded', whtRate = 0, vatRate = 7 }) {
  const raw = round2(rawTotal)
  const effectiveVatRate = taxType === 'vat_exempt' ? 0 : Number(vatRate ?? 7)

  let amountBeforeVat = raw
  let vatAmount = 0
  let totalWithVat = raw

  if (taxType === 'vat_included' && effectiveVatRate > 0) {
    vatAmount = round2((raw * effectiveVatRate) / (100 + effectiveVatRate))
    amountBeforeVat = Math.max(0, round2(raw - vatAmount))
    totalWithVat = raw
  } else if (taxType === 'vat_excluded' && effectiveVatRate > 0) {
    amountBeforeVat = raw
    vatAmount = round2(raw * (effectiveVatRate / 100))
    totalWithVat = round2(raw + vatAmount)
  }

  const numericWhtRate = Number(whtRate) || 0
  const whtAmount = numericWhtRate > 0 ? round2(amountBeforeVat * (numericWhtRate / 100)) : 0
  const netPayable = Math.max(0, round2(totalWithVat - whtAmount))

  return {
    amountBeforeVat,
    vatAmount,
    totalWithVat,
    whtAmount,
    netPayable,
  }
}

/**
 * Infer effective tax type of a Purchase Order record.
 * Also guards against historical records whose `tax_type` was flipped to 'vat_excluded'
 * while `vat_amount` was originally extracted as 7/107 of `total_amount`.
 */
export function inferPoTaxType(po, rawSubtotal = 0) {
  if (!po) return 'vat_excluded'

  const vatRate = Number(po.vat_rate ?? 7)
  const vatVal = Number(po.vat_amount || 0)
  const totalRef = Number(po.total_amount) || Number(rawSubtotal) || 0

  if (po.tax_type === 'vat_exempt' || (vatRate === 0 && vatVal === 0)) {
    return 'vat_exempt'
  }
  if (!po.tax_type && vatVal === 0) {
    return 'vat_exempt'
  }
  if (po.tax_type === 'vat_included') {
    return 'vat_included'
  }

  // Detect records whose vat_amount was computed as 7/107 of total_amount (vat_included)
  const expectedInclVat = round2((totalRef * 7) / 107)
  const expectedExclVat = round2(totalRef * 0.07)
  const exactInclMatch =
    totalRef >= 100 &&
    vatVal > 0 &&
    Math.abs(vatVal - expectedInclVat) <= 0.05 &&
    Math.abs(vatVal - expectedExclVat) > 1
  const seedInclMatch =
    totalRef >= 10000 &&
    vatVal > 0 &&
    Math.abs(vatVal - expectedInclVat) <= 2 &&
    Math.abs(vatVal - expectedExclVat) > 50

  if (exactInclMatch || seedInclMatch) {
    return 'vat_included'
  }

  return 'vat_excluded'
}

/**
 * Compute authoritative PO display & payment totals without ever double-counting VAT.
 */
export function computePoTotals(po, items = []) {
  const itemsSum = round2(
    (items ?? []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  )
  const baseTotal = Number(po?.total_amount) > 0 ? Number(po.total_amount) : itemsSum
  const taxType = inferPoTaxType(po, baseTotal)
  const vatRate = taxType === 'vat_exempt' ? 0 : Number(po?.vat_rate ?? 7)
  const whtRate = Number(po?.wht_rate || 0)

  let amountBeforeVat = round2(baseTotal)
  let vatAmount = 0
  let totalWithVat = round2(baseTotal)

  if (taxType === 'vat_included') {
    totalWithVat = round2(baseTotal)
    vatAmount = Number(po?.vat_amount) > 0
      ? round2(po.vat_amount)
      : round2((totalWithVat * vatRate) / (100 + vatRate))
    amountBeforeVat = Math.max(0, round2(totalWithVat - vatAmount))
  } else if (taxType === 'vat_excluded') {
    amountBeforeVat = round2(baseTotal)
    vatAmount = Number(po?.vat_amount) > 0
      ? round2(po.vat_amount)
      : round2(amountBeforeVat * (vatRate / 100))
    totalWithVat = round2(amountBeforeVat + vatAmount)
  }

  const whtAmount = whtRate > 0
    ? (Number(po?.wht_amount) > 0 ? round2(po.wht_amount) : round2(amountBeforeVat * (whtRate / 100)))
    : 0
  const netPayable = Math.max(0, round2(totalWithVat - whtAmount))

  return {
    taxType,
    vatRate,
    isVatIncluded: taxType === 'vat_included',
    amountBeforeVat,
    vatAmount,
    totalWithVat,
    whtRate,
    whtAmount,
    netPayable,
  }
}
