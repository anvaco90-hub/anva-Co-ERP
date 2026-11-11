import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'

const TYPE = { receipt: 'รับจากใบสั่งซื้อ', adjustment: 'ปรับปรุงสต็อก', migration: 'ยกมา' }

// รายการที่เข้าสโตร์ทั้งหมด (ล็อตรับเข้า) พร้อมโครงการต้นทางและจำนวนที่ยังเหลือ
export default function ReceiptsList() {
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('stock_lots')
      .select('id, lot_type, received_date, qty_received, qty_remaining, unit_cost, inventory_items(item_name, unit), projects(project_code), goods_receipt_items(goods_receipts(grn_no, purchase_orders(po_no)))')
      .order('received_date', { ascending: false }).order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data)))
  }, [])

  if (!rows) return <p className="text-steel-500">{error || 'กำลังโหลด...'}</p>
  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) => !q || (r.inventory_items?.item_name ?? '').toLowerCase().includes(q))
  const totalValue = shown.reduce((s, r) => s + Number(r.qty_received) * Number(r.unit_cost), 0)

  return (
    <div>
      <input className="input max-w-xs" placeholder="ค้นหาชื่อวัสดุ" value={search} onChange={(e) => setSearch(e.target.value)} />
      <p className="mt-3 text-sm">มูลค่ารับเข้ารวม (ที่แสดง) <b>{baht(totalValue)}</b> บาท · แสดงล่าสุด 200 รายการ</p>
      <div className="mt-3 overflow-x-auto rounded-lg bg-white p-4">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-steel-500">
            <th className="py-2">วันที่</th><th>วัสดุ</th><th>ที่มา</th><th>โครงการต้นทาง</th>
            <th className="text-right">รับเข้า</th><th className="text-right">คงเหลือ</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">มูลค่า</th>
          </tr></thead>
          <tbody>{shown.map((r) => {
            const g = r.goods_receipt_items?.goods_receipts
            return (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2">{r.received_date}</td>
                <td>{r.inventory_items?.item_name}</td>
                <td>{TYPE[r.lot_type]}{g && <span className="text-xs text-steel-500"> {g.grn_no} / {g.purchase_orders?.po_no}</span>}</td>
                <td>{r.projects?.project_code ?? 'ไม่ระบุ'}</td>
                <td className="text-right">{r.qty_received} {r.inventory_items?.unit}</td>
                <td className="text-right">{r.qty_remaining}</td>
                <td className="text-right">{baht(r.unit_cost)}</td>
                <td className="text-right">{baht(Number(r.qty_received) * Number(r.unit_cost))}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {shown.length === 0 && <p className="py-3 text-steel-500">ยังไม่มีรายการรับเข้า</p>}
      </div>
    </div>
  )
}
