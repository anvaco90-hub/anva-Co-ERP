import { useState, useMemo } from 'react'
import { baht } from '../../lib/projects'
import {
  Printer,
  X,
  Calendar,
  Search,
  Building2,
  FileText,
  RotateCcw,
} from 'lucide-react'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

export default function GoodsReceiptReportModal({
  rows = [],
  projects = [],
  vendors = [],
  onClose,
  sourceModule = 'store', // 'store' | 'purchasing'
  userProfile,
}) {
  const now = new Date()
  const currentCEYear = now.getFullYear()
  const currentMonthIdx = now.getMonth()
  const todayStr = now.toISOString().slice(0, 10)

  // 1. ตัวเลือกช่วงเวลา (Period Type)
  // 'all' | 'daily' | 'monthly' | 'yearly' | 'custom'
  const [periodType, setPeriodType] = useState('monthly')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx)
  const [selectedYear, setSelectedYear] = useState(currentCEYear)
  const [customStart, setCustomStart] = useState(
    new Date(currentCEYear, currentMonthIdx, 1).toISOString().slice(0, 10)
  )
  const [customEnd, setCustomEnd] = useState(todayStr)

  // 2. ตัวกรองอื่น ๆ (สามารถพิมพ์ค้นหาโครงการและผู้จำหน่ายได้)
  const [filterProject, setFilterProject] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [reportNotes, setReportNotes] = useState(
    'รายงานสรุปประวัติการนำเข้าและตรวจรับพัสดุวิศวกรรม บริษัท แอนวา แอนด์ โค จำกัด'
  )

  // 3. ตัวเลือกการพิมพ์ (Print Display Options)
  const [paperOrientation, setPaperOrientation] = useState('landscape') // 'landscape' | 'portrait'
  const [showValuation, setShowValuation] = useState(true)

  // แปลงและ normalize ข้อมูลแถวให้เป็น format เดียวกันทั้งจาก Store และ Purchasing
  const normalizedRows = useMemo(() => {
    return (rows || []).map((r, idx) => {
      // โครงสร้างจาก Store (stock_lots) หรือ Purchasing (receivedMaterialsList)
      const gri = Array.isArray(r.goods_receipt_items) ? r.goods_receipt_items[0] : r.goods_receipt_items
      const grnObj = gri?.goods_receipts
      const poObj = grnObj?.purchase_orders

      const dateRaw = r.received_date || r.created_at || (poObj ? poObj.order_date : '') || ''
      const dateStr = dateRaw ? String(dateRaw).slice(0, 10) : ''

      const itemCode = r.inventory_items?.item_code || r.item_code || '-'
      const itemName = r.inventory_items?.item_name || r.item_name || 'วัสดุ/อุปกรณ์'
      const unit = r.inventory_items?.unit || r.unit || 'หน่วย'

      // แก้ไขจุดที่ 3: รองรับทั้ง r.quantity (จาก Purchasing) และ r.qty_received / r.qty (จาก Store)
      const qty = Number(r.quantity ?? r.qty_received ?? r.qty ?? 0)
      const unitCost = Number(r.unit_cost ?? r.unit_price ?? 0)
      const totalCost = Number(r.total_value ?? r.total_price ?? (qty * unitCost))

      const prjCode = r.projects?.project_code || ''
      const prjName = r.projects?.project_name || r.project_name || (prjCode ? `${prjCode}` : 'สต็อกกลางบริษัท')
      const fullProject = prjCode && prjName && !prjName.includes(prjCode) ? `[${prjCode}] ${prjName}` : prjName

      const poNo = r.po_no || poObj?.po_no || ''
      const grnNo = r.grn_no || grnObj?.grn_no || (poNo ? `รับตาม ${poNo}` : 'รับเข้าสโตร์')

      const vendorName =
        r.vendor_name ||
        poObj?.custom_vendor_name ||
        poObj?.vendors?.vendor_name ||
        poObj?.vendor_name ||
        'ผู้จำหน่ายทั่วไป'

      const lotType = r.lot_type || (poNo ? 'po_receive' : 'direct_in')

      return {
        id: r.id || `${idx}`,
        date: dateStr,
        itemCode,
        itemName,
        unit,
        qty,
        unitCost,
        totalCost,
        projectName: fullProject,
        poNo,
        grnNo,
        vendorName,
        lotType,
      }
    })
  }, [rows])

  // คำนวณช่วงวันที่และข้อความกำกับ (Date Range Description)
  const dateRangeInfo = useMemo(() => {
    if (periodType === 'daily') {
      const d = new Date(selectedDate)
      const dText = isNaN(d)
        ? selectedDate
        : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      return {
        start: selectedDate,
        end: selectedDate,
        label: `ประจำวันที่ ${dText}`,
      }
    }
    if (periodType === 'monthly') {
      const start = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate()
      const end = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return {
        start,
        end,
        label: `ประจำเดือน ${THAI_MONTHS[selectedMonth]} ${selectedYear + 543} (1 - ${lastDay} ${THAI_MONTHS[selectedMonth]} ${selectedYear + 543})`,
      }
    }
    if (periodType === 'yearly') {
      return {
        start: `${selectedYear}-01-01`,
        end: `${selectedYear}-12-31`,
        label: `ประจำปี ${selectedYear + 543} (1 มกราคม - 31 ธันวาคม ${selectedYear + 543})`,
      }
    }
    if (periodType === 'custom') {
      return {
        start: customStart,
        end: customEnd,
        label: `ช่วงวันที่ ${customStart} ถึง ${customEnd}`,
      }
    }
    return {
      start: null,
      end: null,
      label: 'ข้อมูลทั้งหมดทุกช่วงเวลา (All Time Inbound History)',
    }
  }, [periodType, selectedDate, selectedMonth, selectedYear, customStart, customEnd])

  // รายการโครงการและผู้จำหน่ายที่มีในข้อมูล (สำหรับ Datalist แนะนำการพิมพ์)
  const projectSuggestions = useMemo(() => {
    const set = new Set()
    normalizedRows.forEach((r) => {
      if (r.projectName && r.projectName !== '-') set.add(r.projectName)
    })
    return Array.from(set).sort()
  }, [normalizedRows])

  const vendorSuggestions = useMemo(() => {
    const set = new Set()
    normalizedRows.forEach((r) => {
      if (r.vendorName && r.vendorName !== '-') set.add(r.vendorName)
    })
    return Array.from(set).sort()
  }, [normalizedRows])

  // กรองรายการตามเงื่อนไขที่เลือกหรือพิมพ์
  const filteredRows = useMemo(() => {
    return normalizedRows.filter((r) => {
      // 1. กรองตามวันที่
      if (dateRangeInfo.start && dateRangeInfo.end) {
        if (!r.date) return false
        if (r.date < dateRangeInfo.start || r.date > dateRangeInfo.end) return false
      }

      // 2. กรองตามโครงการ (สามารถพิมพ์ค้นหาได้ทั้งแบบพิมพ์ตรงและบางส่วน)
      if (filterProject.trim() && filterProject.trim() !== 'all') {
        const pTerm = filterProject.trim().toLowerCase()
        if (!r.projectName.toLowerCase().includes(pTerm)) return false
      }

      // 3. กรองตามผู้จำหน่าย (สามารถพิมพ์ค้นหาได้ทั้งแบบพิมพ์ตรงและบางส่วน)
      if (filterVendor.trim() && filterVendor.trim() !== 'all') {
        const vTerm = filterVendor.trim().toLowerCase()
        if (!r.vendorName.toLowerCase().includes(vTerm)) return false
      }

      // 4. ค้นหาคำ
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const match =
          r.itemName.toLowerCase().includes(q) ||
          r.itemCode.toLowerCase().includes(q) ||
          r.poNo.toLowerCase().includes(q) ||
          r.grnNo.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [normalizedRows, dateRangeInfo, filterProject, filterVendor, searchQuery])

  // คำนวณยอดสรุป (Totals)
  const totalQty = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.qty, 0)
  }, [filteredRows])

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.totalCost, 0)
  }, [filteredRows])

  const handlePrint = () => {
    window.print()
  }

  const printDateStr = now.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
      {/* Stylesheet พิเศษสำหรับการพิมพ์ A4 ขาวบริสุทธิ์ ไม่มีพื้นหลังสีรบกวน */}
      <style>{`
        @media print {
          @page {
            size: A4 ${paperOrientation};
            margin: ${paperOrientation === 'landscape' ? '8mm 6mm' : '10mm 8mm'};
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .modal-container {
            position: static !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          #printable-receipts-report {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          #printable-receipts-report * {
            background-color: transparent !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          #printable-receipts-report table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          #printable-receipts-report th,
          #printable-receipts-report td {
            border: 1px solid #333333 !important;
            color: #000000 !important;
            background: #ffffff !important;
          }
          #printable-receipts-report thead th {
            border-top: 1.5px solid #000000 !important;
            border-bottom: 1.5px solid #000000 !important;
            font-weight: bold !important;
          }
          #printable-receipts-report tfoot td {
            border-top: 1.5px solid #000000 !important;
            border-bottom: 2px solid #000000 !important;
            font-weight: bold !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      <div className="modal-container relative flex max-h-[96vh] w-full max-w-6xl flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* แถบหัว Modal (ซ่อนเวลาพิมพ์) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-5 py-3.5 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                พิมพ์รายงานประวัติการนำเข้าและตรวจรับพัสดุ (Inbound & Goods Receipts)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ระบุช่วงเวลา (วัน / เดือน / ปี) และพิมพ์ค้นหาโครงการหรือผู้จำหน่าย เพื่อออกรายงานหรือบันทึก PDF
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>สั่งพิมพ์ / บันทึก PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* แผงควบคุมตัวกรอง (Control Panel - ซ่อนเวลาพิมพ์) */}
        <div className="no-print border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-4 space-y-3 text-xs">
          {/* แถวที่ 1: เลือกประเภทช่วงเวลา (ตัดอิโมจิออกทั้งหมดตามข้อ 1) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mr-1">
                <Calendar className="h-3.5 w-3.5 text-slate-700" />
                <span>เลือกช่วงเวลา:</span>
              </span>
              {[
                { id: 'daily', label: 'รายวัน' },
                { id: 'monthly', label: 'รายเดือน' },
                { id: 'yearly', label: 'รายปี' },
                { id: 'custom', label: 'กำหนดช่วงวันที่' },
                { id: 'all', label: 'ทั้งหมด' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodType(p.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    periodType === p.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* คอนโทรลย่อยตาม Period Type */}
            <div className="flex items-center gap-2">
              {periodType === 'daily' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">เลือกวันที่:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 font-mono text-xs shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-semibold text-[11px]"
                  >
                    วันนี้
                  </button>
                </div>
              )}

              {periodType === 'monthly' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">เลือกเดือน:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs shadow-xs"
                  >
                    {THAI_MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 font-mono text-xs shadow-xs"
                  >
                    {[currentCEYear - 2, currentCEYear - 1, currentCEYear, currentCEYear + 1].map((y) => (
                      <option key={y} value={y}>
                        {y + 543}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {periodType === 'yearly' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">เลือกปี:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 font-mono text-xs shadow-xs font-bold"
                  >
                    {[currentCEYear - 3, currentCEYear - 2, currentCEYear - 1, currentCEYear, currentCEYear + 1].map((y) => (
                      <option key={y} value={y}>
                        พ.ศ. {y + 543} ({y})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {periodType === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">ตั้งแต่:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 font-mono text-xs shadow-xs"
                  />
                  <span className="text-slate-500">ถึง:</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 font-mono text-xs shadow-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* แถวที่ 2: สามารถพิมพ์ โครงการ/ ผู้จำหน่ายได้ (ตามข้อ 4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* พิมพ์โครงการ */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  โครงการ (พิมพ์หรือเลือก):
                </label>
                {filterProject && (
                  <button
                    type="button"
                    onClick={() => setFilterProject('')}
                    className="text-[10px] text-rose-600 hover:underline"
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <input
                type="text"
                list="report-project-datalist"
                placeholder="พิมพ์ชื่อหรือรหัสโครงการ..."
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs"
              />
              <datalist id="report-project-datalist">
                {projectSuggestions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            {/* พิมพ์ผู้จำหน่าย */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  ผู้จำหน่าย (พิมพ์หรือเลือก):
                </label>
                {filterVendor && (
                  <button
                    type="button"
                    onClick={() => setFilterVendor('')}
                    className="text-[10px] text-rose-600 hover:underline"
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <input
                type="text"
                list="report-vendor-datalist"
                placeholder="พิมพ์ชื่อผู้จำหน่าย / ร้านค้า..."
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs"
              />
              <datalist id="report-vendor-datalist">
                {vendorSuggestions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>

            {/* ค้นหาคำในรายงาน */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                ค้นหาในรายงาน:
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="ชื่อวัสดุ, เลข PO, GRN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-2.5 py-1 text-xs"
                />
                <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* รูปแบบกระดาษ (ตัดฟีเจอร์ลายเซ็นออกตามข้อ 5) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                การจัดหน้ากระดาษ:
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                <select
                  value={paperOrientation}
                  onChange={(e) => setPaperOrientation(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                >
                  <option value="landscape">แนวนอน (Landscape)</option>
                  <option value="portrait">แนวตั้ง (Portrait)</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showValuation}
                    onChange={(e) => setShowValuation(e.target.checked)}
                    className="rounded"
                  />
                  <span>แสดงมูลค่าเงิน</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ตัวกระดาษรายงานตัวอย่าง (Printable Document Body - กระดาษขาวล้วนตามข้อ 2) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/60 dark:bg-slate-900/50">
          <div
            id="printable-receipts-report"
            className="mx-auto bg-white text-black p-6 sm:p-8 rounded-none shadow-sm border border-slate-300"
            style={{ width: '100%', maxWidth: '1080px', backgroundColor: '#ffffff' }}
          >
            {/* 1. ส่วนหัวเอกสาร (Header ขาวสะอาด) */}
            <div className="border-b-2 border-black pb-4 mb-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block border border-black text-black font-black text-xs px-2 py-0.5 tracking-wider">
                      ANVA & CO.
                    </span>
                    <h1 className="text-lg font-black text-black">
                      บริษัท แอนวา แอนด์ โค จำกัด
                    </h1>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    123/45 ถนนวิศวกรรม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพมหานคร 10500 · โทร. 02-123-4567
                  </p>
                  <h2 className="text-base font-bold text-black mt-2">
                    รายงานประวัติการนำเข้าและตรวจรับพัสดุ (Goods Receipts & Inbound History Report)
                  </h2>
                </div>

                <div className="text-right text-xs space-y-1 shrink-0">
                  <div className="inline-block px-2 py-0.5 font-mono text-[11px] font-bold text-black border border-black">
                    Doc Ref: ANVA-REP-GR-{now.getFullYear()}{String(now.getMonth() + 1).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] text-neutral-600">
                    พิมพ์เมื่อ: <span className="font-mono text-black">{printDateStr}</span>
                  </div>
                  <div className="text-[11px] text-neutral-600">
                    ผู้จัดทำ: <span className="font-semibold text-black">{userProfile?.full_name || 'เจ้าหน้าที่คลังพัสดุ'}</span>
                  </div>
                </div>
              </div>

              {/* ป้ายแสดงช่วงเวลาและตัวกรองที่เลือก (ขาวล้วน มีเส้นขอบบาง) */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-black bg-white p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-black">ช่วงเวลาข้อมูล:</span>
                  <span className="font-semibold text-black">{dateRangeInfo.label}</span>
                </div>
                <div className="flex items-center gap-3 text-neutral-800 text-[11px]">
                  <span>โครงการ: <b>{filterProject.trim() ? filterProject : 'ทุกโครงการ'}</b></span>
                  <span>ผู้จำหน่าย: <b>{filterVendor.trim() ? filterVendor : 'ทุกราย'}</b></span>
                  <span>พบข้อมูล: <b className="font-mono text-black">{filteredRows.length}</b> รายการ</span>
                </div>
              </div>
            </div>

            {/* 2. ตารางรายการรับเข้าพัสดุ (ขาวล้วน เส้นตารางชัดเจน) */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-t-2 border-b-2 border-black bg-white text-black font-bold">
                    <th className="py-2 px-2 text-center w-10 border-b border-black">#</th>
                    <th className="py-2 px-2.5 whitespace-nowrap w-24 border-b border-black">วันที่รับ</th>
                    <th className="py-2 px-2.5 whitespace-nowrap w-28 border-b border-black">เลขที่รับ / PO</th>
                    <th className="py-2 px-2.5 min-w-[140px] border-b border-black">โครงการ</th>
                    <th className="py-2 px-2.5 min-w-[140px] border-b border-black">ผู้จำหน่าย / แหล่งที่มา</th>
                    <th className="py-2 px-2.5 min-w-[180px] border-b border-black">รายการวัสดุ / อุปกรณ์</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap w-20 border-b border-black">จำนวน</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-16 border-b border-black">หน่วย</th>
                    {showValuation && (
                      <>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap w-24 border-b border-black">ราคา/หน่วย</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap w-28 border-b border-black">รวมมูลค่า (บาท)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-300">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showValuation ? 10 : 8}
                        className="py-12 text-center text-neutral-500 italic text-xs"
                      >
                        ไม่พบข้อมูลประวัตินำเข้าพัสดุตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => (
                      <tr key={row.id || idx} className="text-[11px] bg-white">
                        <td className="py-2 px-2 text-center font-mono text-neutral-600 align-top">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-black whitespace-nowrap align-top">
                          {row.date ? new Date(row.date).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'}
                        </td>
                        <td className="py-2 px-2.5 font-mono align-top">
                          <div className="font-bold text-black">{row.grnNo}</div>
                          {row.poNo && (
                            <div className="text-[10px] text-neutral-600">PO: {row.poNo}</div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-black align-top">
                          {row.projectName}
                        </td>
                        <td className="py-2 px-2.5 text-black align-top">
                          {row.vendorName}
                        </td>
                        <td className="py-2 px-2.5 align-top">
                          <div className="font-bold text-black">{row.itemName}</div>
                          {row.itemCode && row.itemCode !== '-' && (
                            <div className="text-[10px] font-mono text-neutral-600">{row.itemCode}</div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-black align-top">
                          {Number(row.qty).toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center text-black align-top">
                          {row.unit}
                        </td>
                        {showValuation && (
                          <>
                            <td className="py-2 px-2.5 text-right font-mono text-black align-top">
                              {baht(row.unitCost)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold text-black align-top">
                              {baht(row.totalCost)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>

                {/* แถวสรุปผลรวมท้ายตาราง (Summary Row) */}
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-b-2 border-black bg-white font-bold text-xs text-black">
                      <td colSpan={6} className="py-2.5 px-3 text-right">
                        รวมทั้งสิ้น ({filteredRows.length} รายการ):
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-black text-black">
                        {totalQty.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-center text-black">ชิ้น/ชุด</td>
                      {showValuation && (
                        <>
                          <td className="py-2.5 px-2 text-right text-neutral-500 font-normal text-[11px]">-</td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-black text-black text-sm">
                            {baht(totalAmount)}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* 3. หมายเหตุท้ายรายงาน */}
            <div className="mt-4 pt-3 border-t border-black flex justify-between items-start text-[11px] text-neutral-600">
              <div className="max-w-xl">
                <span className="font-bold text-black">หมายเหตุ: </span>
                <span>{reportNotes}</span>
              </div>
              <div className="text-right text-[10px] text-neutral-500">
                ระบบบริหารคลังพัสดุและจัดซื้อ ANVA & CO. ERP v2.0
              </div>
            </div>
            {/* ตัดฟีเจอร์ลายเซ็นออกทั้งหมดตามข้อ 5 */}
          </div>
        </div>

        {/* แถบล่าง Modal (ซ่อนเวลาพิมพ์) */}
        <div className="no-print flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-5 py-3 rounded-b-2xl text-xs">
          <div className="text-slate-600 dark:text-slate-400">
            แสดงข้อมูล <b>{filteredRows.length}</b> รายการ · จำนวนรวม <b>{totalQty.toLocaleString()}</b> ชิ้น · รวมมูลค่า{' '}
            <b className="text-black dark:text-white font-mono font-bold">{baht(totalAmount)}</b> บาท
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              ยกเลิก / ปิด
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2 font-bold text-white shadow-sm transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>สั่งพิมพ์ / บันทึก PDF หน้านี้</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
