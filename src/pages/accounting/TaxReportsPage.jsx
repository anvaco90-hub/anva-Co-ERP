import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { formatBaht, formatThaiDate, exportToCSV, exportRDPrepWHT } from '../../lib/accounting'
import {
  FileText, Calendar, Filter, Download, Printer, RefreshCw,
  Building2, Percent, CheckCircle2, Search, ArrowUpDown
} from 'lucide-react'

export const COMPANY_PROFILE = {
  name: 'บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)',
  taxId: '0105566012345',
  branch: 'สำนักงานใหญ่ (สาขา 00000)',
  address: 'เลขที่ 123/45 ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร 10250',
  tel: '02-123-4567',
}

export default function TaxReportsPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [activeTab, setActiveTab] = useState('output_vat') // 'output_vat' | 'input_vat' | 'wht'
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [whtFormFilter, setWhtFormFilter] = useState('ALL') // 'ALL' | 'WHT_3' | 'WHT_53'

  // Data
  const [taxRecords, setTaxRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      // ดึงข้อมูล tax_records โดยตรงเพื่อป้องกัน HTTP 400 จาก PostgREST เนื่องจาก schema ไม่มี FK constraint ไปยัง contacts
      const { data: taxList, error: taxErr } = await supabase
        .from('tax_records')
        .select('*')
        .eq('tax_year', selectedYear)
        .eq('tax_month', selectedMonth)
        .order('document_date', { ascending: true })

      if (taxErr) {
        console.warn('Cannot load tax_records:', taxErr)
        setTaxRecords([])
        return
      }

      const contactIds = [...new Set((taxList || []).map((r) => r.contact_id).filter(Boolean))]
      const projectIds = [...new Set((taxList || []).map((r) => r.project_id).filter(Boolean))]

      const [contactsRes, vendorsRes, customersRes, projectsRes] = await Promise.all([
        contactIds.length > 0
          ? supabase.from('contacts').select('id, company_name, business_name, tax_id, branch_code, address').in('id', contactIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from('vendors').select('id, vendor_name, tax_id, address').in('id', contactIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from('customers').select('id, customer_name, tax_id, address').in('id', contactIds)
          : { data: [] },
        projectIds.length > 0
          ? supabase.from('projects').select('id, project_code, project_name').in('id', projectIds)
          : { data: [] },
      ])

      const contactMap = {}
      for (const v of vendorsRes.data || []) {
        contactMap[v.id] = {
          id: v.id,
          company_name: v.vendor_name,
          business_name: v.vendor_name,
          tax_id: v.tax_id,
          branch_code: '00000',
          address: v.address,
        }
      }
      for (const cu of customersRes.data || []) {
        if (!contactMap[cu.id]) {
          contactMap[cu.id] = {
            id: cu.id,
            company_name: cu.customer_name,
            business_name: cu.customer_name,
            tax_id: cu.tax_id,
            branch_code: '00000',
            address: cu.address,
          }
        }
      }
      for (const c of contactsRes.data || []) {
        contactMap[c.id] = c
      }
      const projectMap = Object.fromEntries((projectsRes.data || []).map((p) => [p.id, p]))

      const mapped = (taxList || []).map((r) => ({
        ...r,
        contacts: contactMap[r.contact_id] ? {
          ...contactMap[r.contact_id],
          company_name: contactMap[r.contact_id].company_name || contactMap[r.contact_id].business_name,
        } : null,
        projects: projectMap[r.project_id] || null,
      }))

      setTaxRecords(mapped)
    } catch (err) {
      console.error('Error loading tax records:', err)
      setTaxRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedYear])

  // Split into Output VAT, Input VAT, and WHT
  const outputVatRows = useMemo(() => {
    return taxRecords.filter((r) => r.tax_type === 'OUTPUT_VAT')
  }, [taxRecords])

  const inputVatRows = useMemo(() => {
    return taxRecords.filter((r) => r.tax_type === 'INPUT_VAT')
  }, [taxRecords])

  const whtRows = useMemo(() => {
    return taxRecords.filter((r) => {
      if (r.tax_type !== 'WHT_3' && r.tax_type !== 'WHT_53') return false
      if (whtFormFilter !== 'ALL' && r.tax_type !== whtFormFilter) return false
      return true
    })
  }, [taxRecords, whtFormFilter])

  // Totals calculations
  const totalOutputBase = outputVatRows.reduce((s, r) => s + Number(r.base_amount || 0), 0)
  const totalOutputVat = outputVatRows.reduce((s, r) => s + Number(r.vat_amount || 0), 0)

  const totalInputBase = inputVatRows.reduce((s, r) => s + Number(r.base_amount || 0), 0)
  const totalInputVat = inputVatRows.reduce((s, r) => s + Number(r.vat_amount || 0), 0)

  const totalWhtBase = whtRows.reduce((s, r) => s + Number(r.base_amount || 0), 0)
  const totalWhtAmount = whtRows.reduce((s, r) => s + Number(r.wht_amount || 0), 0)

  // Net VAT payable or refundable (ภาษีขาย - ภาษีซื้อ)
  const netVatPayable = totalOutputVat - totalInputVat

  // Export Output VAT CSV
  const handleExportOutputVAT = () => {
    const headers = [
      'ลำดับ', 'วันที่', 'เลขที่ใบกำกับภาษี', 'ชื่อผู้ซื้อสินค้า/บริการ', 'โครงการ',
      'เลขประจำตัวผู้เสียภาษี', 'สาขา', 'มูลค่าสินค้า/บริการ', 'ภาษีมูลค่าเพิ่ม 7%'
    ]
    const rows = outputVatRows.map((r, i) => [
      i + 1,
      r.document_date,
      r.document_no,
      r.contacts?.company_name || 'ลูกค้าทั่วไป',
      r.projects?.project_code || '-',
      r.contacts?.tax_id || '-',
      r.contacts?.branch_code || '00000',
      r.base_amount,
      r.vat_amount,
    ])
    exportToCSV(`รายงานภาษีขาย_ภพ30_${selectedYear}_${selectedMonth}`, headers, rows)
  }

  // Export Input VAT CSV
  const handleExportInputVAT = () => {
    const headers = [
      'ลำดับ', 'วันที่', 'ใบกำกับภาษีผู้ขาย', 'เลขที่เอกสารภายใน', 'ชื่อผู้ขาย/ผู้ให้บริการ',
      'โครงการ', 'เลขประจำตัวผู้เสียภาษี', 'มูลค่าสินค้า/บริการ', 'ภาษีมูลค่าเพิ่ม 7%'
    ]
    const rows = inputVatRows.map((r, i) => [
      i + 1,
      r.document_date,
      r.vendor_tax_invoice_no || r.document_no,
      r.document_no,
      r.contacts?.company_name || 'ผู้จำหน่าย/คู่ค้า',
      r.projects?.project_code || '-',
      r.contacts?.tax_id || '-',
      r.base_amount,
      r.vat_amount,
    ])
    exportToCSV(`รายงานภาษีซื้อ_ภพ30_${selectedYear}_${selectedMonth}`, headers, rows)
  }

  // Export RD Prep file for WHT
  const handleExportRDPrep = () => {
    const records = whtRows.map((r) => ({
      tax_id: r.contacts?.tax_id || '0000000000000',
      branch_code: r.contacts?.branch_code || '00000',
      contact_name: r.contacts?.company_name || 'คู่ค้า',
      document_date: r.document_date,
      wht_rate: r.wht_rate || 3,
      base_amount: r.base_amount,
      wht_amount: r.wht_amount,
    }))
    exportRDPrepWHT(`RDPREP_WHT_${selectedYear}_${selectedMonth}`, records, whtFormFilter)
  }

  return (
    <div className="space-y-5">
      {/* Official Tax Company Header Box */}
      <div className="bg-white p-5 rounded-xl border border-steel-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-ink">{COMPANY_PROFILE.name}</h1>
              <p className="text-xs text-steel-500">
                เลขประจำตัวผู้เสียภาษีอากร: <span className="font-mono font-bold text-sky-800">{COMPANY_PROFILE.taxId}</span> | {COMPANY_PROFILE.branch}
              </p>
            </div>
          </div>

          {/* Period Selector (Month / Year) */}
          <div className="flex items-center gap-2 bg-steel-50 p-2 rounded-xl border border-steel-200">
            <Calendar className="h-4 w-4 text-steel-500" />
            <span className="text-xs font-bold text-steel-700">งวดภาษี:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-2 py-1 text-xs font-semibold rounded border border-steel-200 bg-white"
            >
              {[
                'มกราคม (01)', 'กุมภาพันธ์ (02)', 'มีนาคม (03)', 'เมษายน (04)',
                'พฤษภาคม (05)', 'มิถุนายน (06)', 'กรกฎาคม (07)', 'สิงหาคม (08)',
                'กันยายน (09)', 'ตุลาคม (10)', 'พฤศจิกายน (11)', 'ธันวาคม (12)'
              ].map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 text-xs font-semibold rounded border border-steel-200 bg-white font-mono"
            >
              <option value={currentYear}>{currentYear} (พ.ศ. {currentYear + 543})</option>
              <option value={currentYear - 1}>{currentYear - 1} (พ.ศ. {currentYear + 542})</option>
            </select>
            <button
              onClick={loadData}
              className="p-1 text-steel-500 hover:text-sky-700 rounded transition"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between text-xs text-steel-500 gap-2">
          <div>
            <span className="font-semibold text-steel-700">ที่ตั้งสำนักงาน:</span> {COMPANY_PROFILE.address}
          </div>
          <div>
            <span className="font-semibold text-steel-700">โทรศัพท์:</span> {COMPANY_PROFILE.tel}
          </div>
        </div>
      </div>

      {/* VAT Summary Comparison Bar (ภ.พ.30 Net) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-sky-50 rounded-xl border border-sky-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-sky-700 font-medium block">ภาษีขายเดือนนี้ (Output VAT)</span>
            <span className="text-lg font-bold text-sky-900 font-mono">{formatBaht(totalOutputVat)}</span>
          </div>
          <span className="text-xs bg-sky-200/70 text-sky-800 px-2 py-0.5 rounded font-bold">
            {outputVatRows.length} ใบกำกับ
          </span>
        </div>

        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-emerald-700 font-medium block">ภาษีซื้อเดือนนี้ (Input VAT)</span>
            <span className="text-lg font-bold text-emerald-900 font-mono">{formatBaht(totalInputVat)}</span>
          </div>
          <span className="text-xs bg-emerald-200/70 text-emerald-800 px-2 py-0.5 rounded font-bold">
            {inputVatRows.length} ใบกำกับ
          </span>
        </div>

        <div className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between ${
          netVatPayable >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-purple-50 border-purple-200'
        }`}>
          <div>
            <span className={`text-[11px] font-medium block ${netVatPayable >= 0 ? 'text-amber-700' : 'text-purple-700'}`}>
              {netVatPayable >= 0 ? 'ภาษีมูลค่าเพิ่มที่ต้องชำระ (ภ.พ.30)' : 'ภาษีชำระเกิน (ขอคืน/เครดิตยกไป)'}
            </span>
            <span className={`text-lg font-bold font-mono ${netVatPayable >= 0 ? 'text-amber-900' : 'text-purple-900'}`}>
              {formatBaht(Math.abs(netVatPayable))}
            </span>
          </div>
          <span className="text-xs font-bold text-steel-500">
            {netVatPayable >= 0 ? 'ยื่นแบบนำส่ง' : 'เครดิตภาษี'}
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-steel-200 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('output_vat')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'output_vat'
                ? 'bg-sky-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            รายงานภาษีขาย (Output VAT - ภ.พ.30)
          </button>
          <button
            onClick={() => setActiveTab('input_vat')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'input_vat'
                ? 'bg-sky-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            รายงานภาษีซื้อ (Input VAT - ภ.พ.30)
          </button>
          <button
            onClick={() => setActiveTab('wht')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'wht'
                ? 'bg-sky-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            รายงานภาษีหัก ณ ที่จ่าย (WHT - ภ.ง.ด.3 / 53)
          </button>
        </div>

        {/* Action Button for Current Tab */}
        <div>
          {activeTab === 'output_vat' && (
            <button
              onClick={handleExportOutputVAT}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition shadow-sm"
            >
              <Download className="h-3.5 w-3.5" /> Export ภ.พ.30 ภาษีขาย
            </button>
          )}
          {activeTab === 'input_vat' && (
            <button
              onClick={handleExportInputVAT}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition shadow-sm"
            >
              <Download className="h-3.5 w-3.5" /> Export ภ.พ.30 ภาษีซื้อ
            </button>
          )}
          {activeTab === 'wht' && (
            <button
              onClick={handleExportRDPrep}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 text-white rounded-lg text-xs font-bold hover:bg-purple-800 transition shadow-sm"
            >
              <Download className="h-3.5 w-3.5" /> ส่งออกไฟล์ยื่นแบบออนไลน์ (RD Prep TXT/CSV)
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-steel-400">กำลังโหลดรายงานภาษี...</div>
      ) : activeTab === 'output_vat' ? (
        /* TAB 1: รายงานภาษีขาย (OUTPUT VAT) */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-steel-50 border-b border-steel-200 flex justify-between items-center text-xs">
            <span className="font-bold text-steel-800">
              รายงานภาษีขาย ประจำเดือน {selectedMonth}/{selectedYear} (ตามมาตรา 87(1) แห่งประมวลรัษฎากร)
            </span>
            <span className="text-steel-500">รวมทั้งสิ้น {outputVatRows.length} รายการ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="table-auto w-full text-left text-xs text-steel-600">
              <thead className="bg-steel-50/80 text-steel-700 border-b border-steel-200 font-bold text-[11px]">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center whitespace-nowrap">ลำดับ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">วัน เดือน ปี</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">เลขที่ใบกำกับภาษี</th>
                  <th className="px-3 py-2.5 min-w-[180px]">ชื่อผู้ซื้อสินค้า / บริการ (ลูกค้า)</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">โครงการ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">เลขผู้เสียภาษี</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">สาขา</th>
                  <th className="px-3 py-2.5 text-right font-bold text-steel-700 whitespace-nowrap">มูลค่าสินค้า (บาท)</th>
                  <th className="px-3 py-2.5 text-right font-bold text-sky-800 whitespace-nowrap">ภาษีมูลค่าเพิ่ม 7%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {outputVatRows.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-10 text-steel-400">
                      ไม่พบข้อมูลภาษีขายในงวดเดือนที่เลือก
                    </td>
                  </tr>
                ) : (
                  outputVatRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-steel-50/50 transition">
                      <td className="px-3 py-2.5 text-center text-steel-400 font-mono whitespace-nowrap">{idx + 1}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatThaiDate(row.document_date, false)}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-sky-800 whitespace-nowrap">{row.document_no}</td>
                      <td className="px-3 py-2.5 font-semibold text-ink min-w-[180px]">{row.contacts?.company_name || 'ลูกค้าทั่วไป'}</td>
                      <td className="px-3 py-2.5 text-steel-600 whitespace-nowrap">{row.projects?.project_code || '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-steel-500 whitespace-nowrap">{row.contacts?.tax_id || '-'}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-[11px] whitespace-nowrap">{row.contacts?.branch_code || '00000'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap tabular-nums">{formatBaht(row.base_amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-800 whitespace-nowrap tabular-nums">{formatBaht(row.vat_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {outputVatRows.length > 0 && (
                <tfoot className="bg-steel-100/75 font-bold text-xs border-t-2 border-steel-300">
                  <tr>
                    <td colSpan="7" className="px-3 py-2.5 text-right text-steel-700 whitespace-nowrap">
                      ยอดรวมภาษีขายทั้งสิ้น (Total Output VAT):
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink whitespace-nowrap tabular-nums">
                      {formatBaht(totalOutputBase)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-sky-900 text-sm whitespace-nowrap tabular-nums">
                      {formatBaht(totalOutputVat)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : activeTab === 'input_vat' ? (
        /* TAB 2: รายงานภาษีซื้อ (INPUT VAT) */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-steel-50 border-b border-steel-200 flex justify-between items-center text-xs">
            <span className="font-bold text-steel-800">
              รายงานภาษีซื้อ ประจำเดือน {selectedMonth}/{selectedYear} (ตามมาตรา 87(2) แห่งประมวลรัษฎากร)
            </span>
            <span className="text-steel-500">รวมทั้งสิ้น {inputVatRows.length} รายการ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="table-auto w-full text-left text-xs text-steel-600">
              <thead className="bg-steel-50/80 text-steel-700 border-b border-steel-200 font-bold text-[11px]">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center whitespace-nowrap">ลำดับ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">วัน เดือน ปี</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">ใบกำกับภาษีผู้ขาย</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">เลขที่เอกสารภายใน</th>
                  <th className="px-3 py-2.5 min-w-[180px]">ชื่อผู้ขาย / ผู้ให้บริการ (คู่ค้า)</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">โครงการ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">เลขผู้เสียภาษี</th>
                  <th className="px-3 py-2.5 text-right font-bold text-steel-700 whitespace-nowrap">มูลค่าสินค้า (บาท)</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-800 whitespace-nowrap">ภาษีมูลค่าเพิ่ม 7%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {inputVatRows.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-10 text-steel-400">
                      ไม่พบข้อมูลภาษีซื้อในงวดเดือนที่เลือก
                    </td>
                  </tr>
                ) : (
                  inputVatRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-steel-50/50 transition">
                      <td className="px-3 py-2.5 text-center text-steel-400 font-mono whitespace-nowrap">{idx + 1}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatThaiDate(row.document_date, false)}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-emerald-800 whitespace-nowrap">
                        {row.vendor_tax_invoice_no || row.document_no}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-steel-500 whitespace-nowrap">{row.document_no}</td>
                      <td className="px-3 py-2.5 font-semibold text-ink min-w-[180px]">{row.contacts?.company_name || 'ผู้จำหน่าย/คู่ค้า'}</td>
                      <td className="px-3 py-2.5 text-steel-600 whitespace-nowrap">{row.projects?.project_code || '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-steel-500 whitespace-nowrap">{row.contacts?.tax_id || '-'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap tabular-nums">{formatBaht(row.base_amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800 whitespace-nowrap tabular-nums">{formatBaht(row.vat_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {inputVatRows.length > 0 && (
                <tfoot className="bg-steel-100/75 font-bold text-xs border-t-2 border-steel-300">
                  <tr>
                    <td colSpan="7" className="px-3 py-2.5 text-right text-steel-700 whitespace-nowrap">
                      ยอดรวมภาษีซื้อทั้งสิ้น (Total Input VAT):
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink whitespace-nowrap tabular-nums">
                      {formatBaht(totalInputBase)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-900 text-sm whitespace-nowrap tabular-nums">
                      {formatBaht(totalInputVat)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* TAB 3: รายงานภาษีหัก ณ ที่จ่าย (WITHHOLDING TAX - ภ.ง.ด.3 / ภ.ง.ด.53) */
        <div className="space-y-4">
          {/* Sub-Filter for WHT */}
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-steel-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-steel-700">ประเภทแบบยื่น:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setWhtFormFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    whtFormFilter === 'ALL' ? 'bg-purple-700 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                  }`}
                >
                  ทั้งหมด (All WHT)
                </button>
                <button
                  onClick={() => setWhtFormFilter('WHT_3')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    whtFormFilter === 'WHT_3' ? 'bg-purple-700 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                  }`}
                >
                  ภ.ง.ด. 3 (บุคคลธรรมดา)
                </button>
                <button
                  onClick={() => setWhtFormFilter('WHT_53')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    whtFormFilter === 'WHT_53' ? 'bg-purple-700 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                  }`}
                >
                  ภ.ง.ด. 53 (นิติบุคคล)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <div>ฐานภาษีรวม: <span className="text-ink">{formatBaht(totalWhtBase)}</span></div>
              <div>ภาษีหักรวม: <span className="text-purple-800">{formatBaht(totalWhtAmount)}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-left text-xs text-steel-600">
                <thead className="bg-steel-50/80 text-steel-700 border-b border-steel-200 font-bold text-[11px]">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center whitespace-nowrap">ลำดับ</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">วัน เดือน ปี</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">แบบฟอร์ม</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">เลขที่เอกสาร</th>
                    <th className="px-3 py-2.5 min-w-[180px]">ผู้ถูกหักภาษี ณ ที่จ่าย</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">เลขประจำตัวผู้เสียภาษี</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">อัตราภาษี (%)</th>
                    <th className="px-3 py-2.5 text-right font-bold text-steel-700 whitespace-nowrap">ยอดเงินได้ที่จ่าย (บาท)</th>
                    <th className="px-3 py-2.5 text-right font-bold text-purple-800 whitespace-nowrap">ภาษีที่หักและนำส่ง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {whtRows.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center py-10 text-steel-400">
                        ไม่พบข้อมูลภาษีหัก ณ ที่จ่ายในงวดเดือนและประเภทที่เลือก
                      </td>
                    </tr>
                  ) : (
                    whtRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-steel-50/50 transition">
                        <td className="px-3 py-2.5 text-center text-steel-400 font-mono whitespace-nowrap">{idx + 1}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatThaiDate(row.document_date, false)}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            row.tax_type === 'WHT_3' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {row.tax_type === 'WHT_3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-ink whitespace-nowrap">{row.document_no}</td>
                        <td className="px-3 py-2.5 font-semibold text-ink min-w-[180px]">{row.contacts?.company_name || 'คู่ค้า'}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-steel-500 whitespace-nowrap">{row.contacts?.tax_id || '-'}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-700 whitespace-nowrap">{row.wht_rate || 3}%</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap tabular-nums">{formatBaht(row.base_amount)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-purple-800 whitespace-nowrap tabular-nums">{formatBaht(row.wht_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {whtRows.length > 0 && (
                  <tfoot className="bg-steel-100/75 font-bold text-xs border-t-2 border-steel-300">
                    <tr>
                      <td colSpan="7" className="px-3 py-2.5 text-right text-steel-700 whitespace-nowrap">
                        ยอดรวมภาษีหัก ณ ที่จ่ายทั้งสิ้น:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink whitespace-nowrap tabular-nums">
                        {formatBaht(totalWhtBase)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-purple-900 text-sm whitespace-nowrap tabular-nums">
                        {formatBaht(totalWhtAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

