import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'

const EMPTY_LINE = { item_id: '', quantity: '' }

export default function IssueForm() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [stock, setStock] = useState([]) // สต็อกของโครงการที่เลือก (เฉพาะที่มีของ)
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').neq('status', 'completed')
      .order('project_code').then(({ data }) => setProjects(data ?? []))
  }, [])

  useEffect(() => {
    setLines([{ ...EMPTY_LINE }]); setStock([])
    if (!projectId) return
    supabase.from('inventory_stock')
      .select('qty_on_hand, avg_unit_cost, inventory_items(id, item_name, unit)')
      .eq('project_id', projectId).gt('qty_on_hand', 0)
      .then(({ data }) => setStock((data ?? []).sort((a, b) => a.inventory_items.item_name.localeCompare(b.inventory_items.item_name))))
  }, [projectId])

  const byItem = Object.fromEntries(stock.map((s) => [s.inventory_items.id, s]))
  const upd = (i, k, v) => setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))

  const ids = lines.map((l) => l.item_id)
  const duplicate = new Set(ids).size !== ids.length
  const linesOk = lines.length > 0 && lines.every((l) => {
    const s = byItem[l.item_id]
    return s && Number(l.quantity) > 0 && Number(l.quantity) <= Number(s.qty_on_hand)
  })
  const estCost = lines.reduce((sum, l) => sum + (byItem[l.item_id] ? Number(l.quantity || 0) * Number(byItem[l.item_id].avg_unit_cost) : 0), 0)

  async function save() {
    setBusy(true); setError('')
    // RPC: ตัดสต็อกและลงบัญชีใน transaction เดียว (ต้นทุนคำนวณฝั่งฐานข้อมูล)
    const { error } = await supabase.rpc('confirm_stock_issue', {
      p_project_id: projectId,
      p_notes: notes || null,
      p_items: lines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/store/issues')
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">เบิกวัสดุเข้าหน้างาน</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        <label className="block text-sm">โครงการ *
          <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">-- เลือกโครงการ --</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
          </select>
        </label>

        {projectId && stock.length === 0 && <p className="text-sm text-steel-500">โครงการนี้ยังไม่มีวัสดุคงเหลือในสโตร์</p>}

        {stock.length > 0 && (
          <div className="space-y-2 text-sm">
            <div>รายการเบิก *</div>
            {lines.map((l, i) => {
              const s = byItem[l.item_id]
              const over = s && Number(l.quantity) > Number(s.qty_on_hand)
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-steel-100 p-2 md:grid-cols-[1fr_8rem_auto]">
                  <select className="input col-span-2 md:col-span-1" value={l.item_id} onChange={(e) => upd(i, 'item_id', e.target.value)}>
                    <option value="">-- เลือกวัสดุ --</option>
                    {stock.map((x) => <option key={x.inventory_items.id} value={x.inventory_items.id}>{x.inventory_items.item_name} (คงเหลือ {x.qty_on_hand} {x.inventory_items.unit})</option>)}
                  </select>
                  <input className={`input ${over ? 'border-red-500' : ''}`} type="number" min="0" step="0.01" placeholder="จำนวน" value={l.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} />
                  <button type="button" className="text-red-700 underline" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>ลบ</button>
                  {over && <p className="col-span-2 text-xs text-red-600 md:col-span-3">เกินจำนวนคงเหลือ</p>}
                </div>
              )
            })}
            <div className="flex items-center justify-between">
              <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>+ เพิ่มรายการ</button>
              <span>ต้นทุนโดยประมาณ <b>{baht(estCost)}</b> บาท</span>
            </div>
            {duplicate && <p className="text-xs text-red-600">มีวัสดุซ้ำกันในใบเบิก — รวมเป็นรายการเดียว</p>}
          </div>
        )}

        <label className="block text-sm">หมายเหตุ (เช่น เบิกไปใช้งานส่วนไหน)
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4">
        <button className="btn-primary" onClick={save} disabled={busy || !projectId || !linesOk || duplicate}>
          {busy ? 'กำลังบันทึก...' : 'ยืนยันเบิกวัสดุ'}
        </button>
        <p className="mt-2 text-xs text-steel-500">ระบบตัดสต็อกและลงบัญชีอัตโนมัติ: Dr.ต้นทุนวัสดุ / Cr.วัสดุคงเหลือ</p>
      </div>
    </div>
  )
}
