import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV_ITEMS, ROLE_LABELS } from '../lib/roles'
import { ChevronDown, ChevronRight, BookOpen, ArrowLeft, Home } from 'lucide-react'

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role))

  // State to track expanded menu sections (default open if currently on that section)
  const [expandedSections, setExpandedSections] = useState({
    '/accounting': location.pathname.startsWith('/accounting'),
  })

  const toggleSection = (path) => {
    setExpandedSections((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  const linkCls = ({ isActive }) =>
    `block rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-hivis text-ink font-bold shadow-sm' : 'text-steel-100 hover:bg-steel-800'
    }`

  const subLinkCls = ({ isActive }) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
      isActive
        ? 'bg-hivis text-ink font-bold shadow-sm'
        : 'text-steel-300 hover:text-white hover:bg-steel-800/60'
    }`

  return (
    <div className="min-h-screen md:flex bg-slate-50">
      <header className="flex items-center justify-between bg-steel-900 px-4 py-3 text-white md:hidden shadow">
        <span className="font-bold tracking-wide">ERP ก่อสร้าง (anva-Co)</span>
        <button className="btn-ghost !py-1 text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
          เมนู
        </button>
      </header>

      <aside
        className={`${open ? 'block' : 'hidden'} w-full bg-steel-900 p-4 text-white md:block md:w-64 md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto shadow-lg z-40 border-r border-steel-800`}
      >
        <div className="mb-6 hidden border-b-2 border-hivis/80 pb-3 md:block">
          <div className="text-lg font-black tracking-wide text-white">anva-Co-ERP</div>
          <div className="text-[10px] text-steel-400 uppercase tracking-widest font-mono">
            Construction & Accounting ERP
          </div>
        </div>

        <nav className="space-y-1">
          {items.map((i) => {
            if (i.children && i.children.length > 0) {
              const isSectionActive = location.pathname.startsWith(i.path)
              const isExpanded = expandedSections[i.path] ?? isSectionActive

              return (
                <div key={i.path} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(i.path)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition ${
                      isSectionActive
                        ? 'bg-steel-800 text-white font-semibold'
                        : 'text-steel-100 hover:bg-steel-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-hivis" />
                      <span>{i.label}</span>
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-steel-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-steel-400" />
                    )}
                  </button>

                  {/* Sub-Items */}
                  {isExpanded && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-steel-700 ml-3">
                      {i.children.map((sub) => (
                        <NavLink
                          key={sub.path}
                          to={sub.path}
                          onClick={() => setOpen(false)}
                          className={subLinkCls}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-steel-500 shrink-0" />
                          <span className="truncate">{sub.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={i.path}
                to={i.path}
                end={i.path === '/'}
                onClick={() => setOpen(false)}
                className={linkCls}
              >
                {i.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-8 border-t border-steel-700 pt-4 text-sm">
          <div className="font-semibold text-white">{profile.full_name}</div>
          <div className="text-xs text-steel-300 font-medium">{ROLE_LABELS[profile.role]}</div>
          <button
            onClick={signOut}
            className="mt-3 text-xs text-rose-300 hover:text-rose-200 underline font-semibold"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 space-y-4">
        {/* Universal Sticky Back Button Bar (ข้อ 1: ย้อนกลับให้คงที่ ไม่ว่าเลื่อนลงแค่ไหนก็กดได้ทันที ไม่ต้องเลื่อนขึ้นบน) */}
        {location.pathname !== '/' && (
          <div className="sticky top-2 z-50 flex items-center justify-between gap-3 rounded-2xl border border-steel-200/95 bg-white/95 px-4 py-2.5 shadow-md backdrop-blur-md transition-all">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-steel-800 bg-steel-900 hover:bg-steel-800 px-3.5 py-1.5 text-xs font-black text-hivis shadow-xs transition cursor-pointer active:scale-95"
                title="ย้อนกลับไปหน้าก่อนหน้า (คลิกได้ตลอดเวลาแม้เลื่อนลง)"
              >
                <ArrowLeft className="h-4 w-4 text-hivis" />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-steel-200 bg-white hover:bg-steel-50 px-2.5 py-1.5 text-xs font-semibold text-steel-700 hover:text-steel-900 transition cursor-pointer"
                title="กลับหน้าหลักแดชบอร์ด"
              >
                <Home className="h-3.5 w-3.5 text-steel-500" />
                <span>หน้าหลัก</span>
              </button>
            </div>

            <div className="text-[11px] font-semibold text-steel-500 flex items-center gap-2">
              <span className="hidden md:inline text-steel-400">ระบบ ERP บริษัท อันวาแอนด์โค จำกัด</span>
              <span className="rounded-md bg-steel-100 border border-steel-200 px-2 py-0.5 font-mono text-[10px] text-steel-700">
                {location.pathname}
              </span>
            </div>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  )
}
