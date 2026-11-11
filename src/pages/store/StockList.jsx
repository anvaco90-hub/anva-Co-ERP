import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'

// สต็อกหลัก: ยอดรวมต่อวัสดุ + กดแถวเพื่อดูว่าของที่เหลือมาจากโครงการต้นทางไหนบ้าง
export default function StockList() {
  const [items, setItems] = useState(null)
  const [lots, setLots] = useState([])
  const [cats, setCats] = useState([])
  const [cat, setCat] = useState('')
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('inventory_items')
        .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost, reorder_point, category_id, item_categories(name)').order('item_name'),
      supabase.from('stock_lots').select('item_id, source_project_id, qty_remaining, projects(project_code, project_name)').gt('qty_remaining', 0),
      supabase.from('item_categories').select('id, name').order('sort_order'),
    ]).then(([a, b, c]) => {
      if (a.error) return setError('โหลดสต็อกไม่สำเร็จ')
      setItems(a.data); setLots(b.data ?? []); setCats(c.data ?? [])
    })
  }, [])

  if (!items) return <p className="text-steel-500">{error || 'กำลังโหลด...'}</p>

  const isLow = (i) => Number(i.reorder_point) > 0 && Number(i.qty_on_hand) <= Number(i.reorder_point)
  const q = search.trim().toLowerCase()
  const shown = items.filter((i) =>
    (!cat || i.category_id === cat) && (!onlyLow || isLow(i)) &&
    (!q || `${i.item_name} ${i.item_code}`.toLowerCase().includes(q)))
  const totalValue = shown.reduce((s, i) => s + Number(i.qty_on_hand) * Number(i.avg_unit_cost), 0)
  const lowCount = items.filter(isLow).length

  // รวมล็อตตามโครงการต้นทางของวัสดุที่เปิดดู
  const origins = (itemId) => {
    const m = new Map()
    lots.filter((l) => l.item_id === itemId).forEach((l) => {
      const k = l.source_project_id ?? 'none'
      const cur = m.get(k) ?? { name: l.projects ? `${l.projects.project_code} ${l.projects.project_name}` : 'ไม่ระบุ / ของกลาง', qty: 0 }
      cur.qty += Number(l.qty_remaining); m.set(k, cur)
    })
    return [...m.values()]
  }

  return (
    <div>
      {lowCount > 0 && (
        <div className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">
          มีวัสดุใกล้หมด <b>{lowCount}</b> รายการ
          <button className="ml-3 underline" onClick={() => setOnlyLow(!onlyLow)}>{onlyLow ? 'แสดงทั้งหมด' : 'แสดงเฉพาะที่ใกล้หมด'}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">ทุกหมวด</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input max-w-xs" placeholder="ค้นหารหัส / ชื่อวัสดุ" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <p className="mt-3 text-sm">มูลค่าสินค้าคงเหลือรวม (ที่แสดง) <b>{baht(totalValue)}</b> บาท · {shown.length} รายการ</p>

      {shown.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white p-5 text-steel-500">ไม่พบวัสดุ — วัสดุจะเข้าสโตร์เมื่อรับของจากใบสั่งซื้อ</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg bg-white p-4">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-steel-500">
              <th className="py-2">วัสดุ</th><th>หมวด</th><th className="text-right">คงเหลือ</th><th>หน่วย</th>
              <th className="text-right">ราคา/หน่วย (เฉลี่ย)</th><th className="text-right">มูลค่า</th><th className="text-right">เตือนเมื่อ ≤</th>
            </tr></thead>
            <tbody>{shown.map((i) => (
              <Fragment key={i.id}>
                <tr className="cursor-pointer border-b hover:bg-steel-50" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  <td className="py-2">{open === i.id ? '▾' : '▸'} {i.item_name} <span className="text-xs text-steel-500">{i.item_code}</span></td>
                  <td>{i.item_categories?.name ?? '-'}</td>
                  <td className={`text-right font-semibold ${isLow(i) ? 'text-red-600' : ''}`}>
                    {i.qty_on_hand} {isLow(i) && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs">ใกล้หมด</span>}
                  </td>
                  <td className="pl-2">{i.unit}</td>
                  <td className="text-right">{baht(i.avg_unit_cost)}</td>
                  <td className="text-right">{baht(Number(i.qty_on_hand) * Number(i.avg_unit_cost))}</td>
                  <td className="text-right">{i.reorder_point || '-'}</td>
                </tr>
                {open === i.id && (
                  <tr className="border-b bg-steel-50">
                    <td colSpan={7} className="px-4 py-2">
                      <div className="text-xs text-steel-500">ของที่เหลืออยู่ แยกตามโครงการต้นทาง</div>
                      {origins(i.id).length === 0 ? <div className="text-sm">ไม่มีของคงเหลือ</div> : origins(i.id).map((o) => (
                        <div key={o.name} className="flex justify-between text-sm"><span>{o.name}</span>
                          <span>{o.qty} {i.unit} · {baht(o.qty * Number(i.avg_unit_cost))} บาท</span></div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
