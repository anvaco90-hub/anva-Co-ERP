import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { STATUS_LABELS } from '../../lib/projects'

const EMPTY = {
  project_code: '', project_name: '', client_name: '', site_address: '',
  budget_total: 0, start_date: '', end_date: '', status: 'planning',
}

// ใช้ทั้งสร้าง (/projects/new) และแก้ไข (/projects/:id/edit)
export default function ProjectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    supabase.from('projects').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setError('โหลดข้อมูลโครงการไม่สำเร็จ')
      setForm({ ...EMPTY, ...data, start_date: data.start_date ?? '', end_date: data.end_date ?? '' })
    })
  }, [id])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function save() {
    setBusy(true)
    setError('')
    const payload = {
      ...form,
      project_code: form.project_code.trim(),
      project_name: form.project_name.trim(),
      budget_total: Number(form.budget_total) || 0,
      start_date: form.start_date || null, // ช่องวันที่ว่างต้องส่งเป็น null
      end_date: form.end_date || null,
    }
    delete payload.id
    delete payload.created_at

    const q = id
      ? supabase.from('projects').update(payload).eq('id', id).select('id').single()
      : supabase.from('projects').insert(payload).select('id').single()
    const { data, error } = await q
    setBusy(false)

    if (error) {
      setError(error.code === '23505' ? 'รหัสโครงการนี้ถูกใช้แล้ว' : 'บันทึกไม่สำเร็จ (ตรวจสอบสิทธิ์การใช้งาน)')
      return
    }
    navigate(`/projects/${data.id}`)
  }

  const valid = form.project_code.trim() && form.project_name.trim()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">{id ? 'แก้ไขโครงการ' : 'สร้างโครงการ'}</h1>
      <div className="mt-5 grid gap-4 rounded-lg bg-white p-5 md:grid-cols-2">
        <label className="text-sm">รหัสโครงการ *
          <input className="input mt-1" value={form.project_code} onChange={set('project_code')} />
        </label>
        <label className="text-sm">ชื่อโครงการ *
          <input className="input mt-1" value={form.project_name} onChange={set('project_name')} />
        </label>
        <label className="text-sm">ชื่อลูกค้า
          <input className="input mt-1" value={form.client_name ?? ''} onChange={set('client_name')} />
        </label>
        <label className="text-sm">งบประมาณรวม (บาท)
          <input className="input mt-1" type="number" min="0" step="0.01" value={form.budget_total} onChange={set('budget_total')} />
        </label>
        <label className="text-sm md:col-span-2">ที่อยู่หน้างาน
          <textarea className="input mt-1" rows={2} value={form.site_address ?? ''} onChange={set('site_address')} />
        </label>
        <label className="text-sm">วันเริ่มงาน
          <input className="input mt-1" type="date" value={form.start_date} onChange={set('start_date')} />
        </label>
        <label className="text-sm">วันสิ้นสุด
          <input className="input mt-1" type="date" value={form.end_date} onChange={set('end_date')} />
        </label>
        <label className="text-sm">สถานะ
          <select className="input mt-1" value={form.status} onChange={set('status')}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy || !valid}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        <Link to={id ? `/projects/${id}` : '/projects'} className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}
