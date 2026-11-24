import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime, formatDateTimeParts } from '../../lib/purchasing'
import { formatIntQty, toIntQty } from '../../lib/store'
import Pagination from '../../components/Pagination'
import TableSortFilter from '../../components/TableSortFilter'
import {
  History,
  ArrowUpFromLine,
  ArrowDownToLine,
  RotateCcw,
  Briefcase,
  User,
  Calendar,
  Layers,
  FileText,
  Boxes,
  Building2,
  MapPin,
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  X,
  List,
  Grid,
  Clock,
} from 'lucide-react'

const ISSUE_SORT_OPTIONS = [
  { value: 'date_desc', label: ' วันที่และเวลาล่าสุด (ใหม่  เก่า)' },
  { value: 'date_asc', label: ' วันที่ (เก่า  ใหม่)' },
  { value: 'code_desc', label: 'เลขที่เอกสาร (มาก  น้อย)' },
  { value: 'code_asc', label: 'เลขที่เอกสาร (น้อย  มาก)' },
  { value: 'amount_desc', label: 'มูลค่ารายการ (มาก  น้อย)' },
  { value: 'amount_asc', label: 'มูลค่ารายการ (น้อย  มาก)' },
]

export default function IssueList() {
  const navigate = useNavigate()
  const [issues, setIssues] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Sub-tabs: 'all' | 'issue' | 'return' | 'adjust'
  const [activeTab, setActiveTab] = useState('all')

  // Filters
  const [periodPreset, setPeriodPreset] = useState('all') // all | today | 7days | 30days | thisMonth | thisYear
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10) // 10 | 20 | 50

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      // 1. Load Projects
      const pPromise = supabase
        .from('projects')
        .select('id, project_code, project_name')
        .order('project_code')

      // 2. Load Stock Issues (Latest first: created_at desc)
      const issPromise = supabase
        .from('stock_issues')
        .select(
          'id, issue_no, issue_date, notes, created_at, issue_target, issue_reason, target_location, projects(id, project_code, project_name), issuer:profiles!issued_by(full_name), stock_issue_items(quantity, unit_cost, inventory_items(id, item_name, unit, item_code))'
        )
        .order('created_at', { ascending: false })
        .limit(200)

      // 3. Load Stock Adjustments & Returns (Latest first: created_at desc)
      const adjPromise = supabase
        .from('stock_adjustments')
        .select(
          'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit), projects:source_project_id(id, project_code, project_name)'
        )
        .order('created_at', { ascending: false })
        .limit(200)

      const [pRes, issRes, adjRes] = await Promise.all([pPromise, issPromise, adjPromise])

      setProjects(pRes.data ?? [])

      // Fallback for stock_issues if schema differs
      if (issRes.error) {
        console.warn('Stock issues primary query warning, fallback query:', issRes.error)
        const fbIss = await supabase
          .from('stock_issues')
          .select(
            'id, issue_no, issue_date, notes, created_at, projects(id, project_code, project_name), stock_issue_items(quantity, unit_cost, inventory_items(id, item_name, unit, item_code))'
          )
          .order('created_at', { ascending: false })
          .limit(200)
        setIssues(fbIss.data ?? [])
      } else {
        setIssues(issRes.data ?? [])
      }

      if (adjRes.error) {
        const fbAdj = await supabase
          .from('stock_adjustments')
          .select(
            'id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, item_id, inventory_items(id, item_code, item_name, unit)'
          )
          .order('created_at', { ascending: false })
          .limit(200)
        setAdjustments(fbAdj.data ?? [])
      } else {
        setAdjustments(adjRes.data ?? [])
      }
      setLoading(false)
    }

    loadData()
  }, [])

  // Normalize into unified stream of movement records
  const unifiedRecords = useMemo(() => {
    const list = []

    // Map Issues
    for (const r of issues) {
      const itemsList = r.stock_issue_items || []
      const totalAmount = itemsList.reduce(
        (s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0),
        0
      )

      // Analyze target
      let targetType = r.issue_target || 'project'
      if (!r.issue_target) {
        if (r.notes && r.notes.includes('ออฟฟิศ')) targetType = 'office'
        else if (r.notes && r.notes.includes('หน้างาน')) targetType = 'site'
      }

      list.push({
        id: `iss-${r.id}`,
        kind: 'issue',
        code: r.issue_no || 'ISSUE',
        createdAt: new Date(r.created_at || r.issue_date || Date.now()),
        dateStr: (r.issue_date || r.created_at || '').slice(0, 10),
        dateTimeStr: r.created_at ? fmtDateTime(r.created_at) : (r.issue_date || '-'),
        projectId: r.projects?.id || null,
        projectCode: r.projects?.project_code || '',
        projectName: r.projects?.project_name || '',
        targetType,
        targetLocation: r.target_location || '',
        reason: r.issue_reason || '',
        notes: r.notes || '',
        userName: r.issuer?.full_name || 'เจ้าหน้าที่สโตร์',
        items: itemsList.map((i) => ({
          id: i.inventory_items?.id,
          name: i.inventory_items?.item_name || 'พัสดุ',
          code: i.inventory_items?.item_code || '',
          unit: i.inventory_items?.unit || '',
          quantity: toIntQty(i.quantity || 0),
          unitCost: Number(i.unit_cost || 0),
          totalCost: Number(i.quantity || 0) * Number(i.unit_cost || 0),
        })),
        totalAmount,
      })
    }

    // Map Adjustments (Returns vs Decrements)
    for (const a of adjustments) {
      const isReturn = Number(a.qty_after) > Number(a.qty_before) || (a.reason && a.reason.includes('คืนของ'))
      const diffQty = Math.abs(Number(a.qty_after || 0) - Number(a.qty_before || 0))
      const unitCost = Number(a.unit_cost || 0)
      const totalAmount = diffQty * unitCost

      // Detect origin from reason string or project
      let targetType = 'project'
      if (a.projects) targetType = 'project'
      else if (a.reason && a.reason.includes('ออฟฟิศ')) targetType = 'office'
      else if (a.reason && a.reason.includes('หน้างาน')) targetType = 'site'

      list.push({
        id: `adj-${a.id}`,
        kind: isReturn ? 'return' : 'adjust',
        code: a.adj_no || 'ADJ',
        createdAt: new Date(a.created_at || Date.now()),
        dateStr: (a.created_at || '').slice(0, 10),
        dateTimeStr: a.created_at ? fmtDateTime(a.created_at) : '-',
        projectId: a.projects?.id || null,
        projectCode: a.projects?.project_code || '',
        projectName: a.projects?.project_name || '',
        targetType,
        targetLocation: '',
        reason: a.reason || '',
        notes: a.reason || '',
        userName: a.creator?.full_name || 'เจ้าหน้าที่สโตร์',
        qtyBefore: toIntQty(a.qty_before || 0),
        qtyAfter: toIntQty(a.qty_after || 0),
        diffQty: toIntQty(diffQty),
        unitCost,
        items: a.inventory_items ? [
          {
            id: a.inventory_items.id,
            name: a.inventory_items.item_name || 'พัสดุ',
            code: a.inventory_items.item_code || '',
            unit: a.inventory_items.unit || '',
            quantity: toIntQty(diffQty),
            unitCost,
            totalCost: totalAmount,
          }
        ] : [],
        totalAmount,
      })
    }

    // Sort strictly LATEST FIRST (created_at descending)
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return list
  }, [issues, adjustments])

  // Filter computation
  const filteredRecords = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const nowTime = today.getTime()

    return unifiedRecords.filter((rec) => {
      // 1. Filter by Tab (kind)
      if (activeTab === 'issue' && rec.kind !== 'issue') return false
      if (activeTab === 'return' && rec.kind !== 'return') return false
      if (activeTab === 'adjust' && rec.kind !== 'adjust') return false

      // 2. Filter by Project
      if (selectedProjectId !== 'all' && rec.projectId !== selectedProjectId) {
        return false
      }

      // 3. Filter by Time Presets
      const recDate = new Date(rec.createdAt)
      recDate.setHours(0, 0, 0, 0)
      const recTime = recDate.getTime()

      if (periodPreset === 'today') {
        if (recTime !== nowTime) return false
      } else if (periodPreset === '7days') {
        const diffDays = (nowTime - recTime) / (1000 * 60 * 60 * 24)
        if (diffDays < 0 || diffDays > 7) return false
      } else if (periodPreset === '30days') {
        const diffDays = (nowTime - recTime) / (1000 * 60 * 60 * 24)
        if (diffDays < 0 || diffDays > 30) return false
      } else if (periodPreset === 'thisMonth') {
        if (
          rec.createdAt.getMonth() !== today.getMonth() ||
          rec.createdAt.getFullYear() !== today.getFullYear()
        ) {
          return false
        }
      } else if (periodPreset === 'thisYear') {
        if (rec.createdAt.getFullYear() !== today.getFullYear()) return false
      }

      // Custom date range
      if (startDate) {
        if (rec.dateStr < startDate) return false
      }
      if (endDate) {
        if (rec.dateStr > endDate) return false
      }

      // 4. Search Query (Material, code, document no, project, notes)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchCode = rec.code.toLowerCase().includes(q)
        const matchProj = (rec.projectCode + ' ' + rec.projectName).toLowerCase().includes(q)
        const matchNotes = (rec.notes + ' ' + rec.reason).toLowerCase().includes(q)
        const matchItem = rec.items.some(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q)
        )

        if (!matchCode && !matchProj && !matchNotes && !matchItem) {
          return false
        }
      }

      return true
    })

    return filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime()
      const timeB = new Date(b.createdAt || 0).getTime()
      if (sortBy === 'date_desc') return timeB - timeA
      if (sortBy === 'date_asc') return timeA - timeB
      if (sortBy === 'code_desc') return (b.code || '').localeCompare(a.code || '', undefined, { numeric: true })
      if (sortBy === 'code_asc') return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })
      if (sortBy === 'amount_desc') return Number(b.totalAmount || 0) - Number(a.totalAmount || 0)
      if (sortBy === 'amount_asc') return Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
      return timeB - timeA
    })
  }, [unifiedRecords, activeTab, selectedProjectId, periodPreset, startDate, endDate, searchQuery, sortBy])

  // Summary Metrics of filtered data
  const metrics = useMemo(() => {
    let issueTotal = 0
    let returnTotal = 0
    let issueCount = 0
    let returnCount = 0

    for (const r of filteredRecords) {
      if (r.kind === 'issue') {
        issueTotal += r.totalAmount
        issueCount++
      } else if (r.kind === 'return') {
        returnTotal += r.totalAmount
        returnCount++
      }
    }

    return {
      totalCount: filteredRecords.length,
      issueTotal,
      returnTotal,
      issueCount,
      returnCount,
    }
  }, [filteredRecords])

  // Pagination slice
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, currentPage, pageSize])

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, periodPreset, selectedProjectId, searchQuery, startDate, endDate])

  if (loading) {
    return (
      <div className="flex h-56 flex-col items-center justify-center space-y-3 font-sans">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-steel-900 border-t-hivis dark:border-slate-800 dark:border-t-amber-400" />
        <span className="text-xs font-semibold text-steel-500 dark:text-slate-400">
          กำลังโหลดประวัติการเบิก-คืนพัสดุ...
        </span>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6 font-sans text-slate-900 dark:text-slate-100 pb-12">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                MATERIAL LOGS
              </span>
              <span className="text-xs text-steel-300">
                ระบบติดตามการเบิกจ่ายและรับคืนพัสดุวิศวกรรม (จำนวนเต็ม int)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              ประวัติการเบิก-คืนพัสดุ (Material Requisitions & Returns)
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-300">
              ตรวจสอบรายการเบิกของออกไปใช้ และรายการนำของเหลือกลับเข้าสโตร์ (เรียงล่าสุดอยู่บนสุดเสมอ)
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Link
              to="/store/issue/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-3.5 py-2 text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              <span>+ เบิกของ</span>
            </Link>

            <Link
              to="/store/adjust"
              className="rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3.5 py-2 text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>↩️ คืนของ</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Sub-Tabs & Filter Card (จัดเลย์เอาต์มาตรฐานเหมือนทั้งโมดูล) */}
      <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        {/* แถวบน: หมวดหมู่แท็บ (ซ้าย) + ค้นหาด่วน & เรียงลำดับมาตรฐาน & สลับมุมมอง (ขวา) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 dark:border-slate-800 pb-3">
          <div className="flex flex-wrap rounded-xl bg-steel-100 dark:bg-slate-800 p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 shadow-xs'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
            >
              <span>ทั้งหมด</span>
              <span className="rounded-full bg-steel-200 dark:bg-slate-700 px-1.5 py-0.2 text-[10px]">
                {unifiedRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('issue')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'issue'
                  ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              <span>ประวัติการเบิก</span>
              <span className="rounded-full bg-black/15 px-1.5 py-0.2 text-[10px]">
                {issues.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('return')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'return'
                  ? 'bg-emerald-700 text-white shadow-xs font-black'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>ประวัติการคืน</span>
              <span className="rounded-full bg-emerald-950/30 px-1.5 py-0.2 text-[10px]">
                {adjustments.filter((a) => Number(a.qty_after) > Number(a.qty_before) || (a.reason && a.reason.includes('คืนของ'))).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('adjust')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'adjust'
                  ? 'bg-rose-700 text-white shadow-xs font-black'
                  : 'text-steel-600 dark:text-slate-300 hover:text-steel-900 dark:hover:text-white'
              }`}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              <span>ตัดชำรุด/ปรับยอด</span>
            </button>
          </div>

          {/* ช่องค้นหาด่วน + เรียงลำดับมาตรฐาน + ปุ่มสลับมุมมอง */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="ค้นหารหัส, ชื่อพัสดุ, เลขที่..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 h-9 rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-7 text-xs font-semibold text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600 dark:hover:text-slate-200"
                >
                  
                </button>
              )}
            </div>

            <TableSortFilter
              value={sortBy}
              onChange={setSortBy}
              options={ISSUE_SORT_OPTIONS}
            />

            {/* View Mode Toggle: ตาราง vs การ์ด */}
            <div className="flex items-center rounded-xl border border-steel-200 dark:border-slate-700 bg-steel-100/80 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer ${
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
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer ${
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

        {/* แถวล่าง: ตัวกรองโครงการ + ช่วงเวลาดูย้อนหลัง + ปฏิทินกำหนดเอง */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* โครงการ & ช่วงเวลา */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400 dark:text-slate-500" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs font-semibold text-steel-800 dark:text-slate-100 focus:outline-none focus:border-amber-500"
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
                          : 'border-steel-200 dark:border-slate-700 bg-steel-50 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Date Inputs */}
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
          </div>
        </div>
      </div>

      {/* 3. Results Section (สรุปผลและสลับมุมมอง) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs px-1 text-steel-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            มูลค่าเบิกรวม (ที่แสดง): <b className="font-mono text-amber-900 dark:text-amber-400 font-bold">{baht(metrics.issueTotal)} บาท</b>
          </span>
          <span className="text-steel-300 dark:text-slate-600">·</span>
          <span>
            มูลค่าคืนรวม (ที่แสดง): <b className="font-mono text-emerald-900 dark:text-emerald-400 font-bold">{baht(metrics.returnTotal)} บาท</b>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span>
            แสดง <b>{filteredRecords.length}</b> รายการ
          </span>
          {(searchQuery || selectedProjectId !== 'all' || periodPreset !== 'all' || startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedProjectId('all')
                setPeriodPreset('all')
                setStartDate('')
                setEndDate('')
              }}
              className="text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
            >
              <X className="h-3 w-3" />
              <span>ล้างตัวกรองทั้งหมด</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. การแสดงผลข้อมูล: โหมดตาราง (Table View) และ โหมดการ์ด (Cards View) */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <Boxes className="mx-auto h-12 w-12 text-steel-300 dark:text-slate-600" />
          <h3 className="text-base font-bold text-steel-700 dark:text-slate-200">
            ไม่พบรายการตามเงื่อนไขที่ค้นหา
          </h3>
          <p className="text-xs text-steel-400 dark:text-slate-400">
            ลองปรับเปลี่ยนคำค้นหา หรือเลือกตัวกรองช่วงเวลา/โครงการใหม่
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* โหมดตารางมาตรฐานระดับสากล เหมือน ReceiptsList และ ItemsMaster */
        <div className="overflow-x-auto rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <table className="w-full text-xs min-w-[950px] divide-y divide-steel-200 dark:divide-slate-800">
            <thead className="bg-steel-50/90 dark:bg-slate-800 text-steel-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 pl-4 pr-3 whitespace-nowrap">วันที่ / เวลา</th>
                <th className="py-3.5 px-3 whitespace-nowrap">ประเภท</th>
                <th className="py-3.5 px-3 whitespace-nowrap">เลขที่เอกสาร</th>
                <th className="py-3.5 px-3 whitespace-nowrap">โครงการ / ปลายทาง</th>
                <th className="py-3.5 px-3 whitespace-nowrap">รายการพัสดุ</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">จำนวนรวม</th>
                <th className="py-3.5 pl-3 pr-4 text-right whitespace-nowrap">มูลค่ารวม (บาท)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
              {paginatedRows.map((r) => {
                const { date, time } = formatDateTimeParts(r.createdAt)
                const isIssue = r.kind === 'issue'
                const isReturn = r.kind === 'return'
                const uniqueUnits = [...new Set(r.items.map((it) => it.unit).filter(Boolean))]
                const totalItemsQty = r.items.reduce((s, it) => s + Number(it.quantity || 0), 0)
                const breakdownFull = r.items
                  .map((it) => `${it.name}: ${formatIntQty(it.quantity)} ${it.unit || 'ชิ้น'}`)
                  .join('\n')
                const breakdownShort = r.items
                  .map((it) => `${formatIntQty(it.quantity)} ${it.unit || 'ชิ้น'}`)
                  .join(', ')

                return (
                  <tr key={r.id} className="hover:bg-steel-50/80 dark:hover:bg-slate-800/60 transition text-xs">
                    {/* 1. วันที่และเวลา (2 บรรทัดมาตรฐาน ERP สากล) */}
                    <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                      <div className="flex flex-col text-xs leading-tight">
                        <span className="font-semibold text-steel-800 dark:text-slate-200">{date}</span>
                        <span className="flex items-center gap-1 text-[11px] text-steel-500 dark:text-slate-400 font-mono mt-0.5">
                          <Clock className="h-3 w-3 text-steel-400 dark:text-slate-500 shrink-0" />
                          {time ? `${time} น.` : ''}
                        </span>
                      </div>
                    </td>

                    {/* 2. ประเภท */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isIssue ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <ArrowUpFromLine className="h-3 w-3" />
                          <span>เบิกของ</span>
                        </span>
                      ) : isReturn ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <RotateCcw className="h-3 w-3" />
                          <span>คืนของเข้าสโตร์</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <TrendingDown className="h-3 w-3" />
                          <span>ตัดชำรุด/ปรับยอด</span>
                        </span>
                      )}
                    </td>

                    {/* 3. เลขที่เอกสาร */}
                    <td className="py-3 px-3 font-mono font-bold text-steel-900 dark:text-amber-400 whitespace-nowrap">
                      {r.code}
                    </td>

                    {/* 4. โครงการ / ปลายทาง */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {r.projectName ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-steel-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700 text-xs">
                          <Briefcase className="h-3 w-3 text-steel-500" />
                          <span className="font-bold">{r.projectCode}</span> {r.projectName}
                        </span>
                      ) : r.targetType === 'office' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-xs font-bold text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          ออฟฟิศส่วนกลาง
                        </span>
                      ) : (
                        <span className="text-steel-400 dark:text-slate-500 text-xs">ของกลางบริษัท</span>
                      )}
                    </td>

                    {/* 5. รายการพัสดุ */}
                    <td className="py-3 px-3 max-w-[260px]">
                      <div className="font-semibold text-steel-900 dark:text-slate-100 truncate" title={r.items.map((i) => i.name).join(', ')}>
                        {r.items[0]?.name || '-'}
                        {r.items.length > 1 && (
                          <span className="ml-1 text-[11px] text-steel-500 dark:text-slate-400 font-normal">
                            (+อีก {r.items.length - 1} รายการ)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. จำนวนรวม (จัดการหน่วยนับอย่างถูกต้อง ป้องกันการรวมตัวเลขข้ามหน่วย) */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {r.items.length <= 1 ? (
                        <span className="font-mono font-bold text-steel-800 dark:text-slate-200">
                          {r.items[0] ? `${formatIntQty(r.items[0].quantity)} ${r.items[0].unit || 'ชิ้น'}` : '-'}
                        </span>
                      ) : uniqueUnits.length === 1 ? (
                        /* กรณีมีหลายรายการแต่เป็นหน่วยเดียวกันทั้งหมด */
                        <div className="flex flex-col items-end leading-tight cursor-default" title={breakdownFull}>
                          <span className="font-mono font-bold text-steel-800 dark:text-slate-200">
                            {formatIntQty(totalItemsQty)} {uniqueUnits[0]}
                          </span>
                          <span className="text-[10px] text-steel-400 dark:text-slate-500 font-normal">
                            ({r.items.length} รายการ)
                          </span>
                        </div>
                      ) : (
                        /* กรณีมีหลายรายการและหน่วยต่างกัน (เช่น ตู้ + เมตร) แสดงจำนวนรายการและแจกแจงหน่วย */
                        <div className="flex flex-col items-end leading-tight cursor-default" title={breakdownFull}>
                          <span className="font-mono font-bold text-steel-900 dark:text-slate-100">
                            {r.items.length} รายการ
                          </span>
                          <span className="text-[10px] text-steel-500 dark:text-slate-400 font-mono font-normal max-w-[150px] truncate" title={breakdownFull}>
                            {breakdownShort}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 7. มูลค่ารวม */}
                    <td className="py-3 pl-3 pr-4 text-right font-mono font-bold whitespace-nowrap">
                      <span className={isReturn ? 'text-emerald-700 dark:text-emerald-400' : isIssue ? 'text-amber-800 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}>
                        {baht(r.totalAmount)} บ.
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* โหมดการ์ด (Cards View) */
        <div className="space-y-3.5">
          {paginatedRows.map((r) => {
            const isIssue = r.kind === 'issue'
            const isReturn = r.kind === 'return'
            const isAdjust = r.kind === 'adjust'

            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:border-steel-400 dark:hover:border-slate-700 hover:shadow-sm space-y-3"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-steel-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Badge ประเภทรายการ */}
                    {isIssue ? (
                      <span className="flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 text-xs font-black text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                        <span>เบิกของ</span>
                      </span>
                    ) : isReturn ? (
                      <span className="flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 text-xs font-black text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>คืนของเข้าสโตร์</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 text-xs font-black text-rose-900 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span> ตัดชำรุด/ปรับยอด</span>
                      </span>
                    )}

                    {/* เลขที่เอกสาร */}
                    <span className="rounded-lg bg-steel-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-black text-steel-900 dark:text-white border border-steel-200 dark:border-slate-700">
                      {r.code}
                    </span>

                    {/* ป้ายโครงการ / ปลายทาง */}
                    {r.projectName ? (
                      <span
                        className="flex items-center gap-1 rounded-lg bg-steel-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700 max-w-[260px] truncate"
                        title={`${r.projectCode} - ${r.projectName}`}
                      >
                        <Briefcase className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400 shrink-0" />
                        <span className="font-bold">{r.projectCode}</span>
                        <span className="text-steel-400 dark:text-slate-500">·</span>
                        <span className="truncate">{r.projectName}</span>
                      </span>
                    ) : r.targetType === 'office' ? (
                      <span className="flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>ออฟฟิศส่วนกลาง</span>
                        {r.targetLocation && <span className="font-normal">({r.targetLocation})</span>}
                      </span>
                    ) : r.targetType === 'site' ? (
                      <span className="flex items-center gap-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-1 text-xs font-bold text-cyan-900 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        <MapPin className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>หน้างาน</span>
                        {r.targetLocation && <span className="font-normal truncate max-w-[150px]">({r.targetLocation})</span>}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-lg bg-steel-50 dark:bg-slate-800 px-2 py-0.5 text-xs text-steel-600 dark:text-slate-400 border border-steel-200 dark:border-slate-700">
                        ของกลางบริษัท
                      </span>
                    )}

                    {/* วันที่และเวลาที่ทำรายการ */}
                    <span className="flex items-center gap-1 text-[11px] text-steel-500 dark:text-slate-400 font-mono">
                      <Calendar className="h-3 w-3 text-steel-400 dark:text-slate-500" />
                      <span>{r.dateTimeStr}</span>
                    </span>
                  </div>

                  {/* มูลค่ารวมของเอกสาร */}
                  <div className="text-right">
                    <span className="text-[10px] text-steel-400 dark:text-slate-400 uppercase">
                      {isIssue ? 'มูลค่าเบิก:' : isReturn ? 'มูลค่ารับคืน:' : 'มูลค่าปรับยอด:'}
                    </span>
                    <div
                      className={`font-mono text-base font-black ${
                        isReturn
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isIssue
                          ? 'text-amber-800 dark:text-amber-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {baht(r.totalAmount)} <span className="text-xs font-normal text-steel-400 dark:text-slate-400">บาท</span>
                    </div>
                  </div>
                </div>

                {/* Items Breakdown */}
                {isIssue ? (
                  /* รายการพัสดุในใบเบิก */
                  <div className="rounded-xl bg-steel-50/70 dark:bg-slate-800/80 p-3 space-y-1.5 border border-steel-100 dark:border-slate-700">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-steel-500 dark:text-slate-400">
                      รายการพัสดุที่เบิก ({r.items.length} รายการ):
                    </div>
                    <div className="divide-y divide-steel-100 dark:divide-slate-700/60">
                      {r.items.map((i, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1 text-xs text-steel-700 dark:text-slate-200"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            {i.code && (
                              <span className="font-mono text-[10px] bg-steel-200 dark:bg-slate-700 px-1 py-0.2 rounded text-steel-800 dark:text-slate-300">
                                {i.code}
                              </span>
                            )}
                            <span className="font-medium text-steel-900 dark:text-slate-100 truncate">
                              {i.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                            <span className="text-steel-600 dark:text-slate-300">
                              <b>{formatIntQty(i.quantity)}</b> {i.unit} @ {baht(i.unitCost)} บ.
                            </span>
                            <span className="font-bold text-steel-900 dark:text-slate-100 w-24 text-right">
                              {baht(i.totalCost)} บ.
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* รายการการคืน / ปรับสต็อก (แสดงสมการชัดเจน) */
                  <div className="rounded-xl bg-steel-50/70 dark:bg-slate-800/80 p-3 space-y-2 border border-steel-100 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        {r.items[0]?.code && (
                          <span className="font-mono text-[10px] bg-steel-200 dark:bg-slate-700 px-1 py-0.2 rounded font-bold text-steel-800 dark:text-slate-300">
                            {r.items[0].code}
                          </span>
                        )}
                        <span className="font-bold text-steel-900 dark:text-slate-100">
                          {r.items[0]?.name || 'พัสดุ'}
                        </span>
                      </div>

                      {/* สมการเปลี่ยนแปลงจำนวนสต็อก */}
                      <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                        <span className="rounded bg-steel-100 dark:bg-slate-700 px-2 py-0.5 text-steel-700 dark:text-slate-300 font-semibold border border-steel-200 dark:border-slate-600">
                          เดิม: {formatIntQty(r.qtyBefore)} {r.items[0]?.unit}
                        </span>
                        <span className="font-bold text-steel-400">
                          {isReturn ? '+' : '-'}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-bold ${
                            isReturn
                              ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                          }`}
                        >
                          {isReturn ? `คืน: +${formatIntQty(r.diffQty)}` : `ลด: -${formatIntQty(r.diffQty)}`}{' '}
                          {r.items[0]?.unit}
                        </span>
                        <span className="font-bold text-steel-400">=</span>
                        <span className="rounded bg-steel-200 dark:bg-slate-700 px-2 py-0.5 font-bold text-steel-900 dark:text-white">
                          คงเหลือ: {formatIntQty(r.qtyAfter)} {r.items[0]?.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Creator */}
                <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-steel-500 dark:text-slate-400 pt-1">
                  <div className="flex items-center gap-1 text-steel-400 dark:text-slate-400 shrink-0">
                    <User className="h-3 w-3" />
                    <span>ผู้บันทึก: {r.userName}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {filteredRecords.length > 0 && (
        <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-xs">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredRecords.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[5, 10, 20, 50]}
          />
        </div>
      )}
    </div>
  )
}
