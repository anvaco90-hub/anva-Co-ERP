import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import { NAV_ITEMS, ROLE_LABELS } from '../lib/roles'
import {
  getInitialExpandedSections,
  getLocationBreadcrumb,
  isNavChildActive,
  isNavSectionActive,
} from '../lib/navigation'
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  ShoppingCart,
  ArrowLeft,
  Home,
  FileText,
  FileSpreadsheet,
  ClipboardList,
  Workflow,
  Package,
  Users,
  LayoutDashboard,
  Briefcase,
  Boxes,
  Calculator,
  UserCheck,
  Building2,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'

export { getLocationBreadcrumb }

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const [pendingStoreCount, setPendingStoreCount] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role))

  // ดึงจำนวนใบสั่งซื้อที่รอตรวจรับเข้าสโตร์ (Pending POs) เพื่อแสดง Badge แจ้งเตือนข้างเมนูสโตร์
  useEffect(() => {
    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'partial', 'pending_receipt'])
      .then(({ count }) => setPendingStoreCount(count || 0))
  }, [location.pathname])

  const [expandedSections, setExpandedSections] = useState(() =>
    getInitialExpandedSections(NAV_ITEMS, location.pathname, location.search)
  )

  useEffect(() => {
    setExpandedSections((prev) => {
      const next = { ...prev }
      for (const item of NAV_ITEMS) {
        if (item.children?.length && isNavSectionActive(item, location.pathname, location.search)) {
          next[item.path] = true
        }
      }
      return next
    })
  }, [location.pathname, location.search])

  const toggleSection = (path) => {
    setExpandedSections((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  const getChildIcon = (subPath) => {
    if (subPath === '/quotations') return <FileText className="h-3.5 w-3.5 shrink-0" />
    if (subPath === '/boq') return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('role=customer')) return <Users className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('role=vendor')) return <Building2 className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('tab=pipeline')) return <Workflow className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('tab=pr')) return <ClipboardList className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('tab=po')) return <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
    if (subPath.includes('tab=receipts')) return <Package className="h-3.5 w-3.5 shrink-0" />
    if (subPath.startsWith('/accounting')) return <Calculator className="h-3.5 w-3.5 shrink-0" />
    return <BookOpen className="h-3.5 w-3.5 shrink-0" />
  }

  const getSectionIcon = (path) => {
    switch (path) {
      case '/':
        return <LayoutDashboard className="h-4 w-4 shrink-0" />
      case '/projects':
        return <Briefcase className="h-4 w-4 shrink-0" />
      case '/quotations':
        return <FileText className="h-4 w-4 shrink-0" />
      case '/purchasing':
        return <ShoppingCart className="h-4 w-4 shrink-0" />
      case '/contacts':
        return <Users className="h-4 w-4 shrink-0" />
      case '/store':
        return <Boxes className="h-4 w-4 shrink-0" />
      case '/accounting':
        return <Calculator className="h-4 w-4 shrink-0" />
      case '/hr':
        return <UserCheck className="h-4 w-4 shrink-0" />
      default:
        return <BookOpen className="h-4 w-4 shrink-0" />
    }
  }

  return (
    <div className="min-h-screen md:flex bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Mobile Top Header */}
      <header className="flex items-center justify-between bg-[#0B111E] px-4 py-3 text-white md:hidden shadow-md border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 text-white font-black text-sm shadow-md">
            A
          </div>
          <span className="font-bold tracking-wide text-sm">anva-Co ERP</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition cursor-pointer"
            title={isDark ? 'เปลี่ยนเป็นธีมกลางวัน (Light Mode)' : 'เปลี่ยนเป็นธีมกลางคืน (Dark Mode)'}
          >
            {isDark ? <Sun className="h-4 w-4 text-emerald-400" /> : <Moon className="h-4 w-4 text-slate-300" />}
          </button>
          <button
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? 'ปิด' : 'เมนู'}
          </button>
        </div>
      </header>

      {/* Luxury Enterprise Sidebar */}
      <aside
        className={`${open ? 'block' : 'hidden'} w-full bg-[#0B111E] p-4 text-white md:flex md:flex-col md:w-64 md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto shadow-xl z-40 border-r border-slate-800/80`}
      >
        {/* Brand Header */}
        <div className="mb-6 hidden pb-4 border-b border-slate-800/80 md:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 text-white font-black text-xl shadow-lg shadow-emerald-500/25 border border-emerald-300/30">
              A
            </div>
            <div>
              <div className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                <span>anva-Co</span>
                <span className="text-[9px] font-black bg-gradient-to-r from-emerald-400/20 to-emerald-500/30 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.2 rounded tracking-widest">
                  PRO
                </span>
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                Construction & ERP
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-2">
          เมนูระบบ (Navigation)
        </div>

        <nav className="space-y-1 flex-1">
          {items.map((i) => {
            const icon = getSectionIcon(i.path)

            if (i.children && i.children.length > 0) {
              const isSectionActive = isNavSectionActive(i, location.pathname, location.search)
              const isExpanded = expandedSections[i.path] ?? isSectionActive

              return (
                <div key={i.path} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleSection(i.path)}
                    aria-expanded={isExpanded}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                      isSectionActive
                        ? 'bg-white/[0.07] text-white'
                        : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={isSectionActive ? 'text-emerald-400' : 'text-slate-400'}>
                        {icon}
                      </span>
                      <span className="truncate">{i.label}</span>
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="ml-3.5 pl-2 py-0.5 space-y-0.5 border-l border-slate-800">
                      {i.children.map((sub) => {
                        const active = isNavChildActive(sub.path, location.pathname, location.search)
                        return (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-2 rounded-r-lg px-2.5 py-1.5 text-xs transition-colors duration-150 border-l-2 ${
                              active
                                ? 'bg-emerald-500/15 text-emerald-300 font-semibold border-emerald-400'
                                : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border-transparent font-medium'
                            }`}
                          >
                            <span className={active ? 'text-emerald-400' : 'text-slate-500'}>
                              {getChildIcon(sub.path)}
                            </span>
                            <span className="truncate">{sub.label}</span>
                          </NavLink>
                        )
                      })}
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
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-r-xl px-3 py-2 text-xs font-semibold transition-colors duration-150 border-l-2 ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400'
                      : 'text-slate-300 hover:bg-white/[0.04] hover:text-white border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                      {icon}
                    </span>
                    <span className="truncate">{i.label}</span>
                    {i.path === '/store' && pendingStoreCount > 0 && (
                      <span className="ml-auto rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black tabular-nums shadow-sm">
                        {pendingStoreCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User Profile Card & Single Theme Switcher at Bottom */}
        <div className="mt-auto pt-4 border-t border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] px-3 py-2 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            title="เปลี่ยนธีมหน้าจอ (กลางวัน / กลางคืน)"
          >
            <span className="flex items-center gap-2">
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-sky-400" />
              )}
              <span>{isDark ? 'โหมดกลางคืน (Dark)' : 'โหมดกลางวัน (Light)'}</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              {isDark ? 'สว่าง' : 'มืด'}
            </span>
          </button>

          <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-white font-bold text-xs uppercase">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-white truncate">{profile.full_name}</div>
                <div className="text-[10px] text-emerald-400/90 font-medium truncate">{ROLE_LABELS[profile.role]}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-3 w-3" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 space-y-4">
        {/* Floating Sticky Breadcrumb Bar */}
        {location.pathname !== '/' && (
          <div className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 dark:border-amber-500/40 bg-emerald-600 dark:bg-slate-800 hover:bg-emerald-700 dark:hover:bg-slate-700 px-3.5 py-1.5 text-xs font-bold text-white dark:text-amber-400 shadow-xs shadow-emerald-600/20 transition cursor-pointer active:scale-95"
                title="ย้อนกลับไปหน้าก่อนหน้า (คลิกได้ตลอดเวลา)"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-white dark:text-amber-400" />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer"
                title="กลับหน้าหลักแดชบอร์ด"
              >
                <Home className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>หน้าหลัก</span>
              </button>

              {(() => {
                const locInfo = getLocationBreadcrumb(location.pathname, location.search)
                return (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50/70 dark:bg-slate-800/90 border border-emerald-100 dark:border-slate-700 text-xs">
                    <Link
                      to={locInfo.modulePath || '/'}
                      className="font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition hidden md:inline hover:underline"
                      title={`คลิกเพื่อไปยังหน้าหลักของ ${locInfo.module}`}
                    >
                      {locInfo.module}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 text-emerald-500/70 dark:text-slate-500 hidden md:inline" />
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{locInfo.feature}</span>
                  </div>
                )
              })()}
            </div>

            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 hidden sm:flex items-center">
              <span>ANVA & CO. ERP</span>
            </div>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  )
}
