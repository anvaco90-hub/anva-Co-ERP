import { calculateTaxBreakdown, inferQuotationTaxType, round2 } from './tax.js'
import { isCancelledStatus } from './projectFinancials.js'

function isPoReceivedStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return s === 'received' || s === 'รับของครบ'
}

function isPoPartialStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return s === 'partial' || s === 'รับของบางส่วน'
}

/**
 * Build a balanced `sales_invoices` insert payload from a `quotations` row.
 * Uses pre-VAT tax base for `subtotal` so PostgreSQL trigger `on_sales_invoice_status_change()`
 * posts balanced GL entries (Dr. 1130-01 Total / Cr. 4110-01 Revenue + Cr. 2130-01 Output VAT)
 * and inserts `OUTPUT_VAT` into `tax_records` across all 3 VAT modes.
 */
export function buildSalesInvoicePayload({
  quotation,
  customerId = null,
  contactId = null,
  invoiceNo,
  issueDate = new Date().toISOString().split('T')[0],
  dueDays = 30,
  customerPoNo = '',
}) {
  const qtTaxType = inferQuotationTaxType(quotation || {})
  const vatRateVal = qtTaxType === 'vat_exempt' ? 0 : Number(quotation?.vat_rate ?? 7)
  const whtRateVal = Number(quotation?.wht_rate || 0)

  const fallbackAfterDisc = Math.max(
    0,
    Number(quotation?.subtotal || 0) - Number(quotation?.discount_amount || 0)
  )
  const rawAfterDisc =
    quotation?.after_discount != null && Number(quotation.after_discount) > 0
      ? Number(quotation.after_discount)
      : fallbackAfterDisc > 0
      ? fallbackAfterDisc
      : Number(quotation?.grand_total || quotation?.total_amount || 0)

  const breakdown = calculateTaxBreakdown({
    rawTotal: rawAfterDisc,
    taxType: qtTaxType,
    whtRate: whtRateVal,
    vatRate: vatRateVal,
  })

  const issue = issueDate || new Date().toISOString().split('T')[0]
  const dueObj = new Date(issue)
  if (!isNaN(dueObj.getTime())) {
    dueObj.setDate(dueObj.getDate() + Math.max(0, parseInt(dueDays, 10) || 0))
  }
  const dueDate = !isNaN(dueObj.getTime()) ? dueObj.toISOString().split('T')[0] : issue

  const effectiveTotal = round2(breakdown.totalWithVat)
  const poTag = (customerPoNo || quotation?.customer_po_no || '').trim()

  return {
    invoice_no: invoiceNo,
    quotation_id: quotation?.id || null,
    customer_id: customerId || quotation?.customer_id || null,
    contact_id: contactId || null,
    project_id: quotation?.project_id || null,
    issue_date: issue,
    due_date: dueDate,
    subtotal: round2(breakdown.amountBeforeVat),
    discount_amount: round2(Number(quotation?.discount_amount || 0)),
    vat_rate: vatRateVal,
    vat_amount: round2(breakdown.vatAmount),
    wht_rate: whtRateVal,
    wht_amount: round2(breakdown.whtAmount),
    total_amount: effectiveTotal,
    paid_amount: 0,
    remaining_amount: effectiveTotal,
    is_opening_balance: false,
    status: 'รอเก็บเงิน',
    notes: `ออกใบแจ้งหนี้อ้างอิง ${quotation?.quotation_no || ''}${poTag ? ` (PO ลูกค้า: ${poTag})` : ''}`.trim(),
  }
}

/**
 * Compute live Step 4 (Purchasing / Store) & Step 5 (Delivery / Billing AR) status
 * for `QuotationDetail` from linked PRs, POs, and Sales Invoices.
 */
export function computeQuotationWorkflow({
  quotation,
  prs = [],
  pos = [],
  invoices = [],
}) {
  const isApproved = Boolean(quotation?.customer_po_no || quotation?.status === 'approved' || quotation?.status === 'partial')
  const activePRs = (prs || []).filter((pr) => pr && !isCancelledStatus(pr.status))
  const activePOs = (pos || []).filter((po) => po && !isCancelledStatus(po.status))
  const activeInvoices = (invoices || []).filter((inv) => inv && !isCancelledStatus(inv.status))

  const receivedPoCount = activePOs.filter((po) => isPoReceivedStatus(po.status)).length
  const partialPoCount = activePOs.filter((po) => isPoPartialStatus(po.status)).length

  // Step 4: Purchasing & Store
  let step4State = 'pending'
  let step4Badge = 'ขั้นตอนถัดไป'
  let step4Detail = 'เปิด PR หรือออก PO สั่งแผง / อินเวอร์เตอร์ / อุปกรณ์'

  if (activePOs.length > 0) {
    if (receivedPoCount === activePOs.length) {
      step4State = 'done'
      step4Badge = `รับของครบ (${receivedPoCount} PO)`
      step4Detail = `ออก PO ${activePOs.length} ใบ และตรวจรับเข้าคลัง/หน้างานครบแล้ว`
    } else if (receivedPoCount > 0 || partialPoCount > 0) {
      step4State = 'in_progress'
      step4Badge = `รับแล้ว ${receivedPoCount}/${activePOs.length} PO`
      step4Detail = `มี PR ${activePRs.length} ใบ · ออก PO ${activePOs.length} ใบ`
    } else {
      step4State = 'in_progress'
      step4Badge = `ออก PO แล้ว (${activePOs.length})`
      step4Detail = `เปิด PO ${activePOs.length} ใบแล้ว รอตรวจรับของเข้าสโตร์`
    }
  } else if (activePRs.length > 0) {
    step4State = 'in_progress'
    step4Badge = `มี PR แล้ว (${activePRs.length})`
    step4Detail = `เปิด PR ${activePRs.length} ใบแล้ว รอออกใบสั่งซื้อ (PO)`
  } else if (isApproved) {
    step4State = 'ready'
    step4Badge = 'พร้อมจัดซื้อ'
    step4Detail = 'ลูกค้าอนุมัติแล้ว กดเปิด PR หรือออก PO สั่งอุปกรณ์ได้ทันที'
  }

  // Step 5: Delivery, AR Invoice & Collection
  const totalBilled = round2(
    activeInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0)
  )
  const totalPaid = round2(
    activeInvoices.reduce((s, inv) => {
      if (inv.paid_amount != null) return s + Number(inv.paid_amount || 0)
      return s + Math.max(0, Number(inv.total_amount || 0) - Number(inv.remaining_amount || 0))
    }, 0)
  )
  const totalRemaining = round2(
    activeInvoices.reduce((s, inv) => {
      if (inv.remaining_amount != null) return s + Number(inv.remaining_amount || 0)
      return s + Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0))
    }, 0)
  )
  const latestInvoice = activeInvoices[0] || null

  let step5State = 'pending'
  let step5Badge = 'ปลายทางโครงการ'
  let step5Detail = 'ส่งมอบงาน และออกใบแจ้งหนี้ตั้งลูกหนี้ (AR)'

  if (activeInvoices.length > 0) {
    if (totalRemaining <= 0.05 && totalBilled > 0) {
      step5State = 'done'
      step5Badge = 'เก็บเงินครบแล้ว'
      step5Detail = `${latestInvoice.invoice_no} · รับครบ ${totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`
    } else if (totalPaid > 0) {
      step5State = 'partial'
      step5Badge = 'รับชำระบางส่วน'
      step5Detail = `${latestInvoice.invoice_no} · ค้างรับ ${totalRemaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`
    } else {
      step5State = 'billed'
      step5Badge = 'วางบิลรอเก็บเงิน'
      step5Detail = `${latestInvoice.invoice_no} · ตั้งลูกหนี้ ${totalBilled.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`
    }
  } else if (step4State === 'done' || isApproved) {
    step5State = 'ready'
    step5Badge = 'พร้อมวางบิล AR'
    step5Detail =
      step4State === 'done'
        ? 'รับอุปกรณ์ครบแล้ว พร้อมส่งมอบและออกใบแจ้งหนี้ AR'
        : 'ลูกค้าอนุมัติ PO แล้ว สามารถออกใบแจ้งหนี้ตั้งลูกหนี้ AR ได้'
  }

  return {
    isApproved,
    activePRs,
    activePOs,
    activeInvoices,
    latestPR: activePRs[0] || null,
    latestPO: activePOs[0] || null,
    latestInvoice,
    receivedPoCount,
    totalBilled,
    totalPaid,
    totalRemaining,
    step4State,
    step4Badge,
    step4Detail,
    step5State,
    step5Badge,
    step5Detail,
  }
}
