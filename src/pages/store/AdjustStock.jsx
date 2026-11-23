import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime, formatDateTimeParts } from '../../lib/purchasing'
import { formatIntQty, toIntQty } from '../../lib/store'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import TableSortFilter from '../../components/TableSortFilter'
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Boxes,
  ArrowLeft,
  Building2,
  FileSpreadsheet,
  Clock,
  ArrowUpDown,
  List,
  Grid,
  Calendar,
  Briefcase,
  MapPin,
  Search,
  X,
  DollarSign,
  Filter,
  Tag,
} from 'lucide-react'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const ADJUST_SORT_OPTIONS = [
  { value: 'latest', label: ' วันที่ (ล่าสุด  เก่าสุด)' },
  { value: 'oldest', label: ' วันที่ (เก่าสุด  ล่าสุด)' },
  { value: 'adj_desc', label: 'เลขที่เอกสาร (มาก  น้อย)' },
  { value: 'adj_asc', label: 'เลขที่เอกสาร (น้อย  มาก)' },
  { value: 'qty_desc', label: 'จำนวนปรับยอด (มาก  น้อย)' },
  { value: 'qty_asc', label: 'จำนวนปรับยอด (น้อย  มาก)' },
  { value: 'amount_desc', label: 'มูลค่าเงิน (มาก  น้อย)' },
  { value: 'amount_asc', label: 'มูลค่าเงิน (น้อย  มาก)' },
]

const TARGET_OPTIONS = [
  {
    id: 'project',
    label: 'โครงการ (Project)',
    desc: 'ของเหลือคืนจากโครงการ หรือ ชำรุดจากไซต์งาน',
  },
  {
    id: 'office',
    label: 'ออฟฟิศ (Office)',
    desc: 'ของเหลือคืนจากสำนักงาน หรือ ชำรุดในออฟฟิศ',
  },
  {
    id: 'site',
    label: 'หน้างาน (Site)',
    desc: 'ของเหลือคืนจากหน้างาน หรือ ชำรุดหน้างาน O&M',
  },
]

const RETURN_REASONS = [
  { id: 'ของเหลือใช้จากโครงการ (ปิดงาน)', label: 'ของเหลือจากโครงการ', icon: '' },
  { id: 'ส่งคืนเครื่องมือ / อุปกรณ์ใช้งาน', label: 'ส่งคืนเครื่องมือ/อุปกรณ์', icon: '' },
  { id: 'เบิกเกิน / หน้างานยกเลิกงาน', label: 'เบิกเกิน/ยกเลิกงาน', icon: '' },
  { id: 'เปลี่ยนสเปก / นำมาเปลี่ยนรุ่น', label: 'เปลี่ยนสเปก/เปลี่ยนรุ่น', icon: '' },
  { id: 'ตรวจนับสต็อกพบของเกิน', label: 'ตรวจนับสต็อกพบของเกิน', icon: '' },
  { id: 'คืนของชำรุดรอเคลม / รอซ่อม', label: 'ชำรุดรอเคลม/ซ่อม', icon: '' },
  { id: 'อื่น ๆ', label: 'อื่น ๆ', icon: '' },
]

const REDUCE_REASONS = [
  { id: 'สินค้าชำรุด/เสื่อมสภาพ', label: 'สินค้าชำรุด/เสื่อมสภาพ', icon: '' },
  { id: 'สินค้าสูญหาย', label: 'สินค้าสูญหาย', icon: '' },
  { id: 'ทำลายสินค้า', label: 'ทำลายสินค้า', icon: '' },
  { id: 'ตรวจนับสต็อกแล้วยอดขาด', label: 'ตรวจนับสต็อกยอดขาด', icon: '' },
  { id: 'ภัยพิบัติ / เสื่อมสภาพ', label: 'ภัยพิบัติ/เสื่อมสภาพ', icon: '' },
  { id: 'อื่น ๆ', label: 'อื่น ๆ', icon: '' },
]

function parseAdjustReason(rawReason = '') {
  if (!rawReason) return { badge: null, detail: '-' }
  const match = rawReason.match(/^\[(.*?)\]\s*(?:\|\s*(.*))?$/)
  if (match) {
    return {
      badge: match[1],
      detail: match[2] || '',
    }
  }
  return { badge: null, detail: rawReason }
}

export default function AdjustStock() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [history, setHistory] = useState([])

  // Selection
  const [itemId, setItemId] = useState('')

  // 2 แท็บหลัก: 'return_stock' (คืนของเหลือ) | 'reduce_stock' (ตัดชำรุด/ปรับลด)
  const [activeTab, setActiveTab] = useState('return_stock')

  // ปลายทาง/ต้นทาง (โครงการ / ออฟฟิศ / หน้างาน)
  const [targetType, setTargetType] = useState('project')
  const [origin, setOrigin] = useState('') // projectId
  const [targetLocation, setTargetLocation] = useState('')

  // เหตุผล
  const [selectedReason, setSelectedReason] = useState('ของเหลือใช้จากโครงการ (ปิดงาน)')

  // คืนของ
  const [returnedQty, setReturnedQty] = useState('')
  // ตัดชำรุด / ปรับยอด
  const [reducedQty, setReducedQty] = useState('')

  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState('')

  // ตัวกรองประวัติ
  const [histSearch, setHistSearch] = useState('')
  const [histKind, setHistKind] = useState('all') // 'all' | 'return' | 'damage'
  const [histSort, setHistSort] = useState('latest')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [periodPreset, setPeriodPreset] = useState('all') // 'all' | 'today' | '7days' | '30days' | 'thisMonth' | 'thisYear' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(
          'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit, avg_unit_cost), projects:source_project_id(id, project_code, project_name)'
        )
        .order('created_at', { ascending: false })
        .limit(200)

      if (!error && data) {
        setHistory(data)
      } else {
        // Fallback without project foreign join if needed
        const { data: fbData } = await supabase
          .from('stock_adjustments')
          .select(
            'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit, avg_unit_cost)'
          )
          .order('created_at', { ascending: false })
          .limit(200)
        if (fbData) setHistory(fbData)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadItems = useCallback(() => {
    supabase
      .from('inventory_items')
      .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setItems(data ?? []))
  }, [])

  useEffect(() => {
    loadItems()
    loadHistory()
    supabase
      .from('projects')
      .select('id, project_code, project_name')
      .order('project_code')
      .then(({ data }) => setProjects(data ?? []))
  }, [loadItems, loadHistory])

  // สลับแท็บ ให้เปลี่ยน default reason ให้เหมาะกับโหมด
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setErrors({})
    setError('')
    setDone('')
    if (tab === 'return_stock') {
      setSelectedReason('ของเหลือใช้จากโครงการ (ปิดงาน)')
    } else {
      setSelectedReason('สินค้าชำรุด/เสื่อมสภาพ')
    }
  }

  useEffect(() => {
    setReturnedQty('')
    setReducedQty('')
    if (!itemId) {
      setCost('')
      return
    }
    const selected = items.find((i) => i.id === itemId)
    if (selected) {
      setCost(selected.avg_unit_cost != null ? String(selected.avg_unit_cost) : '')
    }
  }, [itemId, items])

  const item = items.find((i) => i.id === itemId)
  const currentStoreQty = toIntQty(item?.qty_on_hand || 0)
  const selectedProj = projects.find((p) => p.id === origin)

  // คำนวณยอดรวมใหม่ (จำนวนเต็ม int)
  let calculatedTotal = currentStoreQty
  if (activeTab === 'return_stock') {
    calculatedTotal = currentStoreQty + toIntQty(returnedQty || 0)
  } else {
    calculatedTotal = Math.max(currentStoreQty - toIntQty(reducedQty || 0), 0)
  }

  async function save() {
    setError('')
    setDone('')
    const newErrors = {}

    if (!itemId) {
      newErrors.itemId = 'กรุณาเลือกวัสดุ'
    }

    if (targetType === 'project' && !origin) {
      newErrors.origin = 'กรุณาค้นหาและเลือกโครงการ'
    } else if (targetType === 'site' && !targetLocation.trim()) {
      newErrors.targetLocation = 'กรุณาระบุชื่อหน้างานหรือสถานที่'
    }

    if (activeTab === 'return_stock') {
      const q = toIntQty(returnedQty)
      if (!returnedQty || q <= 0) {
        newErrors.returnedQty = 'กรุณาระบุจำนวนของที่คืนมา (จำนวนเต็ม > 0)'
      }
    } else {
      const q = toIntQty(reducedQty)
      if (!reducedQty || q <= 0) {
        newErrors.reducedQty = 'กรุณาระบุจำนวนที่ต้องการตัดลด (จำนวนเต็ม > 0)'
      } else if (q > currentStoreQty) {
        newErrors.reducedQty = `จำนวนตัดลดเกินสต็อกที่มี (ในคลังมี ${formatIntQty(currentStoreQty)} ${item?.unit})`
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setBusy(true)
    const unitCostNum = cost !== '' ? Number(cost) : null

    let targetSummary = ''
    if (targetType === 'project') {
      targetSummary = `โครงการ ${selectedProj?.project_code || ''} ${selectedProj?.project_name || ''}`.trim()
    } else if (targetType === 'office') {
      targetSummary = `ออฟฟิศ${targetLocation.trim() ? ` (${targetLocation.trim()})` : ''}`
    } else {
      targetSummary = `หน้างาน (${targetLocation.trim()})`
    }

    const qtyApplied = activeTab === 'return_stock' ? toIntQty(returnedQty) : toIntQty(reducedQty)
    const actionLabel = activeTab === 'return_stock' ? 'คืนของ' : 'ตัดชำรุด/ลดยอด'

    const fullReason = `[${actionLabel}: ${selectedReason} | แหล่งที่มา: ${targetSummary}] จำนวน ${formatIntQty(qtyApplied)} ${item?.unit || ''} (เดิมมี ${formatIntQty(currentStoreQty)} รวมเป็น ${formatIntQty(calculatedTotal)}) ${notes.trim()}`.trim()

    const { data: adjId, error: rpcErr } = await supabase.rpc('adjust_stock', {
      p_item_id: itemId,
      p_source_project_id: targetType === 'project' && origin ? origin : null,
      p_new_qty: toIntQty(calculatedTotal),
      p_unit_cost: unitCostNum,
      p_reason: fullReason,
    })

    if (rpcErr) {
      setBusy(false)
      return setError(rpcErr.message)
    }

    // อัปเดต avg_unit_cost ถ้ามีการแก้ไขต้นทุน
    if (unitCostNum !== null && unitCostNum >= 0) {
      await supabase
        .from('inventory_items')
        .update({ avg_unit_cost: unitCostNum, updated_at: new Date().toISOString() })
        .eq('id', itemId)
    }

    setBusy(false)
    setDone(
      activeTab === 'return_stock'
        ? `บันทึกคืนของสำเร็จ: ยอดในสโตร์รวมเป็น ${formatIntQty(calculatedTotal)} ${item?.unit || ''} เรียบร้อยแล้ว`
        : `บันทึกตัดยอดสำเร็จ: ยอดคงเหลือในสโตร์เป็น ${formatIntQty(calculatedTotal)} ${item?.unit || ''} เรียบร้อยแล้ว`
    )
    setReturnedQty('')
    setReducedQty('')
    setNotes('')
    setErrors({})
    loadItems()
    loadHistory()
  }

  const projectMap = useMemo(() => {
    const map = new Map()
    for (const p of projects) {
      map.set(p.id, p)
    }
    return map
  }, [projects])

  // Filter & Sort History
  const filteredHistory = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nowTime = today.getTime()

    const q = histSearch.trim().toLowerCase()

    const filtered = history.filter((h) => {
      const isIncrease = Number(h.qty_after) > Number(h.qty_before)
      if (histKind === 'return' && !isIncrease) return false
      if (histKind === 'damage' && isIncrease) return false

      // กรองตามโครงการ
      if (selectedProjectId !== 'all') {
        const pId = h.source_project_id || h.projects?.id
        if (pId !== selectedProjectId) return false
      }

      // กรองตามช่วงเวลา Presets & กำหนดเอง
      if (h.created_at) {
        const recDate = new Date(h.created_at)
        const dateStr = h.created_at.slice(0, 10)

        if (periodPreset === 'today') {
          const d = new Date(h.created_at)
          d.setHours(0, 0, 0, 0)
          if (d.getTime() !== nowTime) return false
        } else if (periodPreset === '7days') {
          const d = new Date(h.created_at)
          d.setHours(0, 0, 0, 0)
          const diffDays = (nowTime - d.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDays < 0 || diffDays > 7) return false
        } else if (periodPreset === '30days') {
          const d = new Date(h.created_at)
          d.setHours(0, 0, 0, 0)
          const diffDays = (nowTime - d.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDays < 0 || diffDays > 30) return false
        } else if (periodPreset === 'thisMonth') {
          const d = new Date(h.created_at)
          if (d.getMonth() !== today.getMonth() || d.getFullYear() !== today.getFullYear()) return false
        } else if (periodPreset === 'thisYear') {
          const d = new Date(h.created_at)
          if (d.getFullYear() !== today.getFullYear()) return false
        }

        // Custom Date Range
        if (startDate && dateStr < startDate) return false
        if (endDate && dateStr > endDate) return false
      }

      if (q) {
        const proj = projectMap.get(h.source_project_id) || h.projects
        const str = `${h.adj_no || ''} ${h.inventory_items?.item_name || ''} ${
          h.inventory_items?.item_code || ''
        } ${proj?.project_code || ''} ${proj?.project_name || ''} ${h.reason || ''}`.toLowerCase()
        if (!str.includes(q)) return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      if (histSort === 'latest') {
        if (timeB !== timeA) return timeB - timeA
        return (b.adj_no || '').localeCompare(a.adj_no || '', undefined, { numeric: true })
      }
      if (histSort === 'oldest') {
        if (timeA !== timeB) return timeA - timeB
        return (a.adj_no || '').localeCompare(b.adj_no || '', undefined, { numeric: true })
      }
      if (histSort === 'adj_desc') {
        return (b.adj_no || '').localeCompare(a.adj_no || '', undefined, { numeric: true })
      }
      if (histSort === 'adj_asc') {
        return (a.adj_no || '').localeCompare(b.adj_no || '', undefined, { numeric: true })
      }
      if (histSort === 'qty_desc') {
        const diffA = Math.abs(Number(a.qty_after || 0) - Number(a.qty_before || 0))
        const diffB = Math.abs(Number(b.qty_after || 0) - Number(b.qty_before || 0))
        return diffB - diffA
      }
      if (histSort === 'qty_asc') {
        const diffA = Math.abs(Number(a.qty_after || 0) - Number(a.qty_before || 0))
        const diffB = Math.abs(Number(b.qty_after || 0) - Number(b.qty_before || 0))
        return diffA - diffB
      }
      if (histSort === 'amount_desc' || histSort === 'amount_asc') {
        const diffA = Math.abs(Number(a.qty_after || 0) - Number(a.qty_before || 0))
        const costA =
          a.unit_cost != null && Number(a.unit_cost) > 0
            ? Number(a.unit_cost)
            : Number(a.inventory_items?.avg_unit_cost || 0)
        const totalA = diffA * costA

        const diffB = Math.abs(Number(b.qty_after || 0) - Number(b.qty_before || 0))
        const costB =
          b.unit_cost != null && Number(b.unit_cost) > 0
            ? Number(b.unit_cost)
            : Number(b.inventory_items?.avg_unit_cost || 0)
        const totalB = diffB * costB

        return histSort === 'amount_desc' ? totalB - totalA : totalA - totalB
      }
      return timeB - timeA
    })
  }, [history, histKind, selectedProjectId, periodPreset, startDate, endDate, histSearch, histSort, projectMap])

  // Summary Metrics of filtered data (จำนวนรายการ + ยอดเงินมูลค่าการคืน / ตัดชำรุด)
  const metrics = useMemo(() => {
    let returnCount = 0
    let returnTotalVal = 0
    let damageCount = 0
    let damageTotalVal = 0

    filteredHistory.forEach((h) => {
      const isIncrease = Number(h.qty_after) > Number(h.qty_before)
      const diffQty = Math.abs(Number(h.qty_after || 0) - Number(h.qty_before || 0))
      const effectiveUnitCost =
        h.unit_cost != null && Number(h.unit_cost) > 0
          ? Number(h.unit_cost)
          : Number(h.inventory_items?.avg_unit_cost || 0)
      const lineTotal = diffQty * effectiveUnitCost

      if (isIncrease) {
        returnCount += 1
        returnTotalVal += lineTotal
      } else {
        damageCount += 1
        damageTotalVal += lineTotal
      }
    })

    const netVal = returnTotalVal - damageTotalVal

    return {
      totalCount: filteredHistory.length,
      returnCount,
      returnTotalVal,
      damageCount,
      damageTotalVal,
      netVal,
    }
  }, [filteredHistory])

  const hasActiveFilters = Boolean(
    histSearch.trim() ||
    selectedProjectId !== 'all' ||
    periodPreset !== 'all' ||
    startDate ||
    endDate ||
    histKind !== 'all'
  )

  const clearAllFilters = () => {
    setHistSearch('')
    setSelectedProjectId('all')
    setPeriodPreset('all')
    setStartDate('')
    setEndDate('')
    setHistKind('all')
  }

  return (
    <div className="w-full space-y-6 font-sans text-slate-900 dark:text-slate-100">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-400 text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                STORE RETURN & ADJUST
              </span>
              <span className="text-xs text-steel-300">
                ระบบคืนของเข้าสโตร์และตัดชำรุด (จำนวนเต็ม int)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              คืนของ / ตัดชำรุด (Return & Adjust)
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-300">
              รับของเหลือจากโครงการ/หน้างานกลับเข้าสโตร์ หรือบันทึกตัดชำรุด/สูญหาย
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Link
              to="/store/issue/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-4 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <span>ไปที่หน้าเบิกของ</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Main Action Card */}
      <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
        
        {/* เลือกแท็บการทำงาน: 1. คืนของเหลือ | 2. ตัดชำรุด/ปรับยอด */}
        <div className="flex rounded-xl bg-steel-100 dark:bg-slate-800 p-1 max-w-md">
          <button
            type="button"
            onClick={() => handleTabChange('return_stock')}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'return_stock'
                ? 'bg-emerald-700 text-white shadow-xs font-black'
                : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>↩️ คืนของเหลือ (บวกเข้าสโตร์)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('reduce_stock')}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'reduce_stock'
                ? 'bg-rose-700 text-white shadow-xs font-black'
                : 'text-steel-600 hover:text-steel-900'
            }`}
          >
            <TrendingDown className="h-4 w-4" />
            <span> ตัดชำรุด / ปรับลดสต็อก</span>
          </button>
        </div>

        {/* ฟอร์มกรอกข้อมูล */}
        <div className="space-y-5 text-sm">
          
          {/* ส่วนที่ 1: เลือกแหล่งที่มา (โครงการ / ออฟฟิศ / หน้างาน) */}
          <div className="space-y-3">
            <span className="text-xs sm:text-sm font-bold text-steel-900 dark:text-slate-100 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-steel-700 dark:text-slate-400" />
              <span>
                1. {activeTab === 'return_stock' ? 'เลือกต้นทางที่ส่งของคืนมา *' : 'เลือกสถานที่ที่วัสดุชำรุด/สูญหาย *'}
              </span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TARGET_OPTIONS.map((opt) => {
                const isSelected = targetType === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTargetType(opt.id)
                      if (errors.origin) setErrors((prev) => ({ ...prev, origin: '' }))
                      if (errors.targetLocation) setErrors((prev) => ({ ...prev, targetLocation: '' }))
                    }}
                    className={`rounded-xl p-3 text-left transition border cursor-pointer ${
                      isSelected
                        ? activeTab === 'return_stock'
                          ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-900 dark:bg-emerald-950 text-white shadow-sm ring-2 ring-emerald-300 dark:ring-emerald-500/30'
                          : 'border-rose-700 dark:border-rose-500 bg-rose-900 dark:bg-rose-950 text-white shadow-sm ring-2 ring-rose-300 dark:ring-rose-500/30'
                        : 'border-steel-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:bg-steel-50 dark:hover:bg-slate-800 text-steel-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-black flex items-center justify-between">
                      <span className={isSelected ? 'text-white dark:text-emerald-200' : ''}>{opt.label}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-hivis dark:text-amber-400" />}
                    </div>
                    <div
                      className={`text-[11px] mt-1 line-clamp-2 ${
                        isSelected ? 'text-steel-200 dark:text-slate-300' : 'text-steel-500 dark:text-slate-400'
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Dynamic Input Based on Target Type */}
            {targetType === 'project' ? (
              <div className="pt-2">
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ค้นหาและเลือกโครงการ *
                </label>
                <SearchableProjectSelect
                  projects={projects}
                  value={origin}
                  onChange={(id) => {
                    setOrigin(id)
                    if (errors.origin) setErrors((prev) => ({ ...prev, origin: '' }))
                  }}
                  error={errors.origin}
                  placeholder="พิมพ์ค้นหาชื่อโครงการ หรือรหัสโครงการ..."
                />
                <FieldError error={errors.origin} />
              </div>
            ) : targetType === 'office' ? (
              <div className="pt-2">
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ระบุแผนก / ส่วนงานในออฟฟิศ
                </label>
                <input
                  type="text"
                  placeholder="เช่น แผนกบัญชี, ธุรการ, สโตร์, ส่วนกลาง"
                  className="w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:border-steel-900 dark:focus:border-amber-400 focus:outline-none"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                />
              </div>
            ) : (
              <div className="pt-2">
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ระบุชื่อหน้างาน / สถานที่ *
                </label>
                <input
                  type="text"
                  placeholder="เช่น หน้างานบ้านคุณวินิจ หาดใหญ่, งานซ่อม O&M"
                  className={fieldErrorClass(
                    errors.targetLocation,
                    'w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:border-steel-900 dark:focus:border-amber-400 focus:outline-none'
                  )}
                  value={targetLocation}
                  onChange={(e) => {
                    setTargetLocation(e.target.value)
                    if (errors.targetLocation)
                      setErrors((prev) => ({ ...prev, targetLocation: '' }))
                  }}
                />
                <FieldError error={errors.targetLocation} />
              </div>
            )}
          </div>

          {/* ส่วนที่ 2: เหตุผลในการทำรายการ (7 ปุ่มตรงตามตัวอย่าง) */}
          <div className="space-y-3 pt-3 border-t border-steel-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-steel-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-steel-700 dark:text-slate-400" />
                <span>
                  2. วัตถุประสงค์ / เหตุผลในการ{activeTab === 'return_stock' ? 'คืนของ' : 'ตัดชำรุด'} *
                </span>
              </span>
              <span className="text-[11px] text-steel-500 dark:text-slate-400">
                เลือกประเภทเหตุผลที่ตรงกับความเป็นจริง
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(activeTab === 'return_stock' ? RETURN_REASONS : REDUCE_REASONS).map((r) => {
                const active = selectedReason === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReason(r.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
                      active
                        ? activeTab === 'return_stock'
                          ? 'bg-emerald-900 dark:bg-emerald-800 text-amber-300 dark:text-amber-200 border-emerald-900 dark:border-emerald-600 shadow-sm'
                          : 'bg-rose-900 dark:bg-rose-800 text-amber-300 dark:text-amber-200 border-rose-900 dark:border-rose-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-base">{r.icon}</span>
                    <span className="truncate">{r.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ส่วนที่ 3: เลือกพัสดุและระบุจำนวน */}
          <div className="space-y-3 pt-3 border-t border-steel-100 dark:border-slate-800">
            <label className="block text-xs sm:text-sm font-bold text-steel-900 dark:text-slate-100 flex items-center gap-1.5">
              <Boxes className="h-4 w-4 text-steel-700 dark:text-slate-400" />
              <span>
                3. เลือกวัสดุที่ต้องการ{activeTab === 'return_stock' ? 'คืน' : 'ตัดลด'} (จำนวนเต็ม int) *
              </span>
            </label>

            <SearchableItemSelect
              items={items}
              value={itemId}
              onChange={(id) => {
                setItemId(id)
                if (errors.itemId) setErrors((prev) => ({ ...prev, itemId: '' }))
              }}
              error={errors.itemId}
              placeholder="พิมพ์รหัสพัสดุ หรือชื่อวัสดุเพื่อค้นหา..."
            />
            <FieldError error={errors.itemId} />
          </div>

          {/* เมื่อเลือกวัสดุแล้ว */}
          {item && (
            <div className="space-y-4 pt-3 border-t border-steel-100 dark:border-slate-800">
              
              {/* แถบยอดคงเหลือเดิม (int) */}
              <div className="rounded-xl bg-steel-50 dark:bg-slate-800 border border-steel-200 dark:border-slate-700 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-steel-500 dark:text-slate-400 font-bold uppercase">วัสดุที่เลือก</span>
                  <div className="font-bold text-steel-900 dark:text-white text-sm">{item.item_name}</div>
                  <div className="text-xs text-steel-600 dark:text-slate-300 font-mono">
                    รหัส: <b>{item.item_code}</b> · ต้นทุนเฉลี่ย: <b>{baht(item.avg_unit_cost)}</b> บาท/{item.unit}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-steel-500 dark:text-slate-400 font-bold uppercase">ยอดเดิมในสโตร์</span>
                  <div className="text-xl font-mono font-black text-steel-900 dark:text-amber-400">
                    {formatIntQty(currentStoreQty)}{' '}
                    <span className="text-xs font-normal text-steel-600 dark:text-slate-400">{item.unit}</span>
                  </div>
                </div>
              </div>

              {/* ฟอร์มตามแท็บที่เลือก */}
              {activeTab === 'return_stock' ? (
                /* โหมดคืนของเหลือ (int) */
                <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-950 dark:text-emerald-200 mb-1">
                      จำนวนที่เหลือคืนมา ({item.unit}) (จำนวนเต็ม int) *
                    </label>
                    <input
                      className={fieldErrorClass(
                        errors.returnedQty,
                        'input w-full font-mono text-base font-black text-emerald-900 dark:text-emerald-200'
                      )}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="เช่น 6"
                      value={returnedQty}
                      onChange={(e) => {
                        const val = e.target.value
                        setReturnedQty(val === '' ? '' : String(Math.floor(Number(val))))
                        if (errors.returnedQty) setErrors((prev) => ({ ...prev, returnedQty: '' }))
                      }}
                    />
                    <FieldError error={errors.returnedQty} />
                  </div>

                  {/* สมการแสดงผลสด (int) */}
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-emerald-200 dark:border-emerald-800/60">
                    <div className="text-[10px] font-bold text-steel-500 dark:text-slate-400 uppercase">
                      สรุปยอดคงคลังสโตร์หลักหลังรับคืน
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm font-mono font-bold flex-wrap">
                      <span className="text-steel-600 dark:text-slate-300 bg-steel-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        เดิมมี: {formatIntQty(currentStoreQty)} {item.unit}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">+</span>
                      <span className="text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded font-black">
                        คืนมา: {returnedQty ? formatIntQty(toIntQty(returnedQty)) : 0} {item.unit}
                      </span>
                      <span className="text-steel-600 dark:text-slate-400 font-bold">=</span>
                      <span className="text-emerald-900 dark:text-emerald-200 bg-emerald-200 dark:bg-emerald-900 px-2.5 py-0.5 rounded-md font-black">
                        รวมเป็น {formatIntQty(calculatedTotal)} {item.unit} ในสโตร์
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* โหมดตัดชำรุด / ปรับลดสต็อก (int) */
                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/30 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-bold text-rose-950 dark:text-rose-200 mb-1">
                        จำนวนที่ต้องการตัดลด ({item.unit}) (จำนวนเต็ม int) *
                      </label>
                      <input
                        className={fieldErrorClass(
                          errors.reducedQty,
                          'input w-full font-mono text-base font-black text-rose-900 dark:text-rose-200'
                        )}
                        type="number"
                        min="1"
                        max={currentStoreQty}
                        step="1"
                        placeholder="เช่น 2"
                        value={reducedQty}
                        onChange={(e) => {
                          const val = e.target.value
                          setReducedQty(val === '' ? '' : String(Math.floor(Number(val))))
                          if (errors.reducedQty) setErrors((prev) => ({ ...prev, reducedQty: '' }))
                        }}
                      />
                      <FieldError error={errors.reducedQty} />
                    </div>

                    <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-rose-200 dark:border-rose-800/60">
                      <div className="text-[10px] font-bold text-steel-500 dark:text-slate-400 uppercase">
                        คงเหลือในสโตร์หลังตัดลด
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm font-mono font-bold flex-wrap">
                        <span className="text-steel-600 dark:text-slate-300 bg-steel-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                          เดิมมี: {formatIntQty(currentStoreQty)} {item.unit}
                        </span>
                        <span className="text-rose-700 dark:text-rose-400 font-bold">-</span>
                        <span className="text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded font-black">
                          ตัดออก: {reducedQty ? formatIntQty(toIntQty(reducedQty)) : 0} {item.unit}
                        </span>
                        <span className="text-steel-600 dark:text-slate-400 font-bold">=</span>
                        <span className="text-rose-900 dark:text-rose-200 bg-rose-200 dark:bg-rose-900 px-2.5 py-0.5 rounded-md font-black">
                          คงเหลือ {formatIntQty(calculatedTotal)} {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* หมายเหตุเพิ่มเติม */}
              <label className="block">
                <span className="font-semibold text-xs text-steel-800">
                  หมายเหตุ / รายละเอียดเพิ่มเติม (ถ้ามี)
                </span>
                <input
                  type="text"
                  className="input mt-1 w-full text-xs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ช่างนำของเหลือมาคืนหลังเสร็จงาน, แผงร้าวระหว่างขนย้าย..."
                />
              </label>

              {/* ปุ่มบันทึก */}
              <button
                className={`rounded-xl w-full sm:w-auto px-6 py-2.5 text-xs font-black shadow-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                  activeTab === 'return_stock'
                    ? 'bg-emerald-800 hover:bg-emerald-700 text-white'
                    : 'bg-rose-800 hover:bg-rose-700 text-white'
                }`}
                onClick={save}
                disabled={busy}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {busy
                    ? 'กำลังบันทึก...'
                    : activeTab === 'return_stock'
                    ? `บันทึกคืนของเข้าสโตร์ (รวมเป็น ${formatIntQty(calculatedTotal)} ${item.unit})`
                    : `บันทึกตัดยอด (คงเหลือ ${formatIntQty(calculatedTotal)} ${item.unit})`}
                </span>
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{done}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. สรุปมูลค่าการเคลื่อนไหว & ประวัติการคืนของและปรับยอด */}
      <div className="space-y-4">
        {/* สรุปสถิติ 4 การ์ด (จำนวนรายการ และ ยอดเงินมูลค่าการคืน/ปรับลด) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-steel-500 dark:text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">รายการทั้งหมด</span>
              <RotateCcw className="h-4 w-4 text-steel-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black font-mono text-steel-900 dark:text-white">
                {metrics.totalCount}
              </span>
              <span className="text-xs text-steel-500 dark:text-slate-400">รายการ</span>
            </div>
            <p className="mt-0.5 text-[11px] text-steel-400 truncate">ประวัติความเคลื่อนไหวทั้งหมด</p>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> รับคืนเข้าสต็อก
              </span>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.2 font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-200">
                {metrics.returnCount} รายการ
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-mono font-black text-emerald-700 dark:text-emerald-400">
              <span className="text-xl">{baht(metrics.returnTotalVal)}</span>
              <span className="text-xs font-normal">บาท</span>
            </div>
            <p className="mt-0.5 text-[11px] text-emerald-600/80 dark:text-emerald-400/70 truncate">มูลค่าของเหลือคืนเข้าคลัง</p>
          </div>

          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" /> ตัดชำรุด/ลดยอด
              </span>
              <span className="rounded-full bg-rose-100 dark:bg-rose-900 px-1.5 py-0.2 font-mono text-[10px] font-bold text-rose-800 dark:text-rose-200">
                {metrics.damageCount} รายการ
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-mono font-black text-rose-700 dark:text-rose-400">
              <span className="text-xl">{baht(metrics.damageTotalVal)}</span>
              <span className="text-xs font-normal">บาท</span>
            </div>
            <p className="mt-0.5 text-[11px] text-rose-600/80 dark:text-rose-400/70 truncate">มูลค่าตัดจำหน่าย/สูญหาย</p>
          </div>

          <div className={`rounded-xl border p-3.5 shadow-2xs ${
            metrics.netVal >= 0
              ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20'
          }`}>
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-400">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" /> มูลค่าคืนสุทธิ
              </span>
            </div>
            <div className={`mt-1 flex items-baseline gap-1 font-mono font-black ${
              metrics.netVal >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-700 dark:text-amber-400'
            }`}>
              <span className="text-xl">
                {metrics.netVal > 0 ? '+' : ''}{baht(metrics.netVal)}
              </span>
              <span className="text-xs font-normal">บาท</span>
            </div>
            <p className="mt-0.5 text-[11px] text-steel-500 dark:text-slate-400 truncate">รับคืนหักตัดชำรุด</p>
          </div>
        </div>

        {/* แผงตาราง/การ์ดประวัติ */}
        <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          {/* ส่วนหัว และตัวเลือกประเภท */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-steel-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-steel-900 dark:text-slate-100 flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4 text-steel-700 dark:text-amber-400" />
                <span>ประวัติการคืนของและปรับยอด ({filteredHistory.length} รายการ)</span>
              </h3>
              <p className="text-[11px] text-steel-500 dark:text-slate-400">
                ตรวจสอบรายการคืนของจากโครงการและการตัดลดที่ผ่านมา พร้อมคำนวณมูลค่าเงินและราคาต้นทุน
              </p>
            </div>

            {/* แถบ Pills แยกประเภท: ทั้งหมด / คืนของ / ตัดชำรุด */}
            <div className="flex rounded-xl bg-steel-100 dark:bg-slate-800 p-1 text-xs font-bold border border-steel-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setHistKind('all')}
                className={`rounded-lg px-3 py-1 transition flex items-center gap-1.5 cursor-pointer ${
                  histKind === 'all'
                    ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 font-bold shadow-xs'
                    : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
                }`}
              >
                <span>ทั้งหมด</span>
                <span className="rounded-full bg-steel-200 dark:bg-slate-700 px-1.5 text-[10px]">{history.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setHistKind('return')}
                className={`rounded-lg px-3 py-1 transition flex items-center gap-1.5 cursor-pointer ${
                  histKind === 'return'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-steel-600 dark:text-slate-400 hover:text-emerald-600'
                }`}
              >
                <span>คืนของ</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 text-[10px]">
                  {history.filter((h) => Number(h.qty_after) > Number(h.qty_before)).length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setHistKind('damage')}
                className={`rounded-lg px-3 py-1 transition flex items-center gap-1.5 cursor-pointer ${
                  histKind === 'damage'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-steel-600 dark:text-slate-400 hover:text-rose-600'
                }`}
              >
                <span>ตัดชำรุด/ลดยอด</span>
                <span className="rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-1.5 text-[10px]">
                  {history.filter((h) => Number(h.qty_after) <= Number(h.qty_before)).length}
                </span>
              </button>
            </div>
          </div>

          {/* แถบตัวกรองแถว 1: ค้นหา + เรียงลำดับ + สลับโหมดมุมมอง */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-steel-200 dark:border-slate-800">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่, วัสดุ, รหัส, โครงการ, หมายเหตุ..."
                className="w-full h-9 pl-9 pr-8 rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-steel-900 dark:text-slate-100 placeholder:text-steel-400 focus:outline-none focus:border-amber-500"
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
              />
              {histSearch && (
                <button
                  type="button"
                  onClick={() => setHistSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TableSortFilter
                value={histSort}
                onChange={setHistSort}
                options={ADJUST_SORT_OPTIONS}
              />

              {/* สลับมุมมอง ตาราง / การ์ด */}
              <div className="flex rounded-lg bg-steel-100 dark:bg-slate-800 p-0.5 border border-steel-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 shadow-2xs'
                      : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
                  }`}
                  title="มุมมองตาราง"
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">ตาราง</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 shadow-2xs'
                      : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
                  }`}
                  title="มุมมองการ์ด"
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">การ์ด</span>
                </button>
              </div>
            </div>
          </div>

          {/* แถบตัวกรองแถว 2: โครงการ + ช่วงเวลา presets + ปฏิทินกำหนดเอง */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-steel-200/80 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {/* เลือกโครงการ */}
              <div className="relative">
                <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs font-semibold text-steel-800 dark:text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="all">ทุกโครงการ (หรือของกลาง)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} - {p.project_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* ช่วงเวลา presets */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-bold text-steel-600 dark:text-slate-300 mr-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> ช่วงเวลา:
                </span>
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'today', label: 'วันนี้' },
                  { id: '7days', label: '7 วันล่าสุด' },
                  { id: '30days', label: '30 วันล่าสุด' },
                  { id: 'thisMonth', label: 'เดือนนี้' },
                  { id: 'thisYear', label: 'ปีนี้ (2569)' },
                ].map((p) => {
                  const active = periodPreset === p.id && !startDate && !endDate
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPeriodPreset(p.id)
                        setStartDate('')
                        setEndDate('')
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer border ${
                        active
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs font-bold'
                          : 'border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Date Inputs & Clear Filter */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-steel-500 dark:text-slate-400 text-xs">ตั้งแต่:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setPeriodPreset('custom')
                  }}
                  className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-steel-800 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <span className="text-steel-400 text-xs">ถึง:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setPeriodPreset('custom')
                  }}
                  className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-steel-800 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900 transition flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  <span>ล้างตัวกรอง</span>
                </button>
              )}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-steel-400 dark:text-slate-500">
              <RotateCcw className="h-8 w-8 mx-auto text-steel-300 dark:text-slate-600 mb-2 opacity-60" />
              <p className="font-semibold">ไม่พบข้อมูลประวัติการปรับสต็อกหรือคืนของตามเงื่อนไขที่เลือก</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-2 text-sky-600 hover:underline cursor-pointer font-bold"
                >
                  ล้างตัวกรองเพื่อดูข้อมูลทั้งหมด
                </button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            /* 1. มุมมองตาราง (Table View) พร้อมคอลัมน์ราคาต่อหน่วยและมูลค่ารวม */
            <div className="overflow-x-auto rounded-xl border border-steel-200 dark:border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-3.5 w-[120px] whitespace-nowrap">เลขที่</th>
                    <th className="py-3 px-3 w-[140px] whitespace-nowrap">วันที่ / เวลา</th>
                    <th className="py-3 px-3 w-[220px]">พัสดุ</th>
                    <th className="py-3 px-3 w-[80px] text-right whitespace-nowrap">ยอดก่อน</th>
                    <th className="py-3 px-3 w-[100px] text-right whitespace-nowrap">จำนวนปรับ</th>
                    <th className="py-3 px-3 w-[80px] text-right whitespace-nowrap">ยอดหลัง</th>
                    <th className="py-3 px-3 w-[100px] text-right whitespace-nowrap">ราคา/หน่วย</th>
                    <th className="py-3 px-3.5 w-[120px] text-right whitespace-nowrap">มูลค่ารวม (บาท)</th>
                    <th className="py-3 px-3 w-[190px] whitespace-nowrap">โครงการ / แหล่งที่มา</th>
                    <th className="py-3 px-3.5 min-w-[200px]">เหตุผล / รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredHistory.map((h) => {
                    const isIncrease = Number(h.qty_after) > Number(h.qty_before)
                    const diffQty = Math.abs(Number(h.qty_after || 0) - Number(h.qty_before || 0))
                    const unit = h.inventory_items?.unit || ''
                    const effectiveUnitCost =
                      h.unit_cost != null && Number(h.unit_cost) > 0
                        ? Number(h.unit_cost)
                        : Number(h.inventory_items?.avg_unit_cost || 0)
                    const lineTotal = diffQty * effectiveUnitCost

                    const parsed = parseAdjustReason(h.reason)
                    const badgeColor =
                      parsed.badge && parsed.badge.includes('คืนของ')
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                        : parsed.badge && (parsed.badge.includes('ตัดชำรุด') || parsed.badge.includes('ลดยอด') || parsed.badge.includes('สูญหาย'))
                        ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                        : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'

                    const proj = projectMap.get(h.source_project_id) || h.projects

                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3.5 font-mono font-bold text-steel-900 dark:text-amber-400 whitespace-nowrap">
                          {h.adj_no || '-'}
                        </td>
                        <td className="py-3 px-3 text-steel-500 dark:text-slate-400 whitespace-nowrap">
                          {(() => {
                            const { date, time } = formatDateTimeParts(h.created_at)
                            if (date === '-') return '-'
                            return (
                              <div className="flex flex-col text-xs leading-tight">
                                <span className="font-semibold text-steel-800 dark:text-slate-200">{date}</span>
                                <span className="flex items-center gap-1 text-[11px] text-steel-400 dark:text-slate-500 font-mono mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {time} น.
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-3 min-w-[200px]">
                          <div className="font-bold text-steel-900 dark:text-slate-100 leading-snug">
                            {h.inventory_items?.item_name || '-'}
                          </div>
                          <div className="text-[11px] text-steel-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                            <span className="rounded bg-steel-100 dark:bg-slate-800 px-1 py-0.2 border border-steel-200 dark:border-slate-700">
                              {h.inventory_items?.item_code || ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-steel-600 dark:text-slate-300 whitespace-nowrap">
                          <span className="font-semibold">{formatIntQty(h.qty_before)}</span>{' '}
                          <span className="text-[11px] text-steel-400">{unit}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-black ${
                              isIncrease
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                            }`}
                          >
                            {isIncrease ? `+${formatIntQty(diffQty)}` : `-${formatIntQty(diffQty)}`} {unit}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                          <span className="text-steel-900 dark:text-white">
                            {formatIntQty(h.qty_after)}
                          </span>{' '}
                          <span className="text-[11px] text-steel-400 font-normal">{unit}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-steel-600 dark:text-slate-300 whitespace-nowrap">
                          {effectiveUnitCost > 0 ? (
                            <span>{baht(effectiveUnitCost)} บ.</span>
                          ) : (
                            <span className="text-steel-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">
                          {lineTotal > 0 ? (
                            <span
                              className={`text-xs font-black ${
                                isIncrease
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {baht(lineTotal)} <span className="text-[10px] font-normal text-steel-400">บาท</span>
                            </span>
                          ) : (
                            <span className="text-steel-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {proj ? (
                            <span
                              className="inline-flex items-center gap-1 font-semibold text-indigo-900 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900 text-xs max-w-[200px] truncate"
                              title={`${proj.project_code} - ${proj.project_name}`}
                            >
                              <span className="font-mono">{proj.project_code}</span> <span className="truncate">{proj.project_name}</span>
                            </span>
                          ) : (h.reason && h.reason.includes('ออฟฟิศ')) ? (
                            <span className="inline-flex items-center gap-1 text-amber-900 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-900 text-xs">
                              ออฟฟิศส่วนกลาง
                            </span>
                          ) : (h.reason && h.reason.includes('หน้างาน')) ? (
                            <span className="inline-flex items-center gap-1 text-cyan-900 dark:text-cyan-300 font-semibold bg-cyan-50 dark:bg-cyan-950/50 px-2 py-1 rounded-lg border border-cyan-200 dark:border-cyan-900 text-xs">
                              ไซต์หน้างาน
                            </span>
                          ) : (
                            <span className="text-steel-400 text-xs">ของกลาง / สโตร์</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 min-w-[200px]">
                          {parsed.badge && (
                            <div className="mb-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                                {parsed.badge}
                              </span>
                            </div>
                          )}
                          <div className="text-xs text-steel-600 dark:text-slate-300 leading-relaxed" title={h.reason}>
                            {parsed.detail || (!parsed.badge ? h.reason : '') || '-'}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* 2. มุมมองการ์ด (Cards View) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredHistory.map((h) => {
                const isIncrease = Number(h.qty_after) > Number(h.qty_before)
                const diffQty = Math.abs(Number(h.qty_after || 0) - Number(h.qty_before || 0))
                const unit = h.inventory_items?.unit || ''
                const effectiveUnitCost =
                  h.unit_cost != null && Number(h.unit_cost) > 0
                    ? Number(h.unit_cost)
                    : Number(h.inventory_items?.avg_unit_cost || 0)
                const lineTotal = diffQty * effectiveUnitCost

                const parsed = parseAdjustReason(h.reason)
                const proj = projectMap.get(h.source_project_id) || h.projects
                const { date, time } = formatDateTimeParts(h.created_at)

                return (
                  <div
                    key={h.id}
                    className="rounded-xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs hover:shadow-md transition space-y-3"
                  >
                    {/* ส่วนบนของการ์ด */}
                    <div className="flex items-start justify-between gap-2 border-b border-steel-100 dark:border-slate-800 pb-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isIncrease
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                          }`}
                        >
                          {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          <span>{isIncrease ? 'รับคืนสต็อก' : 'ตัดชำรุด/ลดยอด'}</span>
                        </span>
                        <span className="font-mono text-xs font-bold text-steel-900 dark:text-amber-400">
                          {h.adj_no || '-'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-steel-400 dark:text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {date} {time !== '-' ? `${time} น.` : ''}
                      </span>
                    </div>

                    {/* รายละเอียดพัสดุ */}
                    <div>
                      <div className="font-bold text-sm text-steel-900 dark:text-white leading-snug">
                        {h.inventory_items?.item_name || '-'}
                      </div>
                      <div className="text-[11px] font-mono text-steel-500 dark:text-slate-400 mt-0.5">
                        {h.inventory_items?.item_code || ''}
                      </div>
                    </div>

                    {/* กล่องตัวเลขความเคลื่อนไหว & มูลค่าเงิน */}
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-steel-50 dark:bg-slate-800/60 p-2.5 border border-steel-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-steel-400 uppercase tracking-wide block">จำนวนที่เปลี่ยน:</span>
                        <div className="font-mono text-sm font-bold text-steel-800 dark:text-slate-200 mt-0.5">
                          {isIncrease ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">+{formatIntQty(diffQty)}</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-black">-{formatIntQty(diffQty)}</span>
                          )}{' '}
                          <span className="text-xs font-normal text-steel-500">{unit}</span>
                        </div>
                        <div className="text-[10px] text-steel-400 font-mono mt-0.5">
                          (เดิม {formatIntQty(h.qty_before)}  {formatIntQty(h.qty_after)})
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-steel-400 uppercase tracking-wide block">
                          {isIncrease ? 'มูลค่ารับคืน:' : 'มูลค่าตัดลด:'}
                        </span>
                        <div
                          className={`font-mono text-sm font-black mt-0.5 ${
                            isIncrease
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {lineTotal > 0 ? baht(lineTotal) : '-'} <span className="text-[10px] font-normal">บาท</span>
                        </div>
                        {effectiveUnitCost > 0 && (
                          <div className="text-[10px] text-steel-400 font-mono mt-0.5">
                            @{baht(effectiveUnitCost)} บ./{unit}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* โครงการ & เหตุผล */}
                    <div className="space-y-1.5 text-xs pt-1 border-t border-steel-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px] text-steel-600 dark:text-slate-300">
                        <Briefcase className="h-3.5 w-3.5 text-steel-400 shrink-0" />
                        {proj ? (
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400 truncate">
                            {proj.project_code} · {proj.project_name}
                          </span>
                        ) : (h.reason && h.reason.includes('ออฟฟิศ')) ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">ออฟฟิศส่วนกลาง</span>
                        ) : (h.reason && h.reason.includes('หน้างาน')) ? (
                          <span className="font-semibold text-cyan-700 dark:text-cyan-400">ไซต์หน้างาน</span>
                        ) : (
                          <span className="text-steel-400">ของกลาง/สโตร์</span>
                        )}
                      </div>

                      {parsed.badge && (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 border border-steel-200 dark:border-slate-700">
                            {parsed.badge}
                          </span>
                        </div>
                      )}
                      {parsed.detail && (
                        <p className="text-[11px] text-steel-500 dark:text-slate-400 line-clamp-2">
                          {parsed.detail}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
