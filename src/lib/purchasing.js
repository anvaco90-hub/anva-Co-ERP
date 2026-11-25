import { computePoTotals, round2 } from './tax.js'

export const PR_STATUS = {
  pending: { label: '⏳ รอสั่งซื้อ', cls: 'bg-amber-100 text-amber-900 border border-amber-300' },
  ordered: { label: 'สั่งซื้อแล้ว', cls: 'bg-emerald-100 text-emerald-900 border border-emerald-300' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-800 border border-rose-300' },
}
export const PO_STATUS = {
  open: { label: 'รอรับของ', cls: 'bg-sky-100 text-sky-900 border border-sky-300' },
  partial: { label: 'รับบางส่วน', cls: 'bg-amber-100 text-amber-900 border border-amber-300' },
  received: { label: 'รับครบ', cls: 'bg-emerald-100 text-emerald-900 border border-emerald-300' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-800 border border-rose-300' },
}

export const canCreatePurchasing = (role) => ['purchasing', 'store', 'admin'].includes(role)
export const canReceiveGoods = (role) => ['purchasing', 'store', 'admin'].includes(role)

export const EMPTY_ITEM = { item_name: '', quantity: '', unit: '', price: '' }
export const itemsValid = (items) =>
  items.length > 0 && items.every((i) => i.item_name.trim() && Number(i.quantity) > 0)
export const itemsTotal = (items) =>
  items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0)

export const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'

export const formatDateTimeParts = (ts) => {
  if (!ts) return { date: '-', time: '' }
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { date: '-', time: '' }
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { date, time }
}

/**
 * คำนวณสถานะการจ่ายเงินจริงของ PO (รองรับมัดจำ แบ่งจ่ายหลายงวด และจ่ายเต็มจำนวน)
 * ป้องกันกรณีจ่ายบางส่วนแล้วระบบแจ้งว่า "ชำระครบแล้ว" ก่อนจ่ายหมดจริง
 */
export function computePoPaymentSummary(po, items = [], payments = []) {
  if (!po) {
    return {
      totalPayable: 0,
      paidAmount: 0,
      remainingAmount: 0,
      isPaidInFull: false,
      hasPartialPaid: false,
      effectivePaymentStatus: 'รอชำระเงิน',
    }
  }

  const poItems = items.length > 0 ? items : po.purchase_order_items || []
  const totalPayable = computePoTotals(po, poItems).netPayable

  const hasTxList = Array.isArray(payments) && payments.length > 0
  const paidFromTx = hasTxList
    ? round2(payments.reduce((s, p) => s + Number(p.amount_paid ?? p.amount ?? 0), 0))
    : 0
  const paidFromPo = round2(po.deposit_paid_amount || 0)
  const paidAmount = hasTxList ? paidFromTx : paidFromPo

  const computedRemaining = totalPayable > 0 ? Math.max(0, round2(totalPayable - paidAmount)) : 0

  let isPaidInFull = false
  if (totalPayable > 0) {
    if (paidAmount > 0) {
      isPaidInFull = computedRemaining <= 0.05
    } else {
      isPaidInFull = po.payment_status === 'ชำระครบแล้ว'
    }
  } else {
    isPaidInFull = po.payment_status === 'ชำระครบแล้ว'
  }

  const remainingAmount = isPaidInFull ? 0 : computedRemaining
  const hasPartialPaid = !isPaidInFull && paidAmount > 0
  const effectivePaymentStatus = isPaidInFull
    ? 'ชำระครบแล้ว'
    : hasPartialPaid
    ? 'จ่ายมัดจำแล้ว'
    : po.payment_status === 'ยกเลิก' || po.status === 'cancelled'
    ? 'ยกเลิก'
    : 'รอชำระเงิน'

  return {
    totalPayable,
    paidAmount,
    remainingAmount,
    isPaidInFull,
    hasPartialPaid,
    effectivePaymentStatus,
  }
}
