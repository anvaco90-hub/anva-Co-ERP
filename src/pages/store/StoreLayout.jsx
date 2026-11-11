import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/store', label: 'สต็อกหลัก', end: true },
  { to: '/store/receipts', label: 'รับเข้า' },
  { to: '/store/issue/new', label: 'เบิกวัสดุ' },
  { to: '/store/issues', label: 'ประวัติเบิก' },
  { to: '/store/adjust', label: 'ปรับปรุงสต็อก' },
  { to: '/store/items', label: 'จัดการวัสดุ/หมวด' },
]

export default function StoreLayout() {
  return (
    <div>
      <h1 className="text-2xl font-bold">สโตร์หลัก</h1>
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
