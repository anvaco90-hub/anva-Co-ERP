import { calculateTaxBreakdown, round2 } from './tax.js'
import { normalizeName } from './contactsUtils.js'

/**
 * Find the best matching unified customer record for a BOQ (by `boq.customer_name` or `boq.projects?.client_name`).
 */
export function matchBoqCustomer(boq, unifiedCustomers = []) {
  const targetName = normalizeName(
    boq?.customer_name || boq?.projects?.client_name || ''
  )
  if (!targetName || !Array.isArray(unifiedCustomers)) return null
  return (
    unifiedCustomers.find(
      (c) => normalizeName(c?.customer_name || c?.name) === targetName
    ) || null
  )
}

/**
 * Build quotation line items from BOQ items, applying BOQ markup percentage
 * and falling back safely to aggregate item totals when unit costs are 0.
 */
export function buildQuotationItemsFromBoq(boq, boqItems = []) {
  const markupRatio = 1 + (Number(boq?.markup_percent) || 0) / 100

  return (boqItems || []).map((it) => {
    const qty = Math.max(1, parseInt(it?.quantity, 10) || 1)
    let rawUnitCost =
      Number(it?.material_unit_cost || 0) + Number(it?.labor_unit_cost || 0)

    if (rawUnitCost <= 0) {
      const lineBaseCost =
        Number(it?.total_material_cost || 0) + Number(it?.total_labor_cost || 0) ||
        Number(it?.total_amount || 0)
      if (lineBaseCost > 0) {
        rawUnitCost = lineBaseCost / qty
      }
    }

    const sellingPricePerUnit = round2(rawUnitCost * markupRatio)
    const total = round2(sellingPricePerUnit * qty)

    return {
      item_name: String(it?.item_name || '').trim() || 'รายการงาน/วัสดุ',
      description: it?.description ? String(it.description).trim() : '',
      quantity: qty,
      unit: it?.unit || 'ชุด',
      unit_price: sellingPricePerUnit,
      discount_percent: 0,
      total_amount: total,
    }
  })
}

/**
 * Format branch label from customer record.
 */
export function formatCustomerBranchLabel(customer) {
  if (!customer) return 'สำนักงานใหญ่'
  if (customer.branch_type === 'branch' && customer.branch_no && customer.branch_no !== '00000') {
    return `สาขาที่ ${customer.branch_no}`
  }
  return 'สำนักงานใหญ่'
}

/**
 * Build a complete Quotation header payload + matching items array from a BOQ,
 * guaranteeing header totals reconcile cleanly with line items and chosen `taxType`.
 */
export function buildQuotationPayloadFromBoq({
  boq,
  boqItems = [],
  matchedCustomer = null,
  taxType = 'vat_excluded',
  quotationNo,
  salesPerson = null,
  issueDate = new Date().toISOString().split('T')[0],
  validityDays = 30,
  customerId = null,
}) {
  const qItemRows = buildQuotationItemsFromBoq(boq, boqItems)
  const itemsSubtotal = round2(
    qItemRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  )
  const effectiveSubtotal =
    qItemRows.length > 0 && itemsSubtotal > 0
      ? itemsSubtotal
      : round2(Number(boq?.grand_total || 0))

  const taxBreakdown = calculateTaxBreakdown({
    rawTotal: effectiveSubtotal,
    taxType,
    whtRate: 0,
    vatRate: 7,
  })

  const issue = issueDate || new Date().toISOString().split('T')[0]
  const expDateObj = new Date(issue)
  if (!isNaN(expDateObj.getTime())) {
    expDateObj.setDate(expDateObj.getDate() + (parseInt(validityDays, 10) || 30))
  }
  const expiryDate = !isNaN(expDateObj.getTime())
    ? expDateObj.toISOString().split('T')[0]
    : null

  const fallbackCustName =
    boq?.customer_name ||
    boq?.projects?.client_name ||
    (boq?.projects?.project_code ? `ลูกค้าโครงการ ${boq.projects.project_code}` : 'ลูกค้าทั่วไป')

  const noteText =
    boq?.notes?.trim() ||
    `อ้างอิงเอกสารถอดแบบและประมาณราคาเลขที่ ${boq?.boq_no || ''}`.trim()

  const payload = {
    quotation_no: quotationNo,
    issue_date: issue,
    quotation_date: issue,
    validity_days: parseInt(validityDays, 10) || 30,
    expiry_date: expiryDate,
    valid_until: expiryDate,
    sales_person: salesPerson || null,
    currency: 'THB',
    customer_id: customerId || matchedCustomer?.legacyCustomerId || null,
    customer_name: matchedCustomer?.customer_name || fallbackCustName,
    customer_address: matchedCustomer?.address || null,
    customer_postal_code: matchedCustomer?.postal_code || null,
    customer_tax_id: matchedCustomer?.tax_id || null,
    customer_branch: formatCustomerBranchLabel(matchedCustomer),
    project_id: boq?.project_id || null,
    boq_id: boq?.id || null,
    ref_no: boq?.boq_no || null,
    warehouse_name: 'สโตร์หลัก',
    subtotal: effectiveSubtotal,
    discount_amount: 0,
    after_discount: effectiveSubtotal,
    tax_type: taxType,
    vat_rate: taxType === 'vat_exempt' ? 0 : 7,
    vat_amount: taxBreakdown.vatAmount,
    wht_rate: 0,
    wht_amount: 0,
    grand_total: taxBreakdown.netPayable,
    total_amount: taxBreakdown.netPayable,
    customer_notes: noteText,
    notes: noteText,
    status: 'draft',
    updated_at: new Date().toISOString(),
  }

  return {
    payload,
    itemRows: qItemRows,
    taxBreakdown,
  }
}

/**
 * Self-healing insert/update on `quotations` table that automatically strips missing optional columns
 * (such as `tax_type` or `boq_id` prior to running migration 040) so conversion never fails.
 */
export async function saveQuotationWithFallback(client, payload, editId = null) {
  let activePayload = { ...payload }
  let savedId = editId || null

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (editId) {
        const { error: updErr } = await client
          .from('quotations')
          .update(activePayload)
          .eq('id', editId)
        if (updErr) throw updErr
        return { id: editId, quotation_no: activePayload.quotation_no }
      }

      const { data: insData, error: insErr } = await client
        .from('quotations')
        .insert([activePayload])
        .select('id, quotation_no')
        .single()
      if (insErr) throw insErr
      return insData
    } catch (dbErr) {
      const errMsg = dbErr?.message || ''

      if (!editId && (errMsg.includes('duplicate key') || errMsg.includes('quotation_no_key'))) {
        const ym = new Date().toISOString().slice(0, 7).replace('-', '')
        const rand = String(Math.floor(10000 + Math.random() * 90000))
        activePayload.quotation_no = `QT${ym}${rand}`
        continue
      }

      if (errMsg.includes('boq_id')) {
        delete activePayload.boq_id
        continue
      }
      if (errMsg.includes('customer_id') || (errMsg.includes('foreign key') && errMsg.includes('customer'))) {
        delete activePayload.customer_id
        continue
      }
      if (errMsg.includes('project_id') || (errMsg.includes('foreign key') && errMsg.includes('project'))) {
        delete activePayload.project_id
        continue
      }
      if (errMsg.includes('created_by')) {
        delete activePayload.created_by
        continue
      }

      const colMatch =
        errMsg.match(/column "(.*?)" of relation "quotations" does not exist/) ||
        errMsg.match(/Could not find the '(.*?)' column of 'quotations'/)
      if (colMatch && colMatch[1]) {
        delete activePayload[colMatch[1]]
        continue
      }

      throw dbErr
    }
  }

  return { id: savedId, quotation_no: activePayload.quotation_no }
}
