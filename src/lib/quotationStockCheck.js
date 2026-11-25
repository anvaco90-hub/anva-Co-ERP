import { normalizeName } from './contactsUtils.js'
import { buildPurchaseItemsFromQuotation } from './purchasingPricing.js'
import { round2 } from './tax.js'

const SERVICE_UNITS = new Set([
  'งาน',
  'watt',
  'w',
  'kw',
  'kwp',
  'เหมา',
  'lot',
  'ls',
  'ครั้ง',
  'จุด',
  'ระบบ',
  'job',
  'service',
])

const SERVICE_KEYWORDS = [
  'ค่าแรง',
  'ค่าบริการ',
  'ค่าติดตั้ง',
  'ค่าดำเนินการ',
  'ค่าสำรวจ',
  'ค่าออกแบบ',
  'ค่าขนส่ง',
  'installation',
  'commissioning',
  'labor',
  'labour',
  'service fee',
]

/**
 * ตรวจว่ารายการในใบเสนอราคาเป็นหมวดค่าแรงหรือค่าบริการ (ข้ามการเช็กสต็อกคลังสินค้า)
 * @param {object} item
 * @returns {boolean}
 */
export function isServiceOrLaborItem(item) {
  if (!item || typeof item !== 'object') return false
  const unit = String(item.unit || '').trim().toLowerCase()
  if (unit && SERVICE_UNITS.has(unit)) return true

  const name = normalizeName(item.item_name)
  if (!name) return false
  return SERVICE_KEYWORDS.some((kw) => name.includes(kw))
}

/**
 * เทียบรายการใบเสนอราคากับยอดคงเหลือจริงใน `inventory_items.qty_on_hand` รายบรรทัด
 * @param {Array} quotationItems
 * @param {Array} inventoryItems
 * @returns {Array}
 */
export function checkQuotationStock(quotationItems = [], inventoryItems = []) {
  const invById = new Map()
  const invByName = new Map()

  for (const inv of inventoryItems || []) {
    if (!inv) continue
    if (inv.id && !invById.has(inv.id)) invById.set(inv.id, inv)
    const key = normalizeName(inv.item_name)
    if (key && !invByName.has(key)) invByName.set(key, inv)
  }

  return (quotationItems || []).map((qItem) => {
    const itemName = String(qItem?.item_name || '').trim()
    const unit = String(qItem?.unit || '').trim()
    const needed = Math.max(0, round2(Number(qItem?.quantity) || 0))

    if (isServiceOrLaborItem(qItem)) {
      return {
        quotationItemId: qItem?.id || null,
        itemName,
        unit,
        needed,
        inStock: null,
        issueQty: 0,
        shortfall: 0,
        status: 'service',
        itemId: null,
        itemCode: null,
        inventoryUnit: null,
      }
    }

    const inv =
      (qItem?.item_id && invById.get(qItem.item_id)) ||
      invByName.get(normalizeName(itemName)) ||
      null

    if (!inv) {
      return {
        quotationItemId: qItem?.id || null,
        itemName,
        unit,
        needed,
        inStock: 0,
        issueQty: 0,
        shortfall: needed,
        status: 'not_in_inventory',
        itemId: null,
        itemCode: null,
        inventoryUnit: null,
      }
    }

    const inStock = Math.max(0, round2(Number(inv.qty_on_hand) || 0))
    const issueQty = round2(Math.min(needed, inStock))
    const shortfall = round2(Math.max(0, needed - inStock))

    let status = 'out_of_stock'
    if (inStock >= needed) {
      status = 'enough'
    } else if (inStock > 0) {
      status = 'partial'
    }

    return {
      quotationItemId: qItem?.id || null,
      itemName,
      unit,
      needed,
      inStock,
      issueQty,
      shortfall,
      status,
      itemId: inv.id || null,
      itemCode: inv.item_code || null,
      inventoryUnit: inv.unit || null,
    }
  })
}

/**
 * สรุปจำนวนรายการตามสถานะสต็อก
 * @param {Array} stockRows
 */
export function summarizeQuotationStock(stockRows = []) {
  const rows = stockRows || []
  let enoughCount = 0
  let partialCount = 0
  let outOfStockCount = 0
  let notInInventoryCount = 0
  let serviceCount = 0
  let issuableCount = 0

  for (const row of rows) {
    if (!row) continue
    if (row.status === 'enough') enoughCount += 1
    else if (row.status === 'partial') partialCount += 1
    else if (row.status === 'out_of_stock') outOfStockCount += 1
    else if (row.status === 'not_in_inventory') notInInventoryCount += 1
    else if (row.status === 'service') serviceCount += 1

    if (Number(row.issueQty) > 0) issuableCount += 1
  }

  return {
    totalItems: rows.length,
    totalChecked: rows.length - serviceCount,
    enoughCount,
    partialCount,
    outOfStockCount,
    notInInventoryCount,
    serviceCount,
    shortageCount: partialCount + outOfStockCount + notInInventoryCount,
    issuableCount,
  }
}

/**
 * สร้างรายการสำหรับเปิด PR เฉพาะรายการที่สต็อกไม่พอ (shortfall = needed - qty_on_hand)
 * ข้ามรายการที่สต็อกพอและรายการค่าแรง/บริการ โดยใช้ตรรกะราคาต้นทุนเดิมจาก purchasingPricing.js
 */
export function buildShortfallPrItems({
  quotation = {},
  quotationItems = [],
  boqItems = [],
  inventoryItems = [],
  mode = 'cost_baseline',
}) {
  const stockRows = checkQuotationStock(quotationItems, inventoryItems)
  const shortagePairs = []

  ;(quotationItems || []).forEach((qIt, idx) => {
    const stock = stockRows[idx]
    if (stock && stock.shortfall > 0) {
      shortagePairs.push({ qIt, stock })
    }
  })

  if (shortagePairs.length === 0) return []

  const pricedRows = buildPurchaseItemsFromQuotation({
    quotation,
    quotationItems: shortagePairs.map((p) => p.qIt),
    boqItems,
    inventoryItems,
    mode,
  })

  return pricedRows.map((row, idx) => {
    const { stock } = shortagePairs[idx]
    return {
      ...row,
      quantity: String(stock.shortfall),
      neededQty: stock.needed,
      inStockQty: stock.inStock,
      shortfallQty: stock.shortfall,
      stockStatus: stock.status,
    }
  })
}

/**
 * สร้างรายการสำหรับหน้าเบิกของ (/store/issue/new) จากยอดที่พร้อมเบิกในคลัง
 * รวมรายการที่มี item_id เดียวกันและคุมจำนวนไม่ให้เกิน qty_on_hand ที่เป็นจำนวนเต็ม
 */
export function buildIssuableStockLines(quotationItems = [], inventoryItems = []) {
  const stockRows = checkQuotationStock(quotationItems, inventoryItems)
  const aggregated = new Map()

  for (const row of stockRows) {
    if (!row?.itemId || !(row.inStock > 0) || !(row.needed > 0)) continue
    const existing = aggregated.get(row.itemId)
    const maxWholeStock = Math.floor(row.inStock)
    if (maxWholeStock <= 0) continue

    if (existing) {
      existing.needed = round2(existing.needed + row.needed)
      existing.qty = Math.min(Math.round(existing.needed), maxWholeStock)
    } else {
      const qty = Math.min(Math.round(row.needed), maxWholeStock)
      if (qty > 0) {
        aggregated.set(row.itemId, { item_id: row.itemId, needed: row.needed, maxWholeStock, qty })
      }
    }
  }

  return Array.from(aggregated.values()).map(({ item_id, qty }) => ({
    item_id,
    quantity: String(qty),
  }))
}

/**
 * Group positive remaining `stock_lots` rows by `item_id` and source project (or central store).
 * Keeps zero-quantity lots out and puts project-originated lots before central store stock.
 */
export function summarizeItemLotSources(stockLots = []) {
  const byItem = {}
  for (const lot of stockLots || []) {
    const itemId = lot?.item_id
    const qty = Number(lot?.qty_remaining || 0)
    if (!itemId || !(qty > 0)) continue

    const projectId = lot?.source_project_id || null
    const proj = Array.isArray(lot?.projects) ? lot.projects[0] : lot?.projects
    const isCentral = !projectId
    const key = isCentral ? '__central__' : String(projectId)

    if (!byItem[itemId]) byItem[itemId] = new Map()
    const existing = byItem[itemId].get(key)
    if (existing) {
      existing.qty = Math.round((existing.qty + qty) * 1000) / 1000
    } else {
      byItem[itemId].set(key, {
        projectId,
        projectCode: isCentral ? null : proj?.project_code || null,
        projectName: isCentral ? 'คลังกลาง' : proj?.project_name || proj?.project_code || 'โครงการอื่น',
        qty: Math.round(qty * 1000) / 1000,
        isCentral,
      })
    }
  }

  const result = {}
  for (const [itemId, map] of Object.entries(byItem)) {
    result[itemId] = Array.from(map.values()).sort((a, b) => {
      if (a.isCentral !== b.isCentral) return a.isCentral ? 1 : -1
      return b.qty - a.qty
    })
  }
  return result
}

/**
 * Subtract item quantities already requested on existing active PRs for the same quotation
 * from computed shortfall PR items so duplicate PR lines are avoided.
 */
export function summarizeQuotationPrCoverage(shortfallItems = [], existingPrItems = []) {
  const requestedByName = new Map()

  for (const prItem of existingPrItems || []) {
    const key = normalizeName(prItem?.item_name)
    const qty = Math.max(0, Number(prItem?.quantity || 0))
    if (!key || !(qty > 0)) continue

    const entry = requestedByName.get(key) || { qty: 0, prNos: new Set() }
    entry.qty = Math.round((entry.qty + qty) * 1000) / 1000
    if (prItem?.pr_no) entry.prNos.add(String(prItem.pr_no).trim())
    requestedByName.set(key, entry)
  }

  const uncoveredItems = []
  let coveredCount = 0
  const coverageByName = new Map()

  for (const sItem of shortfallItems || []) {
    const key = normalizeName(sItem?.item_name)
    const needed = Math.max(0, Number(sItem?.quantity || 0))
    if (!key || !(needed > 0)) continue

    const reqEntry = requestedByName.get(key)
    const requestedQty = reqEntry ? reqEntry.qty : 0
    const uncoveredQty = Math.round(Math.max(0, needed - requestedQty) * 1000) / 1000
    const isFullyCovered = uncoveredQty <= 0
    const prNos = reqEntry ? Array.from(reqEntry.prNos) : []

    coverageByName.set(key, {
      requestedQty,
      uncoveredQty,
      isFullyCovered,
      prNos,
    })

    if (isFullyCovered) {
      coveredCount += 1
    } else {
      uncoveredItems.push({
        ...sItem,
        quantity: String(uncoveredQty),
        alreadyRequestedQty: Math.round(Math.min(needed, requestedQty) * 1000) / 1000,
      })
    }
  }

  const getItemCoverage = (itemName) => {
    const key = normalizeName(itemName)
    if (!key) {
      return { requestedQty: 0, uncoveredQty: 0, isFullyCovered: false, prNos: [] }
    }
    if (coverageByName.has(key)) {
      return coverageByName.get(key)
    }
    const reqEntry = requestedByName.get(key)
    if (reqEntry) {
      return {
        requestedQty: reqEntry.qty,
        uncoveredQty: 0,
        isFullyCovered: true,
        prNos: Array.from(reqEntry.prNos),
      }
    }
    return { requestedQty: 0, uncoveredQty: 0, isFullyCovered: false, prNos: [] }
  }

  return {
    uncoveredItems,
    uncoveredCount: uncoveredItems.length,
    coveredCount,
    getItemCoverage,
  }
}
