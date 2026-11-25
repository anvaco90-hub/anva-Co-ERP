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
  const approvalNoteTag = poTag
    ? isQuotationDirectApproval(poTag, quotation?.quotation_no)
      ? ' (ลูกค้าเซ็นอนุมัติตามใบเสนอราคา)'
      : ` (PO ลูกค้า: ${poTag})`
    : ''

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
    notes: `ออกใบแจ้งหนี้อ้างอิง ${quotation?.quotation_no || ''}${approvalNoteTag}`.trim(),
  }
}

export function isQuotationDirectApproval(refNo, quotationNo) {
  const a = String(refNo || '').trim().toLowerCase()
  const b = String(quotationNo || '').trim().toLowerCase()
  return Boolean(a && b && a === b)
}

export function resolveCustomerApprovalRef({
  mode = 'signed_qt',
  quotationNo = '',
  customPoNo = '',
} = {}) {
  const qtNo = String(quotationNo || '').trim()
  const extNo = String(customPoNo || '').trim()
  return mode === 'customer_po' ? extNo : qtNo
}

export function getCustomerApprovalDisplay(quotation = {}) {
  const qtNo = String(quotation?.quotation_no || '').trim()
  const refNo = String(quotation?.customer_po_no || '').trim()
  const isApproved = Boolean(
    refNo || quotation?.status === 'approved' || quotation?.status === 'partial'
  )

  if (!isApproved) {
    return {
      isApproved: false,
      mode: 'signed_qt',
      isDirectQt: false,
      refNo: '',
      badgeLabel: 'PENDING APPROVAL',
      shortLabel: '',
      docTitle: '',
      statusShort: 'รอลูกค้าอนุมัติ',
    }
  }

  const isDirectQt = !refNo || isQuotationDirectApproval(refNo, qtNo)
  const effectiveRef = refNo || qtNo

  if (isDirectQt) {
    return {
      isApproved: true,
      mode: 'signed_qt',
      isDirectQt: true,
      refNo: effectiveRef,
      badgeLabel: 'CUSTOMER QT APPROVED',
      shortLabel: `อ้างอิง QT: ${effectiveRef}`,
      docTitle: 'เอกสารยืนยันการอนุมัติใบเสนอราคา',
      statusShort: 'อนุมัติแล้ว',
    }
  }

  return {
    isApproved: true,
    mode: 'customer_po',
    isDirectQt: false,
    refNo: effectiveRef,
    badgeLabel: 'CUSTOMER PO VERIFIED',
    shortLabel: `PO ลูกค้า: ${effectiveRef}`,
    docTitle: 'ใบสั่งซื้อจากลูกค้า (Customer Purchase Order)',
    statusShort: 'รับ PO แล้ว',
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
  stockSummary = null,
  issues = [],
}) {
  const isApproved = Boolean(quotation?.customer_po_no || quotation?.status === 'approved' || quotation?.status === 'partial')
  const activePRs = (prs || []).filter((pr) => pr && !isCancelledStatus(pr.status))
  const activePOs = (pos || []).filter((po) => po && !isCancelledStatus(po.status))
  const activeInvoices = (invoices || []).filter((inv) => inv && !isCancelledStatus(inv.status))
  const activeIssues = (issues || []).filter((iss) => iss && !isCancelledStatus(iss.status))

  const receivedPoCount = activePOs.filter((po) => isPoReceivedStatus(po.status)).length
  const partialPoCount = activePOs.filter((po) => isPoPartialStatus(po.status)).length
  const poAllReceived = activePOs.length > 0 && receivedPoCount === activePOs.length

  const hasStockSummary = Boolean(stockSummary && typeof stockSummary.totalChecked === 'number')
  const shortageCount = hasStockSummary ? Number(stockSummary.shortageCount || 0) : 0
  const issuableCount = hasStockSummary ? Number(stockSummary.issuableCount || 0) : 0
  const totalChecked = hasStockSummary ? Number(stockSummary.totalChecked || 0) : 0
  const hasActiveIssue = activeIssues.length > 0

  // Step 4: Purchasing & Store
  let step4State = 'pending'
  let step4Badge = 'ขั้นตอนถัดไป'
  let step4Detail = 'เปิด PR หรือออก PO สั่งแผง / อินเวอร์เตอร์ / อุปกรณ์'

  if (activePOs.length > 0) {
    if (poAllReceived) {
      if (hasStockSummary && issuableCount > 0 && !hasActiveIssue) {
        step4State = 'in_progress'
        step4Badge = 'รับ PO ครบ (รอเบิกสโตร์)'
        step4Detail = `รับของจาก PO ${receivedPoCount} ใบครบแล้ว · เหลือเปิดใบเบิกของในสโตร์ ${issuableCount} รายการ`
      } else {
        step4State = 'done'
        step4Badge = hasActiveIssue
          ? `ครบแล้ว (${receivedPoCount} PO · เบิก ${activeIssues.length})`
          : `รับของครบ (${receivedPoCount} PO)`
        step4Detail = hasActiveIssue
          ? `ออก PO ${activePOs.length} ใบ ตรวจรับครบ + เบิกสโตร์แล้ว ${activeIssues.length} ใบ`
          : `ออก PO ${activePOs.length} ใบ และตรวจรับเข้าคลัง/หน้างานครบแล้ว`
      }
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
  } else if (hasActiveIssue) {
    if (hasStockSummary && shortageCount > 0) {
      step4State = 'in_progress'
      step4Badge = `เบิกแล้ว (${activeIssues.length}) · ขาด ${shortageCount}`
      step4Detail = `เบิกจากสโตร์แล้ว ${activeIssues.length} ใบ · ยังขาดต้องเปิด PR/PO ${shortageCount} รายการ`
    } else {
      step4State = 'done'
      step4Badge = `เบิกสโตร์ครบ (${activeIssues.length} ใบ)`
      step4Detail = `เบิกจ่ายวัสดุจากคลังแล้ว ${activeIssues.length} ใบ`
    }
  } else if (!isApproved) {
    step4State = 'pending'
    step4Badge = 'รออนุมัติ QT'
    step4Detail =
      hasStockSummary && shortageCount > 0
        ? `มีรายการขาดสต็อก ${shortageCount} รายการ (รอลูกค้าอนุมัติก่อนเปิด PR)`
        : 'รอลูกค้าอนุมัติใบเสนอราคาก่อนส่งต่อจัดซื้อ / เบิกสโตร์'
  } else if (hasStockSummary) {
    if (totalChecked === 0) {
      step4State = 'done'
      step4Badge = 'ไม่มีรายการวัสดุ'
      step4Detail = 'รายการงานบริการ/ค่าแรงทั้งหมด ไม่ต้องเปิด PR หรือเบิกสโตร์'
    } else if (shortageCount > 0) {
      step4State = 'ready'
      step4Badge = `รอเปิด PR (${shortageCount} รายการขาด)`
      step4Detail =
        issuableCount > 0
          ? `ต้องเปิด PR สั่งซื้อ ${shortageCount} รายการ และเบิกจากสโตร์ ${issuableCount} รายการ`
          : `มีสินค้าขาดสต็อก ${shortageCount} รายการ กดเปิด PR หรือออก PO ได้ทันที`
    } else {
      step4State = 'ready'
      step4Badge = `รอเบิกสโตร์ (${issuableCount} รายการ)`
      step4Detail = `สินค้าครบในสโตร์ ${issuableCount} รายการ รอเปิดใบเบิกสต็อก`
    }
  } else {
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
    activeIssues,
    latestPR: activePRs[0] || null,
    latestPO: activePOs[0] || null,
    latestInvoice,
    latestIssue: activeIssues[0] || null,
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

/**
 * Build schema-safe PostgREST select/filter specs for loading `purchase_orders` linked strictly to a quotation
 * (by QT ID, sales_quotation_no, `[QT ขาย: ...]` notes, or PRs already matched to this quotation).
 * Never matches by `project_id` or vendor `quotation_no` so sibling quotations in the same project never leak POs.
 */
export function buildQuotationPoQuerySpecs(quotation, matchedPrIds = []) {
  const qId = quotation?.id || null
  const qNo = String(quotation?.quotation_no || '').trim()
  const uniquePrIds = [...new Set((matchedPrIds || []).filter(Boolean))]

  const primaryOrParts = []
  if (qId) primaryOrParts.push(`quotation_id.eq.${qId}`)
  if (qNo) {
    primaryOrParts.push(`sales_quotation_no.eq.${qNo}`)
    primaryOrParts.push(`notes.ilike.%${qNo}%`)
  }
  for (const prId of uniquePrIds) {
    primaryOrParts.push(`pr_id.eq.${prId}`)
  }

  const fallbackOrParts = []
  if (qNo) fallbackOrParts.push(`notes.ilike.%${qNo}%`)
  for (const prId of uniquePrIds) {
    fallbackOrParts.push(`pr_id.eq.${prId}`)
  }

  return {
    primarySelect:
      'id, po_no, pr_id, status, order_date, total_amount, grand_total, quotation_no, project_id, quotation_id, sales_quotation_no, notes',
    primaryOr: primaryOrParts.join(','),
    fallbackSelect: 'id, po_no, pr_id, status, order_date, total_amount, grand_total, quotation_no, project_id, notes',
    fallbackOr: fallbackOrParts.join(','),
  }
}

/**
 * Build schema-safe PostgREST select/filter specs for loading `purchase_requisitions` linked strictly to a quotation.
 */
export function buildQuotationPrQuerySpecs(quotation) {
  const qId = quotation?.id || null
  const qNo = String(quotation?.quotation_no || '').trim()

  const primaryOrParts = []
  if (qId) primaryOrParts.push(`quotation_id.eq.${qId}`)
  if (qNo) {
    primaryOrParts.push(`sales_quotation_no.eq.${qNo}`)
    primaryOrParts.push(`notes.ilike.%${qNo}%`)
  }

  const fallbackOrParts = []
  if (qNo) fallbackOrParts.push(`notes.ilike.%${qNo}%`)

  return {
    primarySelect: 'id, pr_no, status, request_date, notes, project_id, quotation_id, sales_quotation_no',
    primaryOr: primaryOrParts.join(','),
    fallbackSelect: 'id, pr_no, status, request_date, notes, project_id',
    fallbackOr: fallbackOrParts.join(','),
  }
}

/**
 * Build schema-safe PostgREST select/filter specs for loading `stock_issues` linked to a quotation by `quotation_no` in notes.
 */
export function buildQuotationIssueQuerySpecs(quotation) {
  const qNo = String(quotation?.quotation_no || '').trim()
  return {
    select: 'id, issue_no, issue_date, project_id, notes, created_at',
    orFilter: qNo ? `notes.ilike.%${qNo}%` : '',
  }
}

/**
 * Extract the source Sales Quotation ID and QT number from a Purchase Requisition row (columns or notes).
 */
export function extractPrSourceQuotation(pr) {
  if (!pr) return { quotationId: null, quotationNo: null }
  const quotationId = pr.quotation_id || null
  let quotationNo = pr.sales_quotation_no ? String(pr.sales_quotation_no).trim() : null
  if (!quotationNo && pr.notes) {
    const match = String(pr.notes).match(/QT-[A-Za-z0-9-]+/i)
    if (match) quotationNo = match[0]
  }
  return { quotationId, quotationNo: quotationNo || null }
}
