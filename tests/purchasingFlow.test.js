import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeProcurementFlow } from '../src/lib/purchasingFlow.js'

describe('Purchasing 4-Step Workflow without Accounting PAY Execution (src/lib/purchasingFlow.js)', () => {
  it('completes PO workflow cleanly upon full goods receipt (Step 4) without waiting for accounting payment', () => {
    const flow = computeProcurementFlow({
      mode: 'po',
      po: { id: 'po-1', po_no: 'PO2026-0010', status: 'received', payment_status: 'รอชำระเงิน' },
      items: [{ id: 'poi-1', quantity: 5, qty_received: 5 }],
    })

    assert.equal(flow.isComplete, true)
    assert.equal(flow.currentStep, 4)
    assert.equal(flow.stepStates.s1, 'done')
    assert.equal(flow.stepStates.s2, 'done')
    assert.equal(flow.stepStates.s3, 'done')
    assert.equal(flow.stepStates.s4, 'done')
    assert.doesNotMatch(flow.currentStepLabel, /จ่ายเงิน|PAY/i)
  })

  it('tracks open, partial, and multi-PO PR lifecycle across 4 purchasing steps cleanly', () => {
    const partialPoFlow = computeProcurementFlow({
      mode: 'po',
      po: { id: 'po-2', po_no: 'PO2026-0011', status: 'partial' },
      items: [{ id: 'poi-1', quantity: 10, qty_received: 4 }],
    })
    assert.equal(partialPoFlow.isComplete, false)
    assert.equal(partialPoFlow.currentStep, 3)
    assert.equal(partialPoFlow.stepStates.s3, 'active')
    assert.equal(partialPoFlow.stepStates.s4, 'pending')

    const prFlowComplete = computeProcurementFlow({
      mode: 'pr',
      pr: { id: 'pr-1', pr_no: 'PR2026-0008', status: 'ordered' },
      linkedPos: [
        { id: 'po-a', status: 'received', purchase_order_items: [{ quantity: 2, qty_received: 2 }] },
        { id: 'po-b', status: 'received', purchase_order_items: [{ quantity: 3, qty_received: 3 }] },
      ],
    })
    assert.equal(prFlowComplete.isComplete, true)
    assert.equal(prFlowComplete.stepStates.s4, 'done')
  })
})
