import { useState, useMemo } from 'react'
import { baht } from '../../lib/projects'
import {
  Printer,
  X,
  Calendar,
  Search,
  Building2,
  FileText,
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

      // จำนวนสั่งซื้อ (Ordered) vs จำนวนรับเข้าจริง (Received)
      const qtyReceived = Number(r.quantity ?? r.qty_received ?? r.qty ?? 0)
      const qtyOrdered = Number(r.ordered_qty || gri?.purchase_order_items?.quantity || qtyReceived)
      const unitCost = Number(r.unit_cost ?? r.unit_price ?? 0)
      const totalCost = Number(r.total_value ?? r.total_price ?? (qtyReceived * unitCost))

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

      // ประวัติการรับของแต่ละรอบ (ถ้ามีรับหลายรอบ เช่น รับรอบ 1 วันที่ 11/11 จำนวน 2 และ รอบ 2 วันที่ 21/11 จำนวน 3)
      const receiptHistory = r.receipt_history || []

      return {
        id: r.id || `${idx}`,
        date: dateStr,
        itemCode,
        itemName,
        unit,
        qtyOrdered,
        qtyReceived,
        unitCost,
        totalCost,
        projectName: fullProject,
        poNo,
        grnNo,
        vendorName,
        lotType,
        receiptHistory,
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
  const totalQtyOrdered = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.qtyOrdered, 0)
  }, [filteredRows])

  const totalQtyReceived = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.qtyReceived, 0)
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
      {/* Stylesheet พิเศษสำหรับการพิมพ์ A4 ขาวบริสุทธิ์ จัดกึ่งกลางพอดีหน้ากระดาษ */}
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
            table-layout: auto !important;
          }
          #printable-receipts-report th,
          #printable-receipts-report td {
            border: 1px solid #222222 !important;
            color: #000000 !important;
            background: #ffffff !important;
            text-align: center !important;
            vertical-align: middle !important;
            padding: 4px 5px !important;
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
                แสดงประวัติการสั่งซื้อและการรับของจริง (หากมีรับบางส่วนหลายรอบ จะแสดงวันที่และจำนวนของทุกรอบชัดเจน)
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
          {/* แถวที่ 1: เลือกประเภทช่วงเวลา */}
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

          {/* แถวที่ 2: พิมพ์โครงการ/ผู้จำหน่าย/ค้นหา */}
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

            {/* รูปแบบกระดาษ & แสดงมูลค่า */}
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

        {/* ตัวกระดาษรายงานตัวอย่าง (Printable Document Body - กระดาษขาวล้วน จัดกึ่งกลางพอดีช่อง) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/60 dark:bg-slate-900/50">
          <div
            id="printable-receipts-report"
            className="mx-auto bg-white text-black p-6 sm:p-8 rounded-none shadow-sm border border-slate-300"
            style={{ width: '100%', maxWidth: '1080px', backgroundColor: '#ffffff' }}
          >
            {/* 1. ส่วนหัวเอกสาร (Header ขาวสะอาด กึ่งกลางสมดุล) */}
            <div className="border-b-2 border-black pb-4 mb-4 text-center">
              <div className="flex justify-between items-start gap-4">
                <div className="text-left">
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

              <div className="mt-3 text-center border-t border-b border-black py-2">
                <h2 className="text-base font-black text-black tracking-wide">
                  รายงานประวัติการนำเข้าและตรวจรับพัสดุ (Goods Receipts & Inbound History Report)
                </h2>
                <div className="text-xs text-neutral-800 mt-0.5 flex items-center justify-center gap-4 flex-wrap">
                  <span>ช่วงเวลา: <b>{dateRangeInfo.label}</b></span>
                  <span>โครงการ: <b>{filterProject.trim() ? filterProject : 'ทุกโครงการ'}</b></span>
                  <span>ผู้จำหน่าย: <b>{filterVendor.trim() ? filterVendor : 'ทุกราย'}</b></span>
                  <span>พบข้อมูล: <b className="font-mono text-black">{filteredRows.length}</b> รายการ</span>
                </div>
              </div>
            </div>

            {/* 2. ตารางรายการรับเข้าพัสดุ (จัดกึ่งกลางทุกช่อง จัดเลเอาต์กระชับพอดีข้อความ) */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse text-center" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr className="border-t-2 border-b-2 border-black bg-white text-black font-bold">
                    <th className="py-2 px-1 text-center align-middle w-8 border border-black">#</th>
                    <th className="py-2 px-2 text-center align-middle w-32 border border-black">วันที่ตรวจรับ & ประวัติรอบรับ</th>
                    <th className="py-2 px-2 text-center align-middle w-24 whitespace-nowrap border border-black">เลขที่ PO / รับ</th>
                    <th className="py-2 px-2 text-center align-middle w-28 border border-black">โครงการ</th>
                    <th className="py-2 px-2 text-center align-middle w-28 border border-black">ผู้จำหน่าย</th>
                    <th className="py-2 px-2 text-center align-middle border border-black">รายการวัสดุ / อุปกรณ์</th>
                    <th className="py-2 px-1.5 text-center align-middle w-16 whitespace-nowrap border border-black">สั่งซื้อ</th>
                    <th className="py-2 px-1.5 text-center align-middle w-24 whitespace-nowrap border border-black">รับเข้าแล้ว (สรุป)</th>
                    <th className="py-2 px-1 text-center align-middle w-12 whitespace-nowrap border border-black">หน่วย</th>
                    {showValuation && (
                      <>
                        <th className="py-2 px-2 text-center align-middle w-20 whitespace-nowrap border border-black">ราคา/หน่วย</th>
                        <th className="py-2 px-2 text-center align-middle w-24 whitespace-nowrap border border-black">รวมมูลค่า (บาท)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-300">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showValuation ? 11 : 9}
                        className="py-12 text-center align-middle text-neutral-500 italic text-xs border border-black"
                      >
                        ไม่พบข้อมูลประวัตินำเข้าพัสดุตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const hasMultiRounds = row.receiptHistory && row.receiptHistory.length > 1
                      const isComplete = row.qtyReceived >= row.qtyOrdered && row.qtyOrdered > 0

                      return (
                        <tr key={row.id || idx} className="text-[11px] bg-white hover:bg-slate-50">
                          {/* ลำดับ */}
                          <td className="py-2 px-1 text-center align-middle font-mono text-neutral-600 border border-black">
                            {idx + 1}
                          </td>

                          {/* วันที่ตรวจรับ และแจกแจงรอบรับ (ถ้ารับครั้งเดียวแสดงแค่วันที่ / ถ้ารับหลายรอบแสดงแจกแจงชัดเจน เช่น รับ 11/11 จำนวน 2, รับ 21/11 จำนวน 3) */}
                          <td className="py-2 px-2 text-center align-middle font-mono text-black border border-black">
                            {!hasMultiRounds ? (
                              <div className="font-semibold">
                                {row.date ? new Date(row.date).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="font-bold text-[10px] text-neutral-700 bg-neutral-100 py-0.5 px-1 rounded inline-block">
                                  รับ {row.receiptHistory.length} รอบ (ล่าสุด: {new Date(row.date).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' })})
                                </div>
                                <div className="text-[10px] space-y-0.5 text-neutral-800">
                                  {row.receiptHistory.map((h, hIdx) => {
                                    const hDateStr = h.date ? new Date(h.date).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'
                                    return (
                                      <div key={hIdx} className="whitespace-nowrap">
                                        ครั้งที่ {hIdx + 1} ({hDateStr}): <b>{Number(h.quantity || 0).toLocaleString()}</b> {row.unit}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* เลขที่ PO / เอกสารตรวจรับ */}
                          <td className="py-2 px-2 text-center align-middle font-mono border border-black">
                            {row.poNo && (
                              <div className="font-bold text-black">{row.poNo}</div>
                            )}
                            <div className="text-[10px] text-neutral-600">
                              {row.grnNo}
                            </div>
                          </td>

                          {/* โครงการ */}
                          <td className="py-2 px-2 text-center align-middle text-black border border-black">
                            {row.projectName}
                          </td>

                          {/* ผู้จำหน่าย */}
                          <td className="py-2 px-2 text-center align-middle text-black border border-black">
                            {row.vendorName}
                          </td>

                          {/* รายการวัสดุ / อุปกรณ์ */}
                          <td className="py-2 px-2 text-center align-middle border border-black">
                            <div className="font-bold text-black">{row.itemName}</div>
                            {row.itemCode && row.itemCode !== '-' && (
                              <div className="text-[10px] font-mono text-neutral-500">{row.itemCode}</div>
                            )}
                          </td>

                          {/* จำนวนสั่งซื้อ (Ordered) */}
                          <td className="py-2 px-1.5 text-center align-middle font-mono font-bold text-neutral-800 border border-black">
                            {Number(row.qtyOrdered).toLocaleString()}
                          </td>

                          {/* จำนวนรับเข้าแล้วจริง (Received) พร้อมสถานะครบถ้วน */}
                          <td className="py-2 px-1.5 text-center align-middle font-mono font-bold text-black border border-black">
                            <div>{Number(row.qtyReceived).toLocaleString()}</div>
                            <div className="text-[9px] font-sans mt-0.5">
                              {isComplete ? (
                                <span className="text-black font-semibold">(ครบ {Number(row.qtyOrdered).toLocaleString()})</span>
                              ) : (
                                <span className="text-neutral-700 font-semibold">(ค้าง {Math.max(0, row.qtyOrdered - row.qtyReceived).toLocaleString()})</span>
                              )}
                            </div>
                          </td>

                          {/* หน่วย */}
                          <td className="py-2 px-1 text-center align-middle text-black border border-black">
                            {row.unit}
                          </td>

                          {/* ราคาและมูลค่าเงิน */}
                          {showValuation && (
                            <>
                              <td className="py-2 px-2 text-center align-middle font-mono text-black border border-black">
                                {baht(row.unitCost)}
                              </td>
                              <td className="py-2 px-2 text-center align-middle font-mono font-bold text-black border border-black">
                                {baht(row.totalCost)}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>

                {/* แถวสรุปผลรวมท้ายตาราง (Summary Row) จัดกึ่งกลางพอดีช่อง */}
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-b-2 border-black bg-white font-bold text-xs text-black">
                      <td colSpan={6} className="py-2.5 px-2 text-center align-middle border border-black">
                        รวมทั้งสิ้น ({filteredRows.length} รายการ):
                      </td>
                      <td className="py-2.5 px-1.5 text-center align-middle font-mono font-black text-black border border-black">
                        {totalQtyOrdered.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-1.5 text-center align-middle font-mono font-black text-black border border-black">
                        {totalQtyReceived.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-1 text-center align-middle text-black border border-black">ชิ้น/ชุด</td>
                      {showValuation && (
                        <>
                          <td className="py-2.5 px-2 text-center align-middle text-neutral-500 font-normal text-[11px] border border-black">-</td>
                          <td className="py-2.5 px-2 text-center align-middle font-mono font-black text-black text-sm border border-black">
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
              <div className="max-w-xl text-left">
                <span className="font-bold text-black">หมายเหตุ: </span>
                <span>{reportNotes}</span>
              </div>
              <div className="text-right text-[10px] text-neutral-500">
                ระบบบริหารคลังพัสดุและจัดซื้อ ANVA & CO. ERP v2.0
              </div>
            </div>
          </div>
        </div>

        {/* แถบล่าง Modal (ซ่อนเวลาพิมพ์) */}
        <div className="no-print flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-5 py-3 rounded-b-2xl text-xs">
          <div className="text-slate-600 dark:text-slate-400">
            แสดงข้อมูล <b>{filteredRows.length}</b> รายการ · สั่งซื้อรวม <b>{totalQtyOrdered.toLocaleString()}</b> ชิ้น · รับจริงแล้ว <b>{totalQtyReceived.toLocaleString()}</b> ชิ้น · รวมมูลค่า{' '}
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
