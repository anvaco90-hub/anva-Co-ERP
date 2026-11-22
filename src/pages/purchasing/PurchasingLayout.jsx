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
      { to: '/purchasing?tab=pipeline', tabKey: 'pipeline', label: 'PR ➔ PO (สายงานจัดซื้อ)', icon: Workflow },
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
    <div className="min-h-screen bg-slate-100/60 dark:!bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-12 font-sans transition-colors duration-200">
      {/* 1. Header Banner สไตล์มาตรฐานเหมือนสโตร์ (ANVA & Co Navy & Solar Theme) */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 text-white shadow-md border-b border-steel-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5">
          {/* Top Brand Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-steel-700/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hivis text-steel-900 font-black shadow-md shadow-amber-500/20 shrink-0">
                <Sun className="h-5 w-5 text-steel-900 fill-steel-900" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>ANVA & CO. — ระบบฝ่ายจัดซื้อและพัสดุวิศวกรรม</span>
                </h1>
                <p className="text-xs text-steel-400">
                  ระบบบริหารวงจรจัดซื้อ ออกใบสั่งซื้อ ตรวจรับพัสดุเข้าสโตร์ และเชื่อมต่อบัญชีการเงิน บริษัท อันวาแอนด์โค จำกัด
                </p>
              </div>
            </div>
          </div>

          {/* 2. Navigation Bar จัดหมวดหมู่ชัดเจน สไตล์เดียวกับสโตร์ */}
          <div className="pt-2.5 flex flex-wrap items-center gap-2 sm:gap-4">
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
                      className={`
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer
                        ${active
                          ? 'bg-hivis text-steel-950 font-black shadow-xs'
                          : 'text-steel-300 hover:bg-steel-800 hover:text-white'
                        }
                      `}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{t.label}</span>
                      {countBadge !== undefined && countBadge > 0 && (
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-black font-mono shadow-xs ${
                            t.badgeHighlight
                              ? 'bg-rose-500 text-white animate-pulse'
                              : active
                              ? 'bg-steel-900 text-amber-400'
                              : 'bg-steel-800 text-steel-300'
                          }`}
                        >
                          {countBadge}
                        </span>
                      )}
                    </Link>
                  )
                })}
                {gIdx < purchasingNavGroups.length - 1 && (
                  <div className="hidden sm:block h-4 w-px bg-steel-700 mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Page Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6">
        <Outlet />
      </div>
    </div>
  )
}
