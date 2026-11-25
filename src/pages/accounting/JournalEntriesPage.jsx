import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { formatBaht, formatThaiDate } from '../../lib/accounting'
import Pagination from '../../components/Pagination'
import {
  BookOpen, Plus, CheckCircle2, Lock, AlertCircle, ChevronDown, ChevronRight,
  Search, Filter, RefreshCw, FileText, Check, Trash2, Calendar
} from 'lucide-react'

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState([])
  const [coaList, setCoaList] = useState([])
  const [projects, setProjects] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'รอดำเนินการ' | 'อนุมัติแล้ว'
  const [refTypeFilter, setRefTypeFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 10 | 15 | 30 | 50
  const [showManualModal, setShowManualModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [jvRes, coaRes, prjRes, cntRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select(`
            *,
            projects(project_code, project_name),
            journal_entry_lines(
              id, account_id, contact_id, debit, credit, line_description,
              chart_of_accounts(account_code, account_name_th, account_category)
            )
          `)
          .order('entry_date', { ascending: false })
          .order('entry_no', { ascending: false }),
        supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('account_code'),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('contacts').select('id, company_name, contact_type').order('company_name'),
      ])

      const cntMap = new Map((cntRes.data || []).map((c) => [c.id, c]))
      const enrichedEntries = (jvRes.data || []).map((e) => ({
        ...e,
        journal_entry_lines: (e.journal_entry_lines || []).map((l) => ({
          ...l,
          contacts: l.contact_id ? cntMap.get(l.contact_id) || null : null,
        })),
      }))

      setEntries(enrichedEntries)
      setCoaList(coaRes.data || [])
      setProjects(prjRes.data || [])
      setContacts(cntRes.data || [])
    } catch (err) {
      console.error('Error loading Journal Entries:', err)
      setToastMsg({ text: 'ไม่สามารถโหลดข้อมูลสมุดรายวันได้', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Action: Approve Entry (Lock and Post to GL)
  const handleApproveEntry = async (entry) => {
    setActionLoading(entry.id)
    setToastMsg({ text: '', type: '' })
    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({
          accounting_status: 'อนุมัติแล้ว',
          approved_at: new Date().toISOString(),
        })
        .eq('id', entry.id)

      if (error) throw error

      setToastMsg({ text: `อนุมัติลงบัญชีรายการ ${entry.entry_no} เรียบร้อยแล้ว`, type: 'success' })
      loadData()
    } catch (err) {
      console.error('Error approving entry:', err)
      setToastMsg({
        text: err.message || 'ไม่สามารถอนุมัติได้ (ตรวจสอบความสมดุลเดบิต-เครดิต)',
        type: 'error',
      })
    } finally {
      setActionLoading(null)
    }
  }

  // Filter entries
  const filteredEntries = entries.filter((e) => {
    if (statusFilter !== 'ALL' && e.accounting_status !== statusFilter) return false
    if (refTypeFilter !== 'ALL' && e.reference_type !== refTypeFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchNo = (e.entry_no || '').toLowerCase().includes(q)
      const matchDesc = (e.description || '').toLowerCase().includes(q)
      const matchPrj = (e.projects?.project_code || '').toLowerCase().includes(q) ||
                       (e.projects?.project_name || '').toLowerCase().includes(q)
      const matchLines = (e.journal_entry_lines || []).some((l) =>
        (l.chart_of_accounts?.account_name_th || '').toLowerCase().includes(q) ||
        (l.chart_of_accounts?.account_code || '').toLowerCase().includes(q)
      )
      return matchNo || matchDesc || matchPrj || matchLines
    }
    return true
  })

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองหรือคำค้นหาเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, refTypeFilter])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredEntries.slice(start, start + pageSize)
  }, [filteredEntries, currentPage, pageSize])

  // Calculations for summary stats
  const totalApproved = entries.filter((e) => e.accounting_status === 'อนุมัติแล้ว').length
  const totalPending = entries.filter((e) => e.accounting_status === 'รอดำเนินการ').length
  const grandDebit = filteredEntries.reduce((sum, e) => {
    const lines = e.journal_entry_lines || []
    return sum + lines.reduce((s, l) => s + Number(l.debit || 0), 0)
  }, 0)

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-steel-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <BookOpen className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold text-ink">
              สมุดรายวันและตรวจสอบเอกสารบัญชี (Journal Entries & Accounting Approval)
            </h1>
          </div>
          <p className="text-xs text-steel-500 mt-1">
            ศูนย์ตรวจสอบความถูกต้องของรายการบัญชีคู่ (Double-Entry Bookkeeping) และอนุมัติผ่านรายการทั่วไป
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 shadow transition"
          >
            <Plus className="h-4 w-4" />
            สร้างสมุดรายวันทั่วไป (Manual JV)
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-[11px] text-steel-500 font-medium">รายการทั้งหมดในระบบ</div>
          <div className="text-lg font-bold text-ink font-mono mt-0.5">{entries.length} รายการ</div>
        </div>
        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-[11px] text-amber-700 font-medium">รอดำเนินการตรวจสอบ (Pending)</div>
          <div className="text-lg font-bold text-amber-800 font-mono mt-0.5">{totalPending} รายการ</div>
        </div>
        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[11px] text-emerald-700 font-medium">อนุมัติลงบัญชีแล้ว (Posted)</div>
          <div className="text-lg font-bold text-emerald-800 font-mono mt-0.5">{totalApproved} รายการ</div>
        </div>
        <div className="p-3.5 bg-sky-50 rounded-xl border border-sky-200 shadow-sm">
          <div className="text-[11px] text-sky-700 font-medium">ยอดเดบิตรวมในมุมมองนี้</div>
          <div className="text-lg font-bold text-sky-800 font-mono mt-0.5">{formatBaht(grandDebit)}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-steel-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-steel-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ JV, คำอธิบาย, โครงการ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-steel-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-steel-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition ${statusFilter === 'ALL' ? 'bg-white text-ink shadow-sm' : 'text-steel-600'}`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setStatusFilter('รอดำเนินการ')}
              className={`px-2.5 py-1 rounded-md transition ${statusFilter === 'รอดำเนินการ' ? 'bg-amber-500 text-white shadow-sm' : 'text-steel-600'}`}
            >
              รอดำเนินการ ({totalPending})
            </button>
            <button
              onClick={() => setStatusFilter('อนุมัติแล้ว')}
              className={`px-2.5 py-1 rounded-md transition ${statusFilter === 'อนุมัติแล้ว' ? 'bg-emerald-600 text-white shadow-sm' : 'text-steel-600'}`}
            >
              อนุมัติแล้ว ({totalApproved})
            </button>
          </div>

          {/* Type Filter */}
          <select
            value={refTypeFilter}
            onChange={(e) => setRefTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-steel-200 rounded-lg bg-white font-medium text-steel-700"
          >
            <option value="ALL">ประเภทเอกสาร: ทั้งหมด</option>
            <option value="INV">INV - ขายและลูกหนี้</option>
            <option value="RI">RI - รับวัสดุเข้าสโตร์</option>
            <option value="ISS">ISS - เบิกวัสดุเข้าโครงการ/หน้างาน</option>
            <option value="ADJ">ADJ - คืนวัสดุ/ปรับปรุงสต็อก</option>
            <option value="EXP">EXP - ค่าใช้จ่าย</option>
            <option value="RC">RC - รับชำระเงิน</option>
            <option value="PAY">PAY - จ่ายชำระเงิน</option>
            <option value="MANUAL">MANUAL - ปรับปรุงทั่วไป</option>
          </select>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 text-steel-500 hover:text-sky-700 rounded-lg border border-steel-200 hover:bg-steel-50 transition"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Journal Table */}
      <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-steel-600">
            <thead className="bg-steel-50/75 text-steel-700 border-b border-steel-200 font-semibold">
              <tr>
                <th className="w-8 px-3 py-2.5"></th>
                <th className="px-3 py-2.5">เลขที่ JV</th>
                <th className="px-3 py-2.5">วันที่เอกสาร</th>
                <th className="px-3 py-2.5">ประเภท</th>
                <th className="px-3 py-2.5">เอกสารอ้างอิง</th>
                <th className="px-3 py-2.5">โครงการ (Cost Center)</th>
                <th className="px-3 py-2.5">คำอธิบายรายการ</th>
                <th className="px-3 py-2.5 text-right">เดบิต (Dr.)</th>
                <th className="px-3 py-2.5 text-right">เครดิต (Cr.)</th>
                <th className="px-3 py-2.5 text-center">สถานะบัญชี</th>
                <th className="px-3 py-2.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {loading ? (
                <tr>
                  <td colSpan="11" className="text-center py-12 text-steel-400">
                    กำลังโหลดข้อมูลสมุดรายวัน...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="11" className="text-center py-12 text-steel-400">
                    ไม่พบรายการสมุดรายวันตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry) => {
                  const lines = entry.journal_entry_lines || []
                  const totalDr = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0)
                  const totalCr = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0)
                  const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0
                  const isExpanded = expandedId === entry.id
                  const isApproved = entry.accounting_status === 'อนุมัติแล้ว'

                  // Extract reference doc from description or reference_id if available
                  const refDocDisplay = entry.reference_type === 'MANUAL'
                    ? '-'
                    : entry.reference_type

                  return (
                    <tbody key={entry.id} className="hover:bg-steel-50/30 transition">
                      <tr className={isExpanded ? 'bg-steel-50/60' : ''}>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            className="p-1 text-steel-400 hover:text-sky-700 transition"
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-sky-800">
                          {entry.entry_no}
                        </td>
                        <td className="px-3 py-2.5 text-steel-700 whitespace-nowrap">
                          {formatThaiDate(entry.entry_date)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-steel-100 text-steel-700">
                            {entry.reference_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-steel-600">
                          {refDocDisplay}
                        </td>
                        <td className="px-3 py-2.5">
                          {entry.projects?.project_code ? (
                            <span className="text-sky-700 font-semibold">
                              {entry.projects.project_code}
                            </span>
                          ) : (
                            <span className="text-steel-400">ส่วนกลางบริษัท</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink max-w-xs truncate" title={entry.description}>
                          {entry.description}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap">
                          {formatBaht(totalDr)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap">
                          {formatBaht(totalCr)}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              <Lock className="h-3 w-3" /> อนุมัติแล้ว
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              <AlertCircle className="h-3 w-3" /> รอดำเนินการ
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="text-sky-700 hover:text-sky-900 font-semibold text-[11px] underline"
                            >
                              {isExpanded ? 'ซ่อน' : 'ผัง Dr/Cr'}
                            </button>
                            {!isApproved && (
                              <button
                                onClick={() => handleApproveEntry(entry)}
                                disabled={actionLoading === entry.id || !isBalanced}
                                title={isBalanced ? 'อนุมัติลงบัญชีและล็อกรายการ' : 'ยอดเดบิตและเครดิตไม่สมดุล'}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-40 transition shadow-sm"
                              >
                                <Check className="h-3 w-3" />
                                {actionLoading === entry.id ? 'กำลังบันทึก...' : 'อนุมัติลงบัญชี'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Line-by-Line Double Entry Details */}
                      {isExpanded && (
                        <tr className="bg-steel-50/70">
                          <td colSpan="11" className="p-4">
                            <div className="bg-white rounded-xl border border-steel-200 p-3.5 shadow-sm space-y-2">
                              <div className="flex items-center justify-between border-b border-steel-100 pb-2 text-xs font-bold">
                                <span className="text-steel-800 flex items-center gap-1.5">
                                  <FileText className="h-3.5 w-3.5 text-sky-700" />
                                  คู่บัญชีแยกประเภท (Double-Entry Line Items)
                                </span>
                                <span className={isBalanced ? 'text-emerald-700 flex items-center gap-1 text-[11px]' : 'text-rose-700 font-bold text-[11px]'}>
                                  {isBalanced ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      เดบิตและเครดิตสมดุลสมบูรณ์ (Balanced)
                                    </>
                                  ) : (
                                    'ยอดเดบิตและเครดิตไม่สมดุล (Unbalanced)'
                                  )}
                                </span>
                              </div>

                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-steel-500 border-b border-steel-100 text-[10px]">
                                    <th className="py-1.5">รหัสบัญชี</th>
                                    <th className="py-1.5">ชื่อบัญชี (Account Name)</th>
                                    <th className="py-1.5">คู่ค้า / ลูกค้า</th>
                                    <th className="py-1.5">คำอธิบายบรรทัด</th>
                                    <th className="py-1.5 text-right">เดบิต (Dr.)</th>
                                    <th className="py-1.5 text-right">เครดิต (Cr.)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-steel-50">
                                  {lines.map((l) => (
                                    <tr key={l.id} className="hover:bg-steel-50/50">
                                      <td className="py-1.5 font-mono font-bold text-sky-800">
                                        {l.chart_of_accounts?.account_code}
                                      </td>
                                      <td className="py-1.5 text-steel-800 font-semibold">
                                        {l.chart_of_accounts?.account_name_th}
                                      </td>
                                      <td className="py-1.5 text-steel-600 text-[11px]">
                                        {l.contacts?.company_name || '-'}
                                      </td>
                                      <td className="py-1.5 text-steel-500 text-[11px]">
                                        {l.line_description || '-'}
                                      </td>
                                      <td className="py-1.5 text-right font-mono font-bold text-ink">
                                        {Number(l.debit) > 0 ? formatBaht(l.debit) : '-'}
                                      </td>
                                      <td className="py-1.5 text-right font-mono font-bold text-ink">
                                        {Number(l.credit) > 0 ? formatBaht(l.credit) : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="font-bold border-t border-steel-200 bg-steel-50/50">
                                    <td colSpan="4" className="py-2 text-right text-steel-700">
                                      ยอดรวมทั้งสิ้น (Total):
                                    </td>
                                    <td className="py-2 text-right font-mono text-ink">
                                      {formatBaht(totalDr)}
                                    </td>
                                    <td className="py-2 text-right font-mono text-ink">
                                      {formatBaht(totalCr)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
        {!loading && filteredEntries.length > 0 && (
          <div className="border-t border-steel-200 bg-white px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredEntries.length}
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

      {/* Modal: Create Manual JV */}
      {showManualModal && (
        <ManualJVModal
          isOpen={showManualModal}
          onClose={() => setShowManualModal(false)}
          onSuccess={() => {
            setShowManualModal(false)
            loadData()
            setToastMsg({ text: 'บันทึกสมุดรายวันทั่วไปสำเร็จ', type: 'success' })
          }}
          coaList={coaList}
          projects={projects}
          contacts={contacts}
        />
      )}
    </div>
  )
}

/**
 * Modal for Creating Manual Journal Entry (JV)
 */
function ManualJVModal({ isOpen, onClose, onSuccess, coaList = [], projects = [], contacts = [] }) {
  if (!isOpen) return null

  const today = new Date().toISOString().slice(0, 10)
  const defaultJvNo = `JV${today.replace(/-/g, '').slice(0, 6)}${Math.floor(1000 + Math.random() * 9000)}`

  const [entryNo, setEntryNo] = useState(defaultJvNo)
  const [entryDate, setEntryDate] = useState(today)
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState([
    { account_id: coaList[0]?.id || '', contact_id: '', debit: '', credit: '', line_description: '' },
    { account_id: coaList[1]?.id || '', contact_id: '', debit: '', credit: '', line_description: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleAddLine = () => {
    setLines([
      ...lines,
      { account_id: coaList[0]?.id || '', contact_id: '', debit: '', credit: '', line_description: '' },
    ])
  }

  const handleRemoveLine = (idx) => {
    if (lines.length <= 2) return
    setLines(lines.filter((_, i) => i !== idx))
  }

  const handleLineChange = (idx, field, val) => {
    const updated = [...lines]
    updated[idx][field] = val
    if (field === 'debit' && val !== '') {
      updated[idx].credit = ''
    } else if (field === 'credit' && val !== '') {
      updated[idx].debit = ''
    }
    setLines(updated)
  }

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const diff = Math.round(Math.abs(totalDr - totalCr) * 100) / 100
  const isBalanced = diff === 0 && totalDr > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!description.trim()) {
      return setError('กรุณาระบุคำอธิบายรายการสมุดรายวัน')
    }
    if (!isBalanced) {
      return setError(`ยอดเดบิตและเครดิตไม่สมดุล (ผลต่าง ${formatBaht(diff)})`)
    }

    setSaving(true)
    try {
      // 1. Insert header
      const { data: header, error: headerErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_no: entryNo,
          entry_date: entryDate,
          reference_type: 'MANUAL',
          project_id: projectId || null,
          description: description.trim(),
          accounting_status: 'รอดำเนินการ',
        })
        .select()
        .single()

      if (headerErr) throw headerErr

      // 2. Insert lines
      const lineRows = lines
        .filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
        .map((l) => ({
          journal_entry_id: header.id,
          account_id: l.account_id,
          contact_id: l.contact_id || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          line_description: l.line_description || description.trim(),
        }))

      const { error: linesErr } = await supabase.from('journal_entry_lines').insert(lineRows)
      if (linesErr) throw linesErr

      onSuccess()
    } catch (err) {
      console.error('Error creating Manual JV:', err)
      setError(err.message || 'บันทึกสมุดรายวันไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-steel-200 my-8 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-ink text-base">
                สร้างสมุดรายวันทั่วไป (Manual Journal Entry - JV)
              </h3>
              <p className="text-xs text-steel-500">
                บันทึกรายการปรับปรุงบัญชี รายการเปิดบัญชี หรือโอนปิดบัญชีตามมาตรฐานบัญชีคู่
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Header Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-steel-700 block mb-1">เลขที่สมุดรายวัน (JV No.) *</label>
              <input
                type="text"
                required
                value={entryNo}
                onChange={(e) => setEntryNo(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">วันที่ผ่านรายการ *</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">โครงการ (Cost Center)</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500 bg-white"
              >
                <option value="">ส่วนกลางบริษัท (Overhead)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} - {p.project_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-steel-700 block mb-1">คำอธิบายรายการ (Description) *</label>
            <input
              type="text"
              required
              placeholder="ระบุวัตถุประสงค์ เช่น ปรับปรุงค่าใช้จ่ายค้างจ่ายสิ้นงวด, บันทึกดอกเบี้ยรับ..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Lines Table */}
          <div className="rounded-xl border border-steel-200 overflow-hidden bg-steel-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-steel-700">
              <span>รายการคู่บัญชี (อย่างน้อย 2 บรรทัด)</span>
              <button
                type="button"
                onClick={handleAddLine}
                className="text-sky-700 hover:text-sky-900 flex items-center gap-1 text-[11px]"
              >
                <Plus className="h-3.5 w-3.5" /> เพิ่มบรรทัด
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-steel-200">
                  {/* Account Code */}
                  <div className="col-span-4">
                    <select
                      value={line.account_id}
                      onChange={(e) => handleLineChange(idx, 'account_id', e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] border border-steel-200 rounded font-medium text-ink bg-white"
                    >
                      {coaList.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.account_code} - {acc.account_name_th}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Contact */}
                  <div className="col-span-2">
                    <select
                      value={line.contact_id}
                      onChange={(e) => handleLineChange(idx, 'contact_id', e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] border border-steel-200 rounded text-steel-700 bg-white"
                    >
                      <option value="">(ไม่ระบุคู่ค้า)</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Line Desc */}
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="คำอธิบายย่อย..."
                      value={line.line_description}
                      onChange={(e) => handleLineChange(idx, 'line_description', e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] border border-steel-200 rounded"
                    />
                  </div>

                  {/* Debit */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="เดบิต Dr."
                      value={line.debit}
                      onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] border border-steel-200 rounded text-right font-mono font-bold text-ink"
                    />
                  </div>

                  {/* Credit */}
                  <div className="col-span-2 flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="เครดิต Cr."
                      value={line.credit}
                      onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] border border-steel-200 rounded text-right font-mono font-bold text-ink"
                    />
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-steel-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Balance Summary Box */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-steel-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-steel-700">สถานะความสมดุล:</span>
                {isBalanced ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> เดบิตและเครดิตสมดุลเรียบร้อย
                  </span>
                ) : (
                  <span className="text-rose-700 font-bold flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> ผลต่างเดบิต-เครดิต: {formatBaht(diff)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 font-mono font-bold">
                <div>รวมเดบิต: <span className="text-ink">{formatBaht(totalDr)}</span></div>
                <div>รวมเครดิต: <span className="text-ink">{formatBaht(totalCr)}</span></div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
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
              disabled={saving || !isBalanced}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : ' บันทึกสมุดรายวันทั่วไป'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

