import { useCallback, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageStore, formatIntQty, toIntQty } from '../../lib/store'
import { baht } from '../../lib/projects'
import { ArrowLeft } from 'lucide-react'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import Pagination from '../../components/Pagination'

const TYPE = { receipt: 'รับเข้าสโตร์', adjustment: 'ปรับปรุงสต็อก', migration: 'ยกมา' }

export default function ReceiptsList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canManageStore(profile?.role)

  const [rows, setRows] = useState(null)
  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [pendingPos, setPendingPos] = useState([])
  const [activeMainTab, setActiveMainTab] = useState('received') // 'received' | 'pending_po'
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20) // 10 | 20 | 50 | 100
  const [showStockInForm, setShowStockInForm] = useState(false)
  const [docViewMode, setDocViewMode] = useState('business') // 'business' | 'accounting'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ตัวกรองช่วงเวลา (Date Range Filters)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | '7days' | '30days' | 'thisMonth' | 'thisYear' | 'custom'

  const handleDatePreset = (preset) => {
    setDatePreset(preset)
    const today = new Date()
    const formatDate = (d) => d.toISOString().slice(0, 10)

    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else if (preset === 'today') {
      const t = formatDate(today)
      setStartDate(t)
      setEndDate(t)
    } else if (preset === '7days') {
      const p = new Date()
      p.setDate(today.getDate() - 7)
      setStartDate(formatDate(p))
      setEndDate(formatDate(today))
    } else if (preset === '30days') {
      const p = new Date()
      p.setDate(today.getDate() - 30)
      setStartDate(formatDate(p))
      setEndDate(formatDate(today))
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(formatDate(firstDay))
      setEndDate(formatDate(today))
    } else if (preset === 'thisYear') {
      const firstDay = new Date(today.getFullYear(), 0, 1)
      setStartDate(formatDate(firstDay))
      setEndDate(formatDate(today))
    }
  }

  // Form state สำหรับรับวัสดุเข้าโดยตรง
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [projectId, setProjectId] = useState('')
  const [vendorTaxInvoiceNo, setVendorTaxInvoiceNo] = useState('')
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(new Date().toISOString().slice(0, 10))

  const loadData = useCallback(() => {
    supabase.from('stock_lots')
      .select('id, item_id, grn_item_id, lot_type, received_date, qty_received, qty_remaining, unit_cost, created_at, inventory_items(id, item_code, item_name, unit), projects(project_code, project_name), goods_receipt_items(goods_receipts(grn_no, purchase_orders(po_no)))')
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data ?? [])))

    supabase.from('inventory_items')
      .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setItems(data ?? []))

    supabase.from('projects')
      .select('id, project_code, project_name')
      .order('project_code')
      .then(({ data }) => setProjects(data ?? []))

    supabase.from('purchase_orders')
      .select('id, po_no, order_date, status, expected_delivery_date, total_amount, grand_total, vendor_id, project_id, custom_vendor_name, custom_project_name, vendors(id, vendor_code, vendor_name), projects(id, project_code, project_name), purchase_order_items(id, item_name, quantity, unit, unit_price, qty_received)')
      .in('status', ['open', 'partial', 'pending_receipt'])
      .order('order_date', { ascending: false })
      .then(({ data }) => setPendingPos(data ?? []))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedItem = items.find((i) => i.id === selectedItemId)

  const handleItemSelect = (id) => {
    setSelectedItemId(id)
    const it = items.find((i) => i.id === id)
    if (it && it.avg_unit_cost && !unitPrice) {
      setUnitPrice(String(it.avg_unit_cost))
    }
  }

  // ฟังก์ชันบันทึกรับวัสดุเข้าสโตร์โดยตรง
  async function handleDirectStockIn() {
    if (!selectedItemId) return setError('กรุณาเลือกวัสดุที่ต้องการรับเข้า')
    const quantity = toIntQty(qty)
    const price = Number(unitPrice)
    if (!quantity || quantity <= 0) return setError('จำนวนต้องมากกว่า 0')
    if (isNaN(price) || price < 0) return setError('ราคาต่อชิ้นไม่ถูกต้อง')

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const it = selectedItem || {}
      const curQty = Number(it.qty_on_hand || 0)
      const curAvg = Number(it.avg_unit_cost || 0)
      const newQty = curQty + quantity
      const newAvg = newQty > 0 ? Math.round(((curQty * curAvg) + (quantity * price)) / newQty * 100) / 100 : price

      // 1. บันทึกล็อต
      await supabase.from('stock_lots').insert({
        item_id: selectedItemId,
        source_project_id: projectId || null,
        lot_type: 'receipt',
        qty_received: quantity,
        qty_remaining: quantity,
        unit_cost: price,
        received_date: taxInvoiceDate || new Date().toISOString().split('T')[0],
      })

      // 2. อัปเดตสต็อกคงเหลือ
      await supabase.from('inventory_items').update({
        qty_on_hand: newQty,
        avg_unit_cost: newAvg,
      }).eq('id', selectedItemId)

      setSuccess(`รับเข้า "${selectedItem?.item_name}" จำนวน ${quantity} ${selectedItem?.unit || ''} (ราคา @${baht(price)} บ.) เรียบร้อย พร้อมบันทึกทางบัญชี`)
      setTimeout(() => setSuccess(''), 4000)
      setSelectedItemId('')
      setQty('')
      setUnitPrice('')
      setProjectId('')
      setVendorTaxInvoiceNo('')
      setShowStockInForm(false)
      loadData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'บันทึกรับเข้าไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  // รีเซ็ตหน้าเมื่อตัวกรองค้นหาหรือช่วงเวลาเปลี่ยน (ต้องอยู่ก่อน Early Return)
  useEffect(() => {
    setCurrentPage(1)
  }, [search, startDate, endDate])

  // ป้องกันการแสดงผลล็อตซ้ำซ้อน (Deduplication) ทั้งกรณีล็อตตรงกับ GRN และล็อตที่บันทึกซ้ำซ้อน
  const deduplicatedRows = useMemo(() => {
    if (!rows || rows.length === 0) return []

    const grnRows = []
    const noGrnRows = []

    for (const r of rows) {
      const gri = Array.isArray(r.goods_receipt_items) ? r.goods_receipt_items[0] : r.goods_receipt_items
      const grnNo = gri?.goods_receipts?.grn_no
      if (grnNo) {
        grnRows.push(r)
      } else {
        noGrnRows.push(r)
      }
    }

    // ฟังก์ชันสร้าง Identity Key ที่แปลงตัวเลขให้แน่นอน ป้องกันปัญหา string "5.00" !== "5"
    const getItemIdentifier = (r) => {
      return (
        r.inventory_items?.id ||
        r.item_id ||
        r.inventory_items?.item_code ||
        r.inventory_items?.item_name ||
        ''
      )
    }

    const getMatchKey = (r) => {
      const itId = getItemIdentifier(r)
      const date = (r.received_date || '').slice(0, 10)
      const qty = Math.round(Number(r.qty_received || 0))
      const cost = Math.round(Number(r.unit_cost || 0) * 100) / 100
      return `${date}_${itId}_${qty}_${cost}`
    }

    // 1. กรองแถวที่มี GRN ไม่ให้ซ้ำกันเอง
    const seenGrnKeys = new Set()
    const cleanGrnRows = grnRows.filter((r) => {
      const gri = Array.isArray(r.goods_receipt_items) ? r.goods_receipt_items[0] : r.goods_receipt_items
      const grnNo = gri?.goods_receipts?.grn_no || ''
      const itId = getItemIdentifier(r)
      const qty = Math.round(Number(r.qty_received || 0))
      const key = `${grnNo}_${itId}_${qty}`
      if (seenGrnKeys.has(key)) return false
      seenGrnKeys.add(key)
      return true
    })

    // 2. กรองแถวที่ไม่มี GRN (รับเข้าสโตร์ลอย)
    const seenGhost = new Set()
    const cleanNoGrnRows = noGrnRows.filter((r) => {
      const key = getMatchKey(r)
      const itId = getItemIdentifier(r)
      const date = (r.received_date || '').slice(0, 10)
      const qty = Math.round(Number(r.qty_received || 0))
      const cost = Math.round(Number(r.unit_cost || 0) * 100) / 100

      // หากมีแถวที่ผูกกับใบรับของ (GRN / RI) อยู่แล้วในวันเดียวกัน สินค้าและจำนวนเดียวกัน ให้ตัดแถวลอยทิ้ง 100%
      const isDuplicateOfGrn = cleanGrnRows.some((gr) => {
        const grItId = getItemIdentifier(gr)
        const grDate = (gr.received_date || '').slice(0, 10)
        const grQty = Math.round(Number(gr.qty_received || 0))
        const grCost = Math.round(Number(gr.unit_cost || 0) * 100) / 100

        // ตรงกันทั้งวัน พัสดุ และจำนวน (หรือราคา)
        if (grDate === date && grItId === itId && grQty === qty) {
          return true
        }
        return false
      })
      if (isDuplicateOfGrn) return false

      // หากไม่มี GRN ทั้งคู่ แต่เป็นรายการซ้ำซ้อนในวันและราคาเดียวกัน ให้คงไว้เพียง 1 รายการ
      if (seenGhost.has(key)) return false
      seenGhost.add(key)
      return true
    })

    return [...cleanGrnRows, ...cleanNoGrnRows].sort((a, b) => {
      // 1. วันที่รับเข้าล่าสุดอยู่บนสุด
      const dComp = (b.received_date || '').localeCompare(a.received_date || '')
      if (dComp !== 0) return dComp

      // 2. ถ้าวันที่เดียวกัน ให้ดูเลขที่ใบรับของ (GRN / RI) ล่าสุดอยู่บนสุด (เช่น RI2026-0020 มาก่อน RI2026-0019)
      const aGri = Array.isArray(a.goods_receipt_items) ? a.goods_receipt_items[0] : a.goods_receipt_items
      const bGri = Array.isArray(b.goods_receipt_items) ? b.goods_receipt_items[0] : b.goods_receipt_items
      const aGrn = aGri?.goods_receipts?.grn_no || ''
      const bGrn = bGri?.goods_receipts?.grn_no || ''
      if (aGrn && bGrn) {
        const grnComp = bGrn.localeCompare(aGrn)
        if (grnComp !== 0) return grnComp
      }
      if (bGrn && !aGrn) return 1
      if (aGrn && !bGrn) return -1

      // 3. เวลาสร้างจริงล่าสุด (created_at) ล่าสุดอยู่บนสุด
      const cComp = (b.created_at || '').localeCompare(a.created_at || '')
      if (cComp !== 0) return cComp

      return (b.id || '').localeCompare(a.id || '')
    })
  }, [rows])

  const shown = useMemo(() => {
    if (!deduplicatedRows) return []
    const q = search.trim().toLowerCase()
    return deduplicatedRows.filter((r) => {
      if (q) {
        const itemName = (r.inventory_items?.item_name ?? '').toLowerCase()
        const itemCode = (r.inventory_items?.item_code ?? '').toLowerCase()
        const grnNo = (r.goods_receipt_items?.goods_receipts?.grn_no ?? '').toLowerCase()
        const poNo = (r.goods_receipt_items?.goods_receipts?.purchase_orders?.po_no ?? '').toLowerCase()
        const projName = (r.projects?.project_name ?? '').toLowerCase()
        const projCode = (r.projects?.project_code ?? '').toLowerCase()

        const match =
          itemName.includes(q) ||
          itemCode.includes(q) ||
          grnNo.includes(q) ||
          poNo.includes(q) ||
          projName.includes(q) ||
          projCode.includes(q)
        if (!match) return false
      }

      if (startDate && r.received_date < startDate) return false
      if (endDate && r.received_date > endDate) return false
      return true
    })
  }, [rows, search, startDate, endDate])

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return shown.slice(start, start + pageSize)
  }, [shown, currentPage, pageSize])

  const filteredPendingPos = useMemo(() => {
    if (!pendingPos) return []
    const q = search.trim().toLowerCase()
    return pendingPos.filter((po) => {
      if (!q) return true
      const poNo = (po.po_no || '').toLowerCase()
      const vName = (po.vendors?.vendor_name || po.custom_vendor_name || '').toLowerCase()
      const pName = (po.projects?.project_name || po.custom_project_name || '').toLowerCase()
      const pCode = (po.projects?.project_code || '').toLowerCase()
      const itemMatch = (po.purchase_order_items || []).some((it) => (it.item_name || '').toLowerCase().includes(q))
      return poNo.includes(q) || vName.includes(q) || pName.includes(q) || pCode.includes(q) || itemMatch
    })
  }, [pendingPos, search])

  const paginatedPendingPos = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredPendingPos.slice(start, start + pageSize)
  }, [filteredPendingPos, currentPage, pageSize])

  if (!rows) return <p className="text-steel-500">{error || 'กำลังโหลดประวัติรับเข้า...'}</p>
  const totalValue = shown.reduce((s, r) => s + Number(r.qty_received) * Number(r.unit_cost), 0)

  return (
    <div className="space-y-4">
      {/* ส่วนหัว และปุ่มรับเข้า */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-steel-700 dark:text-slate-200 shadow-2xs transition flex items-center gap-1 cursor-pointer"
            title="ย้อนกลับ"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ย้อนกลับ</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-ink dark:text-slate-100">ประวัติการรับวัสดุเข้าสโตร์ (Goods Receipts - RI)</h2>
            <p className="text-xs text-steel-500 dark:text-slate-400">แสดงรายการล็อตที่รับเข้าสโตร์ ทั้งจากใบสั่งซื้อ (PO) และรับเข้าโดยตรง พร้อมผูก General Ledger</p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowStockInForm(!showStockInForm)}
            className="btn-primary flex items-center gap-1.5 shadow-sm !py-2"
          >
            <span>{showStockInForm ? '▲ ซ่อนแบบฟอร์ม' : '📥 + รับวัสดุเข้าสโตร์โดยตรง'}</span>
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

      {/* ฟอร์มรับวัสดุเข้าสโตร์โดยตรง */}
      {showStockInForm && canEdit && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-5 shadow-sm transition space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-emerald-200">
            <div>
              <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                <span>📥 บันทึกรับวัสดุเข้าสโตร์ (Direct Stock-In & Tax Invoice)</span>
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                ระบุจำนวน ราคาต่อหน่วย เลขที่ใบกำกับภาษี และโครงการที่ตัดต้นทุน (P&L Allocation)
              </p>
            </div>
            <button
              onClick={() => setShowStockInForm(false)}
              className="text-xs text-steel-500 hover:text-black"
            >
              ✕ ปิด
            </button>
          </div>

          {/* แถวที่ 1: เลขที่ใบกำกับภาษี และวันที่ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-emerald-200">
            <div>
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                เลขที่ใบกำกับภาษี / ใบส่งของอ้างอิงของผู้ขาย (Vendor Tax Invoice No.)
              </label>
              <input
                type="text"
                placeholder="เช่น TAX-SCG-99812"
                className="input w-full text-xs font-mono"
                value={vendorTaxInvoiceNo}
                onChange={(e) => setVendorTaxInvoiceNo(e.target.value)}
              />
              <span className="text-[10px] text-steel-500">สำหรับบันทึกภาษีซื้อ (Input VAT) และการตรวจสอบสโตร์</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                วันที่ใบกำกับภาษี / วันที่รับของจริง
              </label>
              <input
                type="date"
                className="input w-full text-xs"
                value={taxInvoiceDate}
                onChange={(e) => setTaxInvoiceDate(e.target.value)}
              />
            </div>
          </div>

          {/* แถวที่ 2: วัสดุ, จำนวน, ราคา, โครงการ */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-emerald-950 dark:text-emerald-200 mb-1">
                ค้นหาและเลือกวัสดุที่รับเข้า *
              </label>
              <SearchableItemSelect
                items={items}
                value={selectedItemId}
                onChange={handleItemSelect}
                placeholder="พิมพ์ค้นหารหัส หรือชื่อพัสดุ..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 dark:text-emerald-200 mb-1">
                จำนวนที่รับเข้า * {selectedItem?.unit ? `(${selectedItem.unit})` : ''}
              </label>
              <input
                className="input w-full text-xs font-bold text-ink dark:text-slate-100"
                type="number"
                min="1"
                step="1"
                placeholder="ระบุจำนวนเต็ม"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 dark:text-emerald-200 mb-1">
                ราคาต่อชิ้น / ต่อหน่วย (บาท) *
              </label>
              <input
                className="input w-full text-xs font-bold text-ink dark:text-slate-100"
                type="number"
                min="0"
                step="0.01"
                placeholder="ราคาต่อหน่วย"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 dark:text-emerald-200 mb-1">
                โครงการที่ตัดต้นทุน (ถ้ามี)
              </label>
              <SearchableProjectSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                placeholder="ค้นหาโครงการ (เว้นว่าง = ของกลางบริษัท)..."
              />
            </div>
          </div>

          {selectedItem && Number(qty) > 0 && Number(unitPrice) >= 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 p-3 border border-emerald-200 dark:border-emerald-800 text-xs">
              <div className="space-x-2 text-emerald-900 dark:text-emerald-300">
                <span>วัสดุ: <b className="dark:text-white">{selectedItem.item_name}</b></span>
                <span>· รับเข้า: <b className="dark:text-white">{qty} {selectedItem.unit}</b> @ <b className="dark:text-white">{baht(unitPrice)} บาท</b></span>
              </div>
              <div className="font-bold text-sm text-emerald-950 dark:text-emerald-200">
                มูลค่ารับเข้ารวม: <b className="dark:text-amber-400">{baht(Number(qty) * Number(unitPrice))}</b> บาท
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost !py-1.5 text-xs"
              onClick={() => setShowStockInForm(false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn-primary !py-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleDirectStockIn}
              disabled={saving || !selectedItemId || !Number(qty) || Number(unitPrice) < 0}
            >
              {saving ? 'กำลังบันทึก...' : '📥 ยืนยันรับเข้าสโตร์และบันทึกบัญชี'}
            </button>
          </div>
        </div>
      )}

      {/* แท็บหลัก: รับเข้าสโตร์แล้ว (ประวัติ RI) vs ใบสั่งซื้อรอรับเข้า (Pending Deliveries) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveMainTab('received')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
              activeMainTab === 'received'
                ? 'bg-sky-700 text-white shadow-sm dark:bg-sky-600'
                : 'bg-white dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-50 dark:hover:bg-slate-700 border border-steel-200 dark:border-slate-700'
            }`}
          >
            <span>📜</span>
            <span>ประวัติรับเข้าสโตร์แล้ว (Goods Receipts - RI)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeMainTab === 'received' ? 'bg-white/20 text-white' : 'bg-steel-200 dark:bg-slate-700 text-steel-700 dark:text-slate-200'
            }`}>
              {shown.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMainTab('pending_po')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
              activeMainTab === 'pending_po'
                ? 'bg-amber-600 text-white shadow-sm dark:bg-amber-500'
                : 'bg-white dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-50 dark:hover:bg-slate-700 border border-steel-200 dark:border-slate-700'
            }`}
          >
            <span>🚚</span>
            <span>ใบสั่งซื้อรอรับเข้าสโตร์ (Pending PO Deliveries)</span>
            {pendingPos.length > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 animate-pulse">
                {pendingPos.length} ใบ
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-steel-400">0</span>
            )}
          </button>
        </div>

        {/* ช่องค้นหาด่วน */}
        <div className="w-full sm:w-auto">
          <input
            className="input text-xs w-full sm:w-72"
            placeholder={activeMainTab === 'received' ? "🔍 ค้นหารหัส / ชื่อพัสดุ / เลขที่ RI..." : "🔍 ค้นหาเลขที่ PO / ผู้ขาย / วัสดุ..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {activeMainTab === 'pending_po' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl">🚚</span>
              <div>
                <h4 className="font-bold text-sm text-amber-950 dark:text-amber-100">ใบสั่งซื้อที่อยู่ระหว่างรอสินค้าส่งมอบเข้าสโตร์ (Pending Deliveries)</h4>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  เมื่อผู้ขายนำของมาส่งถึงโกดัง/ไซต์งาน ให้กดปุ่ม <b>"📥 ตรวจรับเข้าสโตร์"</b> เพื่อระบุจำนวนที่รับจริง ตรวจรับเข้าคลัง และออกเลขที่ใบรับของ (RI) ทันที
                </p>
              </div>
            </div>
            <Link
              to="/purchasing?tab=po"
              className="text-xs font-bold text-amber-900 dark:text-amber-200 underline hover:no-underline flex items-center gap-1"
            >
              <span>ไปที่ฝ่ายจัดซื้อ (PO Hub)</span>
              <span>&rarr;</span>
            </Link>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <table className="w-full text-left text-xs min-w-[900px] divide-y divide-steel-200 dark:divide-slate-800">
              <thead className="bg-steel-50/80 dark:bg-slate-800 text-steel-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3">วันที่สั่งซื้อ</th>
                  <th className="py-3 px-3">เลขที่ใบสั่งซื้อ (PO)</th>
                  <th className="py-3 px-3">ผู้ขาย / ร้านค้า</th>
                  <th className="py-3 px-3">โครงการ / ไซต์งาน</th>
                  <th className="py-3 px-3">กำหนดส่งมอบ</th>
                  <th className="py-3 px-3">รายการพัสดุใน PO</th>
                  <th className="py-3 px-3 text-right">ยอดรวม (บ.)</th>
                  <th className="py-3 px-3 text-center">สถานะการรับ</th>
                  <th className="py-3 px-3 text-center">ตรวจรับของ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
                {filteredPendingPos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-steel-400 dark:text-slate-500 text-xs">
                      {search ? 'ไม่พบใบสั่งซื้อที่ตรงกับคำค้นหา' : 'ไม่มีใบสั่งซื้อที่ค้างรับของ (รับของเข้าสโตร์ครบทุกใบแล้ว 🎉)'}
                    </td>
                  </tr>
                ) : (
                  paginatedPendingPos.map((po) => {
                    const vendorName = po.vendors?.vendor_name || po.custom_vendor_name || 'ไม่ระบุผู้ขาย'
                    const projCode = po.projects?.project_code || ''
                    const projName = po.projects?.project_name || po.custom_project_name || 'ของกลางบริษัท'
                    const itemsList = po.purchase_order_items || []
                    const totalQty = itemsList.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
                    const receivedQty = itemsList.reduce((s, it) => s + (Number(it.qty_received) || 0), 0)
                    const isPartial = receivedQty > 0 && receivedQty < totalQty

                    return (
                      <tr key={po.id} className="hover:bg-steel-50/80 dark:hover:bg-slate-800/60 transition text-xs">
                        <td className="py-3 px-3 font-mono text-steel-700 dark:text-slate-300 whitespace-nowrap">
                          {po.order_date}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Link
                            to={`/purchasing/po/${po.id}`}
                            className="font-mono font-bold text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1"
                          >
                            <span>{po.po_no}</span>
                          </Link>
                        </td>
                        <td className="py-3 px-3 font-medium text-steel-900 dark:text-slate-100 max-w-[160px] truncate" title={vendorName}>
                          {vendorName}
                        </td>
                        <td className="py-3 px-3 text-steel-700 dark:text-slate-300 max-w-[160px] truncate" title={`${projCode} ${projName}`}>
                          {projCode ? <span className="font-mono font-bold text-amber-700 dark:text-amber-400 mr-1">{projCode}</span> : null}
                          <span>{projName}</span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {po.expected_delivery_date ? (
                            <span className="font-mono text-steel-700 dark:text-slate-300">
                              {po.expected_delivery_date}
                            </span>
                          ) : (
                            <span className="text-steel-400 italic">ไม่ระบุ</span>
                          )}
                        </td>
                        <td className="py-3 px-3 min-w-[200px]">
                          <div className="space-y-0.5">
                            {itemsList.slice(0, 2).map((it, idx) => (
                              <div key={idx} className="text-[11px] text-steel-700 dark:text-slate-300 flex items-center justify-between gap-2">
                                <span className="truncate max-w-[150px] font-medium">• {it.item_name}</span>
                                <span className="font-mono text-steel-500 dark:text-slate-400 shrink-0">
                                  {Number(it.qty_received) || 0}/{Number(it.quantity) || 0} {it.unit}
                                </span>
                              </div>
                            ))}
                            {itemsList.length > 2 && (
                              <div className="text-[10px] text-steel-400 italic">
                                + อีก {itemsList.length - 2} รายการ...
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-steel-900 dark:text-slate-100 whitespace-nowrap">
                          {baht(po.grand_total || po.total_amount || 0)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isPartial ? (
                            <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                              📦 รับบางส่วน ({receivedQty}/{totalQty})
                            </span>
                          ) : (
                            <span className="bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                              ⏳ รอส่งมอบ (ยังไม่ได้รับ)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <Link
                            to={`/purchasing/po/${po.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                            title="เปิดเพื่อตรวจนับและยืนยันรับเข้าสโตร์"
                          >
                            <span>📥 ตรวจรับเข้าสโตร์</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPendingPos.length > 0 && (
            <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-xs">
              <Pagination
                currentPage={currentPage}
                totalItems={filteredPendingPos.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize)
                  setCurrentPage(1)
                }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      )}

      {activeMainTab === 'received' && (
        <div className="space-y-4">
          {/* แถบตัวกรองมุมมอง Dual-Status และช่วงเวลา */}
          <div className="space-y-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-steel-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-steel-700 dark:text-slate-300">มุมมอง:</span>
                <button
                  onClick={() => setDocViewMode('business')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    docViewMode === 'business' ? 'bg-sky-700 text-white shadow-sm' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                  }`}
                >
                  📁 เอกสารสโตร์
                </button>
                <button
                  onClick={() => setDocViewMode('accounting')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    docViewMode === 'accounting' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                  }`}
                >
                  ⚖️ เอกสารบัญชีสต็อก (RI / GL)
                </button>
              </div>
            </div>

        {/* ตัวกรองช่วงเวลาดูประวัติย้อนหลัง */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-steel-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-steel-600 dark:text-slate-300 mr-1">📅 ช่วงเวลา:</span>
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'today', label: 'วันนี้' },
              { id: '7days', label: '7 วันล่าสุด' },
              { id: '30days', label: '30 วันล่าสุด' },
              { id: 'thisMonth', label: 'เดือนนี้' },
              { id: 'thisYear', label: 'ปีนี้ (2569)' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleDatePreset(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                  datePreset === p.id
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-steel-100 dark:bg-slate-800 text-steel-600 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-steel-500 dark:text-slate-400">ตั้งแต่:</span>
            <input
              type="date"
              className="input !py-1 !px-2 text-xs w-36"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setDatePreset('custom')
              }}
            />
            <span className="text-steel-500 dark:text-slate-400">ถึง:</span>
            <input
              type="date"
              className="input !py-1 !px-2 text-xs w-36"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setDatePreset('custom')
              }}
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => handleDatePreset('all')}
                className="text-xs text-rose-600 hover:underline px-1"
                title="ล้างตัวกรองวันที่"
              >
                ล้าง
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-steel-700 dark:text-slate-300 flex justify-between items-center font-medium">
        <span>มูลค่ารับเข้ารวม (ที่แสดง): <b className="text-sky-800 dark:text-amber-400 font-mono text-sm font-bold">{baht(totalValue)}</b> บาท</span>
        <span className="text-steel-500 dark:text-slate-400">แสดง {shown.length} รายการ</span>
      </div>

      {/* ตารางแสดงล็อตรับเข้าพร้อม Dual Status Badges */}
      <div className="overflow-x-auto rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-xs border border-steel-200 dark:border-slate-800">
        <table className="w-full text-xs sm:text-sm min-w-[1050px]">
          <thead>
            <tr className="border-b border-steel-200 dark:border-slate-800 bg-steel-50/80 dark:bg-slate-800 text-left text-steel-600 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
              <th className="py-3 px-3 whitespace-nowrap">วันที่รับเข้า</th>
              <th className="py-3 px-3 whitespace-nowrap">รหัสวัสดุ</th>
              <th className="py-3 px-3 min-w-[200px]">ชื่อวัสดุ / อุปกรณ์</th>
              <th className="py-3 px-3 whitespace-nowrap">ที่มาการรับเข้า</th>
              <th className="py-3 px-3 whitespace-nowrap">โครงการต้นทาง</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">จำนวนรับเข้า</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">คงเหลือในล็อต</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">ราคา/ชิ้น (บาท)</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">มูลค่ารับเข้า</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">สถานะธุรกิจ</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">สถานะบัญชี (GL)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-steel-400 dark:text-slate-500 text-xs">
                  ไม่พบรายการรับเข้า
                </td>
              </tr>
            ) : (
              paginatedRows.map((r) => {
                const gri = Array.isArray(r.goods_receipt_items) ? r.goods_receipt_items[0] : r.goods_receipt_items
                const grn = gri?.goods_receipts
                return (
                  <tr key={r.id} className="hover:bg-steel-50/80 dark:hover:bg-slate-800/60 transition text-xs">
                    {/* วันที่รับเข้า (อยู่บรรทัดเดียว ไม่ตัดบรรทัด) */}
                    <td className="py-3 px-3 font-mono text-steel-700 dark:text-slate-300 whitespace-nowrap font-medium">
                      {r.received_date}
                    </td>

                    {/* รหัสพัสดุ (อยู่บรรทัดเดียว) */}
                    <td className="py-3 px-3 font-mono font-bold text-steel-900 dark:text-slate-100 whitespace-nowrap">
                      {r.inventory_items?.item_code}
                    </td>

                    {/* ชื่อวัสดุ */}
                    <td className="py-3 px-3 font-bold text-steel-900 dark:text-slate-100 min-w-[200px]">
                      {r.inventory_items?.item_name}
                    </td>

                    {/* ที่มาการรับเข้า */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {grn?.grn_no ? (
                        <span className="font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
                          {grn.grn_no}
                        </span>
                      ) : (
                        <span className="text-steel-600 dark:text-slate-300 bg-steel-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-medium">
                          {TYPE[r.lot_type] ?? r.lot_type}
                        </span>
                      )}
                    </td>

                    {/* โครงการต้นทาง (จำกัดความยาวพอดี ไม่ล้น พร้อม Tooltip แสดงชื่อเต็ม) */}
                    <td className="py-3 px-3 text-xs max-w-[150px]">
                      {r.projects ? (
                        <div
                          className="truncate font-medium text-slate-800 dark:text-slate-200 cursor-help"
                          title={`${r.projects.project_code} - ${r.projects.project_name}`}
                        >
                          <span className="font-mono font-bold text-sky-700 dark:text-sky-400 mr-1">
                            {r.projects.project_code}
                          </span>
                          <span>{r.projects.project_name}</span>
                        </div>
                      ) : (
                        <span className="text-steel-500 dark:text-slate-400 font-medium">ของกลางบริษัท</span>
                      )}
                    </td>

                    {/* จำนวนรับเข้า (อยู่บรรทัดเดียวกัน เช่น 5 ตู้) */}
                    <td className="py-3 px-3 text-right font-bold text-steel-900 dark:text-slate-100 whitespace-nowrap">
                      <span className="font-mono text-sm">{formatIntQty(r.qty_received)}</span>{' '}
                      <span className="text-xs text-steel-500 dark:text-slate-400 font-normal">{r.inventory_items?.unit}</span>
                    </td>

                    {/* คงเหลือในล็อต */}
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                      {formatIntQty(r.qty_remaining)}
                    </td>

                    {/* ราคา/ชิ้น */}
                    <td className="py-3 px-3 text-right font-mono text-steel-800 dark:text-slate-300 whitespace-nowrap">
                      {baht(r.unit_cost)}
                    </td>

                    {/* มูลค่ารับเข้า */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-steel-900 dark:text-slate-100 whitespace-nowrap">
                      {baht(Number(r.qty_received) * Number(r.unit_cost))}
                    </td>

                    {/* สถานะธุรกิจ */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="bg-sky-50 text-sky-800 px-2.5 py-1 rounded-full text-[10px] font-bold border border-sky-200">
                        {TYPE[r.lot_type] ?? 'รับเข้าสโตร์'}
                      </span>
                    </td>

                    {/* สถานะบัญชี */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-200">
                        ✅ ลงบัญชีแล้ว (RI)
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {shown.length > 0 && (
        <div className="rounded-2xl border border-steel-200 bg-white px-5 py-3 shadow-xs">
          <Pagination
            currentPage={currentPage}
            totalItems={shown.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
      )}
        </div>
      )}
    </div>
  )
}
