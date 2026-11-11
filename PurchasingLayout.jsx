import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/purchasing', label: 'ใบขอซื้อ (PR)', end: true },
  { to: '/purchasing/po', label: 'ใบสั่งซื้อ (PO)' },
  { to: '/purchasing/vendors', label: 'ผู้ขาย' },
]

export default function PurchasingLayout() {
  return (
    <div>
      <h1 className="text-2xl font-bold">จัดซื้อ</h1>
      <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-steel-300">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => `whitespace-nowrap px-4 py-2 text-sm font-semibold ${isActive ? 'border-b-4 border-hivis' : 'text-steel-500'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-5"><Outlet /></div>
    </div>
  )
}
