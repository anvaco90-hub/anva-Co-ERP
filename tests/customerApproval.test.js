import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCustomerApprovalRef,
  getCustomerApprovalDisplay,
  buildSalesInvoicePayload,
} from '../src/lib/salesFlowUtils.js'

describe('Customer Quotation Approval Helpers (src/lib/salesFlowUtils.js)', () => {
  it('resolves direct QT number when signed_qt mode is chosen, or custom PO when customer_po mode is chosen', () => {
    assert.equal(
      resolveCustomerApprovalRef({
        mode: 'signed_qt',
        quotationNo: 'QT-202611-9828',
        customPoNo: 'PO-999',
      }),
      'QT-202611-9828'
    )

    assert.equal(
      resolveCustomerApprovalRef({
        mode: 'customer_po',
        quotationNo: 'QT-202611-9828',
        customPoNo: '  PO-CUST-2026-089  ',
      }),
      'PO-CUST-2026-089'
    )
  })

  it('distinguishes direct signed QT approval from separate external customer PO', () => {
    const direct = getCustomerApprovalDisplay({
      quotation_no: 'QT-202611-9828',
      customer_po_no: 'qt-202611-9828',
      status: 'approved',
    })
    assert.equal(direct.isApproved, true)
    assert.equal(direct.mode, 'signed_qt')
    assert.equal(direct.isDirectQt, true)
    assert.equal(direct.refNo, 'qt-202611-9828')
    assert.match(direct.badgeLabel, /QT/i)
    assert.match(direct.shortLabel, /อ้างอิง QT|ใบเสนอราคา/)
    assert.doesNotMatch(direct.shortLabel, /^PO:/)

    const extPo = getCustomerApprovalDisplay({
      quotation_no: 'QT-202611-9828',
      customer_po_no: 'PO-CUST-001',
      status: 'approved',
    })
    assert.equal(extPo.isApproved, true)
    assert.equal(extPo.mode, 'customer_po')
    assert.equal(extPo.isDirectQt, false)
    assert.equal(extPo.refNo, 'PO-CUST-001')
    assert.match(extPo.shortLabel, /PO ลูกค้า: PO-CUST-001|PO: PO-CUST-001/)

    const unapproved = getCustomerApprovalDisplay({
      quotation_no: 'QT-202611-9828',
      customer_po_no: null,
      status: 'sent',
    })
    assert.equal(unapproved.isApproved, false)
    assert.equal(unapproved.refNo, '')
  })

  it('formats buildSalesInvoicePayload notes cleanly when approved directly by quotation number', () => {
    const invDirect = buildSalesInvoicePayload({
      quotation: {
        id: 'q1',
        quotation_no: 'QT-202611-9828',
        after_discount: 10000,
        tax_type: 'vat_excluded',
      },
      invoiceNo: 'INV2026110001',
      customerPoNo: 'QT-202611-9828',
    })
    assert.doesNotMatch(invDirect.notes, /PO ลูกค้า: QT-202611-9828/)
    assert.match(invDirect.notes, /QT-202611-9828/)

    const invPo = buildSalesInvoicePayload({
      quotation: {
        id: 'q1',
        quotation_no: 'QT-202611-9828',
        after_discount: 10000,
        tax_type: 'vat_excluded',
      },
      invoiceNo: 'INV2026110002',
      customerPoNo: 'PO-CUST-009',
    })
    assert.match(invPo.notes, /PO ลูกค้า: PO-CUST-009/)
  })
})
