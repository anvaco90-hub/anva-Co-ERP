import { useEffect, useState, useMemo } from 'react'
import { baht } from '../../lib/projects'
import { supabase } from '../../lib/supabase'
import R2Image from '../R2Image'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

export default function InventoryReportModal({
  items: rawItems,
  categories: propCategories = [],
  cats = [],
  categoryName: initialCategoryName = '',
  selectedCategory: initialCategory = '',
  onClose,
  userProfile
}) {
  const categories = (propCategories && propCategories.length > 0) ? propCategories : (cats || [])
  const now = new Date()
  const currentCEYear = now.getFullYear()
  const currentMonthIdx = now.getMonth()

  // 1. ตัวเลือกช่วงเวลา (Period Selector)
  const [periodType, setPeriodType] = useState('current') // 'current' | 'monthly' | 'yearly' | 'custom'
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx)
  const [selectedYear, setSelectedYear] = useState(currentCEYear)
  const [customStart, setCustomStart] = useState(
    new Date(currentCEYear, currentMonthIdx, 1).toISOString().slice(0, 10)
  )
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10))

  // 2. ตัวเลือกโหมดรายงาน (Report Type)
  const [reportType, setReportType] = useState('balance') // 'balance' (ยอดคงเหลือ) | 'movement' (ความเคลื่อนไหว) | 'reorder' (จุดสั่งซื้อ)

  // 3. ตัวกรองข้อมูล (Filters)
  const [catFilter, setCatFilter] = useState(initialCategory || '')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'in_stock' | 'low' | 'out'
  const [searchQuery, setSearchQuery] = useState('')
  const [reportNotes, setReportNotes] = useState('รายงานสินค้าคงเหลือและสถานะการใช้วัสดุในคลังสโตร์ ANVA & CO., LTD.')

  // 4. ตัวเลือกการพิมพ์ (Print Display Options)
  const [showImages, setShowImages] = useState(false) // เริ่มต้นปิดรูปภาพเพื่อให้ตารางกว้างเต็มหน้ากระดาษ
  const [showValuation, setShowValuation] = useState(true)
  const [showReorderPoint, setShowReorderPoint] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)
  const [paperOrientation, setPaperOrientation] = useState('landscape') // 'landscape' (เต็มหน้ากระดาษ) | 'portrait'

  // 5. ข้อมูลความเคลื่อนไหว (Movements: รับเข้า / เบิกจ่าย / ปรับยอด)
  const [movements, setMovements] = useState({})
  const [loadingMovements, setLoadingMovements] = useState(false)

  // คำนวณช่วงวันที่ตามตัวเลือก
  const dateRange = useMemo(() => {
    if (periodType === 'monthly') {
      const start = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate()
      const end = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { start, end, label: `ประจำเดือน ${THAI_MONTHS[selectedMonth]} ${selectedYear + 543} (1 - ${lastDay} ${THAI_MONTHS[selectedMonth]} ${selectedYear + 543})` }
    }
    if (periodType === 'yearly') {
      return {
        start: `${selectedYear}-01-01`,
        end: `${selectedYear}-12-31`,
        label: `ประจำปี ${selectedYear + 543} (1 มกราคม - 31 ธันวาคม ${selectedYear + 543})`
      }
    }
    if (periodType === 'custom') {
      return {
        start: customStart,
        end: customEnd,
        label: `ช่วงวันที่ ${customStart} ถึง ${customEnd}`
      }
    }
    return {
      start: null,
      end: null,
      label: `สถานะปัจจุบัน (ณ วันที่ ${now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })})`
    }
  }, [periodType, selectedMonth, selectedYear, customStart, customEnd])

  // โหลดข้อมูลความเคลื่อนไหวเมื่อเลือกโหมด Movement หรือเลือกดูรายเดือน/รายปี
  useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      setMovements({})
      return
    }

    let isMounted = true
    async function fetchMovements() {
      setLoadingMovements(true)
      try {
        const [lotsRes, issuesRes, adjRes] = await Promise.all([
          supabase
            .from('stock_lots')
            .select('item_id, qty_received, received_date')
            .gte('received_date', dateRange.start)
            .lte('received_date', dateRange.end),
          supabase
            .from('stock_issues')
            .select('id, issue_date, stock_issue_items(item_id, quantity)')
            .gte('issue_date', dateRange.start)
            .lte('issue_date', dateRange.end),
          supabase
            .from('stock_adjustments')
            .select('item_id, qty_before, qty_after, created_at')
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end + 'T23:59:59'),
        ])

        const moveMap = {}

          // 1. รับเข้า
          ; (lotsRes.data || []).forEach((lot) => {
            if (!lot.item_id) return
            if (!moveMap[lot.item_id]) moveMap[lot.item_id] = { inQty: 0, outQty: 0, adjQty: 0 }
            moveMap[lot.item_id].inQty += Number(lot.qty_received || 0)
          })

          // 2. เบิกจ่าย
          ; (issuesRes.data || []).forEach((iss) => {
            ; (iss.stock_issue_items || []).forEach((item) => {
              if (!item.item_id) return
              if (!moveMap[item.item_id]) moveMap[item.item_id] = { inQty: 0, outQty: 0, adjQty: 0 }
              moveMap[item.item_id].outQty += Number(item.quantity || 0)
            })
          })

          // 3. ปรับปรุง
          ; (adjRes.data || []).forEach((adj) => {
            if (!adj.item_id) return
            if (!moveMap[adj.item_id]) moveMap[adj.item_id] = { inQty: 0, outQty: 0, adjQty: 0 }
            const diff = Number(adj.qty_after || 0) - Number(adj.qty_before || 0)
            moveMap[adj.item_id].adjQty += diff
          })

        if (isMounted) setMovements(moveMap)
      } catch (err) {
        console.error('Error loading movements:', err)
      } finally {
        if (isMounted) setLoadingMovements(false)
      }
    }

    fetchMovements()
    return () => { isMounted = false }
  }, [dateRange.start, dateRange.end])

  // กรองรายการสินค้าที่จะแสดงในตารางรายงาน
  const filteredItems = useMemo(() => {
    if (!rawItems) return []
    const q = searchQuery.trim().toLowerCase()

    return rawItems.filter((it) => {
      // กรองหมวดหมู่
      if (catFilter && it.category_id !== catFilter) return false

      const isLow = Number(it.reorder_point) > 0 && Number(it.qty_on_hand) <= Number(it.reorder_point)
      const isOut = Number(it.qty_on_hand) <= 0

      // กรองโหมด Reorder
      if (reportType === 'reorder' && !isLow && !isOut) return false

      // กรองสถานะ
      if (statusFilter === 'in_stock' && Number(it.qty_on_hand) <= 0) return false
      if (statusFilter === 'low' && !isLow) return false
      if (statusFilter === 'out' && !isOut) return false

      // กรองคำค้นหา
      if (q) {
        const text = `${it.item_code} ${it.item_name} ${it.item_categories?.name || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }

      return true
    })
  }, [rawItems, catFilter, statusFilter, reportType, searchQuery])

  // คำนวณยอดรวมต่างๆ
  const totalValue = useMemo(() => {
    return filteredItems.reduce((s, i) => s + Number(i.qty_on_hand || 0) * Number(i.avg_unit_cost || 0), 0)
  }, [filteredItems])

  const totalInPeriod = useMemo(() => {
    return filteredItems.reduce((s, i) => s + Number(movements[i.id]?.inQty || 0), 0)
  }, [filteredItems, movements])

  const totalOutPeriod = useMemo(() => {
    return filteredItems.reduce((s, i) => s + Number(movements[i.id]?.outQty || 0), 0)
  }, [filteredItems, movements])

  const lowCount = filteredItems.filter(
    (i) => Number(i.reorder_point) > 0 && Number(i.qty_on_hand) <= Number(i.reorder_point)
  ).length

  const outCount = filteredItems.filter((i) => Number(i.qty_on_hand) <= 0).length

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

  const activeCategoryObj = categories.find((c) => c.id === catFilter)
  const categoryTitle = activeCategoryObj ? activeCategoryObj.name : initialCategoryName || 'ทุกหมวดหมู่วัสดุ'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4">
      {/* Stylesheet พิเศษสำหรับการพิมพ์ A4 เต็มหน้ากระดาษ ต่อเนื่อง และหัวตารางซ้ำทุกหน้า */}
      <style>{`
        @media print {
          @page {
            size: A4 ${paperOrientation};
            margin: ${paperOrientation === 'landscape' ? '8mm 6mm' : '10mm 8mm'};
          }
          html, body {
            background: white !important;
            color: black !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .fixed, .overflow-y-auto, .max-h-\\[96vh\\] {
            position: static !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
          #printable-report {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
          }
          .break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-steel-200 dark:border-slate-800 text-steel-800 dark:text-slate-100">

        {/* แถบควบคุมด้านบน (ซ่อนเมื่อพิมพ์ no-print) */}
        <div className="no-print border-b border-steel-200 dark:border-slate-800 bg-gradient-to-r from-steel-50 to-steel-100 dark:from-slate-900 dark:to-slate-800 p-4 space-y-3">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 dark:border-slate-700/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow">
                ️
              </span>
              <div>
                <h2 className="text-base font-bold text-ink dark:text-white">ศูนย์ออกรายงานและพิมพ์เอกสารสต็อก (Stock PDF Generator)</h2>
                <p className="text-xs text-steel-500 dark:text-slate-400">เลือกช่วงเวลารายเดือน/ปี ปรับแต่งรายละเอียด และสั่งพิมพ์เป็น PDF</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition cursor-pointer"
              >
                <span>️</span>
                <span>พิมพ์เอกสาร / บันทึก PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-steel-700 dark:text-slate-300 hover:bg-steel-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                 ปิดหน้าต่าง
              </button>
            </div>
          </div>

          {/* แถวตัวกรองช่วงเวลา และ รูปแบบรายงาน */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* 1. เลือกช่วงเวลา */}
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-lg border border-steel-200 dark:border-slate-700 shadow-sm space-y-1.5">
              <label className="font-bold text-steel-700 dark:text-slate-200 flex items-center gap-1">
                <span></span> เลือกช่วงเวลารายงาน
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setPeriodType('current')}
                  className={`py-1 px-1.5 rounded font-semibold text-center transition ${periodType === 'current' ? 'bg-sky-700 text-white' : 'bg-steel-100 dark:bg-slate-700 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-600'
                    }`}
                >
                  ณ วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodType('monthly')}
                  className={`py-1 px-1.5 rounded font-semibold text-center transition ${periodType === 'monthly' ? 'bg-sky-700 text-white' : 'bg-steel-100 dark:bg-slate-700 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-600'
                    }`}
                >
                  รายเดือน
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodType('yearly')}
                  className={`py-1 px-1.5 rounded font-semibold text-center transition ${periodType === 'yearly' ? 'bg-sky-700 text-white' : 'bg-steel-100 dark:bg-slate-700 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-600'
                    }`}
                >
                  รายปี
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodType('custom')}
                  className={`py-1 px-1.5 rounded font-semibold text-center transition ${periodType === 'custom' ? 'bg-sky-700 text-white' : 'bg-steel-100 dark:bg-slate-700 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-600'
                    }`}
                >
                  กำหนดเอง
                </button>
              </div>

              {/* Sub-inputs based on periodType */}
              {periodType === 'monthly' && (
                <div className="flex gap-1 pt-1">
                  <select
                    className="w-1/2 p-1 border border-steel-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 text-xs"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  >
                    {THAI_MONTHS.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    className="w-1/2 p-1 border border-steel-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 text-xs font-mono"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {[currentCEYear - 2, currentCEYear - 1, currentCEYear, currentCEYear + 1, currentCEYear + 2].map((y) => (
                      <option key={y} value={y}>{y + 543} ({y})</option>
                    ))}
                  </select>
                </div>
              )}

              {periodType === 'yearly' && (
                <div className="pt-1">
                  <select
                    className="w-full p-1 border border-steel-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 text-xs font-mono font-bold"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {[currentCEYear - 2, currentCEYear - 1, currentCEYear, currentCEYear + 1, currentCEYear + 2].map((y) => (
                      <option key={y} value={y}>ประจำปี พ.ศ. {y + 543} (ค.ศ. {y})</option>
                    ))}
                  </select>
                </div>
              )}

              {periodType === 'custom' && (
                <div className="flex items-center gap-1 pt-1">
                  <input
                    type="date"
                    className="w-1/2 p-1 border border-steel-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 text-[11px]"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <span className="text-steel-400">-</span>
                  <input
                    type="date"
                    className="w-1/2 p-1 border border-steel-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 text-[11px]"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* 2. เลือกประเภทรายงาน */}
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-lg border border-steel-200 dark:border-slate-700 shadow-sm space-y-1.5">
              <label className="font-bold text-steel-700 dark:text-slate-200 flex items-center gap-1">
                <span></span> รูปแบบรายงาน
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer hover:bg-steel-50 dark:hover:bg-slate-700/60 p-1 rounded text-steel-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reportType"
                    checked={reportType === 'balance'}
                    onChange={() => setReportType('balance')}
                  />
                  <span>ยอดคงเหลือและมูลค่าสต็อก</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:bg-steel-50 dark:hover:bg-slate-700/60 p-1 rounded text-steel-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reportType"
                    checked={reportType === 'movement'}
                    onChange={() => setReportType('movement')}
                  />
                  <span>สรุปความเคลื่อนไหว (รับ/จ่าย)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:bg-steel-50 dark:hover:bg-slate-700/60 p-1 rounded text-steel-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reportType"
                    checked={reportType === 'reorder'}
                    onChange={() => setReportType('reorder')}
                  />
                  <span>รายการใกล้หมด / ต้องสั่งซื้อ</span>
                </label>
              </div>
            </div>

            {/* 3. กรองหมวดหมู่ & สถานะ */}
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-lg border border-steel-200 dark:border-slate-700 shadow-sm space-y-1.5">
              <label className="font-bold text-steel-700 dark:text-slate-200 flex items-center gap-1">
                <span></span> กรองหมวดหมู่ & สถานะ
              </label>
              <select
                className="w-full h-9 px-2.5 border border-steel-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-xs font-semibold text-steel-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 shadow-2xs cursor-pointer"
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
              >
                <option value="" className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">ทุกหมวดหมู่วัสดุ ({rawItems?.length || 0} รายการ)</option>
                {categories.map((c) => {
                  const countInCat = (rawItems || []).filter((i) => i.category_id === c.id).length
                  return (
                    <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">
                      {c.name} {countInCat > 0 ? `(${countInCat} รายการ)` : ''}
                    </option>
                  )
                })}
              </select>

              <select
                className="w-full h-9 px-2.5 border border-steel-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-xs font-semibold text-steel-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 shadow-2xs cursor-pointer"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all" className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">ทุกสถานะคงเหลือ</option>
                <option value="in_stock" className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">เฉพาะมีของในสโตร์ (&gt; 0)</option>
                <option value="low" className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">เฉพาะใกล้หมดจุดสั่งซื้อ</option>
                <option value="out" className="bg-white dark:bg-slate-900 text-steel-800 dark:text-slate-100 py-1">เฉพาะหมดสต็อก (= 0)</option>
              </select>

              <input
                type="text"
                placeholder="ค้นหารหัส หรือชื่อวัสดุ..."
                className="w-full h-9 px-2.5 border border-steel-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-xs text-steel-800 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 shadow-2xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* 4. ตัวเลือกเปิด/ปิดคอลัมน์ใน PDF */}
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-lg border border-steel-200 dark:border-slate-700 shadow-sm space-y-1.5">
              <label className="font-bold text-steel-700 dark:text-slate-200 flex items-center gap-1">
                <span></span> ตัวเลือกการแสดงผล PDF
              </label>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-steel-800 dark:text-slate-200">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showImages}
                    onChange={(e) => setShowImages(e.target.checked)}
                  />
                  <span>แสดงรูปภาพ</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showValuation}
                    onChange={(e) => setShowValuation(e.target.checked)}
                  />
                  <span>แสดงต้นทุน/มูลค่า</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showReorderPoint}
                    onChange={(e) => setShowReorderPoint(e.target.checked)}
                  />
                  <span>แสดงจุดสั่งซื้อ</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSignatures}
                    onChange={(e) => setShowSignatures(e.target.checked)}
                  />
                  <span>ช่องลายเซ็น 3 ฝ่าย</span>
                </label>
              </div>

              <div className="pt-1 flex items-center justify-between border-t border-steel-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-steel-700 dark:text-slate-300">รูปแบบหน้ากระดาษ:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaperOrientation('landscape')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${paperOrientation === 'landscape'
                        ? 'bg-steel-900 text-hivis shadow-xs'
                        : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                      }`}
                  >
                    แนวนอน (แนะนำ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperOrientation('portrait')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${paperOrientation === 'portrait'
                        ? 'bg-steel-900 text-hivis shadow-xs'
                        : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                      }`}
                  >
                    แนวตั้ง
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <input
                  type="text"
                  placeholder="หมายเหตุท้ายรายงาน..."
                  className="w-full p-1 border rounded text-[11px] text-steel-600"
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4 Page View - ปรับให้เต็มหน้ากระดาษและต่อเนื่อง) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-steel-100 flex justify-center">
          <div
            id="printable-report"
            className={`w-full ${paperOrientation === 'landscape' ? 'max-w-6xl' : 'max-w-[210mm]'
              } min-h-[297mm] bg-white p-6 sm:p-8 shadow-lg border border-steel-200 rounded text-black font-sans leading-relaxed text-xs`}
          >
            {/* 1. ส่วนหัวบริษัท */}
            <div className="border-b-2 border-black pb-4 text-center">
              <h1 className="text-xl font-bold tracking-wide">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
              <p className="text-xs text-neutral-600 font-medium">ANVA CONSTRUCTION & ENGINEERING CO., LTD.</p>
              <p className="text-[11px] text-neutral-500">สำนักงานใหญ่: 88/19 หมู่ 5 ต.บางรักน้อย อ.เมืองนนทบุรี จ.นนทบุรี 11000 | โทร: 02-920-5678</p>

              <div className="mt-3 inline-block border-y border-black py-1 px-4">
                <h2 className="text-base font-bold tracking-wider">
                  {reportType === 'movement'
                    ? 'รายงานสรุปความเคลื่อนไหวรับ-จ่ายสินค้าสโตร์ (Stock Movement Report)'
                    : reportType === 'reorder'
                      ? 'รายงานวัสดุใกล้หมดและจุดสั่งซื้อเร่งด่วน (Reorder Alert Report)'
                      : 'รายงานสินค้าคงเหลือและมูลค่าสต็อกสโตร์ (Inventory Stock & Valuation Report)'}
                </h2>
              </div>

              {/* ข้อมูลประจำงวด */}
              <div className="mt-2 text-xs font-semibold text-neutral-800">
                <span>{dateRange.label}</span>
              </div>

              <div className="mt-2 flex flex-wrap justify-between text-[11px] text-neutral-600 border-t border-neutral-200 pt-1">
                <span>หมวดหมู่: <b>{categoryTitle}</b></span>
                <span>รายการที่แสดง: <b>{filteredItems.length} รายการ</b></span>
                <span>พิมพ์เมื่อ: <b>{printDateStr}</b></span>
                <span>ผู้จัดทำ: <b>{userProfile?.full_name || 'เจ้าหน้าที่สโตร์'}</b></span>
              </div>
            </div>

            {/* 2. การ์ดสรุปยอดสำคัญ (Summary KPI Boxes) */}
            <div className="my-4 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded border border-neutral-300 bg-neutral-50 p-2">
                <span className="text-neutral-500 text-[10px] block">รายการทั้งหมด</span>
                <span className="font-bold text-sm text-neutral-900">{filteredItems.length} รายการ</span>
              </div>

              {showValuation && (
                <div className="rounded border border-neutral-300 bg-neutral-50 p-2">
                  <span className="text-neutral-500 text-[10px] block">มูลค่าคงเหลือรวม</span>
                  <span className="font-bold text-sm text-neutral-900 font-mono">{baht(totalValue)} บ.</span>
                </div>
              )}

              {dateRange.start && dateRange.end ? (
                <>
                  <div className="rounded border border-neutral-300 bg-emerald-50/50 p-2">
                    <span className="text-emerald-700 text-[10px] block">ยอดรับเข้ารวมในงวด</span>
                    <span className="font-bold text-sm text-emerald-800 font-mono">+{totalInPeriod}</span>
                  </div>
                  <div className="rounded border border-neutral-300 bg-rose-50/50 p-2">
                    <span className="text-rose-700 text-[10px] block">ยอดเบิกจ่ายในงวด</span>
                    <span className="font-bold text-sm text-rose-800 font-mono">-{totalOutPeriod}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded border border-neutral-300 bg-neutral-50 p-2">
                    <span className="text-neutral-500 text-[10px] block">รายการใกล้หมด</span>
                    <span className={`font-bold text-sm font-mono ${lowCount > 0 ? 'text-amber-700' : 'text-neutral-800'}`}>{lowCount} รายการ</span>
                  </div>
                  <div className="rounded border border-neutral-300 bg-neutral-50 p-2">
                    <span className="text-neutral-500 text-[10px] block">รายการหมดสต็อก</span>
                    <span className={`font-bold text-sm font-mono ${outCount > 0 ? 'text-rose-700' : 'text-neutral-800'}`}>{outCount} รายการ</span>
                  </div>
                </>
              )}
            </div>

            {loadingMovements && (
              <div className="text-center py-2 text-xs text-neutral-500 no-print">
                กำลังคำนวณยอดรับเข้าและเบิกจ่ายประจำงวด...
              </div>
            )}

            {/* 3. ตารางข้อมูลวัสดุ (จัดบรรทัดสวยงาม ไม่ตัดบรรทัดแคบ เต็มหน้ากระดาษ) */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px] min-w-[800px]">
                <thead>
                  <tr className="border-y-2 border-black bg-neutral-100 text-neutral-900 font-bold">
                    <th className="py-2.5 px-1.5 text-center w-8 whitespace-nowrap">ลำดับ</th>
                    <th className="py-2.5 px-2 text-left w-24 whitespace-nowrap">รหัสวัสดุ</th>
                    {showImages && <th className="py-2.5 px-1 text-center w-10 whitespace-nowrap">รูป</th>}
                    <th className="py-2.5 px-3 text-left min-w-[200px]">ชื่อรายการวัสดุ / อุปกรณ์</th>
                    <th className="py-2.5 px-2 text-left whitespace-nowrap">หมวดหมู่</th>

                    {/* ถ้าโหมด movement แสดงยอดรับ/จ่าย/ปรับ */}
                    {reportType === 'movement' && (
                      <>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap text-emerald-800">รับเข้า (+)</th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap text-rose-800">เบิกจ่าย (-)</th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap text-purple-800">ปรับยอด</th>
                      </>
                    )}

                    <th className="py-2.5 px-2 text-right whitespace-nowrap">คงเหลือ</th>
                    <th className="py-2.5 px-1.5 text-center whitespace-nowrap">หน่วย</th>

                    {showValuation && (
                      <>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap">ต้นทุนเฉลี่ย</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">มูลค่ารวม (บ.)</th>
                      </>
                    )}

                    {showReorderPoint && <th className="py-2.5 px-1.5 text-center whitespace-nowrap">จุดสั่งซื้อ</th>}
                    <th className="py-2.5 px-2 text-center whitespace-nowrap">สถานะ</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-neutral-400">
                        ไม่พบข้อมูลวัสดุตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((it, idx) => {
                      const isLow = Number(it.reorder_point) > 0 && Number(it.qty_on_hand) <= Number(it.reorder_point)
                      const isOut = Number(it.qty_on_hand) <= 0
                      const itemVal = Number(it.qty_on_hand || 0) * Number(it.avg_unit_cost || 0)
                      const itemMove = movements[it.id] || { inQty: 0, outQty: 0, adjQty: 0 }

                      return (
                        <tr key={it.id || idx} className="border-b border-neutral-200 hover:bg-neutral-50/50">
                          <td className="py-2 px-1.5 text-center text-neutral-500 whitespace-nowrap">{idx + 1}</td>
                          <td className="py-2 px-2 font-mono font-bold text-neutral-900 whitespace-nowrap">{it.item_code}</td>

                          {showImages && (
                            <td className="py-2 px-1 text-center whitespace-nowrap">
                              {it.image_url ? (
                                <R2Image fileKey={it.image_url} alt="" className="mx-auto h-7 w-7 rounded object-cover border border-neutral-300" />
                              ) : (
                                <span className="text-neutral-300 text-[10px]">-</span>
                              )}
                            </td>
                          )}

                          <td className="py-2 px-3 font-semibold text-neutral-900 leading-normal min-w-[200px]">
                            {it.item_name}
                          </td>

                          <td className="py-2 px-2 text-neutral-600 whitespace-nowrap">
                            {it.item_categories?.name || '-'}
                          </td>

                          {/* คอลัมน์เฉพาะโหมด Movement */}
                          {reportType === 'movement' && (
                            <>
                              <td className="py-2 px-2 text-right font-mono text-emerald-700 whitespace-nowrap font-bold">
                                {itemMove.inQty > 0 ? `+${itemMove.inQty}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-700 whitespace-nowrap font-bold">
                                {itemMove.outQty > 0 ? `-${itemMove.outQty}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-purple-700 whitespace-nowrap font-bold">
                                {itemMove.adjQty !== 0 ? (itemMove.adjQty > 0 ? `+${itemMove.adjQty}` : itemMove.adjQty) : '-'}
                              </td>
                            </>
                          )}

                          <td className="py-2 px-2 text-right font-mono font-bold text-neutral-900 whitespace-nowrap">
                            {it.qty_on_hand}
                          </td>

                          <td className="py-2 px-1.5 text-center text-neutral-600 whitespace-nowrap">{it.unit || '-'}</td>

                          {showValuation && (
                            <>
                              <td className="py-2 px-2 text-right font-mono text-neutral-700 whitespace-nowrap">
                                {baht(it.avg_unit_cost)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-neutral-900 whitespace-nowrap">
                                {baht(itemVal)}
                              </td>
                            </>
                          )}

                          {showReorderPoint && (
                            <td className="py-2 px-1.5 text-center font-mono text-neutral-500 whitespace-nowrap">
                              {it.reorder_point || '-'}
                            </td>
                          )}

                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            {isOut ? (
                              <span className="font-bold text-red-700 text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                หมดสต็อก
                              </span>
                            ) : isLow ? (
                              <span className="font-bold text-amber-700 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                ใกล้หมด
                              </span>
                            ) : (
                              <span className="text-emerald-700 text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                                ปกติ
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-black font-bold bg-neutral-50">
                    <td colSpan={showImages ? 4 : 3} className="py-2.5 px-3 text-right whitespace-nowrap">
                      รวมทั้งสิ้น ({filteredItems.length} รายการ):
                    </td>
                    <td className="whitespace-nowrap"></td>
                    {reportType === 'movement' && (
                      <>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-800 whitespace-nowrap">+{totalInPeriod}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-rose-800 whitespace-nowrap">-{totalOutPeriod}</td>
                        <td className="whitespace-nowrap"></td>
                      </>
                    )}
                    <td className="whitespace-nowrap"></td>
                    <td className="whitespace-nowrap"></td>
                    {showValuation && (
                      <>
                        <td className="py-2.5 px-2 text-right text-xs text-neutral-700 whitespace-nowrap font-bold">มูลค่าคงคลังรวม (บาท):</td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-black text-sm text-neutral-900 whitespace-nowrap min-w-[120px]">{baht(totalValue)}</td>
                      </>
                    )}
                    {showReorderPoint && <td className="whitespace-nowrap"></td>}
                    <td className="whitespace-nowrap"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 4. หมายเหตุเพิ่มเติม */}
            {reportNotes && (
              <div className="mt-4 p-2.5 rounded bg-neutral-50 border border-neutral-200 text-[10px] text-neutral-600">
                <span className="font-bold text-neutral-800">หมายเหตุประกอบรายงาน: </span>
                <span>{reportNotes}</span>
              </div>
            )}

            {/* 5. ช่องลงนาม 3 ฝ่าย */}
            {showSignatures && (
              <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs break-inside-avoid">
                <div className="space-y-10">
                  <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                  <div>
                    <p className="font-semibold text-neutral-900">({userProfile?.full_name || '...................................................'})</p>
                    <p className="text-[11px] text-neutral-600 font-medium">ผู้จัดทำรายงาน (สโตร์)</p>
                    <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                  <div>
                    <p className="font-semibold text-neutral-900">(...................................................)</p>
                    <p className="text-[11px] text-neutral-600 font-medium">ผู้ตรวจสอบสต็อก (ฝ่ายบัญชี / การเงิน)</p>
                    <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                  <div>
                    <p className="font-semibold text-neutral-900">(...................................................)</p>
                    <p className="text-[11px] text-neutral-600 font-medium">ผู้อนุมัติรับทราบ (ผู้จัดการ / ผู้บริหาร)</p>
                    <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
