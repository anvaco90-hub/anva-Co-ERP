import { Fragment, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { formatIntQty } from '../../lib/store'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import InventoryReportModal from '../../components/reports/InventoryReportModal'
import Pagination from '../../components/Pagination'
import R2Image from '../../components/R2Image'
import TableSortFilter from '../../components/TableSortFilter'
import {
  Package,
  Search,
  Filter,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShoppingCart,
  ArrowUpFromLine,
  RotateCcw,
  Printer,
  Grid,
  List,
  Layers,
  ChevronRight,
  Boxes,
  Eye,
  X,
  Sun,
  ShieldCheck,
  Building2,
  ExternalLink,
} from 'lucide-react'

export default function StockList() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // State Data
  const [items, setItems] = useState(null)
  const [lots, setLots] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)

  // View & Filter States
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
  const [cat, setCat] = useState('') // category_id filter
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [onlyLow, setOnlyLow] = useState(false)
  const [onlyOut, setOnlyOut] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20) // 10 | 20 | 50 | 100
  const [open, setOpen] = useState(null)
  const [previewImg, setPreviewImg] = useState(null)
  const [selectedUsageItem, setSelectedUsageItem] = useState(null)
  const [selectedDetailItem, setSelectedDetailItem] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('inventory_items')
        .select(
          'id, item_code, item_name, unit, qty_on_hand, avg_unit_cost, reorder_point, category_id, image_url, updated_at, created_at, item_categories(id, name, code_prefix)'
        )
        .order('item_code')
        .order('item_name'),
      supabase
        .from('stock_lots')
        .select(
          'item_id, source_project_id, qty_remaining, projects(project_code, project_name)'
        )
        .gt('qty_remaining', 0),
      supabase
        .from('item_categories')
        .select('id, name, code_prefix')
        .order('sort_order'),
    ])
      .then(([a, b, c]) => {
        if (a.error) {
          console.error('Error fetching inventory items:', a.error)
          setError(a.error.message)
          setItems([])
        } else {
          setItems(a.data || [])
        }
        setLots(b.data ?? [])
        setCats(c.data ?? [])
      })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [])

  const isLow = (i) =>
    Number(i?.reorder_point) > 0 &&
    Number(i?.qty_on_hand) <= Number(i?.reorder_point) &&
    Number(i?.qty_on_hand) > 0
  const isOut = (i) => Number(i?.qty_on_hand) <= 0

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองหรือคำค้นหาเปลี่ยน (ต้องอยู่ก่อน Early Return ตามกฎของ React Hooks)
  useEffect(() => {
    setCurrentPage(1)
  }, [cat, search, onlyLow, onlyOut])

  // ตัวเลือกการเรียงลำดับมาตรฐานสำหรับคลังวัสดุ
  const STOCK_SORT_OPTIONS = [
    { value: 'name_asc', label: 'ชื่อพัสดุ ก  ฮ (A  Z)' },
    { value: 'name_desc', label: 'ชื่อพัสดุ ฮ  ก (Z  A)' },
    { value: 'code_asc', label: 'รหัสพัสดุ (น้อย  มาก: 0  9)' },
    { value: 'code_desc', label: 'รหัสพัสดุ (มาก  น้อย: 9  0)' },
    { value: 'qty_desc', label: 'จำนวนคงเหลือ (มาก  น้อย)' },
    { value: 'qty_asc', label: 'จำนวนคงเหลือ (น้อย  มาก)' },
    { value: 'cost_desc', label: 'ต้นทุนเฉลี่ย (มาก  น้อย)' },
  ]

  // คำนวณรายการที่ผ่านการกรองและการจัดเรียง (ต้องอยู่ก่อน Early Return)
  const shown = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    const filtered = items.filter((i) => {
      if (cat && i.category_id !== cat) return false
      if (onlyLow && !isLow(i)) return false
      if (onlyOut && !isOut(i)) return false
      if (!q) return true
      return `${i.item_name} ${i.item_code} ${i.unit || ''}`
        .toLowerCase()
        .includes(q)
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'name_asc') return (a.item_name || '').localeCompare(b.item_name || '', 'th')
      if (sortBy === 'name_desc') return (b.item_name || '').localeCompare(a.item_name || '', 'th')
      if (sortBy === 'code_asc') return (a.item_code || '').localeCompare(b.item_code || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.item_code || '').localeCompare(a.item_code || '', undefined, { numeric: true })
      if (sortBy === 'qty_desc') return Number(b.qty_on_hand || 0) - Number(a.qty_on_hand || 0)
      if (sortBy === 'qty_asc') return Number(a.qty_on_hand || 0) - Number(b.qty_on_hand || 0)
      if (sortBy === 'cost_desc') return Number(b.avg_unit_cost || 0) - Number(a.avg_unit_cost || 0)
      return 0
    })
  }, [items, cat, onlyLow, onlyOut, search, sortBy])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน (ต้องอยู่ก่อน Early Return)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return shown.slice(start, start + pageSize)
  }, [shown, currentPage, pageSize])

  if (loading || !items) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-3 font-sans">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-steel-900 border-t-hivis" />
        <p className="text-sm font-semibold text-steel-500">
          กำลังโหลดคลังพัสดุวิศวกรรม ANVA & CO...
        </p>
      </div>
    )
  }

  const totalValue = shown.reduce(
    (s, i) => s + Number(i.qty_on_hand || 0) * Number(i.avg_unit_cost || 0),
    0
  )
  const lowCount = items.filter(isLow).length
  const outCount = items.filter(isOut).length
  const readyCount = items.filter((i) => !isLow(i) && !isOut(i)).length

  // รวมล็อตตามโครงการต้นทางของวัสดุ
  const origins = (itemId) => {
    const m = new Map()
    lots
      .filter((l) => l.item_id === itemId)
      .forEach((l) => {
        const k = l.source_project_id ?? 'none'
        const cur = m.get(k) ?? {
          name: l.projects
            ? `${l.projects.project_code} ${l.projects.project_name}`
            : 'สต็อกกลางบริษัท (Central Store)',
          qty: 0,
        }
        cur.qty += Number(l.qty_remaining)
        m.set(k, cur)
      })
    return [...m.values()]
  }

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-800">
      {/* ---------------------------------------------------------------------- */}
      {/* 1. Header Banner: ANVA & Co Solar Engineering Brand Theme             */}
      {/* ---------------------------------------------------------------------- */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 sm:p-7 text-white shadow-md border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-slate-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                ENGINEERING INVENTORY
              </span>
              <span className="text-xs text-slate-200 font-semibold tracking-wide">
                บริษัท อันวาแอนด์โค จำกัด (ANVA & CO., LTD.)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white drop-shadow-xs">
              คลังพัสดุและอุปกรณ์วิศวกรรม (Stock Inventory)
            </h1>
            <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-2xl">
              ตรวจสอบยอดคงเหลือ จุดเตือนสั่งซื้อ และจัดการเบิกจ่ายเข้าโครงการอย่างเป็นระบบ ถูกต้องตามมาตรฐานงานติดตั้ง
            </p>
          </div>

          {/* Core Metrics Boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="rounded-xl bg-slate-800/90 p-3 border border-slate-700 text-center">
              <div className="text-[11px] font-bold text-slate-200">พัสดุทั้งหมด</div>
              <div className="mt-0.5 text-xl font-black font-mono text-white">{items.length}</div>
              <div className="text-[10px] text-slate-300 font-medium">รายการ</div>
            </div>

            <div className="rounded-xl bg-slate-800/90 p-3 border border-slate-700 text-center">
              <div className="text-[11px] font-bold text-slate-200">พร้อมเบิกใช้งาน</div>
              <div className="mt-0.5 text-xl font-black font-mono text-emerald-300">
                {readyCount}
              </div>
              <div className="text-[10px] text-slate-300 font-medium">รายการ</div>
            </div>

            <div
              onClick={() => {
                setOnlyLow(!onlyLow)
                setOnlyOut(false)
              }}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${
                onlyLow
                  ? 'bg-hivis text-slate-950 font-bold border-hivis shadow-md scale-105'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <div className={`text-[11px] font-bold ${onlyLow ? 'text-slate-900' : 'text-slate-200'}`}>ใกล้หมด</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${onlyLow ? 'text-slate-950' : 'text-amber-300'}`}>
                {lowCount}
              </div>
              <div className={`text-[10px] ${onlyLow ? 'text-slate-800 font-bold' : 'text-slate-300 font-medium'}`}>เตือนสั่งซื้อ</div>
            </div>

            <div
              onClick={() => {
                setOnlyOut(!onlyOut)
                setOnlyLow(false)
              }}
              className={`rounded-xl p-3 border cursor-pointer transition text-center ${
                onlyOut
                  ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-md scale-105'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <div className={`text-[11px] font-bold ${onlyOut ? 'text-white' : 'text-slate-200'}`}>หมดสต็อก</div>
              <div className={`mt-0.5 text-xl font-black font-mono ${onlyOut ? 'text-white' : 'text-rose-400'}`}>
                {outCount}
              </div>
              <div className={`text-[10px] ${onlyOut ? 'text-rose-100 font-bold' : 'text-slate-300 font-medium'}`}>ต้องออก PR</div>
            </div>
          </div>
        </div>

        {/* Total Valuation Bar */}
        <div className="mt-6 pt-4 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-semibold text-xs">มูลค่าสินค้าคงคลังรวม (ที่แสดง):</span>
            <span className="font-mono text-lg font-black text-emerald-300 tracking-wide">
              {baht(totalValue)} บาท
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowReport(true)}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-bold px-3.5 py-1.5 transition flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="h-4 w-4 text-hivis" />
              <span>พิมพ์รายงานสต็อก (PDF)</span>
            </button>
            <Link
              to="/store/items"
              className="rounded-xl bg-hivis text-slate-950 hover:bg-emerald-400 font-black px-3.5 py-1.5 transition flex items-center gap-1.5 shadow-xs"
            >
              <span>+ เพิ่มพัสดุใหม่</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 2. Category Filter Pills (เลือกตามหมวดหมู่ - ไม่เลื่อน ไม่ล้น)          */}
      {/* ---------------------------------------------------------------------- */}
      <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-steel-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5 text-steel-900 dark:text-slate-100">
            <Layers className="h-4 w-4 text-steel-700 dark:text-amber-400" />
            <span>เลือกดูตามหมวดหมู่วัสดุและอุปกรณ์</span>
          </span>

          <div className="flex items-center gap-2">
            <span className="text-steel-400 dark:text-slate-300 font-normal hidden sm:inline">
              แสดง {shown.length} จาก {items.length} รายการ
            </span>
            {/* Dropdown เลือกหมวดหมู่ (สำหรับกรณีหมวดหมู่เยอะหรือเลือกผ่าน Dropdown) */}
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-8 rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold text-steel-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              <option value=""> หมวดหมู่ทั้งหมด ({items.length} รายการ)</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({items.filter((it) => it.category_id === c.id).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCat('')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
              cat === ''
                ? 'bg-steel-900 dark:bg-amber-500 text-hivis dark:text-slate-950 font-black shadow-xs'
                : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>ทั้งหมด</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                cat === '' ? 'bg-steel-800 dark:bg-amber-600 text-hivis dark:text-slate-950' : 'bg-steel-200 dark:bg-slate-700 text-steel-800 dark:text-slate-200'
              }`}
            >
              {items.length}
            </span>
          </button>

          {cats.map((c) => {
            const count = items.filter((it) => it.category_id === c.id).length
            const isSelected = cat === c.id

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-steel-900 dark:bg-amber-500 text-hivis dark:text-slate-950 font-black shadow-xs'
                    : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{c.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected ? 'bg-steel-800 dark:bg-amber-600 text-hivis dark:text-slate-950' : 'bg-steel-200 dark:bg-slate-700 text-steel-800 dark:text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 3. Search Bar, Standard Sort Filter & View Toggle (Table vs Grid)     */}
      {/* ---------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อวัสดุ, หน่วยนับ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-4 py-2 text-xs sm:text-sm text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:border-steel-900 dark:focus:border-amber-500 focus:outline-none shadow-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600 dark:hover:text-slate-200"
              >
                
              </button>
            )}
          </div>

          {/* Standard Sort Filter Control */}
          <TableSortFilter
            value={sortBy}
            onChange={setSortBy}
            options={STOCK_SORT_OPTIONS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Quick Filter Buttons */}
          <button
            type="button"
            onClick={() => {
              setOnlyLow(!onlyLow)
              setOnlyOut(false)
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border ${
              onlyLow
                ? 'bg-amber-500 text-slate-950 font-black border-amber-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-steel-700 dark:text-slate-200 border-steel-300 dark:border-slate-700 hover:bg-steel-50 dark:hover:bg-slate-800'
            }`}
          >
            <span></span>
            <span>ใกล้หมด ({lowCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOnlyOut(!onlyOut)
              setOnlyLow(false)
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border ${
              onlyOut
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-steel-700 dark:text-slate-200 border-steel-300 dark:border-slate-700 hover:bg-steel-50 dark:hover:bg-slate-800'
            }`}
          >
            <span></span>
            <span>หมดสต็อก ({outCount})</span>
          </button>

          {(cat || search || onlyLow || onlyOut) && (
            <button
              type="button"
              onClick={() => {
                setCat('')
                setSearch('')
                setOnlyLow(false)
                setOnlyOut(false)
              }}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2"
            >
              ล้างตัวกรอง
            </button>
          )}

          {/* View Mode Toggle: Grid vs Table */}
          <div className="flex rounded-xl bg-steel-200 dark:bg-slate-800 p-1 text-xs font-bold ml-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-lg px-2.5 py-1 transition flex items-center gap-1 ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-steel-950 dark:text-white shadow-xs font-black'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
              title="มุมมองการ์ดวัสดุ"
            >
              <Grid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">การ์ดวัสดุ</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded-lg px-2.5 py-1 transition flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-steel-950 dark:text-white shadow-xs font-black'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
              title="มุมมองตารางพัสดุ"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ตารางพัสดุ</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 4. Presentation: Grid vs Table (ข้อความเรียบร้อย ไม่ทับซ้อนกัน)       */}
      {/* ---------------------------------------------------------------------- */}
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-steel-200 bg-white p-12 text-center space-y-4 shadow-xs">
          <Package className="mx-auto h-14 w-14 text-steel-300" />
          <h3 className="text-lg font-bold text-steel-800">คลังพัสดุว่างเปล่า (ไม่มีรายการพัสดุจำลองแล้ว)</h3>
          <p className="text-xs sm:text-sm text-steel-500 max-w-md mx-auto leading-relaxed">
            ข้อมูลจำลองทั้งหมดถูกเคลียร์ออกจากระบบเรียบร้อยแล้ว สโตร์สะอาด 100% พร้อมสำหรับการป้อนข้อมูลรายการวัสดุจริงของฝ่ายสโตร์
          </p>
          <div className="pt-2">
            <Link
              to="/store/items"
              className="inline-flex items-center gap-2 rounded-xl bg-steel-900 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-steel-800 transition shadow-sm"
            >
              <Package className="h-4 w-4" />
              <span>+ ไปที่หน้าจัดการวัสดุเพื่อเริ่มป้อนข้อมูลจริง</span>
            </Link>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-300 bg-white p-12 text-center space-y-3">
          <Boxes className="mx-auto h-12 w-12 text-steel-300" />
          <h3 className="text-base font-bold text-steel-800">ไม่พบรายการพัสดุตรงตามเงื่อนไข</h3>
          <p className="text-xs text-steel-500">
            ลองปรับเปลี่ยนคำค้นหา หรือกด "ล้างตัวกรอง" เพื่อแสดงพัสดุทั้งหมด
          </p>
          <button
            type="button"
            onClick={() => {
              setCat('')
              setSearch('')
              setOnlyLow(false)
              setOnlyOut(false)
            }}
            className="rounded-xl bg-steel-900 text-white px-4 py-2 text-xs font-bold hover:bg-steel-800 transition shadow-xs"
          >
            แสดงพัสดุทั้งหมด
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
          {paginatedItems.map((it) => {
            const itemLow = isLow(it)
            const itemOut = isOut(it)
            const qty = Number(it.qty_on_hand || 0)
            const cost = Number(it.avg_unit_cost || 0)
            const valTotal = qty * cost

            return (
              <div
                key={it.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:border-steel-400 dark:hover:border-slate-700 hover:shadow-md"
              >
                {/* 1. Thumbnail Image & Floating Stock Status Pill (ไม่ทับซ้อนกัน) */}
                <div
                  className="relative aspect-video sm:aspect-square w-full overflow-hidden bg-steel-100 dark:bg-slate-800 cursor-pointer"
                  onClick={() => setSelectedDetailItem(it)}
                >
                  {it.image_url ? (
                    <R2Image
                      fileKey={it.image_url}
                      alt={it.item_name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-steel-400 dark:text-slate-500 bg-steel-50 dark:bg-slate-800/60">
                      <Boxes className="h-10 w-10 text-steel-300 dark:text-slate-600" />
                      <span className="text-[10px] font-semibold text-steel-400 dark:text-slate-400">ANVA & CO.</span>
                    </div>
                  )}

                  {/* Top-Right Stock Status Pill อย่างเดียวที่ด้านบน เพื่อไม่ให้ชนกับชื่อหมวด */}
                  <div className="absolute right-2.5 top-2.5">
                    {itemOut ? (
                      <span className="rounded-md bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                        หมดสต็อก
                      </span>
                    ) : itemLow ? (
                      <span className="rounded-md bg-amber-500 px-2.5 py-0.5 text-[10px] font-black text-slate-950 shadow-xs">
                        ใกล้หมด
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                        พร้อมเบิก
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Product Information Details (จัดบรรทัดให้อ่านง่าย ไม่ทับซ้อน) */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                  <div className="space-y-1">
                    {/* รหัสวัสดุ & หมวดหมู่วัสดุ อยู่ในบรรทัดเดียวกันอย่างชัดเจน */}
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className="font-mono font-bold text-steel-600 dark:text-amber-400 truncate">
                        {it.item_code}
                      </span>
                      <span className="rounded-md bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 px-2 py-0.5 text-[10px] font-semibold truncate max-w-[130px] border border-steel-200 dark:border-slate-700">
                        {it.item_categories?.name || 'วัสดุทั่วไป'}
                      </span>
                    </div>

                    {/* ชื่อวัสดุ */}
                    <h3
                      className="text-sm font-bold text-steel-900 dark:text-slate-100 line-clamp-2 leading-snug cursor-pointer group-hover:text-sky-700 dark:group-hover:text-amber-400 transition"
                      onClick={() => setSelectedDetailItem(it)}
                      title={it.item_name}
                    >
                      {it.item_name}
                    </h3>
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-steel-100 dark:border-slate-800">
                    {/* ราคาต่อหน่วย */}
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-semibold text-steel-500 dark:text-slate-400">฿</span>
                        <span className="text-base font-black font-mono text-steel-900 dark:text-white tracking-tight">
                          {cost > 0 ? baht(cost) : '-'}
                        </span>
                        <span className="text-xs text-steel-400 dark:text-slate-400 font-normal">
                          / {it.unit || 'ชิ้น'}
                        </span>
                      </div>

                      {/* ยอดคงเหลือ (อยู่บรรทัดเดียวกัน) */}
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="text-steel-400 dark:text-slate-400 text-[11px]">คงเหลือ:</span>
                        <span
                          className={`font-bold ${
                            itemOut
                              ? 'text-rose-600 dark:text-rose-400 font-black'
                              : itemLow
                              ? 'text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-steel-900 dark:text-slate-100'
                          }`}
                        >
                          {formatIntQty(qty)} {it.unit}
                        </span>
                      </div>
                    </div>

                    {/* มูลค่ารวมในคลัง (อยู่บรรทัดเดียว สบายตา) */}
                    <div className="text-[11px] text-steel-500 dark:text-slate-400 flex items-center justify-between pt-0.5">
                      <span>มูลค่ารวม:</span>
                      <span className="font-mono font-bold text-steel-800 dark:text-slate-200">{baht(valTotal)} บ.</span>
                    </div>
                  </div>
                </div>

                {/* 3. Action Footer */}
                <div className="p-2.5 pt-2 grid grid-cols-2 gap-2 border-t border-steel-100 dark:border-slate-800 bg-steel-50/50 dark:bg-slate-950/60">
                  <Link
                    to={`/store/issue/new?item_id=${it.id}`}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold transition text-center shadow-xs ${
                      itemOut
                        ? 'bg-steel-200 dark:bg-slate-800 text-steel-400 dark:text-slate-600 cursor-not-allowed pointer-events-none'
                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 dark:font-black'
                    }`}
                    title="เบิกวัสดุเข้าโครงการ"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    <span>เบิก</span>
                  </Link>

                  <Link
                    to={`/purchasing/pr/new?item_id=${it.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 border border-steel-300 dark:border-slate-700 py-1.5 text-xs font-bold text-steel-700 dark:text-slate-200 hover:text-steel-900 dark:hover:text-white transition shadow-xs text-center"
                    title="เปิดใบขอซื้อ (PR) เพิ่มเติม"
                  >
                    <ShoppingCart className="h-3.5 w-3.5 text-steel-600 dark:text-slate-300" />
                    <span>สั่ง PR</span>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* -------------------------------------------------------------------- */
        /* Table View Mode                                                      */
        /* -------------------------------------------------------------------- */
        <div className="overflow-x-auto rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-steel-200 dark:border-slate-800 bg-steel-50/90 dark:bg-slate-800 text-left text-steel-600 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 pl-4">รหัสพัสดุ</th>
                <th>รูปภาพ</th>
                <th>ชื่อวัสดุ / อุปกรณ์</th>
                <th className="text-right">คงเหลือในคลัง</th>
                <th>หน่วย</th>
                <th>หมวดหมู่</th>
                <th className="text-right">ราคาเฉลี่ย</th>
                <th className="text-right">มูลค่ารวม</th>
                <th className="text-right">จุดเตือน</th>
                <th className="text-center pr-4">จัดการด่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
              {paginatedItems.map((i) => {
                const isItemLow = isLow(i)
                const isItemOut = isOut(i)
                const isOpen = open === i.id

                return (
                  <Fragment key={i.id}>
                    <tr
                      className={`transition hover:bg-steel-50/80 dark:hover:bg-slate-800/60 ${
                        isOpen ? 'bg-steel-50 dark:bg-slate-800/80' : ''
                      }`}
                    >
                      {/* รหัส */}
                      <td
                        className="py-3 pl-4 font-mono font-bold text-steel-900 dark:text-amber-400 cursor-pointer"
                        onClick={() => setOpen(isOpen ? null : i.id)}
                      >
                        <span className="mr-1 text-steel-400 dark:text-slate-500">{isOpen ? '▾' : '▸'}</span>
                        {i.item_code}
                      </td>

                      {/* รูปภาพ */}
                      <td>
                        {i.image_url ? (
                          <R2Image
                            fileKey={i.image_url}
                            alt={i.item_name}
                            className="h-10 w-10 rounded-xl border border-steel-200 dark:border-slate-700 object-cover shadow-xs cursor-pointer hover:opacity-80 transition"
                            onClick={() => setPreviewImg(i.image_url)}
                            title="คลิกดูรูปใหญ่"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-steel-200 dark:border-slate-700 bg-steel-50 dark:bg-slate-800 text-[10px] text-steel-400 dark:text-slate-500 font-mono">
                            -
                          </div>
                        )}
                      </td>

                      {/* ชื่อวัสดุ */}
                      <td
                        className="font-bold text-steel-900 dark:text-slate-100 cursor-pointer max-w-[280px]"
                        onClick={() => setSelectedDetailItem(i)}
                      >
                        <span className="hover:text-sky-700 dark:hover:text-amber-400 transition">{i.item_name}</span>
                      </td>

                      {/* คงเหลือ */}
                      <td className="text-right font-mono font-bold">
                        <span
                          className={
                            isItemOut
                              ? 'text-rose-600 dark:text-rose-400 font-black'
                              : isItemLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-steel-900 dark:text-slate-100'
                          }
                        >
                          {formatIntQty(i.qty_on_hand)}
                        </span>
                        {isItemOut ? (
                          <span className="ml-1 rounded bg-rose-100 dark:bg-rose-950/80 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 dark:text-rose-300">
                            หมด
                          </span>
                        ) : isItemLow ? (
                          <span className="ml-1 rounded bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300">
                            ใกล้หมด
                          </span>
                        ) : null}
                      </td>

                      {/* หน่วย */}
                      <td className="text-steel-600 dark:text-slate-400 text-xs">{i.unit || '-'}</td>

                      {/* หมวด */}
                      <td className="text-steel-600 dark:text-slate-300 text-xs">
                        <span className="rounded-md bg-steel-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-steel-700 dark:text-slate-200 border border-steel-200 dark:border-slate-700">
                          {i.item_categories?.name ?? '-'}
                        </span>
                      </td>

                      {/* ราคา/หน่วย */}
                      <td className="text-right font-mono text-xs text-steel-800 dark:text-slate-300">{baht(i.avg_unit_cost)} บ.</td>

                      {/* มูลค่า */}
                      <td className="text-right font-mono font-bold text-xs text-steel-900 dark:text-slate-100">
                        {baht(Number(i.qty_on_hand || 0) * Number(i.avg_unit_cost || 0))} บ.
                      </td>

                      {/* จุดเตือน */}
                      <td className="text-right font-mono text-xs text-steel-400 dark:text-slate-500">
                        {i.reorder_point ? formatIntQty(i.reorder_point) : '-'}
                      </td>

                      {/* ปุ่มจัดการ */}
                      <td className="text-center pr-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            to={`/store/issue/new?item_id=${i.id}`}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                              isItemOut
                                ? 'bg-steel-100 dark:bg-slate-800 text-steel-400 dark:text-slate-600 pointer-events-none'
                                : 'bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 dark:font-black'
                            }`}
                          >
                            <ArrowUpFromLine className="h-3 w-3" />
                            <span>เบิก</span>
                          </Link>

                          <Link
                            to={`/purchasing/pr/new?item_id=${i.id}`}
                            className="rounded-lg bg-steel-100 dark:bg-slate-800 hover:bg-steel-200 dark:hover:bg-slate-700 text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700 px-2.5 py-1 text-xs font-bold transition flex items-center gap-1"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            <span>สั่ง PR</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => setSelectedUsageItem(i)}
                            className="rounded-lg bg-steel-100 hover:bg-steel-200 text-steel-600 p-1"
                            title="ดูประวัติการใช้โครงการ"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* รายละเอียดล็อตโครงการเมื่อกดเปิด */}
                    {isOpen && (
                      <tr className="bg-steel-50/50 dark:bg-slate-950/40">
                        <td colSpan={10} className="p-4 pl-8">
                          <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 shadow-xs">
                            <div className="flex items-center justify-between text-xs font-bold text-steel-900 dark:text-slate-100">
                              <span className="flex items-center gap-1.5">
                                <Boxes className="h-4 w-4 text-steel-700 dark:text-amber-400" />
                                <span>ล็อตที่มาของวัสดุ (ตามโครงการ / สต็อกส่วนกลาง)</span>
                              </span>
                              <Link
                                to="/store/adjust"
                                className="text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1"
                              >
                                <span>ปรับปรุงสต็อก / รับคืนจากโครงการ</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>

                            {origins(i.id).length === 0 ? (
                              <p className="text-xs text-steel-400 dark:text-slate-500">
                                ไม่มีล็อตแยกตามโครงการ (ยอดทั้งหมดอยู่ในสต็อกหลักของบริษัท)
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                                {origins(i.id).map((o, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between rounded-xl border border-steel-200 dark:border-slate-800 bg-steel-50 dark:bg-slate-800/80 p-2 text-xs"
                                  >
                                    <span
                                      className="font-medium text-steel-700 dark:text-slate-200 truncate max-w-[170px] cursor-help"
                                      title={o.name}
                                    >
                                      {o.name}
                                    </span>
                                    <span className="font-mono font-bold text-steel-900 dark:text-slate-100 shrink-0">
                                      {formatIntQty(o.qty)} {i.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4.1 แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {shown.length > 0 && (
        <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-xs">
          <Pagination
            currentPage={currentPage}
            totalItems={shown.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
      )}

      {/* 5. Modal รายละเอียดวัสดุ */}
      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-steel-200 dark:border-slate-800 p-4 bg-gradient-to-r from-slate-900 to-steel-900 text-white">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-hivis" />
                <span className="text-sm font-bold text-white">
                  รายละเอียดวัสดุวิศวกรรม: {selectedDetailItem.item_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="rounded-full p-1 text-steel-400 hover:text-white transition"
              >
                
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-steel-200 dark:border-slate-700 bg-steel-50 dark:bg-slate-800">
                  {selectedDetailItem.image_url ? (
                    <R2Image
                      fileKey={selectedDetailItem.image_url}
                      alt={selectedDetailItem.item_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-steel-400 dark:text-slate-500">
                      <Boxes className="h-10 w-10 text-steel-300 dark:text-slate-600" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-center sm:text-left flex-1">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="rounded-md bg-steel-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-bold text-steel-900 dark:text-amber-400 border border-steel-200 dark:border-slate-700">
                      {selectedDetailItem.item_code}
                    </span>
                    <span className="rounded-md bg-steel-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-steel-600 dark:text-slate-200 border border-steel-200 dark:border-slate-700">
                      {selectedDetailItem.item_categories?.name || 'วัสดุทั่วไป'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-steel-900 dark:text-slate-100 leading-snug">
                    {selectedDetailItem.item_name}
                  </h2>
                  <div className="flex items-baseline justify-center sm:justify-start gap-1 pt-1">
                    <span className="text-xs font-semibold text-steel-500 dark:text-slate-400">ราคาเฉลี่ย:</span>
                    <span className="text-lg font-black font-mono text-steel-900 dark:text-white">
                      {baht(selectedDetailItem.avg_unit_cost)}
                    </span>
                    <span className="text-xs text-steel-400 dark:text-slate-400">บาท / {selectedDetailItem.unit}</span>
                  </div>
                </div>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-3 gap-2.5 rounded-2xl bg-steel-50 dark:bg-slate-800/80 p-3.5 border border-steel-100 dark:border-slate-700 text-center">
                <div>
                  <div className="text-[10px] text-steel-400 dark:text-slate-400">คงเหลือในคลัง</div>
                  <div className="mt-0.5 font-mono text-lg font-black text-steel-900 dark:text-slate-100">
                    {formatIntQty(selectedDetailItem.qty_on_hand)}{' '}
                    <span className="text-xs font-normal text-steel-500 dark:text-slate-400">
                      {selectedDetailItem.unit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-steel-400 dark:text-slate-400">จุดเตือนสั่งซื้อ</div>
                  <div className="mt-0.5 font-mono text-lg font-bold text-steel-700 dark:text-slate-200">
                    {selectedDetailItem.reorder_point ? formatIntQty(selectedDetailItem.reorder_point) : 0}{' '}
                    <span className="text-xs font-normal text-steel-400 dark:text-slate-400">
                      {selectedDetailItem.unit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-steel-400 dark:text-slate-400">มูลค่าคงคลังรวม</div>
                  <div className="mt-0.5 font-mono text-lg font-black text-steel-900 dark:text-slate-100">
                    {baht(
                      Number(selectedDetailItem.qty_on_hand || 0) *
                        Number(selectedDetailItem.avg_unit_cost || 0)
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 grid grid-cols-2 gap-2">
                <Link
                  to={`/store/issue/new?item_id=${selectedDetailItem.id}`}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 dark:font-black py-2.5 text-xs font-bold transition shadow-xs"
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  <span>เบิกใช้วัสดุนี้</span>
                </Link>

                <Link
                  to={`/purchasing/pr/new?item_id=${selectedDetailItem.id}`}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-steel-100 dark:bg-slate-800 hover:bg-steel-200 dark:hover:bg-slate-700 text-steel-800 dark:text-slate-100 border border-steel-200 dark:border-slate-700 py-2.5 text-xs font-bold transition"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>เปิดใบขอซื้อ (PR)</span>
                </Link>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-steel-100 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedDetailItem
                    setSelectedDetailItem(null)
                    setSelectedUsageItem(item)
                  }}
                  className="text-sky-700 dark:text-sky-400 font-bold hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>ดูประวัติการเบิกใช้ในโครงการ</span>
                </button>

                <Link
                  to="/store/items"
                  className="text-steel-500 dark:text-slate-400 hover:text-steel-800 dark:hover:text-slate-200 font-semibold"
                >
                  แก้ไขข้อมูลพัสดุนี้ →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-2 border border-steel-200 dark:border-slate-800">
            <R2Image
              fileKey={previewImg}
              alt="Preview"
              className="max-h-[85vh] min-h-[200px] min-w-[200px] w-auto object-contain rounded-xl"
            />
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              
            </button>
          </div>
        </div>
      )}

      {/* Item Usage History Modal */}
      {selectedUsageItem && (
        <ItemProjectUsageModal
          item={selectedUsageItem}
          onClose={() => setSelectedUsageItem(null)}
        />
      )}

      {/* Inventory Report Modal */}
      {showReport && (
        <InventoryReportModal
          items={items}
          lots={lots}
          categories={cats}
          cats={cats}
          selectedCategory={cat}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
