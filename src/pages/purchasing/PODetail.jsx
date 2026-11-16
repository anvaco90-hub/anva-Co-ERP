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
import PaymentActionModal from '../../components/PaymentActionModal'
import { PAYMENT_TYPES } from './POForm'

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
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendors(vendor_name, tax_id), projects(project_code, project_name), creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
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
    const { error } = await supabase.rpc('confirm_goods_receipt', {
      p_po_id: id,
      p_items: items.map((i) => ({ po_item_id: i.id, qty_received: Number(qty[i.id]) || 0 })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDone('บันทึกรับของเรียบร้อย (RI ลงบัญชีเดบิตสินค้าคงเหลือ/เครดิตเจ้าหนี้อัตโนมัติ)'); load()
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

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/purchasing?tab=po" className="text-sm text-steel-500 underline">← กลับไปศูนย์จัดซื้อ</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{po.po_no}</h2>
          <div className="text-sm text-steel-600">
            {po.vendors?.vendor_name} · <b>{po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : '🏢 ของกลางบริษัท / สต็อกส่วนกลาง'}</b> · {po.order_date}
            {po.buyer_name ? ` · ผู้สั่งซื้อ: ${po.buyer_name}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-steel-500">
            <span>💳 ชำระ: <b>{PAYMENT_TYPES.find(p => p.value === po.payment_type)?.label || 'เครดิตเทอม 30 วัน'}</b></span>
            {po.quotation_no && <span>· 📄 ใบเสนอราคา: <b>{po.quotation_no}</b> {po.quotation_date ? `(${po.quotation_date})` : ''}</span>}
            {po.vendor_tax_invoice_no && (
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-bold">
                🧾 ใบกำกับภาษีผู้ขาย: {po.vendor_tax_invoice_no} ({po.tax_invoice_date || '-'})
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge map={PO_STATUS} status={po.status} />
            <b>ยอดรวม {baht(po.total_amount)} บาท</b>
            {Number(po.net_amount) > 0 && Number(po.net_amount) !== Number(po.total_amount) && (
              <span className="text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                (ยอดสุทธิหลังหักภาษี {baht(po.net_amount)} บาท)
              </span>
            )}
            {Number(po.wht_rate) > 0 && (
              <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-200">
                WHT {po.wht_rate}% ({isJuristic ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3'})
              </span>
            )}

            {/* Payment Status Badge */}
            {po.payment_status === 'ชำระครบแล้ว' ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span>✅</span> ชำระเงินครบถ้วนแล้ว
              </span>
            ) : po.payment_status === 'จ่ายมัดจำแล้ว' ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                <span>💵</span> จ่ายมัดจำแล้ว (รอจ่ายยอดคงเหลือ)
              </span>
            ) : (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <span>⏳</span> รอชำระเงิน (ส่งเรื่องไปยังฝ่ายบัญชีแล้ว)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ปุ่มจ่ายชำระเงิน (Disburse Payment - PAY) */}
          {po.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-800 transition"
            >
              <span>💸</span>
              <span>จ่ายชำระเงิน (PAY)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPoPdf(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <span>🖨️</span>
            <span>พิมพ์ใบสั่งซื้อ (PDF)</span>
          </button>

          {canEdit && (
            <>
              {po.status !== 'cancelled' && <Link to={`/purchasing/po/${po.id}/edit`} className="btn-ghost !py-1 text-xs">แก้ไข</Link>}
              {po.status !== 'cancelled' && <button className="btn-ghost !py-1 text-xs" onClick={cancelPo}>ยกเลิกใบสั่งซื้อ</button>}
              {grns.length === 0 && <button className="btn-ghost !py-1 text-xs text-red-700" onClick={removePo}>ลบ</button>}
            </>
          )}
        </div>
      </div>

      {/* การ์ดสรุปเงื่อนไขการชำระเงินและมัดจำ (Payment Terms & Deposit Breakdown) */}
      <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-800 font-bold text-xs">
              💳
            </span>
            <span className="font-bold text-xs text-ink">
              เงื่อนไขการชำระเงิน (Payment Terms):{' '}
              <span className="text-sky-800">
                {po.deposit_type === 'deposit' ? 'มีมัดจำล่วงหน้า (Deposit / Installment)' : 'ชำระเต็มจำนวน (Full Payment)'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-steel-500">ช่องทางที่ขอเบิกจ่าย:</span>
            <span className="font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
              {po.payment_channel_requested === 'cheque'
                ? '📝 เช็คสั่งจ่าย'
                : po.payment_channel_requested === 'cash'
                ? '💵 เงินสด'
                : '🏦 โอนผ่านธนาคาร'}
            </span>
          </div>
        </div>

        {po.deposit_type === 'deposit' ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-amber-900">1. ยอดชำระมัดจำงวดแรก ({po.deposit_percent || 0}%)</span>
                {Number(po.deposit_paid_amount || 0) > 0 ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    ✓ จ่ายแล้ว
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded">
                    รอชำระ
                  </span>
                )}
              </div>
              <div className="mt-1 text-base font-extrabold text-amber-950 font-mono">
                {baht(po.deposit_amount)} บาท
              </div>
              <div className="mt-1 text-[11px] text-amber-800">
                จ่ายมัดจำงวดแรกเพื่อเปิดใบสั่งผลิต / ล็อคคิวสินค้า
              </div>
            </div>

            <div className="rounded-lg bg-sky-50 border border-sky-200 p-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-sky-900">
                  2. ยอดชำระคงเหลือ ({Math.max(0, 100 - Number(po.deposit_percent || 0))}%)
                </span>
                <span className="text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                  รอบวางบิล
                </span>
              </div>
              <div className="mt-1 text-base font-extrabold text-sky-950 font-mono">
                {baht(po.remaining_amount || (Number(po.net_amount || po.total_amount) - Number(po.deposit_amount || 0)))} บาท
              </div>
              <div className="mt-1 text-[11px] text-sky-700">
                ชำระเมื่อส่งมอบสินค้าครบถ้วน หรือตามเครดิตเทอม
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between p-3 bg-sky-50/60 rounded-lg border border-sky-100 text-xs">
            <div>
              <span className="font-bold text-sky-950 block">ยอดสุทธิชำระเต็มจำนวน</span>
              <span className="text-steel-600 text-[11px]">ชำระตามรอบวางบิลและเครดิตเทอมของคู่ค้า</span>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-sky-900 font-mono">
                {baht(po.net_amount || po.total_amount)} บาท
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white p-5 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-steel-500 text-xs">
              <th className="py-2">รายการวัสดุ</th>
              <th className="text-right">จำนวน</th>
              <th className="text-right">ราคา/หน่วย</th>
              <th className="text-right">รับแล้ว</th>
              {canReceive && <th className="text-right">รับครั้งนี้</th>}
              <th className="text-right">ยอดรวม</th>
            </tr>
          </thead>
          <tbody className="divide-y">{items.map((i) => {
            const remain = Math.max(0, Number(i.quantity) - Number(i.qty_received))
            return (
              <tr key={i.id}>
                <td className="py-2.5 font-medium">
                  <div>{i.item_name}</div>
                  <button
                    type="button"
                    onClick={() => setSelectedUsageItem({ item_name: i.item_name })}
                    className="text-[11px] text-sky-600 hover:underline"
                  >
                    📊 ดูประวัติโครงการที่เคยใช้
                  </button>
                </td>
                <td className="text-right">{i.quantity} {i.unit}</td>
                <td className="text-right">{baht(i.unit_price)}</td>
                <td className="text-right font-medium">{i.qty_received}</td>
                {canReceive && (
                  <td className="text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max={remain}
                      value={qty[i.id] ?? ''}
                      onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                      className="input !py-1 !text-right w-24 inline-block font-mono text-xs font-bold"
                    />
                  </td>
                )}
                <td className="text-right font-semibold font-mono">{baht(Number(i.quantity) * Number(i.unit_price))}</td>
              </tr>
            )
          })}</tbody>
        </table>

        {canReceive && (
          <div className="mt-4 pt-4 border-t border-steel-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                className="btn-primary"
                onClick={receive}
                disabled={busy || !anyQty}
              >
                {busy ? 'กำลังบันทึก...' : '📥 ยืนยันรับของเข้าสโตร์หลัก (ออก RI)'}
              </button>
              <p className="mt-1 text-xs text-steel-500">
                ระบบลงบัญชีอัตโนมัติ: Dr.สินค้า/วัสดุคงเหลือ (1140-01) + Dr.ภาษีซื้อ / Cr.เจ้าหนี้การค้า (2110-01)
              </p>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {done && <p className="mt-3 text-sm text-green-700">{done}</p>}
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
    </div>
  )
}
