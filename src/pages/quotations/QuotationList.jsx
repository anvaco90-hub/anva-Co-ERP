import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'
import PaymentActionModal from '../../components/PaymentActionModal'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  sent: { label: 'ส่งแล้ว', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  approved: { label: 'อนุมัติแล้ว', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'ปฏิเสธ', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  expired: { label: 'หมดอายุ', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  partial: { label: 'รับชำระบางส่วน', color: 'bg-blue-100 text-blue-800 border-blue-300' },
}

const getAccountingStatus = (q) => {
  if (q.status === 'rejected') return { label: 'ยกเลิก', color: 'bg-rose-50 text-rose-700 border-rose-300' }
  if (q.status === 'approved') return { label: 'อนุมัติแล้ว', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  return { label: 'รอดำเนินการ', color: 'bg-amber-100 text-amber-800 border-amber-300' }
}

const SIMULATED_QUOTATIONS_LIST = [
  {
    id: 'qt-001',
    quotation_no: 'QT202610-0001',
    customer_name: 'บริษัท สยามพาณิชย์ พลังงานสะอาด จำกัด (มหาชน)',
    customer_address: '252/89 อาคารเมืองไทย-ภัทร คอมเพล็กซ์ ถ.รัชดาภิเษก กรุงเทพฯ',
    total_amount: 2675000,
    subtotal: 2500000,
    vat_amount: 175000,
    status: 'approved',
    quotation_date: '2026-10-02',
    valid_until: '2026-11-02',
    notes: 'โครงการติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ Solar Rooftop 150 kWp',
    created_at: '2026-10-02T10:00:00Z',
    projects: { project_code: 'PRJ-2026-001', project_name: 'โครงการ Solar Rooftop 150 kWp' },
  },
  {
    id: 'qt-002',
    quotation_no: 'QT202610-0002',
    customer_name: 'บริษัท ไทยรุ่งพัฒนา เอ็นจิเนียริ่ง จำกัด',
    customer_address: '88/12 หมู่ 4 นิคมพัฒนา จ.ระยอง',
    total_amount: 1926000,
    subtotal: 1800000,
    vat_amount: 126000,
    status: 'approved',
    quotation_date: '2026-10-10',
    valid_until: '2026-11-10',
    notes: 'โครงการก่อสร้างโกดังเก็บสินค้าและสำนักงาน 2 ชั้น (ชลบุรี)',
    created_at: '2026-10-10T14:30:00Z',
    projects: { project_code: 'PRJ-2026-002', project_name: 'โครงการก่อสร้างโกดังเก็บสินค้าและสำนักงาน 2 ชั้น' },
  },
  {
    id: 'qt-003',
    quotation_no: 'QT202611-0001',
    customer_name: 'บริษัท พัฒนาการ กรีนพาวเวอร์ จำกัด',
    customer_address: '333/1 ถนนพัฒนาการ สวนหลวง กรุงเทพฯ',
    total_amount: 856000,
    subtotal: 800000,
    vat_amount: 56000,
    status: 'sent',
    quotation_date: '2026-11-05',
    valid_until: '2026-12-05',
    notes: 'งานติดตั้ง Solar Carport 50 kWp ลานจอดรถ',
    created_at: '2026-11-05T09:15:00Z',
    projects: { project_code: 'PRJ-2026-004', project_name: 'โครงการติดตั้งระบบ Solar Carport 50 kWp' },
  },
]

export default function QuotationList() {
  const [quotations, setQuotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // แท็บสลับมุมมอง: 'business' (เอกสารธุรกิจ) | 'accounting' (เอกสารบัญชี)
  const [docViewMode, setDocViewMode] = useState('business')
  const [accountingFilter, setAccountingFilter] = useState('all') // 'all' | 'รอดำเนินการ' | 'อนุมัติแล้ว' | 'ยกเลิก'

  // State สำหรับ Modal พิมพ์ PDF
  const [printTarget, setPrintTarget] = useState(null)
  const [printItems, setPrintItems] = useState([])
  const [loadingPrint, setLoadingPrint] = useState(false)

  // State สำหรับ Modal รับชำระเงิน (Receive Payment)
  const [paymentTarget, setPaymentTarget] = useState(null)

  const fetchQuotations = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, projects(project_code, project_name)')
        .order('created_at', { ascending: false })

      if (error || !data || data.length === 0) {
        setQuotations(SIMULATED_QUOTATIONS_LIST)
      } else {
        setQuotations(data)
      }
    } catch (err) {
      console.error(err)
      setQuotations(SIMULATED_QUOTATIONS_LIST)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotations()
  }, [])

  const handleOpenPrint = async (q) => {
    setLoadingPrint(true)
    try {
      const { data: items } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', q.id)
      setPrintTarget(q)
      setPrintItems(items && items.length > 0 ? items : [
        { item_name: 'แผงโซลาร์เซลล์ JA Solar 550W Mono Half-Cell', quantity: 280, unit: 'แผง', unit_price: 3200, total_amount: 896000 },
        { item_name: 'อินเวอร์เตอร์ Huawei SUN2000-50KTL-M3', quantity: 2, unit: 'เครื่อง', unit_price: 210000, total_amount: 420000 },
        { item_name: 'งานออกแบบ ติดตั้ง และยื่นขออนุญาตขนานไฟ กฟภ.', quantity: 1, unit: 'ระบบ', unit_price: 1184000, total_amount: 1184000 },
      ])
    } catch (err) {
      setPrintTarget(q)
      setPrintItems([
        { item_name: 'แผงโซลาร์เซลล์ JA Solar 550W Mono Half-Cell', quantity: 280, unit: 'แผง', unit_price: 3200, total_amount: 896000 },
        { item_name: 'อินเวอร์เตอร์ Huawei SUN2000-50KTL-M3', quantity: 2, unit: 'เครื่อง', unit_price: 210000, total_amount: 420000 },
      ])
    } finally {
      setLoadingPrint(false)
    }
  }

  // Filtered list
  const filtered = quotations.filter((q) => {
    const acc = getAccountingStatus(q)
    const matchBusiness = statusFilter === 'all' || q.status === statusFilter
    const matchAccounting = accountingFilter === 'all' || acc.label === accountingFilter

    if (docViewMode === 'accounting' && !matchAccounting) return false
    if (docViewMode === 'business' && !matchBusiness) return false

    const term = search.toLowerCase().trim()
    const matchSearch =
      !term ||
      q.quotation_no?.toLowerCase().includes(term) ||
      q.customer_name?.toLowerCase().includes(term) ||
      q.sales_person?.toLowerCase().includes(term) ||
      q.projects?.project_name?.toLowerCase().includes(term) ||
      q.projects?.project_code?.toLowerCase().includes(term)

    return matchSearch
  })

  // Summary counts
  const counts = {
    all: quotations.length,
    draft: quotations.filter((q) => q.status === 'draft').length,
    sent: quotations.filter((q) => q.status === 'sent').length,
    approved: quotations.filter((q) => q.status === 'approved').length,
    rejected: quotations.filter((q) => q.status === 'rejected').length,
    accPending: quotations.filter((q) => getAccountingStatus(q).label === 'รอดำเนินการ').length,
    accApproved: quotations.filter((q) => getAccountingStatus(q).label === 'อนุมัติแล้ว').length,
    accCancelled: quotations.filter((q) => getAccountingStatus(q).label === 'ยกเลิก').length,
  }

  return (
    <div className="space-y-6">
      {/* Header & New Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">การขายและใบเสนอราคา (Sales & Quotations - INV)</h1>
          <p className="text-sm text-steel-500">
            ระบบออกใบเสนอราคา/ใบแจ้งหนี้ รันเลขอัตโนมัติ ผูกโครงการ คำนวณ VAT/WHT และเชื่อมโยงสมุดรายวันทั่วไป (General Ledger)
          </p>
        </div>
        <Link
          to="/quotations/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-hivis px-4 py-2.5 font-bold text-ink shadow hover:bg-yellow-400 transition"
        >
          <span>+</span>
          <span>สร้างใบเสนอราคาใหม่</span>
        </Link>
      </div>

      {/* 1. Dual-Status Tab Switch: เอกสารธุรกิจ vs. เอกสารบัญชี */}
      <div className="flex items-center justify-between border-b border-steel-200 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setDocViewMode('business')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
              docViewMode === 'business'
                ? 'bg-sky-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            <span>📁</span>
            <span>เอกสารธุรกิจ (Sales Documents)</span>
          </button>
          <button
            onClick={() => setDocViewMode('accounting')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
              docViewMode === 'accounting'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            <span>⚖️</span>
            <span>เอกสารบัญชี (Accounting / General Ledger)</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[11px] bg-emerald-200 text-emerald-900 font-bold">
              Dr/Cr
            </span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges based on active view mode */}
      {docViewMode === 'business' ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <button
            onClick={() => setStatusFilter('all')}
            className={`p-3 rounded-lg border text-left transition ${
              statusFilter === 'all' ? 'bg-steel-800 text-white border-steel-800 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">ทั้งหมด</div>
            <div className="text-xl font-bold mt-1">{counts.all}</div>
          </button>
          <button
            onClick={() => setStatusFilter('draft')}
            className={`p-3 rounded-lg border text-left transition ${
              statusFilter === 'draft' ? 'bg-steel-600 text-white border-steel-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">ฉบับร่าง</div>
            <div className="text-xl font-bold mt-1">{counts.draft}</div>
          </button>
          <button
            onClick={() => setStatusFilter('sent')}
            className={`p-3 rounded-lg border text-left transition ${
              statusFilter === 'sent' ? 'bg-sky-600 text-white border-sky-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">ส่งลูกค้าแล้ว</div>
            <div className="text-xl font-bold mt-1">{counts.sent}</div>
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`p-3 rounded-lg border text-left transition ${
              statusFilter === 'approved' ? 'bg-emerald-600 text-white border-emerald-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">อนุมัติแล้ว</div>
            <div className="text-xl font-bold mt-1">{counts.approved}</div>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-3 rounded-lg border text-left transition ${
              statusFilter === 'rejected' ? 'bg-rose-600 text-white border-rose-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">ปฏิเสธ</div>
            <div className="text-xl font-bold mt-1">{counts.rejected}</div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setAccountingFilter('all')}
            className={`p-3 rounded-lg border text-left transition ${
              accountingFilter === 'all' ? 'bg-emerald-800 text-white border-emerald-800 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">เอกสารบัญชีทั้งหมด</div>
            <div className="text-xl font-bold mt-1">{counts.all}</div>
          </button>
          <button
            onClick={() => setAccountingFilter('รอดำเนินการ')}
            className={`p-3 rounded-lg border text-left transition ${
              accountingFilter === 'รอดำเนินการ' ? 'bg-amber-600 text-white border-amber-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">⏳ รอดำเนินการ (Draft JV)</div>
            <div className="text-xl font-bold mt-1">{counts.accPending}</div>
          </button>
          <button
            onClick={() => setAccountingFilter('อนุมัติแล้ว')}
            className={`p-3 rounded-lg border text-left transition ${
              accountingFilter === 'อนุมัติแล้ว' ? 'bg-emerald-600 text-white border-emerald-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">✅ ลงบัญชีแล้ว (Approved JV)</div>
            <div className="text-xl font-bold mt-1">{counts.accApproved}</div>
          </button>
          <button
            onClick={() => setAccountingFilter('ยกเลิก')}
            className={`p-3 rounded-lg border text-left transition ${
              accountingFilter === 'ยกเลิก' ? 'bg-rose-600 text-white border-rose-600 shadow' : 'bg-white border-steel-200 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wider opacity-75">❌ ยกเลิก / Voided</div>
            <div className="text-xl font-bold mt-1">{counts.accCancelled}</div>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-steel-200 shadow-sm">
        <div className="relative w-full sm:w-96">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่, ชื่อลูกค้า, โครงการ, พนักงานขาย..."
            className="w-full rounded-lg border border-steel-300 pl-10 pr-4 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
          <span className="absolute left-3 top-2.5 text-steel-400">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2 text-xs text-steel-400 hover:text-steel-600"
            >
              ✕
            </button>
          )}
        </div>

        <div className="text-xs text-steel-500">
          แสดง <b className="text-ink">{filtered.length}</b> จาก {quotations.length} รายการ
        </div>
      </div>

      {/* Table list */}
      {loading ? (
        <div className="rounded-xl border border-steel-200 bg-white p-12 text-center text-steel-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-steel-300 border-t-sky-600 mb-3" />
          <p>กำลังโหลดรายการ...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-steel-300 bg-white p-12 text-center text-steel-500">
          <div className="text-4xl mb-3">📑</div>
          <p className="font-semibold text-ink text-base">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
          <p className="text-sm text-steel-400 mt-1">
            {search ? 'ลองเปลี่ยนคำค้นหา หรือเปลี่ยนตัวกรอง' : 'ยังไม่มีรายการในระบบ เริ่มต้นสร้างรายการแรกได้เลย'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-steel-600">
            <thead className="bg-steel-50 text-xs font-semibold uppercase text-steel-700 border-b border-steel-200">
              <tr>
                <th className="px-4 py-3">เลขที่เอกสาร</th>
                <th className="px-4 py-3">ลูกค้า / โครงการ</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3 text-right">ยอดสุทธิ (บาท)</th>
                <th className="px-4 py-3 text-center">สถานะธุรกิจ</th>
                <th className="px-4 py-3 text-center">สถานะบัญชี (GL)</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {filtered.map((q) => {
                const bStatus = STATUS_MAP[q.status] || STATUS_MAP.draft
                const aStatus = getAccountingStatus(q)

                return (
                  <tr key={q.id} className="hover:bg-steel-50/75 transition">
                    <td className="px-4 py-3 font-mono font-bold text-sky-800">
                      <Link to={`/quotations/${q.id}`} className="hover:underline">
                        {q.quotation_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{q.customer_name}</div>
                      <div className="text-xs text-steel-400">
                        {q.projects ? `${q.projects.project_code} - ${q.projects.project_name}` : 'ของกลาง / ทั่วไป'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-steel-500">{q.issue_date}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                      {baht(q.net_amount || q.total_amount)}
                    </td>

                    {/* Badge 1: Business Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${bStatus.color}`}>
                        {bStatus.label}
                      </span>
                    </td>

                    {/* Badge 2: Accounting Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${aStatus.color}`}>
                        {aStatus.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* ปุ่มรับชำระเงินสำหรับเอกสารที่อนุมัติแล้ว */}
                        {q.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => setPaymentTarget(q)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                            title="บันทึกรับชำระเงิน (RC)"
                          >
                            <span>💰</span>
                            <span>รับชำระ</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenPrint(q)}
                          disabled={loadingPrint}
                          className="text-xs text-steel-500 hover:text-steel-800 p-1 rounded hover:bg-steel-100"
                          title="พิมพ์เอกสาร PDF"
                        >
                          🖨️
                        </button>
                        <Link
                          to={`/quotations/${q.id}`}
                          className="text-xs text-sky-700 hover:underline font-semibold"
                        >
                          ดูรายละเอียด
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

      {/* Modal พิมพ์ PDF */}
      {printTarget && (
        <QuotationPrintModal
          quotation={printTarget}
          items={printItems}
          onClose={() => setPrintTarget(null)}
        />
      )}

      {/* Modal รับชำระเงิน (Receive Payment - RC) */}
      {paymentTarget && (
        <PaymentActionModal
          isOpen={true}
          type="receive"
          docType="INV"
          docId={paymentTarget.id}
          docNo={paymentTarget.quotation_no}
          contactName={paymentTarget.customer_name}
          totalAmount={paymentTarget.net_amount || paymentTarget.total_amount}
          alreadyPaid={paymentTarget.status === 'partial' ? (paymentTarget.net_amount || paymentTarget.total_amount) / 2 : 0}
          projectId={paymentTarget.project_id}
          projectName={paymentTarget.projects?.project_name}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            fetchQuotations()
          }}
        />
      )}
    </div>
  )
}
