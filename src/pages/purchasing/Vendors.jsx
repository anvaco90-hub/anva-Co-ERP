import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  fetchUnifiedVendors,
  upsertUnifiedContactFromLegacy,
} from '../../lib/contactsSync'
import { useAuth } from '../../context/AuthContext'
import { canCreatePurchasing, PO_STATUS } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import { Building2, Edit3, Mail, Printer, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

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

  // จัดการการแก้ไขผู้ขาย และ พิมพ์หน้าซอง
  const [editingVendor, setEditingVendor] = useState(null)
  const [selectedVendorForEnvelope, setSelectedVendorForEnvelope] = useState(null)
  const [editBusy, setEditBusy] = useState(false)

  const load = useCallback(async () => {
    const [vendorsRes, posRes] = await Promise.all([
      fetchUnifiedVendors()
        .then((data) => ({ data, error: null }))
        .catch((err) => ({ data: [], error: err })),
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

    const vendorPayload = {
      vendor_code: form.vendor_code.trim(),
      vendor_name: form.vendor_name.trim(),
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      tax_id: form.tax_id || null,
      address: form.address || null,
    }
    const { data: insertedVendor, error: insErr } = await supabase
      .from('vendors')
      .insert(vendorPayload)
      .select()
      .maybeSingle()
    if (!insErr) {
      await upsertUnifiedContactFromLegacy({
        role: 'vendor',
        record: insertedVendor || vendorPayload,
      })
    }
    if (insErr) return setError(insErr.code === '23505' ? 'รหัสผู้ขายนี้ถูกใช้แล้ว' : 'เพิ่มผู้ขายไม่สำเร็จ')
    setSuccess(`เพิ่มผู้ขาย "${form.vendor_name}" เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    setForm(EMPTY)
    setFormErrors({})
    load()
  }

  async function saveEdit() {
    if (!editingVendor || !editingVendor.vendor_name?.trim()) return
    setEditBusy(true)
    const editPayload = {
      vendor_code: editingVendor.vendor_code?.trim(),
      vendor_name: editingVendor.vendor_name?.trim(),
      contact_person: editingVendor.contact_person || null,
      phone: editingVendor.phone || null,
      tax_id: editingVendor.tax_id || null,
      address: editingVendor.address || null,
    }

    let updErr = null
    let syncedRecord = editPayload
    if (editingVendor.isContactOnly) {
      const { data: insertedLeg, error: insLegErr } = await supabase
        .from('vendors')
        .insert(editPayload)
        .select()
        .maybeSingle()
      updErr = insLegErr || null
      if (insertedLeg) syncedRecord = insertedLeg
    } else {
      const targetVendorId = editingVendor.legacyVendorId || editingVendor.id
      const { error: uErr } = await supabase
        .from('vendors')
        .update(editPayload)
        .eq('id', targetVendorId)
      updErr = uErr || null
      syncedRecord = { ...editPayload, id: targetVendorId }
    }

    if (!updErr) {
      await upsertUnifiedContactFromLegacy({
        role: 'vendor',
        record: syncedRecord,
        previousName: editingVendor._originalName || '',
      })
    }

    setEditBusy(false)
    if (updErr) {
      setError('แก้ไขข้อมูลผู้ขายไม่สำเร็จ')
      return
    }
    setSuccess(`บันทึกข้อมูล "${editingVendor.vendor_name}" เรียบร้อยแล้ว`)
    setEditingVendor(null)
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = rows.filter((v) =>
    !q || `${v.vendor_code} ${v.vendor_name} ${v.contact_person} ${v.phone}`.toLowerCase().includes(q)
  )

  return (
    <div className="space-y-4 max-w-5xl pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <span>ทะเบียนคู่ค้า / ร้านค้า (Vendors)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">บันทึกข้อมูลร้านค้า พร้อมประวัติการสั่งซื้อ จัดการแก้ไข และพิมพ์จ่าหน้าซอง</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input text-xs max-w-xs"
            placeholder="ค้นหารหัส / ชื่อร้านค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link
            to="/contacts?role=vendor"
            className="btn-ghost !py-1.5 text-xs text-sky-700 dark:text-sky-400 whitespace-nowrap"
          >
            ไปที่สมุดรายชื่อคู่ค้า →
          </Link>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">{success}</div>}

      {/* แบบฟอร์มเพิ่มผู้ขายใหม่ */}
      {canEdit && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm pb-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>เพิ่มผู้ขาย / ร้านค้าใหม่</span>
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <input
                className={fieldErrorClass(formErrors.vendor_code, "input text-xs w-full font-mono")}
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
            <input className="input text-xs font-mono" placeholder="เลขประจำตัวผู้เสียภาษี" value={form.tax_id} onChange={set('tax_id')} />
            <div className="md:col-span-3">
              <input className="input text-xs w-full" placeholder="ที่อยู่ร้านค้า / จัดส่ง" value={form.address} onChange={set('address')} />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                className="btn-primary !py-1.5 text-xs cursor-pointer"
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
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">ไม่พบข้อมูลผู้ขาย</div>
        ) : (
          filtered.map((v) => {
            const pos = vendorPos[v.id] || []
            const isExpanded = expandedVendorId === v.id
            const totalVendorSpend = pos.reduce((s, p) => s + Number(p.total_amount || 0), 0)

            return (
              <div key={v.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800">
                        {v.vendor_code}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white text-base">{v.vendor_name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                      {v.contact_person && <span>ผู้ติดต่อ: <b>{v.contact_person}</b></span>}
                      {v.phone && <span>โทร: <b>{v.phone}</b></span>}
                      {v.tax_id && <span>เลขภาษี: <b className="font-mono">{v.tax_id}</b></span>}
                    </div>
                    {v.address && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{v.address}</div>}
                  </div>

                  {/* สรุปยอดและปุ่มจัดการ */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-right mr-2">
                      <div className="text-xs text-slate-500 dark:text-slate-400">สั่งซื้อแล้ว {pos.length} ครั้ง</div>
                      <div className="font-bold font-mono text-sm text-slate-900 dark:text-white tabular-nums">{baht(totalVendorSpend)} บาท</div>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditingVendor({ ...v, _originalName: v.vendor_name })}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
                        title="แก้ไขข้อมูลผู้ขาย"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>แก้ไข</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedVendorForEnvelope(v)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
                      title="พิมพ์จ่าหน้าซองจดหมายถึงผู้ขายรายนี้"
                    >
                      <Mail className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>พิมพ์หน้าซอง</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedVendorId(isExpanded ? null : v.id)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'ซ่อนประวัติ' : 'ประวัติสั่งซื้อ'}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* ประวัติการสั่งซื้อจากร้านค้านี้ (เมื่อกดขยาย) */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                      ประวัติการจัดซื้อจากร้าน {v.vendor_name} ({pos.length} รายการ):
                    </div>
                    {pos.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">ยังไม่เคยมีประวัติการสั่งซื้อจากร้านค้านี้</p>
                    ) : (
                      <div className="space-y-2">
                        {pos.map((p) => (
                          <div key={p.id} className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-1.5">
                              <div className="flex items-center gap-2">
                                <Link to={`/purchasing/po/${p.id}`} className="font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
                                  {p.po_no}
                                </Link>
                                <span className="text-slate-500 dark:text-slate-400">· วันที่: {p.order_date}</span>
                                <span className="text-slate-600 dark:text-slate-300">· โครงการ: {p.projects?.project_code} {p.projects?.project_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">{baht(p.total_amount)} บาท</span>
                                <Badge map={PO_STATUS} status={p.status} />
                              </div>
                            </div>

                            {/* รายการสินค้าที่ซื้อใน PO นั้น */}
                            {p.purchase_order_items && p.purchase_order_items.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {p.purchase_order_items.map((it, idx) => (
                                  <span key={idx} className="rounded-md bg-white dark:bg-slate-900 px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200">
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

      {/* Modal แก้ไขข้อมูลผู้ขาย */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>แก้ไขข้อมูลผู้ขาย / ร้านค้า</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">รหัสผู้ขาย</label>
                <input
                  className="input w-full font-mono"
                  value={editingVendor.vendor_code || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, vendor_code: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">ชื่อผู้ขาย / ร้านค้า *</label>
                <input
                  className="input w-full"
                  value={editingVendor.vendor_name || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, vendor_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">ผู้ติดต่อ</label>
                  <input
                    className="input w-full"
                    value={editingVendor.contact_person || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, contact_person: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">เบอร์โทรศัพท์</label>
                  <input
                    className="input w-full"
                    value={editingVendor.phone || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">เลขประจำตัวผู้เสียภาษี</label>
                <input
                  className="input w-full font-mono"
                  value={editingVendor.tax_id || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, tax_id: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">ที่อยู่ร้านค้า / ผู้ขาย</label>
                <textarea
                  rows={2}
                  className="input w-full leading-relaxed"
                  value={editingVendor.address || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, address: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="btn-ghost !py-1.5 text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={editBusy}
                onClick={saveEdit}
                className="btn-primary !py-1.5 text-xs"
              >
                {editBusy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal พิมพ์หน้าซองจดหมายถึงผู้ขาย */}
      {selectedVendorForEnvelope && (
        <EnvelopePrintModal
          po={{ custom_vendor_name: selectedVendorForEnvelope.vendor_name, vendors: selectedVendorForEnvelope }}
          onClose={() => setSelectedVendorForEnvelope(null)}
        />
      )}
    </div>
  )
}
