import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import ItemsEditor from './ItemsEditor'

export default function PRForm() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').neq('status', 'completed')
      .order('project_code').then(({ data }) => setProjects(data ?? []))
  }, [])

  async function save() {
    setBusy(true); setError('')
    // ใช้ RPC เพื่อให้รันเลขเอกสารและบันทึกหัว+รายการใน transaction เดียว
    const { data, error } = await supabase.rpc('create_purchase_requisition', {
      p_project_id: projectId,
      p_notes: notes || null,
      p_items: items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, estimated_price: Number(i.price) || 0 })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/purchasing/pr/${data}`)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">สร้างใบขอซื้อ</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        <label className="block text-sm">โครงการ *
          <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">-- เลือกโครงการ --</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
          </select>
        </label>
        <div className="text-sm">รายการวัสดุ *<div className="mt-1"><ItemsEditor items={items} onChange={setItems} priceLabel="ราคาประมาณ/หน่วย" /></div></div>
        <label className="block text-sm">หมายเหตุ
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy || !projectId || !itemsValid(items)}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        <Link to="/purchasing" className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}
