import { EMPTY_ITEM, itemsTotal } from '../../lib/purchasing'
import { baht } from '../../lib/projects'

// ตารางแก้รายการวัสดุ ใช้ร่วมกันทั้งใบขอซื้อและใบสั่งซื้อ
// รายการที่รับของแล้ว (received > 0) แก้ได้เฉพาะจำนวน (ห้ามต่ำกว่าที่รับแล้ว) และลบไม่ได้
export default function ItemsEditor({ items, onChange, priceLabel }) {
  const upd = (i, k, v) => onChange(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)))
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const locked = Number(it.received) > 0
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-steel-100 p-2 md:grid-cols-[1fr_6rem_6rem_9rem_auto]">
            <input className="input col-span-2 md:col-span-1" placeholder="ชื่อวัสดุ" disabled={locked} value={it.item_name} onChange={(e) => upd(i, 'item_name', e.target.value)} />
            <input className="input" type="number" min={locked ? it.received : 0} step="0.01" placeholder="จำนวน" value={it.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} />
            <input className="input" placeholder="หน่วย" disabled={locked} value={it.unit} onChange={(e) => upd(i, 'unit', e.target.value)} />
            <input className="input" type="number" min="0" step="0.01" placeholder={priceLabel} disabled={locked} value={it.price} onChange={(e) => upd(i, 'price', e.target.value)} />
            {locked
              ? <span className="text-xs text-steel-500">รับแล้ว {it.received}</span>
              : <button type="button" className="text-sm text-red-700 underline" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>ลบ</button>}
          </div>
        )
      })}
      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={() => onChange([...items, { ...EMPTY_ITEM }])}>+ เพิ่มรายการ</button>
        <span className="text-sm">รวม <b>{baht(itemsTotal(items))}</b> บาท</span>
      </div>
    </div>
  )
}
