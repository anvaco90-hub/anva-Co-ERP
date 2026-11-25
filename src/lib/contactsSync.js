import { supabase as defaultSupabase } from './supabase'

/**
 * Normalize a tax ID by stripping whitespace and hyphens so lookups match consistently.
 */
export function normalizeTaxId(taxId) {
  return String(taxId || '').replace(/[\s-]+/g, '').trim()
}

/**
 * Normalize a business/person name for deduplication matching.
 */
export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Resolve the primary display name from any contact, customer, or vendor row.
 */
export function getEntityDisplayName(row) {
  if (!row || typeof row !== 'object') return ''
  return String(
    row.business_name ||
      row.company_name ||
      row.customer_name ||
      row.vendor_name ||
      row.contact_person_name ||
      row.contact_person ||
      ''
  ).trim()
}

/**
 * Format a bank/payment summary string if bank fields exist.
 */
export function isJuristicName(name) {
  return /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน/i.test(String(name || ''))
}

function buildMatchKeys(row) {
  const keys = []
  const tax = normalizeTaxId(row?.tax_id)
  if (tax.length >= 10 && !/^0+$/.test(tax)) {
    keys.push(`tax:${tax}`)
  }
  const name = normalizeName(getEntityDisplayName(row))
  if (name) {
    keys.push(`name:${name}`)
  }
  return keys
}

/**
 * Merge rows from `contacts` and legacy `customers` or `vendors` into one deduplicated list.
 * - Prefers legacy UUID for `id` when a matching legacy row exists so foreign keys
 *   (`purchase_orders.vendor_id`, `expenses.vendor_id`, `quotations.customer_id`) work directly.
 * - Exposes `contactId` and `legacyId` so callers can populate dual FK columns (`contact_id` + `customer_id`).
 *
 * @param {Array} contactRows
 * @param {Array} legacyRows
 * @param {'customer'|'vendor'} role
 * @param {{ includeInactive?: boolean }} [options]
 */
export function mergeUnifiedEntities(contactRows = [], legacyRows = [], role = 'customer', options = {}) {
  const { includeInactive = false } = options
  const isCustomer = role === 'customer'

  const filteredContacts = (contactRows || []).filter((c) => {
    if (!c) return false
    if (!includeInactive && c.is_active === false) return false
    if (isCustomer) {
      return Boolean(c.is_customer || c.contact_type === 'customer' || c.contact_type === 'both')
    }
    return Boolean(c.is_vendor || c.contact_type === 'vendor' || c.contact_type === 'both')
  })

  // Index legacy rows by tax_id and normalized name
  const legacyByKey = new Map()
  const usedLegacyIds = new Set()

  for (const leg of legacyRows || []) {
    if (!leg) continue
    for (const key of buildMatchKeys(leg)) {
      if (!legacyByKey.has(key)) {
        legacyByKey.set(key, leg)
      }
    }
  }

  const unified = []
  const seenKeys = new Set()

  const findMatchingLegacy = (contact) => {
    for (const key of buildMatchKeys(contact)) {
      const hit = legacyByKey.get(key)
      if (hit && !usedLegacyIds.has(hit.id)) return hit
    }
    return null
  }

  // 1) Process unified Contacts first (richest master record)
  for (const c of filteredContacts) {
    const leg = findMatchingLegacy(c)
    if (leg) usedLegacyIds.add(leg.id)

    const displayName =
      getEntityDisplayName(c) || getEntityDisplayName(leg) || 'ไม่ระบุชื่อ'
    const dedupeKey = `name:${normalizeName(displayName)}|tax:${normalizeTaxId(c.tax_id || leg?.tax_id)}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)

    const resolvedId = leg?.id || c.id
    const resolvedCode =
      c.contact_code ||
      (isCustomer ? leg?.customer_code : leg?.vendor_code) ||
      (isCustomer ? 'CUST' : 'VEND')
    const resolvedAddress =
      c.registered_address || c.address || leg?.address || ''
    const resolvedPhone = c.office_phone || c.phone || leg?.phone || ''
    const resolvedContactPerson =
      c.contact_person_name || c.contact_person || leg?.contact_person || ''
    const resolvedTaxId = c.tax_id || leg?.tax_id || ''
    const resolvedEmail = c.email || leg?.email || ''

    unified.push({
      id: resolvedId,
      contactId: c.id,
      legacyId: leg?.id || null,
      legacyCustomerId: isCustomer ? leg?.id || null : null,
      legacyVendorId: !isCustomer ? leg?.id || null : null,
      isContactOnly: !leg,
      isLegacyOnly: false,
      source: leg ? 'synced' : 'contacts',
      code: resolvedCode,
      name: displayName,
      company_name: displayName,
      business_name: displayName,
      customer_code: resolvedCode,
      customer_name: displayName,
      vendor_code: resolvedCode,
      vendor_name: displayName,
      tax_id: resolvedTaxId,
      branch_type: c.branch_type || leg?.branch_type || 'สำนักงานใหญ่',
      branch_code: c.branch_code || leg?.branch_no || '00000',
      branch_no: c.branch_code || leg?.branch_no || '00000',
      address: resolvedAddress,
      shipping_address: c.shipping_address || resolvedAddress,
      postal_code: c.postal_code || leg?.postal_code || '',
      phone: resolvedPhone,
      email: resolvedEmail,
      contact_person: resolvedContactPerson,
      credit_days: Number(c.credit_days ?? 30),
      bank_name: c.bank_name || '',
      bank_account_no: c.bank_account_no || '',
      bank_account_name: c.bank_account_name || '',
      promptpay_no: c.promptpay_no || '',
      is_active: c.is_active !== false,
    })
  }

  // 2) Append any legacy records not yet mirrored into `contacts`
  for (const leg of legacyRows || []) {
    if (!leg || usedLegacyIds.has(leg.id)) continue
    const displayName = getEntityDisplayName(leg)
    if (!displayName) continue

    const dedupeKey = `name:${normalizeName(displayName)}|tax:${normalizeTaxId(leg.tax_id)}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)

    const resolvedCode =
      (isCustomer ? leg.customer_code : leg.vendor_code) ||
      (isCustomer ? 'CUST' : 'VEND')

    unified.push({
      id: leg.id,
      contactId: null,
      legacyId: leg.id,
      legacyCustomerId: isCustomer ? leg.id : null,
      legacyVendorId: !isCustomer ? leg.id : null,
      isContactOnly: false,
      isLegacyOnly: true,
      source: isCustomer ? 'customers' : 'vendors',
      code: resolvedCode,
      name: displayName,
      company_name: displayName,
      business_name: displayName,
      customer_code: resolvedCode,
      customer_name: displayName,
      vendor_code: resolvedCode,
      vendor_name: displayName,
      tax_id: leg.tax_id || '',
      branch_type: leg.branch_type || 'สำนักงานใหญ่',
      branch_code: leg.branch_no || '00000',
      branch_no: leg.branch_no || '00000',
      address: leg.address || '',
      shipping_address: leg.address || '',
      postal_code: leg.postal_code || '',
      phone: leg.phone || '',
      email: leg.email || '',
      contact_person: leg.contact_person || '',
      credit_days: 30,
      bank_name: '',
      bank_account_no: '',
      bank_account_name: '',
      promptpay_no: '',
      is_active: true,
    })
  }

  return unified.sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

/**
 * Build a Map resolving any known ID (`id`, `contactId`, `legacyId`) to the unified record.
 */
export function buildEntityLookupMap(entities = []) {
  const map = new Map()
  for (const item of entities || []) {
    if (!item) continue
    if (item.id) map.set(item.id, item)
    if (item.contactId) map.set(item.contactId, item)
    if (item.legacyId) map.set(item.legacyId, item)
  }
  return map
}

/**
 * Fetch merged, deduplicated customers from both `contacts` and `customers`.
 */
export async function fetchUnifiedCustomers(options = {}, client = defaultSupabase) {
  const [contactsRes, customersRes] = await Promise.all([
    client.from('contacts').select('*').order('company_name'),
    client.from('customers').select('*').order('customer_name'),
  ])

  const contactRows = contactsRes.error ? [] : contactsRes.data || []
  const customerRows = customersRes.error ? [] : customersRes.data || []
  return mergeUnifiedEntities(contactRows, customerRows, 'customer', options)
}

/**
 * Fetch merged, deduplicated vendors from both `contacts` and `vendors`.
 */
export async function fetchUnifiedVendors(options = {}, client = defaultSupabase) {
  const [contactsRes, vendorsRes] = await Promise.all([
    client.from('contacts').select('*').order('company_name'),
    client.from('vendors').select('*').order('vendor_code'),
  ])

  const contactRows = contactsRes.error ? [] : contactsRes.data || []
  const vendorRows = vendorsRes.error ? [] : vendorsRes.data || []
  return mergeUnifiedEntities(contactRows, vendorRows, 'vendor', options)
}

function generateAutoCode(prefix) {
  return `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`
}

async function findExistingRowByTaxOrName(client, table, nameColumn, name, taxId, previousName = '') {
  const { data: rows, error } = await client.from(table).select('*')
  if (error || !Array.isArray(rows)) return null

  const normTax = normalizeTaxId(taxId)
  const normName = normalizeName(name)
  const normPrev = normalizeName(previousName)

  if (normTax.length >= 10 && !/^0+$/.test(normTax)) {
    const taxMatch = rows.find((r) => normalizeTaxId(r.tax_id) === normTax)
    if (taxMatch) return taxMatch
  }

  if (normName) {
    const nameMatch = rows.find(
      (r) => normalizeName(r[nameColumn] || getEntityDisplayName(r)) === normName
    )
    if (nameMatch) return nameMatch
  }

  if (normPrev) {
    const prevMatch = rows.find(
      (r) => normalizeName(r[nameColumn] || getEntityDisplayName(r)) === normPrev
    )
    if (prevMatch) return prevMatch
  }

  return null
}

/**
 * Sync a contact saved in Contacts Hub into legacy `customers` and/or `vendors` tables
 * so every Purchasing, Project, Quotation, Expense, AR and AP screen stays up to date.
 */
export async function syncContactToLegacyTables(contactRow, options = {}, client = defaultSupabase) {
  const { previousName = '' } = options
  const warnings = []
  let customerId = null
  let vendorId = null

  if (!contactRow) return { customerId, vendorId, warnings }

  const name = getEntityDisplayName(contactRow)
  if (!name) return { customerId, vendorId, warnings }

  const isCustomer = Boolean(
    contactRow.is_customer ||
      contactRow.contact_type === 'customer' ||
      contactRow.contact_type === 'both'
  )
  const isVendor = Boolean(
    contactRow.is_vendor ||
      contactRow.contact_type === 'vendor' ||
      contactRow.contact_type === 'both'
  )

  const phone = contactRow.office_phone || contactRow.phone || null
  const address = contactRow.registered_address || contactRow.address || null
  const contactPerson = contactRow.contact_person_name || contactRow.contact_person || null
  const taxId = contactRow.tax_id || null

  if (isCustomer) {
    try {
      const existing = await findExistingRowByTaxOrName(
        client,
        'customers',
        'customer_name',
        name,
        taxId,
        previousName
      )
      const custPayload = {
        customer_name: name,
        tax_id: taxId,
        branch_type: contactRow.branch_type || 'สำนักงานใหญ่',
        branch_no: contactRow.branch_code || '00000',
        address,
        postal_code: contactRow.postal_code || null,
        contact_person: contactPerson,
        phone,
        email: contactRow.email || null,
      }

      if (existing) {
        const { error } = await client
          .from('customers')
          .update(custPayload)
          .eq('id', existing.id)
        if (error) warnings.push(`customer update: ${error.message}`)
        customerId = existing.id
      } else {
        const code = contactRow.contact_code || generateAutoCode('CUST')
        let { data, error } = await client
          .from('customers')
          .insert([{ customer_code: code, ...custPayload }])
          .select('id')
          .single()

        if (error && /duplicate|unique/i.test(error.message || '')) {
          ;({ data, error } = await client
            .from('customers')
            .insert([{ customer_code: generateAutoCode('CUST'), ...custPayload }])
            .select('id')
            .single())
        }
        if (error) warnings.push(`customer insert: ${error.message}`)
        else customerId = data?.id || null
      }
    } catch (err) {
      warnings.push(`customer sync: ${err.message}`)
    }
  }

  if (isVendor) {
    try {
      const existing = await findExistingRowByTaxOrName(
        client,
        'vendors',
        'vendor_name',
        name,
        taxId,
        previousName
      )
      const vendorPayload = {
        vendor_name: name,
        contact_person: contactPerson,
        phone,
        tax_id: taxId,
        address,
      }

      if (existing) {
        const { error } = await client
          .from('vendors')
          .update(vendorPayload)
          .eq('id', existing.id)
        if (error) warnings.push(`vendor update: ${error.message}`)
        vendorId = existing.id
      } else {
        const code = contactRow.contact_code || generateAutoCode('VEND')
        let { data, error } = await client
          .from('vendors')
          .insert([{ vendor_code: code, ...vendorPayload }])
          .select('id')
          .single()

        if (error && /duplicate|unique/i.test(error.message || '')) {
          ;({ data, error } = await client
            .from('vendors')
            .insert([{ vendor_code: generateAutoCode('VEND'), ...vendorPayload }])
            .select('id')
            .single())
        }
        if (error) warnings.push(`vendor insert: ${error.message}`)
        else vendorId = data?.id || null
      }
    } catch (err) {
      warnings.push(`vendor sync: ${err.message}`)
    }
  }

  return { customerId, vendorId, warnings }
}

/**
 * Sync a record saved in legacy `vendors` or `customers` (e.g. Vendors page or PO custom vendor)
 * back into the unified `contacts` table.
 */
export async function upsertUnifiedContactFromLegacy(
  { role = 'vendor', record = {}, previousName = '' },
  client = defaultSupabase
) {
  const name = getEntityDisplayName(record)
  if (!name) return null

  const isVendor = role === 'vendor'
  const isCustomer = role === 'customer'

  try {
    const existing = await findExistingRowByTaxOrName(
      client,
      'contacts',
      'business_name',
      name,
      record.tax_id,
      previousName
    )

    if (existing) {
      const mergedIsCust = Boolean(existing.is_customer || isCustomer)
      const mergedIsVend = Boolean(existing.is_vendor || isVendor)
      const contactType =
        mergedIsCust && mergedIsVend ? 'both' : mergedIsCust ? 'customer' : 'vendor'

      const updatePayload = {
        business_name: name,
        company_name: name,
        contact_type: contactType,
        is_customer: mergedIsCust,
        is_vendor: mergedIsVend,
        tax_id: record.tax_id ?? existing.tax_id ?? null,
        registered_address: record.address ?? existing.registered_address ?? null,
        address: record.address ?? existing.address ?? null,
        office_phone: record.phone ?? existing.office_phone ?? null,
        phone: record.phone ?? existing.phone ?? null,
        contact_person_name: record.contact_person ?? existing.contact_person_name ?? null,
        contact_person: record.contact_person ?? existing.contact_person ?? null,
        email: record.email ?? existing.email ?? null,
      }

      const { data, error } = await client
        .from('contacts')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('id')
        .single()

      return error ? existing.id : data?.id || existing.id
    }

    const code =
      record.vendor_code ||
      record.customer_code ||
      record.contact_code ||
      generateAutoCode(isVendor ? 'VEND' : 'CUST')

    const insertPayload = {
      contact_code: code,
      contact_type: role,
      entity_type: isJuristicName(name) ? 'corporate' : 'individual',
      is_customer: isCustomer,
      is_vendor: isVendor,
      business_name: name,
      company_name: name,
      tax_id: record.tax_id || null,
      branch_type: record.branch_type || 'สำนักงานใหญ่',
      branch_code: record.branch_no || record.branch_code || '00000',
      registered_address: record.address || null,
      address: record.address || null,
      postal_code: record.postal_code || null,
      office_phone: record.phone || null,
      phone: record.phone || null,
      contact_person_name: record.contact_person || null,
      contact_person: record.contact_person || null,
      email: record.email || null,
      is_active: true,
    }

    let { data, error } = await client
      .from('contacts')
      .insert([insertPayload])
      .select('id')
      .single()

    if (error && /duplicate|unique/i.test(error.message || '')) {
      ;({ data, error } = await client
        .from('contacts')
        .insert([{ ...insertPayload, contact_code: generateAutoCode(isVendor ? 'VEND' : 'CUST') }])
        .select('id')
        .single())
    }

    return error ? null : data?.id || null
  } catch (err) {
    console.warn('upsertUnifiedContactFromLegacy fallback:', err)
    return null
  }
}

/**
 * Guarantee a valid `vendors.id` UUID for tables with a strict FK to `vendors(id)`
 * (such as `purchase_orders.vendor_id` and `expenses.vendor_id`), even if the vendor
 * originally existed only in `contacts`.
 */
export async function ensureLegacyVendorId(vendorEntry, client = defaultSupabase) {
  if (!vendorEntry) return null

  if (typeof vendorEntry === 'object' && vendorEntry.legacyVendorId) {
    return vendorEntry.legacyVendorId
  }

  let candidate = typeof vendorEntry === 'object' ? vendorEntry : null
  const candidateId = typeof vendorEntry === 'string' ? vendorEntry : vendorEntry?.id

  if (candidateId) {
    const { data: existingLegacy } = await client
      .from('vendors')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle()
    if (existingLegacy?.id) return existingLegacy.id

    if (!candidate) {
      const { data: cnt } = await client
        .from('contacts')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle()
      candidate = cnt || null
    }
  }

  if (!candidate) return null

  const { vendorId } = await syncContactToLegacyTables(
    { ...candidate, is_vendor: true },
    {},
    client
  )
  return vendorId
}

/**
 * Guarantee a valid `customers.id` UUID for tables with a FK to `customers(id)`
 * (`sales_invoices.customer_id`, `quotations.customer_id`), even if created only in `contacts`.
 */
export async function ensureLegacyCustomerId(customerEntry, client = defaultSupabase) {
  if (!customerEntry) return null

  if (typeof customerEntry === 'object' && customerEntry.legacyCustomerId) {
    return customerEntry.legacyCustomerId
  }

  let candidate = typeof customerEntry === 'object' ? customerEntry : null
  const candidateId = typeof customerEntry === 'string' ? customerEntry : customerEntry?.id

  if (candidateId) {
    const { data: existingLegacy } = await client
      .from('customers')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle()
    if (existingLegacy?.id) return existingLegacy.id

    if (!candidate) {
      const { data: cnt } = await client
        .from('contacts')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle()
      candidate = cnt || null
    }
  }

  if (!candidate) return null

  const { customerId } = await syncContactToLegacyTables(
    { ...candidate, is_customer: true },
    {},
    client
  )
  return customerId
}

/**
 * Guarantee a `contacts.id` UUID for dual-linked tables like `sales_invoices.contact_id`.
 */
export async function ensureContactIdForEntity(entry, role = 'customer', client = defaultSupabase) {
  if (!entry) return null
  if (typeof entry === 'object' && entry.contactId) return entry.contactId

  const candidateId = typeof entry === 'string' ? entry : entry?.id
  if (candidateId) {
    const { data: existingCnt } = await client
      .from('contacts')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle()
    if (existingCnt?.id) return existingCnt.id
  }

  if (typeof entry === 'object') {
    return upsertUnifiedContactFromLegacy({ role, record: entry }, client)
  }
  return null
}
