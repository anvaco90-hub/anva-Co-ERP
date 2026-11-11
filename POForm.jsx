import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import ItemsEditor from './ItemsEditor'

// สร้าง PO จาก PR (?pr=<id>) — โหลดรายการจาก PR มาให้ใส่ราคา — หรือสั่งตรงโดยเลือกโครงการเอง
export default function POForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prId = params.get('pr')

  const [pr, setPr] = useState(null)
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [projectId, setProjectId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('vendors').select('id, vendor_code, vendor_name').order('vendor_code').then(({ data }) => setVendors(data ?? []))
    if (prId) {
      Promise.all([
        supabase.from('purchase_requisitions').select('id, pr_no, status, projects(project_code, project_name)').eq('id', prId).single(),
        supabase.from('purchase_requisition_items').select('*').eq('pr_id', prId),
      ]).then(([a, b]) => {
        if (a.error || a.data.status !== 'pending') return setError('ใบขอซื้อไม่พร้อมสั่งซื้อ (ไม่พบหรือถูกสั่งซื้อไปแล้ว)')
        setPr(a.data)
        setItems((b.data ?? []).map((i) => ({ item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.estimated_price ?? '') })))
      })
    } else {
      supabase.from('projects').select('id, project_code, project_name').neq('status', 'completed').order('project_code').then(({ data }) => setProjects(data ?? []))
    }
  }, [prId])

  async function save() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_pr_id: prId || null,
      p_project_id: prId ? null : projectId,
      p_vendor_id: vendorId,
      p_items: items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.price) || 0 })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/purchasing/po/${data}`)
  }

  const ready = vendorId && itemsValid(items) && (prId ? pr : projectId)

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">สร้างใบสั่งซื้อ {pr && `จาก ${pr.pr_no}`}</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        {pr ? (
          <p className="text-sm">โครงการ: <b>{pr.projects?.project_code} {pr.projects?.project_name}</b></p>
        ) : !prId && (
          <label className="block text-sm">โครงการ *
            <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">-- เลือกโครงการ --</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm">ผู้ขาย *
          <select className="input mt-1" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">-- เลือกผู้ขาย --</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_code} {v.vendor_name}</option>)}
          </select>
          {vendors.length === 0 && <span className="text-xs text-steel-500">ยังไม่มีผู้ขาย — เพิ่มที่แท็บ "ผู้ขาย" ก่อน</span>}
        </label>
        <div className="text-sm">รายการสั่งซื้อ *<div className="mt-1"><ItemsEditor items={items} onChange={setItems} priceLabel="ราคา/หน่วย" /></div></div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy || !ready}>{busy ? 'กำลังบันทึก...' : 'บันทึกใบสั่งซื้อ'}</button>
        <Link to="/purchasing/po" className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}
