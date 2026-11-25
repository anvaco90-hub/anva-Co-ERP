import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateKwLaborCost,
  calculateLaborLineTotal,
  syncLaborItemsWithKwp,
} from '../src/lib/boqLabor.js'

describe('BOQ Labor Cost from kWp (src/lib/boqLabor.js)', () => {
  it('calculates (kw * 1000) * 3 with 2 decimal places', () => {
    assert.equal(calculateKwLaborCost(5), 15000)
    assert.equal(calculateKwLaborCost(10), 30000)
    assert.equal(calculateKwLaborCost(5.5), 16500)
    assert.equal(calculateKwLaborCost('3.3333'), 9999.9)
    assert.equal(calculateKwLaborCost('1.23456'), 3703.68)
  })

  it('returns 0 for empty, null, NaN, or negative kWp', () => {
    assert.equal(calculateKwLaborCost(''), 0)
    assert.equal(calculateKwLaborCost(null), 0)
    assert.equal(calculateKwLaborCost(undefined), 0)
    assert.equal(calculateKwLaborCost(-5), 0)
    assert.equal(calculateKwLaborCost('abc'), 0)
  })

  it('calculateLaborLineTotal supports decimal quantities and 2-decimal rounding', () => {
    assert.equal(calculateLaborLineTotal(1, 16500), 16500)
    assert.equal(calculateLaborLineTotal('1.5', '1000.33'), 1500.5)
    assert.equal(calculateLaborLineTotal('', 500), 0)
  })

  it('syncLaborItemsWithKwp sets quantity=kw*1000 Watt and keeps editable unit rate (default 3)', () => {
    const baseItems = [
      { id: 'labor_1', item_name: 'ค่าแรงติดตั้งระบบ', quantity: '1', unit: 'งาน', labor_unit_cost: '' },
      { id: 'labor_2', item_name: 'ค่าแรงเพิ่มเติม', quantity: '1', unit: 'เหมา', labor_unit_cost: '2000' },
    ]

    const synced = syncLaborItemsWithKwp(baseItems, 100, false)
    assert.equal(synced[0].quantity, '100000')
    assert.equal(synced[0].unit, 'Watt')
    assert.equal(synced[0].labor_unit_cost, '3')
    assert.equal(calculateLaborLineTotal(synced[0].quantity, synced[0].labor_unit_cost), 300000)
    assert.equal(synced[1].labor_unit_cost, '2000')

    // Future labor rate change (e.g. 3 -> 3.50) should be preserved when kWp changes
    const customRateItems = [
      { id: 'labor_1', item_name: 'ค่าแรงติดตั้งระบบ', quantity: '100000', unit: 'Watt', labor_unit_cost: '3.50' },
    ]
    const resynced = syncLaborItemsWithKwp(customRateItems, 30, false)
    assert.equal(resynced[0].quantity, '30000')
    assert.equal(resynced[0].labor_unit_cost, '3.50')
    assert.equal(calculateLaborLineTotal(resynced[0].quantity, resynced[0].labor_unit_cost), 105000)

    const overridden = syncLaborItemsWithKwp(
      [{ id: 'labor_1', item_name: 'ค่าแรงติดตั้งระบบ', quantity: '1', unit: 'งาน', labor_unit_cost: '18000' }],
      10,
      true
    )
    assert.equal(overridden[0].quantity, '1')
    assert.equal(overridden[0].labor_unit_cost, '18000')
  })
})
