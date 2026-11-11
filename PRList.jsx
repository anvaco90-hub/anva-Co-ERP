import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, canCreatePurchasing } from '../../lib/purchasing'
import Badge from './Badge'

export default function PRList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('purchase_requisitions')
      .select('id, pr_no, request_date, status, projects(project_code, project_name)')
      .order('request_date', { ascending: false }).order('pr_no', { ascending: false })
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data)))
  }, [])

  return (
    <div>
      {canCreatePurchasing(profile.role) && <Link to="/purchasing/pr/new" className="btn-primary">+ สร้างใบขอซื้อ</Link>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!rows ? <p className="mt-4 text-steel-500">กำลังโหลด...</p> : rows.length === 0 ? (
        <p className="mt-4 rounded-lg bg-white p-5 text-steel-500">ยังไม่มีใบขอซื้อ</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/purchasing/pr/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-4 hover:shadow-md">
                <div>
                  <div className="font-semibold">{r.pr_no}</div>
                  <div className="text-sm text-steel-500">{r.projects?.project_code} {r.projects?.project_name} · {r.request_date}</div>
                </div>
                <Badge map={PR_STATUS} status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
