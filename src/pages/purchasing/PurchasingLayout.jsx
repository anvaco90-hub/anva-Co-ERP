import { Link, Outlet, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/purchasing?tab=pipeline', tabKey: 'pipeline', label: 'ศูนย์จัดซื้อ & วงจรเอกสาร' },
  { to: '/purchasing?tab=pr', tabKey: 'pr', label: 'ใบขอซื้อ (PR)' },
  { to: '/purchasing?tab=po', tabKey: 'po', label: 'ใบสั่งซื้อ (PO)' },
  { to: '/purchasing?tab=receipts', tabKey: 'receipts', label: 'ตรวจรับของเข้า (GR)' },
  { to: '/purchasing/vendors', pathKey: '/purchasing/vendors', label: 'ผู้ขาย (Vendors)' },
  { to: '/quotations', pathKey: '/quotations', label: 'ใบเสนอราคา (Quotations)' },
]

export default function PurchasingLayout() {
  const location = useLocation()
  const currentTab = new URLSearchParams(location.search).get('tab') || 'pipeline'

  const isTabActive = (item) => {
    if (item.tabKey) {
      return location.pathname === '/purchasing' && currentTab === item.tabKey
    }
    if (item.pathKey) {
      return location.pathname === item.pathKey
    }
    return false
  }

  return (
    <div>
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md pt-1 pb-2 border-b border-steel-200">
        <h1 className="text-2xl font-black text-steel-900">ฝ่ายจัดซื้อและพัสดุ (Purchasing & Procurement)</h1>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = isTabActive(t)
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`whitespace-nowrap px-3.5 py-2 text-xs md:text-sm font-semibold transition ${
                  active
                    ? 'border-b-4 border-hivis text-steel-900 font-bold bg-steel-100/60 rounded-t-lg'
                    : 'text-steel-500 hover:text-steel-800 hover:bg-steel-50 rounded-t-lg'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="mt-5"><Outlet /></div>
    </div>
  )
}