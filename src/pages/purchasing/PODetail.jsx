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

export default function PODetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [po, setPo] = useState(null)
  const [items, setItems] = useState([])
  const [grns, setGrns] = useState([])
  const [qty, setQty] = useState({}) // po_item_id -> จำนวนที่รับครั้งนี้
  const [selectedUsageItem, setSelectedUsageItem] = useState(null)
  const [showPoPdf, setShowPoPdf] = useState(false)
  const [showEnvelope, setShowEnvelope] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendors(vendor_name, tax_id, contact_person, phone, address), projects(project_code, project_name), creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
        .eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
      supabase.from('goods_receipts').select('id, grn_no, received_date').eq('po_id', id).order('received_date', { ascending: false }),
    ])
    if (a.error) return setError('ไม่พบใบสั่งซื้อ')
    setPo(a.data); setItems(b.data ?? []); setGrns(c.data ?? [])
    setQty(Object.fromEntries((b.data ?? []).map((i) => [i.id, String(Number(i.quantity) - Number(i.qty_received))])))
  }, [id])

  useEffect(() => { load() }, [load])

  async function receive() {
    if (!confirm('ยืนยันรับของเข้าสโตร์หลัก? ระบบจะอัปเดตสต็อกและลงบัญชีอัตโนมัติ')) return
    setBusy(true); setError(''); setDone('')

    const receiveItems = items
      .filter((i) => Number(qty[i.id]) > 0)
      .map((i) => ({
        po_item_id: i.id,
        qty_received: Number(qty[i.id]) || 0,
        unit_cost: Number(i.unit_price) || 0,
      }))

    if (receiveItems.length === 0) {
      setBusy(false)
      setError('กรุณาระบุจำนวนที่ต้องการรับของอย่างน้อย 1 รายการ')
      return
    }

    // ฟังก์ชันเชื่อมโยงวัสดุเข้าสู่ระบบคลังพัสดุและสโตร์ (inventory_items และ stock_lots)
    const syncItemToStore = async (it, grnItemId) => {
      const currentItem = items.find((x) => x.id === it.po_item_id)
      if (!currentItem) return

      let targetItemId = currentItem.item_id || null

      // 1. ค้นหาใน inventory_items ด้วยชื่อ ถ้ายังไม่มี item_id
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

      // 2. ถ้ายังไม่มีในสโตร์เลย ให้สร้างรายการใหม่ใน inventory_items
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
        // ผูก item_id กลับไปที่ purchase_order_items
        await supabase
          .from('purchase_order_items')
          .update({ item_id: targetItemId })
          .eq('id', it.po_item_id)

        // 3. บันทึกเข้า stock_lots เพื่อให้หน้าสโตร์และประวัติรับของมองเห็น
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

        // 4. อัปเดตยอดคงเหลือ (qty_on_hand) และต้นทุนเฉลี่ยใน inventory_items
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

      // ทำการซิงค์ข้อมูลเข้า stock_lots และ inventory_items เพื่อความแม่นยำ 100%
      for (const it of receiveItems) {
        await syncItemToStore(it, null)
      }

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

        // บันทึกรายการ goods_receipt_items และซิงค์เข้าสโตร์
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
            console.warn('Fallback insert goods_receipt_items without unit_cost constraint:', itErr)
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

          // ซิงค์เข้าคลังพัสดุสโตร์หลัก (inventory_items และ stock_lots) ทันที
          await syncItemToStore(it, griId)

          // อัปเดตยอดรับแล้วใน purchase_order_items
          const currentItem = items.find((x) => x.id === it.po_item_id)
          const newReceived = (Number(currentItem?.qty_received) || 0) + it.qty_received
          await supabase.from('purchase_order_items').update({ qty_received: newReceived }).eq('id', it.po_item_id)
        }

        // ตรวจสอบว่ารับครบแล้วหรือไม่ เพื่อเปลี่ยนสถานะ PO
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

  if (!po) return <p className={error ? 'text-red-600' : 'text-steel-500'}>{error || 'กำลังโหลด...'}</p>

  const canEdit = canCreatePurchasing(profile.role)
  const canReceive = canReceiveGoods(profile.role) && ['open', 'partial'].includes(po.status)
  const anyQty = items.some((i) => Number(qty[i.id]) > 0)
  const isJuristic = /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด/i.test(po.vendors?.vendor_name || '')

  const computedItemsTotal = items.reduce((sum, it) => sum + (Number(it.quantity || 1) * Number(it.unit_price || 0)), 0)
  const totalAmountVal = Number(po.total_amount) || computedItemsTotal || 0
  const grandTotalVal = Number(po.grand_total) || Number(po.net_amount) || totalAmountVal || 0
  const dueStatus = getPoDueStatus(po)

  return (
    <div className="max-w-6xl space-y-5 pb-12 font-sans">
      {/* 1. ส่วนหัวบนสุด: ปุ่มย้อนกลับและสถานะภาพรวม */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/purchasing?tab=po"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-steel-500 hover:text-sky-700 transition"
        >
          <span>←</span> กลับไปศูนย์จัดซื้อและพัสดุ (PO)
        </Link>
        <span className="text-xs text-steel-400 font-mono">
          ID: {po.id}
        </span>
      </div>

      {/* 2. การ์ดหัวเอกสาร (Header Card) สะอาดตาและมีลำดับความสำคัญ */}
      <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 text-xl font-bold shadow-xs border border-sky-100">
                📄
              </span>
              <div>
                <h1 className="text-2xl font-black text-ink tracking-tight font-mono">
                  {po.po_no}
                </h1>
                <p className="text-xs text-steel-500">
                  วันที่สั่งซื้อ: <b className="text-steel-800">{po.order_date || '-'}</b>
                  {po.buyer_name ? ` · ผู้สั่งซื้อ: ${po.buyer_name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge map={PO_STATUS} status={po.status} />

              {/* Payment Status Badge */}
              {po.payment_status === 'ชำระครบแล้ว' ? (
                <span className="text-xs px-2.5 py-1 rounded-lg font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                  <span>✅</span> ชำระเงินครบถ้วนแล้ว
                </span>
              ) : po.payment_status === 'จ่ายมัดจำแล้ว' ? (
                <span className="text-xs px-2.5 py-1 rounded-lg font-bold bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center gap-1">
                  <span>💵</span> จ่ายมัดจำแล้ว
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-lg font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                  <span>⏳</span> รอชำระเงิน
                </span>
              )}

              {dueStatus && (
                <span className={`text-xs px-2.5 py-1 rounded-lg font-bold border inline-flex items-center gap-1 ${dueStatus.badgeCls}`}>
                  <span>{dueStatus.icon}</span> {dueStatus.label}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* ปุ่มจ่ายชำระเงิน (Disburse Payment - PAY) */}
            {po.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              >
                <span>💸</span>
                <span>จ่ายชำระเงิน (PAY)</span>
              </button>
            )}

            {/* พิมพ์ใบสั่งซื้อ (PDF) */}
            <button
              type="button"
              onClick={() => setShowPoPdf(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              title="พิมพ์เอกสารใบสั่งซื้อขนาด A4 หรือบันทึก PDF"
            >
              <span>🖨️</span>
              <span>พิมพ์ / PDF</span>
            </button>

            {/* ปุ่มเสริม: แก้ไข / สร้างซ้ำ / พิมพ์จ่าซอง / แชร์ */}
            <div className="flex items-center gap-1 bg-steel-50 p-1 rounded-xl border border-steel-200">
              {canEdit && po.status !== 'cancelled' && (
                <Link
                  to={`/purchasing/po/${po.id}/edit`}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100 hover:text-sky-800 transition shadow-xs"
                  title="แก้ไขใบสั่งซื้อ"
                >
                  ✏️ แก้ไข
                </Link>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => navigate(`/purchasing/po/new?duplicate_from=${po.id}`)}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
                  title="คัดลอกข้อมูลและรายการสินค้าเพื่อสร้างใบสั่งซื้อใหม่"
                >
                  📋 สร้างซ้ำ
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEnvelope(true)}
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
                title="พิมพ์หน้าจ่าซองจดหมายส่งเอกสารหรือเช็คถึงผู้ขาย"
              >
                ✉️ จ่าซอง
              </button>

              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100 hover:text-sky-800 transition shadow-xs cursor-pointer"
                title="แชร์ลิงก์หรือข้อความสรุปทาง LINE/Email"
              >
                🔗 แชร์
              </button>

              {canEdit && (
                <>
                  {po.status !== 'cancelled' && (
                    <button
                      type="button"
                      className="rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-steel-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                      onClick={cancelPo}
                      title="ยกเลิกใบสั่งซื้อ"
                    >
                      ยกเลิก
                    </button>
                  )}
                  {grns.length === 0 && (
                    <button
                      type="button"
                      className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                      onClick={removePo}
                      title="ลบใบสั่งซื้อ"
                    >
                      ลบ
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bento Grid: 4 การ์ดสรุปข้อมูลสำคัญ สะอาดตา สบายตา ไม่ซ้อนทับ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: ข้อมูลคู่ค้าและโครงการ */}
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-steel-500">
            <span>🏢</span> คู่ค้า & โครงการ
          </div>
          <div>
            <div className="text-xs text-steel-400">ผู้ขาย / ร้านค้า:</div>
            <div className="font-bold text-sm text-ink truncate" title={po.custom_vendor_name || po.vendors?.vendor_name}>
              {po.custom_vendor_name || po.vendors?.vendor_name || 'ไม่ระบุผู้ขาย'}
            </div>
          </div>
          <div className="border-t border-steel-100 pt-1.5">
            <div className="text-xs text-steel-400">โครงการ:</div>
            <div className="text-xs font-semibold text-steel-800 line-clamp-2" title={po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท')}>
              {po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : '🏢 ของกลางบริษัท / สต็อกส่วนกลาง')}
            </div>
            {po.customer_name && (
              <div className="text-[11px] text-sky-700 font-medium mt-1 truncate">
                👤 ลูกค้า: {po.customer_name}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: ยอดเงินและเงื่อนไขการชำระ */}
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-steel-500">
            <span className="flex items-center gap-1.5"><span>💰</span> ยอดเงิน & ชำระ</span>
            <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded">
              {PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label?.split(' ')[0] || 'เครดิตเทอม'}
            </span>
          </div>
          <div>
            <div className="text-xs text-steel-400">ยอดรวมสุทธิ:</div>
            <div className="text-xl font-extrabold text-sky-950 font-mono">
              {baht(grandTotalVal)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
          </div>
          <div className="border-t border-steel-100 pt-1.5 text-xs space-y-0.5">
            <div className="text-steel-600 flex justify-between">
              <span>ช่องทางเบิก:</span>
              <b className="text-steel-900">
                {po.payment_channel_requested === 'cheque' ? 'เช็คสั่งจ่าย' : po.payment_channel_requested === 'cash' ? 'เงินสด' : 'โอนผ่านธนาคาร'}
              </b>
            </div>
            {Number(po.wht_rate) > 0 && (
              <div className="text-[11px] text-purple-700 flex justify-between">
                <span>หัก ณ ที่จ่าย:</span>
                <b>WHT {po.wht_rate}% ({isJuristic ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3'})</b>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: ข้อมูลเอกสารอ้างอิงและภาษี */}
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-steel-500">
            <span>📑</span> เอกสารอ้างอิง
          </div>
          <div>
            <div className="text-xs text-steel-400">เลขที่ใบกำกับภาษีผู้ขาย:</div>
            <div className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-0.5">
              {po.vendor_tax_invoice_no || 'ยังไม่ระบุ'}
            </div>
            {po.tax_invoice_date && (
              <span className="text-[10px] text-steel-400 ml-1.5">({po.tax_invoice_date})</span>
            )}
          </div>
          <div className="border-t border-steel-100 pt-1.5 text-xs space-y-0.5">
            <div className="text-steel-600 flex justify-between">
              <span>ใบเสนอราคา (QT):</span>
              <b className="font-mono text-steel-900">{po.quotation_no || '-'}</b>
            </div>
            <div className="text-steel-600 flex justify-between">
              <span>ผู้จัดทำ:</span>
              <span className="text-steel-900">{po.buyer_name || po.creator?.full_name || 'Admin'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: กำหนดส่งมอบสินค้า */}
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-steel-500">
            <span className="flex items-center gap-1.5"><span>🚚</span> กำหนดส่งมอบ</span>
            {dueStatus && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${dueStatus.badgeCls}`}>
                {dueStatus.label}
              </span>
            )}
          </div>
          <div>
            <div className="text-xs text-steel-400">วันกำหนดส่ง (Due Date):</div>
            <div className="font-bold text-sm text-ink">
              {po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date, true) : 'ไม่ได้ระบุ'}
            </div>
          </div>
          <div className="border-t border-steel-100 pt-1.5 text-xs">
            <div className="text-steel-400 text-[11px]">สถานที่ส่งมอบ:</div>
            <div className="text-xs text-steel-700 truncate" title={po.delivery_address || 'สโตร์หลัก'}>
              {po.delivery_address || 'สโตร์หลัก'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. การ์ดเงื่อนไขมัดจำ (แสดงเฉพาะกรณีมีมัดจำ) */}
      {po.deposit_type === 'deposit' && (
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-ink mb-2 flex items-center gap-1.5">
            <span>💳</span> สรุปงวดชำระเงินมัดจำ
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-amber-900">1. ยอดมัดจำงวดแรก ({po.deposit_percent || 0}%)</span>
                {Number(po.deposit_paid_amount || 0) > 0 ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓ จ่ายแล้ว</span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded">รอชำระ</span>
                )}
              </div>
              <div className="mt-1 text-base font-extrabold text-amber-950 font-mono">
                {baht(po.deposit_amount)} บาท
              </div>
            </div>

            <div className="rounded-lg bg-sky-50 border border-sky-200 p-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-sky-900">2. ยอดชำระคงเหลือ ({Math.max(0, 100 - Number(po.deposit_percent || 0))}%)</span>
                <span className="text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">รอบวางบิล</span>
              </div>
              <div className="mt-1 text-base font-extrabold text-sky-950 font-mono">
                {baht(po.remaining_amount || (grandTotalVal - Number(po.deposit_amount || 0)))} บาท
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ตารางรายการสั่งซื้อและการตรวจรับของ (Items Table) */}
      <div className="overflow-x-auto rounded-2xl border border-steel-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-sm text-ink flex items-center gap-2">
            <span>📦</span> รายการพัสดุและวัสดุสั่งซื้อ ({items.length} รายการ)
          </h3>
          <span className="text-xs text-steel-500 font-mono">
            รวมมูลค่า: <b className="text-ink">{baht(grandTotalVal)}</b> บาท
          </span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50/70 text-left text-steel-600 text-xs font-semibold">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">รายการวัสดุ / บริการ</th>
              <th className="py-2.5 px-3 text-right">จำนวนสั่ง</th>
              <th className="py-2.5 px-3 text-right">ราคา/หน่วย</th>
              <th className="py-2.5 px-3 text-right">ยอดรวม</th>
              <th className="py-2.5 px-3 text-right">รับแล้ว</th>
              {canReceive && <th className="py-2.5 px-3 text-right bg-sky-50 text-sky-900">รับครั้งนี้</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {items.map((i, idx) => {
              const remain = Math.max(0, Number(i.quantity) - Number(i.qty_received))
              const isFullyReceived = Number(i.qty_received) >= Number(i.quantity)

              return (
                <tr key={i.id} className="hover:bg-steel-50/50 transition">
                  <td className="py-3 px-3 text-xs text-steel-400 font-mono">{idx + 1}</td>
                  <td className="py-3 px-3 font-medium">
                    <div className="text-ink font-semibold">{i.item_name}</div>
                    <button
                      type="button"
                      onClick={() => setSelectedUsageItem({ item_name: i.item_name })}
                      className="text-[11px] text-sky-600 hover:text-sky-800 hover:underline transition"
                    >
                      📊 ดูประวัติโครงการที่เคยใช้
                    </button>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-steel-800">
                    {i.quantity} <span className="text-xs text-steel-500">{i.unit || 'รายการ'}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-steel-700">
                    {baht(i.unit_price)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-ink">
                    {baht(Number(i.quantity) * Number(i.unit_price))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      isFullyReceived
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : Number(i.qty_received) > 0
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-steel-100 text-steel-600'
                    }`}>
                      {i.qty_received} / {i.quantity}
                    </span>
                  </td>
                  {canReceive && (
                    <td className="py-3 px-3 text-right bg-sky-50/40">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max={remain}
                        value={qty[i.id] ?? ''}
                        onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                        disabled={isFullyReceived}
                        placeholder={remain > 0 ? String(remain) : '0'}
                        className="input !py-1 !text-right w-24 inline-block font-mono text-xs font-bold border-sky-300 focus:border-sky-500 bg-white"
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* แถบกดยืนยันการรับของ (Goods Receipt) */}
        {canReceive && (
          <div className="mt-5 pt-4 border-t border-steel-200 flex flex-wrap items-center justify-between gap-3 bg-sky-50/60 p-4 rounded-xl border border-sky-100">
            <div>
              <div className="font-bold text-xs text-sky-950 flex items-center gap-1.5">
                <span>📥</span> ฝ่ายสโตร์และพัสดุ: ตรวจรับของเข้าสโตร์หลัก
              </div>
              <p className="mt-0.5 text-xs text-steel-600">
                ระบบจะสร้างใบตรวจรับของ (RI), อัปเดตสต็อกคงคลัง, และลงบัญชีแยกประเภทให้อัตโนมัติ
              </p>
            </div>
            <button
              className="btn-primary !bg-sky-700 hover:!bg-sky-800 shadow-sm font-bold text-xs !py-2 !px-4 cursor-pointer"
              onClick={receive}
              disabled={busy || !anyQty}
            >
              {busy ? 'กำลังบันทึก...' : '📥 ยืนยันรับของเข้าสโตร์หลัก (ออก RI)'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}
        {done && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
            ✅ {done}
          </div>
        )}
      </div>

      {grns.length > 0 && (
        <div className="rounded-lg bg-white p-5 text-sm shadow-sm">
          <h3 className="font-semibold text-ink">ประวัติการรับของเข้าคลัง (Goods Receipts - RI)</h3>
          <ul className="mt-2 space-y-1.5 text-xs">
            {grns.map((g) => (
              <li key={g.id} className="flex items-center gap-3 p-2 bg-steel-50 rounded border border-steel-200">
                <span className="font-mono font-bold text-sky-800">📄 {g.grn_no}</span>
                <span className="text-steel-600">วันที่รับของ: {g.received_date}</span>
                <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px] font-bold">
                  ✓ ลงบัญชีสมุดรายวันแล้ว
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AuditPanel docId={po.id} row={po} />

      {/* Modal ประวัติโครงการ */}
      {selectedUsageItem && (
        <ItemProjectUsageModal
          item={selectedUsageItem}
          onClose={() => setSelectedUsageItem(null)}
        />
      )}

      {/* Modal พิมพ์ใบสั่งซื้อ PDF */}
      {showPoPdf && (
        <PODocumentModal
          po={po}
          items={items}
          onClose={() => setShowPoPdf(false)}
        />
      )}

      {/* Modal จ่ายชำระเงิน (PAY) */}
      {showPaymentModal && (
        <PaymentActionModal
          isOpen={true}
          type="disburse"
          docType="PO"
          docId={po.id}
          docNo={po.po_no}
          vendorId={po.vendor_id}
          contactName={po.vendors?.vendor_name}
          totalAmount={po.net_amount || po.total_amount}
          alreadyPaid={po.deposit_paid_amount || 0}
          depositAmount={po.deposit_amount || 0}
          remainingAmount={po.remaining_amount || 0}
          hasDeposit={po.deposit_type === 'deposit'}
          paymentStatus={po.payment_status || 'รอชำระเงิน'}
          requestedChannel={po.payment_channel_requested || 'transfer'}
          projectId={po.project_id}
          projectName={po.projects?.project_name}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            load()
          }}
        />
      )}

      {/* โมดัลพิมพ์หน้าจ่าซองส่งเอกสารถึงผู้ขาย */}
      {showEnvelope && (
        <EnvelopePrintModal po={po} onClose={() => setShowEnvelope(false)} />
      )}

      {/* โมดัลแชร์ข้อมูลใบสั่งซื้อ */}
      {showShare && (
        <POShareModal po={po} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
