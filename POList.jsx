import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PO_STATUS, canCreatePurchasing } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'

export default function POList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('purchase_orders')
      .select('id, po_no, order_date, total_amount, status, vendors(vendor_name), projects(project_code)')
      .order('order_date', { ascending: false }).order('po_no', { ascending: false })
      .then(({ data }) => setRows(data ?? []))
  }, [])

  return (
    <div>
      {canCreatePurchasing(profile.role) && <Link to="/purchasing/po/new" className="btn-primary">+ สร้างใบสั่งซื้อ (ไม่ผ่าน PR)</Link>}
      {!rows ? <p className="mt-4 text-steel-500">กำลังโหลด...</p> : rows.length === 0 ? (
        <p className="mt-4 rounded-lg bg-white p-5 text-steel-500">ยังไม่มีใบสั่งซื้อ</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/purchasing/po/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-4 hover:shadow-md">
                <div>
                  <div className="font-semibold">{r.po_no}</div>
                  <div className="text-sm text-steel-500">{r.vendors?.vendor_name} · {r.projects?.project_code} · {r.order_date}</div>
                </div>
                <div className="flex items-center gap-3"><b>{baht(r.total_amount)}</b><Badge map={PO_STATUS} status={r.status} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
