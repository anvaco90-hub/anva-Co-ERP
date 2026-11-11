import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PO_STATUS, canReceiveGoods } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'

export default function PODetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [po, setPo] = useState(null)
  const [items, setItems] = useState([])
  const [grns, setGrns] = useState([])
  const [qty, setQty] = useState({}) // po_item_id -> จำนวนที่รับครั้งนี้
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('purchase_orders').select('*, vendors(vendor_name), projects(project_code, project_name)').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
      supabase.from('goods_receipts').select('id, grn_no, received_date').eq('po_id', id).order('received_date', { ascending: false }),
    ])
    if (a.error) return setError('ไม่พบใบสั่งซื้อ')
    setPo(a.data); setItems(b.data ?? []); setGrns(c.data ?? [])
    // ค่าเริ่มต้น = จำนวนคงค้างทั้งหมด
    setQty(Object.fromEntries((b.data ?? []).map((i) => [i.id, String(Number(i.quantity) - Number(i.qty_received))])))
  }, [id])

  useEffect(() => { load() }, [load])

  async function receive() {
    if (!confirm('ยืนยันรับของเข้าสโตร์? ระบบจะอัปเดตสต็อกและลงบัญชีอัตโนมัติ')) return
    setBusy(true); setError(''); setDone('')
    const { data, error } = await supabase.rpc('confirm_goods_receipt', {
      p_po_id: id,
      p_items: items.map((i) => ({ po_item_id: i.id, qty_received: Number(qty[i.id]) || 0 })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDone('บันทึกรับของเรียบร้อย')
    load()
  }

  if (error && !po) return <p className="text-red-600">{error}</p>
  if (!po) return <p className="text-steel-500">กำลังโหลด...</p>

  const canReceive = canReceiveGoods(profile.role) && ['open', 'partial'].includes(po.status)
  const anyQty = items.some((i) => Number(qty[i.id]) > 0)

  return (
    <div className="max-w-4xl">
      <Link to="/purchasing/po" className="text-sm text-steel-500 underline">← กลับ</Link>
      <div className="mt-2">
        <h2 className="text-xl font-bold">{po.po_no}</h2>
        <div className="text-sm text-steel-500">{po.vendors?.vendor_name} · {po.projects?.project_code} {po.projects?.project_name} · {po.order_date}</div>
        <div className="mt-1 flex items-center gap-3"><Badge map={PO_STATUS} status={po.status} /><b>ยอดรวม {baht(po.total_amount)} บาท</b></div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg bg-white p-5">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-steel-500">
            <th className="py-2">รายการ</th><th className="text-right">สั่ง</th><th className="text-right">รับแล้ว</th><th className="text-right">ราคา/หน่วย</th>
            {canReceive && <th className="text-right">รับครั้งนี้</th>}
          </tr></thead>
          <tbody>{items.map((i) => {
            const remaining = Number(i.quantity) - Number(i.qty_received)
            return (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2">{i.item_name} <span className="text-steel-500">({i.unit})</span></td>
                <td className="text-right">{i.quantity}</td>
                <td className="text-right">{i.qty_received}</td>
                <td className="text-right">{baht(i.unit_price)}</td>
                {canReceive && (
                  <td className="text-right">
                    {remaining > 0 ? (
                      <input className="input ml-auto w-24 text-right" type="number" min="0" max={remaining} step="0.01"
                        value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
                    ) : <span className="text-steel-500">ครบแล้ว</span>}
                  </td>
                )}
              </tr>
            )
          })}</tbody>
        </table>
        {canReceive && (
          <div className="mt-4">
            <button className="btn-primary" onClick={receive} disabled={busy || !anyQty}>{busy ? 'กำลังบันทึก...' : 'ยืนยันรับของเข้าสโตร์'}</button>
            <p className="mt-2 text-xs text-steel-500">ระบบลงบัญชีให้อัตโนมัติ: Dr.วัสดุคงเหลือ / Cr.เจ้าหนี้การค้า</p>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {done && <p className="mt-3 text-sm text-green-700">{done}</p>}
      </div>

      {grns.length > 0 && (
        <div className="mt-4 rounded-lg bg-white p-5 text-sm">
          <h3 className="font-semibold">ประวัติการรับของ</h3>
          <ul className="mt-2 space-y-1">{grns.map((g) => <li key={g.id}>{g.grn_no} · {g.received_date}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
