import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import ItemsEditor from './ItemsEditor'

// สร้าง PO จาก PR (?pr=<id>) หรือสั่งตรง / แก้ไข PO (/purchasing/po/:id/edit)
export default function POForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prId = params.get('pr')

  const [pr, setPr] = useState(null)
  const [po, setPo] = useState(null)
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [projectId, setProjectId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('vendors').select('id, vendor_code, vendor_name').order('vendor_code').then(({ data }) => setVendors(data ?? []))
    if (id) {
      Promise.all([
        supabase.from('purchase_orders').select('*, projects(project_code, project_name)').eq('id', id).single(),
        supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
      ]).then(([a, b]) => {
        if (a.error) return setError('ไม่พบใบสั่งซื้อ')
        if (a.data.status === 'cancelled') return setError('ใบสั่งซื้อที่ยกเลิกแล้วแก้ไขไม่ได้')
        setPo(a.data); setVendorId(a.data.vendor_id)
        setItems((b.data ?? []).map((i) => ({ id: i.id, item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.unit_price), received: Number(i.qty_received) })))
      })
    } else if (prId) {
      Promise.all([
        supabase.from('purchase_requisitions').select('id, pr_no, status, projects(project_code, project_name)').eq('id', prId).single(),
        supabase.from('purchase_requisition_items').select('*').eq('pr_id', prId),
      ]).then(([a, b]) => {
        if (a.error || a.data.status !== 'pending') return setError('ใบขอซื้อไม่พร้อมสั่งซื้อ (ไม่พบหรือสั่งซื้อไปแล้ว)')
        setPr(a.data)
        setItems((b.data ?? []).map((i) => ({ item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.estimated_price ?? '') })))
      })
    } else {
      supabase.from('projects').select('id, project_code, project_name').neq('status', 'completed').order('project_code').then(({ data }) => setProjects(data ?? []))
    }
  }, [id, prId])

  async function save() {
    setBusy(true); setError('')
    const p_items = items.map((i) => ({ id: i.id, item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.price) || 0 }))
    const { data, error } = id
      ? await supabase.rpc('update_purchase_order', { p_po_id: id, p_vendor_id: vendorId, p_items })
      : await supabase.rpc('create_purchase_order', { p_pr_id: prId || null, p_project_id: prId ? null : projectId, p_vendor_id: vendorId, p_items })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/purchasing/po/${id ?? data}`)
  }

  const ready = vendorId && itemsValid(items) && (id ? po : prId ? pr : projectId)
  const hasReceived = items.some((i) => Number(i.received) > 0)

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">{id ? `แก้ไขใบสั่งซื้อ ${po?.po_no ?? ''}` : `สร้างใบสั่งซื้อ ${pr ? `จาก ${pr.pr_no}` : ''}`}</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        {id ? (
          po && <p className="text-sm">โครงการ: <b>{po.projects?.project_code} {po.projects?.project_name}</b></p>
        ) : pr ? (
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
        </label>
        <div className="text-sm">รายการสั่งซื้อ *<div className="mt-1"><ItemsEditor items={items} onChange={setItems} priceLabel="ราคา/หน่วย" /></div></div>
        {hasReceived && <p className="text-xs text-steel-500">รายการที่รับของแล้ว แก้ได้เฉพาะจำนวน (ห้ามต่ำกว่าที่รับแล้ว) เพื่อให้สต็อกและบัญชีที่ลงไปแล้วยังตรงกัน</p>}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy || !ready}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        <Link to={id ? `/purchasing/po/${id}` : '/purchasing/po'} className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}
