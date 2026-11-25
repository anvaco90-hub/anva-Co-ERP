import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PO_STATUS, canCreatePurchasing, canReceiveGoods, computePoPaymentSummary } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { computePoTotals } from '../../lib/tax'
import { buildReceivePayloadItems } from '../../lib/goodsReceiptUtils'
import { ensureGrnAccountingAndAp } from '../../lib/goodsReceiptAccounting'
import StatusBadge from '../../components/common/StatusBadge'
import AuditPanel from './AuditPanel'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import PODocumentModal from '../../components/reports/PODocumentModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import POShareModal from '../../components/purchasing/POShareModal'
import PaymentActionModal from '../../components/PaymentActionModal'
import ProcurementWorkflowStepper from '../../components/purchasing/ProcurementWorkflowStepper'
import { PAYMENT_TYPES } from './POForm'
import { getPoDueStatus, formatThaiDate } from '../../lib/poDueStatus'
import {
  Sun,
  Zap,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Truck,
  MapPin,
  Phone,
  Building,
  CreditCard,
  Grid,
  List,
  FileText,
  Package,
  PackageCheck,
  ArrowLeft,
  ExternalLink,
  Layers,
  Sparkles,
  Upload,
  Eye,
  Printer,
  X,
  MoreVertical,
  Edit3,
  Copy,
  Mail,
  Share2,
  ShoppingCart,
  Trash2,
  Calendar,
  FolderGit2,
  Store,
  History,
  Workflow,
  Coins,
  AlertTriangle,
} from 'lucide-react'
import { uploadQuotationFile, openFile } from '../../lib/files'
import R2Image from '../../components/R2Image'

// ฟังก์ชันระบุหมวดหมู่วัสดุและสีสันสไตล์ไทวัสดุ & วิศวกรรมโซลาร์เซลล์
function getMaterialCategory(itemName = '') {
  const name = itemName.toLowerCase()
  if (name.includes('แผง') || name.includes('solar') || name.includes('โซลาร์') || name.includes('pv')) {
    return { label: '️ โซลาร์เซลล์ & พลังงานแสงอาทิตย์', color: 'bg-amber-100 text-amber-900 border-amber-300', icon: '️' }
  }
  if (name.includes('inverter') || name.includes('อินเวอร์เตอร์') || name.includes('แบต') || name.includes('สายไฟ') || name.includes('เบรกเกอร์') || name.includes('ตู้')) {
    return { label: 'ระบบไฟฟ้า & อินเวอร์เตอร์', color: 'bg-sky-100 text-sky-900 border-sky-300', icon: '' }
  }
  if (name.includes('กล่อง') || name.includes('เครื่องมือ') || name.includes('สว่าน') || name.includes('ประแจ') || name.includes('คีม') || name.includes('deli') || name.includes('bosch')) {
    return { label: ' เครื่องมือช่าง & อุปกรณ์ติดตั้ง', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: '' }
  }
  if (name.includes('เหล็ก') || name.includes('ปูน') || name.includes('ท่อ') || name.includes('ราง') || name.includes('mounting')) {
    return { label: 'โครงสร้าง Mounting & ฮาร์ดแวร์', color: 'bg-purple-100 text-purple-900 border-purple-300', icon: '' }
  }
  return { label: 'พัสดุและวัสดุงานวิศวกรรม', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: '' }
}

export function thaiBahtText(num) {
  if (num === null || num === undefined || isNaN(num)) return '-'
  const number = Math.round(Number(num) * 100) / 100
  if (number === 0) return 'ศูนย์บาทถ้วน'

  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  const convertGroup = (nStr) => {
    let res = ''
    const len = nStr.length
    for (let i = 0; i < len; i++) {
      const d = parseInt(nStr[i], 10)
      const pos = len - i - 1
      if (d !== 0) {
        if (pos === 1 && d === 1) res += 'สิบ'
        else if (pos === 1 && d === 2) res += 'ยี่สิบ'
        else if (pos === 0 && d === 1 && len > 1 && parseInt(nStr[len - 2], 10) !== 0) res += 'เอ็ด'
        else res += digits[d] + positions[pos % 6]
      }
    }
    return res
  }

  const [intPart, decPart = '00'] = number.toFixed(2).split('.')
  let text = ''
  if (parseInt(intPart, 10) > 0) text = convertGroup(intPart) + 'บาท'
  const satang = parseInt(decPart, 10)
  if (satang === 0) text += 'ถ้วน'
  else text += convertGroup(decPart) + 'สตางค์'
  return text
}

export default function PODetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const receiveSectionRef = useRef(null)
  const tabsSectionRef = useRef(null)

  const [po, setPo] = useState(null)
  const [items, setItems] = useState([])
  const [grns, setGrns] = useState([])
  const [pr, setPr] = useState(null)
  const [payments, setPayments] = useState([])
  const [qty, setQty] = useState({})
  const [selectedUsageItem, setSelectedUsageItem] = useState(null)
  const [showPoPdf, setShowPoPdf] = useState(false)
  const [showEnvelope, setShowEnvelope] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [uploadingQuotation, setUploadingQuotation] = useState(false)
  const [previewQuotationModal, setPreviewQuotationModal] = useState(null)
  const [showMoreActions, setShowMoreActions] = useState(false)

  const handleDirectQuotationUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !po?.id) return
    setUploadingQuotation(true)
    try {
      const upUrl = await uploadQuotationFile(file)
      if (upUrl) {
        await supabase.from('purchase_orders').update({ quotation_url: upUrl }).eq('id', po.id)
        setPo((prev) => ({ ...prev, quotation_url: upUrl }))
      }
    } catch (err) {
      console.warn('Failed to upload quotation in detail:', err)
    } finally {
      setUploadingQuotation(false)
    }
  }

  // ค่าเริ่มต้นเป็น 'portal' เพื่อแสดง Executive Header + ผัง Workflow 5 ขั้นตอนทันที
  const [viewStyle, setViewStyle] = useState(() => (searchParams.get('mode') === 'paper' ? 'paper' : 'portal'))
  const [itemsLayout, setItemsLayout] = useState('table') // 'table' | 'cards'
  const [activeTab, setActiveTab] = useState('items') // 'items' | 'receiving' | 'payments' | 'lifecycle' | 'audit'

  const scrollToReceive = () => {
    if (viewStyle !== 'portal') setViewStyle('portal')
    setTimeout(() => {
      receiveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
  }

  const jumpToTab = (tabKey) => {
    if (viewStyle !== 'portal') setViewStyle('portal')
    setActiveTab(tabKey)
    setTimeout(() => {
      tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        supabase.from('purchase_orders')
          .select('*, vendors(id, vendor_code, vendor_name, tax_id, contact_person, phone, address), projects(id, project_code, project_name)')
          .eq('id', id).single(),
        supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
        supabase.from('goods_receipts').select('id, grn_no, received_date').eq('po_id', id).order('received_date', { ascending: false }),
      ])

      if (a.error) {
        console.warn('Load purchase_orders warning:', a.error)
        // Fallback: ดึงเฉพาะข้อมูลหลักของ purchase_orders หาก foreign table ติดปัญหา
        const fbRes = await supabase.from('purchase_orders').select('*').eq('id', id).single()
        if (fbRes.error) return setError('ไม่พบใบสั่งซื้อ')
        setPo(fbRes.data)
      } else {
        setPo(a.data)
      }
      const poData = a.data || (await supabase.from('purchase_orders').select('*').eq('id', id).single()).data

      if (poData?.pr_id) {
        const { data: prRow } = await supabase
          .from('purchase_requisitions')
          .select('*')
          .eq('id', poData.pr_id)
          .single()
        setPr(prRow || null)
      } else {
        setPr(null)
      }

      try {
        const { data: txList, error: txErr } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('document_id', id)
          .order('payment_date', { ascending: false })
        if (!txErr && txList) {
          setPayments(txList)
        } else {
          setPayments([])
        }
      } catch (ptErr) {
        console.warn('Cannot load payment_transactions:', ptErr)
        setPayments([])
      }

      const rawItems = b.data ?? []
      const computedItems = rawItems.map((it) => {
        let unitPrice = Number(it.unit_price ?? it.price ?? 0)
        const qtyVal = Number(it.quantity) || 1
        if (unitPrice === 0 && Number(poData?.total_amount) > 0 && rawItems.length === 1) {
          unitPrice = Math.round((Number(poData.total_amount) / qtyVal) * 100) / 100
        }
        const lineTotal = Number(it.total_amount) || (qtyVal * unitPrice)

        if (Number(it.unit_price) === 0 && unitPrice > 0) {
          supabase.from('purchase_order_items').update({ unit_price: unitPrice, total_amount: lineTotal }).eq('id', it.id).then(() => { })
        }

        return {
          ...it,
          unit_price: unitPrice,
          total_amount: lineTotal,
        }
      })

      setItems(computedItems)
      setGrns(c.data ?? [])
      setQty(Object.fromEntries(computedItems.map((i) => [i.id, String(Math.max(0, Number(i.quantity) - Number(i.qty_received)))])))
    } catch (err) {
      console.error('Error loading PO details:', err)
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลใบสั่งซื้อ')
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // ไม่แก้ค่าภาษีใน DB อัตโนมัติขณะเปิดอ่าน — ให้ computePoTotals คำนวณจาก po และ items โดยตรง
  // (ป้องกันบั๊กเดิมที่เปลี่ยน vat_included เป็น vat_excluded แล้วบวก VAT ซ้ำ 2 รอบ)

  async function receive() {
    if (isFullyReceived) {
      alert('ใบสั่งซื้อนี้ตรวจรับสินค้าครบถ้วน 100% แล้ว ไม่สามารถรับเพิ่มได้')
      return
    }
    if (!confirm('ยืนยันรับของเข้าสโตร์หลัก? ระบบจะอัปเดตสต็อกและลงบัญชีอัตโนมัติ')) return
    setBusy(true); setError(''); setDone('')

    const receiveItems = buildReceivePayloadItems({
      po,
      poItems: items,
      receiveQtyMap: qty,
    })

    if (receiveItems.length === 0) {
      setBusy(false)
      setError('กรุณาระบุจำนวนที่ต้องการรับของอย่างน้อย 1 รายการ')
      return
    }

    const syncItemToStore = async (it, grnItemId) => {
      const currentItem = items.find((x) => x.id === it.po_item_id)
      if (!currentItem) return

      let targetItemId = currentItem.item_id || null

      if (!targetItemId) {
        const { data: foundItems } = await supabase
          .from('inventory_items')
          .select('id, qty_on_hand, avg_unit_cost')
          .ilike('item_name', currentItem.item_name.trim())
          .limit(1)

        if (foundItems && foundItems.length > 0) {
          targetItemId = foundItems[0].id
        }
      }

      let itemRow = null
      if (targetItemId) {
        const { data: existing } = await supabase
          .from('inventory_items')
          .select('id, qty_on_hand, avg_unit_cost')
          .eq('id', targetItemId)
          .single()
        itemRow = existing
      } else {
        const itemCode = `MAT-${Date.now().toString().slice(-6)}`
        const { data: newInv, error: newInvErr } = await supabase
          .from('inventory_items')
          .insert({
            item_code: itemCode,
            item_name: currentItem.item_name.trim(),
            unit: currentItem.unit || 'หน่วย',
            qty_on_hand: 0,
            avg_unit_cost: it.unit_cost,
          })
          .select('id, qty_on_hand, avg_unit_cost')
          .single()

        if (!newInvErr && newInv) {
          targetItemId = newInv.id
          itemRow = newInv
        }
      }

      if (targetItemId) {
        const itemPatch = { item_id: targetItemId }
        if (!(Number(currentItem.unit_price) > 0) && it.unit_cost > 0) {
          itemPatch.unit_price = it.unit_cost
        }
        await supabase
          .from('purchase_order_items')
          .update(itemPatch)
          .eq('id', it.po_item_id)

        await supabase.from('stock_lots').insert({
          item_id: targetItemId,
          source_project_id: po.project_id || null,
          grn_item_id: grnItemId || null,
          lot_type: 'receipt',
          received_date: new Date().toISOString().slice(0, 10),
          qty_received: it.qty_received,
          qty_remaining: it.qty_received,
          unit_cost: it.unit_cost,
        })

        const curQty = Number(itemRow?.qty_on_hand || 0)
        const curAvg = Number(itemRow?.avg_unit_cost || 0)
        const nextQty = curQty + it.qty_received
        const nextAvg =
          nextQty > 0
            ? Math.round(((curQty * curAvg) + (it.qty_received * it.unit_cost)) / nextQty * 100) / 100
            : it.unit_cost

        await supabase
          .from('inventory_items')
          .update({
            qty_on_hand: nextQty,
            avg_unit_cost: nextAvg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetItemId)
      }
    }

    try {
      const { data: rpcGrnId, error: rpcErr } = await supabase.rpc('confirm_goods_receipt', {
        p_po_id: id,
        p_items: receiveItems,
      })
      if (rpcErr) throw rpcErr

      // หมายเหตุ: ไม่ต้องเรียก syncItemToStore ซ้ำที่นี่
      // เพราะฟังก์ชัน confirm_goods_receipt ในฐานข้อมูลจัดการทั้ง stock_lots และ inventory_items แล้ว
      // เรียก ensureGrnAccountingAndAp เพื่อรับประกันว่า GL, ภาษีซื้อ (INPUT_VAT) และเจ้าหนี้ (AP) ครบถ้วนแม้ยังไม่ได้รัน Migration 042
      await ensureGrnAccountingAndAp({
        grnId: rpcGrnId || null,
        po,
        poItems: items,
        itemsReceived: receiveItems,
        userId: profile?.id || null,
      })

      setDone('บันทึกรับของเข้าสโตร์ ลงบัญชี GL และตั้งเจ้าหนี้ (AP) เรียบร้อยแล้ว')
      load()
    } catch (rpcErr) {
      console.warn('RPC confirm_goods_receipt failed, running full direct synchronization:', rpcErr)
      try {
        let grnNo = `RI${new Date().toISOString().slice(2, 4)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
        try {
          const { data: noData } = await supabase.rpc('next_doc_no', { p_prefix: 'RI' })
          if (noData) grnNo = noData
        } catch (_) { }

        const { data: grnRow, error: grnErr } = await supabase
          .from('goods_receipts')
          .insert({
            grn_no: grnNo,
            po_id: id,
            received_date: new Date().toISOString().slice(0, 10),
            received_by: profile?.id || null,
          })
          .select('id')
          .single()

        if (grnErr) throw grnErr
        const grnId = grnRow.id

        for (const it of receiveItems) {
          let griId = null
          const { data: griRow, error: itErr } = await supabase
            .from('goods_receipt_items')
            .insert({
              grn_id: grnId,
              po_item_id: it.po_item_id,
              qty_received: it.qty_received,
              unit_cost: it.unit_cost,
            })
            .select('id')
            .single()

          if (!itErr && griRow) {
            griId = griRow.id
          } else {
            const { data: fallbackGri } = await supabase
              .from('goods_receipt_items')
              .insert({
                grn_id: grnId,
                po_item_id: it.po_item_id,
                qty_received: it.qty_received,
              })
              .select('id')
              .single()
            if (fallbackGri) griId = fallbackGri.id
          }

          await syncItemToStore(it, griId)

          const currentItem = items.find((x) => x.id === it.po_item_id)
          const newReceived = (Number(currentItem?.qty_received) || 0) + it.qty_received
          await supabase.from('purchase_order_items').update({ qty_received: newReceived }).eq('id', it.po_item_id)
        }

        const allReceived = items.every((x) => {
          const adding = receiveItems.find((r) => r.po_item_id === x.id)?.qty_received || 0
          return (Number(x.qty_received) || 0) + adding >= Number(x.quantity)
        })

        await supabase.from('purchase_orders').update({
          status: allReceived ? 'received' : 'partial',
          updated_at: new Date().toISOString(),
        }).eq('id', id)

        await ensureGrnAccountingAndAp({
          grnId,
          grnNo,
          po,
          poItems: items,
          itemsReceived: receiveItems,
          userId: profile?.id || null,
        })

        setDone('บันทึกรับของเข้าสโตร์ ลงบัญชี GL และตั้งเจ้าหนี้ (AP) เรียบร้อยแล้ว')
        load()
      } catch (directErr) {
        console.error('Direct fallback failed:', directErr)
        setError(rpcErr.message || directErr.message || 'บันทึกรับของไม่สำเร็จ')
      }
    } finally {
      setBusy(false)
    }
  }

  function cancelPo() {
    setCancelReason('')
    setShowCancelModal(true)
  }

  async function handleConfirmCancelPo() {
    if (!cancelReason || !cancelReason.trim()) {
      alert('กรุณาระบุเหตุผลในการยกเลิกใบสั่งซื้อ')
      return
    }
    setCancelling(true)
    setError('')
    try {
      // 1. Try RPC
      const { error: rpcErr } = await supabase.rpc('cancel_purchase_order', {
        p_po_id: id,
        p_reason: cancelReason.trim(),
      })

      if (rpcErr) {
        console.warn('cancel_purchase_order RPC failed, running direct fallback:', rpcErr)
        // 2. Direct Fallback
        const remarksWithReason = [po.remarks, `[ยกเลิกเมื่อ ${new Date().toLocaleString('th-TH')}]: ${cancelReason.trim()}`].filter(Boolean).join(' | ')
        const { error: updErr } = await supabase.from('purchase_orders').update({
          status: 'cancelled',
          remarks: remarksWithReason,
          updated_at: new Date().toISOString(),
        }).eq('id', id)

        if (updErr) throw updErr

        // Release linked PR if any
        if (po.pr_id) {
          await supabase.from('purchase_requisitions').update({
            status: 'approved',
            updated_at: new Date().toISOString(),
          }).eq('id', po.pr_id)
        }
      }

      setDone('ยกเลิกใบสั่งซื้อเรียบร้อยแล้ว (สถานะเปลี่ยนเป็นยกเลิก และปลดล็อค PR ให้ใช้งานได้ต่อ)')
      setShowCancelModal(false)
      load()
    } catch (err) {
      console.error('Cancel PO failed:', err)
      setError(err.message || 'ยกเลิกใบสั่งซื้อไม่สำเร็จ')
    } finally {
      setCancelling(false)
    }
  }

  async function removePo() {
    if (!confirm('ลบใบสั่งซื้อนี้? (ประวัติการลบจะถูกเก็บไว้)')) return
    const { error } = await supabase.rpc('delete_purchase_order', { p_po_id: id, p_reason: null })
    if (error) return setError(error.message)
    navigate('/purchasing?tab=po')
  }

  if (!po) return <p className={error ? 'p-6 text-red-600' : 'p-6 text-slate-500'}>{error || 'กำลังโหลดข้อมูล...'}</p>

  const poTotals = computePoTotals(po, items)
  const isVatIncluded = poTotals.isVatIncluded
  const subtotalBeforeVat = poTotals.amountBeforeVat
  const vatVal = poTotals.vatAmount
  const whtVal = poTotals.whtAmount
  const grandTotalVal = poTotals.netPayable

  const paySummary = computePoPaymentSummary(po, items, payments)
  const isPaidInFull = paySummary.isPaidInFull
  const isFullyReceived = po.status === 'received' || (items.length > 0 && items.every((i) => Number(i.qty_received) >= Number(i.quantity)))
  const canEdit = canCreatePurchasing(profile.role) && !isPaidInFull && po.status !== 'cancelled' && po.status !== 'received'
  const canReceive = canReceiveGoods(profile.role) && ['open', 'partial'].includes(po.status) && !isFullyReceived
  const anyQty = items.some((i) => Number(qty[i.id]) > 0)

  const dueStatus = getPoDueStatus(po)

  const vendorDisplayName = po.custom_vendor_name || po.vendors?.vendor_name || 'ผู้ขายหน้าร้าน'
  const projectDisplayName = po.custom_project_name || (po.projects ? `[${po.projects.project_code}] ${po.projects.project_name}` : 'ของกลางบริษัท / คลังพัสดุ')

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] pb-20 pt-2 font-sans space-y-5">
      <div className="max-w-6xl mx-auto px-4 space-y-5">

        {/* 0. แถบนำทางด้านบนและปุ่มสลับมุมมอง (Breadcrumb & View Mode Switcher) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/purchasing?tab=po"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition"
            title="กลับไปรายการใบสั่งซื้อ"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับรายการใบสั่งซื้อ (PO)</span>
          </Link>

          <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300/70 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setViewStyle('portal')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewStyle === 'portal'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              มุมมองระบบ & Workflow
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('paper')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewStyle === 'paper'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              แบบฟอร์ม A4
            </button>
          </div>
        </div>

        {/* 1. แบนเนอร์หัวเอกสารระดับบริหาร (#0f172a สไตล์เดียวกับ QuotationDetail & BOQDetail) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-white shadow-sm space-y-4">
          {/* ชั้นที่ 1: หัวเรื่อง รหัส ป้ายสถานะ (ซ้าย) และ ปุ่มจัดการ (ขวา) */}
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 shrink-0 mt-0.5">
                <ShoppingCart className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-1.5">
                {/* แถบป้ายกำกับ (Badge Row) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/25 font-bold whitespace-nowrap">
                    PURCHASE ORDER
                  </span>
                  <StatusBadge status={po.status} />

                  {isPaidInFull ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>ชำระครบแล้ว</span>
                    </span>
                  ) : paySummary.hasPartialPaid && po.status !== 'cancelled' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 whitespace-nowrap">
                      <Clock className="h-3 w-3" />
                      <span>จ่ายบางส่วน (฿{baht(paySummary.paidAmount)}) · ค้าง ฿{baht(paySummary.remainingAmount)}</span>
                    </span>
                  ) : po.status !== 'cancelled' && isFullyReceived ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 whitespace-nowrap">
                      <Clock className="h-3 w-3" />
                      <span>รับครบ · รอจ่ายเงิน</span>
                    </span>
                  ) : null}

                  {pr && (
                    <Link
                      to={`/purchasing/pr/${pr.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 hover:underline whitespace-nowrap"
                      title="คลิกเปิดดูใบขอซื้อต้นทาง"
                    >
                      <FileText className="h-3 w-3" />
                      <span>PR: {pr.pr_no}</span>
                    </Link>
                  )}

                  {dueStatus && po.status !== 'cancelled' && po.status !== 'received' && (
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border whitespace-nowrap ${dueStatus.badgeCls}`}>
                      {dueStatus.label}
                    </span>
                  )}
                </div>

                {/* เลขที่ PO & ยอดรวม */}
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="text-2xl font-black tracking-tight text-white font-mono whitespace-nowrap">
                    {po.po_no}
                  </h1>
                  <span className="font-mono text-sm font-bold text-amber-300">
                    ฿{baht(grandTotalVal)} บาท
                  </span>
                </div>

                <p className="text-xs text-slate-400 truncate">
                  ผู้ขาย / ร้านค้า: <strong className="text-slate-200">{vendorDisplayName}</strong> · {items.length} รายการพัสดุ ({thaiBahtText(grandTotalVal)})
                </p>
              </div>
            </div>

            {/* แถบปุ่ม Action ด้านขวา (สัดส่วนคงที่ h-9 - Option A: แก้ไขข้างนอก ลบใน ⋮) */}
            <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">
              {canReceive && (
                <button
                  type="button"
                  onClick={scrollToReceive}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>ตรวจรับของ (ออก RI)</span>
                </button>
              )}

              {!isPaidInFull && po.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 h-9 px-3.5 text-xs font-black shadow-xs transition cursor-pointer"
                  title={`คลิกเพื่อจ่ายชำระเงิน (ค้างจ่าย ฿${baht(paySummary.remainingAmount)} บ.)`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{paySummary.hasPartialPaid ? `จ่ายงวดถัดไป (฿${baht(paySummary.remainingAmount)})` : 'จ่ายชำระเงิน'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPoPdf(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
                title="พิมพ์ใบสั่งซื้อ (PO) ขนาด A4 หรือบันทึก PDF"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>พิมพ์ใบสั่งซื้อ (PDF)</span>
              </button>

              {canEdit && (
                <Link
                  to={`/purchasing/po/${po.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>แก้ไข</span>
                </Link>
              )}

              {/* เมนูเพิ่มเติม [ ⋮ ] */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreActions(!showMoreActions)}
                  className={`inline-flex items-center justify-center rounded-xl border h-9 w-9 text-xs transition cursor-pointer shadow-xs ${
                    showMoreActions
                      ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                      : 'border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="ตัวเลือกเพิ่มเติม"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {showMoreActions && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowMoreActions(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl border border-slate-700 bg-slate-800 py-1.5 text-xs shadow-xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreActions(false)
                          navigate(`/purchasing/po/new?duplicate_from=${po.id}`)
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5 text-sky-400" />
                        <span>ทำสำเนา / สร้างซ้ำ</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreActions(false)
                          setShowEnvelope(true)
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                      >
                        <Mail className="h-3.5 w-3.5 text-amber-400" />
                        <span>พิมพ์หน้าซองจดหมาย</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreActions(false)
                          setShowShare(true)
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                      >
                        <Share2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>คัดลอกลิงก์ / แชร์ LINE</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreActions(false)
                          setViewStyle((v) => (v === 'portal' ? 'paper' : 'portal'))
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-purple-400" />
                        <span>{viewStyle === 'portal' ? 'สลับเป็นแบบฟอร์ม A4' : 'สลับเป็นมุมมองระบบ'}</span>
                      </button>

                      {canCreatePurchasing(profile.role) && !isPaidInFull && !isFullyReceived && po.status !== 'cancelled' && (
                        <>
                          <div className="my-1 border-t border-slate-700/70" />
                          <button
                            type="button"
                            onClick={() => {
                              setShowMoreActions(false)
                              cancelPo()
                            }}
                            className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-amber-300 hover:bg-amber-500/15 transition cursor-pointer font-semibold"
                          >
                            <X className="h-3.5 w-3.5 text-amber-400" />
                            <span>ยกเลิกใบสั่งซื้อ</span>
                          </button>
                        </>
                      )}

                      {canCreatePurchasing(profile.role) && !isPaidInFull && !isFullyReceived && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreActions(false)
                            removePo()
                          }}
                          className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-rose-400 hover:bg-rose-500/15 transition cursor-pointer font-bold"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          <span>ลบใบสั่งซื้อ</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ชั้นที่ 2: แถบข้อมูลสรุปอ้างอิงเต็มความกว้าง */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Calendar className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span>วันที่สั่งซื้อ: <strong className="text-white font-mono">{formatThaiDate(po.order_date)}</strong></span>
            </span>

            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>กำหนดส่งมอบ: <strong className="text-white font-mono">{po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date) : 'ตามตกลง'}</strong></span>
            </span>

            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Store className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>ผู้ขาย: <strong className="text-white">{vendorDisplayName}</strong></span>
            </span>

            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <FolderGit2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>โครงการ: <strong className="text-sky-300">{projectDisplayName}</strong></span>
            </span>

            {po.customer_name && (
              <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Building className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                <span>ลูกค้า: <strong className="text-white">{po.customer_name}</strong></span>
              </span>
            )}

            {(po.quotation_id || po.sales_quotation_no) && (
              <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <FileText className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                {po.quotation_id ? (
                  <Link
                    to={`/quotations/${po.quotation_id}`}
                    className="text-amber-300 hover:underline font-mono font-bold"
                  >
                    QT ขาย: {po.sales_quotation_no || 'ดูใบเสนอราคา'}
                  </Link>
                ) : (
                  <span>QT ขาย: <strong className="text-amber-300 font-mono">{po.sales_quotation_no}</strong></span>
                )}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold shadow-xs">
            {error}
          </div>
        )}
        {done && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold shadow-xs">
            {done}
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE A: INTERACTIVE WEB PORTAL (ผัง Workflow 5 ขั้นตอน + รายละเอียดครบ) */}
        {/* ============================================================== */}
        {viewStyle === 'portal' && (
          <div className="space-y-5">
            {/* 2. ผังลำดับขั้นตอนการทำงานจัดซื้อ 5 ขั้นตอน (แบบเดียวกับ QuotationDetail) */}
            <ProcurementWorkflowStepper
              mode="po"
              pr={pr}
              po={po}
              items={items}
              grns={grns}
              payments={payments}
              canReceive={canReceive}
              onPrintPdf={() => setShowPoPdf(true)}
              onOpenPayment={() => setShowPaymentModal(true)}
              onScrollToReceive={scrollToReceive}
              onOpenGrnTab={() => jumpToTab('receiving')}
              onOpenPayTab={() => jumpToTab('payments')}
              onOpenAuditTab={() => jumpToTab('audit')}
            />

            {/* 3. Bento Grid: 4 Interactive Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: ผู้ขายและคู่ค้า (Vendor Card) */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3 hover:border-amber-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold">
                      <Store className="h-4 w-4" />
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">ผู้ขาย / ร้านค้า</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">VEND</span>
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900 dark:text-white truncate" title={po.custom_vendor_name || po.vendors?.vendor_name}>
                    {po.custom_vendor_name || po.vendors?.vendor_name || 'ไม่ระบุชื่อร้านค้า'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {po.vendors?.address || 'ไม่ได้ระบุที่อยู่ผู้ขาย'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>เลขผู้เสียภาษี:</span>
                    <b className="font-mono text-slate-900 dark:text-slate-200">{po.vendors?.tax_id || '-'}</b>
                  </div>
                  {po.vendors?.phone && (
                    <div className="flex justify-between items-center text-sky-700 dark:text-sky-400">
                      <span>โทรศัพท์:</span>
                      <a href={`tel:${po.vendors.phone}`} className="font-bold hover:underline">
                        {po.vendors.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: โครงการ & หน้างานติดตั้ง (Project & Site) */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3 hover:border-sky-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 font-bold">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">หน้างาน / โครงการ</span>
                  </div>
                  <span className="text-[10px] font-bold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                    SITE
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">โครงการติดตั้ง:</div>
                  <div className="font-black text-sm text-slate-900 dark:text-white truncate" title={po.custom_project_name || po.projects?.project_name}>
                    {po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท')}
                  </div>
                  {po.customer_name && (
                    <div className="text-xs text-sky-800 dark:text-sky-400 font-semibold mt-0.5">
                      ลูกค้า: {po.customer_name}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                  <div className="text-[11px] text-slate-400">สถานที่ส่งมอบ:</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={po.delivery_address || 'สโตร์หลัก'}>
                    {po.delivery_address || 'สโตร์หลัก / สำนักงาน'}
                  </div>
                </div>
              </div>

              {/* Card 3: การเงิน & ใบกำกับภาษี (Financial & Tax) */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3 hover:border-emerald-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">การเงิน & ภาษี</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    FINANCE
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">ใบกำกับภาษีผู้ขาย:</div>
                  <div className="font-mono font-bold text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded inline-block mt-0.5 border border-emerald-200 dark:border-emerald-800">
                    {po.vendor_tax_invoice_no || 'ยังไม่ระบุ'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>เงื่อนไขชำระ:</span>
                    <b className="text-slate-900 dark:text-slate-100">{PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label?.split(' ')[0] || 'เครดิตเทอม'}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>ช่องทางเบิก:</span>
                    <b className="text-slate-900 dark:text-slate-100">{po.payment_channel_requested === 'cheque' ? 'เช็ค' : po.payment_channel_requested === 'cash' ? 'เงินสด' : 'โอนเงิน'}</b>
                  </div>
                </div>
              </div>

              {/* Card 4: การขนส่ง & ตรวจรับ (Logistics & GRN) */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3 hover:border-purple-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 font-bold">
                      <Truck className="h-4 w-4" />
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">กำหนดส่ง & รับของ</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                    LOGISTICS
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">วันกำหนดส่ง (Due Date):</div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    {po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date, true) : 'ตามตกลง'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>การตรวจรับเข้าคลัง:</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${isFullyReceived
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : grns.length > 0
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>
                      {isFullyReceived ? 'รับครบแล้ว 100%' : grns.length > 0 ? `รับแล้ว (${grns.length} ครั้ง)` : 'รอของมาส่ง'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vendor Quotation Box (เอกสารอ้างอิงใบเสนอราคาผู้ขาย) */}
            <div className="rounded-2xl border border-sky-200/90 dark:border-sky-800/80 bg-gradient-to-r from-sky-50/70 via-blue-50/40 to-sky-50/70 dark:from-slate-900 dark:via-sky-950/20 dark:to-slate-900 p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 dark:border-sky-900/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white font-bold shadow-xs">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                        เอกสารใบเสนอราคาจากผู้ขาย (Vendor Quotation)
                      </h3>
                      {po.quotation_no && (
                        <span className="font-mono text-xs font-bold text-sky-800 dark:text-sky-300 bg-sky-100 dark:bg-sky-950 px-2 py-0.5 rounded-md border border-sky-300 dark:border-sky-800">
                          {po.quotation_no}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      เอกสารยืนยันสเปกและราคาที่ได้รับจากคู่ค้า เพื่อใช้ตรวจสอบเปรียบเทียบก่อนการจัดซื้อ
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Upload/Change Button */}
                  <input
                    type="file"
                    id="po-detail-quotation-upload"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleDirectQuotationUpload}
                  />
                  <label
                    htmlFor="po-detail-quotation-upload"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 dark:border-sky-800 bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 transition shadow-2xs cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingQuotation ? 'กำลังอัปโหลด...' : (po.quotation_url ? 'เปลี่ยนรูปใบเสนอราคา' : '+ แนบรูปใบเสนอราคา')}</span>
                  </label>
                </div>
              </div>

              {/* Quotation Info & File Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <div>เลขที่ใบเสนอราคา: <b className="text-slate-900 dark:text-white font-mono">{po.quotation_no || 'ไม่ระบุ'}</b></div>
                  <div>วันที่ใบเสนอราคา: <b className="text-slate-900 dark:text-white">{po.quotation_date ? formatThaiDate(po.quotation_date, true) : 'ไม่ระบุ'}</b></div>
                  <div>ผู้ขาย / ร้านค้า: <b className="text-slate-900 dark:text-white">{po.vendors?.vendor_name || po.custom_vendor_name || '-'}</b></div>
                </div>

                {po.quotation_url ? (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/60">
                    {/* Thumbnail if Image */}
                    {po.quotation_url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) || po.quotation_url.startsWith('data:image') || (po.quotation_url.includes('/') && !po.quotation_url.endsWith('.pdf')) ? (
                      <div
                        onClick={() => openFile(po.quotation_url)}
                        className="relative h-14 w-20 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer group bg-slate-100"
                        title="คลิกเพื่อดูรูปขนาดเต็ม"
                      >
                        <R2Image
                          fileKey={po.quotation_url}
                          alt="Vendor Quotation"
                          className="h-full w-full object-cover group-hover:scale-110 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition">
                          <Eye className="h-4 w-4 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => openFile(po.quotation_url)}
                        className="h-14 w-14 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-700 dark:text-sky-300 text-2xl font-bold cursor-pointer hover:bg-sky-200 dark:hover:bg-sky-900 transition"
                        title="คลิกเพื่อเปิดดูไฟล์เอกสาร"
                      >
                        📄
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        ไฟล์เอกสารใบเสนอราคาจากผู้ขาย
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        ตรวจสอบสเปก รายละเอียด และราคาสินค้าได้ตลอดเวลา
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => openFile(po.quotation_url)}
                          className="text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>เปิดดูเอกสาร / รูปขนาดเต็ม ↗</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sm:col-span-2 text-xs text-slate-400 dark:text-slate-500 italic bg-white/50 dark:bg-slate-800/40 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <span>ยังไม่ได้แนบไฟล์รูปใบเสนอราคา สามารถคลิกปุ่ม "+ แนบรูปใบเสนอราคา" เพื่ออัปโหลดเอกสารต้นฉบับได้</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Section: รายการพัสดุและแคตตาล็อกวัสดุ (Thai Watsadu Style Product Showcase) */}
            <div ref={receiveSectionRef} className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black shadow-sm">
                    <Package className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                      รายการพัสดุและอุปกรณ์สั่งซื้อ ({items.length} รายการ)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      แสดงรายการสินค้า ราคาต่อหน่วย ยอดรวม และประวัติการรับเข้าสโตร์
                    </p>
                  </div>
                </div>

                {/* View Switcher: Product Cards vs Compact Table */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setItemsLayout('cards')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${itemsLayout === 'cards'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <Grid className="h-3.5 w-3.5" />
                    <span>การ์ดสินค้า (Catalog Cards)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemsLayout('table')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${itemsLayout === 'table'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>ตารางละเอียด (Table View)</span>
                  </button>
                </div>
              </div>

              {/* View 1: Thai Watsadu Style Product Cards */}
              {itemsLayout === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((i, idx) => {
                    const cat = getMaterialCategory(i.item_name)
                    const isFullyReceivedItem = Number(i.qty_received) >= Number(i.quantity)
                    const remain = Math.max(0, Number(i.quantity) - Number(i.qty_received))

                    // แก้ไขปัญหาราคา 0.00 บาท อัตโนมัติ (Price Self-Healing)
                    const itemUnitPrice = Number(i.unit_price) > 0
                      ? Number(i.unit_price)
                      : (Number(po.total_amount) > 0 && items.length === 1 && Number(i.quantity) > 0)
                        ? Math.round((Number(po.total_amount) / Number(i.quantity)) * 100) / 100
                        : 0
                    const itemTotal = Number(i.total_amount) > 0
                      ? Number(i.total_amount)
                      : Math.round((itemUnitPrice * (Number(i.quantity) || 1)) * 100) / 100

                    return (
                      <div
                        key={i.id}
                        className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 space-y-3 hover:border-amber-400 hover:shadow-md transition-all duration-150 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          {/* Category Badge */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cat.color}`}>
                              <span>{cat.icon}</span>
                              <span className="truncate max-w-[170px]">{cat.label}</span>
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-400">#{idx + 1}</span>
                          </div>

                          {/* Item Title */}
                          <div className="font-black text-slate-900 text-sm leading-snug">
                            {i.item_name}
                          </div>

                          {/* Quick Usage History Link */}
                          <button
                            type="button"
                            onClick={() => setSelectedUsageItem({ item_name: i.item_name })}
                            className="text-[11px] font-bold text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>ดูประวัติโครงการที่เคยใช้</span>
                          </button>
                        </div>

                        {/* Price & Quantity Banner (Thai Watsadu Style Highlight) */}
                        <div className="pt-2 border-t border-slate-200/70 space-y-2">
                          <div className="flex items-end justify-between bg-white p-3 rounded-xl border border-slate-200/80">
                            <div>
                              <div className="text-[10px] text-slate-400 font-semibold uppercase">ราคาต่อหน่วย</div>
                              <div className="font-mono font-black text-emerald-800 text-base">
                                ฿{baht(itemUnitPrice)} <span className="text-xs font-normal text-slate-500">/{i.unit || 'ชิ้น'}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 font-semibold uppercase">สั่งซื้อ</div>
                              <div className="font-mono font-bold text-slate-900 text-sm">
                                {Math.round(Number(i.quantity) || 0)} {i.unit || 'ชิ้น'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs px-1">
                            <span className="text-slate-500 font-medium">มูลค่ารวม:</span>
                            <span className="font-mono font-black text-slate-950 text-sm">
                              ฿{baht(itemTotal)}
                            </span>
                          </div>

                          {/* Stock Status Badge */}
                          <div className="flex items-center justify-between pt-1">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${isFullyReceivedItem
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : Number(i.qty_received) > 0
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                              <span>{isFullyReceivedItem ? ' รับครบแล้ว' : Number(i.qty_received) > 0 ? 'รับแล้วบางส่วน' : '⏳ รอรับของ'}</span>
                              <span>({Math.round(Number(i.qty_received) || 0)} / {Math.round(Number(i.quantity) || 0)})</span>
                            </span>

                            {canReceive && !isFullyReceivedItem && (
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">รับ:</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  max={Math.round(remain)}
                                  value={qty[i.id] ?? ''}
                                  onChange={(e) => setQty({ ...qty, [i.id]: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                                  placeholder={String(Math.round(remain))}
                                  className="input !py-0.5 !px-1.5 !w-16 !text-right font-mono text-xs font-bold border-sky-300 focus:border-sky-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* View 2: Detailed Table View */}
              {itemsLayout === 'table' && (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-left">
                        <th className="py-3 px-3 text-center w-12">#</th>
                        <th className="py-3 px-3">รายการวัสดุ / พัสดุ</th>
                        <th className="py-3 px-3 text-right">จำนวนสั่ง</th>
                        <th className="py-3 px-3 text-center w-16">หน่วย</th>
                        <th className="py-3 px-3 text-right">ราคา/หน่วย (บาท)</th>
                        <th className="py-3 px-3 text-right">ยอดรวม (บาท)</th>
                        <th className="py-3 px-3 text-center">สถานะรับเข้าสโตร์</th>
                        {canReceive && <th className="py-3 px-3 text-right bg-sky-100 text-sky-950">ตรวจรับครั้งนี้</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((i, idx) => {
                        const remain = Math.max(0, Number(i.quantity) - Number(i.qty_received))
                        const isFullyReceivedItem = Number(i.qty_received) >= Number(i.quantity)

                        // แก้ไขปัญหาราคา 0.00 บาท อัตโนมัติ (Price Self-Healing)
                        const itemUnitPrice = Number(i.unit_price) > 0
                          ? Number(i.unit_price)
                          : (Number(po.total_amount) > 0 && items.length === 1 && Number(i.quantity) > 0)
                            ? Math.round((Number(po.total_amount) / Number(i.quantity)) * 100) / 100
                            : 0
                        const itemTotal = Number(i.total_amount) > 0
                          ? Number(i.total_amount)
                          : Math.round((itemUnitPrice * (Number(i.quantity) || 1)) * 100) / 100

                        return (
                          <tr key={i.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-3 px-3 font-medium">
                              <div className="text-slate-900 font-bold">{i.item_name}</div>
                              <button
                                type="button"
                                onClick={() => setSelectedUsageItem({ item_name: i.item_name })}
                                className="text-[11px] text-sky-700 hover:text-sky-900 hover:underline cursor-pointer"
                              >
                                ดูประวัติโครงการที่เคยใช้
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                              {Math.round(Number(i.quantity) || 0)}
                            </td>
                            <td className="py-3 px-3 text-center text-slate-600 font-medium">
                              {i.unit || 'ชิ้น'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800">
                              {baht(itemUnitPrice)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-black text-slate-950">
                              {baht(itemTotal)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${isFullyReceivedItem
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : Number(i.qty_received) > 0
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-100 text-slate-600'
                                }`}>
                                {Math.round(Number(i.qty_received) || 0)} / {Math.round(Number(i.quantity) || 0)}
                              </span>
                            </td>
                            {canReceive && (
                              <td className="py-3 px-3 text-right bg-sky-50/50">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  max={Math.round(remain)}
                                  value={qty[i.id] ?? ''}
                                  onChange={(e) => setQty({ ...qty, [i.id]: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                                  disabled={isFullyReceivedItem}
                                  placeholder={remain > 0 ? String(Math.round(remain)) : '0'}
                                  className="input !py-1 !text-right w-20 inline-block font-mono text-xs font-bold border-sky-300"
                                />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action Bar for Goods Receiving */}
              {canReceive && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-50 to-emerald-50 dark:from-sky-950/40 dark:to-emerald-950/30 p-4 rounded-2xl border border-sky-200 dark:border-sky-800">
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <PackageCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <span>ฝ่ายสโตร์และพัสดุ: ตรวจรับของเข้าสโตร์หลัก</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      ระบบจะสร้างใบตรวจรับของ (RI), เพิ่มสต็อกสโตร์ (`inventory_items`) และลงบัญชีสมุดรายวันอัตโนมัติ
                    </p>
                  </div>
                  <button
                    className="btn-primary !bg-sky-700 hover:!bg-sky-800 shadow-sm font-bold text-xs !py-2.5 !px-5 cursor-pointer"
                    onClick={receive}
                    disabled={busy || !anyQty}
                  >
                    {busy ? 'กำลังบันทึก...' : 'ยืนยันรับของเข้าสโตร์ (ออก RI)'}
                  </button>
                </div>
              )}
            </div>

            {/* 4. Tab Navigation for Connected Features */}
            <div ref={tabsSectionRef} className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('items')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${activeTab === 'items'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>สรุปยอดเงินและเงื่อนไข</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('receiving')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${activeTab === 'receiving'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>ประวัติรับของเข้าสโตร์ ({grns.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${activeTab === 'payments'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>ประวัติจ่ายชำระเงิน ({payments.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('lifecycle')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${activeTab === 'lifecycle'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Workflow className="h-3.5 w-3.5" />
                  <span>วงจรเอกสาร (PR → PO → RI → PV)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${activeTab === 'audit'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>บันทึกระบบ (Audit)</span>
                </button>
              </div>

              {/* Sub-tab 1: สรุปยอดเงินและเงื่อนไข */}
              {activeTab === 'items' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs">
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 space-y-2">
                      <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-1">
                        เงื่อนไขและกำหนดการชำระเงิน
                      </div>
                      <div className="space-y-1 text-slate-700 dark:text-slate-300">
                        <div>รูปแบบ: <b>{PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label || 'เครดิตเทอม'}</b></div>
                        <div>ช่องทาง: <b>{po.payment_channel_requested === 'cheque' ? 'เช็ค' : po.payment_channel_requested === 'cash' ? 'เงินสด' : 'โอนเงิน'}</b></div>
                        {po.deposit_type === 'deposit' && (
                          <div className="text-amber-800 dark:text-amber-300 font-semibold">
                            มัดจำ {po.deposit_percent}% = <b>{baht(po.deposit_amount)} บาท</b> (คงเหลือ: {baht(po.remaining_amount)} บาท)
                          </div>
                        )}
                      </div>
                    </div>

                    {po.notes && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 space-y-1">
                        <div className="font-bold text-slate-900 dark:text-slate-100">หมายเหตุเพิ่มเติม</div>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{po.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 space-y-2.5">
                    <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                      <span>{isVatIncluded ? 'มูลค่าสินค้า (ก่อนภาษี):' : 'มูลค่าสินค้ารวม:'}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">{baht(subtotalBeforeVat)} บาท</span>
                    </div>

                    {vatVal > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                        <span>ภาษีมูลค่าเพิ่ม {poTotals.vatRate}% (VAT){isVatIncluded ? ' · รวมในราคาสินค้า' : ''}:</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">+{baht(vatVal)} บาท</span>
                      </div>
                    )}

                    {Number(po.wht_rate) > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700 text-purple-800 dark:text-purple-300">
                        <span>หักภาษี ณ ที่จ่าย {po.wht_rate}%:</span>
                        <span className="font-mono font-bold text-purple-900 dark:text-purple-300">-{baht(po.wht_amount)} บาท</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-2.5 px-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">ยอดเงินสุทธิทั้งสิ้น:</span>
                      <span className="font-mono font-black text-xl text-emerald-800 dark:text-emerald-400">{baht(grandTotalVal)} บาท</span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right italic font-medium">
                      ({thaiBahtText(grandTotalVal)})
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: ประวัติรับของเข้าสโตร์ (GRN) */}
              {activeTab === 'receiving' && (
                <div className="space-y-3">
                  {grns.length > 0 ? (
                    grns.map((g) => (
                      <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-sm text-sky-800">{g.grn_no}</span>
                          <span className="text-slate-600">วันที่รับเข้าสโตร์: <b>{g.received_date}</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-300">
                            ลงบัญชีสมุดรายวันแล้ว
                          </span>
                          <Link to="/store?tab=receipts" className="text-sky-700 hover:underline font-semibold">
                            ดูในสโตร์ →
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200">
                      ยังไม่มีประวัติการรับของเข้าสโตร์สำหรับใบสั่งซื้อนี้
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: ประวัติจ่ายชำระเงิน (PV) */}
              {activeTab === 'payments' && (
                <div className="space-y-3">
                  {/* แถบสรุปสถานะการจ่ายแบ่งงวด / มัดจำ */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block">ยอดที่ต้องชำระสุทธิ</span>
                      <span className="font-mono font-black text-sm text-slate-900 dark:text-white">฿{baht(paySummary.totalPayable)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">ชำระสะสมแล้ว</span>
                      <span className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-400">฿{baht(paySummary.paidAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] text-slate-500 block">ยอดค้างจ่ายคงเหลือ</span>
                        <span className={`font-mono font-black text-sm ${paySummary.remainingAmount > 0.05 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          ฿{baht(paySummary.remainingAmount)}
                        </span>
                      </div>
                      {!isPaidInFull && po.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => setShowPaymentModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-2xs transition cursor-pointer"
                        >
                          {paySummary.hasPartialPaid ? 'จ่ายงวดถัดไป' : 'จ่ายเงิน'}
                        </button>
                      )}
                    </div>
                  </div>

                  {payments.length > 0 ? (
                    payments.map((p) => {
                      const stageText =
                        p.payment_stage === 'deposit'
                          ? 'จ่ายมัดจำ'
                          : p.payment_stage === 'installment'
                          ? 'แบ่งจ่ายบางส่วน (งวด)'
                          : p.payment_stage === 'remaining'
                          ? 'จ่ายงวดถัดไป/คงเหลือ'
                          : 'จ่ายเต็มจำนวน'

                      return (
                        <div key={p.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-emerald-800">
                                {p.transaction_no || `PV-${p.id.slice(0, 8)}`}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800">
                                {stageText}
                              </span>
                            </div>
                            <span className="font-mono font-black text-sm text-emerald-900">
                              ฿{baht(p.amount || p.amount_paid)} บาท
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between text-slate-600 pt-1">
                            <div>
                              วันที่จ่าย: <b>{p.payment_date}</b> · ช่องทาง: <b>{p.payment_channel || p.payment_method || 'โอนเงิน'}</b>
                            </div>
                            {p.slip_reference_no && (
                              <div className="text-[11px] text-slate-500">
                                สลิปอ้างอิง: {p.slip_reference_no}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200">
                      {isPaidInFull ? 'เอกสารนี้ชำระเงินครบถ้วนแล้ว' : 'ยังไม่มีประวัติการจ่ายเงิน กรุณากดปุ่ม "จ่ายชำระเงิน (PAY)" ด้านบน'}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 4: วงจรเอกสาร */}
              {activeTab === 'lifecycle' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400">1. ใบขอซื้อ (PR)</div>
                      {pr ? (
                        <>
                          <Link to={`/purchasing/pr/${pr.id}`} className="font-mono font-bold text-sky-700 dark:text-sky-400 hover:underline block">
                            {pr.pr_no}
                          </Link>
                          <div className="text-[11px] text-slate-500">วันที่ขอ: {formatThaiDate(pr.request_date)}</div>
                        </>
                      ) : (
                        <div className="font-semibold text-slate-500">สั่งซื้อตรง (Direct PO)</div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">2. ใบสั่งซื้อ (PO)</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{po.po_no}</div>
                      <div className="text-[11px] text-slate-500">สั่งซื้อ: {formatThaiDate(po.order_date)}</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400">3. ใบรับของ (GR / RI)</div>
                      {grns.length > 0 ? (
                        <>
                          <div className="font-mono font-bold text-sky-700 dark:text-sky-400">{grns.map((g) => g.grn_no).join(', ')}</div>
                          <div className="text-[11px] text-slate-500">{isFullyReceived ? 'ตรวจรับครบ 100%' : 'รับแล้วบางส่วน'}</div>
                        </>
                      ) : (
                        <div className="text-slate-400">ยังไม่มีรายการรับเข้าสโตร์</div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400">4. การชำระเงิน (PV)</div>
                      {payments.length > 0 ? (
                        <>
                          <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {payments.map((p) => p.transaction_no || `PV-${p.id.slice(0, 6)}`).join(', ')}
                          </div>
                          <div className="text-[11px] text-slate-500">{isPaidInFull ? 'ชำระครบถ้วนแล้ว' : 'มัดจำบางส่วน'}</div>
                        </>
                      ) : (
                        <div className="text-slate-400">{isPaidInFull ? 'บันทึกชำระครบแล้ว' : 'รอชำระเงิน'}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 5: Audit Trail */}
              {activeTab === 'audit' && (
                <div>
                  <AuditPanel docId={po.id} row={po} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE B: A4 PAPER PRINT SHEET (รูปแบบกระดาษพิมพ์ขนาด A4) */}
        {/* ============================================================== */}
        {viewStyle === 'paper' && (
          <div id="printable-report" className="paper-sheet relative bg-white rounded-2xl shadow-lg border border-slate-300 p-8 sm:p-12 space-y-6">
            <div className="border-b-2 border-slate-900 pb-5 flex flex-wrap justify-between items-start gap-4">
              <div>
                <div className="text-lg font-black text-slate-950">บริษัท อันวา แอนด์ โค จำกัด</div>
                <div className="text-xs text-slate-600 mt-1">
                  123/45 ถนนวิภาวดีรังสิต แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900
                  <br />
                  เลขประจำตัวผู้เสียภาษี: <b className="font-mono text-slate-900">0105566088991</b> (สำนักงานใหญ่)
                </div>
              </div>
              <div className="text-right">
                <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                  ใบสั่งซื้อ / PURCHASE ORDER
                </div>
                <div className="text-2xl font-black font-mono text-slate-950 mt-1">{po.po_no}</div>
                <div className="text-xs text-slate-600 mt-1">วันที่: {formatThaiDate(po.order_date, true)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">ผู้ขาย (VENDOR)</div>
                <div className="font-bold text-slate-950">{po.custom_vendor_name || po.vendors?.vendor_name}</div>
                <div className="text-slate-600">{po.vendors?.address || '-'}</div>
                <div className="text-slate-600">เลขภาษี: {po.vendors?.tax_id || '-'}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">ส่งมอบถึง (SHIP TO)</div>
                <div className="font-bold text-slate-950">{po.custom_project_name || po.projects?.project_name}</div>
                <div className="text-slate-600">สถานที่: {po.delivery_address || 'สโตร์หลัก'}</div>
                <div className="text-slate-600">ผู้สั่ง: {po.buyer_name || 'Admin'}</div>
              </div>
            </div>

            <table className="w-full text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="py-2 px-3 text-center w-12">#</th>
                  <th className="py-2 px-3 text-left">รายการพัสดุ</th>
                  <th className="py-2 px-3 text-right w-20">จำนวน</th>
                  <th className="py-2 px-3 text-center w-16">หน่วย</th>
                  <th className="py-2 px-3 text-right w-28">ราคา/หน่วย</th>
                  <th className="py-2 px-3 text-right w-28">ยอดรวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((i, idx) => {
                  const itemUnitPrice = Number(i.unit_price) > 0
                    ? Number(i.unit_price)
                    : (Number(po.total_amount) > 0 && items.length === 1 && Number(i.quantity) > 0)
                      ? Math.round((Number(po.total_amount) / Number(i.quantity)) * 100) / 100
                      : 0
                  const itemTotal = Number(i.total_amount) > 0
                    ? Number(i.total_amount)
                    : Math.round((itemUnitPrice * (Number(i.quantity) || 1)) * 100) / 100

                  return (
                    <tr key={i.id}>
                      <td className="py-2.5 px-3 text-center font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{i.item_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{Math.round(Number(i.quantity) || 0)}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{i.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{baht(itemUnitPrice)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{baht(itemTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="flex flex-wrap justify-between items-start gap-4 pt-3 text-xs border-t border-slate-200">
              <div className="text-slate-600 max-w-sm space-y-1">
                <div><b>เงื่อนไขการชำระเงิน:</b> {PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label || 'เครดิตเทอม 30 วัน'}</div>
                {po.quotation_no && <div><b>อ้างอิงใบเสนอราคา:</b> <span className="font-mono">{po.quotation_no}</span></div>}
                {po.pr?.pr_no && <div><b>อ้างอิงใบขอซื้อ (PR):</b> <span className="font-mono">{po.pr.pr_no}</span></div>}
                <div className="font-medium text-slate-800 italic pt-1">({thaiBahtText(grandTotalVal)})</div>
              </div>
              <div className="w-72 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex justify-between text-slate-700">
                  <span>{isVatIncluded ? 'มูลค่าสินค้า (ก่อนภาษี):' : 'รวมเป็นเงิน (Subtotal):'}</span>
                  <span className="font-mono font-bold">{baht(subtotalBeforeVat)} บาท</span>
                </div>
                {vatVal > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>ภาษีมูลค่าเพิ่ม (VAT {poTotals.vatRate}%){isVatIncluded ? ' · รวมในยอด' : ''}:</span>
                    <span className="font-mono font-semibold">+{baht(vatVal)} บาท</span>
                  </div>
                )}
                {whtVal > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>หักภาษี ณ ที่จ่าย (WHT {po.wht_rate}%):</span>
                    <span className="font-mono">-{baht(whtVal)} บาท</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-950 border-t border-slate-900 pt-1.5 mt-1">
                  <span>ยอดสุทธิทั้งสิ้น:</span>
                  <span className="font-mono text-emerald-800">{baht(grandTotalVal)} บาท</span>
                </div>
              </div>
            </div>

            {/* 4-Column Signature Block for Standard A4 Paper Document */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-slate-300 text-center text-[11px] text-slate-700">
              <div className="space-y-6">
                <div className="font-bold">ผู้สั่งซื้อ (Purchaser)</div>
                <div className="border-b border-dashed border-slate-400 mx-3"></div>
                <div>( {po.buyer_name || 'Admin'} )<br /><span className="text-[10px] text-slate-500">เจ้าหน้าที่จัดซื้อ</span></div>
              </div>
              <div className="space-y-6">
                <div className="font-bold">ผู้ตรวจสอบ (Checked By)</div>
                <div className="border-b border-dashed border-slate-400 mx-3"></div>
                <div>( ........................................ )<br /><span className="text-[10px] text-slate-500">ผู้จัดการโครงการ / วิศวกร</span></div>
              </div>
              <div className="space-y-6">
                <div className="font-bold">ผู้อนุมัติ (Authorized By)</div>
                <div className="border-b border-dashed border-slate-400 mx-3"></div>
                <div>( ........................................ )<br /><span className="text-[10px] text-slate-500">กรรมการผู้มีอำนาจลงนาม</span></div>
              </div>
              <div className="space-y-6">
                <div className="font-bold">ผู้รับคำสั่งซื้อ (Vendor)</div>
                <div className="border-b border-dashed border-slate-400 mx-3"></div>
                <div>( ........................................ )<br /><span className="text-[10px] text-slate-500">ลงนามและประทับตรา</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        {selectedUsageItem && (
          <ItemProjectUsageModal
            item={selectedUsageItem}
            onClose={() => setSelectedUsageItem(null)}
          />
        )}

        {showPoPdf && (
          <PODocumentModal
            po={po}
            items={items}
            onClose={() => setShowPoPdf(false)}
          />
        )}

        {showPaymentModal && (
          <PaymentActionModal
            isOpen={true}
            type="disburse"
            docType="PO"
            docId={po.id}
            docNo={po.po_no}
            vendorId={po.vendor_id}
            contactName={po.vendors?.vendor_name}
            items={items}
            totalAmount={paySummary.totalPayable}
            alreadyPaid={paySummary.paidAmount}
            depositAmount={po.deposit_amount || 0}
            remainingAmount={paySummary.remainingAmount}
            hasDeposit={po.deposit_type === 'deposit'}
            paymentStatus={paySummary.effectivePaymentStatus}
            requestedChannel={po.payment_channel_requested || 'transfer'}
            projectId={po.project_id}
            projectName={po.projects?.project_name}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => load()}
          />
        )}

        {showEnvelope && (
          <EnvelopePrintModal po={po} onClose={() => setShowEnvelope(false)} />
        )}

        {showShare && (
          <POShareModal po={po} onClose={() => setShowShare(false)} />
        )}

        {/* Modal ยืนยันยกเลิกใบสั่งซื้อ (Cancel PO Modal) */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-bold shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    ยกเลิกใบสั่งซื้อ (Cancel PO)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {po.po_no} · ราคาที่สั่งซื้อ ฿{baht(grandTotalVal)} บ.
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 bg-rose-50/70 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200/80 dark:border-rose-900/50">
                <p className="font-bold text-rose-900 dark:text-rose-300">
                  สิ่งที่จะเกิดขึ้นเมื่อกดยกเลิก:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <li>สถานะของใบสั่งซื้อนี้จะเปลี่ยนเป็น <strong>"ยกเลิก (Cancelled)"</strong></li>
                  <li>หากมีใบขอซื้อ (PR) เชื่อมอยู่ ระบบจะปลดล็อค PR ให้สามารถนำไปเปิดจัดซื้อใหม่ได้</li>
                  <li>ไม่สามารถรับของเข้าสโตร์หรือจ่ายเงินในใบสั่งซื้อนี้ได้อีกต่อไป</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ระบุเหตุผลในการยกเลิก *
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    'ผู้ขายแจ้งสินค้าหมด / เลิกผลิต',
                    'เปลี่ยนคู่ค้า / เปรียบเทียบราคาใหม่',
                    'เปลี่ยนสเปกวัสดุวิศวกรรม',
                    'ยกเลิกโครงการหรือปรับแผนงาน',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCancelReason(preset)}
                      className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="กรอกเหตุผล เช่น ร้านค้าของหมด / สเปกไม่ตรงตามวิศวกรต้องการ..."
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false)
                    setCancelReason('')
                  }}
                  disabled={cancelling}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ปิด / ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancelPo}
                  disabled={cancelling || !cancelReason.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <span>{cancelling ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกใบสั่งซื้อ'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: ขยายดูรูปใบเสนอราคาขนาดเต็ม (Quotation Lightbox Preview) */}
        {previewQuotationModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setPreviewQuotationModal(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xl overflow-hidden flex flex-col space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base"></span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    รูปใบเสนอราคาจากผู้ขาย {po.quotation_no ? `(เลขที่ ${po.quotation_no})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openFile(previewQuotationModal)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>เปิดภาพต้นฉบับ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewQuotationModal(null)}
                    className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto max-h-[75vh] flex items-center justify-center bg-slate-950/20 dark:bg-slate-950 rounded-xl p-2">
                <R2Image
                  fileKey={previewQuotationModal}
                  alt="Full Quotation"
                  className="max-h-full max-w-full object-contain rounded-lg shadow-md"
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
