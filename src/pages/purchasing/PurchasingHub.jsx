import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, PO_STATUS, canCreatePurchasing, canReceiveGoods } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { getPoDueStatus, formatThaiDate } from '../../lib/poDueStatus'
import Badge from './Badge'
import PaymentActionModal from '../../components/PaymentActionModal'
import PODocumentModal from '../../components/reports/PODocumentModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import POShareModal from '../../components/purchasing/POShareModal'
import {
  Printer,
  Mail,
  Share2,
  Copy,
  Edit3,
  Trash2,
  MoreVertical,
  Eye,
  Download,
  AlertTriangle,
  Clock,
  Truck,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Package,
  FileText,
  Calendar,
  X,
} from 'lucide-react'

export default function PurchasingHub() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'pipeline' // 'pipeline' | 'pr' | 'po' | 'receipts'
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // โมดัลต่าง ๆ
  const [paymentTargetPo, setPaymentTargetPo] = useState(null)
  const [selectedPoForPrint, setSelectedPoForPrint] = useState(null)
  const [selectedPoForEnvelope, setSelectedPoForEnvelope] = useState(null)
  const [selectedPoForShare, setSelectedPoForShare] = useState(null)
  const [actionMenuPoId, setActionMenuPoId] = useState(null)

  const [prs, setPrs] = useState([])
  const [pos, setPos] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ตัวกรอง
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDueStatus, setFilterDueStatus] = useState('all') // 'all' | 'overdue' | 'urgent' | 'on_track' | 'completed' | 'no_date'

  // ตัวกรองวันที่ (Date Search & Filters)
  const [dateType, setDateType] = useState('expected_delivery_date') // 'expected_delivery_date' | 'order_date' | 'request_date'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'next_7_days' | 'next_30_days' | 'custom'

  const canCreate = canCreatePurchasing(profile.role)
  const canReceive = canReceiveGoods(profile.role)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [prsRes, posRes, projRes, venRes] = await Promise.all([
        supabase
          .from('purchase_requisitions')
          .select('id, pr_no, request_date, status, notes, project_id, projects(id, project_code, project_name), purchase_requisition_items(*)')
          .order('request_date', { ascending: false })
          .order('pr_no', { ascending: false }),
        supabase
          .from('purchase_orders')
          .select(
            'id, po_no, pr_id, order_date, expected_delivery_date, delivery_address, notes, total_amount, net_amount, status, payment_type, quotation_no, quotation_date, buyer_name, vendor_id, project_id, vendors(id, vendor_code, vendor_name, contact_person, phone, tax_id, address), projects(id, project_code, project_name), pr:purchase_requisitions(id, pr_no), purchase_order_items(*)'
          )
          .order('order_date', { ascending: false })
          .order('po_no', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('vendors').select('id, vendor_code, vendor_name, contact_person, phone, tax_id, address').order('vendor_code'),
      ])

      if (prsRes.error) throw prsRes.error
      if (posRes.error) throw posRes.error

      setPrs(prsRes.data ?? [])
      setPos(posRes.data ?? [])
      setProjects(projRes.data ?? [])
      setVendors(venRes.data ?? [])
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถโหลดข้อมูลจัดซื้อได้')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const tab = searchParams.get('tab') || 'pipeline'
    setActiveTab(tab)
  }, [searchParams])

  const changeTab = (tab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
    setActionMenuPoId(null)
    if (tab === 'pr') {
      setDateType('request_date')
    } else if (tab === 'po') {
      setDateType('expected_delivery_date')
    } else if (tab === 'receipts') {
      setDateType('expected_delivery_date')
    } else if (tab === 'pipeline') {
      setDateType('order_date')
    }
  }

  // ปิดเมนู action เมื่อคลิกที่อื่น
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuPoId(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // ฟังก์ชันคำนวณและตั้งค่าปุ่มลัดวันที่ด่วน
  const applyDatePreset = (preset) => {
    setDatePreset(preset)
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }

    if (preset === 'today') {
      const today = toYMD(now)
      setDateFrom(today)
      setDateTo(today)
    } else if (preset === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yesterday = toYMD(y)
      setDateFrom(yesterday)
      setDateTo(yesterday)
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
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    } else if (preset === 'next_7_days') {
      const start = new Date(now)
      const end = new Date(now)
      end.setDate(end.getDate() + 7)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    } else if (preset === 'next_30_days') {
      const start = new Date(now)
      const end = new Date(now)
      end.setDate(end.getDate() + 30)
      setDateFrom(toYMD(start))
      setDateTo(toYMD(end))
    }
  }

  // ฟังก์ชันตรวจสอบว่าวันที่อยู่ในช่วงที่เลือกหรือไม่
  const checkDateRange = (dateStr) => {
    if (!dateFrom && !dateTo) return true
    if (!dateStr) return false
    const cleanDate = String(dateStr).split('T')[0]
    if (dateFrom && cleanDate < dateFrom) return false
    if (dateTo && cleanDate > dateTo) return false
    return true
  }

  // ข้อความแสดงชื่อประเภทวันที่ที่เลือก
  const getDateTypeLabel = () => {
    if (activeTab === 'po') {
      return dateType === 'order_date' ? 'วันที่สั่งซื้อ (Order Date)' : 'วันครบกำหนดส่งมอบ (Due Date)'
    }
    if (activeTab === 'pr') {
      return 'วันที่ขอซื้อ (Request Date)'
    }
    if (activeTab === 'receipts') {
      return dateType === 'order_date' ? 'วันที่สั่งซื้อ (Order Date)' : 'วันครบกำหนดส่งของ (Due Date)'
    }
    return dateType === 'order_date' ? 'วันที่สั่งซื้อ PO' : 'วันที่ขอซื้อ PR'
  }

  // ฟังก์ชันล้างตัวกรองทั้งหมด
  const clearAllFilters = () => {
    setSearch('')
    setFilterProject('')
    setFilterStatus('')
    setFilterDueStatus('all')
    setDateFrom('')
    setDateTo('')
    setDatePreset('all')
  }

  const hasActiveFilter = Boolean(search || filterProject || filterStatus || filterDueStatus !== 'all' || dateFrom || dateTo)

  // ฟังก์ชันลบ PO
  const handleDeletePo = async (poToDelete) => {
    if (!confirm(`ยืนยันการลบใบสั่งซื้อ ${poToDelete.po_no}? ข้อมูลและรายการวัสดุจะถูกลบออกจากระบบ`)) return
    try {
      const { error: rpcErr } = await supabase.rpc('delete_purchase_order', {
        p_po_id: poToDelete.id,
        p_reason: 'ลบจากหน้าศูนย์จัดซื้อ',
      })
      if (rpcErr) {
        // Fallback delete
        const { error: directErr } = await supabase.from('purchase_orders').delete().eq('id', poToDelete.id)
        if (directErr) throw directErr
      }
      setPos((prev) => prev.filter((p) => p.id !== poToDelete.id))
      setActionMenuPoId(null)
    } catch (err) {
      alert('ไม่สามารถลบใบสั่งซื้อได้: ' + (err.message || 'โปรดตรวจสอบสิทธิ์หรือรายการตรวจรับของ'))
    }
  }

  // คำนวณสรุปยอด (KPIs)
  const pendingPrs = prs.filter((p) => p.status === 'pending')
  const openPos = pos.filter((p) => p.status === 'open')
  const partialPos = pos.filter((p) => p.status === 'partial')
  const totalSpend = pos.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + Number(p.total_amount || 0), 0)

  // คำนวณสถิติสถานะวันครบกำหนดส่งมอบ (Due Date Status Tracking)
  const overduePos = pos.filter((p) => getPoDueStatus(p)?.code === 'overdue')
  const dueSoonPos = pos.filter((p) => ['urgent', 'today'].includes(getPoDueStatus(p)?.code))
  const onTrackPos = pos.filter((p) => getPoDueStatus(p)?.code === 'on_track')
  const completedPos = pos.filter((p) => getPoDueStatus(p)?.code === 'completed')

  // แผนผังจับคู่ PR กับ PO
  const poByPrId = pos.reduce((acc, po) => {
    if (po.pr_id) {
      if (!acc[po.pr_id]) acc[po.pr_id] = []
      acc[po.pr_id].push(po)
    }
    return acc
  }, {})

  // ตัวกรอง
  const q = search.trim().toLowerCase()
  const filterRow = (row, fields) => {
    if (filterProject && row.project_id !== filterProject) return false
    if (filterStatus && row.status !== filterStatus) return false
    if (!q) return true
    return fields.some((f) => String(f || '').toLowerCase().includes(q))
  }

  const filteredPrs = prs.filter((r) => {
    if (!filterRow(r, [r.pr_no, r.projects?.project_name, r.projects?.project_code, r.notes])) return false
    if (!checkDateRange(r.request_date)) return false
    return true
  })

  const filteredPos = pos.filter((r) => {
    if (!filterRow(r, [r.po_no, r.vendors?.vendor_name, r.projects?.project_name, r.projects?.project_code, r.pr?.pr_no, r.buyer_name])) {
      return false
    }
    if (filterDueStatus !== 'all') {
      const due = getPoDueStatus(r)?.code
      if (filterDueStatus === 'overdue' && due !== 'overdue') return false
      if (filterDueStatus === 'urgent' && !['urgent', 'today'].includes(due)) return false
      if (filterDueStatus === 'on_track' && due !== 'on_track') return false
      if (filterDueStatus === 'completed' && due !== 'completed') return false
      if (filterDueStatus === 'no_date' && due !== 'no_date') return false
    }
    const targetDate = dateType === 'order_date' ? r.order_date : r.expected_delivery_date
    if (!checkDateRange(targetDate)) return false
    return true
  })

  const pendingReceipts = pos.filter((p) => {
    if (!['open', 'partial'].includes(p.status)) return false
    if (!filterRow(p, [p.po_no, p.vendors?.vendor_name, p.projects?.project_name])) return false
    const targetDate = dateType === 'order_date' ? p.order_date : p.expected_delivery_date
    if (!checkDateRange(targetDate)) return false
    return true
  })

  const filteredPipelinePrs = prs.filter((r) => {
    if (!filterRow(r, [r.pr_no, r.projects?.project_name, r.projects?.project_code, r.notes])) return false
    if (dateType === 'order_date') {
      const linked = poByPrId[r.id] || []
      if (dateFrom || dateTo) {
        if (linked.length === 0) return false
        const matches = linked.some((p) => checkDateRange(p.order_date))
        if (!matches) return false
      }
    } else {
      if (!checkDateRange(r.request_date)) return false
    }
    return true
  })

  return (
    <div className="space-y-5">
      
      {/* 1. ส่วนหัวและปุ่มสร้างงานหลัก */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">
            {activeTab === 'po'
              ? '🛒 รายการใบสั่งซื้อ & รายงานครบกำหนด (PO Hub)'
              : activeTab === 'pr'
              ? '📋 รายการใบขอซื้อ (PR)'
              : activeTab === 'receipts'
              ? '📦 ตรวจรับสินค้าเข้าสโตร์ (GR)'
              : 'ศูนย์จัดการจัดซื้อและพัสดุ (Purchasing Hub)'}
          </h2>
          <p className="text-xs sm:text-sm text-steel-500">
            {activeTab === 'po'
              ? 'จัดการใบสั่งซื้อ ติดตามวันครบกำหนดส่งของ พิมพ์เอกสาร A4 จ่าหน้าซอง และส่งต่อบัญชี'
              : activeTab === 'pr'
              ? 'จัดการคำขอจัดซื้อจากหน้างาน อนุมัติ และส่งต่อเพื่อออกใบสั่งซื้อ'
              : activeTab === 'receipts'
              ? 'ตรวจรับสินค้าจากคู่ค้า บันทึกเข้าสต็อก และลงบัญชีสินค้าคงคลัง'
              : 'ภาพรวมวงจรจัดซื้อตั้งแต่ขอซื้อ (PR) ออกคำสั่งซื้อ (PO) จนถึงตรวจรับสินค้าเข้าสต็อก (GR)'}
          </p>
        </div>

        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Link
              to="/purchasing/po/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-steel-900 hover:bg-steel-800 px-3.5 py-2 text-xs sm:text-sm font-bold text-hivis shadow-md transition"
            >
              <Plus className="h-4 w-4" />
              <span>สร้างใบสั่งซื้อ (PO)</span>
            </Link>
            <Link
              to="/purchasing/pr/new"
              className="inline-flex items-center gap-1.5 rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3.5 py-2 text-xs sm:text-sm font-bold text-steel-800 shadow-xs transition"
            >
              <span>+ ออกใบขอซื้อ (PR)</span>
            </Link>
          </div>
        )}
      </div>

      {/* 2. รายงานวันครบกำหนดส่งมอบ (Due Date & Delivery Report Banner) สำหรับหน้า PO */}
      {activeTab === 'po' && (
        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-hivis shrink-0" />
              <h3 className="text-xs font-black text-ink uppercase tracking-wider">
                📊 รายงานติดตามวันครบกำหนดส่งมอบสินค้า (PO Due Date & Delivery Report)
              </h3>
            </div>
            {filterDueStatus !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterDueStatus('all')}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                ✕ แสดงทุกสถานะกำหนดส่ง
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: เกินกำหนดส่งมอบ (Overdue) */}
            <button
              type="button"
              onClick={() => setFilterDueStatus(filterDueStatus === 'overdue' ? 'all' : 'overdue')}
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                filterDueStatus === 'overdue'
                  ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-400'
                  : 'border-rose-200 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
                  <span>🚨</span> เกินกำหนดส่งมอบ
                </span>
                {overduePos.length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-rose-900">
                {overduePos.length} <span className="text-xs font-normal text-rose-700">ใบ</span>
              </div>
              <div className="mt-0.5 text-[11px] text-rose-700">เลยกำหนด ต้องเร่งรัดผู้ขาย</div>
            </button>

            {/* Card 2: ใกล้ครบกำหนด (Urgent / 7 วัน) */}
            <button
              type="button"
              onClick={() => setFilterDueStatus(filterDueStatus === 'urgent' ? 'all' : 'urgent')}
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                filterDueStatus === 'urgent'
                  ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400'
                  : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-300'
              }`}
            >
              <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                <span>⏰</span> ใกล้ครบกำหนด
              </div>
              <div className="mt-1 text-2xl font-black text-amber-900">
                {dueSoonPos.length} <span className="text-xs font-normal text-amber-700">ใบ</span>
              </div>
              <div className="mt-0.5 text-[11px] text-amber-700">กำหนดส่งภายใน 7 วันนี้</div>
            </button>

            {/* Card 3: รอนำส่งตามกำหนด (On Track) */}
            <button
              type="button"
              onClick={() => setFilterDueStatus(filterDueStatus === 'on_track' ? 'all' : 'on_track')}
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                filterDueStatus === 'on_track'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400'
                  : 'border-steel-200 bg-white hover:bg-blue-50/50 hover:border-blue-300'
              }`}
            >
              <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                <span>🚚</span> รอนำส่งตามกำหนด
              </div>
              <div className="mt-1 text-2xl font-black text-blue-900">
                {onTrackPos.length} <span className="text-xs font-normal text-blue-700">ใบ</span>
              </div>
              <div className="mt-0.5 text-[11px] text-steel-500">อยู่ในกำหนดระยะเวลาปกติ</div>
            </button>

            {/* Card 4: ส่งมอบครบถ้วนแล้ว (Delivered) */}
            <button
              type="button"
              onClick={() => setFilterDueStatus(filterDueStatus === 'completed' ? 'all' : 'completed')}
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                filterDueStatus === 'completed'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400'
                  : 'border-steel-200 bg-white hover:bg-emerald-50/50 hover:border-emerald-300'
              }`}
            >
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <span>✅</span> ส่งมอบครบแล้ว
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-900">
                {completedPos.length} <span className="text-xs font-normal text-emerald-700">ใบ</span>
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-700">ตรวจรับเข้าสต็อกเสร็จสิ้น</div>
            </button>
          </div>
        </div>
      )}

      {/* 3. แถบตัวกรองและควบคุมการแสดงผล (Filters) */}
      <div className="rounded-2xl bg-white p-4 shadow-xs border border-steel-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 pb-3">
          
          {/* แถบสลับ Tab หลัก */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => changeTab('pipeline')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === 'pipeline'
                  ? 'bg-steel-900 text-hivis shadow-sm'
                  : 'text-steel-600 hover:bg-steel-100'
              }`}
            >
              🔄 สายงาน PR ➔ PO (Pipeline)
            </button>
            <button
              onClick={() => changeTab('po')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === 'po'
                  ? 'bg-steel-900 text-hivis shadow-sm'
                  : 'text-steel-600 hover:bg-steel-100'
              }`}
            >
              🛒 ใบสั่งซื้อ (PO) <span className="ml-1 rounded-full bg-steel-700 text-white px-1.5 py-0.2 text-[10px]">{pos.length}</span>
            </button>
            <button
              onClick={() => changeTab('pr')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === 'pr'
                  ? 'bg-steel-900 text-hivis shadow-sm'
                  : 'text-steel-600 hover:bg-steel-100'
              }`}
            >
              📋 ใบขอซื้อ (PR) <span className="ml-1 rounded-full bg-steel-200 text-steel-800 px-1.5 py-0.2 text-[10px]">{prs.length}</span>
            </button>
            <button
              onClick={() => changeTab('receipts')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === 'receipts'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              📦 ตรวจรับของเข้าสโตร์ <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">{pendingReceipts.length}</span>
            </button>
          </div>

          {/* ช่องค้นหา */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:max-w-xs">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-steel-400" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่, ร้านค้า, โครงการ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-steel-200 bg-steel-50/50 pl-8 pr-3 py-1.5 text-xs text-steel-900 focus:outline-none focus:border-steel-800"
              />
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="whitespace-nowrap text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* ตัวกรองรอง */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-steel-600">โครงการ:</span>
            <select
              className="rounded-lg border border-steel-200 bg-white px-2.5 py-1 text-xs text-steel-800 focus:outline-none"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="">ทุกโครงการ</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} {p.project_name}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'po' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-steel-600">สถานะกำหนดส่ง:</span>
              <select
                className="rounded-lg border border-steel-200 bg-white px-2.5 py-1 text-xs text-steel-800 focus:outline-none"
                value={filterDueStatus}
                onChange={(e) => setFilterDueStatus(e.target.value)}
              >
                <option value="all">ทุกกำหนดส่ง ({pos.length})</option>
                <option value="overdue">🚨 เกินกำหนดส่งมอบ ({overduePos.length})</option>
                <option value="urgent">⏰ ใกล้ครบกำหนด 7 วัน ({dueSoonPos.length})</option>
                <option value="on_track">🚚 รอนำส่งตามกำหนด ({onTrackPos.length})</option>
                <option value="completed">✅ ส่งมอบครบแล้ว ({completedPos.length})</option>
                <option value="no_date">⏳ ไม่ระบุวันส่งมอบ</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-steel-600">สถานะรับของ:</span>
            <select
              className="rounded-lg border border-steel-200 bg-white px-2.5 py-1 text-xs text-steel-800 focus:outline-none"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">ทุกสถานะ</option>
              <option value="open">รอรับของ (Open)</option>
              <option value="partial">รับของบางส่วน (Partial)</option>
              <option value="received">รับของครบแล้ว (Received)</option>
              <option value="cancelled">ยกเลิก (Cancelled)</option>
            </select>
          </div>
        </div>

        {/* แถบตัวกรองวันที่ (Date Range Filter & Quick Presets) สำหรับทุกแท็บจัดซื้อ */}
        <div className="rounded-xl border border-steel-200/90 bg-steel-50/70 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            
            {/* ด้านซ้าย: ประเภทวันที่ + Input จากวันที่ - ถึงวันที่ */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-steel-800 bg-white px-2.5 py-1 rounded-lg border border-steel-200 shadow-2xs">
                <Calendar className="h-3.5 w-3.5 text-sky-600" />
                <span>ค้นหาวันที่:</span>
              </div>

              {/* เลือกประเภทวันที่ที่ต้องการค้นหา */}
              {activeTab === 'po' && (
                <select
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value)}
                  className="rounded-lg border border-steel-300 bg-white px-2.5 py-1 text-xs font-semibold text-steel-800 focus:outline-none focus:border-steel-800 shadow-2xs"
                >
                  <option value="expected_delivery_date">🚚 วันครบกำหนดส่งมอบ (Due Date)</option>
                  <option value="order_date">📅 วันที่สั่งซื้อ (Order Date)</option>
                </select>
              )}

              {activeTab === 'receipts' && (
                <select
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value)}
                  className="rounded-lg border border-steel-300 bg-white px-2.5 py-1 text-xs font-semibold text-steel-800 focus:outline-none focus:border-steel-800 shadow-2xs"
                >
                  <option value="expected_delivery_date">🚚 วันครบกำหนดส่งของ (Due Date)</option>
                  <option value="order_date">📅 วันที่สั่งซื้อ (Order Date)</option>
                </select>
              )}

              {activeTab === 'pr' && (
                <div className="rounded-lg border border-steel-200 bg-white px-2.5 py-1 text-xs font-semibold text-steel-800 shadow-2xs">
                  📋 วันที่ขอซื้อ (Request Date)
                </div>
              )}

              {activeTab === 'pipeline' && (
                <select
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value)}
                  className="rounded-lg border border-steel-300 bg-white px-2.5 py-1 text-xs font-semibold text-steel-800 focus:outline-none focus:border-steel-800 shadow-2xs"
                >
                  <option value="request_date">📋 วันที่ขอซื้อ (PR Date)</option>
                  <option value="order_date">🛒 วันที่สั่งซื้อ (PO Date)</option>
                </select>
              )}

              {/* ช่องเลือกวันที่เริ่มต้นและสิ้นสุด */}
              <div className="flex items-center gap-1.5 bg-white border border-steel-300 rounded-lg px-2 py-1 shadow-2xs">
                <span className="text-[11px] font-medium text-steel-500">เริ่ม:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setDatePreset('custom')
                  }}
                  className="rounded border-0 p-0 text-xs font-medium text-steel-900 focus:outline-none"
                />
                <span className="text-steel-300 px-0.5 font-bold">―</span>
                <span className="text-[11px] font-medium text-steel-500">ถึง:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setDatePreset('custom')
                  }}
                  className="rounded border-0 p-0 text-xs font-medium text-steel-900 focus:outline-none"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                      setDatePreset('all')
                    }}
                    className="ml-1 text-steel-400 hover:text-rose-600 rounded p-0.5 transition cursor-pointer"
                    title="ล้างช่วงวันที่"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ด้านขวา: ปุ่มลัดช่วงเวลายอดนิยม (Presets) */}
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-steel-400 font-medium mr-1 hidden sm:inline">ลัดช่วงเวลา:</span>
              {[
                { id: 'today', label: 'วันนี้' },
                { id: 'this_week', label: 'สัปดาห์นี้' },
                { id: 'this_month', label: 'เดือนนี้' },
                { id: 'next_7_days', label: '7 วันข้างหน้า', highlight: true },
                { id: 'next_30_days', label: '30 วันข้างหน้า' },
                { id: 'last_month', label: 'เดือนที่แล้ว' },
                { id: 'all', label: 'ทุกช่วงเวลา' },
              ].map((p) => {
                const isSelected = datePreset === p.id && (p.id !== 'all' || (!dateFrom && !dateTo))
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyDatePreset(p.id)}
                    className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-steel-900 text-hivis shadow-xs font-bold'
                        : p.highlight
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                        : 'bg-white text-steel-600 border border-steel-200 hover:bg-steel-100 hover:text-steel-900'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* แถบสรุปผลลัพธ์การกรองวันที่ (ถ้ามีการระบุวันที่) */}
          {(dateFrom || dateTo) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-steel-200/60 text-xs text-sky-900 bg-sky-50/70 px-3 py-1.5 rounded-lg border border-sky-200/70">
              <div className="flex items-center gap-1.5">
                <span>🔍</span>
                <span>
                  กรองตาม <strong>{getDateTypeLabel()}</strong>:
                  {dateFrom && dateTo ? (
                    <span> ตั้งแต่วันที่ <strong>{formatThaiDate(dateFrom)}</strong> ถึง <strong>{formatThaiDate(dateTo)}</strong></span>
                  ) : dateFrom ? (
                    <span> ตั้งแต่วันที่ <strong>{formatThaiDate(dateFrom)}</strong> เป็นต้นไป</span>
                  ) : (
                    <span> จนถึงวันที่ <strong>{formatThaiDate(dateTo)}</strong></span>
                  )}
                </span>
                <span className="ml-1 text-[11px] font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                  พบ {activeTab === 'po' ? filteredPos.length : activeTab === 'pr' ? filteredPrs.length : activeTab === 'receipts' ? pendingReceipts.length : filteredPipelinePrs.length} รายการ
                </span>
              </div>
              <button
                type="button"
                onClick={() => applyDatePreset('all')}
                className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer"
              >
                ✕ ยกเลิกการกรองวันที่
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. เนื้อหาตามแท็บที่เลือก */}
      {loading ? (
        <div className="rounded-2xl border border-steel-200 bg-white p-12 text-center text-steel-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-steel-400 mb-2" />
          <p className="text-xs font-semibold">กำลังโหลดข้อมูลระบบจัดซื้อ...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 text-xs font-semibold">
          {error}
        </div>
      ) : (
        <>
          {/* TAB 1: รายการใบสั่งซื้อทั้งหมด (PO) พร้อมระบบ 7 ฟังก์ชัน และรายงานวันครบกำหนด */}
          {activeTab === 'po' && (
            <div className="rounded-2xl border border-steel-200 bg-white shadow-xs overflow-hidden">
              <div className="p-4 border-b border-steel-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-steel-900">
                    รายการใบสั่งซื้อทั้งหมด ({filteredPos.length} รายการ)
                  </span>
                  {filterDueStatus !== 'all' && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                      กรอง: {filterDueStatus}
                    </span>
                  )}
                </div>
                <div className="text-xs text-steel-500">
                  คลิกที่ปุ่ม <span className="font-mono font-bold bg-steel-100 px-1 py-0.5 rounded">⋯</span> เพื่อเลือกคำสั่งพิมพ์, จ่าซอง, แชร์, สร้างซ้ำ หรือลบ
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-steel-200 min-w-[1050px]">
                  <thead className="bg-steel-50/90 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5 w-36">เลขที่ PO / วันที่</th>
                      <th className="py-3 px-3.5 min-w-[180px]">ผู้ขาย / ร้านค้า</th>
                      <th className="py-3 px-3.5 min-w-[170px]">โครงการ</th>
                      <th className="py-3 px-3.5 w-32 text-right">ยอดรวม (บาท)</th>
                      <th className="py-3 px-3.5 min-w-[160px]">วันครบกำหนด (Due Date)</th>
                      <th className="py-3 px-3 w-28 text-center">การรับของ</th>
                      <th className="py-3 px-3.5 w-44 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100 bg-white">
                    {filteredPos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-steel-400">
                          <Package className="mx-auto h-8 w-8 text-steel-300 mb-2" />
                          <p className="font-semibold text-xs">ไม่พบใบสั่งซื้อตามเงื่อนไขที่เลือก</p>
                          {canCreate && (
                            <Link
                              to="/purchasing/po/new"
                              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-steel-900 px-3.5 py-1.5 text-xs font-bold text-hivis hover:bg-steel-800 transition"
                            >
                              + สร้างใบสั่งซื้อใหม่
                            </Link>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredPos.map((r) => {
                        const dueStatus = getPoDueStatus(r)
                        const isMenuOpen = actionMenuPoId === r.id

                        return (
                          <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                            {/* 1. เลขที่ PO + วันที่สั่งซื้อ */}
                            <td className="py-3 px-3.5 align-top whitespace-nowrap">
                              <Link
                                to={`/purchasing/po/${r.id}`}
                                className="font-bold text-emerald-700 hover:underline flex items-center gap-1"
                              >
                                <span>📄</span>
                                <span>{r.po_no}</span>
                              </Link>
                              <div className="text-[11px] text-steel-500 mt-0.5">
                                วันที่: {formatThaiDate(r.order_date)}
                              </div>
                              {r.pr?.pr_no && (
                                <div className="text-[10px] text-sky-700 font-mono mt-0.5">
                                  PR: {r.pr.pr_no}
                                </div>
                              )}
                            </td>

                            {/* 2. ผู้ขาย / ร้านค้า */}
                            <td className="py-3 px-3.5 align-top">
                              <div className="font-bold text-steel-900 truncate max-w-[200px]" title={r.vendors?.vendor_name}>
                                {r.vendors?.vendor_name || '-'}
                              </div>
                              <div className="text-[11px] text-steel-500 truncate max-w-[200px]">
                                {r.vendors?.contact_person ? `ติดต่อ: ${r.vendors.contact_person}` : ''}
                                {r.vendors?.phone ? ` โทร: ${r.vendors.phone}` : ''}
                              </div>
                            </td>

                            {/* 3. โครงการ */}
                            <td className="py-3 px-3.5 align-top">
                              <div className="font-bold text-steel-900 truncate max-w-[190px]" title={r.projects?.project_name}>
                                {r.projects ? r.projects.project_code : 'ของกลางบริษัท'}
                              </div>
                              <div className="text-[11px] text-steel-600 truncate max-w-[190px]">
                                {r.projects?.project_name || 'สต็อกส่วนกลาง'}
                              </div>
                            </td>

                            {/* 4. ยอดรวมสุทธิ */}
                            <td className="py-3 px-3.5 align-top text-right font-black text-ink whitespace-nowrap">
                              <div>{baht(r.total_amount)}</div>
                              <div className="text-[10px] text-steel-400 font-normal">บาท</div>
                            </td>

                            {/* 5. วันครบกำหนดส่งมอบ + Badge วิเคราะห์กำหนด */}
                            <td className="py-3 px-3.5 align-top">
                              <div className="font-mono text-xs font-bold text-steel-800">
                                {r.expected_delivery_date ? formatThaiDate(r.expected_delivery_date) : '-'}
                              </div>
                              {dueStatus && (
                                <div className="mt-1">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${dueStatus.badgeCls}`}>
                                    <span>{dueStatus.icon}</span>
                                    <span>{dueStatus.label}</span>
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* 6. สถานะการรับของ */}
                            <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                              <Badge map={PO_STATUS} status={r.status} />
                            </td>

                            {/* 7. การจัดการ (Action Bar + Dropdown เมนู 7 ฟังก์ชัน) */}
                            <td className="py-3 px-3.5 align-top text-right whitespace-nowrap relative">
                              <div className="inline-flex items-center justify-end gap-1 shrink-0">
                                {/* ปุ่มด่วน 1: ดูรายละเอียด */}
                                <Link
                                  to={`/purchasing/po/${r.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-steel-300 bg-white hover:bg-steel-50 px-2 py-1 text-xs font-semibold text-steel-700 transition shadow-xs"
                                  title="ดูรายละเอียดใบสั่งซื้อ"
                                >
                                  <Eye className="h-3.5 w-3.5 text-steel-500" />
                                  <span>ดู</span>
                                </Link>

                                {/* ปุ่มด่วน 2: พิมพ์ A4 */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedPoForPrint(r)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs font-bold text-white transition shadow-xs cursor-pointer"
                                  title="พิมพ์ใบสั่งซื้อ A4 / บันทึก PDF"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  <span>พิมพ์</span>
                                </button>

                                {/* ปุ่ม Action Menu Dropdown (3 จุด) รวม 7 ฟังก์ชัน */}
                                <div className="relative inline-block text-left">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setActionMenuPoId(isMenuOpen ? null : r.id)
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-steel-200 bg-white hover:bg-steel-100 p-1 text-steel-600 transition cursor-pointer"
                                    title="เมนูคำสั่งเพิ่มเติม"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>

                                  {isMenuOpen && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-7 z-40 w-52 rounded-xl bg-white p-1.5 shadow-xl border border-steel-200 text-left text-xs divide-y divide-steel-100 animate-in fade-in zoom-in-95 duration-100"
                                    >
                                      {/* กลุ่มที่ 1: การพิมพ์และส่งต่อ */}
                                      <div className="py-1 space-y-0.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPoForPrint(r)
                                            setActionMenuPoId(null)
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition cursor-pointer"
                                        >
                                          <Printer className="h-3.5 w-3.5 text-emerald-600" />
                                          <span>พิมพ์ใบสั่งซื้อ (A4 / PDF)</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPoForEnvelope(r)
                                            setActionMenuPoId(null)
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition cursor-pointer"
                                        >
                                          <Mail className="h-3.5 w-3.5 text-sky-600" />
                                          <span>พิมพ์หน้าจ่าซองเอกสาร</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPoForShare(r)
                                            setActionMenuPoId(null)
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition cursor-pointer"
                                        >
                                          <Share2 className="h-3.5 w-3.5 text-amber-600" />
                                          <span>แชร์ใบสั่งซื้อ (LINE / ลิงก์)</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPoForPrint(r)
                                            setActionMenuPoId(null)
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition cursor-pointer"
                                        >
                                          <Download className="h-3.5 w-3.5 text-indigo-600" />
                                          <span>ดาวน์โหลด / บันทึก PDF</span>
                                        </button>
                                      </div>

                                      {/* กลุ่มที่ 2: สร้างซ้ำ & แก้ไข */}
                                      <div className="py-1 space-y-0.5">
                                        {canCreate && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActionMenuPoId(null)
                                              navigate(`/purchasing/po/new?duplicate_from=${r.id}`)
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition cursor-pointer"
                                          >
                                            <Copy className="h-3.5 w-3.5 text-blue-600" />
                                            <span>สร้างซ้ำ (Duplicate PO)</span>
                                          </button>
                                        )}

                                        {canCreate && r.status !== 'cancelled' && (
                                          <Link
                                            to={`/purchasing/po/${r.id}/edit`}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-steel-700 hover:bg-steel-100 font-semibold transition"
                                          >
                                            <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                                            <span>แก้ไขใบสั่งซื้อ</span>
                                          </Link>
                                        )}

                                        {r.status !== 'cancelled' && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPaymentTargetPo(r)
                                              setActionMenuPoId(null)
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sky-700 hover:bg-sky-50 font-semibold transition cursor-pointer"
                                          >
                                            <DollarSign className="h-3.5 w-3.5 text-sky-600" />
                                            <span>จ่ายชำระเงิน (PAY)</span>
                                          </button>
                                        )}
                                      </div>

                                      {/* กลุ่มที่ 3: ลบรายการ */}
                                      {canCreate && (
                                        <div className="py-1">
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePo(r)}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-700 hover:bg-rose-50 font-bold transition cursor-pointer"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                            <span>ลบใบสั่งซื้อนี้</span>
                                          </button>
                                        </div>
                                      )}
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
            </div>
          )}

          {/* TAB 2: รายการใบขอซื้อ (PR) */}
          {activeTab === 'pr' && (
            <div className="overflow-x-auto rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 pb-2.5">
                <div className="text-xs font-bold text-steel-900">
                  รายการใบขอซื้อทั้งหมด ({filteredPrs.length})
                </div>
                {canCreate && (
                  <Link to="/purchasing/pr/new" className="inline-flex items-center gap-1 rounded-xl bg-steel-900 hover:bg-steel-800 px-3 py-1.5 text-xs font-bold text-hivis shadow-xs transition">
                    + ออกใบขอซื้อ (PR)
                  </Link>
                )}
              </div>

              <table className="w-full text-left text-xs min-w-[950px] divide-y divide-steel-200">
                <thead className="bg-steel-50/80 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3.5 w-32">เลขที่ PR</th>
                    <th className="py-3 px-3.5 min-w-[180px]">โครงการ</th>
                    <th className="py-3 px-3 w-28">วันที่ขอ</th>
                    <th className="py-3 px-3 text-right w-24">จำนวนรายการ</th>
                    <th className="py-3 px-3 w-28 text-center">สถานะ</th>
                    <th className="py-3 px-3.5 min-w-[160px]">ใบสั่งซื้อที่เกี่ยวข้อง</th>
                    <th className="py-3 px-3.5 w-40 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 bg-white">
                  {filteredPrs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-steel-400">
                        ไม่พบใบขอซื้อ
                      </td>
                    </tr>
                  ) : (
                    filteredPrs.map((r) => {
                      const linkedPos = poByPrId[r.id] || []
                      return (
                        <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-sky-700 whitespace-nowrap">
                            <Link to={`/purchasing/pr/${r.id}`} className="hover:underline flex items-center gap-1">
                              <span>📋</span>
                              <span>{r.pr_no}</span>
                            </Link>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-steel-900">{r.projects?.project_code}</div>
                            <div className="text-xs text-steel-500 truncate max-w-[220px]">{r.projects?.project_name}</div>
                          </td>
                          <td className="py-3 px-3 text-steel-600 whitespace-nowrap">{formatThaiDate(r.request_date)}</td>
                          <td className="py-3 px-3 text-right font-bold text-steel-900">{r.purchase_requisition_items?.length || 0}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap"><Badge map={PR_STATUS} status={r.status} /></td>
                          <td className="py-3 px-3.5">
                            {linkedPos.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {linkedPos.map((p) => (
                                  <Link key={p.id} to={`/purchasing/po/${p.id}`} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100">
                                    {p.po_no}
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-steel-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                              {r.status === 'pending' && canCreate && (
                                <Link
                                  to={`/purchasing/po/new?pr=${r.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                                >
                                  <span>⚡</span>
                                  <span>ออก PO</span>
                                </Link>
                              )}
                              <Link
                                to={`/purchasing/pr/${r.id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-steel-700 border border-steel-300 hover:bg-steel-50 hover:text-ink transition shadow-xs"
                              >
                                <span>รายละเอียด</span>
                              </Link>
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

          {/* TAB 3: ติดตามการรับสินค้าเข้าสโตร์ (Goods Receipt Track) */}
          {activeTab === 'receipts' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs sm:text-sm text-emerald-900 shadow-xs">
                <div className="font-bold flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <span>ส่วนติดตามและตรวจรับสินค้าเข้าสโตร์ (Goods Receipts)</span>
                </div>
                <div className="mt-1 text-emerald-800 text-xs">
                  แสดงรายการใบสั่งซื้อที่อยู่ระหว่างรอสินค้าส่งมอบเข้าสโตร์ สามารถคลิก <b>"ตรวจรับสินค้า"</b> เพื่อบันทึกยอดรับเข้าสต็อกอัตโนมัติ
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
                <table className="w-full text-left text-xs min-w-[950px] divide-y divide-steel-200">
                  <thead className="bg-steel-50/80 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5 w-32">เลขที่ PO</th>
                      <th className="py-3 px-3.5 min-w-[180px]">ร้านค้า</th>
                      <th className="py-3 px-3.5 min-w-[180px]">โครงการ</th>
                      <th className="py-3 px-3 w-28">วันที่สั่งซื้อ</th>
                      <th className="py-3 px-3.5 min-w-[150px]">กำหนดส่งมอบ</th>
                      <th className="py-3 px-3 w-28 text-center">สถานะรับของ</th>
                      <th className="py-3 px-3.5 w-32 text-right">ยอดสั่งซื้อ (บาท)</th>
                      <th className="py-3 px-3.5 w-36 text-right">การรับของ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100 bg-white">
                    {pendingReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-steel-400">
                          ✨ ไม่มีใบสั่งซื้อค้างส่งมอบ หรือไม่พบข้อมูลตามช่วงวันที่ที่เลือก
                        </td>
                      </tr>
                    ) : (
                      pendingReceipts.map((r) => {
                        const dueStatus = getPoDueStatus(r)
                        return (
                          <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                            <td className="py-3 px-3.5 font-bold text-emerald-700 whitespace-nowrap">
                              <Link to={`/purchasing/po/${r.id}`} className="hover:underline flex items-center gap-1">
                                <span>📄</span>
                                <span>{r.po_no}</span>
                              </Link>
                              {r.pr?.pr_no && <div className="text-[11px] text-steel-500 font-normal">จาก {r.pr.pr_no}</div>}
                            </td>
                            <td className="py-3 px-3.5 font-semibold text-steel-900">
                              <div className="truncate max-w-[200px]" title={r.vendors?.vendor_name}>
                                {r.vendors?.vendor_name || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-steel-700">
                              <div className="truncate max-w-[200px]" title={`${r.projects?.project_code || ''} ${r.projects?.project_name || ''}`}>
                                <span className="font-semibold text-steel-900">{r.projects?.project_code}</span>{' '}
                                <span className="text-steel-600">{r.projects?.project_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-steel-600 whitespace-nowrap">{formatThaiDate(r.order_date)}</td>
                            <td className="py-3 px-3.5">
                              <div className="font-mono text-xs font-bold text-steel-800">
                                {r.expected_delivery_date ? formatThaiDate(r.expected_delivery_date) : '-'}
                              </div>
                              {dueStatus && (
                                <div className="mt-0.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${dueStatus.badgeCls}`}>
                                    <span>{dueStatus.icon}</span>
                                    <span>{dueStatus.label}</span>
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap"><Badge map={PO_STATUS} status={r.status} /></td>
                            <td className="py-3 px-3.5 text-right font-black text-steel-900 whitespace-nowrap">{baht(r.total_amount)}</td>
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              {canReceive ? (
                                <Link
                                  to={`/purchasing/po/${r.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                                >
                                  <span>📥</span>
                                  <span>ตรวจรับสินค้า</span>
                                </Link>
                              ) : (
                                <span className="text-xs text-steel-400">รอสโตร์ตรวจรับ</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: แผนภาพวงจรจัดซื้อ (Pipeline View) */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {/* สรุป 4 กล่องกระบวนการจัดซื้อ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">1. PR รอออก PO</div>
                  <div className="mt-1 text-2xl font-black text-amber-900">{pendingPrs.length} <span className="text-xs font-normal text-amber-700">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-amber-600">คำขอจัดซื้อจากไซต์งาน</div>
                </div>

                <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">2. PO รอรับของ</div>
                  <div className="mt-1 text-2xl font-black text-blue-900">{openPos.length} <span className="text-xs font-normal text-blue-700">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-blue-600">สั่งของแล้ว รอนำส่ง</div>
                </div>

                <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">3. รับบางส่วน</div>
                  <div className="mt-1 text-2xl font-black text-purple-900">{partialPos.length} <span className="text-xs font-normal text-purple-700">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-purple-600">ทยอยเข้าสโตร์</div>
                </div>

                <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">4. ยอดสั่งซื้อสะสม</div>
                  <div className="mt-1 text-xl font-black text-ink">{baht(totalSpend)}</div>
                  <div className="mt-1 text-[11px] text-steel-500">รวม {pos.length} ใบสั่งซื้อ</div>
                </div>
              </div>

              {/* ตารางจับคู่ PR ➔ PO */}
              <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-steel-100 pb-2">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    🔄 แผนผังการผูกโยงเอกสาร (PR ➔ PO Linkage)
                  </h3>
                  <span className="text-xs text-steel-500">แสดงความเชื่อมโยงของเอกสารแต่ละขั้นตอน</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[850px] divide-y divide-steel-200">
                    <thead className="bg-steel-50 text-steel-700 font-bold uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">ใบขอซื้อ (PR)</th>
                        <th className="py-2.5 px-3">โครงการ</th>
                        <th className="py-2.5 px-3">สถานะ PR</th>
                        <th className="py-2.5 px-3">ใบสั่งซื้อที่ออก (PO)</th>
                        <th className="py-2.5 px-3 text-right">ยอดรวม PO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100 bg-white">
                      {filteredPipelinePrs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-steel-400">
                            ไม่พบข้อมูลวงจรเอกสารตามเงื่อนไขหรือช่วงวันที่ที่ค้นหา
                          </td>
                        </tr>
                      ) : (
                        filteredPipelinePrs.map((r) => {
                          const linkedPos = poByPrId[r.id] || []
                          const linkedTotal = linkedPos.reduce((s, p) => s + Number(p.total_amount || 0), 0)
                          return (
                            <tr key={r.id} className="hover:bg-steel-50/70">
                              <td className="py-2.5 px-3">
                                <Link to={`/purchasing/pr/${r.id}`} className="font-bold text-sky-700 hover:underline">
                                  {r.pr_no}
                                </Link>
                                <div className="text-[10px] text-steel-500 font-mono">
                                  วันที่ขอ: {formatThaiDate(r.request_date)}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-steel-900">{r.projects?.project_code}</span> {r.projects?.project_name}
                              </td>
                              <td className="py-2.5 px-3"><Badge map={PR_STATUS} status={r.status} /></td>
                              <td className="py-2.5 px-3">
                                {linkedPos.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {linkedPos.map((p) => (
                                      <Link
                                        key={p.id}
                                        to={`/purchasing/po/${p.id}`}
                                        className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-xs font-bold hover:bg-emerald-200"
                                        title={`สั่งซื้อเมื่อ: ${formatThaiDate(p.order_date)}`}
                                      >
                                        <span>{p.po_no}</span>
                                        <span className="text-[10px] font-normal text-emerald-700">({formatThaiDate(p.order_date)})</span>
                                      </Link>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-steel-400">ยังไม่ออก PO</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-ink">
                                {linkedTotal > 0 ? `${baht(linkedTotal)} ฿` : '-'}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* โมดัล 1: พิมพ์เอกสาร PO ขนาด A4 / บันทึก PDF */}
      {selectedPoForPrint && (
        <PODocumentModal
          po={selectedPoForPrint}
          items={selectedPoForPrint.purchase_order_items}
          onClose={() => setSelectedPoForPrint(null)}
        />
      )}

      {/* โมดัล 2: พิมพ์หน้าจ่าซองส่งเอกสารหรือเช็คถึงผู้ขาย */}
      {selectedPoForEnvelope && (
        <EnvelopePrintModal
          po={selectedPoForEnvelope}
          onClose={() => setSelectedPoForEnvelope(null)}
        />
      )}

      {/* โมดัล 3: แชร์ใบสั่งซื้อ (ลิงก์ตรง + ข้อความ LINE) */}
      {selectedPoForShare && (
        <POShareModal
          po={selectedPoForShare}
          onClose={() => setSelectedPoForShare(null)}
        />
      )}

      {/* โมดัล 4: จ่ายชำระเงิน (PAY) */}
      {paymentTargetPo && (
        <PaymentActionModal
          isOpen={true}
          type="disburse"
          docType="PO"
          docId={paymentTargetPo.id}
          docNo={paymentTargetPo.po_no}
          vendorId={paymentTargetPo.vendor_id}
          contactName={paymentTargetPo.vendors?.vendor_name}
          totalAmount={paymentTargetPo.net_amount || paymentTargetPo.total_amount}
          alreadyPaid={paymentTargetPo.deposit_paid_amount || 0}
          depositAmount={paymentTargetPo.deposit_amount || 0}
          remainingAmount={paymentTargetPo.remaining_amount || 0}
          hasDeposit={paymentTargetPo.deposit_type === 'deposit'}
          paymentStatus={paymentTargetPo.payment_status || 'รอชำระเงิน'}
          requestedChannel={paymentTargetPo.payment_channel_requested || 'transfer'}
          projectId={paymentTargetPo.project_id}
          projectName={paymentTargetPo.projects?.project_name}
          onClose={() => setPaymentTargetPo(null)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}
    </div>
  )
}
