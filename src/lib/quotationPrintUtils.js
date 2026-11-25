import { calculateTaxBreakdown, inferQuotationTaxType, round2 } from './tax.js'
import { isServiceOrLaborItem } from './quotationStockCheck.js'

/**
 * คัดกรองเฉพาะรายการสินค้าสำหรับพิมพ์ใบเสนอราคาส่งลูกค้า (ซ่อนบรรทัดค่าแรง/บริการตามแนวทาง 1A)
 * โดยไม่เปลี่ยนแปลงยอดรวมสุทธิและ VAT ของแพ็กเกจ
 * @param {Array} items
 */
export function getCustomerPrintItems(items = []) {
  return (items || []).filter((item) => item && !isServiceOrLaborItem(item))
}

/**
 * สรุปยอดรวมและสถานะ VAT สำหรับเอกสารใบเสนอราคาฝั่งลูกค้า (ไม่เปิดเผยต้นทุนหรือราคาซื้อ)
 * @param {object} quotation
 */
export function buildCustomerQuotationSummary(quotation = {}) {
  const taxType = inferQuotationTaxType(quotation)
  const hasVat = taxType !== 'vat_exempt'
  const vatRate = hasVat ? Number(quotation?.vat_rate ?? 7) : 0

  const subtotal = round2(quotation?.subtotal ?? 0)
  const discountAmount = round2(quotation?.discount_amount ?? 0)
  const afterDiscount = round2(
    quotation?.after_discount ?? Math.max(0, subtotal - discountAmount)
  )

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
