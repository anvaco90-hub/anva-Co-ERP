import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime } from '../../lib/purchasing'

// ปรับปรุงสต็อก = เพิ่ม/แก้จำนวนคงเหลือของโครงการต้นทางนั้น (ต้องระบุเหตุผล และลงบัญชีส่วนต่างอัตโนมัติ)
export default function AdjustStock() {
  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [lots, setLots] = useState([])
  const [history, setHistory] = useState([])
  const [itemId, setItemId] = useState('')
  const [origin, setOrigin] = useState('') // '' = ไม่ระบุ/ของกลาง
  const [newQty, setNewQty] = useState('')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const loadHistory = useCallback(() => {
    supabase.from('stock_adjustments')
      .select('id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, inventory_items(item_name, unit), projects(project_code), creator:profiles!created_by(full_name)')
      .order('created_at', { ascending: false }).limit(30).then(({ data }) => setHistory(data ?? []))
  }, [])
  const loadItems = useCallback(() => {
    supabase.from('inventory_items').select('id, item_name, unit, avg_unit_cost').order('item_name').then(({ data }) => setItems(data ?? []))
  }, [])

  useEffect(() => {
    loadItems(); loadHistory()
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))
  }, [loadItems, loadHistory])

  useEffect(() => {
    setLots([]); setOrigin(''); setNewQty(''); setCost('')
    if (!itemId) return
    supabase.from('stock_lots').select('source_project_id, qty_remaining').eq('item_id', itemId).gt('qty_remaining', 0)
      .then(({ data }) => setLots(data ?? []))
  }, [itemId])

  const item = items.find((i) => i.id === itemId)
  const current = lots.filter((l) => (l.source_project_id ?? '') === origin).reduce((s, l) => s + Number(l.qty_remaining), 0)
  const diff = newQty === '' ? 0 : Number(newQty) - current
  const ready = itemId && newQty !== '' && Number(newQty) >= 0 && diff !== 0 && reason.trim()

  async function save() {
    setBusy(true); setError(''); setDone('')
    const { error } = await supabase.rpc('adjust_stock', {
      p_item_id: itemId, p_source_project_id: origin || null, p_new_qty: Number(newQty),
      p_unit_cost: cost === '' ? null : Number(cost), p_reason: reason,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDone('บันทึกการปรับปรุงสต็อกแล้ว'); setReason(''); setNewQty(''); setCost('')
    loadHistory()
    supabase.from('stock_lots').select('source_project_id, qty_remaining').eq('item_id', itemId).gt('qty_remaining', 0).then(({ data }) => setLots(data ?? []))
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-4 rounded-lg bg-white p-5 text-sm">
        <label className="block">วัสดุ *
          <select className="input mt-1" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">-- เลือกวัสดุ --</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.item_name} ({i.unit})</option>)}
          </select>
        </label>
        {item && (
          <>
            <label className="block">ของที่เหลือจากโครงการ (โครงการต้นทาง)
              <select className="input mt-1" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">ไม่ระบุ / ของกลาง</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
              </select>
            </label>
            <p>จำนวนคงเหลือปัจจุบัน (ต้นทางนี้): <b>{current}</b> {item.unit}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label>จำนวนใหม่ที่ถูกต้อง *
                <input className="input mt-1" type="number" min="0" step="0.01" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
              </label>
              {diff > 0 && (
                <label>ต้นทุน/หน่วยของส่วนที่เพิ่ม (เว้นว่าง = ใช้เฉลี่ย {baht(item.avg_unit_cost)})
                  <input className="input mt-1" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
                </label>
              )}
            </div>
            {diff !== 0 && <p className={diff > 0 ? 'text-green-700' : 'text-red-600'}>{diff > 0 ? 'เพิ่ม' : 'ลด'} {Math.abs(diff)} {item.unit}</p>}
            <label className="block">เหตุผล *
              <textarea className="input mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น นับสต็อกจริงไม่ตรง / รับของเหลือคืนจากหน้างาน" />
            </label>
            <button className="btn-primary" onClick={save} disabled={busy || !ready}>{busy ? 'กำลังบันทึก...' : 'บันทึกการปรับปรุง'}</button>
            <p className="text-xs text-steel-500">ระบบลงบัญชีส่วนต่างอัตโนมัติ (บัญชี 5900 ปรับปรุงสต็อก) ผู้ทำรายการและเวลาถูกบันทึกไว้</p>
          </>
        )}
        {error && <p className="text-red-600">{error}</p>}
        {done && <p className="text-green-700">{done}</p>}
      </div>

      <h3 className="mt-6 font-semibold">ประวัติการปรับปรุงล่าสุด</h3>
      <ul className="mt-2 space-y-2">
        {history.length === 0 && <li className="rounded-lg bg-white p-4 text-sm text-steel-500">ยังไม่มีประวัติ</li>}
        {history.map((h) => (
          <li key={h.id} className="rounded-lg bg-white p-4 text-sm">
            <b>{h.adj_no}</b> · {h.inventory_items?.item_name} · ต้นทาง {h.projects?.project_code ?? 'ไม่ระบุ'} · {h.qty_before} → <b>{h.qty_after}</b> {h.inventory_items?.unit}
            <div className="text-steel-500">{h.reason} — โดย {h.creator?.full_name ?? '-'} เมื่อ {fmtDateTime(h.created_at)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
