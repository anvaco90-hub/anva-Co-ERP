import { QUOTATION_TYPES, calculateTaxBreakdown, inferQuotationTaxType, round2 } from './tax.js'
import { isServiceOrLaborItem } from './quotationStockCheck.js'

/**
 * Determine quotation type ('project' | 'product') safely with QT-S prefix fallback for legacy rows.
 * @param {object|null} quotation
 */
export function resolveQuotationType(quotation) {
  if (quotation?.type === QUOTATION_TYPES.PRODUCT) return QUOTATION_TYPES.PRODUCT
  if (quotation?.type === QUOTATION_TYPES.PROJECT) return QUOTATION_TYPES.PROJECT
  const qtNo = String(quotation?.quotation_no || '').trim().toUpperCase()
  if (qtNo.startsWith('QT-S') || qtNo.startsWith('QTS-')) return QUOTATION_TYPES.PRODUCT
  return QUOTATION_TYPES.PROJECT
}

/**
 * Determine which pricing columns/discounts are shown on Customer PDF by quotation type.
 * @param {object|null} quotation
 */
export function getCustomerPrintMode(quotation) {
  const type = resolveQuotationType(quotation)
  if (type === QUOTATION_TYPES.PRODUCT) {
    return {
      type: QUOTATION_TYPES.PRODUCT,
      showUnitPrice: true,
      showLineTotal: true,
      showPerItemDiscount: quotation?.discount_mode === 'per_item',
      showDiscountSummary: Number(quotation?.discount_amount || 0) > 0,
    }
  }
  return {
    type: QUOTATION_TYPES.PROJECT,
    showUnitPrice: false,
    showLineTotal: false,
    showPerItemDiscount: false,
    showDiscountSummary: false,
  }
}

/**
 * คัดกรองและทำความสะอาดรายการสินค้าสำหรับพิมพ์ใบเสนอราคาส่งลูกค้า:
 *  - ห้ามเปิดเผยต้นทุน (base_cost / total_cost / markup_percent) และสถานะสต็อกในทุกกรณี
 *  - แบบ 'project' (รับงาน): ซ่อนบรรทัดค่าแรง/บริการ และไม่ส่งราคาต่อหน่วย/ส่วนลด
 *  - แบบ 'product' (ขายสินค้า): ส่งราคา/หน่วย (รวมกำไรแล้ว) และยอดรวมบรรทัด
 * @param {Array} items
 * @param {object|null} quotation
 */
export function getCustomerPrintItems(items = [], quotation = null) {
  const mode = getCustomerPrintMode(quotation)

  return (items || [])
    .filter((item) => {
      if (!item) return false
      if (mode.type === QUOTATION_TYPES.PROJECT && isServiceOrLaborItem(item)) {
        return false
      }
      return true
    })
    .map((item) => {
      const sanitized = {
        id: item.id,
        item_code: item.item_code || null,
        item_name: item.item_name,
        description: item.description || '',
        quantity: item.quantity,
        unit: item.unit || '',
      }
      if (mode.type === QUOTATION_TYPES.PRODUCT) {
        sanitized.unit_price = round2(item.unit_price || 0)
        sanitized.discount_percent = mode.showPerItemDiscount
          ? Number(item.discount_percent || 0)
          : 0
        sanitized.total_amount = round2(
          item.total_amount ??
            round2(sanitized.unit_price * (Number(item.quantity) || 0))
        )
      }
      return sanitized
    })
}

/**
 * สรุปยอดรวมและสถานะ VAT สำหรับเอกสารใบเสนอราคาฝั่งลูกค้า (ไม่เปิดเผยต้นทุนหรือราคาซื้อ)
 * @param {object} quotation
 */
export function buildCustomerQuotationSummary(quotation = {}) {
  const taxType = inferQuotationTaxType(quotation)
  const hasVat = taxType !== 'vat_exempt'
  const vatRate = hasVat ? Number(quotation?.vat_rate ?? 7) : 0
  const isExplicitProject = quotation?.type === QUOTATION_TYPES.PROJECT

  const subtotal = round2(quotation?.subtotal ?? 0)
  const discountAmount = isExplicitProject ? 0 : round2(quotation?.discount_amount ?? 0)
  const afterDiscount = isExplicitProject
    ? round2(quotation?.after_discount ?? subtotal)
    : round2(quotation?.after_discount ?? Math.max(0, subtotal - discountAmount))

  const calc = calculateTaxBreakdown({
    rawTotal: afterDiscount,
    taxType,
    whtRate: quotation?.wht_rate || 0,
    vatRate,
  })

  const vatAmount = hasVat
    ? round2(quotation?.vat_amount != null ? quotation.vat_amount : calc.vatAmount)
    : 0

  const amountBeforeVat =
    taxType === 'vat_included'
      ? Math.max(0, round2(afterDiscount - vatAmount))
      : afterDiscount

  const whtRate = Number(quotation?.wht_rate || 0)
  const whtAmount = round2(quotation?.wht_amount != null ? quotation.wht_amount : calc.whtAmount)
  const grandTotal = round2(
    quotation?.grand_total ?? quotation?.total_amount ?? calc.netPayable
  )

  let vatStatusLabel = 'มี VAT 7% (คิดภาษีมูลค่าเพิ่ม 7%)'
  let vatShortTag = 'มี VAT 7%'
  if (taxType === 'vat_included') {
    vatStatusLabel = `มี VAT ${vatRate}% (ราคารวมภาษีมูลค่าเพิ่มแล้ว)`
    vatShortTag = `รวม VAT ${vatRate}% แล้ว`
  } else if (taxType === 'vat_exempt') {
    vatStatusLabel = 'ไม่มี VAT (ไม่คิดภาษีมูลค่าเพิ่ม 0%)'
    vatShortTag = 'ไม่มี VAT'
  }

  return {
    taxType,
    hasVat,
    vatRate,
    subtotal,
    discountAmount,
    afterDiscount,
    amountBeforeVat,
    vatAmount,
    whtRate,
    whtAmount,
    grandTotal,
    vatStatusLabel,
    vatShortTag,
  }
}

/**
 * คำนวณ payload ใหม่เมื่อสลับโหมด VAT บนหน้าใบเสนอราคา (`vat_excluded` | `vat_included` | `vat_exempt`)
 * @param {object} quotation
 * @param {'vat_excluded'|'vat_included'|'vat_exempt'} nextTaxType
 */
export function buildQuotationTaxUpdatePayload(quotation = {}, nextTaxType = 'vat_excluded') {
  const validTaxType = ['vat_excluded', 'vat_included', 'vat_exempt'].includes(nextTaxType)
    ? nextTaxType
    : 'vat_excluded'

  const subtotal = round2(quotation?.subtotal ?? 0)
  const discountAmount = round2(quotation?.discount_amount ?? 0)
  const rawAfterDiscount = round2(
    quotation?.after_discount ?? Math.max(0, subtotal - discountAmount)
  )
  const rawBase =
    rawAfterDiscount > 0
      ? rawAfterDiscount
      : round2(quotation?.grand_total ?? quotation?.total_amount ?? 0)

  const whtRate = Number(quotation?.wht_rate || 0)
  const vatRate = validTaxType === 'vat_exempt' ? 0 : 7
  const breakdown = calculateTaxBreakdown({
    rawTotal: rawBase,
    taxType: validTaxType,
    whtRate,
    vatRate: 7,
  })

  return {
    tax_type: validTaxType,
    vat_rate: vatRate,
    vat_amount: breakdown.vatAmount,
    wht_rate: whtRate,
    wht_amount: breakdown.whtAmount,
    grand_total: breakdown.netPayable,
    total_amount: breakdown.netPayable,
    updated_at: new Date().toISOString(),
  }
}
