import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeRemainingPrItems } from '../src/lib/purchasingPricing.js'

describe('1 PR -> Multi-PO Remaining Quantities (src/lib/purchasingPricing.js)', () => {
  it('subtracts quantities already ordered in existing active POs for the same PR', () => {
    const prItems = [
      { id: 'pri-1', item_name: 'Inverter 600w', quantity: 5, unit: 'ชุด', estimated_price: 5400 },
      { id: 'pri-2', item_name: 'ชุดจับยึดแผง', quantity: 10, unit: 'ชุด', estimated_price: 2160 },
      { id: 'pri-3', item_name: 'สายไฟ PV1-F 4 sq.mm', quantity: 100, unit: 'เมตร', estimated_price: 25 },
    ]

    // First PO already ordered all 5 inverters and 4 mounting kits (leaving 6 kits and 100m wire!)
    const existingPoItems = [
      { pr_item_id: 'pri-1', item_name: 'Inverter 600w', quantity: 5 },
      { pr_item_id: null, item_name: 'ชุดจับยึดแผง', quantity: 4 },
    ]

    const result = computeRemainingPrItems(prItems, existingPoItems)

    assert.equal(result.items.length, 2)
    assert.equal(result.fullyOrderedCount, 1)

    assert.equal(result.items[0].item_name, 'ชุดจับยึดแผง')
    assert.equal(result.items[0].quantity, '6')
    assert.equal(result.items[0].pr_item_id, 'pri-2')
    assert.equal(result.items[0].price, '2160')

    assert.equal(result.items[1].item_name, 'สายไฟ PV1-F 4 sq.mm')
    assert.equal(result.items[1].quantity, '100')
    assert.equal(result.items[1].pr_item_id, 'pri-3')
  })

  it('returns empty items with fullyOrderedCount when all PR items have already been ordered', () => {
    const prItems = [
      { id: 'pri-1', item_name: 'Inverter 600w', quantity: 2, unit: 'ชุด', estimated_price: 5400 },
    ]
    const existingPoItems = [
      { pr_item_id: 'pri-1', item_name: 'Inverter 600w', quantity: 2 },
    ]

    const result = computeRemainingPrItems(prItems, existingPoItems)
    assert.equal(result.items.length, 0)
    assert.equal(result.fullyOrderedCount, 1)
  })
})
