import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht, canEditProjects } from '../../lib/projects'
import StatusBadge from './StatusBadge'

export default function ProjectList() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, project_code, project_name, client_name, budget_total, status')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError('โหลดรายการโครงการไม่สำเร็จ')
        else setProjects(data)
        setLoading(false)
      })
  }, [])

  const q = search.trim().toLowerCase()
  const shown = projects.filter(
    (p) => !q || [p.project_code, p.project_name, p.client_name].some((v) => (v ?? '').toLowerCase().includes(q))
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">โครงการ</h1>
        {canEditProjects(profile.role) && (
          <Link to="/projects/new" className="btn-primary">+ สร้างโครงการ</Link>
        )}
      </div>

      <input
        className="input mt-4 max-w-sm"
        placeholder="ค้นหารหัส / ชื่อโครงการ / ลูกค้า"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-4 text-steel-500">กำลังโหลด...</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-lg bg-white p-5 text-steel-500">ไม่พบโครงการ</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block rounded-lg border-l-4 border-hivis bg-white p-4 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-steel-500">{p.project_code}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-1 font-semibold">{p.project_name}</div>
                <div className="text-sm text-steel-500">{p.client_name || 'ไม่ระบุลูกค้า'}</div>
                <div className="mt-3 text-sm">งบรวม <b>{baht(p.budget_total)}</b> บาท</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
