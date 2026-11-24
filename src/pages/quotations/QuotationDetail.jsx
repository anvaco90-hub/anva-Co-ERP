import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  FileText, Send, CheckCircle2, ShoppingCart, Truck, FileCheck, Printer,
  Edit3, Trash2, ArrowRight, ExternalLink, X, Building2, User, FolderGit2,
  Calendar, CreditCard, ChevronRight, AlertCircle, Eye, Plus, Check,
  ArrowLeft, Clock, DollarSign, Package, Paperclip, ReceiptText, ShieldCheck,
  Warehouse, Sparkles, FileSpreadsheet, MapPin
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { formatIntQty } from '../../lib/store'
import { uploadQuotationFile, openFile } from '../../lib/files'
import R2Image, { useFileUrl } from '../../components/R2Image'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'
import CustomerPoPrintModal from '../../components/reports/CustomerPoPrintModal'

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
    <div className="w-full space-y-6 pb-16">
      {/* 1. แบนเนอร์หัวหน้าเอกสารระดับบริหาร (Executive Corporate ERP Banner - ขนาดและไอคอนสมดุลตามมาตรฐาน) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* ข้อมูลหัวเรื่องและ Metadata */}
          <div className="space-y-2.5 min-w-0">
            {/* ป้ายกำกับประเภทและสถานะ (Badges - ล็อกเป็นแนวนอนเสมอ ไม่ตกเป็น 3 แถว) */}
            <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/25 font-bold whitespace-nowrap shrink-0">
                QUOTATION DOCUMENT
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full border shadow-2xs whitespace-nowrap shrink-0 ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {quotation.customer_po_no && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 whitespace-nowrap shrink-0">
                  <FileCheck className="h-3 w-3" />
                  <span>PO: {quotation.customer_po_no}</span>
                </span>
              )}
            </div>

            {/* รหัสเอกสาร ไอคอน และคำอธิบาย */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 shrink-0">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-white font-mono whitespace-nowrap">
                  {quotation.quotation_no}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  เอกสารเสนอราคาโครงการวิศวกรรมและติดตั้งระบบโซลาร์เซลล์
                </p>
              </div>
            </div>

            {/* แถวข้อมูลย่อย (Metadata Lines จัดเป็นระเบียบชัดเจน) */}
            <div className="space-y-1 text-xs text-slate-300 pt-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span>วันที่ออก: <strong className="text-white font-mono">{quotation.issue_date ? new Date(quotation.issue_date).toLocaleDateString('th-TH') : '-'}</strong></span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>ยืนราคา: <strong className="text-white">{quotation.validity_days || '30'} วัน</strong> (ถึง {quotation.expiry_date || '-'})</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>ลูกค้า: <strong className="text-white">{quotation.customer_name}</strong></span>
              </div>

              {quotation.projects && (
                <div className="flex items-center gap-1.5">
                  <FolderGit2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span>โครงการ: <strong className="text-sky-300">[{quotation.projects.project_code}] {quotation.projects.project_name}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* แถบปุ่ม Action ด้านขวา (จัดเรียงเป็นแถวสมดุล สัดส่วนคงที่) */}
          <div className="flex items-center gap-2 flex-wrap shrink-0 lg:self-center">
            {/* ปุ่มตามลำดับขั้นตอนหลัก */}
            {quotation.customer_po_no ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowCustomerPoDoc(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 h-9 px-3.5 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>ดูเอกสาร PO</span>
                </button>
                <Link
                  to={`/purchasing/po/new?quotation_id=${quotation.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 h-9 px-3.5 text-xs font-black shadow-xs transition"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>ส่งต่อจัดซื้อ (เปิด PO)</span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={openPoModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>ลูกค้าเซ็นอนุมัติ / บันทึก PO</span>
              </button>
            )}

            {/* ปุ่มพิมพ์ PDF */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              title="พิมพ์เอกสารใบเสนอราคามาตรฐาน หรือบันทึก PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>พิมพ์ใบเสนอราคา (PDF)</span>
            </button>

            {/* Status Dropdown */}
            <select
              value={quotation.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updatingStatus}
              className="rounded-xl border border-slate-700 bg-slate-800/90 text-slate-100 h-9 px-3 text-xs font-bold shadow-xs focus:outline-none cursor-pointer"
            >
              <option value="draft">ฉบับร่าง (Draft)</option>
              <option value="sent">ส่งลูกค้าแล้ว (Sent)</option>
              <option value="approved">ลูกค้าอนุมัติ (Approved)</option>
              <option value="rejected">ปฏิเสธ (Rejected)</option>
              <option value="expired">หมดอายุ (Expired)</option>
            </select>

            {/* ปุ่มแก้ไข */}
            <Link
              to={`/quotations/${quotation.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>แก้ไข</span>
            </Link>

            {/* ปุ่มลบ (ถังขยะ) */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 h-9 w-9 text-xs transition cursor-pointer shadow-xs"
              title="ลบใบเสนอราคา"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Visual Sales & Execution Workflow Pipeline (ผังแสดงลำดับขั้นตอนการทำงาน 1 -> 2 -> 3 -> 4 -> 5) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              <FolderGit2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ลำดับขั้นตอนการทำงาน (Sales &amp; Solar EPC Workflow)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ผังกระบวนการเริ่มตั้งแต่เสนอราคาจนถึงส่งมอบงาน ชี้ชัดว่าขั้นตอนปัจจุบันอยู่จุดใดและต้องทำอะไรต่อ
              </p>
            </div>
          </div>
          <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            สถานะปัจจุบัน: <span className="text-sky-600 dark:text-sky-400 font-bold">{statusInfo.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Step 1: ออกใบเสนอราคา */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs shadow-xs">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  เสร็จสิ้นแล้ว
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                1. ออกใบเสนอราคา
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5">
                {quotation.quotation_no}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                สร้างรายการและคำนวณต้นทุนเรียบร้อย
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
              วันที่: {quotation.issue_date ? new Date(quotation.issue_date).toLocaleDateString('th-TH') : '-'}
            </div>
          </div>

          {/* Step 2: ส่งให้ลูกค้าพิจารณา */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              quotation.status !== 'draft'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : 'border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 ring-2 ring-sky-400/20'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    quotation.status !== 'draft' ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white animate-pulse'
                  }`}
                >
                  {quotation.status !== 'draft' ? <Check className="h-3.5 w-3.5" /> : '2'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    quotation.status !== 'draft' ? 'text-emerald-800 dark:text-emerald-300' : 'text-sky-800 dark:text-sky-300'
                  }`}
                >
                  {quotation.status !== 'draft' ? 'ส่งลูกค้าแล้ว' : 'กำลังดำเนินการ'}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                2. ส่งให้ลูกค้าพิจารณา
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {quotation.validity_days ? `ยืนราคา ${quotation.validity_days} วัน` : 'รอผลการพิจารณาข้อเสนอ'}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="text-sky-700 dark:text-sky-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="h-3 w-3" />
                <span>พิมพ์ใบเสนอราคา</span>
              </button>
            </div>
          </div>

          {/* Step 3: ลูกค้าลงนามอนุมัติ / PO ลูกค้า */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              quotation.customer_po_no || quotation.status === 'approved'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : quotation.status === 'sent'
                ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 ring-2 ring-amber-400/20'
                : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    quotation.customer_po_no || quotation.status === 'approved'
                      ? 'bg-emerald-600 text-white'
                      : quotation.status === 'sent'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {quotation.customer_po_no || quotation.status === 'approved' ? <Check className="h-3.5 w-3.5" /> : '3'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    quotation.customer_po_no || quotation.status === 'approved'
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {quotation.customer_po_no ? 'รับ PO แล้ว' : 'รอลูกค้าอนุมัติ'}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                3. ลูกค้าลงนามอนุมัติ / PO
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                {quotation.customer_po_no ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">PO: {quotation.customer_po_no}</span>
                ) : (
                  'รอลูกค้าออก PO หรือเซ็นรับ'
                )}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              {quotation.customer_po_no ? (
                <button
                  type="button"
                  onClick={() => setShowCustomerPoDoc(true)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="h-3 w-3" />
                  <span>ดูเอกสาร PO ลูกค้า</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openPoModal}
                  className="text-amber-800 dark:text-amber-300 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ บันทึก PO ลูกค้า</span>
                </button>
              )}
            </div>
          </div>

          {/* Step 4: ส่งต่อจัดซื้อ & สโตร์ */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              quotation.customer_po_no || quotation.status === 'approved'
                ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-700 ring-2 ring-amber-400/20'
                : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    quotation.customer_po_no || quotation.status === 'approved'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  4
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  {quotation.customer_po_no ? 'พร้อมจัดซื้อ' : 'ขั้นตอนถัดไป'}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                4. ส่งต่อจัดซื้อ &amp; สโตร์
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                เปิด PR หรือออก PO สั่งแผง / อินเวอร์เตอร์ / อุปกรณ์
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Link
                to={`/purchasing/po/new?quotation_id=${quotation.id}`}
                className="text-amber-900 dark:text-amber-300 hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                <ShoppingCart className="h-3 w-3" />
                <span>เปิด PO ซื้อของ</span>
              </Link>
              <span className="text-slate-300">|</span>
              <Link
                to={`/purchasing/pr/new?quotation_id=${quotation.id}`}
                className="text-slate-700 dark:text-slate-300 hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                <span>เปิด PR</span>
              </Link>
            </div>
          </div>

          {/* Step 5: ติดตั้งส่งมอบ & บัญชี */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 p-3.5 flex flex-col justify-between opacity-80">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-xs">
                  5
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  ปลายทางโครงการ
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                5. ส่งมอบงาน &amp; วางบิล
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                ติดตั้งระบบ ตรวจรับของ และส่งฝ่ายบัญชีวางบิล
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              สถานะ: รอส่งมอบโครงการ
            </div>
          </div>
        </div>
      </div>

      {/* 3. Customer PO Signed Banner (แสดงเมื่อลูกค้าเซ็นรับแล้ว) */}
      {quotation.customer_po_no && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/40 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs text-xl">
              <ShieldCheck className="h-6 w-6" />
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
              <Eye className="h-3.5 w-3.5" />
              <span>เปิดดูไฟล์ PO ลูกค้า</span>
            </button>
            <Link
              to={`/purchasing/po/new?quotation_id=${quotation.id}`}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 text-xs font-black shadow-xs transition flex items-center gap-1.5"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>สั่งซื้อของตาม PO นี้</span>
            </Link>
          </div>
        </div>
      )}

      {/* 4. ข้อมูลหลัก 2 คอลัมน์ (Master Details Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* คอลัมน์ที่ 1: ข้อมูลลูกค้าและสถานที่ส่งมอบ */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>ข้อมูลลูกค้าและสถานที่ส่งมอบ (Customer &amp; Delivery Info)</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Client Profile</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <div className="text-slate-400">ชื่อลูกค้า / บริษัทลูกค้า</div>
              <div className="font-bold text-slate-900 dark:text-white text-base mt-0.5">
                {quotation.customer_name}
              </div>
            </div>

            <div>
              <div className="text-slate-400">สำนักงาน / สาขา</div>
              <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_branch || 'สำนักงานใหญ่'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">เลขประจำตัวผู้เสียภาษี (Tax ID)</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_tax_id || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">รหัสไปรษณีย์</div>
              <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_postal_code || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">คลังสินค้าจ่ายพัสดุ</div>
              <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                <span>{quotation.warehouse_name || 'สโตร์หลัก'}</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="text-slate-400">ที่อยู่สำหรับออกเอกสาร</div>
              <div className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed flex items-start gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{quotation.customer_address || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์ที่ 2: ข้อมูลโครงการและเงื่อนไขเอกสาร */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>ข้อมูลโครงการและการเงิน (Project &amp; Commercial Terms)</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Commercial</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <div className="text-slate-400">โปรเจกต์งานวิศวกรรม (Project Link)</div>
              <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {quotation.projects ? (
                  <span className="text-sky-700 dark:text-sky-400 font-bold">
                    [{quotation.projects.project_code}] {quotation.projects.project_name}
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">งานขายทั่วไป / ไม่ได้ระบุโครงการ</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">เลขที่อ้างอิง (Ref No. / BOQ)</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.ref_no || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">พนักงานขาย / ผู้เสนอราคา</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>{quotation.sales_person || '-'}</span>
              </div>
            </div>

            <div>
              <div className="text-slate-400">วันที่เสนอราคา</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.issue_date || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">วันครบกำหนดยืนราคา</div>
              <div className="font-mono font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                {quotation.expiry_date || '-'} ({quotation.validity_days || 30} วัน)
              </div>
            </div>

            <div>
              <div className="text-slate-400">สกุลเงิน</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {quotation.currency || 'THB'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">การคิดภาษี (VAT Mode)</div>
              <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.tax_type === 'vat_included'
                  ? 'ราคารวมภาษีแล้ว (VAT Included 7%)'
                  : quotation.tax_type === 'vat_exempt'
                  ? 'ได้รับการยกเว้นภาษี (VAT Exempt 0%)'
                  : 'ราคาแยกภาษีมูลค่าเพิ่ม (VAT Excluded +7%)'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. ตารางรายการสินค้าและบริการ (Itemized Table) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden space-y-0">
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              รายการสินค้าและบริการ (Itemized Table)
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              คลัง: <b>{quotation.warehouse_name || 'สโตร์หลัก'}</b>
            </span>
            <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              {items.length} รายการ
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">ชื่อสินค้า / สเปกวิศวกรรม</th>
                <th className="px-4 py-3 text-right w-24">จำนวน</th>
                <th className="px-4 py-3 text-center w-20">หน่วย</th>
                <th className="px-4 py-3 text-right w-32">ราคา/หน่วย</th>
                <th className="px-4 py-3 text-right w-24">ส่วนลด (%)</th>
                <th className="px-4 py-3 text-right w-36">ราคารวม ({quotation.currency || 'THB'})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                    {it.description && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line leading-relaxed font-normal bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
                        {it.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatIntQty(it.quantity)}
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs text-slate-500 dark:text-slate-400">
                    {it.unit || 'หน่วย'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                    {baht(it.unit_price || 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs">
                    {Number(it.discount_percent || 0) > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{it.discount_percent}%</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {baht(it.total_amount || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* สรุปการเงินระดับบริหาร (Financial Summary Calculation Panel) */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-6">
          <div className="max-w-md ml-auto space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>รวมเป็นเงิน (Subtotal):</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {baht(quotation.subtotal || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
            {Number(quotation.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>ส่วนลดรวม (Total Discount):</span>
                <span className="font-mono font-bold">-{baht(quotation.discount_amount || 0)} {quotation.currency || 'THB'}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
              <span>ราคาหลังหักส่วนลด:</span>
              <span className="font-mono">{baht(quotation.after_discount || quotation.subtotal || 0)} {quotation.currency || 'THB'}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>ภาษีมูลค่าเพิ่ม (VAT {quotation.vat_rate || 7}%):</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                +{baht(quotation.vat_amount || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
            {Number(quotation.wht_amount || 0) > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                <span>หักภาษี ณ ที่จ่าย ({quotation.wht_rate}%):</span>
                <span className="font-mono font-bold">-{baht(quotation.wht_amount || 0)} {quotation.currency || 'THB'}</span>
              </div>
            )}
            <div className="border-t-2 border-sky-400 dark:border-sky-600 pt-3 flex justify-between items-center text-sm font-extrabold text-sky-950 dark:text-sky-300">
              <span className="text-base">ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
              <span className="text-xl text-sky-800 dark:text-sky-300 font-mono font-black">
                {baht(quotation.grand_total || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. เงื่อนไข หมายเหตุ และลายเซ็น/เอกสารแนบ (Terms, Notes & Attachments) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* หมายเหตุสำหรับลูกค้า & โน้ตภายใน */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>หมายเหตุและเงื่อนไข (Notes &amp; Terms)</span>
          </h3>

          <div className="space-y-3">
            <div>
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                หมายเหตุที่แสดงให้ลูกค้าเห็น:
              </span>
              <div className="whitespace-pre-line text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 min-h-[70px]">
                {quotation.customer_notes || 'ไม่มีข้อกำหนดเพิ่มเติม'}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">
                โน้ตภายในบริษัท (ทีมงานเห็นเท่านั้น):
              </span>
              <div className="whitespace-pre-line text-xs text-amber-900 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 min-h-[70px]">
                {quotation.internal_notes || 'ไม่มีบันทึกภายใน'}
              </div>
            </div>
          </div>
        </div>

        {/* ลายเซ็นอิเล็กทรอนิกส์และเอกสารแนบ */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FileCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span>ลายเซ็นและเอกสารแนบ (Signatures &amp; Files)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                ลายเซ็นอิเล็กทรอนิกส์ &amp; ตราประทับ
              </span>
              {quotation.signature_url ? (
                <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center min-h-[90px]">
                  <R2Image
                    fileKey={quotation.signature_url}
                    alt="Signature"
                    className="max-h-20 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-center min-h-[90px] flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                  ไม่มีลายเซ็นแนบ
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                ไฟล์แนบเอกสารทั่วไป
              </span>
              {quotation.attachment_url ? (
                <div className="min-h-[90px] flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() => openFile(quotation.attachment_url)}
                    className="w-full flex items-center gap-2 p-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-xs font-semibold text-sky-700 dark:text-sky-300 transition cursor-pointer text-left shadow-2xs"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-sky-600" />
                    <span className="truncate">เปิด / ดาวน์โหลดไฟล์แนบ</span>
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1 text-center">สเปคสินค้า / แบบร่าง / ใบเสนอราคา</p>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-center min-h-[90px] flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                  ไม่มีไฟล์แนบ
                </div>
              )}
            </div>
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

      {/* Customer PO Print & View Modal */}
      {showCustomerPoDoc && (
        <CustomerPoPrintModal
          quotation={quotation}
          items={items}
          onClose={() => setShowCustomerPoDoc(false)}
          onEdit={() => {
            setShowCustomerPoDoc(false)
            openPoModal()
          }}
        />
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
                className="text-steel-400 hover:text-white rounded-lg p-1.5 transition cursor-pointer"
                title="ปิด"
              >
                <X className="h-5 w-5" />
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
                      <span></span>
                      <span>แนบไฟล์เรียบร้อยแล้ว</span>
                      <a href={customerPoFileUrl} target="_blank" rel="noreferrer" className="underline ml-auto">
                        ดูไฟล์
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-steel-50 p-3 border border-steel-200 text-steel-600 text-[11px] space-y-1">
                <div className="font-bold text-steel-800">สิ่งที่จะเกิดขึ้นเมื่อกดยืนยัน:</div>
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
                  className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{poBusy ? 'กำลังบันทึก...' : 'บันทึกยืนยัน PO ลูกค้า'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

