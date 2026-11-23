import { useCallback, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, PO_STATUS, canCreatePurchasing, canReceiveGoods, formatDateTimeParts } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { getPoDueStatus, formatThaiDate } from '../../lib/poDueStatus'
import PaymentActionModal from '../../components/PaymentActionModal'
import PODocumentModal from '../../components/reports/PODocumentModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import POShareModal from '../../components/purchasing/POShareModal'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import SearchableSelect from '../../components/SearchableSelect'
import Pagination from '../../components/Pagination'
import TableSortFilter from '../../components/TableSortFilter'
import Button from '../../components/common/Button'
import StatusBadge from '../../components/common/StatusBadge'
import ListToolbar from '../../components/common/ListToolbar'
import SkeletonTable from '../../components/common/SkeletonTable'
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
  XCircle,
  List,
  Grid,
  ArrowRight,
  Layers,
  Boxes,
  ExternalLink,
  Workflow,
  PackageCheck,
  Coins,
} from 'lucide-react'

export default function PurchasingHub() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'pipeline' // 'pipeline' | 'pr' | 'po' | 'receipts'
  const [activeTab, setActiveTab] = useState(initialTab)

  // โมดัลต่าง ๆ
  const [paymentTargetPo, setPaymentTargetPo] = useState(null)
  const [poToCancel, setPoToCancel] = useState(null)
  const [cancelListReason, setCancelListReason] = useState('')
  const [cancellingList, setCancellingList] = useState(false)
  const [selectedPoForPrint, setSelectedPoForPrint] = useState(null)
  const [selectedPoForEnvelope, setSelectedPoForEnvelope] = useState(null)
  const [selectedPoForShare, setSelectedPoForShare] = useState(null)
  const [selectedUsageItem, setSelectedUsageItem] = useState(null)
  const [activeDropdown, setActiveDropdown] = useState(null) // { type: 'po' | 'pr', id, item, top, right, openUpward }
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [pipelineViewMode, setPipelineViewMode] = useState('flow') // 'flow' | 'table'

  const [prs, setPrs] = useState([])
  const [pos, setPos] = useState([])
  const [grns, setGrns] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [receiptSubTab, setReceiptSubTab] = useState('received_items') // 'received_items' | 'pending'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ตัวกรอง
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDueStatus, setFilterDueStatus] = useState('all') // 'all' | 'overdue' | 'urgent' | 'on_track' | 'completed' | 'no_date'

  // ตัวเลือกการเรียงลำดับมาตรฐานสำหรับสายงานจัดซื้อ
  const PURCHASING_SORT_OPTIONS = [
    { value: 'date_desc', label: ' วันที่ล่าสุด (ใหม่  เก่า)' },
    { value: 'date_asc', label: ' วันที่ (เก่า  ใหม่)' },
    { value: 'code_desc', label: 'เลขที่เอกสาร (มาก  น้อย)' },
    { value: 'code_asc', label: 'เลขที่เอกสาร (น้อย  มาก)' },
    { value: 'name_asc', label: 'ชื่อคู่ค้า/โครงการ ก  ฮ (A  Z)' },
    { value: 'name_desc', label: 'ชื่อคู่ค้า/โครงการ ฮ  ก (Z  A)' },
    { value: 'amount_desc', label: 'มูลค่าสั่งซื้อ (มาก  น้อย)' },
    { value: 'amount_asc', label: 'มูลค่าสั่งซื้อ (น้อย  มาก)' },
  ]

  const [showFilterDrawer, setShowFilterDrawer] = useState(false)
  const [poColumns, setPoColumns] = useState([
    { key: 'po_no', label: 'เลขที่ PO / วันที่', visible: true },
    { key: 'vendor', label: 'ผู้ขาย / ร้านค้า', visible: true },
    { key: 'project', label: 'โครงการ / ลูกค้า', visible: true },
    { key: 'amount', label: 'ยอดรวม (บาท)', visible: true },
    { key: 'due_date', label: 'วันครบกำหนด', visible: true },
    { key: 'status', label: 'สถานะวงจรเอกสาร', visible: true },
  ])
  const togglePoColumn = (key) => {
    setPoColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    )
  }

  const [prColumns, setPrColumns] = useState([
    { key: 'pr_no', label: 'เลขที่ PR / วันที่ขอ', visible: true },
    { key: 'project', label: 'โครงการ / ลูกค้า', visible: true },
    { key: 'items', label: 'จำนวนรายการ', visible: true },
    { key: 'status', label: 'สถานะ', visible: true },
    { key: 'linked_po', label: 'ใบสั่งซื้อที่เกี่ยวข้อง', visible: true },
  ])
  const togglePrColumn = (key) => {
    setPrColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    )
  }

  // ตัวช่วยตรวจสอบการแสดงผลคอลัมน์ตามการตั้งค่าของผู้ใช้
  const isPoColVisible = (key) => poColumns.find((c) => c.key === key)?.visible !== false
  const isPrColVisible = (key) => prColumns.find((c) => c.key === key)?.visible !== false

  // ส่งออกข้อมูล CSV / Excel / PDF พร้อม UTF-8 BOM รองรับภาษาไทยใน Microsoft Excel
  const handleExport = (format) => {
    if (format === 'pdf') {
      window.print()
      return
    }
    const dataToExport = activeTab === 'po' ? filteredPos : filteredPrs
    if (dataToExport.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก')
      return
    }
    let csv = '\uFEFF'
    if (activeTab === 'po') {
      csv += 'เลขที่ PO,วันที่สั่งซื้อ,ผู้ขาย,โครงการ,ยอดรวมสุทธิ,วันครบกำหนดส่งมอบ,สถานะ\n'
      dataToExport.forEach((r) => {
        csv += `"${r.po_no || ''}","${r.order_date || ''}","${(r.custom_vendor_name || r.vendors?.vendor_name || '').replace(/"/g, '""')}","${(r.custom_project_name || r.projects?.project_code || '').replace(/"/g, '""')}",${r.total_amount || 0},"${r.expected_delivery_date || ''}","${r.status || ''}"\n`
      })
    } else {
      csv += 'เลขที่ PR,วันที่ขอ,โครงการ,จำนวนรายการ,สถานะ\n'
      dataToExport.forEach((r) => {
        csv += `"${r.pr_no || ''}","${r.request_date || ''}","${(r.custom_project_name || r.projects?.project_code || '').replace(/"/g, '""')}",${r.purchase_requisition_items?.length || 0},"${r.status || ''}"\n`
      })
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab === 'po' ? 'PO' : 'PR'}_Export_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ตัวกรองวันที่ (Date Search & Filters)
  const [dateType, setDateType] = useState('expected_delivery_date') // 'expected_delivery_date' | 'order_date' | 'request_date'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'next_7_days' | 'next_30_days' | 'custom'
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 10 | 15 | 30 | 50

  const canCreate = canCreatePurchasing(profile.role)

  const activeChips = useMemo(() => {
    const chips = []
    if (filterProject) {
      const proj = projects.find((p) => p.id === filterProject)
      chips.push({
        key: 'project',
        label: `โครงการ: ${proj?.project_code || 'โครงการที่เลือก'}`,
        onRemove: () => setFilterProject(''),
      })
    }
    if (filterDueStatus !== 'all') {
      chips.push({
        key: 'due',
        label: `กำหนดส่ง: ${filterDueStatus}`,
        onRemove: () => setFilterDueStatus('all'),
      })
    }
    if (filterStatus) {
      chips.push({
        key: 'status',
        label: `สถานะ: ${filterStatus}`,
        onRemove: () => setFilterStatus(''),
      })
    }
    if (dateFrom || dateTo) {
      chips.push({
        key: 'date',
        label: `วันที่: ${dateFrom || '...'} ถึง ${dateTo || '...'}`,
        onRemove: () => {
          setDateFrom('')
          setDateTo('')
          setDatePreset('all')
        },
      })
    }
    return chips
  }, [filterProject, filterDueStatus, filterStatus, dateFrom, dateTo, projects])
  const canReceive = canReceiveGoods(profile.role)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [prsRes, posRes, projRes, venRes, grnsRes] = await Promise.all([
        supabase
          .from('purchase_requisitions')
          .select('*, projects(id, project_code, project_name), purchase_requisition_items(*)')
          .order('request_date', { ascending: false })
          .order('pr_no', { ascending: false }),
        supabase
          .from('purchase_orders')
          .select(
            '*, vendors(id, vendor_code, vendor_name, contact_person, phone, tax_id, address), projects(id, project_code, project_name), pr:purchase_requisitions(id, pr_no), purchase_order_items(*)'
          )
          .order('order_date', { ascending: false })
          .order('po_no', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('vendors').select('id, vendor_code, vendor_name, contact_person, phone, tax_id, address').order('vendor_code'),
        supabase
          .from('goods_receipts')
          .select('id, grn_no, received_date, po_id, purchase_orders(id, po_no, total_amount, grand_total, order_date, vendors(vendor_name), custom_vendor_name, projects(project_code, project_name), custom_project_name, customer_name), goods_receipt_items(id, qty_received, unit_cost, po_item_id, purchase_order_items(id, item_name, unit, unit_price))')
          .order('received_date', { ascending: false }),
      ])

      if (prsRes.error) throw prsRes.error
      if (posRes.error) throw posRes.error

      setPrs(prsRes.data ?? [])
      setPos(posRes.data ?? [])
      setProjects(projRes.data ?? [])
      setVendors(venRes.data ?? [])
      setGrns(grnsRes.data ?? [])
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
    setActiveDropdown(null)
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

  // ปิดเมนู dropdown เมื่อคลิกที่อื่น หรือเมื่อ scroll หน้าจอ
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null)
    window.addEventListener('click', handleOutsideClick)
    window.addEventListener('scroll', handleOutsideClick, true)
    return () => {
      window.removeEventListener('click', handleOutsideClick)
      window.removeEventListener('scroll', handleOutsideClick, true)
    }
  }, [])

  // ฟังก์ชันสลับเปิด-ปิด Floating Dropdown โดยคำนวณพิกัดให้ไม่ล้นจอและไม่โดนขอบตารางตัด
  const toggleDropdown = (e, type, item) => {
    e.stopPropagation()
    if (activeDropdown && activeDropdown.id === item.id && activeDropdown.type === type) {
      setActiveDropdown(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUpward = spaceBelow < 300
    setActiveDropdown({
      type,
      id: item.id,
      item,
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      right: window.innerWidth - rect.right,
      openUpward,
    })
  }

  // ฟังก์ชันลบ PR จากหน้ารายการ
  const handleDeletePr = async (prToDelete) => {
    const linked = poByPrId[prToDelete.id] || []
    if (linked.length > 0) {
      alert(`ไม่สามารถลบใบขอซื้อ ${prToDelete.pr_no} ได้ เนื่องจากมีใบสั่งซื้อ (PO) อ้างอิงอยู่ (${linked.map((p) => p.po_no).join(', ')})`)
      return
    }
    if (!confirm(`ยืนยันการลบใบขอซื้อ ${prToDelete.pr_no}? รายการขอซื้อจะถูกลบออกจากระบบ`)) return
    try {
      const { error } = await supabase.from('purchase_requisitions').delete().eq('id', prToDelete.id)
      if (error) throw error
      setPrs((prev) => prev.filter((p) => p.id !== prToDelete.id))
      setActiveDropdown(null)
    } catch (err) {
      alert('ไม่สามารถลบใบขอซื้อได้: ' + (err.message || 'โปรดตรวจสอบสิทธิ์'))
    }
  }

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
        p_reason: 'ลบจากหน้ารายการจัดซื้อ',
      })
      if (rpcErr) {
        // Fallback delete
        const { error: directErr } = await supabase.from('purchase_orders').delete().eq('id', poToDelete.id)
        if (directErr) throw directErr
      }
      setPos((prev) => prev.filter((p) => p.id !== poToDelete.id))
      setActiveDropdown(null)
    } catch (err) {
      alert('ไม่สามารถลบใบสั่งซื้อได้: ' + (err.message || 'โปรดตรวจสอบสิทธิ์หรือรายการตรวจรับของ'))
    }
  }

  // ฟังก์ชันยกเลิก PO จากหน้ารายการ
  const handleConfirmCancelPoList = async () => {
    if (!poToCancel || !cancelListReason.trim()) {
      alert('กรุณาระบุเหตุผลในการยกเลิกใบสั่งซื้อ')
      return
    }
    setCancellingList(true)
    try {
      const { error: rpcErr } = await supabase.rpc('cancel_purchase_order', {
        p_po_id: poToCancel.id,
        p_reason: cancelListReason.trim(),
      })
      if (rpcErr) {
        const remarksWithReason = [poToCancel.remarks, `[ยกเลิกเมื่อ ${new Date().toLocaleString('th-TH')}]: ${cancelListReason.trim()}`].filter(Boolean).join(' | ')
        const { error: updErr } = await supabase.from('purchase_orders').update({
          status: 'cancelled',
          remarks: remarksWithReason,
          updated_at: new Date().toISOString(),
        }).eq('id', poToCancel.id)
        if (updErr) throw updErr

        if (poToCancel.pr_id) {
          await supabase.from('purchase_requisitions').update({
            status: 'approved',
            updated_at: new Date().toISOString(),
          }).eq('id', poToCancel.pr_id)
        }
      }
      setPoToCancel(null)
      setCancelListReason('')
      loadData()
    } catch (err) {
      alert('ยกเลิกใบสั่งซื้อไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'))
    } finally {
      setCancellingList(false)
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
    if (filterStatus) {
      const isPaid = row.payment_status === 'ชำระครบแล้ว' || (Number(row.remaining_amount) <= 0.05 && Number(row.deposit_paid_amount) > 0)
      if (filterStatus === 'received_unpaid') {
        if (row.status !== 'received' || isPaid) return false
      } else if (filterStatus === 'completed_paid') {
        if (row.status !== 'received' || !isPaid) return false
      } else if (row.status !== filterStatus) {
        return false
      }
    }
    if (!q) return true
    return fields.some((f) => String(f || '').toLowerCase().includes(q))
  }

  const filteredPrs = prs.filter((r) => {
    if (!filterRow(r, [r.pr_no, r.projects?.project_name, r.projects?.project_code, r.custom_project_name, r.customer_name, r.suggested_vendor, r.notes])) return false
    if (!checkDateRange(r.request_date)) return false
    return true
  })

  const filteredPos = pos.filter((r) => {
    if (!filterRow(r, [r.po_no, r.vendors?.vendor_name, r.custom_vendor_name, r.projects?.project_name, r.projects?.project_code, r.custom_project_name, r.customer_name, r.pr?.pr_no, r.buyer_name, r.notes])) {
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
    if (!filterRow(p, [p.po_no, p.vendors?.vendor_name, p.custom_vendor_name, p.projects?.project_name, p.custom_project_name, p.customer_name])) return false
    const targetDate = dateType === 'order_date' ? p.order_date : p.expected_delivery_date
    if (!checkDateRange(targetDate)) return false
    return true
  })

  const [receiptGroupMode, setReceiptGroupMode] = useState('grouped') // 'grouped' (รวมรายการตาม PO ไม่ซ้ำ) | 'by_grn' (แยกตามรอบ GRN)

  // สรุปรายการพัสดุและวัสดุทั้งหมดที่เคยตรวจรับเข้ามาแล้ว (Received Materials History)
  const receivedMaterialsList = useMemo(() => {
    const list = []

      // 1. ดึงจากรายการ goods_receipts
      ; (grns || []).forEach((gr) => {
        const poObj = gr.purchase_orders
        const grnNo = gr.grn_no
        const recDate = gr.received_date
        const vName = poObj?.custom_vendor_name || poObj?.vendors?.vendor_name || 'ผู้จำหน่าย'
        const pName = poObj?.custom_project_name || (poObj?.projects ? `${poObj.projects.project_code} ${poObj.projects.project_name}` : 'ของกลางบริษัท')

          ; (gr.goods_receipt_items || []).forEach((gri) => {
            const itName = gri.purchase_order_items?.item_name || 'วัสดุ'
            const unit = gri.purchase_order_items?.unit || 'หน่วย'
            const qtyNum = Number(gri.qty_received) || 0
            let uCost = Number(gri.unit_cost || gri.purchase_order_items?.unit_price || 0)

            // กู้คืนราคาหากบันทึกเป็น 0 ไว้ในระบบเดิม (Price Self-Healing จาก PO Total)
            const matchedPo = (pos || []).find((p) => p.id === gr.po_id) || poObj
            const poTotal = Number(matchedPo?.total_amount || matchedPo?.grand_total || poObj?.total_amount || poObj?.grand_total || 0)
            if (uCost === 0 && poTotal > 0) {
              uCost = Math.round((poTotal / (qtyNum || 1)) * 100) / 100
            }

            list.push({
              id: `gr-${gri.id}`,
              received_date: recDate,
              grn_no: grnNo,
              po_id: gr.po_id,
              po_no: poObj?.po_no || '-',
              item_name: itName,
              quantity: qtyNum,
              unit: unit,
              unit_cost: uCost,
              total_value: qtyNum * uCost,
              vendor_name: vName,
              project_name: pName,
              customer_name: poObj?.customer_name || null,
              source: 'GRN',
            })
          })
      })

      // 2. ดึงจาก purchase_orders (สำหรับรายการที่รับเข้าแล้ว)
      ; (pos || []).forEach((p) => {
        const vName = p.custom_vendor_name || p.vendors?.vendor_name || 'ผู้จำหน่าย'
        const pName = p.custom_project_name || (p.projects ? `${p.projects.project_code} ${p.projects.project_name}` : 'ของกลางบริษัท')

          ; (p.purchase_order_items || []).forEach((pi) => {
            const recQty = Number(pi.qty_received) || 0
            if (recQty > 0) {
              const alreadyInGr = list.some((x) => x.po_id === p.id && x.item_name === pi.item_name)
              if (!alreadyInGr) {
                let uCost = Number(pi.unit_price ?? pi.price ?? 0)
                if (uCost === 0 && Number(p.total_amount) > 0) {
                  uCost = Math.round((Number(p.total_amount) / (Number(pi.quantity) || 1)) * 100) / 100
                }
                list.push({
                  id: `po-${pi.id}`,
                  received_date: p.order_date,
                  grn_no: 'ตรวจรับเข้าสโตร์',
                  po_id: p.id,
                  po_no: p.po_no,
                  item_name: pi.item_name,
                  quantity: recQty,
                  unit: pi.unit || 'หน่วย',
                  unit_cost: uCost,
                  total_value: recQty * uCost,
                  vendor_name: vName,
                  project_name: pName,
                  customer_name: p.customer_name || null,
                  source: 'PO',
                })
              }
            }
          })
      })

    // โหมดรวมรายการตาม PO + ชื่อวัสดุ เพื่อไม่ให้รายการซ้ำซ้อนกัน
    if (receiptGroupMode === 'grouped') {
      const groupMap = new Map()
      list.forEach((it) => {
        const key = `${it.po_id || it.po_no}_${(it.item_name || '').trim().toLowerCase()}`
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            ...it,
            grn_list: [it.grn_no],
            receipt_count: 1,
          })
        } else {
          const existing = groupMap.get(key)
          existing.quantity += it.quantity
          existing.total_value += it.total_value
          if (!existing.grn_list.includes(it.grn_no)) {
            existing.grn_list.push(it.grn_no)
          }
          existing.receipt_count += 1
          if (existing.quantity > 0) {
            existing.unit_cost = Math.round((existing.total_value / existing.quantity) * 100) / 100
          }
          if ((it.received_date || '') > (existing.received_date || '')) {
            existing.received_date = it.received_date
          }
        }
      })

      const groupedList = Array.from(groupMap.values()).map((it) => ({
        ...it,
        grn_list: it.grn_list || [],
        grn_no: it.grn_list.length > 1
          ? `${it.grn_list.join(', ')} (${it.grn_list.length} รอบ)`
          : it.grn_list[0] || it.grn_no,
      }))

      return groupedList.sort((a, b) => {
        const dComp = (b.received_date || '').localeCompare(a.received_date || '')
        if (dComp !== 0) return dComp
        return (b.grn_no || '').localeCompare(a.grn_no || '')
      })
    }

    return list.sort((a, b) => {
      const dComp = (b.received_date || '').localeCompare(a.received_date || '')
      if (dComp !== 0) return dComp
      return (b.grn_no || '').localeCompare(a.grn_no || '')
    })
  }, [grns, pos, receiptGroupMode])

  const filteredReceivedMaterials = useMemo(() => {
    return receivedMaterialsList.filter((m) => {
      if (!filterRow(m, [m.item_name, m.po_no, m.grn_no, m.vendor_name, m.project_name, m.customer_name])) return false
      if (!checkDateRange(m.received_date)) return false
      if (filterProject && !m.project_name.toLowerCase().includes(filterProject.toLowerCase())) return false
      return true
    })
  }, [receivedMaterialsList, search, dateFrom, dateTo, filterProject])

  const paginatedReceivedMaterials = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReceivedMaterials.slice(start, start + pageSize)
  }, [filteredReceivedMaterials, currentPage, pageSize])

  const totalReceivedValue = useMemo(() => {
    return filteredReceivedMaterials.reduce((acc, m) => acc + (Number(m.total_value) || 0), 0)
  }, [filteredReceivedMaterials])

  const totalReceivedQuantity = useMemo(() => {
    return filteredReceivedMaterials.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0)
  }, [filteredReceivedMaterials])

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

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อแท็บ หรือ ตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, search, filterProject, filterStatus, filterDueStatus, dateFrom, dateTo, dateType])

  // จัดเรียงรายการ PO ตามเงื่อนไขมาตรฐาน (Sort Engine)
  const sortedPos = useMemo(() => {
    return [...filteredPos].sort((a, b) => {
      if (sortBy === 'name_asc') {
        const nameA = a.vendors?.vendor_name || a.custom_vendor_name || ''
        const nameB = b.vendors?.vendor_name || b.custom_vendor_name || ''
        return nameA.localeCompare(nameB, 'th')
      }
      if (sortBy === 'name_desc') {
        const nameA = a.vendors?.vendor_name || a.custom_vendor_name || ''
        const nameB = b.vendors?.vendor_name || b.custom_vendor_name || ''
        return nameB.localeCompare(nameA, 'th')
      }
      if (sortBy === 'code_asc') return (a.po_no || '').localeCompare(b.po_no || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.po_no || '').localeCompare(a.po_no || '', undefined, { numeric: true })
      if (sortBy === 'amount_desc') return Number(b.net_amount || b.total_amount || 0) - Number(a.net_amount || a.total_amount || 0)
      if (sortBy === 'amount_asc') return Number(a.net_amount || a.total_amount || 0) - Number(b.net_amount || b.total_amount || 0)
      if (sortBy === 'date_asc') return (a.order_date || '').localeCompare(b.order_date || '')
      // Default: date_desc
      return (b.order_date || '').localeCompare(a.order_date || '')
    })
  }, [filteredPos, sortBy])

  // จัดเรียงรายการ PR ตามเงื่อนไขมาตรฐาน
  const sortedPrs = useMemo(() => {
    return [...filteredPrs].sort((a, b) => {
      if (sortBy === 'name_asc') {
        const nameA = a.suggested_vendor || a.projects?.project_name || ''
        const nameB = b.suggested_vendor || b.projects?.project_name || ''
        return nameA.localeCompare(nameB, 'th')
      }
      if (sortBy === 'name_desc') {
        const nameA = a.suggested_vendor || a.projects?.project_name || ''
        const nameB = b.suggested_vendor || b.projects?.project_name || ''
        return nameB.localeCompare(nameA, 'th')
      }
      if (sortBy === 'code_asc') return (a.pr_no || '').localeCompare(b.pr_no || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.pr_no || '').localeCompare(a.pr_no || '', undefined, { numeric: true })
      if (sortBy === 'date_asc') return (a.request_date || '').localeCompare(b.request_date || '')
      // Default: date_desc
      return (b.request_date || '').localeCompare(a.request_date || '')
    })
  }, [filteredPrs, sortBy])

  // คำนวณข้อมูลเฉพาะหน้าปัจจุบันของแต่ละแท็บ
  const paginatedPos = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPos.slice(start, start + pageSize)
  }, [sortedPos, currentPage, pageSize])

  const paginatedPrs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPrs.slice(start, start + pageSize)
  }, [sortedPrs, currentPage, pageSize])

  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return pendingReceipts.slice(start, start + pageSize)
  }, [pendingReceipts, currentPage, pageSize])

  const paginatedPipeline = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredPipelinePrs.slice(start, start + pageSize)
  }, [filteredPipelinePrs, currentPage, pageSize])

  const totalPoNetValue = useMemo(() => {
    return pos.reduce((s, p) => s + Number(p.net_amount || p.total_amount || 0), 0)
  }, [pos])

  return (
    <div className="space-y-5">

      {/* 1. ANVA & Co. Engineering Procurement Brand Hero Banner (สไตล์เดียวกับสโตร์) */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 sm:p-7 text-white shadow-md border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-slate-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                ENGINEERING PROCUREMENT
              </span>
              <span className="text-xs text-slate-200 font-semibold tracking-wide">
                บริษัท อันวาแอนด์โค จำกัด (ANVA & CO., LTD.)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white drop-shadow-xs">
              ฝ่ายจัดซื้อและพัสดุวิศวกรรม (Purchasing Hub)
            </h1>
            <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-2xl">
              ระบบบริหารวงจรจัดซื้อ ออกใบขอซื้อ (PR) อนุมัติออกคำสั่งซื้อ (PO) ตรวจรับสินค้าเข้าสต็อก และควบคุมต้นทุนโครงการ
            </p>
          </div>

          {/* Core Metrics Boxes (4 กล่องสถิติสไตล์เดียวกับสโตร์) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div
              onClick={() => changeTab('pr')}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${activeTab === 'pr'
                ? 'bg-hivis text-slate-950 font-bold border-hivis shadow-md scale-105'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
            >
              <div className={`text-[11px] font-bold ${activeTab === 'pr' ? 'text-slate-900' : 'text-slate-200'}`}>ใบขอซื้อ (PR)</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${activeTab === 'pr' ? 'text-slate-950' : 'text-sky-300'}`}>{prs.length}</div>
              <div className={`text-[10px] ${activeTab === 'pr' ? 'text-slate-800 font-bold' : 'text-slate-300 font-medium'}`}>รายการ</div>
            </div>

            <div
              onClick={() => changeTab('po')}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${activeTab === 'po'
                ? 'bg-hivis text-slate-950 font-bold border-hivis shadow-md scale-105'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
            >
              <div className={`text-[11px] font-bold ${activeTab === 'po' ? 'text-slate-900' : 'text-slate-200'}`}>ใบสั่งซื้อ (PO)</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${activeTab === 'po' ? 'text-slate-950' : 'text-amber-300'}`}>{pos.length}</div>
              <div className={`text-[10px] ${activeTab === 'po' ? 'text-slate-800 font-bold' : 'text-slate-300 font-medium'}`}>รายการ</div>
            </div>

            <div
              onClick={() => changeTab('receipts')}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${activeTab === 'receipts'
                ? 'bg-hivis text-slate-950 font-bold border-hivis shadow-md scale-105'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
            >
              <div className={`text-[11px] font-bold ${activeTab === 'receipts' ? 'text-slate-900' : 'text-slate-200'}`}>รอตรวจรับ</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${activeTab === 'receipts' ? 'text-slate-950' : 'text-rose-400'}`}>{pendingReceipts.length}</div>
              <div className={`text-[10px] ${activeTab === 'receipts' ? 'text-slate-800 font-bold' : 'text-slate-300 font-medium'}`}>ค้างรับเข้าสโตร์</div>
            </div>

            <div
              onClick={() => changeTab('pipeline')}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${activeTab === 'pipeline'
                ? 'bg-hivis text-slate-950 font-bold border-hivis shadow-md scale-105'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
            >
              <div className={`text-[11px] font-bold ${activeTab === 'pipeline' ? 'text-slate-900' : 'text-slate-200'}`}>วงจรเอกสาร</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${activeTab === 'pipeline' ? 'text-slate-950' : 'text-emerald-300'}`}>{completedPos.length}</div>
              <div className={`text-[10px] ${activeTab === 'pipeline' ? 'text-slate-800 font-bold' : 'text-slate-300 font-medium'}`}>ปิดวงจรสมบูรณ์</div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Total Value & Actions */}
        <div className="mt-5 pt-4 border-t border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">มูลค่าสั่งซื้อรวม (ที่แสดง):</span>
            <span className="text-lg font-black font-mono text-emerald-300 tracking-wide">
              {baht(totalPoNetValue)} บาท
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canCreate && (
              <>
                <Link
                  to="/purchasing/pr/new"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800/90 hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-hivis" />
                  <span>ออกใบขอซื้อ (PR)</span>
                </Link>
                <Link
                  to="/purchasing/po/new"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-hivis hover:brightness-110 text-slate-950 px-4 py-2 text-xs font-black shadow-md transition cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  <span>สร้างใบสั่งซื้อ (PO)</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. รายงานวันครบกำหนดส่งมอบ (Due Date & Delivery Report Banner) สำหรับหน้า PO */}
      {activeTab === 'po' && (
        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-hivis shrink-0" />
              <h3 className="text-xs font-black text-ink uppercase tracking-wider">
                รายงานติดตามวันครบกำหนดส่งมอบสินค้า (PO Due Date & Delivery Report)
              </h3>
            </div>
            {filterDueStatus !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterDueStatus('all')}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                แสดงทุกสถานะกำหนดส่ง
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: เกินกำหนดส่งมอบ (Overdue) */}
            <button
              type="button"
              onClick={() => setFilterDueStatus(filterDueStatus === 'overdue' ? 'all' : 'overdue')}
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${filterDueStatus === 'overdue'
                ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-400'
                : 'border-rose-200 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-300'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
                  <span></span> เกินกำหนดส่งมอบ
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
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${filterDueStatus === 'urgent'
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
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${filterDueStatus === 'on_track'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400'
                : 'border-steel-200 bg-white hover:bg-blue-50/50 hover:border-blue-300'
                }`}
            >
              <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                <span></span> รอนำส่งตามกำหนด
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
              className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${filterDueStatus === 'completed'
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400'
                : 'border-steel-200 bg-white hover:bg-emerald-50/50 hover:border-emerald-300'
                }`}
            >
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <span></span> ส่งมอบครบแล้ว
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-900">
                {completedPos.length} <span className="text-xs font-normal text-emerald-700">ใบ</span>
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-700">ตรวจรับเข้าสต็อกเสร็จสิ้น</div>
            </button>
          </div>
        </div>
      )}

      {/* 3. แถบเครื่องมือรายการมาตรฐาน (Universal List Toolbar) */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={
          activeTab === 'po'
            ? 'ค้นหาเลขที่ PO, ร้านค้า, โครงการ (กด / เพื่อค้นหา)...'
            : activeTab === 'pr'
              ? 'ค้นหาเลขที่ PR, ร้านค้าแนะนำ, โครงการ (กด / เพื่อค้นหา)...'
              : 'ค้นหารายการจัดซื้อ...'
        }
        filterCount={
          (filterProject ? 1 : 0) +
          (filterStatus ? 1 : 0) +
          (filterDueStatus !== 'all' ? 1 : 0) +
          (dateFrom || dateTo ? 1 : 0)
        }
        onToggleFilters={() => setShowFilterDrawer(!showFilterDrawer)}
        datePresets={[
          { value: 'all', label: 'ทุกช่วงเวลา' },
          { value: 'today', label: 'วันนี้' },
          { value: 'this_week', label: 'สัปดาห์นี้' },
          { value: 'this_month', label: 'เดือนนี้' },
          { value: 'next_7_days', label: '7 วันข้างหน้า' },
          { value: 'next_30_days', label: '30 วันข้างหน้า' },
          { value: 'last_month', label: 'เดือนที่แล้ว' },
        ]}
        activeDatePreset={datePreset}
        onDatePresetChange={(preset) => applyDatePreset(preset)}
        statusOptions={
          activeTab === 'po'
            ? [
              { value: 'open', label: 'รอรับของ (Open)' },
              { value: 'partial', label: 'รับบางส่วน (Partial)' },
              { value: 'received', label: 'รับของครบแล้ว' },
              { value: 'cancelled', label: 'ยกเลิก (Cancelled)' },
            ]
            : activeTab === 'pr'
              ? [
                { value: 'pending', label: 'รอสั่งซื้อ' },
                { value: 'ordered', label: 'สั่งซื้อแล้ว' },
                { value: 'cancelled', label: 'ยกเลิก' },
              ]
              : []
        }
        activeStatus={filterStatus}
        onStatusChange={setFilterStatus}
        viewModes={activeTab === 'po' ? ['table', 'cards'] : null}
        activeViewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={handleExport}
        columns={activeTab === 'po' ? poColumns : activeTab === 'pr' ? prColumns : null}
        onToggleColumn={activeTab === 'po' ? togglePoColumn : togglePrColumn}
        activeChips={activeChips}
        onClearAllFilters={clearAllFilters}
        primaryAction={
          canCreate
            ? activeTab === 'po'
              ? { label: '+ สร้างใบสั่งซื้อ', to: '/purchasing/po/new' }
              : activeTab === 'pr'
                ? { label: '+ ออกใบขอซื้อ (PR)', to: '/purchasing/pr/new' }
                : null
            : null
        }
      />

      {/* แผงตัวกรองเสริมแบบพับได้ (Collapsible Secondary Filter Panel) */}
      {showFilterDrawer && (
        <div className="rounded-card bg-[var(--surface)] border border-[var(--border)] p-4 shadow-sm space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-xs font-bold text-[var(--text)]">ตัวกรองละเอียด (Advanced Filters)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowFilterDrawer(false)}
              className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. โครงการ / ไซต์งาน */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                โครงการ / ไซต์งาน
              </label>
              <SearchableSelect
                options={[
                  { value: '', label: 'ทุกโครงการ', badge: 'ทั้งหมด' },
                  ...projects.map((p) => ({
                    value: p.id,
                    badge: p.project_code,
                    label: `${p.project_code} ${p.project_name}`,
                    subLabel: p.project_name,
                    keywords: `${p.project_code} ${p.project_name}`,
                  })),
                ]}
                value={filterProject}
                onChange={(val) => setFilterProject(val)}
                placeholder="พิมพ์ค้นหาโครงการ..."
              />
            </div>

            {/* 2. สถานะกำหนดส่งมอบ (PO) */}
            {activeTab === 'po' && (
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                  กำหนดส่งมอบ
                </label>
                <select
                  className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  value={filterDueStatus}
                  onChange={(e) => setFilterDueStatus(e.target.value)}
                >
                  <option value="all">ทุกกำหนดส่ง ({pos.length})</option>
                  <option value="overdue">เกินกำหนดส่งมอบ ({overduePos.length})</option>
                  <option value="urgent">ใกล้ครบกำหนด 7 วัน ({dueSoonPos.length})</option>
                  <option value="on_track">รอนำส่งตามกำหนด ({onTrackPos.length})</option>
                  <option value="completed">ส่งมอบครบแล้ว ({completedPos.length})</option>
                  <option value="no_date">ไม่ระบุวันส่งมอบ</option>
                </select>
              </div>
            )}

            {/* 3. วันที่เริ่มต้น */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                ตั้งแต่วันที่
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setDatePreset('custom')
                }}
                className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>

            {/* 4. ถึงวันที่ */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                ถึงวันที่
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setDatePreset('custom')
                }}
                className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. เนื้อหาตามแท็บที่เลือก */}
      {loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs overflow-hidden">
          <SkeletonTable rows={6} cols={6} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 text-xs font-semibold">
          {error}
        </div>
      ) : (
        <>
          {/* TAB 1: รายการใบสั่งซื้อทั้งหมด (PO) พร้อมระบบ 7 ฟังก์ชัน และรายงานวันครบกำหนด */}
          {activeTab === 'po' && (
            <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-steel-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-steel-900 dark:text-slate-100">
                    รายการใบสั่งซื้อทั้งหมด ({filteredPos.length} รายการ)
                  </span>
                  {filterDueStatus !== 'all' && (
                    <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      กรอง: {filterDueStatus}
                    </span>
                  )}
                </div>
                <div className="text-xs text-steel-500 dark:text-slate-400">
                  คลิกที่ปุ่ม <span className="font-mono font-bold bg-steel-100 dark:bg-slate-800 dark:text-slate-200 px-1 py-0.5 rounded border border-steel-200 dark:border-slate-700">⋯</span> เพื่อเลือกคำสั่งพิมพ์, จ่าซอง, แชร์, สร้างซ้ำ หรือลบ
                </div>
              </div>

              {filteredPos.length === 0 ? (
                <div className="py-12 text-center text-steel-400 dark:text-slate-500">
                  <Package className="mx-auto h-8 w-8 text-steel-300 dark:text-slate-600 mb-2" />
                  <p className="font-semibold text-xs">ไม่พบใบสั่งซื้อตามเงื่อนไขที่เลือก</p>
                  {canCreate && (
                    <Link
                      to="/purchasing/po/new"
                      className="mt-3 inline-flex items-center gap-1 rounded-xl bg-steel-900 dark:bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-hivis dark:text-slate-950 hover:bg-steel-800 dark:hover:bg-amber-400 transition"
                    >
                      + สร้างใบสั่งซื้อใหม่
                    </Link>
                  )}
                </div>
              ) : viewMode === 'cards' ? (
                /* มุมมองการ์ด (Card View): เหมาะกับหน้าจอขนาดกะทัดรัด ไม่ต้องเลื่อนแนวนอน */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 p-4 bg-steel-50/40 dark:bg-slate-900/40">
                  {paginatedPos.map((r) => {
                    const dueStatus = getPoDueStatus(r)
                    const isPaid = r.payment_status === 'ชำระครบแล้ว' || (Number(r.remaining_amount) <= 0.05 && Number(r.deposit_paid_amount) > 0)

                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between gap-3 relative"
                      >
                        {/* ส่วนหัวการ์ด: เลขที่ PO + วันที่ + สถานะวงจร */}
                        <div className="flex items-start justify-between gap-2 border-b border-steel-100 dark:border-slate-800 pb-2.5">
                          <div>
                            <Link
                              to={`/purchasing/po/${r.id}`}
                              className="font-bold text-sm text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <span></span>
                              <span>{r.po_no}</span>
                            </Link>
                            <div className="text-[11px] text-steel-500 dark:text-slate-400 mt-0.5">
                              สั่งซื้อ: {formatThaiDate(r.order_date)}
                              {r.pr?.pr_no && <span className="ml-1.5 font-mono text-sky-700 dark:text-sky-400">({r.pr.pr_no})</span>}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {(() => {
                              if (r.status === 'cancelled') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                                    <span></span> ยกเลิก
                                  </span>
                                )
                              }
                              if (r.status === 'received' && isPaid) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                    <span></span> รับครบ & จ่ายแล้ว
                                  </span>
                                )
                              }
                              if (r.status === 'received') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700">
                                    <span></span> รับของแล้ว · รอจ่าย
                                  </span>
                                )
                              }
                              if (r.status === 'partial') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    <span></span> รับบางส่วน
                                  </span>
                                )
                              }
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 border border-steel-200 dark:border-slate-700">
                                  <span></span> รอรับของ
                                </span>
                              )
                            })()}
                          </div>
                        </div>

                        {/* ข้อมูลกลางการ์ด: ร้านค้า, โครงการ, วันครบกำหนด */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-start gap-1.5">
                            <span className="text-steel-400 dark:text-slate-500 shrink-0 font-medium w-14">ร้านค้า:</span>
                            <span className="font-bold text-steel-900 dark:text-slate-100 truncate flex-1" title={r.custom_vendor_name || r.vendors?.vendor_name}>
                              {r.custom_vendor_name || r.vendors?.vendor_name || '-'}
                            </span>
                          </div>

                          <div className="flex items-start gap-1.5">
                            <span className="text-steel-400 dark:text-slate-500 shrink-0 font-medium w-14">โครงการ:</span>
                            <div className="truncate flex-1">
                              <span className="font-semibold text-steel-800 dark:text-slate-200">
                                {r.custom_project_name || (r.projects ? `${r.projects.project_code} ${r.projects.project_name}` : 'ของกลางบริษัท')}
                              </span>
                              {r.customer_name && (
                                <div className="text-[11px] text-blue-700 dark:text-sky-300 truncate mt-0.5 flex items-center gap-1">
                                  <span></span>
                                  <span>{r.customer_name}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="text-steel-400 dark:text-slate-500 shrink-0 font-medium w-14">กำหนดส่ง:</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {r.expected_delivery_date ? (
                                <span className="font-mono text-xs font-semibold text-steel-800 dark:text-slate-200 mr-1">
                                  {formatThaiDate(r.expected_delivery_date)}
                                </span>
                              ) : null}
                              {dueStatus && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${dueStatus.badgeCls}`}>
                                  <span>{dueStatus.icon}</span>
                                  <span>{dueStatus.label}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ส่วนท้ายการ์ด: ยอดเงินสุทธิ + ปุ่มคำสั่ง */}
                        <div className="pt-2.5 border-t border-steel-100 dark:border-slate-800 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[10px] text-steel-400 dark:text-slate-500 font-medium">ยอดรวมสุทธิ</div>
                            <div className="font-mono font-black text-sm text-steel-900 dark:text-slate-100">
                              ฿{baht(r.total_amount)}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {r.status === 'received' && !isPaid && (
                              <button
                                type="button"
                                onClick={() => setPaymentTargetPo(r)}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-2.5 py-1 text-xs font-bold text-slate-950 transition shadow-xs cursor-pointer"
                                title="จ่ายเงิน"
                              >
                                <span></span>
                                <span>จ่ายเงิน</span>
                              </button>
                            )}
                            {['open', 'partial'].includes(r.status) && (
                              <Link
                                to={`/purchasing/po/${r.id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs font-bold text-white transition shadow-xs"
                                title="ตรวจรับสินค้าเข้าสโตร์"
                              >
                                <span></span>
                                <span>รับของ</span>
                              </Link>
                            )}

                            <Link
                              to={`/purchasing/po/${r.id}`}
                              className="inline-flex items-center justify-center rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 p-1.5 text-steel-700 dark:text-slate-200 transition shadow-xs"
                              title="ดูรายละเอียดใบสั่งซื้อ"
                            >
                              <Eye className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => setSelectedPoForPrint(r)}
                              className="inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-1.5 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition shadow-xs cursor-pointer"
                              title="พิมพ์ใบสั่งซื้อ A4 / PDF"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>

                            {/* ปุ่มเมนูคำสั่งเพิ่มเติม */}
                            <button
                              type="button"
                              onClick={(e) => toggleDropdown(e, 'po', r)}
                              className="inline-flex items-center justify-center rounded-lg border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-100 dark:hover:bg-slate-700 p-1.5 text-steel-600 dark:text-slate-300 transition shadow-xs cursor-pointer"
                              title="เปิดคำสั่งเพิ่มเติม (พิมพ์, แชร์, แก้ไข, จ่ายเงิน, ยกเลิก)"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* มุมมองตาราง (Table View): คอลัมน์สมดุล มีเส้นตารางชัดเจน แถบสลับสี และเมนูไม่ทับซ้อน */
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
                    <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                      <tr>
                        {isPoColVisible('po_no') && <th className="py-3.5 px-3.5 w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่ PO / วันที่</th>}
                        {isPoColVisible('vendor') && <th className="py-3.5 px-3 min-w-[140px] border-r border-slate-200/70 dark:border-slate-700/60">ผู้ขาย / ร้านค้า</th>}
                        {isPoColVisible('project') && <th className="py-3.5 px-3 min-w-[140px] border-r border-slate-200/70 dark:border-slate-700/60">โครงการ / ลูกค้า</th>}
                        {isPoColVisible('amount') && <th className="py-3.5 px-3 w-28 text-right border-r border-slate-200/70 dark:border-slate-700/60">ยอดรวม (บาท)</th>}
                        {isPoColVisible('due_date') && <th className="py-3.5 px-3 w-40 min-w-[140px] border-r border-slate-200/70 dark:border-slate-700/60">วันครบกำหนด</th>}
                        {isPoColVisible('status') && <th className="py-3.5 px-3 w-36 text-center border-r border-slate-200/70 dark:border-slate-700/60">สถานะวงจรเอกสาร</th>}
                        <th className="py-3.5 px-3.5 w-24 text-right">
                          การจัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedPos.map((r, rowIdx) => {
                        const dueStatus = getPoDueStatus(r)
                        const isPaid = r.payment_status === 'ชำระครบแล้ว' || (Number(r.remaining_amount) <= 0.05 && Number(r.deposit_paid_amount) > 0)

                        return (
                          <tr
                            key={r.id}
                            className={`transition-colors border-b border-slate-200 dark:border-slate-800 group ${
                              rowIdx % 2 === 0
                                ? 'bg-white dark:bg-slate-900'
                                : 'bg-slate-50/70 dark:bg-slate-800/40'
                            } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                          >
                            {/* 1. เลขที่ PO + วันที่สั่งซื้อ (Sticky Left ไม่หลุดจอ) */}
                            {isPoColVisible('po_no') && (
                              <td className="py-3 px-3.5 align-top whitespace-nowrap sticky left-0 z-10 bg-inherit shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] border-r border-slate-200/60 dark:border-slate-800/60">
                                <Link
                                  to={`/purchasing/po/${r.id}`}
                                  className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                >
                                  <span></span>
                                  <span>{r.po_no}</span>
                                </Link>
                                <div className="text-[11px] text-steel-500 dark:text-slate-400 mt-0.5">
                                  {formatThaiDate(r.order_date)}
                                </div>
                                {r.pr?.pr_no && (
                                  <div className="text-[10px] text-sky-700 dark:text-sky-400 font-mono mt-0.5">
                                    PR: {r.pr.pr_no}
                                  </div>
                                )}
                              </td>
                            )}

                            {/* 2. ผู้ขาย / ร้านค้า */}
                            {isPoColVisible('vendor') && (
                              <td className="py-3 px-3.5 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                <div className="font-bold text-steel-900 dark:text-slate-100 truncate max-w-[200px]" title={r.custom_vendor_name || r.vendors?.vendor_name}>
                                  {r.custom_vendor_name || r.vendors?.vendor_name || '-'}
                                </div>
                                <div className="text-[11px] text-steel-500 dark:text-slate-400 truncate max-w-[200px]">
                                  {r.vendors?.contact_person ? `ติดต่อ: ${r.vendors.contact_person}` : ''}
                                  {r.vendors?.phone ? ` โทร: ${r.vendors.phone}` : ''}
                                  {!r.vendors && r.custom_vendor_name && <span className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1 rounded text-[10px] border border-amber-200 dark:border-amber-800">ร้านค้าคีย์เอง</span>}
                                </div>
                              </td>
                            )}

                            {/* 3. โครงการ & ลูกค้า */}
                            {isPoColVisible('project') && (
                              <td className="py-3 px-3.5 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="font-bold text-steel-900 dark:text-slate-100 truncate max-w-[190px]" title={r.custom_project_name || (r.projects ? `${r.projects.project_code} ${r.projects.project_name}` : 'ของกลางบริษัท')}>
                                    {r.custom_project_name || (r.projects ? r.projects.project_code : 'ของกลางบริษัท')}
                                  </div>
                                  <div className="text-[11px] text-steel-600 dark:text-slate-400 truncate max-w-[190px]">
                                    {r.projects?.project_name || (r.custom_project_name ? 'โครงการคีย์เอง' : 'สต็อกส่วนกลาง')}
                                  </div>
                                  {r.customer_name && (
                                    <div className="text-[11px] leading-relaxed text-blue-700 dark:text-sky-300 truncate max-w-[190px] font-semibold flex items-center gap-1 mt-0.5">
                                      <span className="shrink-0"></span>
                                      <span className="truncate">{r.customer_name}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* 4. ยอดรวมสุทธิ */}
                            {isPoColVisible('amount') && (
                              <td className="py-3 px-3.5 align-top text-right whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                                <div className="font-mono font-black text-sm text-steel-900 dark:text-slate-100 tabular-nums">
                                  ฿{baht(r.total_amount)}
                                </div>
                                <div className="text-[10px] text-steel-400 dark:text-slate-500 font-normal">บาท</div>
                              </td>
                            )}

                            {/* 5. วันครบกำหนดส่งมอบ + Badge วิเคราะห์กำหนด */}
                            {isPoColVisible('due_date') && (
                              <td className="py-3 px-3.5 align-top">
                                {r.expected_delivery_date ? (
                                  <div className="font-mono text-xs font-bold text-steel-800 dark:text-slate-200">
                                    {formatThaiDate(r.expected_delivery_date)}
                                  </div>
                                ) : null}
                                {dueStatus && (
                                  <div className={r.expected_delivery_date ? 'mt-1' : ''}>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${dueStatus.badgeCls}`}>
                                      <span>{dueStatus.icon}</span>
                                      <span>{dueStatus.label}</span>
                                    </span>
                                  </div>
                                )}
                              </td>
                            )}

                            {/* 6. สถานะวงจร (รับของ & จ่ายเงิน) */}
                            {isPoColVisible('status') && (
                              <td className="py-3 px-3 align-middle text-center whitespace-nowrap">
                                {(() => {
                                  if (r.status === 'cancelled') {
                                    return <StatusBadge status="cancelled" label="ยกเลิกคำสั่งซื้อ" />
                                  }
                                  if (r.status === 'received' && isPaid) {
                                    return <StatusBadge status="success" label="รับครบ & จ่ายแล้ว" />
                                  }
                                  if (r.status === 'received') {
                                    return (
                                      <div className="flex flex-col items-center gap-1">
                                        <StatusBadge status="received" label="รับของเข้าคลังแล้ว" />
                                        <StatusBadge status="warning" label="ยังไม่จ่าย (รอจ่าย)" />
                                      </div>
                                    )
                                  }
                                  if (r.status === 'partial') {
                                    return (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <StatusBadge status="partial" label="รับบางส่วน" />
                                        <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                                          {isPaid ? 'จ่ายเงินแล้ว' : 'รอจ่ายเงิน'}
                                        </span>
                                      </div>
                                    )
                                  }
                                  return (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <StatusBadge status="open" label="รอรับของ" />
                                      <span className={`text-[10px] font-semibold ${isPaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {isPaid ? 'จ่ายล่วงหน้าแล้ว' : 'รอรับของก่อนจ่าย'}
                                      </span>
                                    </div>
                                  )
                                })()}
                              </td>
                            )}

                            {/* 7. การจัดการ */}
                            <td className="py-3 px-3.5 align-middle text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                                {r.status === 'received' && !isPaid ? (
                                  <button
                                    type="button"
                                    onClick={() => setPaymentTargetPo(r)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-2 py-1 text-xs font-bold text-slate-950 transition shadow-xs cursor-pointer"
                                    title={`รับของเข้าคลังแล้ว คลิกเพื่อจ่ายชำระเงินตามยอดสั่งซื้อ ฿${baht(r.net_amount || r.total_amount)} บ.`}
                                  >
                                    <span></span>
                                    <span>จ่าย</span>
                                  </button>
                                ) : ['open', 'partial'].includes(r.status) ? (
                                  <Link
                                    to={`/purchasing/po/${r.id}`}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs font-bold text-white transition shadow-xs"
                                    title="ตรวจรับสินค้าเข้าสโตร์"
                                  >
                                    <span></span>
                                    <span>รับของ</span>
                                  </Link>
                                ) : (
                                  <Link
                                    to={`/purchasing/po/${r.id}`}
                                    className="inline-flex items-center gap-1 rounded-lg border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-semibold text-steel-700 dark:text-slate-200 transition shadow-xs"
                                    title="ดูรายละเอียดใบสั่งซื้อ"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                                    <span>ดู</span>
                                  </Link>
                                )}

                                {/* ปุ่มเมนูดรอปดาวน์กะทัดรัด ไม่หลุดขอบ ไม่ทับซ้อน */}
                                <button
                                  type="button"
                                  onClick={(e) => toggleDropdown(e, 'po', r)}
                                  className={`inline-flex items-center justify-center rounded-lg border p-1 text-xs transition shadow-xs cursor-pointer ${activeDropdown && activeDropdown.id === r.id && activeDropdown.type === 'po'
                                    ? 'bg-amber-100 dark:bg-amber-950/80 border-amber-400 text-amber-900 dark:text-amber-200'
                                    : 'border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-100 dark:hover:bg-slate-700 text-steel-600 dark:text-slate-300'
                                    }`}
                                  title="เมนูคำสั่งเพิ่มเติม (พิมพ์, จ่าซอง, แชร์, สร้างซ้ำ, แก้ไข, ลบ)"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* แถบเปลี่ยนหน้า (PO Pagination) */}
              {filteredPos.length > 0 && (
                <div className="border-t border-steel-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredPos.length}
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
            </div>
          )}

          {/* TAB 2: รายการใบขอซื้อ (PR) */}
          {activeTab === 'pr' && (
            <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-steel-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-steel-900 dark:text-slate-100">
                    รายการใบขอซื้อ (PR) ทั้งหมด ({filteredPrs.length} รายการ)
                  </span>
                  {filterStatus && (
                    <span className="rounded-md bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 text-[11px] font-bold text-sky-900 dark:text-sky-300 border border-sky-300 dark:border-sky-700">
                      สถานะ: {PR_STATUS[filterStatus]?.label || filterStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canCreate && (
                    <Link
                      to="/purchasing/pr/new"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-steel-900 dark:bg-amber-500 hover:bg-steel-800 dark:hover:bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-hivis dark:text-slate-950 shadow-xs transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span> ออกใบขอซื้อ (PR)</span>
                    </Link>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
                  <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                    <tr>
                      {isPrColVisible('pr_no') && <th className="py-3.5 px-3.5 w-36 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">เลขที่ PR / วันที่ขอ</th>}
                      {isPrColVisible('project') && <th className="py-3.5 px-3 min-w-[170px] border-r border-slate-200/70 dark:border-slate-700/60">โครงการ / ลูกค้า / ผู้ขายแนะนำ</th>}
                      {isPrColVisible('items') && <th className="py-3.5 px-3 w-28 text-center border-r border-slate-200/70 dark:border-slate-700/60">จำนวนรายการ</th>}
                      {isPrColVisible('status') && <th className="py-3.5 px-3 w-32 text-center border-r border-slate-200/70 dark:border-slate-700/60">สถานะ</th>}
                      {isPrColVisible('linked_po') && <th className="py-3.5 px-3 min-w-[150px] border-r border-slate-200/70 dark:border-slate-700/60">ใบสั่งซื้อที่เกี่ยวข้อง (PO)</th>}
                      <th className="py-3.5 px-3.5 w-24 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredPrs.length === 0 ? (
                      <tr>
                        <td colSpan={prColumns.filter((c) => c.visible).length + 1} className="py-12 text-center text-slate-400 dark:text-slate-500">
                          <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="font-semibold text-xs">ไม่พบใบขอซื้อตามเงื่อนไขที่เลือก</p>
                          {canCreate && (
                            <Link
                              to="/purchasing/pr/new"
                              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-amber-400 transition"
                            >
                              + ออกใบขอซื้อ (PR) ใหม่
                            </Link>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedPrs.map((r, rowIdx) => {
                        const linkedPos = poByPrId[r.id] || []
                        return (
                          <tr
                            key={r.id}
                            className={`transition-colors border-b border-slate-200 dark:border-slate-800 group ${
                              rowIdx % 2 === 0
                                ? 'bg-white dark:bg-slate-900'
                                : 'bg-slate-50/70 dark:bg-slate-800/40'
                            } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                          >
                            {/* 1. เลขที่ PR + วันที่ขอซื้อ */}
                            {isPrColVisible('pr_no') && (
                              <td className="py-3 px-3.5 align-top whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                                <Link
                                  to={`/purchasing/pr/${r.id}`}
                                  className="font-bold text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1"
                                >
                                  <span>{r.pr_no}</span>
                                </Link>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {formatThaiDate(r.request_date)}
                                </div>
                              </td>
                            )}

                            {/* 2. โครงการ / ลูกค้า / ผู้ขายแนะนำ */}
                            {isPrColVisible('project') && (
                              <td className="py-3 px-3 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="font-bold text-steel-900 dark:text-slate-100 truncate max-w-[220px]" title={r.custom_project_name || (r.projects ? `${r.projects.project_code} ${r.projects.project_name}` : 'ของกลางบริษัท')}>
                                    {r.custom_project_name || (r.projects ? r.projects.project_code : 'ของกลางบริษัท')}
                                  </div>
                                  <div className="text-[11px] text-steel-600 dark:text-slate-400 truncate max-w-[220px]">
                                    {r.projects?.project_name || (r.custom_project_name ? 'โครงการคีย์เอง' : 'สต็อกส่วนกลาง')}
                                  </div>
                                  {r.customer_name && (
                                    <div className="text-[11px] leading-relaxed text-blue-700 dark:text-sky-300 truncate max-w-[220px] font-semibold flex items-center gap-1 mt-0.5">
                                      <span className="shrink-0"></span>
                                      <span className="truncate">{r.customer_name}</span>
                                    </div>
                                  )}
                                  {r.suggested_vendor && (
                                    <div className="text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-300 truncate max-w-[220px] font-semibold flex items-center gap-1 mt-0.5">
                                      <span className="shrink-0"></span>
                                      <span className="truncate">แนะนำ: {r.suggested_vendor}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* 3. จำนวนรายการ */}
                            {isPrColVisible('items') && (
                              <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60">
                                  <Package className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                  <span className="font-mono font-bold text-steel-900 dark:text-slate-100 tabular-nums">
                                    {r.purchase_requisition_items?.length || 0}
                                  </span>
                                  <span className="text-[10px] text-steel-500 dark:text-slate-400">รายการ</span>
                                </div>
                              </td>
                            )}

                            {/* 4. สถานะ PR */}
                            {isPrColVisible('status') && (
                              <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                <StatusBadge status={r.status} />
                              </td>
                            )}

                            {/* 5. ใบสั่งซื้อที่เกี่ยวข้อง (PO Link) */}
                            {isPrColVisible('linked_po') && (
                              <td className="py-3 px-3 align-top">
                                {linkedPos.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {linkedPos.map((p) => (
                                      <Link
                                        key={p.id}
                                        to={`/purchasing/po/${p.id}`}
                                        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-2xs"
                                        title={`เปิดดูใบสั่งซื้อ ${p.po_no}`}
                                      >
                                        <span></span>
                                        <span>{p.po_no}</span>
                                      </Link>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-steel-400 dark:text-slate-500 font-mono">-</span>
                                )}
                              </td>
                            )}

                            {/* 6. การจัดการ */}
                            <td className="py-3 px-3.5 align-middle text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                                {r.status === 'pending' && canCreate ? (
                                  <Link
                                    to={`/purchasing/po/new?pr=${r.id}`}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs font-bold text-white transition shadow-xs"
                                    title="ออกใบสั่งซื้อ (PO) จากใบขอซื้อนี้"
                                  >
                                    <span></span>
                                    <span>ออก PO</span>
                                  </Link>
                                ) : (
                                  <Link
                                    to={`/purchasing/pr/${r.id}`}
                                    className="inline-flex items-center gap-1 rounded-lg border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-semibold text-steel-700 dark:text-slate-200 transition shadow-xs"
                                    title="ดูรายละเอียดใบขอซื้อ"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                                    <span>ดู</span>
                                  </Link>
                                )}

                                {/* ปุ่มเมนูดรอปดาวน์กะทัดรัด */}
                                <button
                                  type="button"
                                  onClick={(e) => toggleDropdown(e, 'pr', r)}
                                  className={`inline-flex items-center justify-center rounded-lg border p-1 text-xs transition shadow-xs cursor-pointer ${activeDropdown && activeDropdown.id === r.id && activeDropdown.type === 'pr'
                                    ? 'bg-sky-100 dark:bg-sky-950/80 border-sky-400 text-sky-900 dark:text-sky-200'
                                    : 'border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-100 dark:hover:bg-slate-700 text-steel-600 dark:text-slate-300'
                                    }`}
                                  title="เมนูคำสั่งเพิ่มเติม"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* แถบเปลี่ยนหน้า (PR Pagination) */}
              {filteredPrs.length > 0 && (
                <div className="border-t border-steel-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 px-4 py-3">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredPrs.length}
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
            </div>
          )}

          {/* TAB 3: ตรวจรับของเข้า (GR) & ประวัติพัสดุที่เคยรับเข้ามา */}
          {activeTab === 'receipts' && (
            <div className="space-y-4">
              {/* แถบสลับมุมมองระหว่าง ประวัติพัสดุที่เคยรับเข้ามา VS รอรับของเข้าสโตร์ */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-steel-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptSubTab('received_items')
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer ${receiptSubTab === 'received_items'
                      ? 'bg-emerald-700 text-white shadow-sm dark:bg-emerald-600'
                      : 'bg-steel-50 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-100 dark:hover:bg-slate-700 border border-steel-200 dark:border-slate-700'
                      }`}
                  >
                    <span></span>
                    <span>ประวัติพัสดุที่เคยรับเข้ามา (Received Materials History)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${receiptSubTab === 'received_items' ? 'bg-white/25 text-white' : 'bg-steel-200 dark:bg-slate-700 text-steel-700 dark:text-slate-200'
                      }`}>
                      {filteredReceivedMaterials.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReceiptSubTab('pending')
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer ${receiptSubTab === 'pending'
                      ? 'bg-sky-700 text-white shadow-sm dark:bg-sky-600'
                      : 'bg-steel-50 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-100 dark:hover:bg-slate-700 border border-steel-200 dark:border-slate-700'
                      }`}
                  >
                    <span>⏳</span>
                    <span>รอตรวจรับเข้าสโตร์ (Pending POs)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${receiptSubTab === 'pending' ? 'bg-white/25 text-white' : 'bg-steel-200 dark:bg-slate-700 text-steel-700 dark:text-slate-200'
                      }`}>
                      {pendingReceipts.length}
                    </span>
                  </button>
                </div>

                {receiptSubTab === 'received_items' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* ปุ่มสลับโหมด: รวมรายการไม่ให้ซ้ำ VS แยกตามรอบตรวจรับ GRN */}
                    <div className="flex items-center bg-steel-100 dark:bg-slate-800 p-0.5 rounded-xl border border-steel-200 dark:border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptGroupMode('grouped')
                          setCurrentPage(1)
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${receiptGroupMode === 'grouped'
                          ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-xs'
                          : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-white'
                          }`}
                        title="รวมรายการตามใบสั่งซื้อและวัสดุ ไม่ให้แสดงแถวซ้ำซ้อน"
                      >
                        <span></span>
                        <span>สรุปตาม PO (ไม่ซ้ำรายการ)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setReceiptGroupMode('by_grn')
                          setCurrentPage(1)
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${receiptGroupMode === 'by_grn'
                          ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-xs'
                          : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-white'
                          }`}
                        title="แสดงแยกตามรอบและเลขที่ใบตรวจรับแต่ละครั้ง (GRN)"
                      >
                        <span></span>
                        <span>แยกตามรอบตรวจรับ (GRN)</span>
                      </button>
                    </div>

                    <div className="text-xs text-steel-600 dark:text-slate-300 flex items-center gap-2 pl-1">
                      <span>มูลค่ารับเข้ารวม: <b className="text-emerald-950 dark:text-emerald-400 font-mono font-black text-sm">{baht(totalReceivedValue)}</b> บาท</span>
                    </div>
                  </div>
                )}
              </div>

              {/* มุมมองที่ 1: รายการพัสดุและวัสดุทั้งหมดที่เคยตรวจรับเข้ามา (Received Materials History) */}
              {receiptSubTab === 'received_items' && (
                <div className="space-y-4">
                  {/* Summary Metric Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 border-l-sky-500 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">รายการวัสดุที่เคยรับเข้า</div>
                        <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
                          {filteredReceivedMaterials.length} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">รายการ</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-800">
                        <PackageCheck className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 border-l-indigo-500 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">จำนวนหน่วยรับเข้ารวม</div>
                        <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
                          {totalReceivedQuantity.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">หน่วย/ชิ้น</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                        <Layers className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 border-l-emerald-500 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">มูลค่ารับเข้ารวมตามช่วงเวลา</div>
                        <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                          {baht(totalReceivedValue)} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">บาท</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                        <Coins className="h-5 w-5" />
                      </div>
                    </div>
                  </div>

                  {/* ตารางประวัติพัสดุที่เคยรับเข้า (จัดรูปแบบ Grid ชัดเจน มีแถบสลับสี และเส้นแบ่งเซลล์) */}
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <table className="w-full text-left text-xs min-w-[1050px] border-collapse">
                      <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                        <tr>
                          <th className="py-3.5 px-3.5 w-28 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">วันที่รับเข้า</th>
                          <th className="py-3.5 px-3.5 w-36 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">เลขที่รับ (GRN)</th>
                          <th className="py-3.5 px-3.5 w-32 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">เลขที่ PO</th>
                          <th className="py-3.5 px-4 min-w-[220px] border-r border-slate-200/70 dark:border-slate-700/60">รายการวัสดุ / พัสดุ</th>
                          <th className="py-3.5 px-3 text-right w-24 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">จำนวนที่รับ</th>
                          <th className="py-3.5 px-3 text-center w-16 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">หน่วย</th>
                          <th className="py-3.5 px-3.5 text-right w-28 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">ราคา/หน่วย</th>
                          <th className="py-3.5 px-3.5 text-right w-32 whitespace-nowrap border-r border-slate-200/70 dark:border-slate-700/60">มูลค่ารวม (บาท)</th>
                          <th className="py-3.5 px-3.5 min-w-[160px] border-r border-slate-200/70 dark:border-slate-700/60">ผู้ขาย / ร้านค้า</th>
                          <th className="py-3.5 px-3.5 min-w-[160px] border-r border-slate-200/70 dark:border-slate-700/60">โครงการปลายทาง</th>
                          <th className="py-3.5 px-3 text-center w-28 whitespace-nowrap">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredReceivedMaterials.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-12 text-center text-slate-400 dark:text-slate-500">
                              <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                              <p className="font-semibold text-xs">ไม่พบประวัติการตรวจรับพัสดุตามเงื่อนไขหรือช่วงเวลาที่เลือก</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedReceivedMaterials.map((m, rowIdx) => {
                            const grnItems = m.grn_list && m.grn_list.length > 1
                              ? m.grn_list
                              : (typeof m.grn_no === 'string' && m.grn_no.includes(',')
                                  ? m.grn_no.replace(/\s*\(\d+\s*รอบ\)/, '').split(',').map(s => s.trim()).filter(Boolean)
                                  : null)

                            return (
                              <tr
                                key={m.id || rowIdx}
                                className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                                  rowIdx % 2 === 0
                                    ? 'bg-white dark:bg-slate-900'
                                    : 'bg-slate-50/70 dark:bg-slate-800/40'
                                } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                              >
                                <td className="py-3 px-3.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  {formatThaiDate(m.received_date)}
                                </td>
                                <td className="py-3 px-3.5 font-mono font-bold text-sky-800 dark:text-sky-400 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  {grnItems && grnItems.length > 1 ? (
                                    <div className="flex flex-col gap-1 items-start">
                                      {grnItems.map((grn, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-mono font-bold whitespace-nowrap shadow-2xs"
                                        >
                                          {grn}
                                        </span>
                                      ))}
                                      <span className="text-[10px] font-sans font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap mt-0.5">
                                        ({grnItems.length} รอบ)
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-mono font-bold whitespace-nowrap">
                                      {m.grn_no}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  <Link
                                    to={`/purchasing/po/${m.po_id}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-2xs"
                                  >
                                    <span>{m.po_no}</span>
                                  </Link>
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  <div className="font-bold text-slate-900 dark:text-white leading-snug">{m.item_name}</div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedUsageItem({ item_name: m.item_name })}
                                    className="text-[11px] text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline font-normal cursor-pointer flex items-center gap-1 mt-1"
                                  >
                                    <span>ดูประวัติโครงการที่เคยใช้</span>
                                  </button>
                                </td>
                                <td className="py-3 px-3 text-right align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  <span className="font-mono font-black text-slate-900 dark:text-slate-100 bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    {Math.round(Number(m.quantity) || 0)}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400 font-medium align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  {m.unit}
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono text-slate-700 dark:text-slate-300 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  {baht(m.unit_cost)}
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  {baht(m.total_value)}
                                </td>
                                <td className="py-3 px-3.5 text-slate-800 dark:text-slate-200 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  <div className="break-words whitespace-normal leading-relaxed max-w-[200px] font-medium" title={m.vendor_name}>
                                    {m.vendor_name}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-slate-700 dark:text-slate-300 align-top border-r border-slate-200/60 dark:border-slate-800/60">
                                  <div className="break-words whitespace-normal leading-relaxed max-w-[200px] font-medium text-slate-900 dark:text-slate-100" title={m.project_name}>
                                    {m.project_name}
                                  </div>
                                  {m.customer_name && (
                                    <div className="text-[11px] leading-relaxed text-sky-700 dark:text-sky-300 break-words whitespace-normal mt-0.5 font-normal">
                                      {m.customer_name}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center whitespace-nowrap align-top">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>เข้าคลังแล้ว</span>
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* แถบเปลี่ยนหน้า (Received Materials Pagination) */}
                  {filteredReceivedMaterials.length > 0 && (
                    <div className="border-t border-steel-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-steel-200 dark:border-slate-800">
                      <Pagination
                        currentPage={currentPage}
                        totalItems={filteredReceivedMaterials.length}
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
                </div>
              )}

              {/* มุมมองที่ 2: รายการใบสั่งซื้อที่อยู่ระหว่างรอรับของ (Pending POs) */}
              {receiptSubTab === 'pending' && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-4 text-xs sm:text-sm text-sky-900 dark:text-sky-200 shadow-xs">
                    <div className="font-bold flex items-center gap-2">
                      <span className="text-base">⏳</span>
                      <span>รายการใบสั่งซื้อที่อยู่ระหว่างรอสินค้าส่งมอบเข้าสโตร์ (Pending Deliveries)</span>
                    </div>
                    <div className="mt-1 text-sky-800 dark:text-sky-300 text-xs">
                      คลิก <b>"ตรวจรับสินค้า"</b> เพื่อเปิดใบสั่งซื้อและบันทึกตรวจรับวัสดุเข้าสโตร์หลัก
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                    <table className="w-full text-left text-xs min-w-[950px] divide-y divide-steel-200 dark:divide-slate-800">
                      <thead className="bg-steel-50/80 dark:bg-slate-800 text-steel-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px]">
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
                      <tbody className="divide-y divide-steel-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                        {pendingReceipts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-steel-400 dark:text-slate-500">
                              ไม่มีใบสั่งซื้อค้างส่งมอบ หรือไม่พบข้อมูลตามช่วงวันที่ที่เลือก
                            </td>
                          </tr>
                        ) : (
                          paginatedReceipts.map((r) => {
                            const dueStatus = getPoDueStatus(r)
                            return (
                              <tr key={r.id} className="hover:bg-steel-50/70 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="py-3 px-3.5 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                  <Link to={`/purchasing/po/${r.id}`} className="hover:underline flex items-center gap-1">
                                    <span></span>
                                    <span>{r.po_no}</span>
                                  </Link>
                                  {r.pr?.pr_no && <div className="text-[11px] text-steel-500 dark:text-slate-400 font-normal">จาก {r.pr.pr_no}</div>}
                                </td>
                                <td className="py-3 px-3.5 font-semibold text-steel-900 dark:text-slate-100">
                                  <div className="break-words whitespace-normal leading-relaxed max-w-[220px]" title={r.custom_vendor_name || r.vendors?.vendor_name}>
                                    {r.custom_vendor_name || r.vendors?.vendor_name || '-'}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-steel-700 dark:text-slate-300">
                                  <div className="break-words whitespace-normal leading-relaxed max-w-[220px]" title={r.custom_project_name || `${r.projects?.project_code || ''} ${r.projects?.project_name || ''}`}>
                                    <span className="font-semibold text-steel-900 dark:text-slate-100">{r.custom_project_name || r.projects?.project_code || 'ของกลาง'}</span>{' '}
                                    <span className="text-steel-600 dark:text-slate-400">{r.projects?.project_name}</span>
                                  </div>
                                  {r.customer_name && (
                                    <div className="text-[11px] leading-relaxed text-blue-700 dark:text-sky-300 break-words whitespace-normal mt-0.5">
                                      {r.customer_name}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-steel-600 dark:text-slate-300 whitespace-nowrap">{formatThaiDate(r.order_date)}</td>
                                <td className="py-3 px-3.5">
                                  <div className="font-mono text-xs font-bold text-steel-800 dark:text-slate-200">
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
                                <td className="py-3 px-3 text-center whitespace-nowrap"><StatusBadge status={r.status} /></td>
                                <td className="py-3 px-3.5 text-right font-black text-steel-900 dark:text-slate-100 whitespace-nowrap">{baht(r.total_amount)}</td>
                                <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                  {canReceive ? (
                                    <Link
                                      to={`/purchasing/po/${r.id}`}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                                    >
                                      <span></span>
                                      <span>ตรวจรับสินค้า</span>
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-steel-400 dark:text-slate-500">รอสโตร์ตรวจรับ</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* แถบเปลี่ยนหน้า (Receipts Pagination) */}
                  {pendingReceipts.length > 0 && (
                    <div className="border-t border-steel-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-steel-200 dark:border-slate-800">
                      <Pagination
                        currentPage={currentPage}
                        totalItems={pendingReceipts.length}
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
                </div>
              )}
            </div>
          )}

          {/* TAB 4: แผนภาพวงจรจัดซื้อ (Pipeline View) */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {/* สรุป 4 กล่องกระบวนการจัดซื้อ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 dark:text-slate-400 uppercase tracking-wider">1. PR รอออก PO</div>
                  <div className="mt-1 text-2xl font-black text-amber-900 dark:text-amber-400">{pendingPrs.length} <span className="text-xs font-normal text-amber-700 dark:text-amber-300">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">คำขอจัดซื้อจากไซต์งาน</div>
                </div>

                <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 dark:text-slate-400 uppercase tracking-wider">2. PO รอรับของ</div>
                  <div className="mt-1 text-2xl font-black text-blue-900 dark:text-sky-400">{openPos.length} <span className="text-xs font-normal text-blue-700 dark:text-sky-300">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-blue-600 dark:text-sky-400">สั่งของแล้ว รอนำส่ง</div>
                </div>

                <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 dark:text-slate-400 uppercase tracking-wider">3. รับบางส่วน</div>
                  <div className="mt-1 text-2xl font-black text-purple-900 dark:text-purple-400">{partialPos.length} <span className="text-xs font-normal text-purple-700 dark:text-purple-300">ใบ</span></div>
                  <div className="mt-1 text-[11px] text-purple-600 dark:text-purple-400">ทยอยเข้าสโตร์</div>
                </div>

                <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                  <div className="text-xs font-bold text-steel-500 dark:text-slate-400 uppercase tracking-wider">4. ยอดสั่งซื้อสะสม</div>
                  <div className="mt-1 text-xl font-black text-ink dark:text-slate-100">{baht(totalSpend)}</div>
                  <div className="mt-1 text-[11px] text-steel-500 dark:text-slate-400">รวม {pos.length} ใบสั่งซื้อ</div>
                </div>
              </div>

              {/* ตารางจับคู่ PR  PO และแผนผังการผูกโยงเอกสาร */}
              <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-ink dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <span>แผนผังการผูกโยงเอกสาร (PR  PO Linkage Flow)</span>
                    </h3>
                    <p className="text-xs text-steel-500 dark:text-slate-400 mt-0.5">
                      แสดงความเชื่อมโยงของเอกสารวงจรจัดซื้อ ตั้งแต่ใบขอซื้อ (PR) ไปจนถึงใบสั่งซื้อ (PO) และสถานะการรับของ/จ่ายเงิน
                    </p>
                  </div>

                  {/* Toggle Switch: ผังกระบวนการ (Flow Cards) vs ตารางรายงาน (Table) */}
                  <div className="flex items-center rounded-xl bg-steel-100 dark:bg-slate-800 p-0.5 border border-steel-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('flow')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${pipelineViewMode === 'flow'
                        ? 'bg-white dark:bg-slate-700 text-steel-900 dark:text-amber-400 shadow-2xs'
                        : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
                        }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>ผังเชื่อมโยง (Flow)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('table')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${pipelineViewMode === 'table'
                        ? 'bg-white dark:bg-slate-700 text-steel-900 dark:text-amber-400 shadow-2xs'
                        : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
                        }`}
                    >
                      <List className="h-3.5 w-3.5" />
                      <span>ตารางรายงาน (Table)</span>
                    </button>
                  </div>
                </div>

                {/* 1. มุมมองผังเชื่อมโยงเอกสาร (Flow Cards View) */}
                {pipelineViewMode === 'flow' ? (
                  <div className="space-y-3.5">
                    {filteredPipelinePrs.length === 0 ? (
                      <div className="py-12 text-center text-steel-400 dark:text-slate-500 rounded-xl bg-steel-50/50 dark:bg-slate-800/30">
                        <Workflow className="mx-auto h-8 w-8 text-steel-300 dark:text-slate-600 mb-2" />
                        <p className="font-semibold text-xs">ไม่พบข้อมูลวงจรเอกสารตามเงื่อนไขหรือช่วงวันที่ที่ค้นหา</p>
                      </div>
                    ) : (
                      paginatedPipeline.map((r) => {
                        const linkedPos = poByPrId[r.id] || []
                        const linkedTotal = linkedPos.reduce((s, p) => s + Number(p.total_amount || 0), 0)

                        return (
                          <div
                            key={r.id}
                            className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow space-y-3 relative"
                          >
                            {/* Card Top: โครงการ + วันที่ขอ + สถานะ PR */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 dark:border-slate-800/80 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-steel-100 dark:bg-slate-800 text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700">
                                  <span></span>
                                  <span>{r.projects ? `${r.projects.project_code} · ${r.projects.project_name}` : 'ของกลางบริษัท / สต็อกส่วนกลาง'}</span>
                                </span>
                                {r.customer_name && (
                                  <span className="text-xs text-steel-500 dark:text-slate-400">
                                    ลูกค้า: {r.customer_name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-steel-500 dark:text-slate-400 font-mono">
                                  ขอซื้อเมื่อ: {formatThaiDate(r.request_date)}
                                </span>
                                <StatusBadge status={r.status} />
                              </div>
                            </div>

                            {/* Card Flow: PR [ต้นทาง] ── PO [ปลายทาง] */}
                            <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
                              {/* ต้นทาง: ใบขอซื้อ (PR Box) */}
                              <div className="md:col-span-5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-black text-xs">
                                      PR
                                    </span>
                                    <Link
                                      to={`/purchasing/pr/${r.id}`}
                                      className="font-mono font-bold text-sm text-sky-800 dark:text-sky-400 hover:underline"
                                    >
                                      {r.pr_no}
                                    </Link>
                                  </div>
                                  <Link
                                    to={`/purchasing/pr/${r.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                                  >
                                    <span>เปิดดู PR</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>

                                <div className="text-xs text-steel-600 dark:text-slate-300 space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-steel-400 dark:text-slate-500">ร้านค้าแนะนำ:</span>
                                    <span className="font-semibold text-steel-800 dark:text-slate-200">{r.suggested_vendor || '-'}</span>
                                  </div>
                                  {r.notes && (
                                    <div className="text-[11px] text-steel-500 dark:text-slate-400 line-clamp-1 italic">
                                      "{r.notes}"
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* ตัวเชื่อมโยง (Linkage Arrow) */}
                              <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
                                <div className="hidden md:flex flex-col items-center text-steel-400 dark:text-slate-500">
                                  <span className="text-[10px] font-bold uppercase tracking-wider mb-0.5">ออก PO</span>
                                  <ArrowRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="md:hidden flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-bold py-1">
                                  <span>↓ แปลงเป็นคำสั่งซื้อ (PO)</span>
                                </div>
                              </div>

                              {/* ปลายทาง: ใบสั่งซื้อ (PO Box) */}
                              <div className="md:col-span-5">
                                {linkedPos.length > 0 ? (
                                  <div className="space-y-2">
                                    {linkedPos.map((p) => (
                                      <div
                                        key={p.id}
                                        className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-2"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                                              PO
                                            </span>
                                            <Link
                                              to={`/purchasing/po/${p.id}`}
                                              className="font-mono font-bold text-sm text-emerald-800 dark:text-emerald-400 hover:underline"
                                            >
                                              {p.po_no}
                                            </Link>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-mono font-black text-sm text-emerald-900 dark:text-emerald-300">
                                              ฿{baht(p.total_amount)} บ.
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1 border-t border-emerald-200/60 dark:border-emerald-900/40">
                                          <span className="text-steel-600 dark:text-slate-300 font-semibold truncate max-w-[180px]">
                                            {p.custom_vendor_name || p.vendors?.vendor_name || 'ไม่ระบุผู้ขาย'}
                                          </span>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-steel-400 dark:text-slate-500">
                                              {formatThaiDate(p.order_date)}
                                            </span>
                                            <Link
                                              to={`/purchasing/po/${p.id}`}
                                              className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
                                            >
                                              <span>เปิดดู</span>
                                              <ExternalLink className="h-3 w-3" />
                                            </Link>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-dashed border-steel-300 dark:border-slate-700 bg-steel-50/50 dark:bg-slate-800/40 p-4 text-center space-y-2">
                                    <div className="text-xs text-steel-500 dark:text-slate-400 font-semibold">
                                      ⏳ รายการนี้ยังไม่ได้สร้างใบสั่งซื้อ (PO)
                                    </div>
                                    {canCreate && (
                                      <Link
                                        to={`/purchasing/po/new?pr=${r.id}`}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-steel-900 dark:bg-amber-500 hover:bg-steel-800 text-hivis dark:text-slate-950 font-bold text-xs shadow-xs transition"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        <span> ออกใบสั่งซื้อจาก PR นี้</span>
                                      </Link>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : (
                  /* 2. มุมมองตารางรายงาน (Table View) */
                  <div className="overflow-x-auto rounded-xl border border-steel-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs min-w-[850px] divide-y divide-steel-200 dark:divide-slate-800">
                      <thead className="bg-steel-50 dark:bg-slate-800 text-steel-700 dark:text-slate-200 font-bold uppercase text-[11px]">
                        <tr>
                          <th className="py-3 px-3.5">ใบขอซื้อ (PR) / วันที่</th>
                          <th className="py-3 px-3.5">โครงการ / ลูกค้า</th>
                          <th className="py-3 px-3.5 text-center">สถานะ PR</th>
                          <th className="py-3 px-3.5">ใบสั่งซื้อที่ออก (PO)</th>
                          <th className="py-3 px-3.5 text-right">ยอดรวม PO</th>
                          <th className="py-3 px-3.5 text-center">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                        {filteredPipelinePrs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-steel-400 dark:text-slate-500">
                              ไม่พบข้อมูลวงจรเอกสารตามเงื่อนไขหรือช่วงวันที่ที่ค้นหา
                            </td>
                          </tr>
                        ) : (
                          paginatedPipeline.map((r) => {
                            const linkedPos = poByPrId[r.id] || []
                            const linkedTotal = linkedPos.reduce((s, p) => s + Number(p.total_amount || 0), 0)
                            return (
                              <tr key={r.id} className="hover:bg-steel-50/70 dark:hover:bg-slate-800/50 transition">
                                <td className="py-3 px-3.5 align-top">
                                  <Link to={`/purchasing/pr/${r.id}`} className="font-bold text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1">
                                    <span></span>
                                    <span>{r.pr_no}</span>
                                  </Link>
                                  <div className="text-[11px] text-steel-500 dark:text-slate-400 font-mono mt-0.5">
                                    วันที่ขอ: {formatThaiDate(r.request_date)}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 align-top">
                                  <div className="font-bold text-steel-900 dark:text-slate-100">
                                    {r.projects?.project_code || 'ของกลาง'}
                                  </div>
                                  <div className="text-[11px] text-steel-500 dark:text-slate-400 line-clamp-1">
                                    {r.projects?.project_name || 'สต็อกส่วนกลางบริษัท'}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 align-top text-center">
                                  <StatusBadge status={r.status} />
                                </td>
                                <td className="py-3 px-3.5 align-top">
                                  {linkedPos.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {linkedPos.map((p) => (
                                        <Link
                                          key={p.id}
                                          to={`/purchasing/po/${p.id}`}
                                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900 transition"
                                          title={`สั่งซื้อเมื่อ: ${formatThaiDate(p.order_date)}`}
                                        >
                                          <span>{p.po_no}</span>
                                          <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400">({formatThaiDate(p.order_date)})</span>
                                        </Link>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-steel-400 dark:text-slate-500 text-xs italic">
                                      <span>⏳ ยังไม่ออก PO</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 align-top text-right font-mono font-bold text-ink dark:text-slate-100">
                                  {linkedTotal > 0 ? `฿${baht(linkedTotal)} บ.` : '-'}
                                </td>
                                <td className="py-3 px-3.5 align-top text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <Link
                                      to={`/purchasing/pr/${r.id}`}
                                      className="px-2 py-1 rounded-lg border border-steel-300 dark:border-slate-700 hover:bg-steel-50 dark:hover:bg-slate-800 text-xs font-semibold text-steel-700 dark:text-slate-200 transition"
                                    >
                                      ดู PR
                                    </Link>
                                    {linkedPos.length > 0 && (
                                      <Link
                                        to={`/purchasing/po/${linkedPos[0].id}`}
                                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition shadow-2xs"
                                      >
                                        ดู PO
                                      </Link>
                                    )}
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

                {/* แถบเปลี่ยนหน้า (Pipeline Pagination) */}
                {filteredPipelinePrs.length > 0 && (
                  <div className="border-t border-steel-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2 mt-2">
                    <Pagination
                      currentPage={currentPage}
                      totalItems={filteredPipelinePrs.length}
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
          items={paymentTargetPo.purchase_order_items || []}
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
      {/* โมดัล 5: ดูประวัติการใช้วัสดุในโครงการและย้อนหลัง */}
      {selectedUsageItem && (
        <ItemProjectUsageModal
          item={selectedUsageItem}
          onClose={() => setSelectedUsageItem(null)}
        />
      )}

      {/* Universal Floating Dropdown (Never clipped by table, auto-flips up/down, compact) */}
      {activeDropdown && (
        <div
          style={{
            position: 'fixed',
            right: `${activeDropdown.right}px`,
            ...(activeDropdown.openUpward
              ? { bottom: `${window.innerHeight - activeDropdown.top}px` }
              : { top: `${activeDropdown.top}px` }),
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-xs"
        >
          {activeDropdown.type === 'po' && (() => {
            const po = activeDropdown.item
            const isPaid = po.payment_status === 'ชำระครบแล้ว' || (Number(po.remaining_amount) <= 0.05 && Number(po.deposit_paid_amount) > 0)

            return (
              <div className="space-y-1">
                {/* Header */}
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{po.po_no}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">฿{baht(po.total_amount)}</span>
                </div>

                {/* Section 1: Documents & Print */}
                <div className="py-0.5">
                  <Link
                    to={`/purchasing/po/${po.id}`}
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <Eye className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                    <span>ดูรายละเอียด</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdown(null)
                      setSelectedPoForPrint(po)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-left"
                  >
                    <Printer className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>พิมพ์ใบสั่งซื้อ (A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdown(null)
                      setSelectedPoForEnvelope(po)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-left"
                  >
                    <Mail className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>พิมพ์หน้าจ่าซอง</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdown(null)
                      setSelectedPoForShare(po)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-left"
                  >
                    <Share2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>แชร์ใบสั่งซื้อ (LINE)</span>
                  </button>
                </div>

                {/* Section 2: Actions */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                  {po.status !== 'cancelled' && !isPaid && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdown(null)
                        setPaymentTargetPo(po)
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 font-semibold transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                        <span>จ่ายชำระเงิน</span>
                      </div>
                      <span className="font-mono text-[10px]">฿{baht(po.net_amount || po.total_amount)}</span>
                    </button>
                  )}

                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdown(null)
                        navigate(`/purchasing/po/new?duplicate_from=${po.id}`)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-left"
                    >
                      <Copy className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>สร้างซ้ำ (Duplicate PO)</span>
                    </button>
                  )}

                  {canCreate && po.status !== 'cancelled' && (
                    <Link
                      to={`/purchasing/po/${po.id}/edit`}
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>แก้ไขใบสั่งซื้อ</span>
                    </Link>
                  )}

                  {canCreate && po.status !== 'cancelled' && po.payment_status !== 'ชำระครบแล้ว' && po.status !== 'received' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdown(null)
                        setPoToCancel(po)
                        setCancelListReason('')
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer text-left"
                    >
                      <XCircle className="h-3.5 w-3.5 text-rose-600" />
                      <span>ยกเลิกใบสั่งซื้อ</span>
                    </button>
                  )}

                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdown(null)
                        handleDeletePo(po)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition cursor-pointer text-left"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" />
                      <span>ลบใบสั่งซื้อนี้</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {activeDropdown.type === 'pr' && (() => {
            const pr = activeDropdown.item
            const linkedPos = poByPrId[pr.id] || []

            return (
              <div className="space-y-1">
                {/* Header */}
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{pr.pr_no}</span>
                  <span className="text-slate-500 font-normal text-[11px]">{pr.purchase_requisition_items?.length || 0} รายการ</span>
                </div>

                <div className="py-0.5">
                  <Link
                    to={`/purchasing/pr/${pr.id}`}
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <Eye className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                    <span>ดูรายละเอียด</span>
                  </Link>

                  {pr.status === 'pending' && canCreate && (
                    <Link
                      to={`/purchasing/po/new?pr=${pr.id}`}
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-emerald-800 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 font-semibold transition"
                    >
                      <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>ออกใบสั่งซื้อ (PO)</span>
                    </Link>
                  )}

                  <Link
                    to={`/purchasing/pr/${pr.id}?mode=paper`}
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <Printer className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>พิมพ์ใบขอซื้อ (A4)</span>
                  </Link>

                  {canCreate && linkedPos.length === 0 && (
                    <Link
                      to={`/purchasing/pr/${pr.id}/edit`}
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>แก้ไขใบขอซื้อ</span>
                    </Link>
                  )}

                  {canCreate && linkedPos.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdown(null)
                        handleDeletePr(pr)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer text-left border-t border-slate-100 dark:border-slate-800 mt-1 pt-1"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      <span>ลบใบขอซื้อนี้</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* โมดัล 6: ยืนยันยกเลิกใบสั่งซื้อ (Cancel PO Modal) */}
      {poToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-bold text-xl shrink-0">
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  ยกเลิกใบสั่งซื้อ (Cancel PO)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {poToCancel.po_no} · ราคาที่สั่งซื้อ ฿{baht(poToCancel.net_amount || poToCancel.total_amount)} บ.
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 bg-rose-50/70 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200/80 dark:border-rose-900/50">
              <p className="font-bold text-rose-900 dark:text-rose-300">
                ผลของการยกเลิกใบสั่งซื้อ:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <li>สถานะของใบสั่งซื้อจะเปลี่ยนเป็น <strong>"ยกเลิก (Cancelled)"</strong></li>
                <li>หากมีใบขอซื้อ (PR) เชื่อมอยู่ ระบบจะปลดล็อค PR ให้สามารถนำไปสั่งซื้อใหม่ได้</li>
                <li>ไม่สามารถตรวจรับของหรือจ่ายเงินในใบสั่งซื้อนี้ได้อีกต่อไป</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ระบุเหตุผลในการยกเลิก *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  'ผู้ขายแจ้งสินค้าหมด / เลิกผลิต',
                  'เปลี่ยนคู่ค้า / เปรียบเทียบราคาใหม่',
                  'เปลี่ยนสเปกวัสดุวิศวกรรม',
                  'ยกเลิกโครงการหรือปรับแผนงาน',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelListReason(preset)}
                    className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={cancelListReason}
                onChange={(e) => setCancelListReason(e.target.value)}
                placeholder="กรอกเหตุผล เช่น ร้านค้าของหมด / สเปกไม่ตรงตามวิศวกรต้องการ..."
                className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPoToCancel(null)
                  setCancelListReason('')
                }}
                disabled={cancellingList}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                ปิด / ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelPoList}
                disabled={cancellingList || !cancelListReason.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <span>{cancellingList ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกใบสั่งซื้อ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
