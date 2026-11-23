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
