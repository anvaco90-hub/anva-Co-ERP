import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import ItemsEditor from './ItemsEditor'

// สร้าง (/purchasing/pr/new) และแก้ไข (/purchasing/pr/:id/edit) ใบขอซื้อ
export default function PRForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))
    if (!id) return
    Promise.all([
      supabase.from('purchase_requisitions').select('*').eq('id', id).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('item_name'),
    ]).then(([a, b]) => {
      if (a.error) return setError('ไม่พบใบขอซื้อ')
      setProjectId(a.data.project_id); setNotes(a.data.notes ?? ''); setStatus(a.data.status)
      setItems((b.data ?? []).map((i) => ({ item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.estimated_price ?? '') })))
    })
  }, [id])

  async function save() {
    setBusy(true); setError('')
    const p_items = items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, estimated_price: Number(i.price) || 0 }))
    const { data, error } = id
      ? await supabase.rpc('update_purchase_requisition', { p_pr_id: id, p_project_id: projectId, p_notes: notes || null, p_items })
      : await supabase.rpc('create_purchase_requisition', { p_project_id: projectId, p_notes: notes || null, p_items })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/purchasing/pr/${id ?? data}`)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">{id ? 'แก้ไขใบขอซื้อ' : 'สร้างใบขอซื้อ'}</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        <label className="block text-sm">โครงการ *
          <select className="input mt-1" value={projectId} disabled={status === 'ordered'} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">-- เลือกโครงการ --</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
          </select>
          {status === 'ordered' && <span className="text-xs text-steel-500">ออกใบสั่งซื้อแล้ว เปลี่ยนโครงการไม่ได้</span>}
        </label>
        <div className="text-sm">รายการวัสดุ *<div className="mt-1"><ItemsEditor items={items} onChange={setItems} priceLabel="ราคาประมาณ/หน่วย" /></div></div>
        <label className="block text-sm">หมายเหตุ
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy || !projectId || !itemsValid(items)}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        <Link to={id ? `/purchasing/pr/${id}` : '/purchasing'} className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}
