import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  fetchUnifiedCustomers,
  buildEntityLookupMap,
  ensureLegacyCustomerId,
  ensureContactIdForEntity,
} from '../../lib/contactsSync'
import { formatBaht, formatThaiDate, calculateAging, exportToCSV } from '../../lib/accounting'
import {
  Users, Calendar, Filter, Search, Download, Plus, RefreshCw, FileText,
  AlertCircle, CheckCircle2, ChevronRight, Check
} from 'lucide-react'

export default function ArAgingPage() {
  const today = new Date().toISOString().slice(0, 10)

  // Filters
  const [asOfDate, setAsOfDate] = useState(today)
  const [agingMethod, setAgingMethod] = useState('due_date') // 'due_date' | 'doc_date'
  const [selectedCustomerId, setSelectedCustomerId] = useState('ALL')
  const [showInvoicesOnly, setShowInvoicesOnly] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Data
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [invRes, custRes, prjRes] = await Promise.all([
        supabase
          .from('sales_invoices')
          .select('*, projects(project_code, project_name)')
          .order('issue_date', { ascending: false }),
        fetchUnifiedCustomers().catch(() => []),
        supabase
          .from('projects')
          .select('id, project_code, project_name')
          .order('project_code'),
      ]).then(([rawInvRes, unifiedCusts, rawPrjRes]) => {
        const custList = unifiedCusts || []
        const custMap = buildEntityLookupMap(custList)
        const enriched = (rawInvRes?.data || []).map((inv) => {
          const matched =
            custMap.get(inv.customer_id) ||
            custMap.get(inv.contact_id) ||
            null
          return {
            ...inv,
            customer_id: inv.customer_id || matched?.id || null,
            customers: matched
              ? { ...matched, company_name: matched.name }
              : inv.customers || null,
          }
        })
        return [
          { ...rawInvRes, data: enriched },
          { data: custList, error: null },
          rawPrjRes,
        ]
      })

      setInvoices(invRes.data || [])
      setCustomers(custRes.data || [])
      setProjects(prjRes?.data || [])
    } catch (err) {
      console.error('Error loading AR aging data:', err)
      setToastMsg({ text: 'ไม่สามารถโหลดข้อมูลลูกหนี้ได้', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Process invoices and calculate aging buckets
  const agingRows = useMemo(() => {
    return invoices
      .filter((inv) => {
        // Exclude fully paid or cancelled unless wanted
        if (inv.status === 'ยกเลิก' || inv.status === 'เก็บเงินแล้ว') return false
        if (selectedCustomerId !== 'ALL' && inv.customer_id !== selectedCustomerId) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matchNo = (inv.invoice_no || '').toLowerCase().includes(q)
          const matchCust = (inv.customers?.company_name || '').toLowerCase().includes(q)
          const matchPrj = (inv.projects?.project_code || '').toLowerCase().includes(q)
          if (!matchNo && !matchCust && !matchPrj) return false
        }
        return true
      })
      .map((inv) => {
        const outstanding = Number(inv.remaining_amount ?? inv.total_amount ?? 0)
        const targetDate = agingMethod === 'due_date' ? (inv.due_date || inv.issue_date) : inv.issue_date
        const { diffDays, bucket } = calculateAging(targetDate, asOfDate)

        return {
          id: inv.id,
          invoice_no: inv.invoice_no,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          customer_name: inv.customers?.company_name || 'ลูกค้าทั่วไป',
          customer_tax_id: inv.customers?.tax_id || '-',
          project_code: inv.projects?.project_code || '-',
          is_opening_balance: inv.is_opening_balance,
          total_amount: Number(inv.total_amount || 0),
          paid_amount: Number(inv.paid_amount || 0),
          outstanding,
          diffDays,
          bucket,
          current: bucket === 'current' ? outstanding : 0,
          d1_30: bucket === '1-30' ? outstanding : 0,
          d31_60: bucket === '31-60' ? outstanding : 0,
          d61_90: bucket === '61-90' ? outstanding : 0,
          over90: bucket === 'over90' ? outstanding : 0,
        }
      })
  }, [invoices, selectedCustomerId, searchQuery, agingMethod, asOfDate])

  // Aggregate totals
  const totals = useMemo(() => {
    return agingRows.reduce(
      (acc, row) => ({
        current: acc.current + row.current,
        d1_30: acc.d1_30 + row.d1_30,
        d31_60: acc.d31_60 + row.d31_60,
        d61_90: acc.d61_90 + row.d61_90,
        over90: acc.over90 + row.over90,
        outstanding: acc.outstanding + row.outstanding,
      }),
      { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0, outstanding: 0 }
    )
  }, [agingRows])

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const headers = [
      'เลขที่เอกสาร',
      'วันที่เอกสาร',
      'วันครบกำหนด',
      'ชื่อลูกค้า',
      'โครงการ',
      'ยอดหนี้รวม',
      'เกินกำหนด (วัน)',
      'ยังไม่ครบกำหนด',
      'เกิน 1-30 วัน',
      'เกิน 31-60 วัน',
      'เกิน 61-90 วัน',
      'เกินกว่า 90 วัน',
      'ยอดค้างรับสุทธิ',
    ]

    const rows = agingRows.map((r) => [
      r.invoice_no,
      r.issue_date,
      r.due_date,
      r.customer_name,
      r.project_code,
      r.total_amount,
      r.diffDays > 0 ? r.diffDays : 0,
      r.current,
      r.d1_30,
      r.d31_60,
      r.d61_90,
      r.over90,
      r.outstanding,
    ])

    exportToCSV(`AR_Aging_Report_${asOfDate}`, headers, rows)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-steel-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Users className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold text-ink">
              รายงานลูกหนี้ตามเอกสาร (Accounts Receivable Aging Report)
            </h1>
          </div>
          <p className="text-xs text-steel-500 mt-1">
            วิเคราะห์อายุหนี้คงค้างของลูกค้าเพื่อบริหารสภาพคล่องทางการเงินและเร่งรัดหนี้สิน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOpeningModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-steel-300 text-steel-700 rounded-lg text-xs font-bold hover:bg-steel-50 shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5 text-sky-700" />
            บันทึกค่าเริ่มต้น (Opening Balance)
          </button>
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
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{toastMsg.text}</span>
          <button onClick={() => setToastMsg({ text: '', type: '' })} className="text-xs"></button>
        </div>
      )}

      {/* KPI Cards (Aging Buckets) */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        <div className="p-3 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-[10px] text-steel-500 font-medium">ยอดลูกหนี้รวม (Total AR)</div>
          <div className="text-base font-bold text-ink font-mono mt-0.5">{formatBaht(totals.outstanding)}</div>
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

          {/* Customer Selection */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-steel-700">ลูกค้า:</span>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="px-2.5 py-1.5 border border-steel-200 rounded-lg text-xs text-ink bg-white max-w-[200px]"
            >
              <option value="ALL">ทุกลูกค้า (All Customers)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Checkbox */}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-steel-700 font-medium">
            <input
              type="checkbox"
              checked={showInvoicesOnly}
              onChange={(e) => setShowInvoicesOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-steel-300 text-sky-600 focus:ring-sky-500"
            />
            <span>แสดงเอกสารใบแจ้งหนี้ / ใบวางบิล</span>
          </label>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-steel-400" />
          <input
            type="text"
            placeholder="ค้นหาเลขที่, ลูกค้า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-steel-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* AR Aging Table */}
      <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-steel-600">
            <thead className="bg-steel-50/75 text-steel-700 border-b border-steel-200 font-semibold">
              <tr>
                <th className="px-3 py-2.5">เลขที่เอกสาร</th>
                <th className="px-3 py-2.5">วันที่เอกสาร</th>
                <th className="px-3 py-2.5">ครบกำหนด</th>
                <th className="px-3 py-2.5">ชื่อลูกค้า / โครงการ</th>
                <th className="px-3 py-2.5 text-center">เกิน (วัน)</th>
                <th className="px-3 py-2.5 text-right text-emerald-800">ยังไม่ครบกำหนด</th>
                <th className="px-3 py-2.5 text-right text-sky-800">1-30 วัน</th>
                <th className="px-3 py-2.5 text-right text-amber-800">31-60 วัน</th>
                <th className="px-3 py-2.5 text-right text-orange-800">61-90 วัน</th>
                <th className="px-3 py-2.5 text-right text-rose-800">&gt; 90 วัน</th>
                <th className="px-3 py-2.5 text-right font-bold text-ink">ค้างรับสุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {loading ? (
                <tr>
                  <td colSpan="11" className="text-center py-12 text-steel-400">
                    กำลังโหลดข้อมูลลูกหนี้คงค้าง...
                  </td>
                </tr>
              ) : agingRows.length === 0 ? (
                <tr>
                  <td colSpan="11" className="text-center py-12 text-steel-400">
                    ไม่พบรายการลูกหนี้คงค้าง ณ วันที่เลือก
                  </td>
                </tr>
              ) : (
                agingRows.map((row) => (
                  <tr key={row.id} className="hover:bg-steel-50/40 transition">
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-sky-800 block">{row.invoice_no}</span>
                      {row.is_opening_balance && (
                        <span className="text-[9px] bg-purple-100 text-purple-800 px-1 rounded font-bold">
                          ยอดยกมา
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatThaiDate(row.issue_date, false)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{row.due_date || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-ink block">{row.customer_name}</span>
                      <span className="text-[10px] text-sky-700">{row.project_code}</span>
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
                      {formatBaht(row.outstanding)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Grand Total Footer */}
            {agingRows.length > 0 && (
              <tfoot className="bg-steel-100/75 font-bold text-xs border-t-2 border-steel-300">
                <tr>
                  <td colSpan="5" className="px-3 py-2.5 text-right text-steel-700">
                    ยอดรวมลูกหนี้ทุกช่วงอายุ (Grand Total):
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
                    {formatBaht(totals.outstanding)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Opening Balance Modal */}
      {showOpeningModal && (
        <ArOpeningBalanceModal
          isOpen={showOpeningModal}
          onClose={() => setShowOpeningModal(false)}
          onSuccess={() => {
            setShowOpeningModal(false)
            loadData()
            setToastMsg({ text: 'บันทึกยอดยกมาลูกหนี้เริ่มต้นสำเร็จ', type: 'success' })
          }}
          customers={customers}
        />
      )}
    </div>
  )
}

/**
 * Modal to enter initial AR Opening Balance
 */
function ArOpeningBalanceModal({ isOpen, onClose, onSuccess, customers = [] }) {
  if (!isOpen) return null

  const today = new Date().toISOString().slice(0, 10)
  const [docNo, setDocNo] = useState(`AR-INIT-${Math.floor(1000 + Math.random() * 9000)}`)
  const [customerId, setCustomerId] = useState(customers[0]?.id || '')
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('ยอดยกมาลูกหนี้ต้นงวด')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const numAmount = Number(amount) || 0
    if (numAmount <= 0) {
      return setError('กรุณาระบุจำนวนเงินค้างรับที่ถูกต้อง')
    }
    if (!customerId) {
      return setError('กรุณาเลือกลูกค้า')
    }

    setSaving(true)
    try {
      const selectedCust = customers.find((c) => c.id === customerId)
      const resolvedCustomerId = await ensureLegacyCustomerId(selectedCust || customerId)
      const resolvedContactId = await ensureContactIdForEntity(selectedCust || customerId, 'customer')

      const { error: insErr } = await supabase.from('sales_invoices').insert({
        invoice_no: docNo,
        customer_id: resolvedCustomerId || customerId,
        contact_id: resolvedContactId || null,
        issue_date: issueDate,
        due_date: dueDate,
        subtotal: numAmount,
        total_amount: numAmount,
        remaining_amount: numAmount,
        paid_amount: 0,
        vat_amount: 0,
        is_opening_balance: true,
        status: 'รอเก็บเงิน',
        notes: notes.trim(),
      })

      if (insErr) throw insErr
      onSuccess()
    } catch (err) {
      console.error('Error inserting AR opening balance:', err)
      setError(err.message || 'บันทึกยอดยกมาไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-steel-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-800 font-bold">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-ink text-base">
                บันทึกยอดยกมาลูกหนี้เริ่มต้น (Opening AR Balance)
              </h3>
              <p className="text-xs text-steel-500">
                นำเข้าหนี้ค้างรับก่อนเริ่มใช้ระบบ ERP เพื่อวิเคราะห์อายุหนี้ได้อย่างต่อเนื่อง
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 text-sm"></button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-steel-700 block mb-1">เลือกลูกค้า (Customer) *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500 bg-white"
            >
              <option value="">-- เลือกลูกค้า --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-steel-700 block mb-1">เลขที่เอกสารอ้างอิง *</label>
              <input
                type="text"
                required
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">ยอดเงินค้างชำระ (บาท) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-steel-700 block mb-1">วันที่เอกสารเดิม *</label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">วันครบกำหนดชำระ *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-steel-700 block mb-1">หมายเหตุ / คำอธิบาย</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-steel-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-steel-300 text-steel-600 rounded-lg hover:bg-steel-50 font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : ' บันทึกยอดยกมา'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

