import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime } from '../../lib/purchasing'
import { formatIntQty, toIntQty } from '../../lib/store'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import SearchableItemSelect from '../../components/SearchableItemSelect'
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
} from 'lucide-react'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const TARGET_OPTIONS = [
  {
    id: 'project',
    label: '🏗️ โครงการ (Project)',
    desc: 'ของเหลือคืนจากโครงการ หรือ ชำรุดจากไซต์งาน',
  },
  {
    id: 'office',
    label: '🏢 ออฟฟิศ (Office)',
    desc: 'ของเหลือคืนจากสำนักงาน หรือ ชำรุดในออฟฟิศ',
  },
  {
    id: 'site',
    label: '⚡ หน้างาน (Site)',
    desc: 'ของเหลือคืนจากหน้างาน หรือ ชำรุดหน้างาน O&M',
  },
]

const RETURN_REASONS = [
  { id: 'ของเหลือใช้จากโครงการ (ปิดงาน)', label: 'ของเหลือจากโครงการ', icon: '🔄' },
  { id: 'ส่งคืนเครื่องมือ / อุปกรณ์ใช้งาน', label: 'ส่งคืนเครื่องมือ/อุปกรณ์', icon: '🧰' },
  { id: 'เบิกเกิน / หน้างานยกเลิกงาน', label: 'เบิกเกิน/ยกเลิกงาน', icon: '🔁' },
  { id: 'เปลี่ยนสเปก / นำมาเปลี่ยนรุ่น', label: 'เปลี่ยนสเปก/เปลี่ยนรุ่น', icon: '⚙️' },
  { id: 'ตรวจนับสต็อกพบของเกิน', label: 'ตรวจนับสต็อกพบของเกิน', icon: '📋' },
  { id: 'คืนของชำรุดรอเคลม / รอซ่อม', label: 'ชำรุดรอเคลม/ซ่อม', icon: '⚠️' },
  { id: 'อื่น ๆ', label: 'อื่น ๆ', icon: '📝' },
]

const REDUCE_REASONS = [
  { id: 'สินค้าชำรุด/เสื่อมสภาพ', label: 'สินค้าชำรุด/เสื่อมสภาพ', icon: '⚠️' },
  { id: 'สินค้าสูญหาย', label: 'สินค้าสูญหาย', icon: '❓' },
  { id: 'ทำลายสินค้า', label: 'ทำลายสินค้า', icon: '💥' },
  { id: 'ตรวจนับสต็อกแล้วยอดขาด', label: 'ตรวจนับสต็อกยอดขาด', icon: '📉' },
  { id: 'ภัยพิบัติ / เสื่อมสภาพ', label: 'ภัยพิบัติ/เสื่อมสภาพ', icon: '🌊' },
  { id: 'อื่น ๆ', label: 'อื่น ๆ', icon: '📝' },
]

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
  const [histYear, setHistYear] = useState('all')
  const [histMonth, setHistMonth] = useState('all')
  const [histSearch, setHistSearch] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(
          'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit), projects:source_project_id(project_code, project_name)'
        )
        .order('created_at', { ascending: false })
        .limit(100)

      if (!error && data) {
        setHistory(data)
      } else {
        // Fallback without project foreign join if needed
        const { data: fbData } = await supabase
          .from('stock_adjustments')
          .select(
            'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit)'
          )
          .order('created_at', { ascending: false })
          .limit(100)
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

  // Filter History
  const filteredHistory = history.filter((h) => {
    if (!h.created_at) return true
    const d = new Date(h.created_at)

    if (histYear !== 'all') {
      if (d.getFullYear().toString() !== histYear) return false
    }

    if (histMonth !== 'all') {
      if (d.getMonth().toString() !== histMonth) return false
    }

    if (histSearch.trim()) {
      const q = histSearch.toLowerCase()
      const str = `${h.adj_no || ''} ${h.inventory_items?.item_name || ''} ${
        h.inventory_items?.item_code || ''
      } ${h.projects?.project_code || ''} ${h.reason || ''}`.toLowerCase()
      if (!str.includes(q)) return false
    }

    return true
  })

  return (
    <div className="max-w-4xl space-y-6 font-sans text-slate-900 dark:text-slate-100">
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
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-xl bg-steel-800 hover:bg-steel-700 text-steel-200 border border-steel-600 px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>ย้อนกลับ</span>
            </button>

            <Link
              to="/store/issue/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-3.5 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <span>📦 เบิกของ</span>
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
            <span>🔻 ตัดชำรุด / ปรับลดสต็อก</span>
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

      {/* 3. ประวัติการคืนของและปรับยอด */}
      <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-steel-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-steel-900 dark:text-slate-100 flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-steel-700 dark:text-amber-400" />
              <span>ประวัติการคืนของและปรับยอด ({filteredHistory.length} รายการ)</span>
            </h3>
            <p className="text-[11px] text-steel-500 dark:text-slate-400">
              ตรวจสอบรายการคืนของจากโครงการและการตัดลดที่ผ่านมา (แสดงผลจำนวนเต็ม int)
            </p>
          </div>

          {/* ฟิลเตอร์ ปี / เดือน */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold text-steel-800 dark:text-slate-200"
              value={histYear}
              onChange={(e) => setHistYear(e.target.value)}
            >
              <option value="all">ทุกปี</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>

            <select
              className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold text-steel-800 dark:text-slate-200"
              value={histMonth}
              onChange={(e) => setHistMonth(e.target.value)}
            >
              <option value="all">ทุกเดือน</option>
              {THAI_MONTHS.map((m, idx) => (
                <option key={idx} value={idx.toString()}>
                  {m}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="ค้นหาเลขที่, รหัส, ชื่อ..."
              className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500"
              value={histSearch}
              onChange={(e) => setHistSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-steel-400">
            ยังไม่มีประวัติการปรับสต็อกหรือคืนของ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-steel-50 dark:bg-slate-800 text-steel-600 dark:text-slate-300 font-semibold border-b border-steel-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3">เลขที่</th>
                  <th className="py-2 px-3">วันที่ / เวลา</th>
                  <th className="py-2 px-3">พัสดุ</th>
                  <th className="py-2 px-3 text-right">ยอดก่อน</th>
                  <th className="py-2 px-3 text-right">ยอดหลัง</th>
                  <th className="py-2 px-3">โครงการ / สถานที่</th>
                  <th className="py-2 px-3">เหตุผล / รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
                {filteredHistory.map((h) => {
                  const isIncrease = Number(h.qty_after) > Number(h.qty_before)
                  const unit = h.inventory_items?.unit || ''
                  return (
                    <tr key={h.id} className="hover:bg-steel-50/50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-mono font-bold text-steel-900 dark:text-amber-400">
                        {h.adj_no || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-steel-500 dark:text-slate-400 whitespace-nowrap">
                        {fmtDateTime(h.created_at)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-steel-900 dark:text-slate-100">
                          {h.inventory_items?.item_name || '-'}
                        </div>
                        <div className="text-[10px] text-steel-500 dark:text-slate-400 font-mono">
                          {h.inventory_items?.item_code || ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-steel-600 dark:text-slate-300">
                        {formatIntQty(h.qty_before)} {unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        <span
                          className={
                            isIncrease ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                          }
                        >
                          {formatIntQty(h.qty_after)} {unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-steel-700 dark:text-slate-300">
                        {h.projects ? (
                          <span className="font-semibold text-indigo-900 dark:text-indigo-300">
                            🏗️ {h.projects.project_code} {h.projects.project_name}
                          </span>
                        ) : (h.reason && h.reason.includes('ออฟฟิศ')) ? (
                          <span className="text-amber-800 dark:text-amber-300 font-semibold">
                            🏢 ออฟฟิศ
                          </span>
                        ) : (h.reason && h.reason.includes('หน้างาน')) ? (
                          <span className="text-cyan-800 dark:text-cyan-300 font-semibold">
                            ⚡ หน้างาน
                          </span>
                        ) : (
                          <span className="text-steel-400">ของกลาง/สโตร์</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-steel-600 max-w-xs truncate" title={h.reason}>
                        {h.reason || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
