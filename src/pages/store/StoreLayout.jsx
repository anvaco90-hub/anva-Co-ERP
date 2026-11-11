import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/store', label: 'สต็อกคงเหลือ', end: true },
  { to: '/store/issue/new', label: 'เบิกวัสดุ' },
  { to: '/store/issues', label: 'ประวัติการเบิก' },
]

export default function StoreLayout() {
  return (
    <div>
      <h1 className="text-2xl font-bold">สโตร์</h1>
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
