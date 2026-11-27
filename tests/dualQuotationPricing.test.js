import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  QUOTATION_TYPES,
  applyMarkup,
  calculateDocumentPricing,
  generateTypedQuotationNo,
} from '../src/lib/tax.js'
import {
  buildQuotationItemsFromBoq,
  buildQuotationPayloadFromBoq,
  buildQuotationStatusTransitionPayload,
  syncDraftItemsFromStore,
  saveQuotationWithFallback,
  saveQuotationItemsWithFallback,
} from '../src/lib/boqToQuotation.js'

describe('Unified Markup & Document Pricing Engine (src/lib/tax.js)', () => {
  it('defines QUOTATION_TYPES and generates separated QT-P / QT-S document numbers', () => {
    assert.deepEqual(QUOTATION_TYPES, { PROJECT: 'project', PRODUCT: 'product' })

    const fixedDate = new Date('2026-11-27T00:00:00Z')
    assert.equal(generateTypedQuotationNo('project', fixedDate, '1234'), 'QT-P-202611-1234')
    assert.equal(generateTypedQuotationNo('product', fixedDate, '5678'), 'QT-S-202611-5678')
    assert.match(generateTypedQuotationNo('product', fixedDate), /^QT-S-202611-\d{4}$/)
    assert.match(generateTypedQuotationNo('project', fixedDate), /^QT-P-202611-\d{4}$/)
  })

  it('rounds unit selling price to 2 decimals via applyMarkup and clamps negative inputs to 0', () => {
    assert.equal(applyMarkup(10.01, 15), 11.51)
    assert.equal(applyMarkup(100, 0), 100)
    assert.equal(applyMarkup(100, -10), 100)
    assert.equal(applyMarkup(-50, 20), 0)
  })

  it('guarantees line sums match subtotal strictly by rounding unit price first (BOQ/QT parity)', () => {
    const pricing = calculateDocumentPricing({
      items: [
        { quantity: 7, base_cost: 10.01 },
        { quantity: 2, base_cost: 500 },
      ],
      markupPercent: 15,
      pricingFromCost: true,
      discountMode: 'none',
      taxType: 'vat_excluded',
      vatRate: 7,
    })

    assert.equal(pricing.lineRows[0].unitSellingPrice, 11.51)
    assert.equal(pricing.lineRows[0].lineTotal, 80.57)
    assert.equal(pricing.lineRows[1].unitSellingPrice, 575)
    assert.equal(pricing.lineRows[1].lineTotal, 1150)
    assert.equal(pricing.subtotal, 1230.57)
    assert.equal(pricing.afterDiscount, 1230.57)
    assert.equal(pricing.totalCost, 1070.07)
    assert.equal(pricing.markupAmount, 160.5)
    assert.equal(pricing.vatAmount, 86.14)
    assert.equal(pricing.grandTotal, 1316.71)
    assert.equal(pricing.isBelowCost, false)
  })

  it('supports whole_bill discounts in Baht and Percent and caps over-discount at subtotal', () => {
    const bahtDisc = calculateDocumentPricing({
      items: [{ quantity: 4, base_cost: 100 }],
      markupPercent: 25,
      pricingFromCost: true,
      discountMode: 'whole_bill',
      headerDiscountType: 'amount',
      headerDiscountValue: 50,
      taxType: 'vat_exempt',
    })
    assert.equal(bahtDisc.subtotal, 500)
    assert.equal(bahtDisc.discountAmount, 50)
    assert.equal(bahtDisc.afterDiscount, 450)
    assert.equal(bahtDisc.grandTotal, 450)

    const pctDisc = calculateDocumentPricing({
      items: [{ quantity: 2, base_cost: 200 }],
      markupPercent: 10,
      pricingFromCost: true,
      discountMode: 'whole_bill',
      headerDiscountType: 'percent',
      headerDiscountValue: 10,
      taxType: 'vat_included',
      vatRate: 7,
    })
    assert.equal(pctDisc.subtotal, 440)
    assert.equal(pctDisc.discountAmount, 44)
    assert.equal(pctDisc.afterDiscount, 396)
    assert.equal(pctDisc.grandTotal, 396)
    assert.equal(pctDisc.isBelowCost, true)
    assert.equal(pctDisc.belowCostAmount, 4)

    const overDisc = calculateDocumentPricing({
      items: [{ quantity: 1, base_cost: 100 }],
      markupPercent: 10,
      pricingFromCost: true,
      discountMode: 'whole_bill',
      headerDiscountType: 'amount',
      headerDiscountValue: 9999,
      taxType: 'vat_excluded',
    })
    assert.equal(overDisc.discountAmount, 110)
    assert.equal(overDisc.afterDiscount, 0)
    assert.equal(overDisc.grandTotal, 0)
    assert.equal(overDisc.isBelowCost, true)
    assert.equal(overDisc.belowCostAmount, 100)
  })

  it('supports per_item discounts with exact subtotal - discount = sum(lineTotal) reconciliation', () => {
    const pricing = calculateDocumentPricing({
      items: [
        { quantity: 3, base_cost: 100, discount_percent: 10 },
        { quantity: 2, base_cost: 50, discount_percent: 5 },
      ],
      markupPercent: 20,
      pricingFromCost: true,
      discountMode: 'per_item',
      taxType: 'vat_excluded',
      vatRate: 7,
    })

    // Line 1: unit=120, gross=360, disc=36, net=324
    // Line 2: unit=60, gross=120, disc=6, net=114
    assert.equal(pricing.subtotal, 480)
    assert.equal(pricing.discountAmount, 42)
    assert.equal(pricing.afterDiscount, 438)
    assert.equal(
      Math.round(pricing.lineRows.reduce((s, r) => s + r.lineTotal, 0) * 100) / 100,
      pricing.afterDiscount
    )
    assert.equal(pricing.vatAmount, 30.66)
    assert.equal(pricing.grandTotal, 468.66)
  })
})

describe('BOQ <-> Project Quotation Parity, Snapshot Sync & Fallback Saves (src/lib/boqToQuotation.js)', () => {
  it('reconciles BOQ grand_total and converted QT-P subtotal with 0.00 satang drift', () => {
    const boqItems = [
      { item_name: 'สายไฟ PV1-F', item_code: 'ITM-01', quantity: 7, unit: 'เส้น', material_unit_cost: 10.01, labor_unit_cost: 0 },
      { item_name: 'ค่าแรงติดตั้งระบบ', quantity: 5000, unit: 'Watt', material_unit_cost: 0, labor_unit_cost: 3 },
    ]
    const boqPricing = calculateDocumentPricing({
      items: boqItems.map((b) => ({
        quantity: b.quantity,
        base_cost: Number(b.material_unit_cost || 0) + Number(b.labor_unit_cost || 0),
      })),
      markupPercent: 15,
      pricingFromCost: true,
      discountMode: 'none',
      taxType: 'vat_exempt',
    })

    const boqHeader = {
      id: 'boq-1',
      boq_no: 'BOQ-202611-1001',
      markup_percent: 15,
      total_cost: boqPricing.totalCost,
      grand_total: boqPricing.grandTotal,
    }

    const qItems = buildQuotationItemsFromBoq(boqHeader, boqItems)
    assert.equal(qItems[0].base_cost, 10.01)
    assert.equal(qItems[0].unit_price, 11.51)
    assert.equal(qItems[0].total_amount, 80.57)
    assert.equal(qItems[0].item_code, 'ITM-01')

    const { payload } = buildQuotationPayloadFromBoq({
      boq: boqHeader,
      boqItems,
      taxType: 'vat_excluded',
      salesPerson: 'จัดซื้อ ทดสอบ',
      salesPersonId: 'user-uuid-1',
    })

    assert.match(payload.quotation_no, /^QT-P-\d{6}-\d{4}$/)
    assert.equal(payload.type, 'project')
    assert.equal(payload.discount_mode, 'none')
    assert.equal(payload.discount_amount, 0)
    assert.equal(payload.subtotal, boqPricing.grandTotal)
    assert.equal(payload.total_cost, boqPricing.totalCost)
    assert.equal(payload.created_by, 'user-uuid-1')
    assert.equal(payload.issued_by, null)
    assert.equal(payload.issued_by_name, null)
    assert.equal(payload.issued_at, null)
  })

  it('syncs Store avg_unit_cost only when status is draft and freezes snapshots after issuance', () => {
    const draftItems = [
      { item_id: 'inv-1', item_name: 'Panel 550W', quantity: '4', base_cost: '3000', unit: 'แผง' },
    ]
    const updatedStore = [
      { id: 'inv-1', item_code: 'ITM-550', item_name: 'Panel 550W', unit: 'แผง', avg_unit_cost: 3450 },
    ]

    const syncedDraft = syncDraftItemsFromStore(draftItems, updatedStore, 'draft')
    assert.equal(syncedDraft[0].base_cost, '3450')
    assert.equal(syncedDraft[0].item_code, 'ITM-550')

    const frozenSent = syncDraftItemsFromStore(draftItems, updatedStore, 'sent')
    assert.equal(frozenSent[0].base_cost, '3000')

    const frozenApproved = syncDraftItemsFromStore(draftItems, updatedStore, 'approved')
    assert.equal(frozenApproved[0].base_cost, '3000')
  })

  it('preserves QT-S prefix on duplicate quotation_no retry and strips missing item columns in fallback insert', async () => {
    const insertedPayloads = []
    const mockQtClient = {
      from() {
        return {
          insert(rows) {
            insertedPayloads.push(rows[0].quotation_no)
            return {
              select() {
                return {
                  async single() {
                    if (insertedPayloads.length === 1) {
                      return { data: null, error: { message: 'duplicate key value violates unique constraint "quotations_quotation_no_key"' } }
                    }
                    return { data: { id: 'qt-new', quotation_no: rows[0].quotation_no }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const res = await saveQuotationWithFallback(mockQtClient, {
      quotation_no: 'QT-S-202611-1111',
      type: 'product',
    })
    assert.equal(insertedPayloads.length, 2)
    assert.match(res.quotation_no, /^QT-S-\d{6}-\d{4,5}$/)

    let attempt = 0
    const mockItemClient = {
      from() {
        return {
          async insert(rows) {
            attempt += 1
            if (attempt === 1) {
              return { error: { message: 'Could not find the \'base_cost\' column of \'quotation_items\'' } }
            }
            assert.equal('base_cost' in rows[0], false)
            return { error: null }
          },
        }
      },
    }

    const itemRes = await saveQuotationItemsWithFallback(mockItemClient, [
      { quotation_id: 'qt-new', item_name: 'Cable', quantity: 2, unit: 'เส้น', base_cost: 50, unit_price: 60, total_amount: 120 },
    ])
    assert.equal(attempt, 2)
    assert.equal(itemRes.error, null)
  })
})

describe('Fix Pass Guardrails: Retries/Throw on Failure & Accurate Issuance Tracking', () => {
  it('throws on exhausted retries instead of returning null id and handles >12 stripped columns cleanly', async () => {
    const missingCols = [
      'type',
      'markup_percent',
      'discount_mode',
      'header_discount_type',
      'header_discount_value',
      'total_cost',
      'issued_by',
      'issued_by_name',
      'issued_at',
      'tax_type',
      'boq_id',
      'created_by',
      'project_id',
    ]

    const resilientClient = {
      from() {
        return {
          insert(rows) {
            return {
              select() {
                return {
                  async single() {
                    const row = rows[0]
                    const missing = missingCols.find((col) => col in row)
                    if (missing) {
                      return {
                        data: null,
                        error: { message: `Could not find the '${missing}' column of 'quotations'` },
                      }
                    }
                    return { data: { id: 'qt-uuid-ok', quotation_no: row.quotation_no }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const fullPayload = { quotation_no: 'QT-S-202611-9999' }
    for (const c of missingCols) fullPayload[c] = 'val'
    const okRes = await saveQuotationWithFallback(resilientClient, fullPayload)
    assert.equal(okRes.id, 'qt-uuid-ok')

    const failingClient = {
      from() {
        return {
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { message: 'foreign key violation on boq_id' } }
                  },
                }
              },
            }
          },
        }
      },
    }

    await assert.rejects(
      () => saveQuotationWithFallback(failingClient, { quotation_no: 'QT-S-202611-1111' }),
      { message: /foreign key violation/ }
    )

    const failingItemsClient = {
      from() {
        return {
          async insert() {
            return { error: { message: 'permission denied for relation quotation_items' } }
          },
        }
      },
    }
    const itemsErrRes = await saveQuotationItemsWithFallback(failingItemsClient, [
      { quotation_id: 'qt-1', item_name: 'Item', quantity: 1, unit: 'pcs', unit_price: 10, total_amount: 10 },
    ])
    assert.ok(itemsErrRes.error)
    assert.match(itemsErrRes.error.message, /permission denied/)
  })

  it('keeps draft issuer blank on BOQ conversion and stamps actual issuer on draft -> sent transition', () => {
    const { payload } = buildQuotationPayloadFromBoq({
      boq: { id: 'boq-2', boq_no: 'BOQ-202611-2222', markup_percent: 10 },
      boqItems: [{ item_name: 'Cable', quantity: 2, unit: 'm', material_unit_cost: 50 }],
      salesPerson: 'คนสร้างร่าง',
      salesPersonId: 'creator-1',
    })
    assert.equal(payload.status, 'draft')
    assert.equal(payload.issued_by, null)
    assert.equal(payload.issued_by_name, null)
    assert.equal(payload.issued_at, null)

    const sentUpdate = buildQuotationStatusTransitionPayload({
      quotation: {
        id: 'qt-1',
        status: 'draft',
        sales_person: 'คนสร้างร่าง',
        issued_by: null,
        issued_by_name: null,
        issued_at: null,
      },
      nextStatus: 'sent',
      actor: { id: 'issuer-2', full_name: 'ฝ่ายจัดซื้อ ผู้ออกใบ' },
    })

    assert.equal(sentUpdate.status, 'sent')
    assert.equal(sentUpdate.issued_by, 'issuer-2')
    assert.equal(sentUpdate.issued_by_name, 'ฝ่ายจัดซื้อ ผู้ออกใบ')
    assert.ok(sentUpdate.issued_at)
  })
})
