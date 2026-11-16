import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canCreatePurchasing, PO_STATUS } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'
import { FieldError, fieldErrorClass } from '../../components/FieldError'

const EMPTY = { vendor_code: '', vendor_name: '', contact_person: '', phone: '', tax_id: '', address: '' }

export default function Vendors() {
  const { profile } = useAuth()
  const canEdit = canCreatePurchasing(profile.role)
  const [rows, setRows] = useState([])
  const [vendorPos, setVendorPos] = useState({}) // vendorId -> list of POs
  const [form, setForm] = useState(EMPTY)
  const [formErrors, setFormErrors] = useState({})
  const [expandedVendorId, setExpandedVendorId] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    const [vendorsRes, posRes] = await Promise.all([
      supabase.from('vendors').select('*').order('vendor_code'),
      supabase.from('purchase_orders')
        .select('id, po_no, vendor_id, order_date, total_amount, status, projects(project_code, project_name), purchase_order_items(item_name, quantity, unit, unit_price)')
        .neq('status', 'cancelled')
        .order('order_date', { ascending: false }),
    ])

    if (vendorsRes.error) {
      setError('โหลดข้อมูลผู้ขายไม่สำเร็จ')
      return
    }
    setRows(vendorsRes.data ?? [])

    // จัดกลุ่ม PO ตามผู้ขาย
    const map = {}
    ;(posRes.data ?? []).forEach((po) => {
      if (po.vendor_id) {
        if (!map[po.vendor_id]) map[po.vendor_id] = []
        map[po.vendor_id].push(po)
      }
    })
    setVendorPos(map)
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value })
    if (formErrors[k]) {
      setFormErrors((prev) => ({ ...prev, [k]: '' }))
    }
  }

  async function add() {
    setError('')
    setSuccess('')
    const newErrors = {}

    if (!form.vendor_code.trim()) {
      newErrors.vendor_code = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุรหัสผู้ขาย เช่น V-001)'
    }
    if (!form.vendor_name.trim()) {
      newErrors.vendor_name = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุชื่อผู้ขาย / ร้านค้า)'
    }

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors)
      return
    }

    const { error: insErr } = await supabase.from('vendors').insert({
      vendor_code: form.vendor_code.trim(),
      vendor_name: form.vendor_name.trim(),
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      tax_id: form.tax_id || null,
    })
    if (insErr) return setError(insErr.code === '23505' ? 'รหัสผู้ขายนี้ถูกใช้แล้ว' : 'เพิ่มผู้ขายไม่สำเร็จ')
    setSuccess(`เพิ่มผู้ขาย "${form.vendor_name}" เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    setForm(EMPTY)
    setFormErrors({})
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = rows.filter((v) =>
    !q || `${v.vendor_code} ${v.vendor_name} ${v.contact_person} ${v.phone}`.toLowerCase().includes(q)
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">ทะเบียนคู่ค้า / ร้านค้า (Vendors)</h2>
          <p className="text-xs text-steel-500">บันทึกข้อมูลร้านค้า พร้อมประวัติการสั่งซื้อและราคาวัสดุที่เคยจัดหา</p>
        </div>
        <input
          className="input text-xs max-w-xs"
          placeholder="ค้นหารหัส / ชื่อร้านค้า..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

      {/* แบบฟอร์มเพิ่มผู้ขายใหม่ */}
      {canEdit && (
        <div className="rounded-lg border border-steel-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-ink text-sm pb-2 border-b border-steel-100">➕ เพิ่มผู้ขาย / ร้านค้าใหม่</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <input
                className={fieldErrorClass(formErrors.vendor_code, "input text-xs w-full")}
                placeholder="รหัสผู้ขาย * (เช่น V-001)"
                value={form.vendor_code}
                onChange={set('vendor_code')}
              />
              <FieldError error={formErrors.vendor_code} />
            </div>
            <div className="md:col-span-2">
              <input
                className={fieldErrorClass(formErrors.vendor_name, "input text-xs w-full")}
                placeholder="ชื่อผู้ขาย / ร้านค้า *"
                value={form.vendor_name}
                onChange={set('vendor_name')}
              />
              <FieldError error={formErrors.vendor_name} />
            </div>
            <input className="input text-xs" placeholder="ผู้ติดต่อ" value={form.contact_person} onChange={set('contact_person')} />
            <input className="input text-xs" placeholder="เบอร์โทรศัพท์" value={form.phone} onChange={set('phone')} />
            <input className="input text-xs" placeholder="เลขประจำตัวผู้เสียภาษี" value={form.tax_id} onChange={set('tax_id')} />
            <div className="md:col-span-3 flex justify-end">
              <button
                className="btn-primary !py-1.5 text-xs"
                onClick={add}
              >
                + บันทึกผู้ขาย
              </button>
            </div>
          </div>
        </div>
      )}

      {/* รายการผู้ขาย */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-steel-500">ไม่พบข้อมูลผู้ขาย</div>
        ) : (
          filtered.map((v) => {
            const pos = vendorPos[v.id] || []
            const isExpanded = expandedVendorId === v.id
            const totalVendorSpend = pos.reduce((s, p) => s + Number(p.total_amount || 0), 0)

            return (
              <div key={v.id} className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm hover:border-steel-300 transition">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                        {v.vendor_code}
                      </span>
                      <span className="font-bold text-ink text-base">{v.vendor_name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-steel-500">
                      {v.contact_person && <span>👤 ผู้ติดต่อ: {v.contact_person}</span>}
                      {v.phone && <span>📞 โทร: {v.phone}</span>}
                      {v.tax_id && <span>เลขผู้เสียภาษี: {v.tax_id}</span>}
                    </div>
                  </div>

                  {/* สรุปยอดและปุ่มดูประวัติ */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-steel-500">สั่งซื้อแล้ว {pos.length} ครั้ง</div>
                      <div className="font-bold text-sm text-ink">{baht(totalVendorSpend)} บาท</div>
                    </div>
                    <button
                      onClick={() => setExpandedVendorId(isExpanded ? null : v.id)}
                      className="rounded-md border border-steel-200 bg-steel-50 px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100"
                    >
                      {isExpanded ? '▲ ซ่อนประวัติ' : '▼ ประวัติสั่งซื้อ'}
                    </button>
                  </div>
                </div>

                {/* ประวัติการสั่งซื้อจากร้านค้านี้ (เมื่อกดขยาย) */}
                {isExpanded && (
                  <div className="mt-4 border-t border-steel-100 pt-3">
                    <div className="text-xs font-bold text-steel-700 mb-2">
                      📦 ประวัติการจัดซื้อจากร้าน {v.vendor_name} ({pos.length} รายการ):
                    </div>
                    {pos.length === 0 ? (
                      <p className="text-xs text-steel-400 italic">ยังไม่เคยมีประวัติการสั่งซื้อจากร้านค้านี้</p>
                    ) : (
                      <div className="space-y-2">
                        {pos.map((p) => (
                          <div key={p.id} className="rounded-md border border-steel-100 bg-steel-50 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/50 pb-1.5">
                              <div className="flex items-center gap-2">
                                <Link to={`/purchasing/po/${p.id}`} className="font-bold text-emerald-700 hover:underline">
                                  {p.po_no}
                                </Link>
                                <span className="text-steel-500">· วันที่: {p.order_date}</span>
                                <span className="text-steel-600">· โครงการ: {p.projects?.project_code} {p.projects?.project_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-ink">{baht(p.total_amount)} บาท</span>
                                <Badge map={PO_STATUS} status={p.status} />
                              </div>
                            </div>

                            {/* รายการสินค้าที่ซื้อใน PO นั้น */}
                            {p.purchase_order_items && p.purchase_order_items.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {p.purchase_order_items.map((it, idx) => (
                                  <span key={idx} className="rounded bg-white px-2 py-0.5 border border-steel-200 text-[11px] text-steel-700">
                                    {it.item_name} × {it.quantity} {it.unit} @ <b>{baht(it.unit_price)} บ.</b>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
