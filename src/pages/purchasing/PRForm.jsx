import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import ItemsEditor from './ItemsEditor'
import { FieldError } from '../../components/FieldError'

// สร้าง (/purchasing/pr/new) และแก้ไข (/purchasing/pr/:id/edit) ใบขอซื้อ
export default function PRForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))

    // โหลดรายการจากใบเสนอราคาถ้ามีการส่งต่อมา (Quotation -> PR)
    const qId = params.get('quotation_id')
    if (qId && !id) {
      Promise.all([
        supabase.from('quotations').select('project_id').eq('id', qId).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', qId),
      ]).then(([qRes, itemsRes]) => {
        if (qRes.data?.project_id) setProjectId(qRes.data.project_id)
        if (itemsRes.data && itemsRes.data.length > 0) {
          setItems(itemsRes.data.map((i) => ({
            item_name: i.item_name,
            quantity: String(i.quantity || 1),
            unit: i.unit || 'ชุด',
            price: String(i.unit_price || ''),
          })))
        }
      })
    }

    if (!id) return
    Promise.all([
      supabase.from('purchase_requisitions').select('*').eq('id', id).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('item_name'),
    ]).then(([a, b]) => {
      if (a.error) return setError('ไม่พบใบขอซื้อ')
      setProjectId(a.data.project_id || ''); setStatus(a.data.status)
      setItems((b.data ?? []).map((i) => ({ item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.estimated_price ?? '') })))
    })
  }, [id, params])

  async function save() {
    setError('')
    const newErrors = {}

    const hasEmptyItem = !items || items.length === 0 || !items.some((i) => i.item_name && i.item_name.trim())
    const hasInvalidQty = items.some((i) => !i.quantity || Number(i.quantity) <= 0 || isNaN(Number(i.quantity)))
    const hasInvalidPrice = items.some((i) => i.price === '' || isNaN(Number(i.price)))

    if (hasEmptyItem || hasInvalidQty || hasInvalidPrice) {
      setShowItemErrors(true)
      newErrors.items = 'รายการวัสดุมีช่องที่ยังไม่กรอก ช่องว่างนะ (กรุณาระบุชื่อ จำนวน และราคาประมาณให้ครบถ้วน)'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setError('⚠️ ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      return
    }

    setBusy(true)
    const p_items = items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, estimated_price: Number(i.price) || 0 }))
    const { data, error } = id
      ? await supabase.rpc('update_purchase_requisition', { p_pr_id: id, p_project_id: projectId || null, p_notes: null, p_items })
      : await supabase.rpc('create_purchase_requisition', { p_project_id: projectId || null, p_notes: null, p_items })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/purchasing/pr/${id ?? data}`)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">{id ? 'แก้ไขใบขอซื้อ' : 'สร้างใบขอซื้อ'}</h2>
      <div className="mt-4 space-y-4 rounded-lg bg-white p-5">
        <label className="block text-sm font-medium">โครงการ / จุดประสงค์
          <select className="input mt-1" value={projectId} disabled={status === 'ordered'} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">🏢 ของกลางบริษัท / สต็อกส่วนกลาง (ไม่ระบุโครงการ)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>)}
          </select>
          {status === 'ordered' && <span className="text-xs text-steel-500">ออกใบสั่งซื้อแล้ว เปลี่ยนโครงการไม่ได้</span>}
        </label>
        <div className="text-sm font-medium">
          รายการวัสดุ *
          <div className="mt-1 font-normal">
            <ItemsEditor
              items={items}
              onChange={(newItems) => {
                setItems(newItems)
                if (errors.items) setErrors((prev) => ({ ...prev, items: '' }))
              }}
              priceLabel="ราคาประมาณ/หน่วย"
              showErrors={showItemErrors}
            />
            <FieldError error={errors.items} />
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกใบขอซื้อ'}</button>
        <Link to={id ? `/purchasing/pr/${id}` : '/purchasing'} className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}