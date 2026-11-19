import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PO_STATUS, canCreatePurchasing, canReceiveGoods } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'
import AuditPanel from './AuditPanel'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import PODocumentModal from '../../components/reports/PODocumentModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import POShareModal from '../../components/purchasing/POShareModal'
import PaymentActionModal from '../../components/PaymentActionModal'
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
  ArrowLeft,
  ExternalLink,
  Layers,
  Sparkles,
  Upload,
  Eye,
  X,
} from 'lucide-react'
import { uploadItemImage } from '../../lib/store'

// ฟังก์ชันระบุหมวดหมู่วัสดุและสีสันสไตล์ไทวัสดุ & วิศวกรรมโซลาร์เซลล์
function getMaterialCategory(itemName = '') {
  const name = itemName.toLowerCase()
  if (name.includes('แผง') || name.includes('solar') || name.includes('โซลาร์') || name.includes('pv')) {
    return { label: '☀️ โซลาร์เซลล์ & พลังงานแสงอาทิตย์', color: 'bg-amber-100 text-amber-900 border-amber-300', icon: '☀️' }
  }
  if (name.includes('inverter') || name.includes('อินเวอร์เตอร์') || name.includes('แบต') || name.includes('สายไฟ') || name.includes('เบรกเกอร์') || name.includes('ตู้')) {
    return { label: '⚡ ระบบไฟฟ้า & อินเวอร์เตอร์', color: 'bg-sky-100 text-sky-900 border-sky-300', icon: '⚡' }
  }
  if (name.includes('กล่อง') || name.includes('เครื่องมือ') || name.includes('สว่าน') || name.includes('ประแจ') || name.includes('คีม') || name.includes('deli') || name.includes('bosch')) {
    return { label: '🔧 เครื่องมือช่าง & อุปกรณ์ติดตั้ง', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: '🔧' }
  }
  if (name.includes('เหล็ก') || name.includes('ปูน') || name.includes('ท่อ') || name.includes('ราง') || name.includes('mounting')) {
    return { label: '🏗️ โครงสร้าง Mounting & ฮาร์ดแวร์', color: 'bg-purple-100 text-purple-900 border-purple-300', icon: '🏗️' }
  }
  return { label: '📦 พัสดุและวัสดุงานวิศวกรรม', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: '📦' }
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
  const { profile } = useAuth()

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
  const [uploadingQuotation, setUploadingQuotation] = useState(false)
  const [previewQuotationModal, setPreviewQuotationModal] = useState(null)

  const handleDirectQuotationUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !po?.id) return
    setUploadingQuotation(true)
    try {
      const upUrl = await uploadItemImage(file)
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

  // สลับมุมมองระหว่าง Web Portal กับ Paper A4 และ รูปแบบการแสดงสินค้า (Cards vs Table)
  const [viewStyle, setViewStyle] = useState('portal') // 'portal' | 'paper'
  const [itemsLayout, setItemsLayout] = useState('cards') // 'cards' (Thai Watsadu style) | 'table'
  const [activeTab, setActiveTab] = useState('items') // 'items' | 'receiving' | 'payments' | 'lifecycle' | 'audit'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        supabase.from('purchase_orders')
          .select('*, vendors(vendor_name, tax_id, contact_person, phone, address), projects(project_code, project_name), creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
          .eq('id', id).single(),
        supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
        supabase.from('goods_receipts').select('id, grn_no, received_date').eq('po_id', id).order('received_date', { ascending: false }),
      ])

      if (a.error) return setError('ไม่พบใบสั่งซื้อ')
      const poData = a.data
      setPo(poData)

      if (poData?.pr_id) {
        const { data: prRow } = await supabase
          .from('purchase_requisitions')
          .select('id, pr_no, request_date, status, requester_name, notes, purpose')
          .eq('id', poData.pr_id)
          .single()
        setPr(prRow || null)
      } else {
        setPr(null)
      }

      try {
        const { data: txList } = await supabase
          .from('payment_transactions')
          .select('*')
          .or(`document_id.eq.${id},document_no.eq.${poData.po_no}`)
          .order('payment_date', { ascending: false })
        setPayments(txList ?? [])
      } catch (ptErr) {
        console.warn('Cannot load payment_transactions:', ptErr)
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
          supabase.from('purchase_order_items').update({ unit_price: unitPrice, total_amount: lineTotal }).eq('id', it.id).then(() => {})
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

  async function receive() {
    if (isFullyReceived) {
      alert('ใบสั่งซื้อนี้ตรวจรับสินค้าครบถ้วน 100% แล้ว ไม่สามารถรับเพิ่มได้')
      return
    }
    if (!confirm('ยืนยันรับของเข้าสโตร์หลัก? ระบบจะอัปเดตสต็อกและลงบัญชีอัตโนมัติ')) return
    setBusy(true); setError(''); setDone('')

    const receiveItems = items
      .filter((i) => Number(qty[i.id]) > 0)
      .map((i) => {
        const qtyNum = Number(qty[i.id]) || 0
        const remain = Math.max(0, Number(i.quantity) - Number(i.qty_received))
        const actualQty = Math.min(qtyNum, remain > 0 ? remain : qtyNum)
        let unitCost = Number(i.unit_price) || 0
        if (unitCost === 0 && Number(po.total_amount) > 0) {
          unitCost = Math.round((Number(po.total_amount) / (Number(i.quantity) || 1)) * 100) / 100
        }
        return {
          po_item_id: i.id,
          qty_received: actualQty,
          unit_cost: unitCost,
        }
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
        await supabase
          .from('purchase_order_items')
          .update({ item_id: targetItemId, unit_price: it.unit_cost })
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
      const { error: rpcErr } = await supabase.rpc('confirm_goods_receipt', {
        p_po_id: id,
        p_items: receiveItems,
      })
      if (rpcErr) throw rpcErr

      // หมายเหตุ: ไม่ต้องเรียก syncItemToStore ซ้ำที่นี่
      // เพราะฟังก์ชัน confirm_goods_receipt ในฐานข้อมูลจัดการทั้ง:
      // 1. goods_receipts และ goods_receipt_items
      // 2. stock_lots (ล็อตรับเข้า)
      // 3. inventory_items (ยอดคงเหลือและต้นทุนเฉลี่ย)
      // 4. purchase_order_items (ยอดรับแล้ว) และ purchase_orders (สถานะ) ครบถ้วนแล้วใน Transaction เดียว
      // การเรียกซ้ำก่อนหน้านี้ส่งผลให้เกิดข้อมูลซ้ำ 2 รอบในสต็อก

      setDone('บันทึกรับของเข้าสโตร์หลักเรียบร้อย (สต็อกและประวัติการรับเข้าอัปเดตแล้ว)')
      load()
    } catch (rpcErr) {
      console.warn('RPC confirm_goods_receipt failed, running full direct synchronization:', rpcErr)
      try {
        let grnNo = `RI${new Date().toISOString().slice(2, 4)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
        try {
          const { data: noData } = await supabase.rpc('next_doc_no', { p_prefix: 'RI' })
          if (noData) grnNo = noData
        } catch (_) {}

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

        setDone('บันทึกรับของเข้าสโตร์หลักเรียบร้อย (สต็อกและประวัติการรับเข้าอัปเดตแล้ว)')
        load()
      } catch (directErr) {
        console.error('Direct fallback failed:', directErr)
        setError(rpcErr.message || directErr.message || 'บันทึกรับของไม่สำเร็จ')
      }
    } finally {
      setBusy(false)
    }
  }

  async function cancelPo() {
    const reason = window.prompt('เหตุผลในการยกเลิกใบสั่งซื้อ:')
    if (!reason || !reason.trim()) return
    setError('')
    const { error } = await supabase.rpc('cancel_purchase_order', { p_po_id: id, p_reason: reason })
    if (error) return setError(error.message)
    load()
  }

  async function removePo() {
    if (!confirm('ลบใบสั่งซื้อนี้? (ประวัติการลบจะถูกเก็บไว้)')) return
    const { error } = await supabase.rpc('delete_purchase_order', { p_po_id: id, p_reason: null })
    if (error) return setError(error.message)
    navigate('/purchasing?tab=po')
  }

  if (!po) return <p className={error ? 'p-6 text-red-600' : 'p-6 text-slate-500'}>{error || 'กำลังโหลดข้อมูล...'}</p>

  const isPaidInFull = po.payment_status === 'ชำระครบแล้ว' || (Number(po.remaining_amount) <= 0.05 && Number(po.deposit_paid_amount) > 0)
  const isFullyReceived = po.status === 'received' || (items.length > 0 && items.every((i) => Number(i.qty_received) >= Number(i.quantity)))
  const canEdit = canCreatePurchasing(profile.role) && !isPaidInFull && po.status !== 'cancelled' && po.status !== 'received'
  const canReceive = canReceiveGoods(profile.role) && ['open', 'partial'].includes(po.status) && !isFullyReceived
  const anyQty = items.some((i) => Number(qty[i.id]) > 0)

  const computedItemsTotal = items.reduce((sum, it) => sum + (Number(it.quantity || 1) * Number(it.unit_price || 0)), 0)
  const totalAmountVal = Number(po.total_amount) || computedItemsTotal || 0
  const grandTotalVal = Number(po.grand_total) || Number(po.net_amount) || totalAmountVal || 0
  const dueStatus = getPoDueStatus(po)

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 pt-2 font-sans space-y-5">
      <div className="max-w-6xl mx-auto px-4 space-y-4">

        {/* 1. Header Toolbar: Back Link & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Link
            to="/purchasing?tab=po"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-sky-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>กลับไป PR ➔ PO (สายงานจัดซื้อ)</span>
          </Link>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher: Web Portal vs Paper Document */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-xs mr-2">
              <button
                type="button"
                onClick={() => setViewStyle('portal')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewStyle === 'portal'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🌐</span>
                <span>หน้าเว็บจัดการ (Portal View)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('paper')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewStyle === 'paper'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📄</span>
                <span>กระดาษพิมพ์ A4 (Print Sheet)</span>
              </button>
            </div>

            {/* Payment Button */}
            {isPaidInFull ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs cursor-not-allowed opacity-95"
                title="ใบสั่งซื้อนี้ชำระเงินครบถ้วนแล้ว ไม่สามารถชำระเงินซ้ำได้"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>ชำระเงินครบแล้ว (Paid)</span>
              </button>
            ) : po.status !== 'cancelled' ? (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                <span>💸</span>
                <span>จ่ายชำระเงิน (PAY)</span>
              </button>
            ) : null}

            {/* PDF Print Button */}
            <button
              type="button"
              onClick={() => setShowPoPdf(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              <span>🖨️</span>
              <span>พิมพ์ / บันทึก PDF</span>
            </button>

            {/* Tools Menu */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
              {canEdit ? (
                <Link
                  to={`/purchasing/po/${po.id}/edit`}
                  className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-sky-800 transition shadow-xs"
                >
                  ✏️ แก้ไข
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed shadow-xs"
                  title="ไม่สามารถแก้ไขได้เนื่องจากชำระเงินหรือรับของแล้ว"
                >
                  🔒 แก้ไข
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate(`/purchasing/po/new?duplicate_from=${po.id}`)}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
              >
                📋 สร้างซ้ำ
              </button>

              <button
                type="button"
                onClick={() => setShowEnvelope(true)}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
              >
                ✉️ จ่าซอง
              </button>

              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
              >
                🔗 แชร์
              </button>

              {canCreatePurchasing(profile.role) && !isPaidInFull && !isFullyReceived && po.status !== 'cancelled' && (
                <button
                  type="button"
                  className="rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                  onClick={cancelPo}
                >
                  ยกเลิก
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold shadow-xs">
            ⚠️ {error}
          </div>
        )}
        {done && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold shadow-xs">
            ✅ {done}
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE A: INTERACTIVE WEB PORTAL (หน้าเว็บจัดการสีสันทันสมัย สไตล์ ANVA & Co) */}
        {/* ============================================================== */}
        {viewStyle === 'portal' && (
          <div className="space-y-5">
            {/* 1. Hero Showcase Banner (ANVA & Co Tech & Solar Portal Identity) */}
            <div className="relative rounded-3xl bg-gradient-to-br from-[#0B111E] via-[#0F172A] to-[#1E293B] p-6 sm:p-8 text-white shadow-xl overflow-hidden border border-slate-800">
              {/* Background Solar Energy Glow */}
              <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-gradient-to-br from-amber-500/20 via-emerald-500/10 to-transparent blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-tr from-sky-500/15 via-blue-500/10 to-transparent blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-3 max-w-2xl">
                  {/* Branding & Category Pill */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 backdrop-blur-md">
                      <Sun className="h-3.5 w-3.5 text-amber-400" />
                      <span>ANVA & CO · งานจัดซื้อวิศวกรรมโซลาร์เซลล์</span>
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-slate-200 border border-white/10">
                      <span>รหัสสั่งซื้อ:</span>
                      <span className="font-mono text-white">{po.po_no}</span>
                    </span>
                  </div>

                  {/* Title & Key Subject */}
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                      <span>{po.po_no}</span>
                      <span className="text-sm font-semibold text-slate-300 font-sans">
                        · {po.custom_vendor_name || po.vendors?.vendor_name || 'ผู้ขายหน้าร้าน'}
                      </span>
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>โครงการ: <b>{po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท / คลังพัสดุ')}</b></span>
                      {po.customer_name && <span className="text-amber-300 font-semibold ml-2">({po.customer_name})</span>}
                    </p>
                  </div>

                  {/* Status Badges Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge map={PO_STATUS} status={po.status} />

                    {isPaidInFull ? (
                      <span className="text-xs px-3 py-1 rounded-xl font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1.5 backdrop-blur-md">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>ชำระเงินครบถ้วนแล้ว</span>
                      </span>
                    ) : isFullyReceived ? (
                      <span className="text-xs px-3 py-1 rounded-xl font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1.5 backdrop-blur-md animate-pulse">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span>รับของครบแล้ว · รอจ่ายเงิน</span>
                      </span>
                    ) : (
                      <span className="text-xs px-3 py-1 rounded-xl font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 inline-flex items-center gap-1.5 backdrop-blur-md">
                        <Clock className="h-3.5 w-3.5 text-sky-400" />
                        <span>รอตรวจรับของก่อนจ่ายเงิน</span>
                      </span>
                    )}

                    {dueStatus && (
                      <span className={`text-xs px-3 py-1 rounded-xl font-bold border inline-flex items-center gap-1.5 backdrop-blur-md ${dueStatus.badgeCls}`}>
                        <span>{dueStatus.icon}</span>
                        <span>{dueStatus.label}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Thai Watsadu Style Large Price Card */}
                <div className="rounded-2xl bg-white/[0.08] border border-white/15 p-5 backdrop-blur-md text-right sm:min-w-[260px] space-y-1 shadow-lg">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    ยอดสั่งซื้อสุทธิรวมทั้งสิ้น
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                    <span className="text-amber-400 text-2xl mr-1">฿</span>
                    {baht(grandTotalVal)}
                  </div>
                  <div className="text-[11px] text-slate-300 pt-1 border-t border-white/10">
                    {items.length} รายการพัสดุ · {po.payment_type ? PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label?.split(' ')[0] : 'เครดิตเทอม'}
                  </div>
                  <div className="text-[10px] text-amber-200/80 italic">
                    ({thaiBahtText(grandTotalVal)})
                  </div>
                </div>
              </div>
            </div>

            {/* 1.5 แถบวงจรจัดซื้อ 3 ขั้นตอน & คำแนะนำขั้นตอนต่อไป (Credit Term / 3-Way Matching Workflow Stepper) */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔄</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    ลำดับขั้นตอนวงจรจัดซื้อ (Procurement Lifecycle: รับของก่อนจ่ายเงิน)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  เงื่อนไข: {po.payment_type ? PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label : 'เครดิตเทอม (รับของก่อนชำระเงิน)'}
                </span>
              </div>

              {/* 3 ขั้นตอนหลัก */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* ขั้นที่ 1: ออกใบสั่งซื้อ */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-black">
                    ✓
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold text-emerald-950 dark:text-emerald-300">1. ออกใบสั่งซื้อ (PO)</div>
                    <div className="text-[11px] text-emerald-800 dark:text-emerald-400 font-mono">
                      {formatThaiDate(po.order_date)}
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">อนุมัติคำสั่งซื้อเรียบร้อย</div>
                  </div>
                </div>

                {/* ขั้นที่ 2: ตรวจรับสินค้าเข้าคลัง */}
                <div className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                  isFullyReceived
                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : po.status === 'partial'
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-sky-300 dark:border-sky-700 bg-sky-50/50 dark:bg-sky-950/20'
                }`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                    isFullyReceived
                      ? 'bg-emerald-600 text-white'
                      : 'bg-sky-600 text-white animate-pulse'
                  }`}>
                    {isFullyReceived ? '✓' : '2'}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>2. ตรวจรับสินค้า (GR/RI)</span>
                    </div>
                    <div className="text-[11px] font-semibold">
                      {isFullyReceived ? (
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold">✅ ตรวจรับเข้าสโตร์ครบแล้ว</span>
                      ) : po.status === 'partial' ? (
                        <span className="text-amber-700 dark:text-amber-300 font-bold">⚡ ทยอยรับเข้าบางส่วนแล้ว</span>
                      ) : (
                        <span className="text-sky-700 dark:text-sky-300 font-bold">🚚 รอนำส่งสินค้าเข้าสโตร์</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {isFullyReceived ? 'พัสดุเข้าคลังพร้อมใช้งาน' : 'สโตร์ตรวจนับของก่อนตั้งเบิก'}
                    </div>
                  </div>
                </div>

                {/* ขั้นที่ 3: จ่ายชำระเงิน */}
                <div className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                  isPaidInFull
                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : isFullyReceived
                    ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 opacity-70'
                }`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                    isPaidInFull
                      ? 'bg-emerald-600 text-white'
                      : isFullyReceived
                      ? 'bg-amber-500 text-slate-950 font-black animate-bounce'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {isPaidInFull ? '✓' : '3'}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>3. จ่ายชำระเงิน (PAY)</span>
                    </div>
                    <div className="text-[11px] font-semibold">
                      {isPaidInFull ? (
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold">✅ ชำระเงินครบถ้วนแล้ว</span>
                      ) : isFullyReceived ? (
                        <span className="text-amber-800 dark:text-amber-300 font-black">⏳ รอฝ่ายบัญชีจ่ายเงิน</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">รอรับของให้เสร็จก่อน</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {isPaidInFull ? 'ตัดจ่ายสมุดรายวันเสร็จสิ้น' : isFullyReceived ? 'กดปุ่มจ่ายชำระเงินด้านบน' : 'ตามเงื่อนไขเครดิตเทอม'}
                    </div>
                  </div>
                </div>
              </div>

              {/* กล่องสรุปสถานะปัจจุบัน และสิ่งที่ต้องทำต่อไป (Current Status & Next Step Guidance Box) */}
              <div className={`rounded-xl p-4 border text-xs space-y-1.5 ${
                po.status === 'cancelled'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  : isFullyReceived && isPaidInFull
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                  : isFullyReceived && !isPaidInFull
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200'
                  : 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-950 dark:text-sky-200'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-base">
                      {po.status === 'cancelled' ? '❌' : isFullyReceived && isPaidInFull ? '🎉' : isFullyReceived ? '📦' : '🚚'}
                    </span>
                    <span>
                      {po.status === 'cancelled'
                        ? 'สถานะปัจจุบัน: ยกเลิกใบสั่งซื้อแล้ว'
                        : isFullyReceived && isPaidInFull
                        ? 'สถานะปัจจุบัน: ปิดวงจรจัดซื้อสมบูรณ์ 100% (รับของครบ & จ่ายเงินเรียบร้อย)'
                        : isFullyReceived
                        ? 'สถานะปัจจุบัน: ตรวจรับสินค้าเข้าคลังครบแล้ว (รอดำเนินการจ่ายเงิน)'
                        : 'สถานะปัจจุบัน: สั่งซื้อแล้ว รอนำส่งสินค้าเข้าสโตร์ (รับของก่อนจ่ายเงิน)'}
                    </span>
                  </div>
                  
                  {/* Shortcut Action Button inside banner */}
                  {isFullyReceived && !isPaidInFull && po.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="shrink-0 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg shadow-xs cursor-pointer text-xs flex items-center gap-1"
                    >
                      <span>💸</span>
                      <span>จ่ายเงินตอนนี้</span>
                    </button>
                  )}
                </div>

                <div className="text-xs opacity-90 pl-6 leading-relaxed">
                  {po.status === 'cancelled' ? (
                    'ใบสั่งซื้อนี้ถูกยกเลิกแล้ว ข้อมูลและประวัติการยกเลิกถูกจัดเก็บไว้เป็นหลักฐาน'
                  ) : isFullyReceived && isPaidInFull ? (
                    'สินค้าถูกตรวจรับเข้าสโตร์และบันทึกสต็อกเรียบร้อยแล้ว ยอดชำระเงินถูกบันทึกตัดจ่ายทางบัญชีสมบูรณ์ครบถ้วน'
                  ) : isFullyReceived ? (
                    <span>
                      <b>การจัดการขั้นตอนถัดไป:</b> สโตร์ตรวจรับของเข้าคลังเรียบร้อยแล้ว ส่งเอกสารใบกำกับภาษี/ใบส่งสินค้าให้ฝ่ายบัญชี จากนั้นกดปุ่ม <b>"จ่ายชำระเงิน (PAY)"</b> ด้านบน เพื่อตัดจ่ายเงินและปิดรอบบิล
                    </span>
                  ) : (
                    <span>
                      <b>การจัดการขั้นตอนถัดไป:</b> ติดตามผู้ขายนำส่งสินค้าเข้าหน้างานหรือสโตร์หลัก เมื่อสินค้ามาถึงให้สโตร์กด <b>"ตรวจรับสินค้า"</b> ด้านล่างก่อน หลังจากตรวจรับของครบแล้วจึงเข้าสู่ขั้นตอนจ่ายชำระเงิน
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Bento Grid: 4 Interactive Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: ผู้ขายและคู่ค้า (Vendor Card) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3 hover:border-amber-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 text-base font-bold">
                      🏢
                    </span>
                    <span className="font-bold text-xs text-slate-800">ผู้ขาย / ร้านค้า</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">VEND</span>
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900 truncate" title={po.custom_vendor_name || po.vendors?.vendor_name}>
                    {po.custom_vendor_name || po.vendors?.vendor_name || 'ไม่ระบุชื่อร้านค้า'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {po.vendors?.address || 'ไม่ได้ระบุที่อยู่ผู้ขาย'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>เลขผู้เสียภาษี:</span>
                    <b className="font-mono text-slate-900">{po.vendors?.tax_id || '-'}</b>
                  </div>
                  {po.vendors?.phone && (
                    <div className="flex justify-between items-center text-sky-700">
                      <span>โทรศัพท์:</span>
                      <a href={`tel:${po.vendors.phone}`} className="font-bold hover:underline">
                        📞 {po.vendors.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: โครงการ & หน้างานติดตั้ง (Project & Site) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3 hover:border-sky-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-700 text-base font-bold">
                      📍
                    </span>
                    <span className="font-bold text-xs text-slate-800">หน้างาน / โครงการ</span>
                  </div>
                  <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full">
                    SITE
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">โครงการติดตั้ง:</div>
                  <div className="font-black text-sm text-slate-900 truncate" title={po.custom_project_name || po.projects?.project_name}>
                    {po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท')}
                  </div>
                  {po.customer_name && (
                    <div className="text-xs text-sky-800 font-semibold mt-0.5">
                      👤 ลูกค้า: {po.customer_name}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="text-[11px] text-slate-400">สถานที่ส่งมอบ:</div>
                  <div className="font-medium text-slate-800 truncate" title={po.delivery_address || 'สโตร์หลัก'}>
                    {po.delivery_address || 'สโตร์หลัก / สำนักงาน'}
                  </div>
                </div>
              </div>

              {/* Card 3: การเงิน & ใบกำกับภาษี (Financial & Tax) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3 hover:border-emerald-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 text-base font-bold">
                      💳
                    </span>
                    <span className="font-bold text-xs text-slate-800">การเงิน & ภาษี</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                    FINANCE
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">ใบกำกับภาษีผู้ขาย:</div>
                  <div className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-0.5">
                    {po.vendor_tax_invoice_no || 'ยังไม่ระบุ'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>เงื่อนไขชำระ:</span>
                    <b className="text-slate-900">{PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label?.split(' ')[0] || 'เครดิตเทอม'}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>ช่องทางเบิก:</span>
                    <b className="text-slate-900">{po.payment_channel_requested === 'cheque' ? 'เช็ค' : po.payment_channel_requested === 'cash' ? 'เงินสด' : 'โอนเงิน'}</b>
                  </div>
                </div>
              </div>

              {/* Card 4: การขนส่ง & ตรวจรับ (Logistics & GRN) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3 hover:border-purple-400/50 transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-700 text-base font-bold">
                      🚚
                    </span>
                    <span className="font-bold text-xs text-slate-800">กำหนดส่ง & รับของ</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full">
                    LOGISTICS
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">วันกำหนดส่ง (Due Date):</div>
                  <div className="font-bold text-xs text-slate-900">
                    {po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date, true) : 'ตามตกลง'}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>การตรวจรับเข้าคลัง:</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isFullyReceived
                        ? 'bg-emerald-100 text-emerald-800'
                        : grns.length > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
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
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white font-bold text-base shadow-xs">
                    📄
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
                    {po.quotation_url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) || po.quotation_url.startsWith('data:image') ? (
                      <div
                        onClick={() => setPreviewQuotationModal(po.quotation_url)}
                        className="relative h-14 w-20 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer group bg-slate-100"
                        title="คลิกเพื่อดูรูปขนาดเต็ม"
                      >
                        <img
                          src={po.quotation_url}
                          alt="Vendor Quotation"
                          className="h-full w-full object-cover group-hover:scale-110 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition">
                          <Eye className="h-4 w-4 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-700 dark:text-sky-300 text-2xl font-bold">
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
                          onClick={() => setPreviewQuotationModal(po.quotation_url)}
                          className="text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>ดูรูปขนาดใหญ่</span>
                        </button>
                        <span className="text-slate-300">|</span>
                        <a
                          href={po.quotation_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>เปิดลิงก์ไฟล์</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sm:col-span-2 text-xs text-slate-400 dark:text-slate-500 italic bg-white/50 dark:bg-slate-800/40 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <span>💡 ยังไม่ได้แนบไฟล์รูปใบเสนอราคา สามารถคลิกปุ่ม "+ แนบรูปใบเสนอราคา" เพื่ออัปโหลดเอกสารต้นฉบับได้</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Section: รายการพัสดุและแคตตาล็อกวัสดุ (Thai Watsadu Style Product Showcase) */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black text-xl shadow-sm">
                    📦
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      รายการพัสดุและอุปกรณ์สั่งซื้อ ({items.length} รายการ)
                    </h2>
                    <p className="text-xs text-slate-500">
                      แสดงรายการสินค้า ราคาต่อหน่วย ยอดรวม และประวัติการรับเข้าสโตร์
                    </p>
                  </div>
                </div>

                {/* View Switcher: Product Cards vs Compact Table */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setItemsLayout('cards')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      itemsLayout === 'cards'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="h-3.5 w-3.5" />
                    <span>การ์ดสินค้า (Catalog Cards)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemsLayout('table')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      itemsLayout === 'table'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
                            <span>📊 ดูประวัติโครงการที่เคยใช้</span>
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
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                              isFullyReceivedItem
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : Number(i.qty_received) > 0
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              <span>{isFullyReceivedItem ? '✓ รับครบแล้ว' : Number(i.qty_received) > 0 ? '⚡ รับแล้วบางส่วน' : '⏳ รอรับของ'}</span>
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
                                📊 ดูประวัติโครงการที่เคยใช้
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
                              <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                                isFullyReceivedItem
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
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-50 to-emerald-50 p-4 rounded-2xl border border-sky-200">
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span>📥</span> ฝ่ายสโตร์และพัสดุ: ตรวจรับของเข้าสโตร์หลัก
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      ระบบจะสร้างใบตรวจรับของ (RI), เพิ่มสต็อกสโตร์ (`inventory_items`) และลงบัญชีสมุดรายวันอัตโนมัติ
                    </p>
                  </div>
                  <button
                    className="btn-primary !bg-sky-700 hover:!bg-sky-800 shadow-sm font-bold text-xs !py-2.5 !px-5 cursor-pointer"
                    onClick={receive}
                    disabled={busy || !anyQty}
                  >
                    {busy ? 'กำลังบันทึก...' : '📥 ยืนยันรับของเข้าสโตร์ (ออก RI)'}
                  </button>
                </div>
              )}
            </div>

            {/* 4. Tab Navigation for Connected Features */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('items')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    activeTab === 'items' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>💰</span>
                  <span>สรุปยอดเงินและเงื่อนไข</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('receiving')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    activeTab === 'receiving' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>📥</span>
                  <span>ประวัติรับของเข้าสโตร์ ({grns.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    activeTab === 'payments' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>💸</span>
                  <span>ประวัติจ่ายชำระเงิน ({payments.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('lifecycle')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    activeTab === 'lifecycle' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>🔗</span>
                  <span>วงจรเอกสาร (PR ➔ PO ➔ RI ➔ PV)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    activeTab === 'audit' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>🛡️</span>
                  <span>บันทึกระบบ (Audit)</span>
                </button>
              </div>

              {/* Sub-tab 1: สรุปยอดเงินและเงื่อนไข */}
              {activeTab === 'items' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs">
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                      <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                        💳 เงื่อนไขและกำหนดการชำระเงิน
                      </div>
                      <div className="space-y-1 text-slate-700">
                        <div>รูปแบบ: <b>{PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label || 'เครดิตเทอม'}</b></div>
                        <div>ช่องทาง: <b>{po.payment_channel_requested === 'cheque' ? 'เช็ค' : po.payment_channel_requested === 'cash' ? 'เงินสด' : 'โอนเงิน'}</b></div>
                        {po.deposit_type === 'deposit' && (
                          <div className="text-amber-800 font-semibold">
                            มัดจำ {po.deposit_percent}% = <b>{baht(po.deposit_amount)} บาท</b> (คงเหลือ: {baht(po.remaining_amount)} บาท)
                          </div>
                        )}
                      </div>
                    </div>

                    {po.notes && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
                        <div className="font-bold text-slate-900">📝 หมายเหตุเพิ่มเติม</div>
                        <p className="text-slate-700 whitespace-pre-wrap">{po.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                    <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                      <span>มูลค่าสินค้ารวม:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{baht(totalAmountVal)} บาท</span>
                    </div>

                    {Number(po.vat_amount) > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                        <span>ภาษีมูลค่าเพิ่ม 7% (VAT):</span>
                        <span className="font-mono font-semibold text-slate-800">{baht(po.vat_amount)} บาท</span>
                      </div>
                    )}

                    {Number(po.wht_rate) > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 text-purple-800">
                        <span>หักภาษี ณ ที่จ่าย {po.wht_rate}%:</span>
                        <span className="font-mono font-bold text-purple-900">-{baht(po.wht_amount)} บาท</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-2.5 px-3 bg-white rounded-xl border border-slate-200 shadow-xs">
                      <span className="font-bold text-slate-900 text-sm">ยอดเงินสุทธิทั้งสิ้น:</span>
                      <span className="font-mono font-black text-xl text-emerald-800">{baht(grandTotalVal)} บาท</span>
                    </div>

                    <div className="text-[11px] text-slate-500 text-right italic font-medium">
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
                          <span className="font-mono font-bold text-sm text-sky-800">📄 {g.grn_no}</span>
                          <span className="text-slate-600">วันที่รับเข้าสโตร์: <b>{g.received_date}</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-300">
                            ✓ ลงบัญชีสมุดรายวันแล้ว
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
                  {payments.length > 0 ? (
                    payments.map((p) => (
                      <div key={p.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-emerald-800">
                              {p.transaction_no || `PV-${p.id.slice(0, 8)}`}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800">
                              {p.payment_stage === 'deposit' ? 'จ่ายมัดจำ' : 'จ่ายเต็มจำนวน/งวดคงเหลือ'}
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
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200">
                      {isPaidInFull ? 'เอกสารนี้ชำระเงินครบถ้วนแล้ว' : 'ยังไม่มีประวัติการจ่ายเงิน กรุณากดปุ่ม "จ่ายชำระเงิน (PAY)" ด้านบน'}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 4: วงจรเอกสาร */}
              {activeTab === 'lifecycle' && (
                <div className="space-y-3 text-xs">
                  {pr ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="font-bold text-slate-900">📋 ใบขอซื้อต้นทาง: {pr.pr_no}</div>
                      <div className="text-slate-600">ผู้ขอซื้อ: {pr.requester_name || '-'} · วันที่: {pr.request_date}</div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
                      ⚡ สั่งซื้อตรง (Direct PO) ไม่ผ่านใบขอซื้อ PR
                    </div>
                  )}
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

            <div className="flex justify-between items-start pt-2 text-xs">
              <div className="text-slate-600">
                <div>เงื่อนไข: {PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label || 'เครดิตเทอม'}</div>
                <div className="italic mt-1">({thaiBahtText(grandTotalVal)})</div>
              </div>
              <div className="w-64 space-y-1">
                <div className="flex justify-between">
                  <span>รวมเป็นเงิน:</span>
                  <span className="font-mono font-bold">{baht(totalAmountVal)} บาท</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-950 border-t border-slate-900 pt-1">
                  <span>ยอดสุทธิทั้งสิ้น:</span>
                  <span className="font-mono">{baht(grandTotalVal)} บาท</span>
                </div>
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
            totalAmount={grandTotalVal}
            alreadyPaid={po.deposit_paid_amount || 0}
            depositAmount={po.deposit_amount || 0}
            remainingAmount={po.remaining_amount || 0}
            hasDeposit={po.deposit_type === 'deposit'}
            paymentStatus={po.payment_status || 'รอชำระเงิน'}
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
                  <span className="text-base">📄</span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    รูปใบเสนอราคาจากผู้ขาย {po.quotation_no ? `(เลขที่ ${po.quotation_no})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewQuotationModal}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>เปิดภาพต้นฉบับ</span>
                  </a>
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
                <img
                  src={previewQuotationModal}
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
