import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { ensureSalesInvoiceForQuotation } from '../../lib/salesBilling'
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
  Eye,
  FileText,
  DollarSign,
  Search,
  Plus,
  RefreshCw,
  ShoppingCart,
  Calendar,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'

// สถานะการขายแบบเข้าใจง่าย ไม่ซับซ้อน
const STATUS_CONFIG = {
  draft: { label: 'ฉบับร่าง', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  sent: { label: 'ส่งลูกค้าแล้ว', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  approved: { label: 'ลูกค้าเซ็น PO แล้ว', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' },
  rejected: { label: 'ปฏิเสธ / ยกเลิก', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'หมดอายุยืนราคา', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  partial: { label: 'รับชำระบางส่วน', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
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
    return { text: `หมดอายุ (${Math.abs(diffDays)} วัน)`, cls: 'text-rose-600', dot: 'bg-rose-500' }
  }
  if (diffDays <= 7) {
    return { text: diffDays === 0 ? 'ครบกำหนดวันนี้' : `เหลือ ${diffDays} วัน`, cls: 'text-amber-700 font-semibold', dot: 'bg-amber-500' }
  }
  return { text: `เหลือ ${diffDays} วัน`, cls: 'text-emerald-700', dot: 'bg-emerald-500' }
}

export default function QuotationList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'all' // 'all' | 'signed' | 'pipeline'

  const [quotations, setQuotations] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // ตัวกรองแบบกระชับ (Clean Filters)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  // ตัวเลือกการเรียงลำดับมาตรฐานสำหรับงานขายและเสนอราคา
  const QUOTATION_SORT_OPTIONS = [
    { value: 'date_desc', label: ' วันที่สร้างล่าสุด (ใหม่  เก่า)' },
    { value: 'date_asc', label: ' วันที่สร้าง (เก่า  ใหม่)' },
    { value: 'code_desc', label: 'เลขที่ QT (มาก  น้อย)' },
    { value: 'code_asc', label: 'เลขที่ QT (น้อย  มาก)' },
    { value: 'name_asc', label: 'ชื่อลูกค้า/โครงการ ก  ฮ (A  Z)' },
    { value: 'name_desc', label: 'ชื่อลูกค้า/โครงการ ฮ  ก (Z  A)' },
    { value: 'amount_desc', label: 'มูลค่าเสนอราคา (มาก  น้อย)' },
    { value: 'amount_asc', label: 'มูลค่าเสนอราคา (น้อย  มาก)' },
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

  // ปิดเมนู action เมื่อคลิกที่อื่น
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuId(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const changeTab = (tab) => {
    setSearchParams({ tab })
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
      const [qRes, projRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, projects(id, project_code, project_name)')
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
      ])

      if (qRes.error) {
        console.error(qRes.error)
        setQuotations([])
      } else {
        setQuotations(qRes.data || [])
      }
      setProjects(projRes.data || [])
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

  // คำนวณสรุปสถิติ (KPIs)
  const stats = useMemo(() => {
    const totalCount = quotations.length
    const signedCount = quotations.filter((q) => q.status === 'approved' || q.customer_po_no).length
    const sentCount = quotations.filter((q) => q.status === 'sent').length
    const draftCount = quotations.filter((q) => q.status === 'draft').length
    const totalAmount = quotations
      .filter((q) => q.status !== 'rejected')
      .reduce((sum, q) => sum + Number(q.grand_total || q.total_amount || 0), 0)
    const signedAmount = quotations
      .filter((q) => q.status === 'approved' || q.customer_po_no)
      .reduce((sum, q) => sum + Number(q.grand_total || q.total_amount || 0), 0)

    return { totalCount, signedCount, sentCount, draftCount, totalAmount, signedAmount }
  }, [quotations])

  // รายการที่ผ่านการกรอง (Filtered Data)
  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      // 1. กรองตามแท็บ
      if (activeTab === 'signed') {
        const isSigned = q.status === 'approved' || q.customer_po_no
        if (!isSigned) return false
      }

      // 2. กรองตามสถานะ
      if (filterStatus !== 'all' && q.status !== filterStatus) return false

      // 3. กรองตามโครงการ
      if (filterProject && q.project_id !== filterProject) return false

      // 4. กรองข้อความค้นหา
      const term = search.toLowerCase().trim()
      if (term) {
        const match =
          q.quotation_no?.toLowerCase().includes(term) ||
          q.customer_name?.toLowerCase().includes(term) ||
          q.sales_person?.toLowerCase().includes(term) ||
          q.projects?.project_name?.toLowerCase().includes(term) ||
          q.projects?.project_code?.toLowerCase().includes(term) ||
          q.customer_po_no?.toLowerCase().includes(term) ||
          q.customer_signer_name?.toLowerCase().includes(term)
        if (!match) return false
      }

      // 5. กรองช่วงวันที่ (ดูจากวันที่เสนอราคา)
      const targetDate = q.quotation_date || q.issue_date
      if (dateFrom && targetDate && String(targetDate).split('T')[0] < dateFrom) return false
      if (dateTo && targetDate && String(targetDate).split('T')[0] > dateTo) return false

      return true
    })
  }, [quotations, activeTab, filterStatus, filterProject, search, dateFrom, dateTo])

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, filterStatus, filterProject, search, dateFrom, dateTo])

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

      {/* 1. Header & Actions (เรียบหรู สบายตา) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            งานขายและใบเสนอราคา (Sales & Quotations)
          </h1>
          <p className="text-xs text-slate-500">
            ระบบจัดการใบเสนอราคา บันทึกการเซ็น PO ของลูกค้า และส่งต่องานเข้าสู่ฝ่ายจัดซื้อ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/boq"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>ระบบ BOQ</span>
          </Link>

          <Link
            to="/quotations/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            <span> สร้างใบเสนอราคา</span>
          </Link>
        </div>
      </div>

      {/* 2. Sleek Metric Strip (แถบสรุปตัวเลขแบบมินิมอล ไม่กินพื้นที่หน้าจอ) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
        <div className="p-3 text-center sm:text-left">
          <div className="text-[11px] font-medium text-slate-500">ยอดเสนอราคารวม</div>
          <div className="mt-0.5 text-lg font-bold text-slate-900 font-mono">
            {baht(stats.totalAmount)} <span className="text-[10px] font-normal text-slate-500">฿</span>
          </div>
          <div className="text-[10px] text-slate-400">{stats.totalCount} ใบเสนอราคา</div>
        </div>

        <div className="p-3 text-center sm:text-left">
          <div className="text-[11px] font-medium text-emerald-700 flex items-center justify-center sm:justify-start gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>ลูกค้าเซ็น PO แล้ว</span>
          </div>
          <div className="mt-0.5 text-lg font-bold text-emerald-800 font-mono">
            {baht(stats.signedAmount)} <span className="text-[10px] font-normal text-emerald-600">฿</span>
          </div>
          <div className="text-[10px] text-emerald-600 font-medium">{stats.signedCount} ใบ (พร้อมส่งต่อจัดซื้อ)</div>
        </div>

        <div className="p-3 text-center sm:text-left">
          <div className="text-[11px] font-medium text-sky-700 flex items-center justify-center sm:justify-start gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500"></span>
            <span>ส่งลูกค้าพิจารณา</span>
          </div>
          <div className="mt-0.5 text-lg font-bold text-sky-900 font-mono">
            {stats.sentCount} <span className="text-xs font-normal text-slate-500">ใบ</span>
          </div>
          <div className="text-[10px] text-slate-400">อยู่ระหว่างรอบอร์ดอนุมัติ</div>
        </div>

        <div className="p-3 text-center sm:text-left">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-center sm:justify-start gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-400"></span>
            <span>ฉบับร่าง</span>
          </div>
          <div className="mt-0.5 text-lg font-bold text-slate-800 font-mono">
            {stats.draftCount} <span className="text-xs font-normal text-slate-500">ใบ</span>
          </div>
          <div className="text-[10px] text-slate-400">กำลังจัดเตรียมสเปกและราคา</div>
        </div>
      </div>

      {/* 3. Unified Clean Toolbar (แถบตัวกรองรวม แถวเดียว สะอาดตา) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5">

        {/* Navigation Tabs (แท็บเรียบหรู คมชัด) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex gap-1">
            <button
              onClick={() => changeTab('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              ทั้งหมด ({stats.totalCount})
            </button>

            <button
              onClick={() => changeTab('signed')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${activeTab === 'signed'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-emerald-800 hover:bg-emerald-50'
                }`}
            >
              <span>️ ลูกค้าเซ็น PO</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'signed' ? 'bg-emerald-950 text-white' : 'bg-emerald-100 text-emerald-900 font-bold'}`}>
                {stats.signedCount}
              </span>
            </button>

            <button
              onClick={() => changeTab('pipeline')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${activeTab === 'pipeline'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              ไปป์ไลน์วงจรขาย (Pipeline)
            </button>
          </div>

          <div className="text-xs text-slate-400">
            แสดง <strong className="text-slate-800">{filtered.length}</strong> จาก {quotations.length} รายการ
          </div>
        </div>

        {/* Filter Controls Row (ค้นหา, โครงการ, สถานะ, วันที่ อยู่ในแถวเดียว) */}
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
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800"
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
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-slate-800"
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
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-slate-800"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="sent">ส่งลูกค้าแล้ว</option>
              <option value="approved">ลูกค้าอนุมัติ (PO Signed)</option>
              <option value="rejected">ปฏิเสธ / ยกเลิก</option>
              <option value="expired">หมดอายุยืนราคา</option>
            </select>

            {/* Compact Date Preset Dropdown */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={datePreset}
                onChange={(e) => handleDatePresetChange(e.target.value)}
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">ทุกช่วงเวลา</option>
                <option value="today">วันนี้</option>
                <option value="this_week">สัปดาห์นี้</option>
                <option value="this_month">เดือนนี้</option>
                <option value="next_30">30 วันข้างหน้า</option>
                <option value="custom">กำหนดช่วงวันเอง...</option>
              </select>
            </div>

            {/* Custom Date Inputs (แสดงเฉพาะเมื่อเลือก custom) */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-0.5 animate-in fade-in">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs border-0 p-0 text-slate-800 focus:outline-none"
                />
                <span className="text-slate-400">―</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs border-0 p-0 text-slate-800 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer whitespace-nowrap"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* 4. Table Views (สะอาดตา โปร่ง สบายตา อ่านง่าย) */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
          <p className="text-xs">กำลังโหลดรายการใบเสนอราคา...</p>
        </div>
      ) : activeTab === 'pipeline' ? (

        /* TAB 3: ไปป์ไลน์วงจรขาย ➔ จัดซื้อ (Pipeline Step View) */
        <div className="space-y-3">
          {/* Step Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-500">ขั้นที่ 1: เสนอราคา (Draft)</div>
              <div className="text-lg font-bold text-slate-800 mt-0.5">{stats.draftCount} ใบ</div>
              <div className="text-[10px] text-slate-400">จัดทำสเปกและต้นทุน</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-sky-700">ขั้นที่ 2: ส่งลูกค้า (Sent)</div>
              <div className="text-lg font-bold text-sky-900 mt-0.5">{stats.sentCount} ใบ</div>
              <div className="text-[10px] text-slate-400">อยู่ระหว่างรอบอร์ดอนุมัติ</div>
            </div>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-3">
              <div className="text-[11px] font-bold text-emerald-800">ขั้นที่ 3: ลูกค้าเซ็น PO</div>
              <div className="text-lg font-bold text-emerald-900 mt-0.5">{stats.signedCount} ใบ</div>
              <div className="text-[10px] text-emerald-700">อนุมัติเป็นทางการแล้ว</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-500">ขั้นที่ 4: ส่งต่อจัดซื้อ (PO)</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">{baht(stats.signedAmount)} ฿</div>
              <div className="text-[10px] text-slate-400">มูลค่าพร้อมสั่งของ</div>
            </div>
          </div>

          {/* Pipeline Linkage Table (จัดระเบียบตารางทางการ สลับสี มีเส้นตารางชัดเจน) */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <table className="table-auto w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
              <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-3.5 px-3.5 text-center w-40 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่เอกสาร (QT)</th>
                  <th className="py-3.5 px-4 min-w-[220px] border-r border-slate-200/70 dark:border-slate-700/60">ชื่อลูกค้า / โครงการ</th>
                  <th className="py-3.5 px-3 text-center w-48 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">สถานะใบสั่งซื้อลูกค้า (PO)</th>
                  <th className="py-3.5 px-3.5 text-right w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ยอดรวมสุทธิ (บาท)</th>
                  <th className="py-3.5 px-3.5 text-center w-36 whitespace-nowrap">ส่งต่อฝ่ายจัดซื้อ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {quotations.map((q, rowIdx) => {
                  const hasPo = Boolean(q.customer_po_no)
                  return (
                    <tr
                      key={q.id}
                      className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                        rowIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                    >
                      <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <Link to={`/quotations/${q.id}`} className="font-bold text-sky-800 dark:text-sky-400 hover:underline font-mono text-xs block">
                          {q.quotation_no}
                        </Link>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          วันที่: {q.quotation_date || q.issue_date}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[240px]" title={q.customer_name}>
                          {q.customer_name || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px] mt-0.5" title={q.projects?.project_name || 'ทั่วไป'}>
                          {q.projects ? `${q.projects.project_code} • ${q.projects.project_name}` : 'ทั่วไป'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        {hasPo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span>PO: {q.customer_po_no}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium">รอลูกค้าเซ็น PO</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right font-black text-slate-900 dark:text-slate-100 font-mono align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                        ฿{baht(q.grand_total || q.total_amount)}
                      </td>
                      <td className="py-3 px-3.5 text-center align-middle whitespace-nowrap">
                        {hasPo ? (
                          <Link
                            to={`/purchasing/po/new?quotation_id=${q.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 px-2.5 py-1 text-xs font-bold text-white dark:text-slate-950 shadow-2xs transition"
                          >
                            <ShoppingCart className="h-3 w-3 text-amber-400 dark:text-slate-950" />
                            <span>เปิด PO จัดซื้อ</span>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCustomerPoTarget(q)}
                            className="text-xs text-sky-700 dark:text-sky-400 hover:underline font-semibold cursor-pointer"
                          >
                            + บันทึก PO ก่อน
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      ) : (

        /* TAB 1 & 2: ตารางหลัก (High-Legibility Table - สบายตา ไม่ซับซ้อน) */
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs min-h-[380px] pb-16">
          <table className="table-auto w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-3.5 px-3.5 text-center w-40 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่เอกสาร (QT)</th>
                <th className="py-3.5 px-4 min-w-[220px] border-r border-slate-200/70 dark:border-slate-700/60">ชื่อลูกค้า / โครงการ</th>
                <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">กำหนดยืนราคา</th>
                <th className="py-3.5 px-3.5 text-right w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ยอดรวมสุทธิ (บาท)</th>
                <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">สถานะเอกสาร</th>
                <th className="py-3.5 px-3.5 text-center w-28 whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="text-2xl mb-1"></div>
                    <div className="font-medium text-slate-600 dark:text-slate-300">ไม่พบใบเสนอราคาตามเงื่อนไขที่เลือก</div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ลองเปลี่ยนคำค้นหา หรือกด "ล้างตัวกรอง"</p>
                  </td>
                </tr>
              ) : (
                paginatedQuotations.map((q, rowIdx) => {
                  const status = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft
                  const expInfo = getExpiryInfo(q)
                  const isMenuOpen = actionMenuId === q.id
                  const hasCustomerPo = Boolean(q.customer_po_no)

                  return (
                    <tr
                      key={q.id}
                      className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                        rowIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } ${isMenuOpen ? 'relative z-30' : ''} hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                    >
                      {/* 1. เลขที่ QT + วันที่ (จัดกึ่งกลาง บน-ล่าง ซ้าย-ขวา) */}
                      <td className="py-3 px-3.5 text-center align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <Link
                          to={`/quotations/${q.id}`}
                          className="font-bold text-sky-800 dark:text-sky-400 hover:underline font-mono text-xs block"
                        >
                          {q.quotation_no}
                        </Link>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {q.quotation_date || q.issue_date}
                        </div>
                        {hasCustomerPo && (
                          <div className="mt-1 flex justify-center">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span>PO: {q.customer_po_no}</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. ลูกค้า / โครงการ (กึ่งกลางบน-ล่าง ชิดซ้าย ย่อข้อความแต่ hover อ่านได้) */}
                      <td className="py-3 px-4 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[240px]" title={q.customer_name}>
                          {q.customer_name || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px] mt-0.5" title={q.projects ? `${q.projects.project_code} • ${q.projects.project_name}` : (q.ref_no || 'โครงการทั่วไป')}>
                          {q.projects ? `${q.projects.project_code} • ${q.projects.project_name}` : (q.ref_no || 'โครงการทั่วไป')}
                        </div>
                      </td>

                      {/* 3. วันสิ้นสุดยืนราคา (จัดกึ่งกลาง บน-ล่าง ซ้าย-ขวา) */}
                      <td className="py-3 px-3 text-center align-middle whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="text-slate-700 dark:text-slate-300 font-mono text-xs font-semibold">
                          {q.valid_until || q.expiry_date || '-'}
                        </div>
                        {expInfo && (
                          <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[11px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${expInfo.dot}`}></span>
                            <span className={expInfo.cls}>{expInfo.text}</span>
                          </div>
                        )}
                      </td>

                      {/* 4. ยอดสุทธิ (กึ่งกลางบน-ล่าง ชิดขวาตามแบบการเงิน) */}
                      <td className="py-3 px-3.5 align-middle text-right whitespace-nowrap font-mono border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                        <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
                          ฿{baht(q.grand_total || q.total_amount || q.net_amount)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">รวม VAT 7%</div>
                      </td>

                      {/* 5. สถานะ (Single Status Badge สะอาดตา จัดกึ่งกลาง) */}
                      <td className="py-3 px-3 align-middle text-center whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>

                      {/* 6. การจัดการ (Action Menu กะทัดรัด จัดกึ่งกลาง) */}
                      <td className="py-3 px-3.5 align-middle text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">

                          {/* Quick Link to Details */}
                          <Link
                            to={`/quotations/${q.id}`}
                            className="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            ดูเอกสาร
                          </Link>

                          {/* Action Popover Menu (⋯) */}
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
                                  <span>️</span>
                                  <span>{hasCustomerPo ? 'แก้ไขข้อมูล PO ลูกค้า' : 'บันทึก PO ลูกค้า'}</span>
                                </button>

                                {hasCustomerPo && (
                                  <Link
                                    to={`/purchasing/po/new?quotation_id=${q.id}`}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-amber-900 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-semibold transition"
                                  >
                                    <ShoppingCart className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                    <span>ส่งต่อฝ่ายจัดซื้อ (เปิด PO)</span>
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
                                  <span>แชร์ลิงก์ & LINE</span>
                                </button>

                                <Link
                                  to={`/quotations/new?duplicate_from=${q.id}`}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition"
                                >
                                  <Copy className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                                  <span>ทำซ้ำใบเสนอราคา (Duplicate)</span>
                                </Link>

                                {(q.status === 'approved' || q.status === 'partial') && (
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

      {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs">
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
