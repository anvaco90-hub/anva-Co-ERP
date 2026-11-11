import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { canIssueStock } from '../../lib/store'

export default function StockList() {
  const { profile } = useAuth()
  const canEdit = canIssueStock(profile.role)
  const [rows, setRows] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').order('project_code')
      .then(({ data }) => setProjects(data ?? []))
    supabase.from('inventory_stock')
      .select('id, project_id, qty_on_hand, avg_unit_cost, inventory_items(id, item_code, item_name, unit, reorder_point), projects(project_code, project_name)')
      .then(({ data, error }) => {
        if (error) return setError('โหลดสต็อกไม่สำเร็จ')
        setRows((data ?? []).sort((a, b) =>
          (a.projects?.project_code ?? '').localeCompare(b.projects?.project_code ?? '') ||
          (a.inventory_items?.item_name ?? '').localeCompare(b.inventory_items?.item_name ?? '')))
      })
  }, [])

  // จุดสั่งซื้อซ้ำเป็นของสินค้า (ใช้ร่วมทุกโครงการ)
  async function saveReorder(itemId, value) {
    setError('')
    const v = Number(value) || 0
    const { error } = await supabase.from('inventory_items').update({ reorder_point: v }).eq('id', itemId)
    if (error) return setError('บันทึกจุดสั่งซื้อซ้ำไม่สำเร็จ')
    setRows((rs) => rs.map((r) => (r.inventory_items.id === itemId ? { ...r, inventory_items: { ...r.inventory_items, reorder_point: v } } : r)))
  }

  if (!rows) return <p className="text-steel-500">{error || 'กำลังโหลด...'}</p>

  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) =>
    (!projectId || r.project_id === projectId) &&
    (!q || `${r.inventory_items?.item_name} ${r.inventory_items?.item_code}`.toLowerCase().includes(q)))
  const totalValue = shown.reduce((s, r) => s + Number(r.qty_on_hand) * Number(r.avg_unit_cost), 0)

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">ทุกโครงการ</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
        </select>
        <input className="input max-w-xs" placeholder="ค้นหารหัส / ชื่อวัสดุ" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-sm">มูลค่าสต็อกรวม (ที่แสดง) <b>{baht(totalValue)}</b> บาท</p>

      {shown.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white p-5 text-steel-500">ไม่พบสต็อก — สต็อกจะเพิ่มเมื่อรับของจากใบสั่งซื้อ</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg bg-white p-4">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-steel-500">
              <th className="py-2">โครงการ</th><th>วัสดุ</th><th className="text-right">คงเหลือ</th><th>หน่วย</th>
              <th className="text-right">ต้นทุนเฉลี่ย</th><th className="text-right">มูลค่า</th><th className="text-right">จุดสั่งซื้อซ้ำ</th>
            </tr></thead>
            <tbody>{shown.map((r) => {
              const it = r.inventory_items
              const low = Number(it.reorder_point) > 0 && Number(r.qty_on_hand) <= Number(it.reorder_point)
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.projects?.project_code}</td>
                  <td>{it.item_name} <span className="text-xs text-steel-500">{it.item_code}</span></td>
                  <td className={`text-right font-semibold ${low ? 'text-red-600' : ''}`}>
                    {r.qty_on_hand} {low && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs">ใกล้หมด</span>}
                  </td>
                  <td className="pl-2">{it.unit}</td>
                  <td className="text-right">{baht(r.avg_unit_cost)}</td>
                  <td className="text-right">{baht(Number(r.qty_on_hand) * Number(r.avg_unit_cost))}</td>
                  <td className="text-right">
                    {canEdit ? (
                      <input className="input ml-auto w-20 text-right" type="number" min="0" step="0.01"
                        defaultValue={it.reorder_point} onBlur={(e) => Number(e.target.value) !== Number(it.reorder_point) && saveReorder(it.id, e.target.value)} />
                    ) : it.reorder_point}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
