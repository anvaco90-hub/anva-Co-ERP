import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  Package,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  RotateCcw,
  ShoppingCart,
  Sun,
  ShieldCheck,
  Building2,
  ArrowLeft,
} from 'lucide-react'

const storeNavGroups = [
  {
    groupLabel: 'งานสต็อก & ทะเบียน',
    items: [
      { to: '/store', label: 'สต็อกวัสดุ', icon: Package, end: true },
      { to: '/store/items', label: 'ทะเบียน & หมวดหมู่', icon: Layers },
    ],
  },
  {
    groupLabel: 'งานรับ-เบิก-คืน พัสดุ',
    items: [
      { to: '/store/receipts', label: 'รับของเข้า', icon: ArrowDownToLine },
      { to: '/store/issue/new', label: 'เบิกของ', icon: ArrowUpFromLine },
      { to: '/store/adjust', label: 'คืนของ', icon: RotateCcw },
      { to: '/store/issues', label: 'ประวัติเบิก-คืน', icon: History },
    ],
  },
  {
    groupLabel: 'จัดซื้อ',
    items: [
      { to: '/purchasing', label: 'ฝ่ายจัดซื้อ (PO/PR)', icon: ShoppingCart },
    ],
  },
]

export default function StoreLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [pendingPoCount, setPendingPoCount] = useState(0)

  useEffect(() => {
    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'partial', 'pending_receipt'])
      .then(({ count }) => setPendingPoCount(count || 0))
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-slate-100/60 dark:!bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-12 font-sans transition-colors duration-200">
      {/* 1. ANVA & Co. Engineering Brand Header (Navy & Solar Gold Theme) */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 text-white shadow-md border-b border-steel-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5">
          {/* Top Brand Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-steel-700/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hivis text-steel-900 font-black shadow-md shadow-amber-500/20 shrink-0">
                <Sun className="h-5 w-5 text-steel-900 fill-steel-900" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  ANVA & CO. — ระบบบริหารคลังและพัสดุวิศวกรรม
                </h1>
                <p className="text-xs text-slate-200/90 font-medium">
                  ระบบคลังวัสดุและอุปกรณ์มาตรฐานวิศวกรรม บริษัท อันวาแอนด์โค จำกัด
                </p>
              </div>
            </div>
          </div>

          {/* 2. Compact Wrapped Navigation (ไม่เลื่อน <---> จัดหมวดหมู่ชัดเจน อ่านง่าย) */}
          <div className="pt-2.5 flex flex-wrap items-center gap-2 sm:gap-4">
            {storeNavGroups.map((group, gIdx) => (
              <div key={gIdx} className="flex flex-wrap items-center gap-1">
                {group.items.map((t) => {
                  const Icon = t.icon
                  const isMatch = t.end
                    ? location.pathname === t.to
                    : location.pathname.startsWith(t.to)

                  return (
                    <NavLink
                      key={t.to}
                      to={t.to}
                      end={t.end}
                      className={({ isActive }) => `
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all
                        ${isActive
                          ? 'bg-hivis text-steel-950 font-black shadow-xs'
                          : 'text-steel-300 hover:bg-steel-800 hover:text-white'
                        }
                      `}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{t.label}</span>
                      {t.to === '/store/receipts' && pendingPoCount > 0 && (
                        <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black font-mono shadow-sm animate-pulse">
                          {pendingPoCount}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
                {gIdx < storeNavGroups.length - 1 && (
                  <div className="hidden sm:block h-4 w-px bg-steel-700 mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Page Content */}
      <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 lg:px-8 mt-6">
        <Outlet />
      </div>
    </div>
  )
}
