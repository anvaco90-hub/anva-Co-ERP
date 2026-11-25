import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchUnifiedVendors, buildEntityLookupMap } from '../../lib/contactsSync'
import { formatBaht, formatThaiDate, calculateAging, exportToCSV } from '../../lib/accounting'
import {
  Building2, Calendar, Filter, Search, Download, RefreshCw, FileText,
  AlertCircle, CheckCircle2, ChevronRight, Check
} from 'lucide-react'

export default function ApAgingPage() {
  const today = new Date().toISOString().slice(0, 10)

  // Filters
  const [asOfDate, setAsOfDate] = useState(today)
  const [agingMethod, setAgingMethod] = useState('due_date') // 'due_date' | 'doc_date'
  const [selectedVendorId, setSelectedVendorId] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Data
  const [apList, setApList] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [apRes, vndRes] = await Promise.all([
        supabase
          .from('accounts_payable')
          .select('*, vendors(id, vendor_code, vendor_name, tax_id), purchase_orders(po_no, project_id, projects(project_code, project_name))')
          .order('due_date', { ascending: true }),
        fetchUnifiedVendors().catch(() => []),
      ]).then(([rawApRes, unifiedVnds]) => {
        const vndList = unifiedVnds || []
        const vndMap = buildEntityLookupMap(vndList)
        const enriched = (rawApRes?.data || []).map((ap) => {
          const matched =
            vndMap.get(ap.vendor_id) ||
            vndMap.get(ap.contact_id) ||
            null
          return {
            ...ap,
            vendor_id: ap.vendor_id || matched?.id || null,
            vendors: ap.vendors || matched || null,
          }
        })
        return [
          { ...rawApRes, data: enriched },
          { data: vndList, error: null },
        ]
      })

      setApList(apRes.data || [])
      setVendors(vndRes.data || [])
    } catch (err) {
      console.error('Error loading AP aging data:', err)
      setToastMsg({ text: 'ไม่สามารถโหลดข้อมูลเจ้าหนี้ได้', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Process AP list into aging buckets
  const agingRows = useMemo(() => {
    return apList
      .filter((ap) => {
        const remaining = Number(ap.remaining_amount ?? ap.total_debt ?? 0)
        if (remaining <= 0.01) return false // Already fully paid
        if (selectedVendorId !== 'ALL' && ap.vendor_id !== selectedVendorId) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matchNo = (ap.po_no || ap.invoice_no || '').toLowerCase().includes(q)
          const matchVnd = (ap.vendor_name || ap.vendors?.vendor_name || '').toLowerCase().includes(q)
          const matchPrj = (ap.purchase_orders?.projects?.project_code || '').toLowerCase().includes(q)
          if (!matchNo && !matchVnd && !matchPrj) return false
        }
        return true
      })
      .map((ap) => {
        const remaining = Number(ap.remaining_amount ?? ap.total_debt ?? 0)
        const docDate = ap.created_at ? ap.created_at.slice(0, 10) : ap.due_date
        const targetDate = agingMethod === 'due_date' ? ap.due_date : docDate
        const { diffDays, bucket } = calculateAging(targetDate, asOfDate)

        return {
          id: ap.id,
          doc_no: ap.po_no || ap.invoice_no || 'AP-DOC',
          doc_date: docDate,
          due_date: ap.due_date,
          credit_days: ap.credit_days || 30,
          vendor_name: ap.vendor_name || ap.vendors?.vendor_name || 'ผู้จำหน่าย/คู่ค้า',
          vendor_tax_id: ap.vendors?.tax_id || '-',
          project_code: ap.purchase_orders?.projects?.project_code || 'ส่วนกลาง',
          total_debt: Number(ap.total_debt || 0),
          paid_amount: Number(ap.paid_amount || 0),
          remaining,
          diffDays,
          bucket,
          current: bucket === 'current' ? remaining : 0,
          d1_30: bucket === '1-30' ? remaining : 0,
          d31_60: bucket === '31-60' ? remaining : 0,
          d61_90: bucket === '61-90' ? remaining : 0,
          over90: bucket === 'over90' ? remaining : 0,
        }
      })
  }, [apList, selectedVendorId, searchQuery, agingMethod, asOfDate])

  // Aggregate totals
  const totals = useMemo(() => {
    return agingRows.reduce(
      (acc, row) => ({
        current: acc.current + row.current,
        d1_30: acc.d1_30 + row.d1_30,
        d31_60: acc.d31_60 + row.d31_60,
        d61_90: acc.d61_90 + row.d61_90,
        over90: acc.over90 + row.over90,
        remaining: acc.remaining + row.remaining,
      }),
      { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0, remaining: 0 }
    )
  }, [agingRows])

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const headers = [
      'เลขที่เอกสาร/PO',
      'วันที่บันทึก',
      'วันครบกำหนดชำระ',
      'ชื่อผู้จำหน่าย/คู่ค้า',
      'โครงการ',
      'ยอดหนี้รวม',
      'เกินกำหนด (วัน)',
      'ยังไม่ครบกำหนด',
      'เกิน 1-30 วัน',
      'เกิน 31-60 วัน',
      'เกิน 61-90 วัน',
      'เกินกว่า 90 วัน',
      'ยอดคงค้างจ่ายสุทธิ',
    ]

    const rows = agingRows.map((r) => [
      r.doc_no,
      r.doc_date,
      r.due_date,
      r.vendor_name,
      r.project_code,
      r.total_debt,
      r.diffDays > 0 ? r.diffDays : 0,
      r.current,
      r.d1_30,
      r.d31_60,
      r.d61_90,
      r.over90,
      r.remaining,
    ])

    exportToCSV(`AP_Aging_Report_${asOfDate}`, headers, rows)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-steel-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Building2 className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold text-ink">
              รายงานเจ้าหนี้ตามเอกสาร (Accounts Payable Aging Report)
            </h1>
          </div>
          <p className="text-xs text-steel-500 mt-1">
            วิเคราะห์อายุหนี้ค้างชำระผู้จำหน่ายและผู้รับเหมาเพื่อวางแผนกระแสเงินสดจ่ายและรักษาเครดิตเทอม
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 shadow transition"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </button>
        </div>
      </div>

      {toastMsg.text && (
        <div className="p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          {toastMsg.text}
        </div>
      )}

      {/* KPI Cards (Aging Buckets) */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        <div className="p-3 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-[10px] text-steel-500 font-medium">ยอดหนี้ AP รวม (Total AP)</div>
          <div className="text-base font-bold text-ink font-mono mt-0.5">{formatBaht(totals.remaining)}</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[10px] text-emerald-700 font-medium">ยังไม่ครบกำหนด (Current)</div>
          <div className="text-base font-bold text-emerald-800 font-mono mt-0.5">{formatBaht(totals.current)}</div>
        </div>
        <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 shadow-sm">
          <div className="text-[10px] text-sky-700 font-medium">เกิน 1-30 วัน</div>
          <div className="text-base font-bold text-sky-800 font-mono mt-0.5">{formatBaht(totals.d1_30)}</div>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-[10px] text-amber-700 font-medium">เกิน 31-60 วัน</div>
          <div className="text-base font-bold text-amber-800 font-mono mt-0.5">{formatBaht(totals.d31_60)}</div>
        </div>
        <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 shadow-sm">
          <div className="text-[10px] text-orange-700 font-medium">เกิน 61-90 วัน</div>
          <div className="text-base font-bold text-orange-800 font-mono mt-0.5">{formatBaht(totals.d61_90)}</div>
        </div>
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 shadow-sm">
          <div className="text-[10px] text-rose-700 font-medium">มากกว่า 90 วัน</div>
          <div className="text-base font-bold text-rose-800 font-mono mt-0.5">{formatBaht(totals.over90)}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-steel-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* As of Date */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-steel-700 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-steel-500" /> ณ วันที่:
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-2.5 py-1.5 border border-steel-200 rounded-lg text-xs font-medium text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Aging Method */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-steel-700">วิเคราะห์อายุ:</span>
            <select
              value={agingMethod}
              onChange={(e) => setAgingMethod(e.target.value)}
              className="px-2.5 py-1.5 border border-steel-200 rounded-lg text-xs font-semibold text-ink bg-white"
            >
              <option value="due_date">ตามวันที่ครบกำหนด (Due Date)</option>
              <option value="doc_date">ตามวันที่เอกสาร (Document Date)</option>
            </select>
          </div>

          {/* Vendor Selection */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-steel-700">ผู้จำหน่าย:</span>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="px-2.5 py-1.5 border border-steel-200 rounded-lg text-xs text-ink bg-white max-w-[220px]"
            >
              <option value="ALL">ทุกผู้จำหน่าย (All Vendors)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-steel-400" />
          <input
            type="text"
            placeholder="ค้นหาเลขที่, ผู้จำหน่าย..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-steel-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* AP Aging Table */}
      <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-steel-600">
            <thead className="bg-steel-50/75 text-steel-700 border-b border-steel-200 font-semibold">
              <tr>
                <th className="px-3 py-2.5">เลขที่เอกสาร / PO</th>
                <th className="px-3 py-2.5">วันนัดชำระ</th>
                <th className="px-3 py-2.5">ผู้จำหน่าย / คู่ค้า</th>
                <th className="px-3 py-2.5">โครงการ</th>
                <th className="px-3 py-2.5 text-center">เครดิต (วัน)</th>
                <th className="px-3 py-2.5 text-center">เกิน (วัน)</th>
                <th className="px-3 py-2.5 text-right text-emerald-800">ยังไม่ครบกำหนด</th>
                <th className="px-3 py-2.5 text-right text-sky-800">1-30 วัน</th>
                <th className="px-3 py-2.5 text-right text-amber-800">31-60 วัน</th>
                <th className="px-3 py-2.5 text-right text-orange-800">61-90 วัน</th>
                <th className="px-3 py-2.5 text-right text-rose-800">&gt; 90 วัน</th>
                <th className="px-3 py-2.5 text-right font-bold text-ink">ค้างจ่ายสุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {loading ? (
                <tr>
                  <td colSpan="12" className="text-center py-12 text-steel-400">
                    กำลังโหลดข้อมูลเจ้าหนี้คงค้าง...
                  </td>
                </tr>
              ) : agingRows.length === 0 ? (
                <tr>
                  <td colSpan="12" className="text-center py-12 text-steel-400">
                    ไม่พบรายการเจ้าหนี้คงค้าง ณ วันที่เลือก
                  </td>
                </tr>
              ) : (
                agingRows.map((row) => (
                  <tr key={row.id} className="hover:bg-steel-50/40 transition">
                    <td className="px-3 py-2.5 font-mono font-bold text-sky-800">
                      {row.doc_no}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-ink">
                      {row.due_date}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink">
                      {row.vendor_name}
                    </td>
                    <td className="px-3 py-2.5 text-sky-700">
                      {row.project_code}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {row.credit_days}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold">
                      {row.diffDays > 0 ? (
                        <span className="text-rose-600">+{row.diffDays}</span>
                      ) : (
                        <span className="text-emerald-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                      {row.current > 0 ? formatBaht(row.current) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-sky-700">
                      {row.d1_30 > 0 ? formatBaht(row.d1_30) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-amber-700">
                      {row.d31_60 > 0 ? formatBaht(row.d31_60) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-orange-700">
                      {row.d61_90 > 0 ? formatBaht(row.d61_90) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-rose-700">
                      {row.over90 > 0 ? formatBaht(row.over90) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-ink bg-steel-50/50">
                      {formatBaht(row.remaining)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Grand Total Footer */}
            {agingRows.length > 0 && (
              <tfoot className="bg-steel-100/75 font-bold text-xs border-t-2 border-steel-300">
                <tr>
                  <td colSpan="6" className="px-3 py-2.5 text-right text-steel-700">
                    ยอดรวมเจ้าหนี้ทุกช่วงอายุ (Grand Total):
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {formatBaht(totals.current)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-800">
                    {formatBaht(totals.d1_30)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-800">
                    {formatBaht(totals.d31_60)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-800">
                    {formatBaht(totals.d61_90)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-800">
                    {formatBaht(totals.over90)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink text-sm bg-steel-200/50">
                    {formatBaht(totals.remaining)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

