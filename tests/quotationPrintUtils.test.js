import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCustomerQuotationSummary,
  buildQuotationTaxUpdatePayload,
  getCustomerPrintItems,
  getCustomerPrintMode,
  resolveQuotationType,
} from '../src/lib/quotationPrintUtils.js'

describe('Customer Quotation Print Summary & VAT Switch Helpers (src/lib/quotationPrintUtils.js)', () => {
  it('formats vat_excluded quotation clearly as having VAT 7% excluded', () => {
    const summary = buildCustomerQuotationSummary({
      subtotal: 42120,
      discount_amount: 0,
      after_discount: 42120,
      tax_type: 'vat_excluded',
      vat_rate: 7,
      vat_amount: 2948.4,
      wht_rate: 0,
      wht_amount: 0,
      grand_total: 45068.4,
    })

    assert.equal(summary.taxType, 'vat_excluded')
    assert.equal(summary.hasVat, true)
    assert.equal(summary.vatRate, 7)
    assert.equal(summary.amountBeforeVat, 42120)
    assert.equal(summary.vatAmount, 2948.4)
    assert.equal(summary.grandTotal, 45068.4)
    assert.match(summary.vatStatusLabel, /มี VAT/i)
  })

  it('formats vat_included quotation with extracted pre-VAT base and clear VAT label', () => {
    const summary = buildCustomerQuotationSummary({
      subtotal: 42120,
      discount_amount: 0,
      after_discount: 42120,
      tax_type: 'vat_included',
      vat_rate: 7,
      vat_amount: 2755.51,
      wht_rate: 0,
      wht_amount: 0,
      grand_total: 42120,
    })

    assert.equal(summary.taxType, 'vat_included')
    assert.equal(summary.hasVat, true)
    assert.equal(summary.vatRate, 7)
    assert.equal(summary.amountBeforeVat, 39364.49)
    assert.equal(summary.vatAmount, 2755.51)
    assert.equal(summary.grandTotal, 42120)
    assert.match(summary.vatStatusLabel, /มี VAT/i)
    assert.match(summary.vatStatusLabel, /รวม/)
  })

  it('formats vat_exempt quotation clearly as having NO VAT', () => {
    const summary = buildCustomerQuotationSummary({
      subtotal: 42120,
      discount_amount: 120,
      after_discount: 42000,
      tax_type: 'vat_exempt',
      vat_rate: 0,
      vat_amount: 0,
      wht_rate: 0,
      wht_amount: 0,
      grand_total: 42000,
    })

    assert.equal(summary.taxType, 'vat_exempt')
    assert.equal(summary.hasVat, false)
    assert.equal(summary.vatRate, 0)
    assert.equal(summary.discountAmount, 120)
    assert.equal(summary.vatAmount, 0)
    assert.equal(summary.grandTotal, 42000)
    assert.match(summary.vatStatusLabel, /ไม่มี VAT/i)
  })

  it('computes updated quotation VAT payload cleanly when switching between all 3 VAT modes', () => {
    const baseQuotation = {
      subtotal: 100000,
      discount_amount: 0,
      after_discount: 100000,
      wht_rate: 0,
      tax_type: 'vat_included',
      vat_rate: 7,
      vat_amount: 6542.06,
      grand_total: 100000,
    }

    const excl = buildQuotationTaxUpdatePayload(baseQuotation, 'vat_excluded')
    assert.equal(excl.tax_type, 'vat_excluded')
    assert.equal(excl.vat_rate, 7)
    assert.equal(excl.vat_amount, 7000)
    assert.equal(excl.grand_total, 107000)
    assert.equal(excl.total_amount, 107000)

    const exempt = buildQuotationTaxUpdatePayload(baseQuotation, 'vat_exempt')
    assert.equal(exempt.tax_type, 'vat_exempt')
    assert.equal(exempt.vat_rate, 0)
    assert.equal(exempt.vat_amount, 0)
    assert.equal(exempt.grand_total, 100000)
    assert.equal(exempt.total_amount, 100000)

    const incl = buildQuotationTaxUpdatePayload(baseQuotation, 'vat_included')
    assert.equal(incl.tax_type, 'vat_included')
    assert.equal(incl.vat_rate, 7)
    assert.equal(incl.vat_amount, 6542.06)
    assert.equal(incl.grand_total, 100000)
    assert.equal(incl.total_amount, 100000)
  })

  it('filters out labor/installation/service lines from customer print PDF while keeping physical products (Option 1A)', () => {
    const rawItems = [
      { id: 'qi-1', item_name: 'ค่าแรงติดตั้งและทดสอบระบบ (Installation & Commissioning)', quantity: 5000, unit: 'Watt', unit_price: 2.16 },
      { id: 'qi-2', item_name: 'แผงโซลาร์เซลล์ Tier-1 Mono Half-cell 550W', quantity: 4, unit: 'แผง', unit_price: 4320 },
      { id: 'qi-3', item_name: 'ชุดจับยึดแผง', quantity: 4, unit: 'ชุด', unit_price: 2160 },
      { id: 'qi-4', item_name: 'Inverter 600w', quantity: 1, unit: 'ชุด', unit_price: 5400 },
      { id: 'qi-5', item_name: 'ค่าขนส่งอุปกรณ์หน้างาน', quantity: 1, unit: 'เหมา', unit_price: 1500 },
    ]

    const printable = getCustomerPrintItems(rawItems)
    assert.equal(printable.length, 3)
    assert.deepEqual(
      printable.map((i) => i.item_name),
      [
        'แผงโซลาร์เซลล์ Tier-1 Mono Half-cell 550W',
        'ชุดจับยึดแผง',
        'Inverter 600w',
      ]
    )
    assert.deepEqual(getCustomerPrintItems([]), [])
  })

  it('enforces project vs product print modes and never exposes base_cost, markup_percent, or stock fields', () => {
    assert.equal(resolveQuotationType({ type: 'product' }), 'product')
    assert.equal(resolveQuotationType({ quotation_no: 'QT-S-202611-1234' }), 'product')
    assert.equal(resolveQuotationType({ quotation_no: 'QT-P-202611-1234' }), 'project')

    const projectMode = getCustomerPrintMode({ type: 'project', discount_amount: 50 })
    assert.deepEqual(projectMode, {
      type: 'project',
      showUnitPrice: false,
      showLineTotal: false,
      showPerItemDiscount: false,
      showDiscountSummary: false,
    })

    const productModeWhole = getCustomerPrintMode({
      type: 'product',
      discount_mode: 'whole_bill',
      discount_amount: 500,
    })
    assert.deepEqual(productModeWhole, {
      type: 'product',
      showUnitPrice: true,
      showLineTotal: true,
      showPerItemDiscount: false,
      showDiscountSummary: true,
    })

    const rawItems = [
      {
        id: 'qi-1',
        item_name: 'Inverter 10kW',
        quantity: 2,
        unit: 'เครื่อง',
        base_cost: 30000,
        unit_price: 36000,
        discount_percent: 5,
        total_amount: 68400,
        inStock: 10,
        qty_on_hand: 10,
      },
      {
        id: 'qi-2',
        item_name: 'ค่าแรงติดตั้งระบบ',
        quantity: 5000,
        unit: 'Watt',
        base_cost: 3,
        unit_price: 3.45,
        total_amount: 17250,
      },
    ]

    const projectRows = getCustomerPrintItems(rawItems, { type: 'project' })
    assert.equal(projectRows.length, 1)
    assert.equal('unit_price' in projectRows[0], false)
    assert.equal('total_amount' in projectRows[0], false)
    assert.equal('base_cost' in projectRows[0], false)
    assert.equal('inStock' in projectRows[0], false)

    const productRows = getCustomerPrintItems([rawItems[0]], {
      type: 'product',
      discount_mode: 'per_item',
    })
    assert.equal(productRows[0].unit_price, 36000)
    assert.equal(productRows[0].total_amount, 68400)
    assert.equal(productRows[0].discount_percent, 5)
    assert.equal('base_cost' in productRows[0], false)
    assert.equal('qty_on_hand' in productRows[0], false)

    const projSummary = buildCustomerQuotationSummary({
      type: 'project',
      subtotal: 100000,
      discount_amount: 1000,
      after_discount: 100000,
      tax_type: 'vat_exempt',
      total_cost: 80000,
      markup_percent: 25,
    })
    assert.equal(projSummary.discountAmount, 0)
    assert.equal('totalCost' in projSummary, false)
    assert.equal('markupPercent' in projSummary, false)
  })
})
