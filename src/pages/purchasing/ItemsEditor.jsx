import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsTotal } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import { Trash2 } from 'lucide-react'

// ตารางแก้รายการวัสดุ ใช้ร่วมกันทั้งใบขอซื้อและใบสั่งซื้อ
// มีระบบ Auto-suggest ดึงวัสดุเก่าจากระบบ + เติมหน่วยเลขอัตโนมัติ
export default function ItemsEditor({ items, onChange, priceLabel, showErrors = false }) {
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    supabase
      .from('inventory_items')
      .select('id, item_code, item_name, unit, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setCatalog(data ?? []))
  }, [])

  const upd = (i, k, v) => {
    const updated = items.map((it, idx) => {
      if (idx !== i) return it
      const next = { ...it, [k]: v }
      // บังคับจำนวนพัสดุให้เป็นจำนวนเต็ม (Integer)
      if (k === 'quantity') {
        const cleanInt = v === '' ? '' : String(Math.max(0, parseInt(v, 10) || 0))
        next.quantity = cleanInt
      }
      // ถ้าเลือกหรือพิมพ์ชื่อที่ตรงกับ catalog ให้ช่วยดึงหน่วย ราคาเฉลี่ย และรหัสสินค้ามาอัตโนมัติ
      if (k === 'item_name') {
        const found = catalog.find((c) => c.item_name.toLowerCase() === String(v || '').trim().toLowerCase())
        if (found) {
          next.item_id = found.id
          if (!next.unit && found.unit) next.unit = found.unit
          if (!next.price && found.avg_unit_cost) next.price = String(found.avg_unit_cost)
        } else {
          next.item_id = null
        }
      }
      return next
    })
    onChange(updated)
  }

  const handleSelectCatalogItem = (index, catalogItem) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        item_id: catalogItem.id,
        item_name: catalogItem.item_name,
        unit: catalogItem.unit || it.unit || '',
        price: catalogItem.avg_unit_cost ? String(catalogItem.avg_unit_cost) : it.price || '',
      }
    })
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      {/* Datalist แนะนำชื่อวัสดุที่มีอยู่ในระบบ */}
      <datalist id="catalog-items-list">
        {catalog.map((c) => (
          <option key={c.id} value={c.item_name}>
            [{c.item_code}] {c.unit ? `(${c.unit})` : ''}
          </option>
        ))}
      </datalist>

      {items.map((it, i) => {
        const locked = Number(it.received) > 0
        const matched = catalog.find((c) => c.item_name.toLowerCase() === String(it.item_name || '').trim().toLowerCase())
        const nameEmpty = showErrors && !String(it.item_name || '').trim()
        const qtyEmpty = showErrors && (!it.quantity || Number(it.quantity) <= 0)
        const priceEmpty = showErrors && (it.price === '' || isNaN(Number(it.price)))

        return (
          <div key={i} className={`rounded-md border p-2.5 shadow-sm transition ${
            nameEmpty || qtyEmpty || priceEmpty ? 'border-rose-300 bg-rose-50/20' : 'border-steel-200 bg-white'
          }`}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_6rem_6rem_9rem_auto] items-start">
              {/* ช่องชื่อวัสดุ */}
              <div className="col-span-2 md:col-span-1 relative">
                <input
                  list="catalog-items-list"
                  className={fieldErrorClass(nameEmpty, `input w-full ${matched ? 'pr-24' : ''}`)}
                  placeholder="พิมพ์หรือเลือกชื่อวัสดุในระบบ..."
                  disabled={locked}
                  value={it.item_name}
                  onChange={(e) => upd(i, 'item_name', e.target.value)}
                />
                {matched && (
                  <span className="absolute right-2 top-2 rounded bg-sky-100 px-2 py-0.5 text-[10px] font-mono font-bold text-sky-800 pointer-events-none">
                    {matched.item_code}
                  </span>
                )}
                {nameEmpty && <FieldError error="ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุชื่อวัสดุ)" />}
              </div>

              {/* ช่องจำนวน */}
              <div>
                <input
                  className={fieldErrorClass(qtyEmpty, 'input w-full font-mono font-bold')}
                  type="number"
                  min={locked ? it.received : 1}
                  step="1"
                  placeholder="จำนวน (ตัวเลข)"
                  value={it.quantity}
                  onChange={(e) => upd(i, 'quantity', e.target.value)}
                />
                {qtyEmpty && <FieldError error="ช่องว่างนะ (จำนวน > 0)" />}
              </div>

              {/* ช่องหน่วย */}
              <div>
                <input
                  className="input w-full"
                  placeholder="หน่วย"
                  disabled={locked}
                  value={it.unit}
                  onChange={(e) => upd(i, 'unit', e.target.value)}
                />
              </div>

              {/* ช่องราคา */}
              <div>
                <input
                  className={fieldErrorClass(priceEmpty, 'input w-full')}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={priceLabel}
                  disabled={locked}
                  value={it.price}
                  onChange={(e) => upd(i, 'price', e.target.value)}
                />
                {priceEmpty && <FieldError error="ช่องว่างนะ (ระบุราคา)" />}
              </div>

              {/* ปุ่มลบ */}
              <div className="pt-2">
                {locked ? (
                  <span className="text-xs text-steel-500 whitespace-nowrap">รับแล้ว {it.received}</span>
                ) : (
                  <button
                    type="button"
                    className="h-8 px-2.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl transition cursor-pointer border border-rose-200 dark:border-rose-900 shadow-2xs flex items-center justify-center gap-1 font-bold text-xs disabled:opacity-25"
                    onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                    disabled={items.length === 1}
                    title="ลบแถวนี้"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>ลบ</span>
                  </button>
                )}
              </div>
            </div>

            {/* แถบแจ้งเตือนเมื่อวัสดุมีอยู่ในระบบ */}
            {matched && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-steel-500">
                <span className="font-semibold text-emerald-700">พัสดุตรงกับรหัส {matched.item_code}</span>
                {matched.avg_unit_cost ? <span>· ราคาเฉลี่ยเดิม {baht(matched.avg_unit_cost)} บาท</span> : null}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          className="btn-ghost !py-1 text-xs"
          onClick={() => onChange([...items, { ...EMPTY_ITEM }])}
        >
          + เพิ่มรายการวัสดุ
        </button>
        <span className="text-sm">
          มูลค่ารวม: <b className="text-ink">{baht(itemsTotal(items))}</b> บาท
        </span>
      </div>
    </div>
  )
}
