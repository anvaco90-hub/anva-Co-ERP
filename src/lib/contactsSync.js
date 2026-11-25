import { supabase as defaultSupabase } from './supabase'
import {
  normalizeTaxId,
  normalizeName,
  getEntityDisplayName,
  isJuristicName,
  buildMatchKeys,
  mergeUnifiedEntities,
  buildEntityLookupMap,
} from './contactsUtils'

export {
  normalizeTaxId,
  normalizeName,
  getEntityDisplayName,
  isJuristicName,
  buildMatchKeys,
  mergeUnifiedEntities,
  buildEntityLookupMap,
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
