import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import Pagination from '../../components/Pagination'
import SkeletonTable from '../../components/common/SkeletonTable'
import {
  FileSpreadsheet,
  Plus,
  Search,
  ArrowRight,
  Sun,
  Layers,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  Eye,
} from 'lucide-react'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  approved: { label: 'อนุมัติแล้ว (Approved)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  converted_to_quotation: { label: 'เปิดใบเสนอราคาแล้ว', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  archived: { label: 'เก็บถาวร', color: 'bg-steel-100 text-steel-500 border-steel-200' },
}

export default function BOQList() {
  const navigate = useNavigate()
  const [boqs, setBoqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10) // 10 | 20 | 50

  const fetchBOQs = async () => {
    setLoading(true)
    try {
      // ดึงข้อมูล boqs และ projects ควบคู่กัน (แก้ปัญหา PostgREST Foreign Key Relationship Error: PGRST200)
      const [boqsRes, projectsRes] = await Promise.all([
        supabase.from('boqs').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name'),
      ])

      if (boqsRes.error && boqsRes.error.code !== '42P01') {
        console.error(boqsRes.error)
      }

      const projMap = new Map((projectsRes.data || []).map((p) => [p.id, p]))
      const merged = (boqsRes.data || []).map((b) => ({
        ...b,
        projects: projMap.get(b.project_id) || null,
      }))

      setBoqs(merged)
    } catch (err) {
      console.error('Failed to load BOQs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBOQs()
  }, [])

  const filtered = boqs.filter((b) => {
    const q = search.trim().toLowerCase()
    const matchSearch =
      !q ||
      b.boq_no?.toLowerCase().includes(q) ||
      b.title?.toLowerCase().includes(q) ||
      b.customer_name?.toLowerCase().includes(q) ||
      b.projects?.project_name?.toLowerCase().includes(q)

    const matchStatus = filterStatus === 'all' || b.status === filterStatus
    return matchSearch && matchStatus
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterStatus])

  const paginatedBoqs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  // สรุปยอด
  const totalValue = boqs.reduce((s, b) => s + Number(b.grand_total || 0), 0)
  const totalKwp = boqs.reduce((s, b) => s + Number(b.system_size_kwp || 0), 0)

  return (
    <div className="space-y-6 font-sans text-slate-800">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                BILL OF QUANTITIES
              </span>
              <span className="text-xs text-steel-300">
                ระบบถอดแบบและประมาณราคาต้นทุนวิศวกรรม
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-hivis" />
              <span>ระบบ BOQ โซล่าเซลล์ & ก่อสร้าง (BOQ Management)</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-300">
              คำนวณแยกค่าวัสดุ + ค่าแรง + มาร์กอัปกำไร พร้อมแปลงเป็นใบเสนอราคาและใบสั่งซื้อในคลิกเดียว
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Link
              to="/quotations"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 text-steel-200 border border-steel-600 px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <span>ดูใบเสนอราคา</span>
            </Link>

            <Link
              to="/boq/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-4 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span> สร้าง BOQ ใหม่</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-steel-500 font-bold uppercase">
            <span>จำนวน BOQ ทั้งหมด</span>
            <Layers className="h-4 w-4 text-steel-400" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-steel-900">
            {boqs.length} <span className="text-xs font-normal text-steel-500">โครงการ</span>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-amber-700 font-bold uppercase">
            <span>กำลังผลิตติดตั้งรวม (Total kWp)</span>
            <Sun className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-amber-700">
            {totalKwp.toLocaleString()} <span className="text-xs font-normal text-steel-500">kWp</span>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-emerald-800 font-bold uppercase">
            <span>มูลค่าเสนอขายรวมทั้งสิ้น</span>
            <span className="text-xs"></span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-emerald-700">
            {baht(totalValue)} <span className="text-xs font-normal text-steel-500">บาท</span>
          </div>
        </div>
      </div>

      {/* 3. Search and Filters */}
      <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ BOQ, ชื่องาน, ลูกค้า..."
              className="w-full rounded-xl border border-steel-300 bg-steel-50/50 pl-9 pr-3.5 py-2 text-xs font-medium text-steel-900 focus:bg-white focus:border-steel-900 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <select
              className="rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs font-semibold text-steel-700"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="draft">ฉบับร่าง (Draft)</option>
              <option value="approved">อนุมัติแล้ว (Approved)</option>
              <option value="converted_to_quotation">เปิดใบเสนอราคาแล้ว</option>
            </select>
          </div>
        </div>

        {/* Table List */}
        {loading ? (
          <div className="rounded-xl border border-steel-200 overflow-hidden">
            <SkeletonTable rows={5} cols={9} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-steel-400 border border-dashed border-steel-200 rounded-xl space-y-2">
            <div>ยังไม่มีรายการ BOQ ในระบบ</div>
            <Link
              to="/boq/new"
              className="inline-block text-xs font-bold text-sky-600 hover:underline"
            >
              + คลิกเพื่อเริ่มสร้าง BOQ โครงการแรก
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <table className="table-auto w-full text-xs min-w-[950px] divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
              <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่ BOQ</th>
                  <th className="py-3.5 px-3.5 min-w-[200px] border-r border-slate-200/70 dark:border-slate-700/60">ชื่องาน / รายละเอียดโครงการ</th>
                  <th className="py-3.5 px-3.5 min-w-[180px] border-r border-slate-200/70 dark:border-slate-700/60">ลูกค้า / โครงการ</th>
                  <th className="py-3.5 px-3 text-center w-28 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ขนาด (kWp)</th>
                  <th className="py-3.5 px-3 text-right w-28 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ค่าวัสดุ</th>
                  <th className="py-3.5 px-3 text-right w-28 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ค่าแรง</th>
                  <th className="py-3.5 px-3.5 text-right w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">ราคาเสนอขาย (สุทธิ)</th>
                  <th className="py-3.5 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">สถานะ</th>
                  <th className="py-3.5 px-3 text-center w-28 whitespace-nowrap">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {paginatedBoqs.map((b, rowIdx) => {
                  const st = STATUS_MAP[b.status] || {
                    label: b.status,
                    color: 'bg-slate-100 text-slate-700 border-slate-300',
                  }
                  return (
                    <tr
                      key={b.id}
                      onClick={() => navigate(`/boq/${b.id}`)}
                      className={`transition-colors border-b border-slate-200 dark:border-slate-800 cursor-pointer ${
                        rowIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } hover:!bg-amber-50/80 dark:hover:!bg-slate-800/90`}
                    >
                      {/* 1. เลขที่ BOQ */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-sky-800 dark:text-sky-400 whitespace-nowrap align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <span className="hover:underline">
                          {b.boq_no}
                        </span>
                      </td>

                      {/* 2. ชื่องาน / รายละเอียดโครงการ */}
                      <td className="py-3 px-3.5 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]" title={b.title}>
                          {b.title}
                        </div>
                        {b.notes && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[220px] mt-0.5" title={b.notes}>
                            {b.notes}
                          </div>
                        )}
                      </td>

                      {/* 3. ลูกค้า / โครงการ */}
                      <td className="py-3 px-3.5 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={b.customer_name}>
                          {b.customer_name || '-'}
                        </div>
                        {b.projects && (
                          <div className="text-[11px] text-sky-700 dark:text-sky-300 font-mono truncate max-w-[200px] mt-0.5" title={`[${b.projects.project_code}] ${b.projects.project_name}`}>
                            [{b.projects.project_code}] {b.projects.project_name}
                          </div>
                        )}
                      </td>

                      {/* 4. ขนาด (kWp) */}
                      <td className="py-3 px-3 text-center align-middle border-r border-slate-200/60 dark:border-slate-800/60 whitespace-nowrap font-mono font-bold text-amber-700 dark:text-amber-400">
                        {Number(b.system_size_kwp || 0) > 0
                          ? `${Number(b.system_size_kwp).toLocaleString()} kWp`
                          : '-'}
                      </td>

                      {/* 5. ค่าวัสดุ */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300 align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                        {baht(b.total_material_cost || 0)}
                      </td>

                      {/* 6. ค่าแรง */}
                      <td className="py-3 px-3 text-right font-mono text-amber-800 dark:text-amber-400 align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                        {baht(b.total_labor_cost || 0)}
                      </td>

                      {/* 7. ราคาเสนอขาย (สุทธิ) */}
                      <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                        ฿{baht(b.grand_total || 0)}
                      </td>

                      {/* 8. สถานะ */}
                      <td className="py-3 px-3 text-center align-middle border-r border-slate-200/60 dark:border-slate-800/60 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>

                      {/* 9. การจัดการ */}
                      <td className="py-3 px-3 text-center whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => navigate(`/boq/${b.id}`)}
                          className="inline-flex items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 p-2 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                          title="ดูรายละเอียด BOQ"
                        >
                          <Eye className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl border border-steel-200 bg-white px-5 py-3 shadow-xs mt-4">
            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize)
                setCurrentPage(1)
              }}
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        )}
      </div>
    </div>
  )
}

