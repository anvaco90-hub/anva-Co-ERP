import { useEffect, useState, useMemo } from 'react'
import { getItemProjectUsageHistory } from '../lib/purchasingHistory'
import { baht } from '../lib/projects'
import { Calendar, Filter, Building2, ShoppingCart, ArrowDownLeft, X } from 'lucide-react'

export default function ItemProjectUsageModal({ item, onClose }) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'po' | 'issues'
  const [data, setData] = useState({
    byProject: [],
    poTransactions: [],
    issueTransactions: [],
    totalPurchased: 0,
    totalIssued: 0,
  })

  // ตัวกรองช่วงเวลา (Date Range Filters)
  const [datePreset, setDatePreset] = useState('all') // 'all' | '30days' | '90days' | 'thisYear' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!item) return
    setLoading(true)
    getItemProjectUsageHistory(item.item_name, item.id)
      .then((res) => setData(res))
      .finally(() => setLoading(false))
  }, [item])

  // จัดการเปลี่ยน Preset ช่วงเวลา
  const handlePreset = (preset) => {
    setDatePreset(preset)
    const today = new Date()
    const formatDate = (d) => d.toISOString().slice(0, 10)

    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else if (preset === '30days') {
      const past30 = new Date()
      past30.setDate(today.getDate() - 30)
      setStartDate(formatDate(past30))
      setEndDate(formatDate(today))
    } else if (preset === '90days') {
      const past90 = new Date()
      past90.setDate(today.getDate() - 90)
      setStartDate(formatDate(past90))
      setEndDate(formatDate(today))
    } else if (preset === 'thisYear') {
      const firstDay = new Date(today.getFullYear(), 0, 1)
      setStartDate(formatDate(firstDay))
      setEndDate(formatDate(today))
    }
  }

  // กรองรายการ PO ตามช่วงเวลาที่เลือก
  const filteredPos = useMemo(() => {
    return (data.poTransactions || []).filter((po) => {
      if (!po.date) return true
      if (startDate && po.date < startDate) return false
      if (endDate && po.date > endDate) return false
      return true
    })
  }, [data.poTransactions, startDate, endDate])

  // กรองรายการใบเบิกตามช่วงเวลาที่เลือก
  const filteredIssues = useMemo(() => {
    return (data.issueTransactions || []).filter((iss) => {
      if (!iss.date) return true
      if (startDate && iss.date < startDate) return false
      if (endDate && iss.date > endDate) return false
      return true
    })
  }, [data.issueTransactions, startDate, endDate])

  // คำนวณสรุปตามช่วงเวลา
  const periodPurchasedQty = useMemo(() => {
    return filteredPos.reduce((s, p) => s + (p.quantity || 0), 0)
  }, [filteredPos])

  const periodPurchasedAmount = useMemo(() => {
    return filteredPos.reduce((s, p) => s + (p.totalAmount || 0), 0)
  }, [filteredPos])

  const periodIssuedQty = useMemo(() => {
    return filteredIssues.reduce((s, i) => s + (i.quantity || 0), 0)
  }, [filteredIssues])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl transition-all overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. ส่วนหัว Modal */}
        <div className="flex items-start justify-between border-b border-steel-100 dark:border-slate-800 p-5 bg-steel-50/60 dark:bg-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 font-bold text-base border border-sky-200 dark:border-sky-800">
                </span>
              <div>
                <h3 className="text-base font-bold text-ink dark:text-slate-100">
                  ประวัติการเคลื่อนไหวและการใช้วัสดุ (Material Movement History)
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-steel-500 dark:text-slate-400">
                  <span className="font-semibold text-sky-700 dark:text-amber-400 font-mono">[{item.item_code || 'ITM'}]</span>
                  <span className="font-bold text-ink dark:text-slate-100 text-sm">{item.item_name}</span>
                  {item.unit && <span className="bg-steel-200/60 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[11px] font-medium text-steel-700 dark:text-slate-200 border border-steel-200 dark:border-slate-700">{item.unit}</span>}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-steel-400 hover:bg-steel-200 dark:hover:bg-slate-800 hover:text-steel-700 dark:hover:text-slate-200 transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. แถบตัวกรองช่วงเวลา (Date Range Filter Bar) */}
        <div className="border-b border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-steel-600 dark:text-slate-300 flex items-center gap-1 mr-1">
              <Filter className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
              ช่วงเวลา:
            </span>
            <button
              onClick={() => handlePreset('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                datePreset === 'all' ? 'bg-sky-700 text-white shadow-2xs' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => handlePreset('30days')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                datePreset === '30days' ? 'bg-sky-700 text-white shadow-2xs' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
              }`}
            >
              30 วันล่าสุด
            </button>
            <button
              onClick={() => handlePreset('90days')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                datePreset === '90days' ? 'bg-sky-700 text-white shadow-2xs' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
              }`}
            >
              3 เดือนล่าสุด
            </button>
            <button
              onClick={() => handlePreset('thisYear')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                datePreset === 'thisYear' ? 'bg-sky-700 text-white shadow-2xs' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
              }`}
            >
              ปีนี้ (2569)
            </button>
          </div>

          {/* ปฏิทินเลือกวันที่เริ่มต้น - สิ้นสุด */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-steel-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-steel-200 dark:border-slate-700">
              <Calendar className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="bg-transparent text-xs text-steel-800 dark:text-slate-200 outline-none"
                title="จากวันที่"
              />
              <span className="text-steel-400">ถึง</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="bg-transparent text-xs text-steel-800 dark:text-slate-200 outline-none"
                title="ถึงวันที่"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => handlePreset('all')}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                title="ล้างตัวกรองวันที่"
              >
                ล้าง
              </button>
            )}
          </div>
        </div>

        {/* 3. การ์ดสรุปยอดภาพรวมตามช่วงเวลาที่เลือก */}
        <div className="px-5 pt-4 pb-2 bg-steel-50/40 dark:bg-slate-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs">
              <div className="text-[11px] font-bold text-steel-500 dark:text-slate-400 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-steel-500 dark:text-slate-400" />
                โครงการที่นำไปใช้
              </div>
              <div className="mt-1 text-lg font-extrabold text-ink dark:text-slate-100 font-mono">
                {data.byProject.length} <span className="text-xs font-normal text-steel-500 dark:text-slate-400">โครงการ</span>
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/70 dark:bg-sky-950/40 p-3 shadow-2xs">
              <div className="text-[11px] font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1">
                <ShoppingCart className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" />
                ยอดสั่งซื้อในช่วงนี้ ({filteredPos.length} ใบ PO)
              </div>
              <div className="mt-1 text-lg font-extrabold text-sky-950 dark:text-sky-100 font-mono">
                {periodPurchasedQty} <span className="text-xs font-normal text-sky-700 dark:text-sky-300">{item.unit || 'หน่วย'}</span>
                {periodPurchasedAmount > 0 && (
                  <span className="text-xs font-medium text-steel-500 dark:text-slate-400 ml-2">({baht(periodPurchasedAmount)} บ.)</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 shadow-2xs">
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                ยอดเบิกใช้จริง ({filteredIssues.length} ใบเบิก)
              </div>
              <div className="mt-1 text-lg font-extrabold text-emerald-950 dark:text-emerald-100 font-mono">
                {periodIssuedQty} <span className="text-xs font-normal text-emerald-700 dark:text-emerald-300">{item.unit || 'หน่วย'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. แท็บเลือกมุมมอง (Tabs) */}
        <div className="px-5 border-b border-steel-200 dark:border-slate-800 flex items-center gap-2 pt-2 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'summary'
                ? 'border-sky-700 text-sky-900 dark:border-amber-400 dark:text-amber-400 font-extrabold'
                : 'border-transparent text-steel-500 dark:text-slate-400 hover:text-steel-800 dark:hover:text-slate-200'
            }`}
          >
            <span></span>
            <span>สรุปตามโครงการ ({data.byProject.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('po')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'po'
                ? 'border-sky-700 text-sky-900 dark:border-amber-400 dark:text-amber-400 font-extrabold'
                : 'border-transparent text-steel-500 dark:text-slate-400 hover:text-steel-800 dark:hover:text-slate-200'
            }`}
          >
            <span></span>
            <span>ประวัติการสั่งซื้อ PO ({filteredPos.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('issues')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'issues'
                ? 'border-sky-700 text-sky-900 dark:border-amber-400 dark:text-amber-400 font-extrabold'
                : 'border-transparent text-steel-500 dark:text-slate-400 hover:text-steel-800 dark:hover:text-slate-200'
            }`}
          >
            <span></span>
            <span>ประวัติการเบิกใช้สโตร์ ({filteredIssues.length})</span>
          </button>
        </div>

        {/* 5. เนื้อหาในตารางตามแท็บ */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-steel-500">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-steel-900 border-t-hivis mx-auto mb-2" />
              กำลังดึงข้อมูลประวัติการสั่งซื้อและเคลื่อนไหว...
            </div>
          ) : (
            <>
              {/* TAB 1: สรุปตามโครงการ */}
              {activeTab === 'summary' && (
                <div>
                  {data.byProject.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-steel-200 p-8 text-center text-xs text-steel-400">
                      ยังไม่พบประวัติการสั่งซื้อหรือเบิกใช้วัสดุนี้ในโครงการใดๆ
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-steel-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-steel-50 text-steel-600 font-semibold border-b border-steel-200">
                          <tr>
                            <th className="py-2.5 px-3">โครงการ</th>
                            <th className="text-right px-3">ยอดสั่งซื้อรวม (PO)</th>
                            <th className="text-right px-3">รับของแล้ว</th>
                            <th className="text-right px-3">เบิกไปใช้ (Issue)</th>
                            <th className="px-3">วันที่สั่ง/ใช้ล่าสุด</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {data.byProject.map((p) => (
                            <tr key={p.projectId} className="hover:bg-steel-50/60 transition">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-ink">{p.projectCode}</div>
                                <div className="text-steel-500 text-[11px]">{p.projectName || '-'}</div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-800">
                                {p.totalPurchased > 0 ? `${p.totalPurchased} ${item.unit || ''}` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-700">
                                {p.totalReceived > 0 ? `${p.totalReceived} ${item.unit || ''}` : '0'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium text-amber-800">
                                {p.totalIssued > 0 ? `${p.totalIssued} ${item.unit || ''}` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-steel-500 font-mono text-[11px]">
                                {p.lastDate || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ประวัติการสั่งซื้อ (PO Transactions) */}
              {activeTab === 'po' && (
                <div>
                  {filteredPos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-steel-200 p-8 text-center text-xs text-steel-400">
                      ไม่พบประวัติการสั่งซื้อ (PO) ในช่วงเวลาที่เลือก
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-steel-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-steel-50 text-steel-600 font-semibold border-b border-steel-200">
                          <tr>
                            <th className="py-2.5 px-3">วันที่สั่งซื้อ</th>
                            <th className="py-2.5 px-3">เลขที่ PO</th>
                            <th className="py-2.5 px-3">ร้านค้า / ผู้จำหน่าย</th>
                            <th className="py-2.5 px-3">โครงการ</th>
                            <th className="text-right px-3">จำนวน</th>
                            <th className="text-right px-3">ราคา/หน่วย</th>
                            <th className="text-right px-3">มูลค่ารวม</th>
                            <th className="text-right px-3">รับแล้ว</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {filteredPos.map((p) => (
                            <tr key={p.id} className="hover:bg-steel-50/60 transition">
                              <td className="py-2.5 px-3 font-mono text-steel-600">{p.date || '-'}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-sky-800">{p.poNo}</td>
                              <td className="py-2.5 px-3 text-steel-800 font-medium truncate max-w-[140px]" title={p.vendorName}>
                                {p.vendorName}
                              </td>
                              <td className="py-2.5 px-3 text-steel-600 truncate max-w-[150px]" title={p.projectName}>
                                <span className="font-semibold">{p.projectCode}</span> {p.projectName}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                                {p.quantity} <span className="text-[11px] text-steel-400 font-normal">{p.unit}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-steel-700">
                                {baht(p.unitPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-900">
                                {baht(p.totalAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  p.qtyReceived >= p.quantity
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : p.qtyReceived > 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-steel-100 text-steel-600'
                                }`}>
                                  {p.qtyReceived} / {p.quantity}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ประวัติการเบิกใช้สโตร์ (Issues) */}
              {activeTab === 'issues' && (
                <div>
                  {filteredIssues.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-steel-200 p-8 text-center text-xs text-steel-400">
                      ไม่พบประวัติการเบิกใช้ในโครงการในช่วงเวลาที่เลือก
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-steel-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-steel-50 text-steel-600 font-semibold border-b border-steel-200">
                          <tr>
                            <th className="py-2.5 px-3">วันที่เบิก</th>
                            <th className="py-2.5 px-3">เลขที่ใบเบิก (Issue)</th>
                            <th className="py-2.5 px-3">โครงการที่นำไปใช้</th>
                            <th className="text-right px-3">จำนวนที่เบิก</th>
                            <th className="py-2.5 px-3">หมายเหตุ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {filteredIssues.map((iss) => (
                            <tr key={iss.id} className="hover:bg-steel-50/60 transition">
                              <td className="py-2.5 px-3 font-mono text-steel-600">{iss.date || '-'}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{iss.issueNo}</td>
                              <td className="py-2.5 px-3 text-steel-800 font-medium">
                                <span className="font-semibold">{iss.projectCode}</span> {iss.projectName}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900">
                                {iss.quantity} <span className="text-[11px] text-steel-400 font-normal">{item.unit || ''}</span>
                              </td>
                              <td className="py-2.5 px-3 text-steel-500 text-[11px] truncate max-w-[180px]">
                                {iss.notes || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 6. ปุ่มปิดด้านล่าง */}
        <div className="border-t border-steel-100 px-5 py-3 bg-steel-50/50 flex justify-end">
          <button
            className="btn-primary !py-1.5 !px-4 text-xs font-bold cursor-pointer"
            onClick={onClose}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  )
}
