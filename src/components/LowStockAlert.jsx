import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// แจ้งเตือนวัสดุใกล้หมด (คงเหลือ <= จุดเตือนที่กำหนดไว้ของวัสดุนั้น)
export default function LowStockAlert() {
  const { profile } = useAuth()
  const [low, setLow] = useState([])
  const show = ['admin', 'store', 'purchasing', 'management'].includes(profile.role)

  useEffect(() => {
    if (!show) return
    supabase.from('inventory_items').select('id, item_name, unit, qty_on_hand, reorder_point').gt('reorder_point', 0)
      .then(({ data }) => setLow((data ?? []).filter((i) => Number(i.qty_on_hand) <= Number(i.reorder_point))))
  }, [show])

  if (!show || low.length === 0) return null
  const canOpenStore = ['admin', 'store', 'management'].includes(profile.role)
  return (
    <div className="mt-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm">
      <div className="font-semibold text-red-800">วัสดุใกล้หมด {low.length} รายการ</div>
      <ul className="mt-2 space-y-0.5">
        {low.slice(0, 8).map((i) => (
          <li key={i.id}>{i.item_name}: เหลือ <b>{i.qty_on_hand}</b> {i.unit} (เตือนที่ ≤ {i.reorder_point})</li>
        ))}
      </ul>
      {low.length > 8 && <div className="mt-1 text-steel-500">และอีก {low.length - 8} รายการ</div>}
      {canOpenStore && <Link to="/store" className="mt-2 inline-block underline">ดูสต็อกหลัก</Link>}
    </div>
  )
}
