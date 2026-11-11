import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canCreatePurchasing } from '../../lib/purchasing'

const EMPTY = { vendor_code: '', vendor_name: '', contact_person: '', phone: '', tax_id: '' }

export default function Vendors() {
  const { profile } = useAuth()
  const canEdit = canCreatePurchasing(profile.role)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    supabase.from('vendors').select('*').order('vendor_code').then(({ data }) => setRows(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function add() {
    setError('')
    const { error } = await supabase.from('vendors').insert({
      vendor_code: form.vendor_code.trim(), vendor_name: form.vendor_name.trim(),
      contact_person: form.contact_person || null, phone: form.phone || null, tax_id: form.tax_id || null,
    })
    if (error) return setError(error.code === '23505' ? 'รหัสผู้ขายนี้ถูกใช้แล้ว' : 'เพิ่มผู้ขายไม่สำเร็จ')
    setForm(EMPTY); load()
  }

  return (
    <div className="max-w-3xl">
      {canEdit && (
        <div className="grid gap-2 rounded-lg bg-white p-4 md:grid-cols-3">
          <input className="input" placeholder="รหัสผู้ขาย *" value={form.vendor_code} onChange={set('vendor_code')} />
          <input className="input md:col-span-2" placeholder="ชื่อผู้ขาย *" value={form.vendor_name} onChange={set('vendor_name')} />
          <input className="input" placeholder="ผู้ติดต่อ" value={form.contact_person} onChange={set('contact_person')} />
          <input className="input" placeholder="โทรศัพท์" value={form.phone} onChange={set('phone')} />
          <input className="input" placeholder="เลขผู้เสียภาษี" value={form.tax_id} onChange={set('tax_id')} />
          <div className="md:col-span-3"><button className="btn-primary" onClick={add} disabled={!form.vendor_code.trim() || !form.vendor_name.trim()}>+ เพิ่มผู้ขาย</button></div>
          {error && <p className="text-sm text-red-600 md:col-span-3">{error}</p>}
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {rows.length === 0 && <li className="rounded-lg bg-white p-5 text-steel-500">ยังไม่มีผู้ขาย</li>}
        {rows.map((v) => (
          <li key={v.id} className="rounded-lg bg-white p-4 text-sm">
            <b>{v.vendor_code}</b> {v.vendor_name}
            <div className="text-steel-500">{[v.contact_person, v.phone, v.tax_id].filter(Boolean).join(' · ')}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
