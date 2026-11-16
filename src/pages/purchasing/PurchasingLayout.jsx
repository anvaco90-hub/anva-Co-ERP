import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/purchasing', label: 'ศูนย์จัดซื้อ (PR + PO)', end: true },
  { to: '/quotations', label: 'ใบเสนอราคา (Quotations)' },
  { to: '/purchasing/vendors', label: 'ผู้ขาย (Vendors)' },
]

export default function PurchasingLayout() {
  return (
    <div>
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md pt-1 pb-2 border-b border-steel-200">
        <h1 className="text-2xl font-black text-steel-900">ฝ่ายจัดซื้อ (Purchasing & Procurement)</h1>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `whitespace-nowrap px-4 py-2 text-sm font-semibold transition ${isActive ? 'border-b-4 border-hivis text-steel-900 font-bold' : 'text-steel-500 hover:text-steel-800'}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-5"><Outlet /></div>
    </div>
  )
}