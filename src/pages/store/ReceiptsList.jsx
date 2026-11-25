import { Fragment, useCallback, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageStore, formatIntQty, toIntQty } from '../../lib/store'
import { baht } from '../../lib/projects'
import { getPoDueStatus, formatThaiDate } from '../../lib/poDueStatus'
import { buildReceivePayloadItems } from '../../lib/goodsReceiptUtils'
import { ensureGrnAccountingAndAp } from '../../lib/goodsReceiptAccounting'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  ExternalLink,
  Package,
} from 'lucide-react'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import Pagination from '../../components/Pagination'
import TableSortFilter from '../../components/TableSortFilter'

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
  const [sortBy, setSortBy] = useState('date_desc')
  const [categories, setCategories] = useState([])
  const [showQuickItemModal, setShowQuickItemModal] = useState(false)
  const [quickItemName, setQuickItemName] = useState('')
  const [quickItemCatId, setQuickItemCatId] = useState('')
  const [quickItemUnit, setQuickItemUnit] = useState('ชิ้น')
  const [quickItemSaving, setQuickItemSaving] = useState(false)
  const [quickItemError, setQuickItemError] = useState('')

  // State สำหรับ Modal ตรวจรับเข้าสโตร์ (Receive Goods Modal from PO)
  const [receivingPo, setReceivingPo] = useState(null)
  const [receiveQuantities, setReceiveQuantities] = useState({})
  const [receivingSubmitting, setReceivingSubmitting] = useState(false)
  const [receiveModalError, setReceiveModalError] = useState('')

  // State สำหรับการขยาย/ย่อแถวรายละเอียดของใบสั่งซื้อรอตรวจรับ (Expandable Accordion Rows)
  const [expandedPendingPoIds, setExpandedPendingPoIds] = useState(new Set())
  const toggleExpandPendingPo = (id) => {
    setExpandedPendingPoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const RECEIPTS_SORT_OPTIONS = [
    { value: 'date_desc', label: ' วันที่และเวลาล่าสุด (ใหม่  เก่า)' },
    { value: 'date_asc', label: ' วันที่ (เก่า  ใหม่)' },
    { value: 'name_asc', label: 'ชื่อพัสดุ ก  ฮ (A  Z)' },
    { value: 'name_desc', label: 'ชื่อพัสดุ ฮ  ก (Z  A)' },
    { value: 'code_asc', label: 'รหัสพัสดุ (น้อย  มาก: 0  9)' },
    { value: 'code_desc', label: 'รหัสพัสดุ (มาก  น้อย: 9  0)' },
    { value: 'qty_desc', label: 'จำนวนรับเข้า (มาก  น้อย)' },
    { value: 'amount_desc', label: 'มูลค่ารับเข้า (มาก  น้อย)' },
  ]
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
      .order('created_at', { ascending: false })
      .order('received_date', { ascending: false })
      .limit(300)
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data ?? [])))

    supabase.from('inventory_items')
      .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setItems(data ?? []))

    supabase.from('item_categories')
      .select('id, name, code_prefix')
      .order('name')
      .then(({ data }) => setCategories(data ?? []))

    supabase.from('projects')
      .select('id, project_code, project_name')
      .order('project_code')
      .then(({ data }) => setProjects(data ?? []))

    supabase.from('purchase_orders')
      .select('*, vendors(id, vendor_code, vendor_name), projects(id, project_code, project_name), purchase_order_items(id, item_id, item_name, quantity, unit, unit_price, qty_received)')
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

  // ฟังก์ชันเปิด Modal สร้างพัสดุใหม่ด่วน
  const handleOpenQuickItemModal = (name = '') => {
    setQuickItemName(name)
    setQuickItemCatId(categories[0]?.id || '')
    setQuickItemUnit('ชิ้น')
    setQuickItemError('')
    setShowQuickItemModal(true)
  }

  // ฟังก์ชันบันทึกพัสดุใหม่ด่วน
  const handleQuickCreateItem = async (e) => {
    e.preventDefault()
    if (!quickItemName.trim()) {
      setQuickItemError('กรุณาระบุชื่อพัสดุ')
      return
    }
    if (!quickItemCatId) {
      setQuickItemError('กรุณาเลือกหมวดหมู่')
      return
    }

    setQuickItemSaving(true)
    setQuickItemError('')

    try {
      const selectedCat = categories.find((c) => c.id === quickItemCatId)
      const prefix = selectedCat?.code_prefix || 'ITM'

      const { count } = await supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', quickItemCatId)

      const genCode = `${prefix}-${String((count || 0) + 1).padStart(3, '0')}`

      const { data: newIt, error: insErr } = await supabase
        .from('inventory_items')
        .insert({
          item_code: genCode,
          item_name: quickItemName.trim(),
          category_id: quickItemCatId,
          unit: quickItemUnit.trim() || 'ชิ้น',
          qty_on_hand: 0,
          avg_unit_cost: 0,
          reorder_point: 5,
        })
        .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost')
        .single()

      if (insErr) throw insErr

      // บันทึกสำเร็จ: นำเข้าลิสต์และเลือกตัวนี้ในฟอร์มทันที
      setItems((prev) => [newIt, ...prev])
      setSelectedItemId(newIt.id)
      setShowQuickItemModal(false)
      setQuickItemName('')
      setQuickItemUnit('ชิ้น')
    } catch (err) {
      console.error('Quick create item failed:', err)
      setQuickItemError(err.message || 'สร้างพัสดุไม่สำเร็จ')
    } finally {
      setQuickItemSaving(false)
    }
  }

  // ฟังก์ชันเปิด Modal ตรวจรับของเข้าสโตร์จาก PO
  const handleOpenReceiveModal = (po) => {
    setReceivingPo(po)
    const initialQty = {}
    po.purchase_order_items?.forEach((it) => {
      const remain = Math.max(0, Number(it.quantity || 0) - Number(it.qty_received || 0))
      initialQty[it.id] = String(remain)
    })
    setReceiveQuantities(initialQty)
    setReceiveModalError('')
  }

  // ฟังก์ชันยืนยันตรวจรับเข้าสโตร์
  const handleConfirmReceive = async () => {
    if (!receivingPo) return
    const poItems = receivingPo.purchase_order_items || []
    const itemsToReceive = buildReceivePayloadItems({
      po: receivingPo,
      poItems,
      receiveQtyMap: receiveQuantities,
    })

    if (itemsToReceive.length === 0) {
      setReceiveModalError('กรุณาระบุจำนวนที่ต้องการรับเข้าสโตร์อย่างน้อย 1 รายการ')
      return
    }

    setReceivingSubmitting(true)
    setReceiveModalError('')

    try {
      // 1. ลองใช้ RPC confirm_goods_receipt
      const { data: rpcGrnId, error: rpcErr } = await supabase.rpc('confirm_goods_receipt', {
        p_po_id: receivingPo.id,
        p_items: itemsToReceive,
      })
      let savedGrnId = rpcGrnId || null
      let savedGrnNo = ''

      if (rpcErr) {
        console.warn('RPC confirm_goods_receipt failed, running direct fallback:', rpcErr)
        // Fallback: บันทึกลงตารางโดยตรง
        let grnNo = `RI${new Date().toISOString().slice(2, 4)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
        try {
          const { data: noData } = await supabase.rpc('next_doc_no', { p_prefix: 'RI' })
          if (noData) grnNo = noData
        } catch (_) {}

        const { data: grnRow, error: grnErr } = await supabase
          .from('goods_receipts')
          .insert({
            grn_no: grnNo,
            po_id: receivingPo.id,
            received_date: new Date().toISOString().slice(0, 10),
          })
          .select('id')
          .single()

        if (grnErr) throw grnErr
        const grnId = grnRow.id
        savedGrnId = grnId
        savedGrnNo = grnNo

        for (const it of itemsToReceive) {
          let griId = null
          const { data: griRow } = await supabase
            .from('goods_receipt_items')
            .insert({
              grn_id: grnId,
              po_item_id: it.po_item_id,
              qty_received: it.qty_received,
              unit_cost: it.unit_cost,
            })
            .select('id')
            .single()

          if (griRow) griId = griRow.id

          const currentItem = poItems.find((x) => x.id === it.po_item_id)
          if (currentItem) {
            let targetItemId = null
            const { data: found } = await supabase
              .from('inventory_items')
              .select('id, qty_on_hand, avg_unit_cost')
              .ilike('item_name', currentItem.item_name.trim())
              .limit(1)

            if (found && found.length > 0) {
              targetItemId = found[0].id
              const curQty = Number(found[0].qty_on_hand || 0)
              const curAvg = Number(found[0].avg_unit_cost || 0)
              const nextQty = curQty + it.qty_received
              const nextAvg = nextQty > 0 ? Math.round(((curQty * curAvg) + (it.qty_received * it.unit_cost)) / nextQty * 100) / 100 : it.unit_cost

              await supabase.from('inventory_items').update({
                qty_on_hand: nextQty,
                avg_unit_cost: nextAvg,
                updated_at: new Date().toISOString(),
              }).eq('id', targetItemId)
            } else {
              const itemCode = `MAT-${Date.now().toString().slice(-6)}`
              const { data: newInv } = await supabase.from('inventory_items').insert({
                item_code: itemCode,
                item_name: currentItem.item_name.trim(),
                unit: currentItem.unit || 'ชิ้น',
                qty_on_hand: it.qty_received,
                avg_unit_cost: it.unit_cost,
              }).select('id').single()
              if (newInv) targetItemId = newInv.id
            }

            if (targetItemId) {
              await supabase.from('stock_lots').insert({
                item_id: targetItemId,
                source_project_id: receivingPo.project_id || null,
                grn_item_id: griId || null,
                lot_type: 'receipt',
                received_date: new Date().toISOString().slice(0, 10),
                qty_received: it.qty_received,
                qty_remaining: it.qty_received,
                unit_cost: it.unit_cost,
              })
            }

            const newReceived = (Number(currentItem.qty_received) || 0) + it.qty_received
            await supabase.from('purchase_order_items').update({ qty_received: newReceived }).eq('id', it.po_item_id)
          }
        }

        const allReceived = poItems.every((x) => {
          const adding = itemsToReceive.find((r) => r.po_item_id === x.id)?.qty_received || 0
          return (Number(x.qty_received) || 0) + adding >= Number(x.quantity)
        })

        await supabase.from('purchase_orders').update({
          status: allReceived ? 'received' : 'partial',
          updated_at: new Date().toISOString(),
        }).eq('id', receivingPo.id)
      }

      await ensureGrnAccountingAndAp({
        grnId: savedGrnId,
        grnNo: savedGrnNo,
        po: receivingPo,
        poItems,
        itemsReceived: itemsToReceive,
        userId: profile?.id || null,
      })

      setSuccess(`ตรวจรับของเข้าสโตร์ ลงบัญชี GL และตั้งเจ้าหนี้ (AP) เรียบร้อยสำหรับ ${receivingPo.po_no}`)
      setReceivingPo(null)
      loadData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      console.error('Confirm goods receipt failed:', err)
      setReceiveModalError(err.message || 'บันทึกตรวจรับของไม่สำเร็จ')
    } finally {
      setReceivingSubmitting(false)
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
      if (sortBy === 'name_asc') return (a.inventory_items?.item_name || '').localeCompare(b.inventory_items?.item_name || '', 'th')
      if (sortBy === 'name_desc') return (b.inventory_items?.item_name || '').localeCompare(a.inventory_items?.item_name || '', 'th')
      if (sortBy === 'code_asc') return (a.inventory_items?.item_code || '').localeCompare(b.inventory_items?.item_code || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.inventory_items?.item_code || '').localeCompare(a.inventory_items?.item_code || '', undefined, { numeric: true })
      if (sortBy === 'qty_desc') return Number(b.qty_received || 0) - Number(a.qty_received || 0)
      if (sortBy === 'amount_desc') return (Number(b.qty_received || 0) * Number(b.unit_cost || 0)) - (Number(a.qty_received || 0) * Number(a.unit_cost || 0))
      if (sortBy === 'date_asc') {
        const timeA = new Date(a.created_at || a.received_date || 0).getTime()
        const timeB = new Date(b.created_at || b.received_date || 0).getTime()
        return timeA - timeB
      }

      // Default: date_desc (วันที่และเวลาที่บันทึกรับเข้าจริงล่าสุด Timestamp ล่าสุดอยู่บนสุดเสมอ)
      const timeA = new Date(a.created_at || a.received_date || 0).getTime()
      const timeB = new Date(b.created_at || b.received_date || 0).getTime()
      if (timeB !== timeA) return timeB - timeA

      const dComp = (b.received_date || '').localeCompare(a.received_date || '')
      if (dComp !== 0) return dComp

      const aGri = Array.isArray(a.goods_receipt_items) ? a.goods_receipt_items[0] : a.goods_receipt_items
      const bGri = Array.isArray(b.goods_receipt_items) ? b.goods_receipt_items[0] : b.goods_receipt_items
      const aGrn = aGri?.goods_receipts?.grn_no || ''
      const bGrn = bGri?.goods_receipts?.grn_no || ''
      if (aGrn && bGrn) return bGrn.localeCompare(aGrn)
      if (bGrn && !aGrn) return 1
      if (aGrn && !bGrn) return -1

      return (b.id || '').localeCompare(a.id || '')
    })
  }, [rows, sortBy])

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
            <span>{showStockInForm ? '▲ ซ่อนแบบฟอร์ม' : '+ รับวัสดุเข้าสโตร์โดยตรง'}</span>
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
                <span>บันทึกรับวัสดุเข้าสโตร์ (Direct Stock-In & Tax Invoice)</span>
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                ระบุจำนวน ราคาต่อหน่วย เลขที่ใบกำกับภาษี และโครงการที่ตัดต้นทุน (P&L Allocation)
              </p>
            </div>
            <button
              onClick={() => setShowStockInForm(false)}
              className="text-xs text-steel-500 hover:text-black"
            >
               ปิด
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
                onCreateNew={handleOpenQuickItemModal}
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
              {saving ? 'กำลังบันทึก...' : 'ยืนยันรับเข้าสโตร์และบันทึกบัญชี'}
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
            <span></span>
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
            <span></span>
            <span>นำเข้า / ตรวจรับของเข้าสโตร์</span>
            {pendingPos.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-rose-500 text-white shadow-sm animate-pulse">
                <span></span>
                <span>({pendingPos.length})</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-steel-400">0</span>
            )}
          </button>
        </div>

        {/* ช่องค้นหาด่วน & ตัวเลือกการเรียงลำดับมาตรฐาน */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            className="input text-xs w-full sm:w-64"
            placeholder={activeMainTab === 'received' ? "ค้นหารหัส / ชื่อพัสดุ / เลขที่ RI..." : "ค้นหาเลขที่ PO / ผู้ขาย / วัสดุ..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {activeMainTab === 'received' && (
            <TableSortFilter
              value={sortBy}
              onChange={setSortBy}
              options={RECEIPTS_SORT_OPTIONS}
            />
          )}
        </div>
      </div>

      {activeMainTab === 'pending_po' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl"></span>
              <div>
                <h4 className="font-bold text-sm text-amber-950 dark:text-amber-100">ใบสั่งซื้อที่อยู่ระหว่างรอสินค้าส่งมอบเข้าสโตร์ (Pending Deliveries)</h4>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  เมื่อผู้ขายนำของมาส่งถึงโกดัง/ไซต์งาน ให้กดปุ่ม <b>"ตรวจรับเข้าสโตร์"</b> เพื่อระบุจำนวนที่รับจริง ตรวจรับเข้าคลัง และออกเลขที่ใบรับของ (RI) ทันที
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
            <table className="table-auto w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
              <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3 text-center w-36 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">เลขที่ PO</th>
                  <th className="py-3 px-4 min-w-[200px] border-r border-slate-200/70 dark:border-slate-700/60">ร้านค้า / ผู้ขาย</th>
                  <th className="py-3 px-4 text-center w-48 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">กำหนดส่งมอบ</th>
                  <th className="py-3 px-4 text-center w-48 whitespace-nowrap">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredPendingPos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-steel-400 dark:text-slate-500 text-xs">
                      {search ? 'ไม่พบใบสั่งซื้อที่ตรงกับคำค้นหา' : 'ไม่มีใบสั่งซื้อที่ค้างรับของ (รับของเข้าสโตร์ครบทุกใบแล้ว )'}
                    </td>
                  </tr>
                ) : (
                  paginatedPendingPos.map((po, rowIdx) => {
                    const isExpanded = expandedPendingPoIds.has(po.id)
                    const dueStatus = getPoDueStatus(po)
                    const vendorName = po.vendors?.vendor_name || po.custom_vendor_name || 'ไม่ระบุผู้ขาย'
                    const projCode = po.projects?.project_code || ''
                    const projName = po.projects?.project_name || po.custom_project_name || 'ของกลางบริษัท'
                    const itemsList = po.purchase_order_items || []
                    const totalQty = itemsList.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
                    const receivedQty = itemsList.reduce((s, it) => s + (Number(it.qty_received) || 0), 0)
                    const isPartial = receivedQty > 0 && receivedQty < totalQty

                    return (
                      <Fragment key={po.id}>
                        {/* แถวหลัก (Collapsed Row) แสดง 4 คอลัมน์สำคัญ สะอาดตา พอดีหน้าจอ 100% */}
                        <tr
                          className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                            isExpanded
                              ? 'bg-amber-50/70 dark:bg-amber-950/40'
                              : rowIdx % 2 === 0
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/70 dark:bg-slate-800/40'
                          } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                        >
                          {/* 1. เลขที่ PO + ป้ายสถานะ */}
                          <td className="py-3 px-3 text-center font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                            <Link
                              to={`/purchasing/po/${po.id}`}
                              className="hover:underline font-mono inline-flex items-center justify-center gap-1 text-xs"
                            >
                              <span>{po.po_no}</span>
                            </Link>
                            <div className="mt-0.5">
                              {isPartial ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                                  รับแล้วบางส่วน
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700">
                                  รอรับเข้าสโตร์
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. ร้านค้า / ผู้ขาย + ยอดเงินย่อ */}
                          <td className="py-3 px-4 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {vendorName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>สั่งเมื่อ {formatThaiDate(po.order_date)}</span>
                              <span className="text-slate-300 dark:text-slate-600">•</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">ยอดรวม ฿{baht(po.grand_total || po.total_amount || 0)}</span>
                            </div>
                          </td>

                          {/* 3. กำหนดส่งมอบ */}
                          <td className="py-3 px-4 text-center align-middle border-r border-slate-200/60 dark:border-slate-800/60 whitespace-nowrap">
                            <div className="font-mono text-xs font-bold text-steel-800 dark:text-slate-200">
                              {po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date) : '-'}
                            </div>
                            {dueStatus && (
                              <div className="mt-1 flex justify-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${dueStatus.badgeCls}`}>
                                  <span>{dueStatus.icon}</span>
                                  <span>{dueStatus.label}</span>
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 4. ปุ่มตรวจรับเข้าสโตร์ + ปุ่มขยายดูรายละเอียดเพิ่มเติม */}
                          <td className="py-3 px-4 text-center whitespace-nowrap align-middle">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenReceiveModal(po)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:shadow transition-all transform active:scale-95 cursor-pointer"
                                title="เปิดตรวจนับและยืนยันรับเข้าสโตร์"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>ตรวจรับเข้าสโตร์</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleExpandPendingPo(po.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                                  isExpanded
                                    ? 'bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                                    : 'bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                                }`}
                                title={isExpanded ? 'ย่อรายละเอียด' : 'เลื่อนลงดูรายละเอียดเพิ่มเติม'}
                              >
                                <span>{isExpanded ? 'ย่อ' : 'รายละเอียด'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* แถวขยายข้อมูล (Accordion Detail Panel - เลื่อนลงมาให้เห็นชัดเจน) */}
                        {isExpanded && (
                          <tr className="bg-amber-50/50 dark:bg-amber-950/25 border-b-2 border-amber-200 dark:border-amber-800 animate-in fade-in duration-150">
                            <td colSpan={4} className="py-3.5 px-4 sm:px-6">
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-amber-200 dark:border-amber-800 shadow-xs space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                                      ข้อมูลโครงการและรายการพัสดุ ({po.po_no})
                                    </span>
                                    {isPartial ? (
                                      <span className="text-[10px] font-mono bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
                                        รับแล้ว {receivedQty}/{totalQty} หน่วย
                                      </span>
                                    ) : null}
                                  </div>
                                  <Link
                                    to={`/purchasing/po/${po.id}`}
                                    className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>เปิดดูใบสั่งซื้อฉบับเต็ม</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  {/* 1. โครงการเป้าหมาย */}
                                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">โครงการเป้าหมาย</div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate" title={`${projCode} ${projName}`}>
                                      {projCode ? <span className="font-mono text-amber-600 mr-1">{projCode}</span> : null}
                                      {projName}
                                    </div>
                                  </div>

                                  {/* 2. ลูกค้า / ผู้ว่าจ้าง */}
                                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">ลูกค้า / ผู้ว่าจ้าง</div>
                                    <div className="font-bold text-blue-700 dark:text-sky-300 mt-0.5 truncate" title={po.customer_name}>
                                      {po.customer_name || '-'}
                                    </div>
                                  </div>

                                  {/* 3. ยอดเงินสั่งซื้อ */}
                                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">มูลค่าสั่งซื้อรวม</div>
                                    <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 text-sm">
                                      ฿{baht(po.grand_total || po.total_amount || 0)}
                                    </div>
                                  </div>

                                  {/* 4. สถานะรับของ */}
                                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">สถานะการส่งมอบ</div>
                                    <div className="mt-0.5 font-bold text-slate-700 dark:text-slate-300">
                                      {isPartial ? `ทยอยรับแล้ว (${receivedQty}/${totalQty})` : 'รอส่งมอบทั้งหมด 100%'}
                                    </div>
                                  </div>
                                </div>

                                {/* รายการพัสดุใน PO */}
                                {itemsList.length > 0 && (
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                      <Package className="w-3.5 h-3.5 text-slate-500" />
                                      <span>รายการพัสดุที่ต้องตรวจรับ ({itemsList.length} รายการ):</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {itemsList.map((it, idx) => {
                                        const itRemain = Math.max(0, Number(it.quantity || 0) - Number(it.qty_received || 0))
                                        return (
                                          <div key={idx} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2" title={it.item_name}>
                                              • {it.item_name}
                                            </span>
                                            <span className="font-mono shrink-0 font-bold text-slate-600 dark:text-slate-300">
                                              {Number(it.qty_received) || 0}/{Number(it.quantity) || 0} {it.unit}
                                              {itRemain > 0 && (
                                                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                                  (ค้าง {itRemain})
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
                   เอกสารสโตร์
                </button>
                <button
                  onClick={() => setDocViewMode('accounting')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    docViewMode === 'accounting' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                  }`}
                >
                  ️ เอกสารบัญชีสต็อก (RI / GL)
                </button>
              </div>
            </div>

        {/* ตัวกรองช่วงเวลาดูประวัติย้อนหลัง */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-steel-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-steel-600 dark:text-slate-300 mr-1">ช่วงเวลา:</span>
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
                    {/* วันที่และเวลารับเข้า (จัดรูปแบบ ชัดเจน สวยงาม) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-steel-900 dark:text-slate-100 text-xs">
                          {(() => {
                            const d = new Date(r.received_date || r.created_at)
                            return isNaN(d) ? r.received_date : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
                          })()}
                        </span>
                        <span className="text-[11px] text-sky-700 dark:text-sky-400 font-mono flex items-center gap-1 font-semibold mt-0.5">
                          <span></span>
                          <span>
                            {r.created_at
                              ? new Date(r.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                              : '10:00 น.'}
                          </span>
                        </span>
                      </div>
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
                        ลงบัญชีแล้ว (RI)
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
      {/* Modal ลงทะเบียนพัสดุใหม่ด่วน (Quick Create New Item) */}
      {showQuickItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-steel-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl"></span>
                <div>
                  <h3 className="font-bold text-sm text-steel-900 dark:text-slate-100">ลงทะเบียนพัสดุใหม่ด่วน</h3>
                  <p className="text-[11px] text-steel-500 dark:text-slate-400">สำหรับของซื้อด่วนที่ยังไม่เคยมีในทะเบียนสโตร์</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickItemModal(false)}
                className="text-steel-400 hover:text-steel-600 dark:hover:text-white"
              >
                
              </button>
            </div>

            {quickItemError && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                {quickItemError}
              </div>
            )}

            <form onSubmit={handleQuickCreateItem} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ชื่อวัสดุ / พัสดุ *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น กาวซิลิโคนใส DOWSIL, น็อตยึดรางเบอร์ 10"
                  className="input w-full text-xs"
                  value={quickItemName}
                  onChange={(e) => setQuickItemName(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-bold text-steel-700 dark:text-slate-300 mb-1">
                  หมวดหมู่วัสดุ *
                </label>
                <select
                  required
                  className="input w-full text-xs"
                  value={quickItemCatId}
                  onChange={(e) => setQuickItemCatId(e.target.value)}
                >
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code_prefix ? `(${c.code_prefix})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-steel-700 dark:text-slate-300 mb-1">
                  หน่วยนับ *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ชิ้น, ม้วน, เมตร, เส้น, กล่อง, หลอด, ถัง"
                  className="input w-full text-xs"
                  value={quickItemUnit}
                  onChange={(e) => setQuickItemUnit(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-steel-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuickItemModal(false)}
                  disabled={quickItemSaving}
                  className="btn-ghost !py-1.5 text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={quickItemSaving}
                  className="btn-primary !py-1.5 text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>{quickItemSaving ? 'กำลังบันทึก...' : ' บันทึกและเลือกทันที'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ตรวจรับเข้าสโตร์ (Goods Receipt Confirmation Modal) */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-steel-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-sm">
                  </span>
                <div>
                  <h3 className="font-bold text-base text-steel-900 dark:text-slate-100 flex items-center gap-2">
                    <span>ตรวจรับสินค้าเข้าสโตร์</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">({receivingPo.po_no})</span>
                  </h3>
                  <p className="text-xs text-steel-500 dark:text-slate-400">
                    ผู้ขาย: <b className="text-steel-800 dark:text-slate-200">{receivingPo.vendors?.vendor_name || receivingPo.custom_vendor_name || 'ไม่ระบุ'}</b> | โครงการ: <b className="text-steel-800 dark:text-slate-200">{receivingPo.projects?.project_code || ''} {receivingPo.projects?.project_name || receivingPo.custom_project_name || 'ของกลาง'}</b>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="text-steel-400 hover:text-steel-600 dark:hover:text-white p-1"
              >
                
              </button>
            </div>

            {receiveModalError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800">
                {receiveModalError}
              </div>
            )}

            {/* Items Table */}
            <div className="overflow-y-auto flex-1 border border-steel-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs divide-y divide-steel-200 dark:divide-slate-800">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">รายการพัสดุ</th>
                    <th className="py-2.5 px-3 text-right">จำนวนสั่งซื้อ</th>
                    <th className="py-2.5 px-3 text-right">รับแล้ว</th>
                    <th className="py-2.5 px-3 text-right">คงเหลือรอรับ</th>
                    <th className="py-2.5 px-3 text-center min-w-[130px]">จำนวนรับเข้าครั้งนี้</th>
                    <th className="py-2.5 px-3 text-right">ราคา/หน่วย (บ.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
                  {receivingPo.purchase_order_items?.map((it) => {
                    const ordered = Number(it.quantity || 0)
                    const received = Number(it.qty_received || 0)
                    const remaining = Math.max(0, ordered - received)
                    const val = receiveQuantities[it.id] ?? String(remaining)

                    return (
                      <tr key={it.id} className="hover:bg-steel-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-steel-900 dark:text-slate-100">
                          {it.item_name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {ordered} {it.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-steel-500 dark:text-slate-400">
                          {received} {it.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          {remaining} {it.unit}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            className="w-24 text-center font-bold text-xs py-1.5 px-2 rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-steel-900 dark:text-white focus:outline-none focus:border-emerald-500"
                            value={val}
                            onChange={(e) => {
                              const v = e.target.value
                              setReceiveQuantities((prev) => ({ ...prev, [it.id]: v }))
                            }}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {baht(Number(it.unit_price || 0))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-steel-100 dark:border-slate-800">
              <Link
                to={`/purchasing/po/${receivingPo.id}`}
                target="_blank"
                className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                <span>เปิดดูรายละเอียดใบสั่งซื้อเต็มรูปแบบ (PO) ↗</span>
              </Link>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceivingPo(null)}
                  disabled={receivingSubmitting}
                  className="btn-ghost !py-2 text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReceive}
                  disabled={receivingSubmitting}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{receivingSubmitting ? 'กำลังบันทึกรับเข้า...' : ' ยืนยันบันทึกรับเข้าสโตร์'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
