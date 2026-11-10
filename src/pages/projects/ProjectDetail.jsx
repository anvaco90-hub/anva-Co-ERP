import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { BUDGET_CATEGORIES, baht, canEditProjects } from '../../lib/projects'
import StatusBadge from './StatusBadge'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canEditProjects(profile.role)

  const [project, setProject] = useState(null)
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_budget_items').select('*').eq('project_id', id).order('category'),
    ])
    if (p.error) return setError('ไม่พบโครงการ หรือไม่มีสิทธิ์เข้าถึง')
    setProject(p.data)
    setItems(b.data ?? [])
  }, [id])

  useEffect(() => { load() }, [load])

  async function addItem() {
    setError('')
    const { error } = await supabase.from('project_budget_items').insert({
      project_id: id, category: category.trim(), budgeted_amount: Number(amount) || 0,
    })
    if (error) return setError('เพิ่มงบรายหมวดไม่สำเร็จ')
    setCategory(''); setAmount(''); load()
  }

  async function removeItem(itemId) {
    if (!confirm('ลบรายการงบนี้?')) return
    const { error } = await supabase.from('project_budget_items').delete().eq('id', itemId)
    if (error) return setError('ลบไม่สำเร็จ')
    load()
  }

  async function removeProject() {
    if (!confirm('ลบโครงการนี้? งบรายหมวดจะถูกลบไปด้วย')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    // โครงการที่มีเอกสารอ้างอิง (ขั้นถัด ๆ ไป) จะลบไม่ได้ ให้เปลี่ยนสถานะแทน
    if (error) return setError('ลบไม่สำเร็จ — หากมีเอกสารอ้างอิงอยู่ ให้เปลี่ยนสถานะเป็น "เสร็จสิ้น" แทน')
    navigate('/projects')
  }

  if (error && !project) return <p className="text-red-600">{error}</p>
  if (!project) return <p className="text-steel-500">กำลังโหลด...</p>

  const allocated = items.reduce((s, i) => s + Number(i.budgeted_amount), 0)
  const total = Number(project.budget_total)
  const pct = total > 0 ? Math.min(100, (allocated / total) * 100) : 0
  const over = allocated > total

  return (
    <div className="max-w-4xl">
      <Link to="/projects" className="text-sm text-steel-500 underline">← กลับรายการโครงการ</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-steel-500">{project.project_code}</div>
          <h1 className="text-2xl font-bold">{project.project_name}</h1>
          <div className="mt-1"><StatusBadge status={project.status} /></div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/projects/${id}/edit`} className="btn-ghost">แก้ไข</Link>
            <button className="btn-ghost text-red-700" onClick={removeProject}>ลบ</button>
          </div>
        )}
      </div>

      <dl className="mt-5 grid gap-3 rounded-lg bg-white p-5 text-sm md:grid-cols-2">
        <div><dt className="text-steel-500">ลูกค้า</dt><dd>{project.client_name || '-'}</dd></div>
        <div><dt className="text-steel-500">ที่อยู่หน้างาน</dt><dd>{project.site_address || '-'}</dd></div>
        <div><dt className="text-steel-500">วันเริ่มงาน</dt><dd>{project.start_date || '-'}</dd></div>
        <div><dt className="text-steel-500">วันสิ้นสุด</dt><dd>{project.end_date || '-'}</dd></div>
      </dl>

      {/* ภาพรวมงบ: ต้นทุนจริงจะแสดงเมื่อทำโมดูลบัญชี (ขั้นที่ 5) */}
      <section className="mt-5 rounded-lg bg-white p-5">
        <h2 className="font-semibold">ภาพรวมงบประมาณ</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><div className="text-steel-500">งบรวม</div><div className="text-lg font-bold">{baht(total)}</div></div>
          <div><div className="text-steel-500">จัดสรรรายหมวดแล้ว</div><div className={`text-lg font-bold ${over ? 'text-red-600' : ''}`}>{baht(allocated)}</div></div>
          <div><div className="text-steel-500">ต้นทุนจริง</div><div className="text-steel-500">รอเชื่อมบัญชี (ขั้นที่ 5)</div></div>
        </div>
        <div className="mt-3 h-2 rounded bg-steel-100">
          <div className={`h-2 rounded ${over ? 'bg-red-500' : 'bg-hivis'}`} style={{ width: `${pct}%` }} />
        </div>
        {over && <p className="mt-2 text-sm text-red-600">งบรายหมวดรวมเกินงบรวมของโครงการ</p>}
      </section>

      <section className="mt-5 rounded-lg bg-white p-5">
        <h2 className="font-semibold">งบประมาณรายหมวด</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-steel-500">ยังไม่มีงบรายหมวด</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-steel-500"><th className="py-2">หมวด</th><th className="py-2 text-right">งบ (บาท)</th><th /></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2">{i.category}</td>
                    <td className="py-2 text-right">{baht(i.budgeted_amount)}</td>
                    <td className="py-2 text-right">
                      {canEdit && <button className="text-red-700 underline" onClick={() => removeItem(i.id)}>ลบ</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <input className="input max-w-[14rem]" list="budget-cats" placeholder="หมวดงบ" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="budget-cats">{BUDGET_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            <input className="input max-w-[10rem]" type="number" min="0" step="0.01" placeholder="จำนวนเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn-primary" onClick={addItem} disabled={!category.trim() || !amount}>เพิ่ม</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </div>
  )
}
