import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import ExpenseFormModal from './ExpenseFormModal'
import Pagination from '../../components/Pagination'
import { Plus, Search, Filter, CheckCircle2, Clock, DollarSign, ArrowRightLeft } from 'lucide-react'

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // มุมมองและการกรอง
  const [docViewMode, setDocViewMode] = useState('business') // 'business' | 'accounting'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'pending_reimburse' | 'paid' | 'pending'
  const [selectedProject, setSelectedProject] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 10 | 15 | 30 | 50

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [reimburseTarget, setReimburseTarget] = useState(null)
  const [reimburseBank, setReimburseBank] = useState('1110-02')
  const [reimburseDate, setReimburseDate] = useState(new Date().toISOString().slice(0, 10))
  const [reimburseSlip, setReimburseSlip] = useState('')
  const [reimbursing, setReimbursing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [expRes, projRes, venRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('*, projects(id, project_code, project_name)')
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('vendors').select('id, vendor_code, vendor_name').order('vendor_code'),
      ])

      if (expRes.error) throw expRes.error
      setExpenses(expRes.data || [])
      setProjects(projRes.data || [])
      setVendors(venRes.data || [])
    } catch (err) {
      console.error('Failed to load expenses:', err)
      setError('ไม่สามารถโหลดข้อมูลค่าใช้จ่ายได้')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // คำนวณสรุปยอด KPIs
  const totalAmount = expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0)
  const pendingReimburseItems = expenses.filter(
    (e) => e.status === 'รอคืนเงินสำรองจ่าย' || e.reimbursement_status === 'รอคืนเงินสำรองจ่าย'
  )
  const pendingReimburseTotal = pendingReimburseItems.reduce((s, e) => s + Number(e.total_amount || 0), 0)
  const paidItems = expenses.filter((e) => e.status === 'จ่ายเงินแล้ว')
  const paidTotal = paidItems.reduce((s, e) => s + Number(e.total_amount || 0), 0)

  // จัดการยืนยันการคืนเงินสำรองจ่าย (Reimbursement Execution)
  const handleConfirmReimburse = async (e) => {
    e.preventDefault()
    if (!reimburseTarget) return

    setReimbursing(true)
    try {
      const exp = reimburseTarget
      const netPay = Number(exp.total_amount) - Number(exp.wht_amount || 0)
      const dateStr = reimburseDate || new Date().toISOString().slice(0, 10)
      const dateCompact = dateStr.replace(/-/g, '').slice(0, 6)
      const pvNo = `PV-REIMB${dateCompact}${Math.floor(1000 + Math.random() * 9000)}`
      const jvNo = `PAY${dateCompact}${Math.floor(1000 + Math.random() * 9000)}`

      // 1. สร้างสมุดรายวันตัดเงินคืนพนักงาน: Dr. 2160-01 (ค่าใช้จ่ายค้างจ่าย/เงินทดรอง) / Cr. บัญชีบริษัท
      const { data: coaRows } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code')
        .in('account_code', ['2160-01', reimburseBank])

      const coaMap = (coaRows || []).reduce((acc, c) => ({ ...acc, [c.account_code]: c.id }), {})
      const liabilityAccId = coaMap['2160-01']
      const bankAccId = coaMap[reimburseBank]

      const { data: jv } = await supabase
        .from('journal_entries')
        .insert({
          entry_no: jvNo,
          entry_date: dateStr,
          reference_type: 'PAY',
          reference_id: exp.id,
          project_id: exp.project_id || null,
          description: `โอนคืนเงินสำรองจ่ายค่าใช้จ่าย ${exp.expense_no} ให้แก่ ${exp.advance_payer_name || 'ผู้สำรองจ่าย'} [${pvNo}]`,
          accounting_status: 'อนุมัติแล้ว',
        })
        .select()
        .single()

      if (jv?.id && liabilityAccId && bankAccId) {
        await supabase.from('journal_entry_lines').insert([
          {
            journal_entry_id: jv.id,
            account_id: liabilityAccId,
            debit: netPay,
            credit: 0,
            line_description: `ตัดเคลียร์ยอดเงินสำรองจ่าย - ${exp.expense_no}`,
          },
          {
            journal_entry_id: jv.id,
            account_id: bankAccId,
            debit: 0,
            credit: netPay,
            line_description: `โอนเงินจากบัญชีบริษัท (${reimburseBank}) คืนแก่ ${exp.advance_payer_name || 'ผู้สำรองจ่าย'}`,
          },
        ])
      }

      // 2. บันทึกลง payment_transactions
      await supabase.from('payment_transactions').insert({
        transaction_no: pvNo,
        document_type: 'EXP',
        document_id: exp.id,
        document_no: exp.expense_no,
        project_id: exp.project_id || null,
        payment_stage: 'advance_reimburse',
        payment_method: 'transfer',
        amount: netPay,
        payment_date: dateStr,
        company_bank_account: reimburseBank,
        slip_reference_no: reimburseSlip || null,
        notes: `โอนเงินคืนสำรองจ่ายให้แก่ ${exp.advance_payer_name || 'ผู้สำรองจ่าย'}`,
        journal_entry_id: jv?.id || null,
      })

      // 3. อัปเดตสถานะ expenses
      await supabase
        .from('expenses')
        .update({
          status: 'จ่ายเงินแล้ว',
          reimbursement_status: 'คืนเงินแล้ว',
          reimbursement_date: dateStr,
          accounting_status: 'อนุมัติแล้ว',
          updated_at: new Date().toISOString(),
        })
        .eq('id', exp.id)

      setReimburseTarget(null)
      loadData()
    } catch (err) {
      console.error('Error reimbursing expense:', err)
      alert(err.message || 'บันทึกการคืนเงินไม่สำเร็จ')
    } finally {
      setReimbursing(false)
    }
  }

  // ตัวกรองรายการ
  const filteredExpenses = expenses.filter((e) => {
    if (selectedProject !== 'all' && e.project_id !== selectedProject) return false

    if (statusFilter === 'pending_reimburse') {
      if (e.status !== 'รอคืนเงินสำรองจ่าย' && e.reimbursement_status !== 'รอคืนเงินสำรองจ่าย') return false
    } else if (statusFilter === 'paid') {
      if (e.status !== 'จ่ายเงินแล้ว') return false
    } else if (statusFilter === 'pending') {
      if (e.status !== 'รอดำเนินการ') return false
    }

    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      e.expense_no?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.vendor_tax_invoice_no?.toLowerCase().includes(q) ||
      e.advance_payer_name?.toLowerCase().includes(q) ||
      e.vendors?.vendor_name?.toLowerCase().includes(q) ||
      e.projects?.project_code?.toLowerCase().includes(q)
    )
  })

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองหรือคำค้นหาเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, selectedProject])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">บันทึกค่าใช้จ่ายและเงินสำรองจ่าย (Expenses - EXP)</h2>
          <p className="text-xs text-steel-500">
            บริหารจัดการค่าใช้จ่ายหน้างาน โครงการ EPC โซลาร์รูฟท็อป แหล่งเงินบริษัท และการเคลียร์คืนเงินสำรองจ่าย
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-sky-800 transition"
        >
          <Plus className="h-4 w-4" />
          <span>บันทึกค่าใช้จ่ายใหม่ (New EXP)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
            ค่าใช้จ่ายรวมทั้งหมด
          </div>
          <div className="mt-1 text-2xl font-black text-ink font-mono">
            {baht(totalAmount)} <span className="text-xs font-normal text-steel-500">บาท</span>
          </div>
          <div className="mt-1 text-[11px] text-steel-400">
            บันทึกแล้ว {expenses.length} รายการ
          </div>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
            <span>รอคืนเงินสำรองจ่าย (Pending Reimbursement)</span>
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="mt-1 text-2xl font-black text-amber-950 font-mono">
            {baht(pendingReimburseTotal)} <span className="text-xs font-normal text-amber-800">บาท</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-700 font-semibold">
            {pendingReimburseItems.length} รายการที่รอฝ่ายบัญชีโอนเคลียร์เงินคืน
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            จ่ายชำระแล้ว (Company Paid)
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-950 font-mono">
            {baht(paidTotal)} <span className="text-xs font-normal text-emerald-800">บาท</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-700">
            ตัดบัญชีบริษัทสำเร็จ {paidItems.length} รายการ
          </div>
        </div>
      </div>

      {/* Controls & Dual Status Toggle */}
      <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 pb-3">
          {/* Dual Status Switch */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-steel-700">มุมมอง:</span>
            <button
              type="button"
              onClick={() => setDocViewMode('business')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition border ${
                docViewMode === 'business'
                  ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                  : 'bg-white text-steel-600 border-steel-200 hover:bg-steel-50'
              }`}
            >
              📁 เอกสารธุรกิจ (Business EXP)
            </button>
            <button
              type="button"
              onClick={() => setDocViewMode('accounting')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition border ${
                docViewMode === 'accounting'
                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                  : 'bg-white text-steel-600 border-steel-200 hover:bg-steel-50'
              }`}
            >
              ⚖️ เอกสารบัญชี (GL Audit)
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'pending_reimburse', label: `รอคืนเงินสำรองจ่าย (${pendingReimburseItems.length})` },
              { id: 'paid', label: 'จ่ายเงินแล้ว' },
              { id: 'pending', label: 'รอดำเนินการ' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  statusFilter === tab.id
                    ? 'bg-steel-800 text-white shadow-sm'
                    : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-steel-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ EXP, รายละเอียด, คู่ค้า, ผู้สำรองจ่าย..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-steel-300 rounded-lg text-xs bg-white text-ink"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-steel-500">โครงการ:</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="p-1.5 border border-steel-300 rounded-lg text-xs bg-white text-ink"
            >
              <option value="all">-- ทุกโครงการ (All Projects) --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} - {p.project_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50 text-left text-steel-600 font-bold">
              <th className="py-2.5 px-3">เลขที่เอกสาร</th>
              <th>วันที่</th>
              <th>รายละเอียด / คู่ค้า</th>
              <th>โครงการ</th>
              <th>แหล่งที่มาของเงิน</th>
              <th className="text-right">มูลค่ารวมสุทธิ</th>
              <th className="text-center">สถานะธุรกิจ</th>
              <th className="text-center">สถานะบัญชี (GL)</th>
              <th className="text-right px-3">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-steel-400">กำลังโหลดรายการค่าใช้จ่าย...</td>
              </tr>
            ) : filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-steel-400">ไม่พบรายการค่าใช้จ่ายตามเงื่อนไขที่เลือก</td>
              </tr>
            ) : (
              paginatedExpenses.map((row) => {
                const isReimbursable = row.status === 'รอคืนเงินสำรองจ่าย' || row.reimbursement_status === 'รอคืนเงินสำรองจ่าย'
                const isAdvance = row.payment_source === 'advance_payment'
                const netAmount = Number(row.total_amount) - Number(row.wht_amount || 0)

                return (
                  <tr key={row.id} className="hover:bg-steel-50/60 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                      <div>{row.expense_no}</div>
                      {row.vendor_tax_invoice_no && (
                        <div className="text-[10px] text-emerald-700 font-mono">
                          🧾 {row.vendor_tax_invoice_no}
                        </div>
                      )}
                    </td>
                    <td className="text-steel-600">{row.expense_date}</td>
                    <td>
                      <div className="font-semibold text-ink line-clamp-1">{row.description}</div>
                      <div className="text-[11px] text-steel-500">
                        {row.vendors?.vendor_name || 'คู่ค้าทั่วไป'}
                        {row.is_asset && (
                          <span className="ml-1 text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold">
                            🏢 สินทรัพย์
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {row.projects ? (
                        <div className="text-xs">
                          <span className="font-semibold text-ink">{row.projects.project_code}</span>
                          <span className="text-steel-400 block text-[10px] line-clamp-1">{row.projects.project_name}</span>
                        </div>
                      ) : (
                        <span className="text-steel-400">ส่วนกลาง / Overhead</span>
                      )}
                    </td>
                    <td>
                      {isAdvance ? (
                        <div className="text-[11px]">
                          <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
                            💵 สำรองจ่าย: {row.advance_payer_name || 'หัวหน้างาน'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px]">
                          <span className="font-semibold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 inline-block">
                            🏦 โอน: {row.company_bank_account === '1110-03' ? 'SCB' : 'KBANK'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono font-extrabold text-ink">
                      {baht(row.total_amount)}
                      {Number(row.wht_amount) > 0 && (
                        <div className="text-[10px] text-purple-700 font-normal">
                          (สุทธิ {baht(netAmount)})
                        </div>
                      )}
                    </td>

                    {/* Badge 1: Business Status */}
                    <td className="text-center">
                      {row.status === 'จ่ายเงินแล้ว' ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ จ่ายเงินแล้ว
                        </span>
                      ) : row.status === 'รอคืนเงินสำรองจ่าย' ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          ⏳ รอคืนเงินสำรองจ่าย
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-steel-100 text-steel-700 border border-steel-200">
                          รอดำเนินการ
                        </span>
                      )}
                    </td>

                    {/* Badge 2: Accounting Status */}
                    <td className="text-center">
                      {row.accounting_status === 'อนุมัติแล้ว' ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✅ อนุมัติแล้ว
                        </span>
                      ) : row.accounting_status === 'ยกเลิก' ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          ❌ ยกเลิก
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          ⏳ รอดำเนินการ
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="text-right px-3">
                      {isReimbursable ? (
                        <button
                          type="button"
                          onClick={() => setReimburseTarget(row)}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
                          title="กดเพื่อโอนเงินคืนสำรองจ่ายให้พนักงาน"
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>โอนเงินคืนสำรองจ่าย</span>
                        </button>
                      ) : (
                        <span className="text-steel-400 text-[11px] font-medium">เรียบร้อย</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
        {!loading && filteredExpenses.length > 0 && (
          <div className="border-t border-steel-200 bg-white px-4 py-2.5">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredExpenses.length}
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

      {/* Modal บันทึกค่าใช้จ่ายใหม่ */}
      {showCreateModal && (
        <ExpenseFormModal
          isOpen={true}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadData()
          }}
          projects={projects}
          vendors={vendors}
        />
      )}

      {/* Modal โอนเงินคืนสำรองจ่าย (Reimbursement Modal) */}
      {reimburseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-steel-200 animate-in fade-in zoom-in duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-steel-200 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 font-bold">
                  💸
                </span>
                <div>
                  <h3 className="font-bold text-ink text-sm">
                    โอนเงินคืนสำรองจ่าย (Reimburse Staff)
                  </h3>
                  <p className="text-steel-500 text-[11px]">
                    เอกสาร {reimburseTarget.expense_no} · {reimburseTarget.advance_payer_name || 'ผู้สำรองจ่าย'}
                  </p>
                </div>
              </div>
              <button onClick={() => setReimburseTarget(null)} className="text-steel-400 hover:text-steel-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReimburse} className="mt-3.5 space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex justify-between items-center">
                <span className="text-amber-900 font-medium">ยอดเงินที่ต้องโอนคืนพนักงาน:</span>
                <span className="text-base font-black text-amber-950 font-mono">
                  {baht(Number(reimburseTarget.total_amount) - Number(reimburseTarget.wht_amount || 0))} บาท
                </span>
              </div>

              <div>
                <label className="font-bold text-steel-700 block mb-1">
                  เลือกบัญชีธนาคารบริษัทที่ใช้โอนคืน *
                </label>
                <select
                  value={reimburseBank}
                  onChange={(e) => setReimburseBank(e.target.value)}
                  className="w-full p-2 border border-steel-300 rounded-lg bg-white font-medium"
                >
                  <option value="1110-02">ธ.กสิกรไทย 045-8-12345-6 บจก. แอนวา แอนด์ โค (1110-02)</option>
                  <option value="1110-03">ธ.ไทยพาณิชย์ 123-4-56789-0 บจก. แอนวา แอนด์ โค (1110-03)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">วันที่โอนคืน *</label>
                  <input
                    type="date"
                    required
                    value={reimburseDate}
                    onChange={(e) => setReimburseDate(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">เลขอ้างอิงสลิปโอนเงิน</label>
                  <input
                    type="text"
                    placeholder="เช่น #KBANK-991204"
                    value={reimburseSlip}
                    onChange={(e) => setReimburseSlip(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-steel-100 rounded-lg text-steel-600 text-[11px]">
                💡 ระบบจะลงสมุดรายวันตัดเงินทันที: <b>Dr. ค่าใช้จ่ายค้างจ่าย (2160-01)</b> / <b>Cr. บัญชีธนาคารบริษัท ({reimburseBank})</b>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-steel-200">
                <button
                  type="button"
                  onClick={() => setReimburseTarget(null)}
                  disabled={reimbursing}
                  className="px-3.5 py-1.5 border border-steel-300 text-steel-600 rounded-lg hover:bg-steel-50 font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={reimbursing}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50"
                >
                  {reimbursing ? 'กำลังบันทึกการโอนคืน...' : 'ยืนยันโอนเงินคืนสำรองจ่าย'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

