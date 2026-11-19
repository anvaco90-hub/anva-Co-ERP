import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import { NAV_ITEMS, ROLE_LABELS } from '../lib/roles'
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  ShoppingCart,
  ArrowLeft,
  Home,
  FileText,
  Users,
  LayoutDashboard,
  Briefcase,
  Boxes,
  Calculator,
  UserCheck,
  Building2,
  Sparkles,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'

// ฟังก์ชันช่วยระบุโมดูลและฟีเจอร์ปัจจุบัน (Breadcrumbs Indicator)
export function getLocationBreadcrumb(pathname, search = '') {
  const params = new URLSearchParams(search)
  const tab = params.get('tab')

  // 1. จัดซื้อและพัสดุ (Purchasing)
  if (pathname.startsWith('/purchasing/po/new')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'ออกใบสั่งซื้อ (PO)', icon: '📄', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/po/')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'รายละเอียดใบสั่งซื้อ (PO)', icon: '📄', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/pr/new')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'ออกใบขอซื้อ (PR)', icon: '📝', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/pr/')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'รายละเอียดใบขอซื้อ (PR)', icon: '📝', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/quotation')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'เปรียบเทียบใบเสนอราคาผู้ขาย', icon: '📊', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/vendors')) {
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'ทะเบียนผู้ขาย (Vendors)', icon: '🏢', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing')) {
    if (tab === 'pr') return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'รายการใบขอซื้อ (PR)', icon: '📝', modulePath: '/purchasing' }
    if (tab === 'po') return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'รายการใบสั่งซื้อ (PO)', icon: '🛒', modulePath: '/purchasing' }
    if (tab === 'receipts') return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'ตรวจรับของเข้า (GR / RI)', icon: '📦', modulePath: '/purchasing' }
    return { module: 'ฝ่ายจัดซื้อและพัสดุ', feature: 'PR ➔ PO (สายงานจัดซื้อ)', icon: '🛒', modulePath: '/purchasing' }
  }

  // 2. คลังและสโตร์ (Store & Inventory)
  if (pathname.startsWith('/store/receipts')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'รับของเข้า (Goods Receipts - RI)', icon: '📥', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/issue/new')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'เบิกจ่ายวัสดุ (Stock Issue)', icon: '📤', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/issues')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'ประวัติการเบิก-คืนพัปลด (Issue & Return Logs)', icon: '📜', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/adjust')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'คืนของ & ปรับปรุงสต็อก', icon: '🔄', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/items')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'ทะเบียนพัสดุ & หมวดหมู่', icon: '📑', modulePath: '/store' }
  }
  if (pathname.startsWith('/store')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'สต็อกวัสดุวิศวกรรม', icon: '📦', modulePath: '/store' }
  }

  // 3. โครงการ (Projects)
  if (pathname.startsWith('/projects/new')) {
    return { module: 'บริหารโครงการ', feature: 'สร้างโครงการใหม่', icon: '🏗️', modulePath: '/projects' }
  }
  if (pathname.startsWith('/projects/')) {
    return { module: 'บริหารโครงการ', feature: 'รายละเอียดโครงการ', icon: '🏗️', modulePath: '/projects' }
  }
  if (pathname.startsWith('/projects')) {
    return { module: 'บริหารโครงการ', feature: 'รายการโครงการทั้งหมด', icon: '🏗️', modulePath: '/projects' }
  }

  // 4. บัญชีและการเงิน (Accounting)
  if (pathname.startsWith('/accounting/expenses')) {
    return { module: 'บัญชีและการเงิน', feature: 'บันทึกค่าใช้จ่าย', icon: '💸', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/ap')) {
    return { module: 'บัญชีและการเงิน', feature: 'เจ้าหนี้การค้า (AP)', icon: '📋', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/ar')) {
    return { module: 'บัญชีและการเงิน', feature: 'ลูกหนี้การค้า (AR)', icon: '📈', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/gl') || pathname.startsWith('/accounting/journal')) {
    return { module: 'บัญชีและการเงิน', feature: 'สมุดรายวันทั่วไป (GL)', icon: '⚖️', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/reports')) {
    return { module: 'บัญชีและการเงิน', feature: 'งบการเงิน & รายงาน', icon: '📊', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting')) {
    return { module: 'บัญชีและการเงิน', feature: 'ภาพรวมระบบบัญชี', icon: '⚖️', modulePath: '/accounting' }
  }

  // 5. ใบเสนอราคา & BOQ
  if (pathname.startsWith('/quotations/new')) {
    return { module: 'งานขายและเสนอราคา', feature: 'สร้างใบเสนอราคาใหม่', icon: '📄', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/quotations/')) {
    return { module: 'งานขายและเสนอราคา', feature: 'รายละเอียดใบเสนอราคา', icon: '📄', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/quotations')) {
    return { module: 'งานขายและเสนอราคา', feature: 'รายการใบเสนอราคา', icon: '📄', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/boq')) {
    return { module: 'งานวิศวกรรมและราคา', feature: 'ประมาณราคา BOQ', icon: '📐', modulePath: '/boq' }
  }

  // 6. คู่ค้า / ลูกค้า
  if (pathname.startsWith('/contacts')) {
    return { module: 'ทะเบียนคู่ค้าและลูกค้า', feature: 'รายชื่อผู้ติดต่อ', icon: '👥', modulePath: '/contacts' }
  }

  if (pathname === '/') {
    return { module: 'หน้าหลัก', feature: 'แดชบอร์ดภาพรวม', icon: '🏠', modulePath: '/' }
  }

  return { module: 'ระบบบริหารงานก่อสร้าง', feature: pathname, icon: '🏠', modulePath: '/' }
}

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

  // State to track expanded menu sections
  const [expandedSections, setExpandedSections] = useState({
    '/accounting': location.pathname.startsWith('/accounting'),
    '/purchasing': location.pathname.startsWith('/purchasing'),
    '/quotations': location.pathname.startsWith('/quotations'),
    '/contacts': location.pathname.startsWith('/contacts'),
  })

  // Automatically keep section open if user navigates to it
  useEffect(() => {
    if (location.pathname.startsWith('/quotations')) {
      setExpandedSections((prev) => ({ ...prev, '/quotations': true }))
    }
    if (location.pathname.startsWith('/purchasing')) {
      setExpandedSections((prev) => ({ ...prev, '/purchasing': true }))
    }
    if (location.pathname.startsWith('/accounting')) {
      setExpandedSections((prev) => ({ ...prev, '/accounting': true }))
    }
    if (location.pathname.startsWith('/contacts')) {
      setExpandedSections((prev) => ({ ...prev, '/contacts': true }))
    }
  }, [location.pathname])

  const toggleSection = (path) => {
    setExpandedSections((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  const isSubActive = (subPath) => {
    if (subPath.includes('?')) {
      const [path, search] = subPath.split('?')
      if (location.pathname !== path) return false
      const currentParams = new URLSearchParams(location.search)
      const targetParams = new URLSearchParams(search)
      const defaultTab = path === '/purchasing' ? 'pipeline' : path === '/quotations' ? 'all' : null
      const currentTab = currentParams.get('tab') || defaultTab
      if (targetParams.has('tab')) {
        return currentTab === targetParams.get('tab')
      }
      if (targetParams.has('role')) {
        const defaultRole = path === '/contacts' ? 'all' : null
        const currentRole = currentParams.get('role') || defaultRole
        return currentRole === targetParams.get('role')
      }
      for (const [key, val] of targetParams.entries()) {
        if (currentParams.get(key) !== val) return false
      }
      return true
    }
    return location.pathname === subPath || location.pathname.startsWith(subPath + '/')
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
              const isSectionActive = location.pathname.startsWith(i.path)
              const isExpanded = expandedSections[i.path] ?? isSectionActive

              return (
                <div key={i.path} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(i.path)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      isSectionActive
                        ? 'bg-white/[0.08] text-white shadow-xs'
                        : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={isSectionActive ? 'text-amber-400' : 'text-slate-400'}>
                        {icon}
                      </span>
                      <span>{i.label}</span>
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>

                  {/* Sub-Items */}
                  {isExpanded && (
                    <div className="pl-3 pr-1 py-1 space-y-1 border-l border-slate-800 ml-3.5">
                      {i.children.map((sub) => {
                        const active = isSubActive(sub.path)
                        return (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                              active
                                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shadow-xs'
                                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                                active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'
                              }`}
                            />
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
                  `flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-300 font-bold border-l-2 border-emerald-400 shadow-xs'
                      : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                      {icon}
                    </span>
                    <span>{i.label}</span>
                    {i.path === '/store' && pendingStoreCount > 0 && (
                      <span className="ml-auto rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black font-mono shadow-sm animate-pulse">
                        {pendingStoreCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User Profile Card & Theme Switcher at Bottom */}
        <div className="mt-auto pt-4 border-t border-slate-800/80 space-y-2">
          {/* Theme Switcher in Sidebar */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] px-3 py-2 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
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
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300">
              สลับธีม
            </span>
          </button>

          <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3 backdrop-blur-sm shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-slate-700 to-slate-600 text-white font-bold text-xs uppercase shadow-xs">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-white truncate">{profile.full_name}</div>
                <div className="text-[10px] text-amber-400/90 font-medium truncate">{ROLE_LABELS[profile.role]}</div>
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
        {/* Floating Glassmorphism Sticky Bar */}
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

              {/* Breadcrumbs Module & Feature Indicator (ระบุตำแหน่งโมดูลและคลิกเพื่อไปยังโมดูลได้) */}
              {(() => {
                const locInfo = getLocationBreadcrumb(location.pathname, location.search)
                return (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50/60 dark:bg-slate-800/90 border border-emerald-100/80 dark:border-slate-700 text-xs shadow-2xs">
                    <Link
                      to={locInfo.modulePath || '/'}
                      className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-amber-400 transition group"
                      title={`คลิกเพื่อไปยังหน้าหลักของ ${locInfo.module}`}
                    >
                      <span className="text-sm group-hover:scale-110 transition-transform">{locInfo.icon}</span>
                      <span className="hidden md:inline group-hover:underline">{locInfo.module}</span>
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 text-emerald-400/80 dark:text-slate-400 hidden md:inline" />
                    <span className="font-black text-emerald-700 dark:text-amber-400">{locInfo.feature}</span>
                  </div>
                )
              })()}
            </div>

            <div className="flex items-center gap-3">
              {/* Theme Toggle Button in Header */}
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-amber-400 transition shadow-2xs cursor-pointer active:scale-95"
                title={isDark ? 'เปลี่ยนเป็นธีมกลางวัน (Light Mode)' : 'เปลี่ยนเป็นธีมกลางคืน (Dark Mode)'}
              >
                {isDark ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="hidden sm:inline text-emerald-400">กลางวัน</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-emerald-700 dark:text-slate-400" />
                    <span className="hidden sm:inline text-slate-700">กลางคืน</span>
                  </>
                )}
              </button>

              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:flex items-center gap-2">
                <span className="hidden lg:inline text-slate-400 dark:text-slate-500">ANVA & CO. ERP</span>
              </div>
            </div>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  )
}
