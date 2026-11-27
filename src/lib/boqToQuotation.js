import {
  QUOTATION_TYPES,
  applyMarkup,
  calculateDocumentPricing,
  calculateTaxBreakdown,
  generateTypedQuotationNo,
  round2,
} from './tax.js'
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
 * Build quotation line items from BOQ items using shared `applyMarkup()` helper,
 * snapshotting direct unit `base_cost` and item metadata alongside net selling unit prices.
 */
export function buildQuotationItemsFromBoq(boq, boqItems = []) {
  const markupPct = Math.max(0, Number(boq?.markup_percent) || 0)

  return (boqItems || []).map((it) => {
    const numericQty = Number(it?.quantity)
    const qty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 1
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

    const baseCost = round2(rawUnitCost)
    const sellingPricePerUnit = applyMarkup(rawUnitCost, markupPct)
    const total = round2(sellingPricePerUnit * qty)

    return {
      item_id: it?.item_id || null,
      item_code: it?.item_code || null,
      item_name: String(it?.item_name || '').trim() || 'รายการงาน/วัสดุ',
      description: it?.description ? String(it.description).trim() : '',
      quantity: qty,
      unit: it?.unit || 'ชุด',
      base_cost: baseCost,
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
 * Refresh Store `avg_unit_cost` onto draft Product quotation lines ONLY when `status === 'draft'`.
 * Post-draft statuses ('sent', 'approved', etc.) keep frozen snapshots untouched.
 */
export function syncDraftItemsFromStore(items = [], inventoryItems = [], status = 'draft') {
  if (status !== 'draft') {
    return items || []
  }

  const byId = new Map()
  const byName = new Map()
  for (const inv of inventoryItems || []) {
    if (!inv) continue
    if (inv.id && !byId.has(inv.id)) byId.set(inv.id, inv)
    const key = normalizeName(inv.item_name)
    if (key && !byName.has(key)) byName.set(key, inv)
  }

  return (items || []).map((it) => {
    if (!it) return it
    const matchedInv =
      (it.item_id && byId.get(it.item_id)) ||
      byName.get(normalizeName(it.item_name)) ||
      null
    if (!matchedInv) return it

    const nextBaseCost =
      matchedInv.avg_unit_cost != null
        ? String(round2(matchedInv.avg_unit_cost))
        : it.base_cost

    return {
      ...it,
      item_id: it.item_id || matchedInv.id || null,
      item_code: it.item_code || matchedInv.item_code || null,
      unit: it.unit || matchedInv.unit || 'ชิ้น',
      base_cost: nextBaseCost,
    }
  })
}

/**
 * Build a complete Project Quotation header payload + matching items array from a BOQ,
 * using the unified `calculateDocumentPricing` pipeline so header totals reconcile identically.
 */
export function buildQuotationPayloadFromBoq({
  boq,
  boqItems = [],
  matchedCustomer = null,
  taxType = 'vat_excluded',
  quotationNo,
  salesPerson = null,
  salesPersonId = null,
  issueDate = new Date().toISOString().split('T')[0],
  validityDays = 30,
  customerId = null,
}) {
  const effectiveQuotationNo = quotationNo || generateTypedQuotationNo(QUOTATION_TYPES.PROJECT)
  const qItemRows = buildQuotationItemsFromBoq(boq, boqItems)
  const linePricing = calculateDocumentPricing({
    items: qItemRows,
    pricingFromCost: false,
    discountMode: 'none',
    taxType,
    vatRate: 7,
    whtRate: 0,
  })

  const useLineTotal = qItemRows.length > 0 && linePricing.subtotal > 0
  const effectiveSubtotal = useLineTotal
    ? linePricing.subtotal
    : round2(Number(boq?.grand_total || 0))
  const effectiveTotalCost = useLineTotal
    ? linePricing.totalCost
    : round2(Number(boq?.total_cost || 0))

  const taxBreakdown = useLineTotal
    ? linePricing
    : calculateTaxBreakdown({
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
    quotation_no: effectiveQuotationNo,
    type: QUOTATION_TYPES.PROJECT,
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
    markup_percent: Math.max(0, Number(boq?.markup_percent) || 0),
    discount_mode: 'none',
    header_discount_type: 'amount',
    header_discount_value: 0,
    total_cost: effectiveTotalCost,
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
    created_by: salesPersonId || null,
    issued_by: null,
    issued_by_name: null,
    issued_at: null,
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
 * Build status update payload for Quotation status transitions, stamping issuer identity & timestamp
 * cleanly when transitioning out of `draft` into `'sent'` or `'approved'`.
 */
export function buildQuotationStatusTransitionPayload({
  quotation = {},
  nextStatus,
  actor = null,
  nowIso = new Date().toISOString(),
}) {
  const payload = {
    status: nextStatus,
    updated_at: nowIso,
  }

  const isIssuingNow =
    quotation?.status === 'draft' && ['sent', 'approved'].includes(nextStatus)
  const needsBackfillIssuer =
    ['sent', 'approved'].includes(nextStatus) &&
    !quotation?.issued_by &&
    !quotation?.issued_by_name

  if (isIssuingNow || needsBackfillIssuer) {
    payload.issued_by = actor?.id || null
    payload.issued_by_name = actor?.full_name || quotation?.sales_person || null
    payload.issued_at = nowIso
  }

  return payload
}

/**
 * Self-healing insert/update on `quotations` table that automatically strips missing optional columns
 * so saves remain resilient prior to SQL migrations and preserve typed prefixes on duplicate numbers.
 */
export async function saveQuotationWithFallback(client, payload, editId = null) {
  let activePayload = { ...payload }
  let lastError = null

  for (let attempt = 0; attempt < 25; attempt++) {
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
      lastError = dbErr
      const errMsg = dbErr?.message || ''

      if (!editId && (errMsg.includes('duplicate key') || errMsg.includes('quotation_no_key'))) {
        const inferredType =
          activePayload.type ||
          (String(activePayload.quotation_no || '').toUpperCase().startsWith('QT-S')
            ? QUOTATION_TYPES.PRODUCT
            : QUOTATION_TYPES.PROJECT)
        const rand5 = String(Math.floor(10000 + Math.random() * 90000))
        activePayload.quotation_no = generateTypedQuotationNo(inferredType, new Date(), rand5)
        continue
      }

      if (errMsg.includes('boq_id') && 'boq_id' in activePayload) {
        delete activePayload.boq_id
        continue
      }
      if (errMsg.includes('issued_by') && 'issued_by' in activePayload) {
        delete activePayload.issued_by
        continue
      }
      if (
        (errMsg.includes('customer_id') || (errMsg.includes('foreign key') && errMsg.includes('customer'))) &&
        'customer_id' in activePayload
      ) {
        delete activePayload.customer_id
        continue
      }
      if (
        (errMsg.includes('project_id') || (errMsg.includes('foreign key') && errMsg.includes('project'))) &&
        'project_id' in activePayload
      ) {
        delete activePayload.project_id
        continue
      }
      if (errMsg.includes('created_by') && 'created_by' in activePayload) {
        delete activePayload.created_by
        continue
      }

      const colMatch =
        errMsg.match(/column "(.*?)" of relation "quotations" does not exist/) ||
        errMsg.match(/Could not find the '(.*?)' column of 'quotations'/)
      if (colMatch && colMatch[1] && colMatch[1] in activePayload) {
        delete activePayload[colMatch[1]]
        continue
      }

      throw dbErr
    }
  }

  throw lastError || new Error('Failed to save quotation after fallback retries')
}

/**
 * Schema-safe bulk insert into `quotation_items` stripping unmigrated columns (`base_cost`, `item_code`)
 * if migration 046 has not yet run in Supabase.
 */
export async function saveQuotationItemsWithFallback(client, itemRows = []) {
  if (!Array.isArray(itemRows) || itemRows.length === 0) {
    return { error: null }
  }

  let activeRows = itemRows.map((row) => ({ ...row }))
  let lastError = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await client.from('quotation_items').insert(activeRows)
    const err = res?.error
    if (!err) return { error: null }
    lastError = err

    const errMsg = err?.message || ''
    const colMatch =
      errMsg.match(/column "(.*?)" of relation "quotation_items" does not exist/) ||
      errMsg.match(/Could not find the '(.*?)' column of 'quotation_items'/)

    if (colMatch && colMatch[1] && colMatch[1] in activeRows[0]) {
      const missingCol = colMatch[1]
      activeRows = activeRows.map((row) => {
        const next = { ...row }
        delete next[missingCol]
        return next
      })
      continue
    }

    if (errMsg.includes('item_id') && errMsg.includes('foreign key') && activeRows.some((r) => r.item_id != null)) {
      activeRows = activeRows.map((row) => ({ ...row, item_id: null }))
      continue
    }

    return { error: err }
  }

  return { error: lastError || new Error('Failed to save quotation items after retries') }
}
