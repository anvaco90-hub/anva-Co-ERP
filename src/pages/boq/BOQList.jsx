import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import Pagination from '../../components/Pagination'
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
      const { data, error } = await supabase
        .from('boqs')
        .select('*, projects(id, project_code, project_name)')
        .order('created_at', { ascending: false })

      if (error && error.code !== '42P01') {
        console.error(error)
      }
      setBoqs(data || [])
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
              <span>📄 ดูใบเสนอราคา</span>
            </Link>

            <Link
              to="/boq/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-4 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>+ สร้าง BOQ ใหม่</span>
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
            <span className="text-xs">💰</span>
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
          <div className="py-12 text-center text-xs text-steel-400">
            กำลังโหลดข้อมูล BOQ...
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-steel-50 text-steel-600 font-semibold border-b border-steel-200">
                <tr>
                  <th className="py-2.5 px-3">เลขที่ BOQ</th>
                  <th className="py-2.5 px-3">ชื่องาน / รายละเอียดโครงการ</th>
                  <th className="py-2.5 px-3">ลูกค้า / โครงการ</th>
                  <th className="py-2.5 px-3 text-right">ขนาด (kWp)</th>
                  <th className="py-2.5 px-3 text-right">ค่าวัสดุ</th>
                  <th className="py-2.5 px-3 text-right">ค่าแรง</th>
                  <th className="py-2.5 px-3 text-right">ราคาเสนอขาย (สุทธิ)</th>
                  <th className="py-2.5 px-3 text-center">สถานะ</th>
                  <th className="py-2.5 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {paginatedBoqs.map((b) => {
                  const st = STATUS_MAP[b.status] || {
                    label: b.status,
                    color: 'bg-steel-100 text-steel-700 border-steel-200',
                  }
                  return (
                    <tr key={b.id} className="hover:bg-steel-50/60 transition">
                      <td className="py-3 px-3 font-mono font-bold text-sky-900">
                        <Link to={`/boq/${b.id}`} className="hover:underline">
                          {b.boq_no}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-steel-900">{b.title}</div>
                        <div className="text-[11px] text-steel-500 line-clamp-1">
                          {b.notes || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-steel-800">
                          {b.customer_name || '-'}
                        </div>
                        {b.projects && (
                          <div className="text-[10px] text-sky-700 font-mono">
                            [{b.projects.project_code}] {b.projects.project_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-700">
                        {Number(b.system_size_kwp || 0) > 0
                          ? `${Number(b.system_size_kwp).toLocaleString()} kWp`
                          : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-steel-600">
                        {baht(b.total_material_cost || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-steel-600">
                        {baht(b.total_labor_cost || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-800 text-sm">
                        {baht(b.grand_total || 0)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            to={`/boq/${b.id}`}
                            className="rounded-lg bg-steel-100 hover:bg-steel-200 text-steel-800 px-2.5 py-1 text-xs font-bold transition flex items-center gap-1"
                          >
                            <span>ดู</span>
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
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

