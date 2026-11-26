import { supabase as defaultSupabase } from './supabase'
import {
  fetchUnifiedCustomers,
  ensureLegacyCustomerId,
  ensureContactIdForEntity,
} from './contactsSync'
import { normalizeName, normalizeTaxId } from './contactsUtils'
import { isCancelledStatus } from './projectFinancials'
import {
  buildQuotationPoQuerySpecs,
  buildQuotationPrQuerySpecs,
  buildQuotationIssueQuerySpecs,
  buildSalesInvoicePayload,
} from './salesFlowUtils'

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
 * Fetch linked Purchasing (PR/PO), Store Issues (`stock_issues`), and AR Billing (`sales_invoices`) records for a quotation.
 */
export async function fetchQuotationLinkedDocs(quotation, client = defaultSupabase) {
  if (!quotation?.id) {
    return { prs: [], pos: [], invoices: [], issues: [] }
  }

  const prSpecs = buildQuotationPrQuerySpecs(quotation)
  const issueSpecs = buildQuotationIssueQuerySpecs(quotation)

  const runFilteredQuery = async ({ table, select, orFilter, orderBy }) => {
    if (!orFilter) return { error: null, data: [] }
    return client.from(table).select(select).or(orFilter).order(orderBy, { ascending: false })
  }

  const safePrQuery = async () => {
    const res = await runFilteredQuery({
      table: 'purchase_requisitions',
      select: prSpecs.primarySelect,
      orFilter: prSpecs.primaryOr,
      orderBy: 'request_date',
    })
    if (!res.error) return res.data || []

    const fb = await runFilteredQuery({
      table: 'purchase_requisitions',
      select: prSpecs.fallbackSelect,
      orFilter: prSpecs.fallbackOr,
      orderBy: 'request_date',
    })
    return fb.error ? [] : fb.data || []
  }

  const safeIssueQuery = async () => {
    if (!issueSpecs.orFilter) return []
    try {
      const res = await runFilteredQuery({
        table: 'stock_issues',
        select: issueSpecs.select,
        orFilter: issueSpecs.orFilter,
        orderBy: 'created_at',
      })
      if (res.error) return []
      return res.data || []
    } catch {
      return []
    }
  }

  const [invRes, prsList, issuesList] = await Promise.all([
    client
      .from('sales_invoices')
      .select('*')
      .eq('quotation_id', quotation.id)
      .order('created_at', { ascending: false }),
    safePrQuery(),
    safeIssueQuery(),
  ])

  const matchedPrIds = (prsList || []).map((p) => p?.id).filter(Boolean)
  const poSpecs = buildQuotationPoQuerySpecs(quotation, matchedPrIds)

  const safePoQuery = async () => {
    const res = await runFilteredQuery({
      table: 'purchase_orders',
      select: poSpecs.primarySelect,
      orFilter: poSpecs.primaryOr,
      orderBy: 'order_date',
    })
    if (!res.error) return res.data || []

    // Fallback if quotation_id / sales_quotation_no not yet migrated
    const fb = await runFilteredQuery({
      table: 'purchase_orders',
      select: poSpecs.fallbackSelect,
      orFilter: poSpecs.fallbackOr,
      orderBy: 'order_date',
    })
    return fb.error ? [] : fb.data || []
  }

  let enrichedPrs = prsList
  let posList = await safePoQuery()

  if (matchedPrIds.length > 0) {
    try {
      const prItemsRes = await client
        .from('purchase_requisition_items')
        .select('id, pr_id, item_name, quantity, unit, estimated_price')
        .in('pr_id', matchedPrIds)
      if (!prItemsRes.error && Array.isArray(prItemsRes.data)) {
        const itemsByPr = new Map()
        for (const row of prItemsRes.data) {
          const list = itemsByPr.get(row.pr_id) || []
          list.push(row)
          itemsByPr.set(row.pr_id, list)
        }
        enrichedPrs = prsList.map((pr) => ({
          ...pr,
          purchase_requisition_items: itemsByPr.get(pr.id) || [],
        }))
      }
    } catch {
      // keep prsList without item breakdown if query is unavailable
    }
  }

  if (posList.length > 0) {
    try {
      const poIds = posList.map((po) => po.id).filter(Boolean)
      if (poIds.length > 0) {
        const itemsRes = await client
          .from('purchase_order_items')
          .select('id, po_id, quantity, qty_received, unit_price')
          .in('po_id', poIds)
        if (!itemsRes.error && Array.isArray(itemsRes.data)) {
          const itemsByPo = new Map()
          for (const row of itemsRes.data) {
            const list = itemsByPo.get(row.po_id) || []
            list.push(row)
            itemsByPo.set(row.po_id, list)
          }
          posList = posList.map((po) => ({
            ...po,
            purchase_order_items: itemsByPo.get(po.id) || [],
          }))
        }
      }
    } catch {
      // keep posList without item breakdown if query is unavailable
    }
  }

  return {
    invoices: invRes.error ? [] : invRes.data || [],
    pos: posList,
    prs: enrichedPrs,
    issues: issuesList,
  }
}
