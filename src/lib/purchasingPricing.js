import { inferQuotationTaxType, round2 } from './tax.js'
import { normalizeName } from './contactsUtils.js'

/**
 * Derive initial Purchasing (PR / PO) line items from a Sales Quotation without
 * blindly copying the customer-facing markup price as vendor purchase cost.
 *
 * Modes:
 *  - 'cost_baseline' (default): prefers linked BOQ material unit cost, then inventory
 *    moving-average unit cost, otherwise leaves price empty ('') so the buyer enters
 *    the real vendor quote price while seeing `sellingPriceRef` as a margin guardrail.
 *  - 'selling_ref': uses net pre-VAT quotation selling price as editable starting reference.
 */
export function buildPurchaseItemsFromQuotation({
  quotation = {},
  quotationItems = [],
  boqItems = [],
  inventoryItems = [],
  mode = 'cost_baseline',
}) {
  const invMap = new Map()
  for (const inv of inventoryItems || []) {
    const key = normalizeName(inv?.item_name)
    if (key && !invMap.has(key)) invMap.set(key, inv)
  }

  const boqMap = new Map()
  for (const bi of boqItems || []) {
    const key = normalizeName(bi?.item_name)
    if (key && !boqMap.has(key)) boqMap.set(key, bi)
  }

  const qtTaxType = inferQuotationTaxType(quotation)
  const vatRate = Number(quotation?.vat_rate ?? 7)
  const hasVat = qtTaxType !== 'vat_exempt' && vatRate > 0

  return (quotationItems || []).map((qIt) => {
    const key = normalizeName(qIt?.item_name)
    const inv = invMap.get(key) || null
    const boqIt = boqMap.get(key) || null

    const qty = Math.max(1, Number(qIt?.quantity) || 1)
    const rawUnit = Number(qIt?.unit_price) || 0
    const discPct = Number(qIt?.discount_percent) || 0

    let effSelling =
      discPct > 0
        ? round2(rawUnit * (1 - discPct / 100))
        : qIt?.total_amount && qty > 0 && rawUnit === 0
        ? round2(Number(qIt.total_amount) / qty)
        : round2(rawUnit)

    const preVatSelling =
      qtTaxType === 'vat_included' && hasVat
        ? round2(effSelling / (1 + vatRate / 100))
        : effSelling

    const boqMatCost = boqIt
      ? round2(
          Number(boqIt.material_unit_cost || 0) ||
            (Number(boqIt.total_material_cost || 0) > 0
              ? Number(boqIt.total_material_cost) / Math.max(1, Number(boqIt.quantity || 1))
              : 0)
        )
      : 0
    const stockAvgCost = inv ? round2(Number(inv.avg_unit_cost || 0)) : 0

    let initialPrice = ''
    let costSource = 'manual'

    if (mode === 'selling_ref') {
      initialPrice = preVatSelling > 0 ? String(preVatSelling) : ''
      costSource = 'qt_ref'
    } else if (boqMatCost > 0) {
      initialPrice = String(boqMatCost)
      costSource = 'boq'
    } else if (stockAvgCost > 0) {
      initialPrice = String(stockAvgCost)
      costSource = 'stock'
    } else {
      initialPrice = ''
      costSource = 'manual'
    }

    return {
      item_id: qIt?.item_id || inv?.id || null,
      item_name: qIt?.item_name || '',
      quantity: String(qty),
      unit: qIt?.unit || inv?.unit || 'ชุด',
      price: initialPrice,
      received: 0,
      sellingPriceRef: preVatSelling,
      boqCostRef: boqMatCost,
      stockCostRef: stockAvgCost,
      costSource,
    }
  })
}

/**
 * Subtract quantities already ordered on non-cancelled POs linked to the same PR,
 * returning prefill items for only remaining unordered quantities.
 */
export function computeRemainingPrItems(prItems = [], existingPoItems = []) {
  const orderedByPrItemId = new Map()
  const orderedByName = new Map()

  const normName = (name) => String(name || '').replace(/\s+/g, ' ').trim().toLowerCase()

  for (const poItem of existingPoItems || []) {
    const qty = Math.max(0, Number(poItem?.quantity || 0))
    if (!(qty > 0)) continue
    if (poItem?.pr_item_id) {
      orderedByPrItemId.set(
        poItem.pr_item_id,
        (orderedByPrItemId.get(poItem.pr_item_id) || 0) + qty
      )
    } else {
      const key = normName(poItem?.item_name)
      if (key) {
        orderedByName.set(key, (orderedByName.get(key) || 0) + qty)
      }
    }
  }

  const items = []
  let fullyOrderedCount = 0

  for (const prItem of prItems || []) {
    const requestedQty = Math.max(0, Number(prItem?.quantity || 0))
    if (!(requestedQty > 0)) continue

    let orderedQty = 0
    if (prItem?.id && orderedByPrItemId.has(prItem.id)) {
      orderedQty += orderedByPrItemId.get(prItem.id)
    }
    const nameKey = normName(prItem?.item_name)
    if (nameKey && orderedByName.has(nameKey)) {
      const namePool = orderedByName.get(nameKey)
      const neededAfterId = Math.max(0, requestedQty - orderedQty)
      const takeFromName = Math.min(namePool, neededAfterId)
      orderedQty += takeFromName
      const leftInName = Math.round((namePool - takeFromName) * 1000) / 1000
      if (leftInName > 0) orderedByName.set(nameKey, leftInName)
      else orderedByName.delete(nameKey)
    }

    const remaining = Math.round(Math.max(0, requestedQty - orderedQty) * 1000) / 1000
    if (remaining <= 0) {
      fullyOrderedCount += 1
      continue
    }

    const rawPrice = prItem?.estimated_price ?? prItem?.unit_price ?? prItem?.price
    const priceStr = rawPrice != null && Number(rawPrice) > 0 ? String(Number(rawPrice)) : ''

    items.push({
      item_id: prItem?.item_id || null,
      pr_item_id: prItem?.id || null,
      item_name: prItem?.item_name || '',
      unit: prItem?.unit || 'ชิ้น',
      quantity: String(remaining),
      requested_qty: requestedQty,
      already_ordered_qty: Math.round(orderedQty * 1000) / 1000,
      price: priceStr,
      notes: prItem?.notes || '',
    })
  }

  return { items, fullyOrderedCount }
}
