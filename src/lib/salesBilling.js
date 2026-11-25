import { supabase as defaultSupabase } from './supabase'
import {
  fetchUnifiedCustomers,
  ensureLegacyCustomerId,
  ensureContactIdForEntity,
} from './contactsSync'
import { normalizeName, normalizeTaxId } from './contactsUtils'
import { isCancelledStatus } from './projectFinancials'
import { buildSalesInvoicePayload } from './salesFlowUtils'

function generateInvoiceNo(issueDate) {
  const ym = String(issueDate || new Date().toISOString().split('T')[0])
    .replace(/-/g, '')
    .slice(0, 6)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `INV${ym}${rand}`
}

/**
 * Find an existing active `sales_invoices` row for a quotation, or create a new one
 * (which automatically triggers PostgreSQL GL Journal + OUTPUT_VAT creation on `status = 'รอเก็บเงิน'`).
 */
export async function ensureSalesInvoiceForQuotation(
  {
    quotation,
    issueDate = new Date().toISOString().split('T')[0],
    dueDays = 30,
    customerPoNo = '',
  },
  client = defaultSupabase
) {
  if (!quotation?.id) {
    throw new Error('ไม่พบรหัสอ้างอิงใบเสนอราคาสำหรับออกใบแจ้งหนี้')
  }

  // 1. Reuse existing non-cancelled AR invoice if one already exists
  const { data: existingList } = await client
    .from('sales_invoices')
    .select('*')
    .eq('quotation_id', quotation.id)
    .order('created_at', { ascending: false })

  const activeExisting = (existingList || []).find((inv) => !isCancelledStatus(inv.status))
  if (activeExisting) {
    return { invoice: activeExisting, created: false }
  }

  // 2. Match unified customer and ensure valid FKs for both `customer_id` and `contact_id`
  const unifiedCustomers = await fetchUnifiedCustomers({}, client).catch(() => [])
  const normCustName = normalizeName(quotation.customer_name)
  const normTax = normalizeTaxId(quotation.customer_tax_id)

  const matchedCustomer =
    unifiedCustomers.find((c) => normTax.length >= 10 && normalizeTaxId(c.tax_id) === normTax) ||
    unifiedCustomers.find((c) => normCustName && normalizeName(c.customer_name || c.name) === normCustName) ||
    (quotation.customer_id
      ? unifiedCustomers.find(
          (c) => c.id === quotation.customer_id || c.legacyCustomerId === quotation.customer_id
        )
      : null)

  let customerId = quotation.customer_id || null
  let contactId = matchedCustomer?.contactId || null

  if (matchedCustomer) {
    if (!customerId) {
      customerId = await ensureLegacyCustomerId(matchedCustomer, client).catch(() => null)
    }
    if (!contactId) {
      contactId = await ensureContactIdForEntity(matchedCustomer, 'customer', client).catch(
        () => null
      )
    }
  } else if (quotation.customer_name) {
    const synthetic = {
      customer_name: quotation.customer_name,
      tax_id: quotation.customer_tax_id || null,
      address: quotation.customer_address || null,
      postal_code: quotation.customer_postal_code || null,
    }
    customerId = await ensureLegacyCustomerId(synthetic, client).catch(() => null)
    contactId = await ensureContactIdForEntity(synthetic, 'customer', client).catch(() => null)
  }

  // 3. Build payload & insert with self-healing retry loop
  let activePayload = buildSalesInvoicePayload({
    quotation,
    customerId,
    contactId,
    invoiceNo: generateInvoiceNo(issueDate),
    issueDate,
    dueDays,
    customerPoNo,
  })

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: inserted, error: insErr } = await client
      .from('sales_invoices')
      .insert([activePayload])
      .select('*')
      .single()

    if (!insErr && inserted) {
      return { invoice: inserted, created: true }
    }

    const msg = insErr?.message || ''
    if (msg.includes('duplicate key') || msg.includes('invoice_no')) {
      activePayload.invoice_no = generateInvoiceNo(issueDate)
      continue
    }
    if (msg.includes('customer_id') && msg.includes('foreign key')) {
      delete activePayload.customer_id
      continue
    }
    if (msg.includes('contact_id') && msg.includes('foreign key')) {
      delete activePayload.contact_id
      continue
    }
    if (msg.includes('project_id') && msg.includes('foreign key')) {
      delete activePayload.project_id
      continue
    }

    const colMatch =
      msg.match(/column "(.*?)" of relation "sales_invoices" does not exist/i) ||
      msg.match(/Could not find the '(.*?)' column of 'sales_invoices'/i)
    if (colMatch && colMatch[1]) {
      delete activePayload[colMatch[1]]
      continue
    }

    throw insErr
  }

  throw new Error('ไม่สามารถสร้างใบแจ้งหนี้ลูกหนี้ (sales_invoices) ได้')
}

/**
 * Fetch linked Purchasing (PR/PO) and AR Billing (`sales_invoices`) records for a quotation.
 */
export async function fetchQuotationLinkedDocs(quotation, client = defaultSupabase) {
  if (!quotation?.id) {
    return { prs: [], pos: [], invoices: [] }
  }

  const qId = quotation.id
  const qNo = String(quotation.quotation_no || '').trim()
  const prjId = quotation.project_id || null

  const poOrParts = [`quotation_id.eq.${qId}`]
  if (qNo) {
    poOrParts.push(`sales_quotation_no.eq.${qNo}`)
    poOrParts.push(`quotation_no.eq.${qNo}`)
  }
  if (prjId) {
    poOrParts.push(`project_id.eq.${prjId}`)
  }

  const prOrParts = [`quotation_id.eq.${qId}`]
  if (qNo) {
    prOrParts.push(`sales_quotation_no.eq.${qNo}`)
    prOrParts.push(`notes.ilike.%${qNo}%`)
  }
  if (prjId) {
    prOrParts.push(`project_id.eq.${prjId}`)
  }

  const safePoQuery = async () => {
    const res = await client
      .from('purchase_orders')
      .select('id, po_no, status, status_th, order_date, total_amount, grand_total, quotation_no, project_id, quotation_id, sales_quotation_no')
      .or(poOrParts.join(','))
      .order('order_date', { ascending: false })
    if (!res.error) return res.data || []

    // Fallback if quotation_id / sales_quotation_no not yet migrated
    const fb = await client
      .from('purchase_orders')
      .select('id, po_no, status, status_th, order_date, total_amount, grand_total, quotation_no, project_id')
      .or([qNo ? `quotation_no.eq.${qNo}` : null, prjId ? `project_id.eq.${prjId}` : null].filter(Boolean).join(','))
      .order('order_date', { ascending: false })
    return fb.error ? [] : fb.data || []
  }

  const safePrQuery = async () => {
    const res = await client
      .from('purchase_requisitions')
      .select('id, pr_no, status, request_date, notes, project_id, quotation_id, sales_quotation_no')
      .or(prOrParts.join(','))
      .order('request_date', { ascending: false })
    if (!res.error) return res.data || []

    const fb = await client
      .from('purchase_requisitions')
      .select('id, pr_no, status, request_date, notes, project_id')
      .or([qNo ? `notes.ilike.%${qNo}%` : null, prjId ? `project_id.eq.${prjId}` : null].filter(Boolean).join(','))
      .order('request_date', { ascending: false })
    return fb.error ? [] : fb.data || []
  }

  const [invRes, posList, prsList] = await Promise.all([
    client
      .from('sales_invoices')
      .select('*')
      .eq('quotation_id', quotation.id)
      .order('created_at', { ascending: false }),
    safePoQuery(),
    safePrQuery(),
  ])

  return {
    invoices: invRes.error ? [] : invRes.data || [],
    pos: posList,
    prs: prsList,
  }
}
