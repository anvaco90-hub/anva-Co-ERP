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
  const [catSearchQuery, setCatSearchQuery] = useState('')
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

  // กรองหมวดหมู่ตามคำค้นหาหมวดหมู่ (Search Categories)
  const filteredCats = useMemo(() => {
    if (!catSearchQuery.trim()) return cats
    const q = catSearchQuery.toLowerCase().trim()
    return cats.filter((c) => c.name.toLowerCase().includes(q))
  }, [cats, catSearchQuery])

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
      <div className="flex h-64 flex-col items-center justify-center space-y-3">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-emerald-600 dark:border-t-amber-400" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          กำลังโหลดคลังพัสดุวิศวกรรม ANVA &amp; CO...
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
    <div className="space-y-4 pb-12 text-slate-800 dark:text-slate-100">
      {/* 1. Clean Header & Actions (QuotationList Standard) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            คลังพัสดุและอุปกรณ์ (Stock Inventory)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ตรวจสอบยอดคงเหลือ จุดเตือนสั่งซื้อ และจัดการเบิกจ่ายเข้าโครงการอย่างเป็นระบบ (มูลค่ารวม{' '}
            <b className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{baht(totalValue)}</b> บาท)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>พิมพ์รายงานสต็อก (PDF)</span>
          </button>
          <Link
            to="/store/items"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-xs transition"
          >
            <span>+ เพิ่มพัสดุใหม่</span>
          </Link>
        </div>
      </div>

      {/* 2. Interactive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setOnlyLow(false)
            setOnlyOut(false)
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            !onlyLow && !onlyOut
              ? 'border-slate-800 dark:border-emerald-400 bg-white dark:bg-slate-900 ring-2 ring-slate-800/15 dark:ring-emerald-400/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">พัสดุทั้งหมด</div>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {items.length} <span className="text-xs font-normal text-slate-400">รายการ</span>
          </div>
        </button>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">พร้อมเบิกใช้งาน</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
            {readyCount} <span className="text-xs font-normal text-slate-400">รายการ</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setOnlyLow(!onlyLow)
            setOnlyOut(false)
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            onlyLow
              ? 'border-amber-500 dark:border-amber-400 bg-white dark:bg-slate-900 ring-2 ring-amber-500/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-amber-300 dark:hover:border-amber-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">ใกล้หมด (เตือนสั่งซื้อ)</div>
          <div className="mt-1 text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums">
            {lowCount} <span className="text-xs font-normal text-slate-400">รายการ</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setOnlyOut(!onlyOut)
            setOnlyLow(false)
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            onlyOut
              ? 'border-rose-500 dark:border-rose-400 bg-white dark:bg-slate-900 ring-2 ring-rose-500/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-rose-300 dark:hover:border-rose-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-400">หมดสต็อก (ต้องออก PR)</div>
          <div className="mt-1 text-2xl font-bold font-mono text-rose-700 dark:text-rose-400 tabular-nums">
            {outCount} <span className="text-xs font-normal text-slate-400">รายการ</span>
          </div>
        </button>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 2. Category Filter Pills (เลือกตามหมวดหมู่ - พร้อมช่องค้นหาหมวดหมู่) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
            <Layers className="h-4 w-4 text-sky-600 dark:text-amber-400" />
            <span>เลือกดูตามหมวดหมู่วัสดุและอุปกรณ์</span>
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            {/* ช่องค้นหาหมวดหมู่ (Search Categories) */}
            <div className="relative min-w-[160px] sm:w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={catSearchQuery}
                onChange={(e) => setCatSearchQuery(e.target.value)}
                placeholder="ค้นหาหมวดหมู่..."
                className="h-8 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-7 text-xs font-normal text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-2xs"
              />
              {catSearchQuery && (
                <button
                  type="button"
                  onClick={() => setCatSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="ล้างคำค้นหาหมวดหมู่"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <span className="text-slate-400 dark:text-slate-400 font-normal hidden sm:inline">
              แสดง {shown.length} จาก {items.length} รายการ
            </span>

            {/* Dropdown เลือกหมวดหมู่ */}
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="">หมวดหมู่ทั้งหมด ({items.length} รายการ)</option>
              {filteredCats.map((c) => (
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
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              cat === ''
                ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>ทั้งหมด</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                cat === '' ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {items.length}
            </span>
          </button>

          {filteredCats.map((c) => {
            const count = items.filter((it) => it.category_id === c.id).length
            const isSelected = cat === c.id

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{c.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {filteredCats.length === 0 && catSearchQuery && (
            <span className="text-xs text-slate-400 py-1">
              ไม่พบหมวดหมู่ที่ตรงกับ "{catSearchQuery}"
            </span>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 3. Search Bar, Standard Sort Filter & View Toggle (Table vs Grid)     */}
      {/* ---------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อวัสดุ, หน่วยนับ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 pr-9 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="ล้างคำค้นหา"
              >
                <X className="h-3.5 w-3.5" />
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
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              onlyLow
                ? 'bg-amber-500 text-slate-950 font-black border-amber-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>ใกล้หมด ({lowCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOnlyOut(!onlyOut)
              setOnlyLow(false)
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              onlyOut
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
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
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}

          {/* View Mode Toggle: Grid vs Table */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 text-xs font-bold ml-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-lg px-2.5 py-1 transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="มุมมองการ์ดวัสดุ"
            >
              <Grid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">การ์ดวัสดุ</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded-lg px-2.5 py-1 transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-4 shadow-2xs">
          <Package className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">คลังพัสดุว่างเปล่า</h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            พร้อมสำหรับการป้อนข้อมูลรายการวัสดุจริงของฝ่ายสโตร์
          </p>
          <div className="pt-2">
            <Link
              to="/store/items"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 px-5 py-2.5 text-xs sm:text-sm font-bold text-white dark:text-slate-950 transition shadow-sm"
            >
              <Package className="h-4 w-4" />
              <span>+ ไปที่หน้าจัดการวัสดุเพื่อเริ่มป้อนข้อมูลจริง</span>
            </Link>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <Boxes className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">ไม่พบรายการพัสดุตรงตามเงื่อนไข</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
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
            className="rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 px-4 py-2 text-xs font-bold hover:bg-slate-800 dark:hover:bg-amber-400 transition shadow-xs cursor-pointer"
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
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md"
              >
                {/* 1. Thumbnail Image & Floating Stock Status Pill (ไม่ทับซ้อนกัน) */}
                <div
                  className="relative aspect-video sm:aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer"
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
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60">
                      <Boxes className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">ANVA &amp; CO.</span>
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
                      <span className="font-mono font-bold text-sky-700 dark:text-amber-400 truncate">
                        {it.item_code}
                      </span>
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 text-[10px] font-semibold truncate max-w-[130px] border border-slate-200 dark:border-slate-700">
                        {it.item_categories?.name || 'วัสดุทั่วไป'}
                      </span>
                    </div>

                    {/* ชื่อวัสดุ */}
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug cursor-pointer group-hover:text-sky-700 dark:group-hover:text-amber-400 transition"
                      onClick={() => setSelectedDetailItem(it)}
                      title={it.item_name}
                    >
                      {it.item_name}
                    </h3>
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {/* ราคาต่อหน่วย */}
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">฿</span>
                        <span className="text-base font-black font-mono text-slate-900 dark:text-white tracking-tight">
                          {cost > 0 ? baht(cost) : '-'}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-400 font-normal">
                          / {it.unit || 'ชิ้น'}
                        </span>
                      </div>

                      {/* ยอดคงเหลือ (อยู่บรรทัดเดียวกัน) */}
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="text-slate-400 dark:text-slate-400 text-[11px]">คงเหลือ:</span>
                        <span
                          className={`font-bold ${
                            itemOut
                              ? 'text-rose-600 dark:text-rose-400 font-black'
                              : itemLow
                              ? 'text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatIntQty(qty)} {it.unit}
                        </span>
                      </div>
                    </div>

                    {/* มูลค่ารวมในคลัง (อยู่บรรทัดเดียว สบายตา) */}
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-0.5">
                      <span>มูลค่ารวม:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{baht(valTotal)} บ.</span>
                    </div>
                  </div>
                </div>

                {/* 3. Action Footer */}
                <div className="p-2.5 pt-2 grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60">
                  <Link
                    to={`/store/issue/new?item_id=${it.id}`}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold transition text-center shadow-2xs ${
                      itemOut
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed pointer-events-none'
                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 dark:font-black'
                    }`}
                    title="เบิกวัสดุเข้าโครงการ"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    <span>เบิก</span>
                  </Link>

                  <Link
                    to={`/purchasing/pr/new?item_id=${it.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition shadow-2xs text-center"
                    title="เปิดใบขอซื้อ (PR) เพิ่มเติม"
                  >
                    <ShoppingCart className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
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
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800 text-left text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 pl-4 border-r border-slate-200/70 dark:border-slate-700/60">รหัสพัสดุ</th>
                <th className="py-3.5 px-3 border-r border-slate-200/70 dark:border-slate-700/60">รูปภาพ</th>
                <th className="py-3.5 px-3.5 min-w-[220px] border-r border-slate-200/70 dark:border-slate-700/60">ชื่อวัสดุ / อุปกรณ์</th>
                <th className="py-3.5 px-3 text-right border-r border-slate-200/70 dark:border-slate-700/60">คงเหลือในคลัง</th>
                <th className="py-3.5 px-2.5 text-center border-r border-slate-200/70 dark:border-slate-700/60">หน่วย</th>
                <th className="py-3.5 px-3 border-r border-slate-200/70 dark:border-slate-700/60">หมวดหมู่</th>
                <th className="py-3.5 px-3 text-right border-r border-slate-200/70 dark:border-slate-700/60">ราคาเฉลี่ย</th>
                <th className="py-3.5 px-3 text-right border-r border-slate-200/70 dark:border-slate-700/60">มูลค่ารวม</th>
                <th className="py-3.5 px-3 text-right border-r border-slate-200/70 dark:border-slate-700/60">จุดเตือน</th>
                <th className="py-3.5 text-center pr-4">จัดการด่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {paginatedItems.map((i, rowIdx) => {
                const isItemLow = isLow(i)
                const isItemOut = isOut(i)
                const isOpen = open === i.id

                return (
                  <Fragment key={i.id}>
                    <tr
                      className={`transition border-b border-slate-200 dark:border-slate-800 ${
                        isOpen
                          ? 'bg-amber-50/60 dark:bg-slate-800/80'
                          : rowIdx % 2 === 0
                            ? 'bg-white dark:bg-slate-900'
                            : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                    >
                      {/* รหัส */}
                      <td
                        className="py-3 pl-4 font-mono font-bold text-slate-900 dark:text-amber-400 cursor-pointer border-r border-slate-200/60 dark:border-slate-800/60"
                        onClick={() => setOpen(isOpen ? null : i.id)}
                      >
                        <span className="mr-1 text-slate-400 dark:text-slate-500">{isOpen ? '▾' : '▸'}</span>
                        {i.item_code}
                      </td>

                      {/* รูปภาพ */}
                      <td className="py-3 px-3 border-r border-slate-200/60 dark:border-slate-800/60">
                        {i.image_url ? (
                          <R2Image
                            fileKey={i.image_url}
                            alt={i.item_name}
                            className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 object-cover shadow-xs cursor-pointer hover:opacity-80 transition"
                            onClick={() => setPreviewImg(i.image_url)}
                            title="คลิกดูรูปใหญ่"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            -
                          </div>
                        )}
                      </td>

                      {/* ชื่อวัสดุ */}
                      <td
                        className="py-3 px-3.5 font-bold text-slate-900 dark:text-slate-100 cursor-pointer max-w-[280px] border-r border-slate-200/60 dark:border-slate-800/60"
                        onClick={() => setSelectedDetailItem(i)}
                      >
                        <span className="hover:text-sky-700 dark:hover:text-amber-400 transition">{i.item_name}</span>
                      </td>

                      {/* คงเหลือ */}
                      <td className="py-3 px-3 text-right font-mono font-bold border-r border-slate-200/60 dark:border-slate-800/60">
                        <span
                          className={
                            isItemOut
                              ? 'text-rose-600 dark:text-rose-400 font-black'
                              : isItemLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-100'
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
                      <td className="py-3 px-2.5 text-center text-slate-600 dark:text-slate-400 text-xs border-r border-slate-200/60 dark:border-slate-800/60">{i.unit || '-'}</td>

                      {/* หมวด */}
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 text-xs border-r border-slate-200/60 dark:border-slate-800/60">
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {i.item_categories?.name ?? '-'}
                        </span>
                      </td>

                      {/* ราคา/หน่วย */}
                      <td className="py-3 px-3 text-right font-mono text-xs text-slate-800 dark:text-slate-300 border-r border-slate-200/60 dark:border-slate-800/60">{baht(i.avg_unit_cost)} บ.</td>

                      {/* มูลค่า */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-xs text-slate-900 dark:text-slate-100 border-r border-slate-200/60 dark:border-slate-800/60">
                        {baht(Number(i.qty_on_hand || 0) * Number(i.avg_unit_cost || 0))} บ.
                      </td>

                      {/* จุดเตือน */}
                      <td className="py-3 px-3 text-right font-mono text-xs text-slate-400 dark:text-slate-500 border-r border-slate-200/60 dark:border-slate-800/60">
                        {i.reorder_point ? formatIntQty(i.reorder_point) : '-'}
                      </td>

                      {/* ปุ่มจัดการ */}
                      <td className="py-3 text-center pr-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            to={`/store/issue/new?item_id=${i.id}`}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                              isItemOut
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 pointer-events-none'
                                : 'bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 dark:font-black'
                            }`}
                          >
                            <ArrowUpFromLine className="h-3 w-3" />
                            <span>เบิก</span>
                          </Link>

                          <Link
                            to={`/purchasing/pr/new?item_id=${i.id}`}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-bold transition flex items-center gap-1"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            <span>สั่ง PR</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => setSelectedUsageItem(i)}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-1 cursor-pointer"
                            title="ดูประวัติการใช้โครงการ"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* รายละเอียดล็อตโครงการเมื่อกดเปิด */}
                    {isOpen && (
                      <tr className="bg-slate-50/50 dark:bg-slate-950/40">
                        <td colSpan={10} className="p-4 pl-8">
                          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-100">
                              <span className="flex items-center gap-1.5">
                                <Boxes className="h-4 w-4 text-sky-600 dark:text-amber-400" />
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
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                ไม่มีล็อตแยกตามโครงการ (ยอดทั้งหมดอยู่ในสต็อกหลักของบริษัท)
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                                {origins(i.id).map((o, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 p-2 text-xs"
                                  >
                                    <span
                                      className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[170px] cursor-help"
                                      title={o.name}
                                    >
                                      {o.name}
                                    </span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-2xs">
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
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 p-4 bg-[#0f172a] text-white">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">
                  รายละเอียดวัสดุวิศวกรรม: {selectedDetailItem.item_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="rounded-full p-1 text-slate-400 hover:text-white transition cursor-pointer"
                title="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  {selectedDetailItem.image_url ? (
                    <R2Image
                      fileKey={selectedDetailItem.image_url}
                      alt={selectedDetailItem.item_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                      <Boxes className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-center sm:text-left flex-1">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-bold text-slate-900 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                      {selectedDetailItem.item_code}
                    </span>
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      {selectedDetailItem.item_categories?.name || 'วัสดุทั่วไป'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {selectedDetailItem.item_name}
                  </h2>
                  <div className="flex items-baseline justify-center sm:justify-start gap-1 pt-1">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ราคาเฉลี่ย:</span>
                    <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                      {baht(selectedDetailItem.avg_unit_cost)}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-400">บาท / {selectedDetailItem.unit}</span>
                  </div>
                </div>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-3 gap-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 p-3.5 border border-slate-100 dark:border-slate-700 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400">คงเหลือในคลัง</div>
                  <div className="mt-0.5 font-mono text-lg font-black text-slate-900 dark:text-slate-100">
                    {formatIntQty(selectedDetailItem.qty_on_hand)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {selectedDetailItem.unit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400">จุดเตือนสั่งซื้อ</div>
                  <div className="mt-0.5 font-mono text-lg font-bold text-slate-700 dark:text-slate-200">
                    {selectedDetailItem.reorder_point ? formatIntQty(selectedDetailItem.reorder_point) : 0}{' '}
                    <span className="text-xs font-normal text-slate-400 dark:text-slate-400">
                      {selectedDetailItem.unit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400">มูลค่าคงคลังรวม</div>
                  <div className="mt-0.5 font-mono text-lg font-black text-slate-900 dark:text-slate-100">
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
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-bold transition"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>เปิดใบขอซื้อ (PR)</span>
                </Link>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedDetailItem
                    setSelectedDetailItem(null)
                    setSelectedUsageItem(item)
                  }}
                  className="text-sky-700 dark:text-sky-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>ดูประวัติการเบิกใช้ในโครงการ</span>
                </button>

                <Link
                  to="/store/items"
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
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
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800">
            <R2Image
              fileKey={previewImg}
              alt="Preview"
              className="max-h-[85vh] min-h-[200px] min-w-[200px] w-auto object-contain rounded-xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black cursor-pointer"
              title="ปิดภาพ"
            >
              <X className="h-4 w-4" />
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
