import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV_ITEMS, ROLE_LABELS } from '../lib/roles'

// เลย์เอาต์หลัก: แถบเมนูด้านข้าง (เดสก์ท็อป) / ลิ้นชักเมนู (มือถือ)
export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role))

  const linkCls = ({ isActive }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-hivis text-ink' : 'text-steel-100 hover:bg-steel-700'
    }`

  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between bg-steel-900 px-4 py-3 text-white md:hidden">
        <span className="font-bold">ERP ก่อสร้าง</span>
        <button className="btn-ghost !py-1" onClick={() => setOpen(!open)} aria-expanded={open}>
          เมนู
        </button>
      </header>

      <aside
        className={`${open ? 'block' : 'hidden'} w-full bg-steel-900 p-4 text-white md:block md:min-h-screen md:w-60 md:shrink-0`}
      >
        <div className="mb-6 hidden border-b-4 border-hivis pb-3 text-lg font-bold md:block">ERP ก่อสร้าง</div>
        <nav className="space-y-1" onClick={() => setOpen(false)}>
          {items.map((i) => (
            <NavLink key={i.path} to={i.path} end={i.path === '/'} className={linkCls}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8 border-t border-steel-700 pt-4 text-sm">
          <div className="font-semibold">{profile.full_name}</div>
          <div className="text-steel-300">{ROLE_LABELS[profile.role]}</div>
          <button onClick={signOut} className="mt-3 text-steel-300 underline hover:text-white">
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
