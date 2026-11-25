/**
 * Pure normalization, deduplication, and lookup utilities shared between
 * `contacts` (Unified Contacts Hub) and legacy `customers` / `vendors` tables.
 */

export function normalizeTaxId(taxId) {
  return String(taxId || '').replace(/[\s-]+/g, '').trim()
}

export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

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

export function isJuristicName(name) {
  return /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน/i.test(String(name || ''))
}

export function buildMatchKeys(row) {
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
 * - Prefers legacy UUID for `id` when a matching legacy row exists so PostgreSQL foreign keys
 *   (`purchase_orders.vendor_id`, `expenses.vendor_id`, `quotations.customer_id`) work directly.
 * - Exposes `contactId` and `legacyId` so callers can populate dual FK columns (`contact_id` + `customer_id`).
 * - Respects `is_active === false` on unified contacts so deactivated records don't leak from legacy rows.
 *
 * @param {Array} contactRows
 * @param {Array} legacyRows
 * @param {'customer'|'vendor'} role
 * @param {{ includeInactive?: boolean }} [options]
 */
export function mergeUnifiedEntities(contactRows = [], legacyRows = [], role = 'customer', options = {}) {
  const { includeInactive = false } = options
  const isCustomer = role === 'customer'

  const inactiveKeys = new Set()
  const filteredContacts = []

  for (const c of contactRows || []) {
    if (!c) continue
    const matchesRole = isCustomer
      ? Boolean(c.is_customer || c.contact_type === 'customer' || c.contact_type === 'both')
      : Boolean(c.is_vendor || c.contact_type === 'vendor' || c.contact_type === 'both')
    if (!matchesRole) continue

    if (c.is_active === false) {
      if (!includeInactive) {
        for (const k of buildMatchKeys(c)) inactiveKeys.add(k)
        continue
      }
    }
    filteredContacts.push(c)
  }

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

  for (const leg of legacyRows || []) {
    if (!leg || usedLegacyIds.has(leg.id)) continue
    if (!includeInactive && buildMatchKeys(leg).some((k) => inactiveKeys.has(k))) continue

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
