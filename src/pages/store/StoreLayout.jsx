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
    <div className="space-y-4 pb-12 text-slate-900 dark:text-slate-100">
      {/* Compact Module Sub-Navigation Bar (QuotationList Standard) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {storeNavGroups.map((group, gIdx) => (
            <div key={gIdx} className="flex flex-wrap items-center gap-1">
              {group.items.map((t) => {
                const Icon = t.icon
                return (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) => `
                      inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition
                      ${isActive
                        ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }
                    `}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.label}</span>
                    {t.to === '/store/receipts' && pendingPoCount > 0 && (
                      <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-bold font-mono">
                        {pendingPoCount}
                      </span>
                    )}
                  </NavLink>
                )
              })}
              {gIdx < storeNavGroups.length - 1 && (
                <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Page Content */}
      <div>
        <Outlet />
      </div>
    </div>
  )
}
