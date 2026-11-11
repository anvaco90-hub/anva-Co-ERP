import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, canCreatePurchasing } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'
import AuditPanel from './AuditPanel'

export default function PRDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canCreatePurchasing(profile.role)
  const [pr, setPr] = useState(null)
  const [items, setItems] = useState([])
  const [pos, setPos] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('purchase_requisitions')
        .select('*, projects(project_code, project_name), creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
        .eq('id', id).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('item_name'),
      supabase.from('purchase_orders').select('id, po_no').eq('pr_id', id),
    ]).then(([a, b, c]) => {
      if (a.error) return setError('ไม่พบใบขอซื้อ')
      setPr(a.data); setItems(b.data ?? []); setPos(c.data ?? [])
    })
  }, [id])

  async function remove() {
    if (!confirm('ลบใบขอซื้อนี้? (ประวัติการลบจะถูกเก็บไว้)')) return
    const { error } = await supabase.rpc('delete_purchase_requisition', { p_pr_id: id, p_reason: null })
    if (error) return setError(error.message)
    navigate('/purchasing')
  }

  if (!pr) return <p className={error ? 'text-red-600' : 'text-steel-500'}>{error || 'กำลังโหลด...'}</p>

  return (
    <div className="max-w-3xl">
      <Link to="/purchasing" className="text-sm text-steel-500 underline">← กลับ</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{pr.pr_no}</h2>
          <div className="text-sm text-steel-500">{pr.projects?.project_code} {pr.projects?.project_name} · {pr.request_date}</div>
          <div className="mt-1"><Badge map={PR_STATUS} status={pr.status} /></div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {pr.status === 'pending' && <Link to={`/purchasing/po/new?pr=${pr.id}`} className="btn-primary">สร้างใบสั่งซื้อจากใบนี้</Link>}
            {pr.status !== 'cancelled' && <Link to={`/purchasing/pr/${pr.id}/edit`} className="btn-ghost">แก้ไข</Link>}
            <button className="btn-ghost text-red-700" onClick={remove}>ลบ</button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 overflow-x-auto rounded-lg bg-white p-5">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-steel-500"><th className="py-2">รายการ</th><th className="text-right">จำนวน</th><th>หน่วย</th><th className="text-right">ราคาประมาณ</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="border-b last:border-0"><td className="py-2">{i.item_name}</td><td className="text-right">{i.quantity}</td><td className="pl-2">{i.unit}</td><td className="text-right">{baht(i.estimated_price)}</td></tr>
          ))}</tbody>
        </table>
        {pr.notes && <p className="mt-3 text-sm text-steel-500">หมายเหตุ: {pr.notes}</p>}
      </div>
      {pos.length > 0 && <p className="mt-3 text-sm">ใบสั่งซื้อที่เกี่ยวข้อง: {pos.map((p) => <Link key={p.id} to={`/purchasing/po/${p.id}`} className="mr-2 underline">{p.po_no}</Link>)}</p>}
      <AuditPanel docId={pr.id} row={pr} />
    </div>
  )
}
