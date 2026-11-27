/**
 * Shared VAT / WHT tax calculation & inference utilities for Quotations and Purchase Orders.
 * Ensures VAT 7% is never double-counted when syncing Quotation -> PR -> PO or viewing PO details.
 */

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

export const QUOTATION_TYPES = Object.freeze({
  PROJECT: 'project',
  PRODUCT: 'product',
})

/**
 * Generate separated quotation document numbers by type:
 *  - 'project' (รับงาน / BOQ) -> QT-P-YYYYMM-NNNN
 *  - 'product' (ขายสินค้า / Store) -> QT-S-YYYYMM-NNNN
 */
export function generateTypedQuotationNo(
  type = QUOTATION_TYPES.PROJECT,
  date = new Date(),
  randomDigits = null
) {
  const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date()
  const ym = `${safeDate.getFullYear()}${String(safeDate.getMonth() + 1).padStart(2, '0')}`
  const rand =
    randomDigits != null
      ? String(randomDigits)
      : String(Math.floor(1000 + Math.random() * 9000))
  const prefix = type === QUOTATION_TYPES.PRODUCT ? 'QT-S' : 'QT-P'
  return `${prefix}-${ym}-${rand}`
}

/**
 * Shared markup helper used by BOQ and Quotations.
 * Markup is percentage-only and clamped to non-negative; selling unit price is rounded to 2 decimals.
 */
export function applyMarkup(baseUnitCost, markupPercent = 0) {
  const cost = Math.max(0, Number(baseUnitCost) || 0)
  const pct = Math.max(0, Number(markupPercent) || 0)
  return round2(cost * (1 + pct / 100))
}

/**
 * Unified pricing pipeline shared across BOQ, Project Quotations, and Product Quotations:
 *   base_cost -> markup % (unit rounded 2dp) -> line sums -> discount -> VAT/WHT -> below-cost check.
 */
export function calculateDocumentPricing({
  items = [],
  markupPercent = 0,
  pricingFromCost = true,
  discountMode = 'none',
  headerDiscountType = 'amount',
  headerDiscountValue = 0,
  taxType = 'vat_excluded',
  vatRate = 7,
  whtRate = 0,
} = {}) {
  const safeMarkupPct = Math.max(0, Number(markupPercent) || 0)
  const effectiveDiscountMode = ['whole_bill', 'per_item'].includes(discountMode)
    ? discountMode
    : 'none'

  const lineRows = (items || []).map((item) => {
    const qty = Math.max(0, Number(item?.quantity) || 0)
    const baseUnitCost = Math.max(0, round2(item?.base_cost ?? item?.unit_cost ?? 0))
    const lineBaseCost = round2(baseUnitCost * qty)

    const unitSellingPrice = pricingFromCost
      ? applyMarkup(baseUnitCost, safeMarkupPct)
      : round2(Math.max(0, Number(item?.unit_price) || 0))

    const lineGross = round2(unitSellingPrice * qty)
    const itemDiscountPercent =
      effectiveDiscountMode === 'per_item'
        ? Math.min(100, Math.max(0, Number(item?.discount_percent) || 0))
        : 0
    const lineDiscount =
      effectiveDiscountMode === 'per_item' && itemDiscountPercent > 0
        ? round2((lineGross * itemDiscountPercent) / 100)
        : 0
    const lineTotal = round2(Math.max(0, lineGross - lineDiscount))

    return {
      qty,
      baseUnitCost,
      lineBaseCost,
      unitSellingPrice,
      lineGross,
      itemDiscountPercent,
      lineDiscount,
      lineTotal,
    }
  })

  const totalCost = round2(lineRows.reduce((sum, row) => sum + row.lineBaseCost, 0))
  const grossSubtotal = round2(lineRows.reduce((sum, row) => sum + row.lineGross, 0))
  const linesNetTotal = round2(lineRows.reduce((sum, row) => sum + row.lineTotal, 0))

  let subtotal = linesNetTotal
  let discountAmount = 0
  let afterDiscount = linesNetTotal

  if (effectiveDiscountMode === 'per_item') {
    subtotal = grossSubtotal
    discountAmount = round2(lineRows.reduce((sum, row) => sum + row.lineDiscount, 0))
    afterDiscount = linesNetTotal
  } else if (effectiveDiscountMode === 'whole_bill') {
    subtotal = linesNetTotal
    const rawHeaderVal = Math.max(0, Number(headerDiscountValue) || 0)
    const rawDiscount =
      headerDiscountType === 'percent'
        ? round2((subtotal * Math.min(100, rawHeaderVal)) / 100)
        : round2(rawHeaderVal)
    discountAmount = Math.min(subtotal, Math.max(0, rawDiscount))
    afterDiscount = round2(Math.max(0, subtotal - discountAmount))
  }

  const markupAmount = round2(grossSubtotal - totalCost)
  const taxBreakdown = calculateTaxBreakdown({
    rawTotal: afterDiscount,
    taxType,
    whtRate,
    vatRate,
  })

  const isBelowCost = totalCost > 0 && afterDiscount < totalCost
  const belowCostAmount = isBelowCost ? round2(totalCost - afterDiscount) : 0
  const profitAmount = round2(afterDiscount - totalCost)

  return {
    markupPercent: safeMarkupPct,
    discountMode: effectiveDiscountMode,
    lineRows,
    totalCost,
    markupAmount,
    grossSubtotal,
    subtotal,
    discountAmount,
    afterDiscount,
    amountBeforeVat: taxBreakdown.amountBeforeVat,
    vatAmount: taxBreakdown.vatAmount,
    totalWithVat: taxBreakdown.totalWithVat,
    whtAmount: taxBreakdown.whtAmount,
    netPayable: taxBreakdown.netPayable,
    grandTotal: taxBreakdown.netPayable,
    isBelowCost,
    belowCostAmount,
    profitAmount,
  }
}

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
