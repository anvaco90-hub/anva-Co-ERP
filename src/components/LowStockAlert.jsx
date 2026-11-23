import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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
    <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-steel-900 shadow-sm">
      <div className="font-bold text-red-900 flex items-center gap-2">
        <span className="text-base"></span>
        <span>แจ้งเตือนวัสดุใกล้หมดคลัง ({low.length} รายการ)</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-steel-800 text-xs">
        {low.slice(0, 8).map((i) => (
          <li key={i.id} className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-red-200">
            <span className="font-semibold text-steel-900 truncate mr-2">{i.item_name}</span>
            <span className="shrink-0 text-steel-700">
              เหลือ <b className="text-red-700 font-black">{i.qty_on_hand}</b> {i.unit}{' '}
              <span className="text-steel-400 font-normal">(จุดสั่งซื้อ ≤ {i.reorder_point})</span>
            </span>
          </li>
        ))}
      </ul>
      {low.length > 8 && <div className="mt-2 text-xs text-steel-600 font-medium">และยังมีวัสดุอื่นๆ อีก {low.length - 8} รายการ</div>}
      {canOpenStore && (
        <div className="mt-3 pt-2 border-t border-red-200/60 flex items-center justify-end">
          <Link to="/store" className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:text-red-900 underline">
            <span> ไปจัดการสต็อกและสั่งซื้อวัสดุที่คลังสินค้า</span>
          </Link>
        </div>
      )}
    </div>
  )
}