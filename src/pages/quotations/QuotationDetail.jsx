import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { formatIntQty } from '../../lib/store'
import { uploadQuotationFile, openFile } from '../../lib/files'
import R2Image, { useFileUrl } from '../../components/R2Image'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  sent: { label: 'ส่งลูกค้าแล้ว (Sent)', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  approved: { label: 'ลูกค้าอนุมัติ (Approved)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'ปฏิเสธ (Rejected)', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  expired: { label: 'หมดอายุ (Expired)', color: 'bg-amber-100 text-amber-800 border-amber-300' },
}

export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // จัดการข้อมูลการเซ็น PO ของลูกค้า (Customer PO)
  const [showPoModal, setShowPoModal] = useState(false)
  const [showCustomerPoDoc, setShowCustomerPoDoc] = useState(false)
  const [customerPoNo, setCustomerPoNo] = useState('')
  const [customerPoDate, setCustomerPoDate] = useState('')
  const [customerSignerName, setCustomerSignerName] = useState('')
  const [customerPoFileUrl, setCustomerPoFileUrl] = useState('')
  const [poBusy, setPoBusy] = useState(false)
  const { url: customerPoPreviewUrl } = useFileUrl(quotation?.customer_po_file_url)

  const openPoModal = () => {
    setCustomerPoNo(quotation?.customer_po_no || '')
    setCustomerPoDate(quotation?.customer_po_date || new Date().toISOString().split('T')[0])
    setCustomerSignerName(quotation?.customer_signer_name || '')
    setCustomerPoFileUrl(quotation?.customer_po_file_url || '')
    setShowPoModal(true)
  }

  const handleSaveCustomerPo = async (e) => {
    e.preventDefault()
    if (!customerPoNo.trim()) {
      alert('กรุณาระบุเลขที่ใบสั่งซื้อของลูกค้า (Customer PO No.)')
      return
    }
    setPoBusy(true)
    try {
      const payload = {
        customer_po_no: customerPoNo.trim(),
        customer_po_date: customerPoDate || null,
        customer_signer_name: customerSignerName.trim() || null,
        customer_po_file_url: customerPoFileUrl || null,
        status: 'approved',
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('quotations').update(payload).eq('id', quotation.id)
      if (error) throw error
      setQuotation((prev) => ({ ...prev, ...payload }))
      setShowPoModal(false)
      alert('บันทึกการเซ็น PO ของลูกค้าเรียบร้อยแล้ว (สถานะเปลี่ยนเป็น: ลูกค้าอนุมัติ)')
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setPoBusy(false)
    }
  }

  const handleUploadPoFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPoBusy(true)
      const url = await uploadQuotationFile(file)
      setCustomerPoFileUrl(url)
    } catch (err) {
      alert('อัปโหลดไฟล์ไม่สำเร็จ')
    } finally {
      setPoBusy(false)
    }
  }

  const fetchDetail = async () => {
    setLoading(true)
    try {
      const [qRes, itemsRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, projects(id, project_code, project_name)')
          .eq('id', id)
          .single(),
        supabase
          .from('quotation_items')
          .select('*')
          .eq('quotation_id', id)
          .order('id', { ascending: true }),
      ])

      if (qRes.error) throw qRes.error
      setQuotation(qRes.data)
      setItems(itemsRes.data || [])
    } catch (err) {
      console.error('Failed to load quotation detail:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  const handleStatusChange = async (newStatus) => {
    if (!quotation) return
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', quotation.id)

      if (error) throw error
      setQuotation((prev) => ({ ...prev, status: newStatus }))
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`ยืนยันการลบใบเสนอราคา ${quotation?.quotation_no} หรือไม่? ข้อมูลจะถูกลบถาวร`)) {
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('quotations').delete().eq('id', quotation.id)
      if (error) throw error
      alert('ลบใบเสนอราคาเรียบร้อยแล้ว')
      navigate('/quotations')
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center text-steel-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-steel-300 border-t-sky-600 mb-2" />
          <p>กำลังโหลดข้อมูลใบเสนอราคา...</p>
        </div>
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="rounded-xl border border-steel-200 bg-white p-12 text-center text-steel-500">
        <p className="text-lg font-bold text-ink">ไม่พบข้อมูลใบเสนอราคา</p>
        <Link to="/quotations" className="mt-4 inline-block text-sky-600 hover:underline">
          ← กลับไปหน้ารายการใบเสนอราคา
        </Link>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[quotation.status] || {
    label: quotation.status,
    color: 'bg-steel-100 text-steel-700 border-steel-300',
  }

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation & Actions (จัดเลเอาต์เรียบหรู ไม่ซ้ำซ้อน ไม่ตกบรรทัด) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-steel-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight font-mono">
              {quotation.quotation_no}
            </h1>
            <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border shadow-2xs ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-xs text-steel-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <span>📅 สร้างเมื่อ:</span>
            <span className="font-semibold text-steel-700 dark:text-slate-300 font-mono">
              {new Date(quotation.created_at).toLocaleString('th-TH')}
            </span>
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ปุ่มพิมพ์ PDF (Primary Action เด่นชัด) */}
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
            title="พิมพ์เอกสารใบเสนอราคามาตรฐาน หรือบันทึก PDF"
          >
            <span>🖨️</span>
            <span>พิมพ์ใบเสนอราคา (PDF)</span>
          </button>

          {/* ปุ่มบันทึกการเซ็น PO ของลูกค้า */}
          <button
            type="button"
            onClick={openPoModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <span>✍️</span>
            <span>{quotation.customer_po_no ? 'แก้ไขข้อมูล PO ลูกค้า' : 'ลูกค้าเซ็นอนุมัติ / บันทึก PO'}</span>
          </button>

          {/* ปุ่มเชื่อมโยงส่งต่อฝ่ายจัดซื้อ */}
          <Link
            to={`/purchasing/po/new?quotation_id=${quotation.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 text-xs font-black shadow-xs transition"
          >
            <span>🛒</span>
            <span>ส่งต่อจัดซื้อ (เปิด PO)</span>
          </Link>

          <Link
            to={`/purchasing/pr/new?quotation_id=${quotation.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-steel-800 hover:bg-steel-700 text-white px-3 py-2 text-xs font-bold shadow-xs transition"
          >
            <span>📋</span>
            <span>เปิด PR</span>
          </Link>

          {/* Status Switcher */}
          <select
            value={quotation.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-steel-700 dark:text-slate-200 shadow-2xs focus:border-sky-500 focus:outline-none"
          >
            <option value="draft">ฉบับร่าง (Draft)</option>
            <option value="sent">ส่งลูกค้าแล้ว (Sent)</option>
            <option value="approved">ลูกค้าอนุมัติ (Approved)</option>
            <option value="rejected">ปฏิเสธ (Rejected)</option>
            <option value="expired">หมดอายุ (Expired)</option>
          </select>

          {/* Edit */}
          <Link
            to={`/quotations/${quotation.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-steel-700 dark:text-slate-200 shadow-2xs hover:bg-steel-50 dark:hover:bg-slate-700 transition"
          >
            <span>✏️</span>
            <span>แก้ไข</span>
          </Link>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 shadow-2xs hover:bg-rose-100 transition cursor-pointer"
          >
            <span>🗑️</span>
            <span>ลบ</span>
          </button>
        </div>
      </div>

      {/* 2. Visual Sales Workflow Stepper (เอกสารขาย -> ลูกค้า -> เซ็น PO -> จัดซื้อ) */}
      <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Step 1 */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-amber-300 font-bold text-xs shadow-xs">
              1
            </span>
            <div>
              <div className="font-bold text-steel-900">1. ออกใบเสนอราคา</div>
              <div className="text-[11px] text-steel-500 font-mono">{quotation.quotation_no}</div>
            </div>
          </div>

          <div className="hidden md:block text-steel-300 font-bold">➔</div>

          {/* Step 2 */}
          <div className="flex items-center gap-2.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs ${
              quotation.status !== 'draft' ? 'bg-sky-600 text-white shadow-xs' : 'bg-steel-100 text-steel-500'
            }`}>
              2
            </span>
            <div>
              <div className="font-bold text-steel-900">2. ส่งให้ลูกค้าพิจารณา</div>
              <div className="text-[11px] text-steel-500">
                {quotation.status === 'draft' ? 'สถานะ: ฉบับร่าง' : 'สถานะ: ส่งลูกค้าแล้ว'}
              </div>
            </div>
          </div>

          <div className="hidden md:block text-steel-300 font-bold">➔</div>

          {/* Step 3 */}
          <div className="flex items-center gap-2.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs ${
              quotation.customer_po_no || quotation.status === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-steel-100 text-steel-500'
            }`}>
              {quotation.customer_po_no ? '✓' : '3'}
            </span>
            <div>
              <div className="font-bold text-steel-900">3. ลูกค้าเซ็นอนุมัติ / PO</div>
              <div className="text-[11px] font-mono">
                {quotation.customer_po_no ? (
                  <span className="font-bold text-emerald-700">PO: {quotation.customer_po_no}</span>
                ) : (
                  <button
                    type="button"
                    onClick={openPoModal}
                    className="text-emerald-700 hover:underline font-bold"
                  >
                    + บันทึก PO ลูกค้า
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="hidden md:block text-steel-300 font-bold">➔</div>

          {/* Step 4 */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-xs shadow-xs">
              4
            </span>
            <div>
              <div className="font-bold text-steel-900">4. ส่งต่อจัดซื้อ & สโตร์</div>
              <div className="text-[11px]">
                <Link
                  to={`/purchasing/po/new?quotation_id=${quotation.id}`}
                  className="text-amber-800 hover:underline font-bold"
                >
                  คลิกเปิด PO ซื้อของ ➔
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Customer PO Signed Banner (แสดงเมื่อลูกค้าเซ็นรับแล้ว) */}
      {quotation.customer_po_no && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/40 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs text-xl">
              ✍️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-emerald-950 dark:text-emerald-200 text-base">ลูกค้าเซ็นอนุมัติ / ออกใบสั่งซื้อแล้ว</span>
                <span className="rounded-full bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  CUSTOMER PO VERIFIED
                </span>
              </div>
              <div className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300 font-mono flex flex-wrap gap-x-3 gap-y-1">
                <span>เลขที่ PO ลูกค้า: <b>{quotation.customer_po_no}</b></span>
                {quotation.customer_po_date && (
                  <span>วันที่ออก PO: <b>{new Date(quotation.customer_po_date).toLocaleDateString('th-TH')}</b></span>
                )}
                {quotation.customer_signer_name && (
                  <span>ผู้ลงนาม: <b>{quotation.customer_signer_name}</b></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCustomerPoDoc(true)}
              className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-emerald-900 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-slate-700 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>📄</span>
              <span>เปิดดูไฟล์ PO ลูกค้า</span>
            </button>
            <Link
              to={`/purchasing/po/new?quotation_id=${quotation.id}`}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 text-xs font-black shadow-xs transition flex items-center gap-1.5"
            >
              <span>🛒</span>
              <span>สั่งซื้อของตาม PO นี้</span>
            </Link>
          </div>
        </div>
      )}

      {/* Grid: ข้อมูลหลัก 2 คอลัมน์ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* คอลัมน์ซ้าย (กว้าง 2 ส่วน): ข้อมูลลูกค้า และ โครงการ */}
        <div className="lg:col-span-2 space-y-6">
          {/* ข้อมูลลูกค้า */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🏢</span>
              <span>ข้อมูลลูกค้า (Customer Details)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-steel-400">ชื่อลูกค้า / บริษัท</div>
                <div className="font-semibold text-ink text-base mt-0.5">{quotation.customer_name}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">สำนักงาน / สาขา</div>
                <div className="font-medium text-ink mt-0.5">{quotation.customer_branch || 'สำนักงานใหญ่'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">เลขประจำตัวผู้เสียภาษี (Tax ID)</div>
                <div className="font-mono text-ink mt-0.5">{quotation.customer_tax_id || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">รหัสไปรษณีย์</div>
                <div className="font-mono text-ink mt-0.5">{quotation.customer_postal_code || '-'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-steel-400">ที่อยู่</div>
                <div className="text-steel-700 mt-0.5">{quotation.customer_address || '-'}</div>
              </div>
            </div>
          </div>

          {/* ข้อมูลโครงการและคลังสินค้า */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🏗️</span>
              <span>โครงการและคลังสินค้าอ้างอิง</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-steel-400">โครงการ (Project Link)</div>
                <div className="font-semibold text-ink mt-0.5">
                  {quotation.projects ? (
                    <span className="text-sky-700">
                      [{quotation.projects.project_code}] {quotation.projects.project_name}
                    </span>
                  ) : (
                    <span className="text-steel-500 font-normal">🏢 ของกลางบริษัท / สต็อกส่วนกลาง</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-steel-400">เลขที่อ้างอิง (Ref No.)</div>
                <div className="font-medium text-ink mt-0.5">{quotation.ref_no || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">คลังสินค้าจ่ายวัสดุ</div>
                <div className="font-medium text-ink mt-0.5">{quotation.warehouse_name || 'สโตร์หลัก'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์ขวา (กว้าง 1 ส่วน): ข้อมูลเอกสาร & พนักงานขาย */}
        <div className="space-y-6">
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>📋</span>
              <span>ข้อมูลเอกสาร & การเงิน</span>
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">วันที่เสนอราคา:</span>
                <span className="font-semibold text-ink">{quotation.issue_date || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">กำหนดยืนราคา:</span>
                <span className="font-medium text-ink">{quotation.validity_days} วัน</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">วันครบกำหนด:</span>
                <span className="font-semibold text-amber-700">{quotation.expiry_date || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">พนักงานขาย:</span>
                <span className="font-semibold text-ink">👤 {quotation.sales_person || '-'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-steel-500">สกุลเงิน:</span>
                <span className="font-bold text-ink">{quotation.currency || 'THB'}</span>
              </div>
            </div>
          </div>

          {/* ลายเซ็นอิเล็กทรอนิกส์และเอกสารแนบ */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🖋️</span>
              <span>ลายเซ็นและเอกสารแนบ</span>
            </h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-steel-400 mb-1">ลายเซ็นอิเล็กทรอนิกส์ & ตราประทับ</div>
                {quotation.signature_url ? (
                  <div className="p-2 border border-steel-200 rounded-lg bg-steel-50 flex items-center justify-center">
                    <R2Image
                      fileKey={quotation.signature_url}
                      alt="Signature"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-steel-400 italic bg-steel-50 p-3 rounded text-center">
                    ไม่มีลายเซ็นแนบ
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs text-steel-400 mb-1">ไฟล์แนบเอกสารทั่วไป</div>
                {quotation.attachment_url ? (
                  <button
                    type="button"
                    onClick={() => openFile(quotation.attachment_url)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border border-steel-200 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-700 transition cursor-pointer text-left"
                  >
                    <span>📎</span>
                    <span className="truncate">เปิด / ดาวน์โหลดไฟล์แนบ</span>
                  </button>
                ) : (
                  <div className="text-xs text-steel-400 italic bg-steel-50 p-2 rounded text-center">
                    ไม่มีไฟล์แนบ
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-steel-50 px-5 py-3 border-b border-steel-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <span>📦</span>
            <span>รายการสินค้าและบริการ (Itemized Table)</span>
          </h2>
          <span className="text-xs text-steel-500 font-medium">
            ทั้งหมด {items.length} รายการ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-steel-600">
            <thead className="border-b border-steel-200 bg-steel-50/75 text-xs font-semibold text-steel-700">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">ชื่อสินค้า / รายละเอียด</th>
                <th className="px-4 py-3 text-right w-24">จำนวน</th>
                <th className="px-4 py-3 text-center w-20">หน่วย</th>
                <th className="px-4 py-3 text-right w-32">ราคาต่อหน่วย</th>
                <th className="px-4 py-3 text-right w-24">ส่วนลด (%)</th>
                <th className="px-4 py-3 text-right w-36">ราคารวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {items.map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-steel-50/50">
                  <td className="px-4 py-3 text-center text-xs text-steel-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{it.item_name}</div>
                    {it.description && (
                      <div className="text-xs text-steel-600 mt-1 whitespace-pre-line leading-relaxed font-normal bg-steel-50/70 p-2.5 rounded-xl border border-steel-100">
                        {it.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-steel-900">{formatIntQty(it.quantity)}</td>
                  <td className="px-4 py-3 text-center text-xs text-steel-500">{it.unit || 'หน่วย'}</td>
                  <td className="px-4 py-3 text-right font-mono">{baht(it.unit_price || 0)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {Number(it.discount_percent || 0) > 0 ? (
                      <span className="text-rose-600 font-medium">{it.discount_percent}%</span>
                    ) : (
                      <span className="text-steel-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink font-mono">
                    {baht(it.total_amount || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary Calculation Panel */}
        <div className="border-t border-steel-200 bg-steel-50 p-6">
          <div className="max-w-md ml-auto space-y-2 text-sm">
            <div className="flex justify-between text-steel-600">
              <span>รวมเป็นเงิน (Subtotal):</span>
              <span className="font-mono font-medium">{baht(quotation.subtotal || 0)}</span>
            </div>
            {Number(quotation.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>ส่วนลดรวม:</span>
                <span className="font-mono font-medium">-{baht(quotation.discount_amount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-steel-600">
              <span>ราคาหลังหักส่วนลด:</span>
              <span className="font-mono font-medium">{baht(quotation.after_discount || quotation.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between text-steel-600">
              <span>ภาษีมูลค่าเพิ่ม (VAT {quotation.vat_rate || 7}%):</span>
              <span className="font-mono font-medium">+{baht(quotation.vat_amount || 0)}</span>
            </div>
            {Number(quotation.wht_amount || 0) > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>หัก ภาษี ณ ที่จ่าย ({quotation.wht_rate}%):</span>
                <span className="font-mono font-medium">-{baht(quotation.wht_amount || 0)}</span>
              </div>
            )}
            <div className="border-t border-steel-300 pt-3 flex justify-between items-center text-lg font-bold text-ink">
              <span>ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
              <span className="text-xl text-sky-700 font-mono">
                {baht(quotation.grand_total || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Conditions & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* หมายเหตุแสดงให้ลูกค้าเห็น */}
        <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-ink text-sm flex items-center gap-2 mb-2">
            <span>📝</span>
            <span>หมายเหตุและเงื่อนไข (แสดงให้ลูกค้าเห็น)</span>
          </h3>
          <div className="whitespace-pre-line text-xs text-steel-600 bg-steel-50 p-4 rounded-lg min-h-[90px] border border-steel-100">
            {quotation.customer_notes || 'ไม่มีข้อกำหนดเพิ่มเติม'}
          </div>
        </div>

        {/* โน้ตภายในบริษัท */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2 mb-2">
            <span>🔒</span>
            <span>โน้ตภายในบริษัท (ทีมงานเห็นเท่านั้น)</span>
          </h3>
          <div className="whitespace-pre-line text-xs text-amber-800 bg-amber-50 p-4 rounded-lg min-h-[90px] border border-amber-200/60">
            {quotation.internal_notes || 'ไม่มีบันทึกภายใน'}
          </div>
        </div>
      </div>

      {/* Print PDF Modal */}
      {showPrintModal && (
        <QuotationPrintModal
          quotation={quotation}
          items={items}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* โมดัลแสดงเอกสารใบสั่งซื้อจากลูกค้า (Customer PO Document Viewer) */}
      {showCustomerPoDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-steel-200 dark:border-slate-800 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs text-lg">
                  ✍️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-white">
                      ใบสั่งซื้อจากลูกค้า (Customer Purchase Order)
                    </span>
                    <span className="rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                      VERIFIED & APPROVED
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    เลขที่ PO: <strong className="text-emerald-400">{quotation.customer_po_no}</strong> | อ้างอิงใบเสนอราคา: {quotation.quotation_no}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerPoDoc(false)}
                className="text-slate-400 hover:text-white rounded-lg p-2 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Document Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto bg-slate-50 dark:bg-slate-950/50">
              {/* ถ้ามีไฟล์แนบที่อัปโหลดไว้จริง (รูปภาพ หรือ PDF) ให้แสดงตัวอย่าง */}
              {quotation.customer_po_file_url && !quotation.customer_po_file_url.includes('example.com') && (
                <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>📎</span>
                      <span>ไฟล์สแกน / เอกสารใบสั่งซื้อของลูกค้าที่แนบไว้:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openFile(quotation.customer_po_file_url)}
                      className="text-xs font-bold text-sky-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>เปิดในแท็บใหม่ ↗</span>
                    </button>
                  </div>
                  {quotation.customer_po_file_url.startsWith('data:image') || /\.(png|jpg|jpeg|webp|gif)/i.test(quotation.customer_po_file_url) ? (
                    <div className="flex justify-center bg-slate-100 dark:bg-slate-950 p-2 rounded-xl">
                      <R2Image
                        fileKey={quotation.customer_po_file_url}
                        alt="Customer PO Document"
                        className="max-h-96 max-w-full rounded-lg object-contain shadow-xs"
                      />
                    </div>
                  ) : customerPoPreviewUrl ? (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                      <iframe
                        src={customerPoPreviewUrl}
                        title="Customer PO PDF"
                        className="w-full h-96 rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 bg-slate-100 dark:bg-slate-950 rounded-xl gap-2">
                      <p className="text-xs text-steel-500">เอกสาร PDF ใบสั่งซื้อของลูกค้า</p>
                      <button
                        type="button"
                        onClick={() => openFile(quotation.customer_po_file_url)}
                        className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-1.5 text-xs shadow-xs transition cursor-pointer"
                      >
                        เปิดดูเอกสาร PDF ↗
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ใบ PO ทางการ (Corporate PO Sheet) */}
              <div className="rounded-2xl border border-steel-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-6 text-slate-800 dark:text-slate-200">
                {/* PO Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-steel-200 dark:border-slate-800 pb-5">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      CUSTOMER / ผู้สั่งซื้อ
                    </span>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                      {quotation.customer_name}
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                      <div>สาขา: {quotation.customer_branch || 'สำนักงานใหญ่'}</div>
                      <div>เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{quotation.customer_tax_id || '-'}</span></div>
                      {quotation.customer_address && <div>ที่อยู่: {quotation.customer_address} {quotation.customer_postal_code}</div>}
                    </div>
                  </div>

                  <div className="sm:text-right bg-emerald-50/70 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 sm:min-w-[240px]">
                    <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                      PURCHASE ORDER (PO)
                    </div>
                    <div className="text-base font-black text-emerald-950 dark:text-emerald-100 font-mono mt-0.5">
                      {quotation.customer_po_no}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 space-y-0.5">
                      <div>วันที่ออกเอกสาร: <b className="font-mono">{quotation.customer_po_date ? new Date(quotation.customer_po_date).toLocaleDateString('th-TH') : new Date(quotation.issue_date).toLocaleDateString('th-TH')}</b></div>
                      <div>อ้างอิงใบเสนอราคา: <b className="font-mono">{quotation.quotation_no}</b></div>
                    </div>
                  </div>
                </div>

                {/* ผู้จำหน่าย (Vendor) */}
                <div className="rounded-xl border border-steel-200 dark:border-slate-800 bg-steel-50/60 dark:bg-slate-800/60 p-3.5 text-xs">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-wider">สั่งซื้อถึง (VENDOR / SUPPLIER):</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">บริษัท แอนวา พาวเวอร์ จำกัด (ANVA POWER CO., LTD.)</div>
                  <div className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                    สำนักงานใหญ่ | เลขประจำตัวผู้เสียภาษี: 0105562098711 | ระบบวิศวกรรมพลังงานแสงอาทิตย์ครบวงจร
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-steel-200 dark:border-slate-800 bg-steel-100/70 dark:bg-slate-800 text-steel-700 dark:text-slate-300 font-bold uppercase">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3">รายการสินค้า / บริการที่สั่งซื้อ</th>
                        <th className="py-2.5 px-3 text-right w-24">จำนวน</th>
                        <th className="py-2.5 px-3 text-center w-20">หน่วย</th>
                        <th className="py-2.5 px-3 text-right w-28">ราคา/หน่วย</th>
                        <th className="py-2.5 px-3 text-right w-32">จำนวนเงิน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{it.item_name}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatIntQty(it.quantity)}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-500">{it.unit || 'รายการ'}</td>
                          <td className="py-2 px-3 text-right font-mono">{baht(it.unit_price || 0)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {baht(it.total_amount || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary & Totals */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-3 border-t border-steel-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 space-y-1">
                    <div>เงื่อนไข: ส่งมอบและติดตั้งตามรายละเอียดโครงการ</div>
                    <div>สถานที่ส่งมอบ: {quotation.customer_address || 'หน้างานโครงการลูกค้า'}</div>
                  </div>

                  <div className="w-full sm:w-72 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>รวมเป็นเงิน:</span>
                      <span className="font-mono font-semibold">{baht(quotation.subtotal || 0)}</span>
                    </div>
                    {Number(quotation.discount_amount || 0) > 0 && (
                      <div className="flex justify-between text-rose-600 font-medium">
                        <span>ส่วนลด:</span>
                        <span className="font-mono">-{baht(quotation.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>ภาษีมูลค่าเพิ่ม 7%:</span>
                      <span className="font-mono font-semibold">{baht(quotation.vat_amount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-emerald-900 dark:text-emerald-300 pt-2 border-t border-steel-200 dark:border-slate-800">
                      <span>ยอดสุทธิทั้งสิ้น:</span>
                      <span className="font-mono text-base">{baht(quotation.grand_total || quotation.total_amount || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Signer Box */}
                <div className="pt-4 border-t border-steel-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-lg">
                      ✓
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        OFFICIAL CUSTOMER APPROVAL
                      </div>
                      <div className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
                        เอกสารใบสั่งซื้อได้รับการตรวจสอบและลงนามถูกต้องสมบูรณ์
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:pr-4">
                    <div className="text-xs text-slate-400">ผู้มีอำนาจลงนามของลูกค้า:</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                      {quotation.customer_signer_name || 'ผู้มีอำนาจลงนาม'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      วันที่ลงนาม: {quotation.customer_po_date ? new Date(quotation.customer_po_date).toLocaleDateString('th-TH') : new Date(quotation.issue_date).toLocaleDateString('th-TH')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 px-6 py-4 border-t border-steel-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerPoDoc(false)
                    openPoModal()
                  }}
                  className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-steel-700 dark:text-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>แก้ไขข้อมูล / แนบไฟล์ใหม่</span>
                </button>
                {quotation.customer_po_file_url && !quotation.customer_po_file_url.includes('example.com') && (
                  <button
                    type="button"
                    onClick={() => openFile(quotation.customer_po_file_url)}
                    className="rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 px-3.5 py-2 text-xs font-bold text-sky-800 dark:text-sky-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🔗</span>
                    <span>เปิดไฟล์แนบต้นฉบับ</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-4 py-2 text-xs font-bold text-steel-700 dark:text-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🖨️</span>
                  <span>พิมพ์เอกสาร PO</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomerPoDoc(false)}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-5 py-2 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  ✕ ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer PO / Signed Confirmation Modal */}
      {showPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-steel-200 overflow-hidden">
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                  CUSTOMER APPROVAL & PO
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  บันทึกการเซ็น PO ของลูกค้า ({quotation.quotation_no})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                className="text-steel-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomerPo} className="p-6 space-y-4 text-xs font-sans">
              <div>
                <label className="block font-bold text-steel-700 mb-1">
                  เลขที่ใบสั่งซื้อของลูกค้า (Customer PO No.) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น PO-CUST-2026-0089"
                  className="input w-full font-mono font-bold text-sm"
                  value={customerPoNo}
                  onChange={(e) => setCustomerPoNo(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-steel-700 mb-1">
                    วันที่ในใบสั่งซื้อ (PO Date)
                  </label>
                  <input
                    type="date"
                    className="input w-full text-xs font-mono"
                    value={customerPoDate}
                    onChange={(e) => setCustomerPoDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-bold text-steel-700 mb-1">
                    ผู้ลงนาม / ผู้มีอำนาจ
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น คุณวิชัย (กรรมการผู้จัดการ)"
                    className="input w-full text-xs"
                    value={customerSignerName}
                    onChange={(e) => setCustomerSignerName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-steel-700 mb-1">
                  แนบไฟล์ใบสั่งซื้อของลูกค้า หรือใบเสนอราคาที่ลูกค้าเซ็นรับ (PDF/รูปภาพ)
                </label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="input w-full text-xs"
                    onChange={handleUploadPoFile}
                    disabled={poBusy}
                  />
                  {customerPoFileUrl && (
                    <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <span>✓</span>
                      <span>แนบไฟล์เรียบร้อยแล้ว</span>
                      <a href={customerPoFileUrl} target="_blank" rel="noreferrer" className="underline ml-auto">
                        ดูไฟล์
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-steel-50 p-3 border border-steel-200 text-steel-600 text-[11px] space-y-1">
                <div className="font-bold text-steel-800">💡 สิ่งที่จะเกิดขึ้นเมื่อกดยืนยัน:</div>
                <div>1. สถานะใบเสนอราคาจะเปลี่ยนเป็น <b>ลูกค้าอนุมัติ (Approved)</b> ทันที</div>
                <div>2. บันทึกเลขที่ PO และหลักฐานการเซ็นรับของลูกค้าในระบบ</div>
                <div>3. พร้อมส่งต่อรายการวัสดุให้ฝ่ายจัดซื้อเปิด PO สั่งซื้อต่อไป</div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-steel-100">
                <button
                  type="button"
                  onClick={() => setShowPoModal(false)}
                  className="rounded-xl border border-steel-300 bg-white px-4 py-2 text-xs font-bold text-steel-700 hover:bg-steel-50 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={poBusy}
                  className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <span>{poBusy ? 'กำลังบันทึก...' : '✓ บันทึกยืนยัน PO ลูกค้า'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

