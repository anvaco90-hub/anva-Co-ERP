import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isServiceOrLaborItem,
  canCreatePrFromQuotation,
  checkQuotationStock,
  summarizeQuotationStock,
  buildShortfallPrItems,
  buildIssuableStockLines,
  summarizeItemLotSources,
  summarizeQuotationPrCoverage,
} from '../src/lib/quotationStockCheck.js'

describe('Quotation Stock Check & Shortfall PR Helpers (src/lib/quotationStockCheck.js)', () => {
  it('identifies labor and service items accurately without false positives on hardware with Watt ratings', () => {
    assert.equal(
      isServiceOrLaborItem({ item_name: 'ค่าแรงติดตั้งและทดสอบระบบ (Installation & Commissioning)', unit: 'Watt' }),
      true
    )
    assert.equal(isServiceOrLaborItem({ item_name: 'ค่าบริการยื่นขออนุญาตการไฟฟ้า', unit: 'งาน' }), true)
    assert.equal(isServiceOrLaborItem({ item_name: 'ค่าขนส่งอุปกรณ์หน้างาน', unit: 'เหมา' }), true)
    assert.equal(isServiceOrLaborItem({ item_name: 'งานเดินระบบไฟ AC/DC', unit: 'LS' }), true)

    // Real physical equipment with W/kW in the name must NOT be skipped
    assert.equal(isServiceOrLaborItem({ item_name: 'แผงโซลาร์เซลล์ Mono Half-Cell 550W', unit: 'แผง' }), false)
    assert.equal(isServiceOrLaborItem({ item_name: 'อินเวอร์เตอร์ Huawei SUN2000-10KTL 10kW', unit: 'เครื่อง' }), false)
    assert.equal(isServiceOrLaborItem({ item_name: 'สายไฟ PV1-F 4 sq.mm', unit: 'เมตร' }), false)
  })

  it('classifies enough, partial, out_of_stock, not_in_inventory, and service items using qty_on_hand', () => {
    const quotationItems = [
      { id: 'qi-1', item_name: 'แผงโซลาร์เซลล์ 550W', quantity: 10, unit: 'แผง' },
      { id: 'qi-2', item_name: '  อินเวอร์เตอร์   10kW ', quantity: 3, unit: 'เครื่อง' },
      { id: 'qi-3', item_name: 'ตู้ Combiner Box DC', quantity: 2, unit: 'ชุด' },
      { id: 'qi-4', item_name: 'รางอลูมิเนียม Mounting 4.2m', quantity: 20, unit: 'เส้น' },
      { id: 'qi-5', item_name: 'ค่าแรงติดตั้งระบบโซล่าเซลล์', quantity: 10000, unit: 'Watt' },
    ]

    const inventoryItems = [
      { id: 'inv-1', item_code: 'ITM-00001', item_name: 'แผงโซลาร์เซลล์ 550W', qty_on_hand: 15, unit: 'แผง' },
      { id: 'inv-2', item_code: 'ITM-00002', item_name: 'อินเวอร์เตอร์ 10kW', qty_on_hand: 1, unit: 'เครื่อง' },
      { id: 'inv-3', item_code: 'ITM-00003', item_name: 'ตู้ Combiner Box DC', qty_on_hand: 0, unit: 'ชุด' },
    ]

    const result = checkQuotationStock(quotationItems, inventoryItems)

    assert.equal(result.length, 5)

    // 1. Enough stock
    assert.equal(result[0].status, 'enough')
    assert.equal(result[0].inStock, 15)
    assert.equal(result[0].needed, 10)
    assert.equal(result[0].issueQty, 10)
    assert.equal(result[0].shortfall, 0)
    assert.equal(result[0].itemId, 'inv-1')

    // 2. Partial stock (whitespace-insensitive name matching)
    assert.equal(result[1].status, 'partial')
    assert.equal(result[1].inStock, 1)
    assert.equal(result[1].needed, 3)
    assert.equal(result[1].issueQty, 1)
    assert.equal(result[1].shortfall, 2)
    assert.equal(result[1].itemId, 'inv-2')

    // 3. Out of stock (exists in inventory_items with qty_on_hand = 0)
    assert.equal(result[2].status, 'out_of_stock')
    assert.equal(result[2].inStock, 0)
    assert.equal(result[2].issueQty, 0)
    assert.equal(result[2].shortfall, 2)
    assert.equal(result[2].itemId, 'inv-3')

    // 4. Not in inventory_items
    assert.equal(result[3].status, 'not_in_inventory')
    assert.equal(result[3].inStock, 0)
    assert.equal(result[3].issueQty, 0)
    assert.equal(result[3].shortfall, 20)
    assert.equal(result[3].itemId, null)

    // 5. Service / labor item skipped
    assert.equal(result[4].status, 'service')
    assert.equal(result[4].inStock, null)
    assert.equal(result[4].issueQty, 0)
    assert.equal(result[4].shortfall, 0)

    const summary = summarizeQuotationStock(result)
    assert.deepEqual(summary, {
      totalItems: 5,
      totalChecked: 4,
      enoughCount: 1,
      partialCount: 1,
      outOfStockCount: 1,
      notInInventoryCount: 1,
      serviceCount: 1,
      shortageCount: 3,
      issuableCount: 2,
    })
  })

  it('builds PR items only for shortfall quantities and excludes enough or service lines', () => {
    const quotation = { id: 'qt-1', tax_type: 'vat_excluded', vat_rate: 7 }
    const quotationItems = [
      { id: 'qi-1', item_name: 'แผงโซลาร์ 550W', quantity: 10, unit: 'แผง', unit_price: 4000 },
      { id: 'qi-2', item_name: 'อินเวอร์เตอร์ 10kW', quantity: 10, unit: 'เครื่อง', unit_price: 50000 },
      { id: 'qi-3', item_name: 'MC4 Connector', quantity: 20, unit: 'คู่', unit_price: 120 },
      { id: 'qi-4', item_name: 'ค่าแรงติดตั้งระบบ', quantity: 10000, unit: 'Watt', unit_price: 3.5 },
    ]
    const boqItems = [
      { item_name: 'อินเวอร์เตอร์ 10kW', material_unit_cost: 42000, quantity: 10 },
    ]
    const inventoryItems = [
      { id: 'inv-1', item_name: 'แผงโซลาร์ 550W', qty_on_hand: 10, avg_unit_cost: 3200, unit: 'แผง' },
      { id: 'inv-2', item_name: 'อินเวอร์เตอร์ 10kW', qty_on_hand: 6, avg_unit_cost: 40000, unit: 'เครื่อง' },
    ]

    const prItems = buildShortfallPrItems({
      quotation,
      quotationItems,
      boqItems,
      inventoryItems,
      mode: 'cost_baseline',
    })

    // แผงโซลาร์ (enough) and ค่าแรงติดตั้งระบบ (service) must NOT be in shortfall PR!
    assert.equal(prItems.length, 2)

    assert.equal(prItems[0].item_name, 'อินเวอร์เตอร์ 10kW')
    assert.equal(prItems[0].quantity, '4')
    assert.equal(prItems[0].price, '42000') // BOQ cost baseline preserved
    assert.equal(prItems[0].neededQty, 10)
    assert.equal(prItems[0].inStockQty, 6)

    assert.equal(prItems[1].item_name, 'MC4 Connector')
    assert.equal(prItems[1].quantity, '20')
    assert.equal(prItems[1].price, '')
    assert.equal(prItems[1].inStockQty, 0)
  })

  it('builds issuable stock lines capped cleanly at available qty_on_hand', () => {
    const quotationItems = [
      { id: 'qi-1', item_name: 'แผงโซลาร์ 550W', quantity: 10, unit: 'แผง' },
      { id: 'qi-2', item_name: 'อินเวอร์เตอร์ 10kW', quantity: 5, unit: 'เครื่อง' },
      { id: 'qi-3', item_name: 'เบรกเกอร์ DC', quantity: 4, unit: 'ตัว' },
      { id: 'qi-4', item_name: 'ค่าบริการติดตั้ง', quantity: 1, unit: 'งาน' },
    ]
    const inventoryItems = [
      { id: 'inv-1', item_name: 'แผงโซลาร์ 550W', qty_on_hand: 12, unit: 'แผง' },
      { id: 'inv-2', item_name: 'อินเวอร์เตอร์ 10kW', qty_on_hand: 3.7, unit: 'เครื่อง' },
      { id: 'inv-3', item_name: 'เบรกเกอร์ DC', qty_on_hand: 0, unit: 'ตัว' },
    ]

    const lines = buildIssuableStockLines(quotationItems, inventoryItems)
    assert.deepEqual(lines, [
      { item_id: 'inv-1', quantity: '10' },
      { item_id: 'inv-2', quantity: '3' },
    ])
  })

  it('aggregates duplicate item_ids cleanly in buildIssuableStockLines and preserves unit prices in buildShortfallPrItems', () => {
    const quotation = { id: 'qt-2', tax_type: 'vat_excluded', vat_rate: 7 }
    const quotationItems = [
      { id: 'qi-a', item_id: 'inv-cable', item_name: 'สายไฟ PV1-F 4 sq.mm (ชุด A)', quantity: 40, unit: 'เมตร', unit_price: 0, total_amount: 1200 },
      { id: 'qi-b', item_id: 'inv-cable', item_name: 'สายไฟ PV1-F 4 sq.mm (ชุด B)', quantity: 30, unit: 'เมตร', unit_price: 30 },
    ]
    const inventoryItems = [
      { id: 'inv-cable', item_name: 'สายไฟ PV1-F', qty_on_hand: 50, unit: 'เมตร' },
    ]

    const lines = buildIssuableStockLines(quotationItems, inventoryItems)
    assert.deepEqual(lines, [{ item_id: 'inv-cable', quantity: '50' }])

    // Each line checks against inventory qty_on_hand=50, line qi-a needed 40 (enough), qi-b needed 30 (enough individually)
    // Now test partial qty where unit_price=0 & total_amount used:
    const partialItems = [
      { id: 'qi-c', item_id: 'inv-cable', item_name: 'สายไฟ PV1-F', quantity: 80, unit: 'เมตร', unit_price: 0, total_amount: 2400 },
    ]
    const prShortfall = buildShortfallPrItems({
      quotation,
      quotationItems: partialItems,
      inventoryItems,
      mode: 'selling_ref',
    })
    assert.equal(prShortfall.length, 1)
    assert.equal(prShortfall[0].quantity, '30')
    assert.equal(prShortfall[0].price, '30') // 2400 / 80 = 30, NOT 2400 / 30 = 80
  })

  it('summarizes remaining lot sources by project and central store cleanly without mixing empty or zero lots', () => {
    const stockLots = [
      { item_id: 'inv-1', source_project_id: 'pj-1', qty_remaining: 3, projects: { project_code: 'PJ-000001', project_name: 'บ้านคุณเอ' } },
      { item_id: 'inv-1', source_project_id: 'pj-1', qty_remaining: 2, projects: { project_code: 'PJ-000001', project_name: 'บ้านคุณเอ' } },
      { item_id: 'inv-1', source_project_id: null, qty_remaining: 4, projects: null },
      { item_id: 'inv-1', source_project_id: 'pj-2', qty_remaining: 0, projects: { project_code: 'PJ-000002', project_name: 'Zero Lot' } },
      { item_id: 'inv-2', source_project_id: 'pj-3', qty_remaining: 1, projects: { project_code: 'PJ-000003', project_name: 'ร้าน B' } },
    ]

    const grouped = summarizeItemLotSources(stockLots)
    assert.deepEqual(grouped['inv-1'], [
      { projectId: 'pj-1', projectCode: 'PJ-000001', projectName: 'บ้านคุณเอ', qty: 5, isCentral: false },
      { projectId: null, projectCode: null, projectName: 'คลังกลาง', qty: 4, isCentral: true },
    ])
    assert.deepEqual(grouped['inv-2'], [
      { projectId: 'pj-3', projectCode: 'PJ-000003', projectName: 'ร้าน B', qty: 1, isCentral: false },
    ])
    assert.deepEqual(summarizeItemLotSources([]), {})
  })

  it('computes remaining uncovered shortfall items after subtracting quantities already requested on existing active PRs', () => {
    const shortfallItems = [
      { item_name: 'Inverter 600w', quantity: '1', unit: 'ชุด', price: '5000' },
      { item_name: 'ชุดจับยึดแผง', quantity: '4', unit: 'ชุด', price: '2000' },
    ]

    // Existing PR2026-0008 already requested all 1 Inverter and 2 mounting kits
    const existingPrItems = [
      { pr_id: 'pr-8', pr_no: 'PR2026-0008', item_name: '  inverter 600w ', quantity: 1 },
      { pr_id: 'pr-8', pr_no: 'PR2026-0008', item_name: 'ชุดจับยึดแผง', quantity: 2 },
    ]

    const coverage = summarizeQuotationPrCoverage(shortfallItems, existingPrItems)
    assert.equal(coverage.uncoveredCount, 1)
    assert.equal(coverage.uncoveredItems[0].item_name, 'ชุดจับยึดแผง')
    assert.equal(coverage.uncoveredItems[0].quantity, '2')
    assert.equal(coverage.coveredCount, 1)
    assert.deepEqual(coverage.getItemCoverage('Inverter 600w'), {
      requestedQty: 1,
      uncoveredQty: 0,
      isFullyCovered: true,
      prNos: ['PR2026-0008'],
    })
    assert.deepEqual(coverage.getItemCoverage('ชุดจับยึดแผง'), {
      requestedQty: 2,
      uncoveredQty: 2,
      isFullyCovered: false,
      prNos: ['PR2026-0008'],
    })

    // When everything is covered
    const fullCoverage = summarizeQuotationPrCoverage(shortfallItems, [
      { pr_id: 'pr-8', pr_no: 'PR2026-0008', item_name: 'Inverter 600w', quantity: 1 },
      { pr_id: 'pr-8', pr_no: 'PR2026-0008', item_name: 'ชุดจับยึดแผง', quantity: 4 },
    ])
    assert.equal(fullCoverage.uncoveredCount, 0)
    assert.equal(fullCoverage.coveredCount, 2)
  })

  it('locks PR creation until customer approval and always checks stock for tracked Store item_ids', () => {
    assert.equal(canCreatePrFromQuotation({ status: 'draft' }), false)
    assert.equal(canCreatePrFromQuotation({ status: 'sent', customer_po_no: '' }), false)
    assert.equal(canCreatePrFromQuotation({ status: 'rejected', customer_po_no: 'PO-1' }), false)
    assert.equal(canCreatePrFromQuotation({ status: 'approved' }), true)
    assert.equal(canCreatePrFromQuotation({ status: 'sent', customer_po_no: 'QT-S-202611-0001' }), true)

    const inventoryItems = [
      { id: 'inv-plug', item_code: 'ITM-P01', item_name: 'ปลั๊กจุดต่อสายงานโซลาร์', qty_on_hand: 2, unit: 'จุด' },
    ]
    const stockRows = checkQuotationStock(
      [{ id: 'qi-1', item_id: 'inv-plug', item_name: 'ปลั๊กจุดต่อสายงานโซลาร์', quantity: 5, unit: 'จุด' }],
      inventoryItems
    )
    assert.equal(stockRows[0].status, 'partial')
    assert.equal(stockRows[0].inStock, 2)
    assert.equal(stockRows[0].shortfall, 3)
  })
})
