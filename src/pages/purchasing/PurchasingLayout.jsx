import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  FileText,
  ShoppingCart,
  Package,
  Building2,
  Workflow,
  ClipboardList,
  Sun,
  Boxes,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const purchasingNavGroups = [
  {
    groupLabel: 'สายงานจัดซื้อ',
    items: [
      { to: '/purchasing?tab=pipeline', tabKey: 'pipeline', label: 'ศูนย์งานจัดซื้อ (PR / PO)', icon: Workflow },
      { to: '/purchasing?tab=pr', tabKey: 'pr', label: 'ใบขอซื้อ (PR)', icon: ClipboardList, badgeKey: 'pr' },
      { to: '/purchasing?tab=po', tabKey: 'po', label: 'ใบสั่งซื้อ (PO)', icon: ShoppingCart, badgeKey: 'po' },
    ],
  },
  {
    groupLabel: 'ตรวจรับ & คู่ค้า',
    items: [
      { to: '/purchasing?tab=receipts', tabKey: 'receipts', label: 'ตรวจรับของเข้า (GR)', icon: Package, badgeKey: 'gr', badgeHighlight: true },
      { to: '/contacts?role=vendor', pathKey: '/contacts', label: 'ผู้ขาย (Vendors)', icon: Building2 },
      { to: '/quotations', pathKey: '/quotations', label: 'ใบเสนอราคา (Quotations)', icon: FileText },
    ],
  },
  {
    groupLabel: 'สโตร์',
    items: [
      { to: '/store', pathKey: '/store', label: 'คลังวัสดุและสโตร์', icon: Boxes },
    ],
  },
]

export default function PurchasingLayout() {
  const location = useLocation()
  const currentTab = new URLSearchParams(location.search).get('tab') || 'pipeline'
  const [counts, setCounts] = useState({ pr: 0, po: 0, gr: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('purchase_requisitions').select('id', { count: 'exact', head: true }),
      supabase.from('purchase_orders').select('id', { count: 'exact', head: true }),
      supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['open', 'partial', 'pending_receipt']),
    ]).then(([prRes, poRes, grRes]) => {
      setCounts({
        pr: prRes.count || 0,
        po: poRes.count || 0,
        gr: grRes.count || 0,
      })
    })
  }, [location.pathname, location.search])

  const isItemActive = (item) => {
    if (item.tabKey) {
      return location.pathname === '/purchasing' && currentTab === item.tabKey
    }
    if (item.pathKey) {
      return location.pathname.startsWith(item.pathKey)
    }
    return false
  }

  const isIndexPage = location.pathname === '/purchasing'

  return (
    <div className="space-y-4 pb-12 text-slate-900 dark:text-slate-100">
      {/* Compact Module Sub-Navigation Bar (QuotationList Standard) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {purchasingNavGroups.map((group, gIdx) => (
            <div key={gIdx} className="flex flex-wrap items-center gap-1">
              {group.items.map((t) => {
                const Icon = t.icon
                const active = isItemActive(t)
                const countBadge = t.badgeKey ? counts[t.badgeKey] : undefined

                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.label}</span>
                    {countBadge !== undefined && countBadge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold font-mono ${
                          t.badgeHighlight
                            ? 'bg-rose-500 text-white'
                            : active
                              ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-950'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {countBadge}
                      </span>
                    )}
                  </Link>
                )
              })}
              {gIdx < purchasingNavGroups.length - 1 && (
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
