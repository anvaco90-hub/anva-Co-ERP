import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { ensureSalesInvoiceForQuotation } from '../../lib/salesBilling'
import { getCustomerApprovalDisplay } from '../../lib/salesFlowUtils'
import {
  buildQuotationPurchasingMap,
  computeQuotationKpis,
  filterQuotations,
  getQuotationRowAmountMeta,
  isQuotationApproved,
  resolveInitialStatusFilter,
} from '../../lib/quotationListUtils'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import QuotationShareModal from '../../components/quotations/QuotationShareModal'
import CustomerPoModal from '../../components/quotations/CustomerPoModal'
import PaymentActionModal from '../../components/PaymentActionModal'
import Pagination from '../../components/Pagination'
import TableSortFilter from '../../components/TableSortFilter'
import {
  Printer,
  Mail,
  Share2,
  Copy,
  Edit3,
  Trash2,
  MoreVertical,
  FileText,
  DollarSign,
  Search,
  Plus,
  RefreshCw,
  ShoppingCart,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react'

const STATUS_CONFIG = {
  draft: {
    label: 'ฉบับร่าง',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  sent: {
    label: 'ส่งลูกค้าแล้ว',
    cls: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  approved: {
    label: 'ลูกค้าอนุมัติแล้ว',
    cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-bold',
  },
  rejected: {
    label: 'ปฏิเสธ / ยกเลิก',
    cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  expired: {
    label: 'หมดอายุยืนราคา',
    cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  partial: {
    label: 'รับชำระบางส่วน',
    cls: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
}

const PURCHASING_BADGE_TONES = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  sky: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
}

// คำนวณวันสิ้นสุดยืนราคา
function getExpiryInfo(q) {
  const expiry = q.valid_until || q.expiry_date
  if (!expiry) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const parts = String(expiry).split('T')[0].split('-').map(Number)
  if (parts.length < 3) return null
  const expDate = new Date(parts[0], parts[1] - 1, parts[2])
  const diffDays = Math.round((expDate - today) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `หมดอายุ (${Math.abs(diffDays)} วัน)`, cls: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' }
  }
  if (diffDays <= 7) {
    return {
      text: diffDays === 0 ? 'ครบกำหนดวันนี้' : `เหลือ ${diffDays} วัน`,
      cls: 'text-amber-700 dark:text-amber-400 font-semibold',
      dot: 'bg-amber-500',
    }
  }
  return { text: `เหลือ ${diffDays} วัน`, cls: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' }
}

export default function QuotationList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [quotations, setQuotations] = useState([])
  const [projects, setProjects] = useState([])
  const [linkedPrs, setLinkedPrs] = useState([])
  const [linkedPos, setLinkedPos] = useState([])
  const [loading, setLoading] = useState(true)

  // ตัวกรองแบบกระชับ (Clean Filters)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState(() => resolveInitialStatusFilter(searchParams.get('tab')))

  // ตัวเลือกการเรียงลำดับมาตรฐานสำหรับงานขายและเสนอราคา
  const QUOTATION_SORT_OPTIONS = [
    { value: 'date_desc', label: 'วันที่สร้างล่าสุด (ใหม่ → เก่า)' },
    { value: 'date_asc', label: 'วันที่สร้าง (เก่า → ใหม่)' },
    { value: 'code_desc', label: 'เลขที่ QT (มาก → น้อย)' },
    { value: 'code_asc', label: 'เลขที่ QT (น้อย → มาก)' },
    { value: 'name_asc', label: 'ชื่อลูกค้า/โครงการ (ก → ฮ)' },
    { value: 'name_desc', label: 'ชื่อลูกค้า/โครงการ (ฮ → ก)' },
    { value: 'amount_desc', label: 'มูลค่าเสนอราคา (มาก → น้อย)' },
    { value: 'amount_asc', label: 'มูลค่าเสนอราคา (น้อย → มาก)' },
  ]

  // ตัวกรองวันที่แบบ Smart Preset (ไม่รกตา)
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'this_week' | 'this_month' | 'next_30' | 'custom'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 10 | 15 | 30 | 50

  // โมดัลและเมนู Action
  const [actionMenuId, setActionMenuId] = useState(null)
  const [printTarget, setPrintTarget] = useState(null)
  const [printItems, setPrintItems] = useState([])
  const [loadingPrint, setLoadingPrint] = useState(false)
  const [envelopeTarget, setEnvelopeTarget] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)
  const [customerPoTarget, setCustomerPoTarget] = useState(null)
  const [paymentTarget, setPaymentTarget] = useState(null)

  // รองรับลิงก์เก่า ?tab=signed / ?tab=pipeline โดยแปลงเป็น filter แล้วล้าง URL ให้สะอาด
  useEffect(() => {
    const legacyTab = searchParams.get('tab')
    if (legacyTab) {
      setFilterStatus(resolveInitialStatusFilter(legacyTab))
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ปิดเมนู action เมื่อคลิกที่อื่น
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuId(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const toggleKpiStatus = (targetStatus) => {
    if (targetStatus === 'all') {
      setFilterStatus('all')
    } else {
      setFilterStatus((prev) => (prev === targetStatus ? 'all' : targetStatus))
    }
    setActionMenuId(null)
  }

  // ปรับเปลี่ยนช่วงเวลาด่วน
  const handleDatePresetChange = (preset) => {
    setDatePreset(preset)
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
    } else if (preset === 'today') {
      const today = toYMD(now)
      setDateFrom(today)
      setDateTo(today)
    } else if (preset === 'this_week') {
      const start = new Date(now)
      const day = start.getDay() === 0 ? 7 : start.getDay()
      start.setDate(start.getDate() - day + 1)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    } else if (preset === 'next_30') {
      const start = new Date(now)
      const end = new Date(now)
      end.setDate(end.getDate() + 30)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    }
  }

  const clearAllFilters = () => {
    setSearch('')
    setFilterProject('')
    setFilterStatus('all')
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilter = Boolean(search || filterProject || filterStatus !== 'all' || dateFrom || dateTo)

  const fetchQuotations = async () => {
    setLoading(true)
    try {
      const [qRes, projRes, prRes, poRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, projects(id, project_code, project_name)')
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('purchase_requisitions').select('id, pr_no, status, notes, quotation_id, sales_quotation_no'),
        supabase.from('purchase_orders').select('id, po_no, pr_id, status, notes, quotation_id, sales_quotation_no'),
      ])

      if (qRes.error) {
        console.error(qRes.error)
        setQuotations([])
      } else {
        setQuotations(qRes.data || [])
      }
      setProjects(projRes.data || [])

      if (!prRes.error) {
        setLinkedPrs(prRes.data || [])
      } else {
        const prFb = await supabase.from('purchase_requisitions').select('id, pr_no, status, notes')
        setLinkedPrs(prFb.error ? [] : prFb.data || [])
      }

      if (!poRes.error) {
        setLinkedPos(poRes.data || [])
      } else {
        const poFb = await supabase.from('purchase_orders').select('id, po_no, pr_id, status, notes')
        setLinkedPos(poFb.error ? [] : poFb.data || [])
      }
    } catch (err) {
      console.error(err)
      setQuotations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotations()
  }, [])

  const handleOpenPrint = async (q) => {
    setLoadingPrint(true)
    try {
      const { data: items } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', q.id)
      setPrintTarget(q)
      setPrintItems(items && items.length > 0 ? items : [
        { item_name: 'แผงโซลาร์เซลล์ JA Solar 550W Mono Half-Cell', quantity: 280, unit: 'แผง', unit_price: 3200, total_amount: 896000 },
        { item_name: 'อินเวอร์เตอร์ Huawei SUN2000-50KTL-M3', quantity: 2, unit: 'เครื่อง', unit_price: 210000, total_amount: 420000 },
      ])
    } catch {
      setPrintTarget(q)
      setPrintItems([])
    } finally {
      setLoadingPrint(false)
    }
  }

  const handleDelete = async (qToDelete) => {
    if (!confirm(`ยืนยันการลบใบเสนอราคา ${qToDelete.quotation_no}? ข้อมูลจะถูกลบออกจากระบบอย่างถาวร`)) return
    try {
      const { error } = await supabase.from('quotations').delete().eq('id', qToDelete.id)
      if (error) throw error
      setQuotations((prev) => prev.filter((q) => q.id !== qToDelete.id))
      setActionMenuId(null)
    } catch (err) {
      alert('ไม่สามารถลบใบเสนอราคาได้: ' + (err.message || 'โปรดตรวจสอบสิทธิ์'))
    }
  }

  const handleOpenReceivePayment = async (q) => {
    setActionMenuId(null)
    try {
      const { invoice } = await ensureSalesInvoiceForQuotation({ quotation: q })
      setPaymentTarget({ quotation: q, invoice })
    } catch (err) {
      console.error('Failed to prepare AR invoice for payment:', err)
      setPaymentTarget({
        quotation: q,
        invoice: {
          id: q.id,
          invoice_no: q.quotation_no,
          total_amount: q.grand_total || q.net_amount || q.total_amount || 0,
          paid_amount: 0,
          contact_id: null,
        },
      })
    }
  }

  // คำนวณสรุปสถิติ (KPIs) และสถานะเชื่อมโยงจัดซื้อ
  const stats = useMemo(() => computeQuotationKpis(quotations), [quotations])
  const purchasingMap = useMemo(
    () => buildQuotationPurchasingMap(quotations, linkedPrs, linkedPos),
    [quotations, linkedPrs, linkedPos]
  )

  // รายการที่ผ่านการกรอง (Filtered Data)
  const filtered = useMemo(
    () =>
      filterQuotations(quotations, {
        filterStatus,
        filterProject,
        search,
        dateFrom,
        dateTo,
      }),
    [quotations, filterStatus, filterProject, search, dateFrom, dateTo]
  )

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [filterStatus, filterProject, search, dateFrom, dateTo])

  // จัดเรียงรายการตามมาตรฐานที่เลือก (A-Z / ตัวเลข / วันที่ / ยอดเงิน)
  const sortedQuotations = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name_asc') {
        const nameA = a.customer_name || a.projects?.project_name || ''
        const nameB = b.customer_name || b.projects?.project_name || ''
        return nameA.localeCompare(nameB, 'th')
      }
      if (sortBy === 'name_desc') {
        const nameA = a.customer_name || a.projects?.project_name || ''
        const nameB = b.customer_name || b.projects?.project_name || ''
        return nameB.localeCompare(nameA, 'th')
      }
      if (sortBy === 'code_asc') return (a.quotation_no || '').localeCompare(b.quotation_no || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.quotation_no || '').localeCompare(a.quotation_no || '', undefined, { numeric: true })
      if (sortBy === 'amount_desc') return Number(b.grand_total || b.total_amount || 0) - Number(a.grand_total || a.total_amount || 0)
      if (sortBy === 'amount_asc') return Number(a.grand_total || a.total_amount || 0) - Number(b.grand_total || b.total_amount || 0)
      if (sortBy === 'date_asc') return (a.created_at || a.quotation_date || '').localeCompare(b.created_at || b.quotation_date || '')
      // Default: date_desc
      return (b.created_at || b.quotation_date || '').localeCompare(a.created_at || a.quotation_date || '')
    })
  }, [filtered, sortBy])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedQuotations = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedQuotations.slice(start, start + pageSize)
  }, [sortedQuotations, currentPage, pageSize])

  return (
    <div className="space-y-4">

      {/* 1. Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            งานขายและใบเสนอราคา (Sales &amp; Quotations)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            จัดการใบเสนอราคา บันทึกการอนุมัติของลูกค้า และติดตามความคืบหน้าการส่งต่อฝ่ายจัดซื้อ &amp; สโตร์
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/boq"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>ระบบ BOQ</span>
          </Link>

          <Link
            to="/quotations/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-xs transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>สร้างใบเสนอราคา</span>
          </Link>
        </div>
      </div>

      {/* 2. Interactive Metric Strip (คลิกเพื่อกรองรายการได้ทันที แทนแท็บซ้ำซ้อน) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => toggleKpiStatus('all')}
          className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
            filterStatus === 'all'
              ? 'border-slate-800 dark:border-emerald-400 bg-white dark:bg-slate-900 ring-1 ring-slate-800/15 dark:ring-emerald-400/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>ยอดเสนอราคาทั้งหมด</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{stats.totalCount} ใบ</span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {baht(stats.totalAmount)} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">บาท</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">คลิกเพื่อแสดงทั้งหมด</div>
        </button>

        <button
          type="button"
          onClick={() => toggleKpiStatus('approved')}
          className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
            filterStatus === 'approved'
              ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-emerald-300 dark:hover:border-emerald-800'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>ลูกค้าอนุมัติแล้ว</span>
            </span>
            <span className="text-[10px] font-bold">{stats.signedCount} ใบ</span>
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
            {baht(stats.signedAmount)} <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">บาท</span>
          </div>
          <div className="mt-0.5 text-[10px] text-emerald-700/80 dark:text-emerald-400/80">พร้อมส่งต่อจัดซื้อ / เช็กสต็อก</div>
        </button>

        <button
          type="button"
          onClick={() => toggleKpiStatus('sent')}
          className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
            filterStatus === 'sent'
              ? 'border-sky-600 dark:border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 ring-1 ring-sky-500/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-sky-300 dark:hover:border-sky-800'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
            <span className="h-2 w-2 rounded-full bg-sky-500"></span>
            <span>ส่งลูกค้าพิจารณา</span>
          </div>
          <div className="mt-1 text-lg font-bold text-sky-900 dark:text-sky-300 tabular-nums">
            {stats.sentCount} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ใบ</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">อยู่ระหว่างรอลูกค้าตัดสินใจ</div>
        </button>

        <button
          type="button"
          onClick={() => toggleKpiStatus('draft')}
          className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
            filterStatus === 'draft'
              ? 'border-slate-700 dark:border-slate-400 bg-slate-100/80 dark:bg-slate-800 ring-1 ring-slate-500/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-slate-400"></span>
            <span>ฉบับร่าง</span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200 tabular-nums">
            {stats.draftCount} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ใบ</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">กำลังจัดเตรียมสเปกและราคา</div>
        </button>
      </div>

      {/* 3. Unified Clean Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Box */}
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่, ลูกค้า, โครงการ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
              />
            </div>

            {/* Standard Sort Filter Control */}
            <TableSortFilter
              value={sortBy}
              onChange={setSortBy}
              options={QUOTATION_SORT_OPTIONS}
            />

            {/* Project Filter */}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
            >
              <option value="">ทุกโครงการ</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} {p.project_name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="sent">ส่งลูกค้าแล้ว</option>
              <option value="approved">ลูกค้าอนุมัติแล้ว</option>
              <option value="partial">รับชำระบางส่วน</option>
              <option value="rejected">ปฏิเสธ / ยกเลิก</option>
              <option value="expired">หมดอายุยืนราคา</option>
            </select>

            {/* Compact Date Preset Dropdown */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={datePreset}
                onChange={(e) => handleDatePresetChange(e.target.value)}
                className="bg-transparent text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">ทุกช่วงเวลา</option>
                <option value="today">วันนี้</option>
                <option value="this_week">สัปดาห์นี้</option>
                <option value="this_month">เดือนนี้</option>
                <option value="next_30">30 วันข้างหน้า</option>
                <option value="custom">กำหนดช่วงวันเอง...</option>
              </select>
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs border-0 p-0 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs border-0 p-0 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {hasFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer whitespace-nowrap"
              >
                ล้างตัวกรอง
              </button>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              แสดง <strong className="text-slate-800 dark:text-slate-100 tabular-nums">{filtered.length}</strong> จาก {quotations.length} รายการ
            </span>
          </div>
        </div>
      </div>

      {/* 4. Main High-Legibility Table */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-400 dark:text-slate-500">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
          <p className="text-xs">กำลังโหลดรายการใบเสนอราคา...</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs min-h-[380px] pb-16">
          <table className="table-auto w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-3.5 px-3.5 text-center w-40 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่เอกสาร (QT)</th>
                <th className="py-3.5 px-4 min-w-[230px] border-r border-slate-200/70 dark:border-slate-700/60">ชื่อลูกค้า / โครงการ</th>
                <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">กำหนดยืนราคา</th>
                <th className="py-3.5 px-3.5 text-right w-40 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ยอดรวมสุทธิ (บาท)</th>
                <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">สถานะเอกสาร</th>
                <th className="py-3.5 px-3.5 text-center w-28 whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <FileText className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600 mb-2" />
                    <div className="font-medium text-slate-600 dark:text-slate-300">ไม่พบใบเสนอราคาตามเงื่อนไขที่เลือก</div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ลองเปลี่ยนคำค้นหา หรือกด &quot;ล้างตัวกรอง&quot;</p>
                  </td>
                </tr>
              ) : (
                paginatedQuotations.map((q, rowIdx) => {
                  const status = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft
                  const expInfo = getExpiryInfo(q)
                  const isMenuOpen = actionMenuId === q.id
                  const approval = getCustomerApprovalDisplay(q)
                  const isApproved = isQuotationApproved(q)
                  const amountMeta = getQuotationRowAmountMeta(q)
                  const pSummary = purchasingMap[q.id]

                  return (
                    <tr
                      key={q.id}
                      className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                        rowIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } ${isMenuOpen ? 'relative z-30' : ''} hover:bg-emerald-50/50 dark:hover:bg-slate-800/80`}
                    >
                      {/* 1. เลขที่ QT + วันที่ */}
                      <td className="py-3 px-3.5 text-center align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <Link
                          to={`/quotations/${q.id}`}
                          className="font-bold text-sky-800 dark:text-sky-400 hover:underline font-mono text-xs block"
                        >
                          {q.quotation_no}
                        </Link>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {q.quotation_date || q.issue_date}
                        </div>
                        {isApproved && (
                          <div className="mt-1 flex justify-center">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span>{approval.isDirectQt ? 'เซ็นอนุมัติตาม QT' : approval.shortLabel}</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. ลูกค้า / โครงการ + สถานะส่งต่อจัดซื้อ */}
                      <td className="py-3 px-4 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[260px]" title={q.customer_name}>
                          {q.customer_name || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px] mt-0.5" title={q.projects ? `${q.projects.project_code} • ${q.projects.project_name}` : (q.ref_no || 'โครงการทั่วไป')}>
                          {q.projects ? `${q.projects.project_code} • ${q.projects.project_name}` : (q.ref_no || 'โครงการทั่วไป')}
                        </div>
                        {pSummary?.stageLabel && (
                          <div className="mt-1">
                            <Link
                              to={`/quotations/${q.id}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold hover:opacity-85 transition ${
                                PURCHASING_BADGE_TONES[pSummary.stageTone] || PURCHASING_BADGE_TONES.slate
                              }`}
                            >
                              <span>{pSummary.stageLabel}</span>
                            </Link>
                          </div>
                        )}
                      </td>

                      {/* 3. วันสิ้นสุดยืนราคา */}
                      <td className="py-3 px-3 text-center align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="text-slate-700 dark:text-slate-300 text-xs font-semibold tabular-nums">
                          {q.valid_until || q.expiry_date || '-'}
                        </div>
                        {expInfo && (
                          <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[11px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${expInfo.dot}`}></span>
                            <span className={expInfo.cls}>{expInfo.text}</span>
                          </div>
                        )}
                      </td>

                      {/* 4. ยอดรวมสุทธิ (ใช้ font-sans + tabular-nums เพื่อไม่ให้ ฿ เพี้ยนเป็น $ และแสดง VAT จริง) */}
                      <td className="py-3 px-3.5 align-middle text-right whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-bold text-slate-900 dark:text-slate-100 text-xs tabular-nums">
                          ฿{baht(amountMeta.amount)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {amountMeta.vatShortTag}
                        </div>
                      </td>

                      {/* 5. สถานะเอกสาร */}
                      <td className="py-3 px-3 align-middle text-center whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>

                      {/* 6. การจัดการ */}
                      <td className="py-3 px-3.5 align-middle text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            to={`/quotations/${q.id}`}
                            className="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            ดูเอกสาร
                          </Link>

                          <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setActionMenuId(isMenuOpen ? null : q.id)}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${isMenuOpen
                                ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600 shadow-xs'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                              title="ตัวเลือกเพิ่มเติม"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-full mt-1.5 w-60 min-w-[220px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-2xl z-50 text-left text-xs ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
                                <Link
                                  to={`/quotations/${q.id}/edit`}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition"
                                >
                                  <Edit3 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>แก้ไขใบเสนอราคา</span>
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomerPoTarget(q)
                                    setActionMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-semibold cursor-pointer transition"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>{isApproved ? 'แก้ไขข้อมูลการอนุมัติ' : 'บันทึกการอนุมัติใบเสนอราคา'}</span>
                                </button>

                                {isApproved && (
                                  <Link
                                    to={`/quotations/${q.id}`}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-amber-900 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-semibold transition"
                                  >
                                    <ShoppingCart className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                    <span>ส่งต่อจัดซื้อ / เช็กสต็อก</span>
                                  </Link>
                                )}

                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleOpenPrint(q)
                                    setActionMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer transition"
                                >
                                  <Printer className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>พิมพ์ A4 / ดาวน์โหลด PDF</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEnvelopeTarget(q)
                                    setActionMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer transition"
                                >
                                  <Mail className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                                  <span>พิมพ์หน้าจ่าซองส่งลูกค้า</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setShareTarget(q)
                                    setActionMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer transition"
                                >
                                  <Share2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>แชร์ลิงก์ &amp; LINE</span>
                                </button>

                                <Link
                                  to={`/quotations/new?duplicate_from=${q.id}`}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition"
                                >
                                  <Copy className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                                  <span>ทำซ้ำใบเสนอราคา (Duplicate)</span>
                                </Link>

                                {isApproved && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReceivePayment(q)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-semibold cursor-pointer transition"
                                  >
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>บันทึกรับชำระเงิน (AR)</span>
                                  </button>
                                )}

                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                                <button
                                  type="button"
                                  onClick={() => handleDelete(q)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium cursor-pointer transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                                  <span>ลบใบเสนอราคานี้</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* แถบเปลี่ยนหน้า */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 shadow-2xs">
          <Pagination
            currentPage={currentPage}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[10, 15, 30, 50]}
          />
        </div>
      )}

      {/* โมดัลพิมพ์ PDF A4 */}
      {printTarget && (
        <QuotationPrintModal
          quotation={printTarget}
          items={printItems}
          onClose={() => setPrintTarget(null)}
        />
      )}

      {/* โมดัลพิมพ์จ่าหน้าซอง */}
      {envelopeTarget && (
        <EnvelopePrintModal
          quotation={envelopeTarget}
          onClose={() => setEnvelopeTarget(null)}
        />
      )}

      {/* โมดัลแชร์เว็บลิงก์ & LINE */}
      {shareTarget && (
        <QuotationShareModal
          quotation={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* โมดัลบันทึกการเซ็น PO ของลูกค้า */}
      {customerPoTarget && (
        <CustomerPoModal
          quotation={customerPoTarget}
          onClose={() => setCustomerPoTarget(null)}
          onSuccess={() => fetchQuotations()}
        />
      )}

      {/* โมดัลบันทึกรับชำระเงิน */}
      {paymentTarget && (
        <PaymentActionModal
          isOpen={true}
          type="receive"
          docType="INV"
          docId={paymentTarget.invoice?.id || paymentTarget.quotation?.id}
          docNo={paymentTarget.invoice?.invoice_no || paymentTarget.quotation?.quotation_no}
          contactId={paymentTarget.invoice?.contact_id || null}
          contactName={paymentTarget.quotation?.customer_name}
          totalAmount={Number(
            paymentTarget.invoice?.total_amount ||
              paymentTarget.quotation?.grand_total ||
              paymentTarget.quotation?.net_amount ||
              paymentTarget.quotation?.total_amount ||
              0
          )}
          alreadyPaid={Number(paymentTarget.invoice?.paid_amount || 0)}
          projectId={paymentTarget.quotation?.project_id}
          projectName={paymentTarget.quotation?.projects?.project_name}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => fetchQuotations()}
        />
      )}

    </div>
  )
}
