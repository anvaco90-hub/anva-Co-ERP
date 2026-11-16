import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import PaymentActionModal from '../../components/PaymentActionModal'
import ExpenseFormModal from './ExpenseFormModal'
import GeneralLedgerView from './GeneralLedgerView'

export default function AccountingDashboard() {
  const [activeTab, setActiveTab] = useState('expenses') // 'expenses' | 'ap' | 'gl' | 'retention' | 'fleet'
  const [apList, setApList] = useState([])
  const [retentionList, setRetentionList] = useState([])
  const [fleetList, setFleetList] = useState([])
  const [expensesList, setExpensesList] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals & Actions
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [paymentModalData, setPaymentModalData] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  // Dual-status filter for Expenses
  const [docFilterMode, setDocFilterMode] = useState('all') // 'all' | 'business' | 'accounting'

  const loadData = async () => {
    setLoading(true)
    try {
      const [apRes, retRes, fltRes, expRes, prjRes, vndRes] = await Promise.all([
        supabase.from('accounts_payable').select('*').order('due_date', { ascending: true }),
        supabase.from('retention_guarantees').select('*, projects(project_code, project_name)').order('release_date', { ascending: true }),
        supabase.from('fleet_card_expenses').select('*, projects(project_code, project_name)').order('transaction_date', { ascending: false }),
        supabase
          .from('expenses')
          .select('*, projects(project_code, project_name), vendors(vendor_name, tax_id)')
          .order('expense_date', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('vendors').select('id, vendor_code, vendor_name, tax_id').order('vendor_name'),
      ])

      setApList(apRes.data || [])
      setRetentionList(retRes.data || [])
      setFleetList(fltRes.data || [])
      setExpensesList(expRes.data || [])
      setProjects(prjRes.data || [])
      setVendors(vndRes.data || [])
    } catch (err) {
      console.error('Error loading accounting data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Quick Approve Expense (triggers auto JV & Tax records in PostgreSQL)
  const handleApproveExpense = async (exp) => {
    setActionLoading(exp.id)
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'อนุมัติแล้ว',
          accounting_status: 'อนุมัติแล้ว',
          approved_at: new Date().toISOString(),
        })
        .eq('id', exp.id)

      if (error) throw error
      await loadData()
    } catch (err) {
      console.error('Error approving expense:', err)
      alert(err.message || 'ไม่สามารถอนุมัติค่าใช้จ่ายได้')
    } finally {
      setActionLoading(null)
    }
  }

  // Filtered expenses based on dual-status filter
  const filteredExpenses = expensesList.filter((item) => {
    if (docFilterMode === 'business') {
      return item.status !== 'ยกเลิก'
    }
    if (docFilterMode === 'accounting') {
      return item.accounting_status === 'อนุมัติแล้ว' || item.accounting_status === 'รอดำเนินการ'
    }
    return true
  })

  // Calculations for KPI Cards
  const totalApDebt = apList.reduce((sum, item) => sum + Number(item.total_debt || 0), 0)
  const totalApRemaining = apList.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0)
  const totalExpenses = expensesList.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const totalRetention = retentionList.reduce((sum, item) => sum + Number(item.retention_amount || 0), 0)
  const totalFuel = fleetList.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  // Status badges
  const getBusinessStatusBadge = (status) => {
    switch (status) {
      case 'รอดำเนินการ':
        return <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">⏳ รอดำเนินการ</span>
      case 'อนุมัติแล้ว':
        return <span className="bg-sky-100 text-sky-800 text-[10px] px-2 py-0.5 rounded-full font-bold">📋 อนุมัติแล้ว</span>
      case 'จ่ายเงินแล้ว':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">💵 จ่ายเงินแล้ว</span>
      case 'ยกเลิก':
        return <span className="bg-rose-100 text-rose-800 text-[10px] px-2 py-0.5 rounded-full font-bold">❌ ยกเลิก</span>
      default:
        return <span className="bg-steel-100 text-steel-700 text-[10px] px-2 py-0.5 rounded-full font-medium">{status || 'ฉบับร่าง'}</span>
    }
  }

  const getAccountingStatusBadge = (accStatus) => {
    switch (accStatus) {
      case 'อนุมัติแล้ว':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold">✅ บัญชี: บันทึก GL แล้ว</span>
      case 'รอดำเนินการ':
        return <span className="bg-amber-50 text-amber-700 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold">⚡ บัญชี: รอดำเนินการ</span>
      case 'ยกเลิก':
        return <span className="bg-rose-50 text-rose-700 border border-rose-300 text-[10px] px-2 py-0.5 rounded-full font-bold">❌ บัญชี: ยกเลิก</span>
      default:
        return <span className="bg-steel-50 text-steel-600 border border-steel-200 text-[10px] px-2 py-0.5 rounded-full font-medium">⚡ บัญชี: รอดำเนินการ</span>
    }
  }

  // Helper for AP due-date status badge
  const getDueBadge = (dueDateStr, remaining) => {
    if (Number(remaining) <= 0) {
      return <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">ชำระแล้ว</span>
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDateStr)
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-bold">🔴 เกินกำหนด {Math.abs(diffDays)} วัน</span>
    }
    if (diffDays <= 3) {
      return <span className="bg-rose-50 text-rose-700 border border-rose-300 text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">🚨 ด่วน! ครบใน {diffDays} วัน</span>
    }
    if (diffDays <= 7) {
      return <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">⚠️ เตือน: อีก {diffDays} วัน</span>
    }
    return <span className="bg-sky-100 text-sky-800 text-xs px-2.5 py-0.5 rounded-full font-medium">ปกติ (เหลือ {diffDays} วัน)</span>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">ระบบบัญชีและการเงิน (Accounting & Finance)</h1>
          <p className="text-xs text-steel-500">
            ระบบบัญชีคู่ (Double-Entry GL), บันทึกค่าใช้จ่ายโครงการ (EXP), บริหารเจ้าหนี้การค้า (AP) และภาษี ภ.พ.30 / WHT
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5 transition"
          >
            <span>➕</span> บันทึกค่าใช้จ่ายใหม่ (New EXP)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-xs text-steel-500 font-medium">ยอดค่าใช้จ่ายรวม (EXP)</div>
          <div className="text-xl font-bold text-ink mt-1 font-mono">{baht(totalExpenses)} บ.</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-xs text-steel-500 font-medium">ยอดหนี้ AP รวม</div>
          <div className="text-xl font-bold text-ink mt-1 font-mono">{baht(totalApDebt)} บ.</div>
        </div>
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 shadow-sm">
          <div className="text-xs text-rose-700 font-medium">ค้างชำระรอจ่าย (Outstanding)</div>
          <div className="text-xl font-bold text-rose-700 mt-1 font-mono">{baht(totalApRemaining)} บ.</div>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-xs text-amber-700 font-medium">เงินประกันผลงาน (Retention)</div>
          <div className="text-xl font-bold text-amber-800 mt-1 font-mono">{baht(totalRetention)} บ.</div>
        </div>
        <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 shadow-sm">
          <div className="text-xs text-sky-700 font-medium">ค่าน้ำมัน Fleet Card</div>
          <div className="text-xl font-bold text-sky-800 mt-1 font-mono">{baht(totalFuel)} บ.</div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-steel-200 pb-2">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'expenses'
              ? 'bg-sky-700 text-white shadow'
              : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          💸 ค่าใช้จ่ายโครงการ & บริษัท (Expenses - EXP)
        </button>
        <button
          onClick={() => setActiveTab('gl')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'gl'
              ? 'bg-sky-700 text-white shadow'
              : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          📖 สมุดรายวันทั่วไป & ผังบัญชี (GL & COA)
        </button>
        <button
          onClick={() => setActiveTab('ap')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'ap'
              ? 'bg-sky-700 text-white shadow'
              : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          📑 เจ้าหนี้การค้า (AP) & กำหนดจ่าย
        </button>
        <button
          onClick={() => setActiveTab('retention')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'retention'
              ? 'bg-sky-700 text-white shadow'
              : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          🏦 เงินประกันผลงาน (Retention)
        </button>
        <button
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'fleet'
              ? 'bg-sky-700 text-white shadow'
              : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          ⛽ บัตรน้ำมัน Fleet Card
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-steel-400">กำลังโหลดข้อมูลการเงินและบัญชี...</div>
      ) : activeTab === 'expenses' ? (
        /* TAB: ค่าใช้จ่าย (EXPENSES) */
        <div className="space-y-4">
          {/* Dual-Status Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-steel-200 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-steel-500 font-medium mr-1">มุมมองเอกสาร:</span>
              <button
                onClick={() => setDocFilterMode('all')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition ${
                  docFilterMode === 'all'
                    ? 'bg-steel-800 text-white'
                    : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                }`}
              >
                ทั้งหมด ({expensesList.length})
              </button>
              <button
                onClick={() => setDocFilterMode('business')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition ${
                  docFilterMode === 'business'
                    ? 'bg-sky-700 text-white'
                    : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                💼 เอกสารธุรกิจ (Business)
              </button>
              <button
                onClick={() => setDocFilterMode('accounting')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition ${
                  docFilterMode === 'accounting'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                📑 เอกสารบัญชี (Accounting GL)
              </button>
            </div>
            <span className="text-xs text-steel-500">
              ระบบแสดง Dual-Status Badges: สถานะธุรกิจคู่กับสถานะบัญชี Double-Entry
            </span>
          </div>

          {/* Expenses Table */}
          <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-steel-600">
                <thead className="bg-steel-50/75 font-semibold text-steel-700 border-b border-steel-200">
                  <tr>
                    <th className="px-3 py-2.5">เลขที่ / วันที่</th>
                    <th className="px-3 py-2.5">ผู้จำหน่าย / ผู้รับเงิน</th>
                    <th className="px-3 py-2.5">โครงการ (Cost Center)</th>
                    <th className="px-3 py-2.5">หมวดบัญชี / รายละเอียด</th>
                    <th className="px-3 py-2.5">ใบกำกับภาษี (VAT 7%)</th>
                    <th className="px-3 py-2.5 text-center">หัก ณ ที่จ่าย</th>
                    <th className="px-3 py-2.5 text-right">ยอดสุทธิ (บาท)</th>
                    <th className="px-3 py-2.5 text-center">สถานะธุรกิจ</th>
                    <th className="px-3 py-2.5 text-center">สถานะบัญชี</th>
                    <th className="px-3 py-2.5 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="text-center py-10 text-steel-400">
                        ไม่พบรายการค่าใช้จ่ายในมุมมองนี้
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => {
                      const vendorName = exp.vendors?.vendor_name || exp.vendor_name || 'ผู้จำหน่าย/ร้านค้า'
                      const isJuristic = /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน/i.test(vendorName)
                      const whtForm = exp.wht_rate > 0 ? (isJuristic ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3') : null

                      return (
                        <tr key={exp.id} className="hover:bg-steel-50/50">
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-bold text-sky-800 block">{exp.expense_no}</span>
                            <span className="text-[10px] text-steel-400 font-mono">{exp.expense_date}</span>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-ink">
                            {vendorName}
                          </td>
                          <td className="px-3 py-2.5">
                            {exp.projects?.project_code ? (
                              <span className="font-medium text-sky-700">
                                {exp.projects.project_code}
                              </span>
                            ) : (
                              <span className="text-steel-400 text-[11px]">ส่วนกลางบริษัท</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                {exp.account_code || '5110-01'}
                              </span>
                              {exp.is_asset && (
                                <span className="text-[9px] bg-purple-100 text-purple-800 px-1 py-0.5 rounded font-bold">
                                  🏢 สินทรัพย์ถาวร
                                </span>
                              )}
                            </div>
                            <span className="text-ink truncate block text-[11px] mt-0.5" title={exp.description}>
                              {exp.description}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {Number(exp.vat_amount) > 0 ? (
                              <div>
                                <span className="font-mono font-bold text-sky-900 block text-[11px]">
                                  {exp.vendor_tax_invoice_no || '-'}
                                </span>
                                <span className="text-[9px] text-steel-500">
                                  VAT: {baht(exp.vat_amount)} บ.
                                </span>
                              </div>
                            ) : (
                              <span className="text-steel-400 text-[11px]">ยกเว้น VAT</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {Number(exp.wht_rate) > 0 ? (
                              <div>
                                <span className="font-bold text-amber-700 block text-[11px]">
                                  หัก {exp.wht_rate}% ({baht(exp.wht_amount)} บ.)
                                </span>
                                <span className="inline-block text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">
                                  {whtForm}
                                </span>
                              </div>
                            ) : (
                              <span className="text-steel-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">
                            {baht(exp.total_amount)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {getBusinessStatusBadge(exp.status)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {getAccountingStatusBadge(exp.accounting_status)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Approve action if pending */}
                              {exp.status === 'รอดำเนินการ' && (
                                <button
                                  onClick={() => handleApproveExpense(exp)}
                                  disabled={actionLoading === exp.id}
                                  className="px-2 py-1 bg-sky-600 text-white rounded text-[10px] font-bold hover:bg-sky-700 disabled:opacity-50"
                                >
                                  {actionLoading === exp.id ? '...' : 'อนุมัติ'}
                                </button>
                              )}

                              {/* Pay action if not paid */}
                              {exp.status !== 'จ่ายเงินแล้ว' && exp.status !== 'ยกเลิก' && (
                                <button
                                  onClick={() =>
                                    setPaymentModalData({
                                      docId: exp.id,
                                      docNo: exp.expense_no,
                                      contactName: vendorName,
                                      totalAmount: exp.total_amount,
                                      alreadyPaid: 0,
                                      projectId: exp.project_id,
                                      projectName: exp.projects?.project_name || '',
                                      whtDeducted: exp.wht_amount || 0,
                                    })
                                  }
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-1"
                                >
                                  <span>💸</span> จ่ายชำระ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'gl' ? (
        /* TAB: สมุดรายวันและผังบัญชี (GENERAL LEDGER & COA) */
        <GeneralLedgerView />
      ) : activeTab === 'ap' ? (
        /* TAB: เจ้าหนี้การค้า (AP) */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm">ตารางนัดจ่ายเจ้าหนี้การค้าและเครดิตเทอม (Payment Due Scheduler)</h3>
            <span className="text-xs text-steel-500">ระบบแจ้งเตือนสีแดง: ครบกำหนดภายใน 3 วัน / สีเหลือง: ภายใน 7 วัน</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">กำหนดจ่าย</th>
                  <th className="px-4 py-3">ผู้จำหน่าย / คู่ค้า</th>
                  <th className="px-4 py-3">เลขที่ใบกำกับ/PO</th>
                  <th className="px-4 py-3 text-right">ยอดหนี้สุทธิ</th>
                  <th className="px-4 py-3 text-right">จ่ายแล้ว</th>
                  <th className="px-4 py-3 text-right">ยอดคงค้าง</th>
                  <th className="px-4 py-3 text-center">เครดิต (วัน)</th>
                  <th className="px-4 py-3 text-center">สถานะนัดจ่าย</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {apList.map((item) => (
                  <tr key={item.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-ink text-xs">{item.due_date}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{item.vendor_name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-steel-500">{item.invoice_no || item.po_no || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{baht(item.total_debt)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{baht(item.paid_amount || 0)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">{baht(item.remaining_amount)}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{item.credit_days || 30}</td>
                    <td className="px-4 py-3 text-center">{getDueBadge(item.due_date, item.remaining_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {Number(item.remaining_amount) > 0 && (
                        <button
                          onClick={() =>
                            setPaymentModalData({
                              docId: item.po_id || item.id,
                              docNo: item.po_no || item.invoice_no || 'AP-DUE',
                              contactName: item.vendor_name,
                              totalAmount: item.total_debt,
                              alreadyPaid: item.paid_amount || 0,
                              projectId: null,
                              projectName: '',
                            })
                          }
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 shadow-sm"
                        >
                          💸 จ่ายชำระ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'retention' ? (
        /* TAB: เงินประกันผลงาน (RETENTION) */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm">รายการเงินค้ำประกันผลงานโครงการ (Retention Guarantees 5-10%)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">โครงการ</th>
                  <th className="px-4 py-3">ผู้ว่าจ้าง / ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดเงินประกันผลงาน</th>
                  <th className="px-4 py-3 text-center">หัก (%)</th>
                  <th className="px-4 py-3 text-center">ระยะเวลารับประกัน</th>
                  <th className="px-4 py-3 text-center">วันที่ครบกำหนดคืนเงิน</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {retentionList.map((item) => (
                  <tr key={item.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {item.projects?.project_code} - {item.projects?.project_name || item.project_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-steel-700">{item.customer_name}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{baht(item.retention_amount)}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{item.percentage || 5}%</td>
                    <td className="px-4 py-3 text-center text-xs">{item.warranty_period_months} เดือน</td>
                    <td className="px-4 py-3 text-center font-mono text-xs font-bold text-ink">{item.release_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        item.status === 'released' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status === 'released' ? 'รับเงินคืนแล้ว' : 'รอครบกำหนดคืนเงิน'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB: บัตรน้ำมัน FLEET CARD */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm">บันทึกการใช้จ่ายบัตรน้ำมัน Fleet Card ตามโครงการ</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">วันที่ทำรายการ</th>
                  <th className="px-4 py-3">ทะเบียนรถยนต์</th>
                  <th className="px-4 py-3">ผู้ถือบัตร / ผู้ขับขี่</th>
                  <th className="px-4 py-3">โครงการที่ตัดค่าใช้จ่าย</th>
                  <th className="px-4 py-3">สถานีบริการน้ำมัน</th>
                  <th className="px-4 py-3 text-right">จำนวนลิตร</th>
                  <th className="px-4 py-3 text-right">จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {fleetList.map((item) => (
                  <tr key={item.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 text-xs font-mono">{item.transaction_date}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{item.vehicle_plate}</td>
                    <td className="px-4 py-3 text-sm text-steel-700">{item.card_holder}</td>
                    <td className="px-4 py-3 text-xs text-sky-700">
                      {item.projects?.project_code || 'ทั่วไป'}
                    </td>
                    <td className="px-4 py-3 text-xs text-steel-500">{item.station_name}</td>
                    <td className="px-4 py-3 text-right font-mono text-steel-700">{item.liters} L</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink">{baht(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Expense Modal */}
      <ExpenseFormModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSuccess={() => {
          loadData()
        }}
        projects={projects}
        vendors={vendors}
      />

      {/* Payment Action Modal (Disbursement PAY) */}
      {paymentModalData && (
        <PaymentActionModal
          isOpen={true}
          onClose={() => setPaymentModalData(null)}
          onSuccess={() => {
            loadData()
          }}
          type="disburse"
          docType="EXP"
          docId={paymentModalData.docId}
          docNo={paymentModalData.docNo}
          contactName={paymentModalData.contactName}
          totalAmount={paymentModalData.totalAmount}
          alreadyPaid={paymentModalData.alreadyPaid}
          projectId={paymentModalData.projectId}
          projectName={paymentModalData.projectName}
          whtDeducted={paymentModalData.whtDeducted}
        />
      )}
    </div>
  )
}
