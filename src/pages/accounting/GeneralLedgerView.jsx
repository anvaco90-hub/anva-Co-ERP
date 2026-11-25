import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'

export default function GeneralLedgerView() {
  const [subTab, setSubTab] = useState('journals') // 'journals' | 'coa'
  const [entries, setEntries] = useState([])
  const [coaList, setCoaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [filterType, setFilterType] = useState('ALL')
  const [actionLoading, setActionLoading] = useState(null)
  const [msg, setMsg] = useState({ text: '', type: '' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [jvRes, coaRes] = await Promise.all([
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
        supabase
          .from('chart_of_accounts')
          .select('*')
          .order('account_code', { ascending: true }),
      ])

      setEntries(jvRes.data || [])
      setCoaList(coaRes.data || [])
    } catch (err) {
      console.error('Error loading GL:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Approve Journal Entry (Post GL)
  const handleApproveEntry = async (entry) => {
    setActionLoading(entry.id)
    setMsg({ text: '', type: '' })
    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({
          accounting_status: 'อนุมัติแล้ว',
          approved_at: new Date().toISOString(),
        })
        .eq('id', entry.id)

      if (error) throw error

      setMsg({ text: `ผ่านรายการสมุดรายวัน ${entry.entry_no} เรียบร้อยแล้ว`, type: 'success' })
      loadData()
    } catch (err) {
      console.error('Error approving entry:', err)
      setMsg({ text: err.message || 'ไม่สามารถอนุมัติรายการได้ (โปรดตรวจสอบความสมดุลเดบิต-เครดิต)', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  // Filter entries
  const filteredEntries = entries.filter((e) => {
    if (filterType === 'ALL') return true
    return e.reference_type === filterType
  })

  // Category badge colors for Chart of Accounts
  const getCategoryBadge = (cat) => {
    switch (cat) {
      case 'Asset':
        return <span className="bg-sky-100 text-sky-800 text-[10px] px-2 py-0.5 rounded-full font-bold">1 สินทรัพย์ (Asset)</span>
      case 'Liability':
        return <span className="bg-rose-100 text-rose-800 text-[10px] px-2 py-0.5 rounded-full font-bold">2 หนี้สิน (Liability)</span>
      case 'Equity':
        return <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold">3 ส่วนของเจ้าของ (Equity)</span>
      case 'Revenue':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">4 รายได้ (Revenue)</span>
      case 'Expense':
        return <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">5 ค่าใช้จ่าย (Expense)</span>
      default:
        return <span className="bg-steel-100 text-steel-700 text-[10px] px-2 py-0.5 rounded-full font-medium">{cat}</span>
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-Tabs: Journals vs COA */}
      <div className="flex items-center justify-between border-b border-steel-200 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab('journals')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              subTab === 'journals'
                ? 'bg-sky-700 text-white shadow-sm'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            รายการสมุดรายวันทั่วไป (Journal Entries - Double-Entry)
          </button>
          <button
            onClick={() => setSubTab('coa')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              subTab === 'coa'
                ? 'bg-sky-700 text-white shadow-sm'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            ผังบัญชีมาตรฐาน (Chart of Accounts - 33 หมวด)
          </button>
        </div>

        {subTab === 'journals' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-steel-500 font-medium">ประเภทเอกสาร:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2.5 py-1 text-xs border border-steel-200 rounded-lg text-steel-700 bg-white"
            >
              <option value="ALL">ทั้งหมด (All)</option>
              <option value="INV">INV - ใบแจ้งหนี้/ขาย</option>
              <option value="RI">RI - ใบรับของเข้าคลัง</option>
              <option value="ISS">ISS - เบิกวัสดุเข้าหน้างาน/โครงการ</option>
              <option value="ADJ">ADJ - คืนวัสดุ/ปรับปรุงสต็อก</option>
              <option value="EXP">EXP - ค่าใช้จ่าย</option>
              <option value="RC">RC - ใบเสร็จรับเงิน</option>
              <option value="PAY">PAY - ใบสำคัญจ่าย</option>
            </select>
          </div>
        )}
      </div>

      {msg.text && (
        <div className={`p-2.5 rounded-lg text-xs font-medium ${
          msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-steel-400">กำลังโหลดข้อมูลบัญชีและสมุดรายวัน...</div>
      ) : subTab === 'journals' ? (
        /* JOURNAL ENTRIES TABLE */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <span className="font-bold text-ink text-xs">
              สมุดรายวันทั่วไป (General Ledger Journal) - รวม {filteredEntries.length} รายการ
            </span>
            <span className="text-[11px] text-steel-500">
              หลักความจริงชุดเดียว (Single Entry of Truth) เชื่อมโยงระบบจัดซื้อ ขาย และสโตร์
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-steel-600">
              <thead className="bg-steel-50/75 font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-3 py-2.5">เลขที่ JV</th>
                  <th className="px-3 py-2.5">วันที่</th>
                  <th className="px-3 py-2.5 text-center">ประเภท</th>
                  <th className="px-3 py-2.5">โครงการ</th>
                  <th className="px-3 py-2.5">คำอธิบายรายการ</th>
                  <th className="px-3 py-2.5 text-right">เดบิต (Dr.)</th>
                  <th className="px-3 py-2.5 text-right">เครดิต (Cr.)</th>
                  <th className="px-3 py-2.5 text-center">สถานะบัญชี</th>
                  <th className="px-3 py-2.5 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-8 text-steel-400">
                      ไม่พบรายการสมุดรายวันตามเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const lines = entry.journal_entry_lines || []
                    const totalDr = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0)
                    const totalCr = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0)
                    const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0
                    const isExpanded = expandedId === entry.id

                    return (
                      <tbody key={entry.id} className="hover:bg-steel-50/40">
                        <tr>
                          <td className="px-3 py-2.5 font-mono font-bold text-sky-800">
                            {entry.entry_no}
                          </td>
                          <td className="px-3 py-2.5 font-mono">{entry.entry_date}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded font-mono font-bold bg-steel-100 text-steel-700 text-[10px]">
                              {entry.reference_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-steel-700">
                            {entry.projects?.project_code || 'ส่วนกลาง'}
                          </td>
                          <td className="px-3 py-2.5 text-ink max-w-xs truncate" title={entry.description}>
                            {entry.description}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">
                            {baht(totalDr)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">
                            {baht(totalCr)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {entry.accounting_status === 'อนุมัติแล้ว' ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                บันทึกแล้ว
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                รอดำเนินการ
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                className="text-sky-700 hover:text-sky-900 font-medium text-[11px] underline"
                              >
                                {isExpanded ? 'ซ่อน' : 'ผัง Dr/Cr'}
                              </button>
                              {entry.accounting_status !== 'อนุมัติแล้ว' && (
                                <button
                                  onClick={() => handleApproveEntry(entry)}
                                  disabled={actionLoading === entry.id || !isBalanced}
                                  title={isBalanced ? 'ผ่านรายการสมุดรายวัน' : 'เดบิตและเครดิตไม่สมดุล'}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-40"
                                >
                                  {actionLoading === entry.id ? '...' : 'อนุมัติ'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Double-Entry Details */}
                        {isExpanded && (
                          <tr className="bg-steel-50/80">
                            <td colSpan="9" className="px-6 py-3">
                              <div className="p-3 bg-white rounded-lg border border-steel-200 space-y-2">
                                <div className="flex justify-between items-center text-xs border-b border-steel-100 pb-1.5 font-bold text-steel-700">
                                  <span>คู่บัญชี (Double-Entry Posting Details)</span>
                                  <span className={isBalanced ? 'text-emerald-700' : 'text-rose-700 font-bold'}>
                                    {isBalanced ? 'เดบิต = เครดิต สมดุลเรียบร้อย' : 'ยอดเดบิตและเครดิตไม่สมดุล'}
                                  </span>
                                </div>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="text-steel-500 border-b border-steel-100 text-[10px]">
                                      <th className="py-1">รหัสบัญชี</th>
                                      <th className="py-1">ชื่อบัญชี</th>
                                      <th className="py-1">คำอธิบาย</th>
                                      <th className="py-1 text-right">เดบิต (Dr.)</th>
                                      <th className="py-1 text-right">เครดิต (Cr.)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-steel-50">
                                    {lines.map((line) => (
                                      <tr key={line.id} className="hover:bg-steel-50/50">
                                        <td className="py-1 font-mono font-bold text-sky-800">
                                          {line.chart_of_accounts?.account_code}
                                        </td>
                                        <td className="py-1 text-steel-800 font-medium">
                                          {line.chart_of_accounts?.account_name_th}
                                        </td>
                                        <td className="py-1 text-steel-500 text-[11px]">
                                          {line.line_description}
                                        </td>
                                        <td className="py-1 text-right font-mono font-bold text-ink">
                                          {Number(line.debit) > 0 ? baht(line.debit) : '-'}
                                        </td>
                                        <td className="py-1 text-right font-mono font-bold text-ink">
                                          {Number(line.credit) > 0 ? baht(line.credit) : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="font-bold border-t border-steel-200 bg-steel-50/50">
                                      <td colSpan="3" className="py-1.5 text-right text-steel-600">
                                        ยอดรวมทั้งสิ้น:
                                      </td>
                                      <td className="py-1.5 text-right font-mono text-ink">
                                        {baht(totalDr)}
                                      </td>
                                      <td className="py-1.5 text-right font-mono text-ink">
                                        {baht(totalCr)}
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
        </div>
      ) : (
        /* CHART OF ACCOUNTS TABLE */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <span className="font-bold text-ink text-xs">
              ผังบัญชีมาตรฐานสำหรับธุรกิจก่อสร้างและพัฒนาโครงการ (SME Thai Chart of Accounts)
            </span>
            <span className="text-[11px] text-steel-500">
              33 บัญชีหลักจัดหมวดหมู่ตามมาตรฐานการรายงานทางการเงิน
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-steel-600">
              <thead className="bg-steel-50/75 font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-2.5">รหัสบัญชี</th>
                  <th className="px-4 py-2.5">ชื่อบัญชี (ภาษาไทย)</th>
                  <th className="px-4 py-2.5">ชื่อบัญชี (English)</th>
                  <th className="px-4 py-2.5 text-center">หมวดหมู่บัญชี</th>
                  <th className="px-4 py-2.5 text-center">ระบบกำหนด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {coaList.map((item) => (
                  <tr key={item.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-2.5 font-mono font-bold text-sky-800">
                      {item.account_code}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      {item.account_name_th}
                    </td>
                    <td className="px-4 py-2.5 text-steel-500 font-mono text-[11px]">
                      {item.account_name_en || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {getCategoryBadge(item.account_category)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.is_system_default ? (
                        <span className="text-emerald-700 text-[10px] font-bold"> ค่าเริ่มต้น</span>
                      ) : (
                        <span className="text-steel-400 text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

