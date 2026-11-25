/**
 * BOQ Labor Calculation Helpers
 * สูตรมาตรฐาน: ค่าแรง (บาท) = (kWp * 1000) * 3 (ปัดเศษทศนิยม 2 ตำแหน่ง)
 */

export const LABOR_RATE_PER_WATT = 3

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * คำนวณค่าแรงจากขนาดระบบ (kWp) ด้วยสูตร (kw * 1000) * ratePerWatt
 * @param {number|string} kwp
 * @param {number} ratePerWatt
 * @returns {number}
 */
export function calculateKwLaborCost(kwp, ratePerWatt = LABOR_RATE_PER_WATT) {
  const kw = Number(kwp)
  if (!Number.isFinite(kw) || kw <= 0) return 0
  return round2(kw * 1000 * ratePerWatt)
}

/**
 * คำนวณยอดรวมค่าแรงรายบรรทัด (รองรับจำนวนทศนิยมและปัดเศษ 2 ตำแหน่ง)
 * @param {number|string} quantity
 * @param {number|string} unitCost
 * @returns {number}
 */
export function calculateLaborLineTotal(quantity, unitCost) {
  const qty = Number(quantity)
  const cost = Number(unitCost)
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) return 0
  return round2(qty * cost)
}

/**
 * ซิงค์ค่าแรงรายการหลักตามค่า kWp (เว้นแต่ผู้ใช้แก้ไขตัวเลขด้วยตัวเองแล้ว)
 * @param {Array} laborItems
 * @param {number|string} kwp
 * @param {boolean} isManualOverride
 * @returns {Array}
 */
export function syncLaborItemsWithKwp(laborItems = [], kwp, isManualOverride = false) {
  if (isManualOverride || !Array.isArray(laborItems) || laborItems.length === 0) {
    return laborItems
  }
  const kw = Number(kwp)
  const watts = Number.isFinite(kw) && kw > 0 ? round2(kw * 1000) : 0
  return laborItems.map((item, idx) => {
    if (idx !== 0) return item
    const existingRate = Number(item.labor_unit_cost)
    const rate =
      item.labor_unit_cost !== '' &&
        item.labor_unit_cost != null &&
        Number.isFinite(existingRate) &&
        existingRate > 0
        ? String(item.labor_unit_cost)
        : String(LABOR_RATE_PER_WATT)
    return {
      ...item,
      quantity: watts > 0 ? String(watts) : '',
      unit: 'Watt',
      labor_unit_cost: rate,
    }
  })
}
