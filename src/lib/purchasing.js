export const PR_STATUS = {
  pending: { label: 'รอสั่งซื้อ', cls: 'bg-steel-100 text-steel-700' },
  ordered: { label: 'สั่งซื้อแล้ว', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-800' },
}
export const PO_STATUS = {
  open: { label: 'รอรับของ', cls: 'bg-steel-100 text-steel-700' },
  partial: { label: 'รับบางส่วน', cls: 'bg-hivis/30 text-ink' },
  received: { label: 'รับครบ', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-800' },
}

// ต้องตรงกับสิทธิ์ในฟังก์ชัน SQL (003)
export const canCreatePurchasing = (role) => ['purchasing', 'admin'].includes(role)
export const canReceiveGoods = (role) => ['purchasing', 'store', 'admin'].includes(role)

export const EMPTY_ITEM = { item_name: '', quantity: '', unit: '', price: '' }
export const itemsValid = (items) =>
  items.length > 0 && items.every((i) => i.item_name.trim() && Number(i.quantity) > 0)
export const itemsTotal = (items) =>
  items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0)

// แสดงวันเวลาแบบไทย เช่น 11 พ.ย. 2569 14:30
export const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
