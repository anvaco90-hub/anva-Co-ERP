import { Link, Outlet, useLocation } from 'react-router-dom'
import { FileText, ShoppingCart, Package, Building2, Workflow, ClipboardList } from 'lucide-react'

const tabs = [
  { to: '/purchasing?tab=pipeline', tabKey: 'pipeline', label: 'PR ➔ PO (สายงานจัดซื้อ)', icon: <Workflow className="h-3.5 w-3.5" /> },
  { to: '/purchasing?tab=pr', tabKey: 'pr', label: 'ใบขอซื้อ (PR)', icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { to: '/purchasing?tab=po', tabKey: 'po', label: 'ใบสั่งซื้อ (PO)', icon: <ShoppingCart className="h-3.5 w-3.5" /> },
  { to: '/purchasing?tab=receipts', tabKey: 'receipts', label: 'ตรวจรับของเข้า (GR)', icon: <Package className="h-3.5 w-3.5" /> },
  { to: '/contacts?role=vendor', pathKey: '/contacts', label: 'ผู้ขาย (Vendors)', icon: <Building2 className="h-3.5 w-3.5" /> },
  { to: '/quotations', pathKey: '/quotations', label: 'ใบเสนอราคา (Quotations)', icon: <FileText className="h-3.5 w-3.5" /> },
]

export default function PurchasingLayout() {
  const location = useLocation()
  const currentTab = new URLSearchParams(location.search).get('tab') || 'pipeline'

  const isTabActive = (item) => {
    if (item.tabKey) {
      return location.pathname === '/purchasing' && currentTab === item.tabKey
    }
    if (item.pathKey) {
      return location.pathname.startsWith(item.pathKey)
    }
    return false
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Header & Luxury Pill Tabs */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 dark:bg-amber-500/20 text-amber-400 font-black text-lg shadow-sm border border-transparent dark:border-amber-400/30">
                🛒
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  ฝ่ายจัดซื้อและพัสดุ (Purchasing & Procurement)
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  ระบบบริหารวงจรจัดซื้อ ออกใบสั่งซื้อ ตรวจรับพัสดุเข้าสโตร์ และเชื่อมต่อบัญชีการเงิน
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modern Pill Navigation */}
        <nav className="flex gap-1.5 overflow-x-auto pb-1 border-t border-slate-100 dark:border-slate-800 pt-3">
          {tabs.map((t) => {
            const active = isTabActive(t)
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`whitespace-nowrap px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm shadow-slate-900/20'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                }`}
              >
                <span className={active ? 'text-amber-400 dark:text-slate-950' : 'text-slate-400'}>{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div><Outlet /></div>
    </div>
  )
}
