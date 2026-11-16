import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Package,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  RotateCcw,
  ShoppingCart,
  Sun,
  ShieldCheck,
  Building2,
  ArrowLeft,
} from 'lucide-react'

const storeNavGroups = [
  {
    groupLabel: 'งานสต็อก & ทะเบียน',
    items: [
      { to: '/store', label: 'สต็อกวัสดุ', icon: Package, end: true },
      { to: '/store/items', label: 'ทะเบียน & หมวดหมู่', icon: Layers },
    ],
  },
  {
    groupLabel: 'งานรับ-เบิก-คืน พัสดุ',
    items: [
      { to: '/store/receipts', label: 'รับของเข้า', icon: ArrowDownToLine },
      { to: '/store/issue/new', label: 'เบิกของ', icon: ArrowUpFromLine },
      { to: '/store/adjust', label: 'คืนของ', icon: RotateCcw },
      { to: '/store/issues', label: 'ประวัติการเบิก', icon: History },
    ],
  },
  {
    groupLabel: 'จัดซื้อ',
    items: [
      { to: '/purchasing', label: 'ฝ่ายจัดซื้อ (PO/PR)', icon: ShoppingCart },
    ],
  },
]

export default function StoreLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50/70 pb-12 font-sans">
      {/* 1. ANVA & Co. Engineering Brand Header (Navy & Solar Gold Theme) */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 text-white shadow-md border-b border-steel-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5">
          {/* Top Brand Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-steel-700/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-hivis text-steel-900 font-black shadow-md shadow-amber-500/20 shrink-0">
                <Sun className="h-6 w-6 text-steel-900 fill-steel-900" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                    ANVA & CO. — ระบบบริหารคลังและพัสดุวิศวกรรม
                  </h1>
                  <span className="rounded-md bg-hivis/20 text-hivis px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-hivis/40">
                    Solar Standard
                  </span>
                </div>
                <p className="text-xs text-steel-400">
                  ระบบคลังวัสดุและอุปกรณ์มาตรฐานวิศวกรรม บริษัท อันวาแอนด์โค จำกัด
                </p>
              </div>
            </div>

            {/* Actions & Engineering Highlights */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 rounded-lg bg-steel-800 hover:bg-steel-700 px-3 py-1.5 text-xs font-bold text-steel-200 border border-steel-600 transition cursor-pointer"
                title="ย้อนกลับ"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>ย้อนกลับ</span>
              </button>

              <span className="hidden md:flex items-center gap-1.5 rounded-lg bg-steel-800/80 px-3 py-1 text-steel-300 border border-steel-700">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>มาตรฐานวิศวกรรม</span>
              </span>
              <span className="hidden lg:flex items-center gap-1.5 rounded-lg bg-steel-800/80 px-3 py-1 text-steel-300 border border-steel-700">
                <Building2 className="h-4 w-4 text-hivis" />
                <span>เชื่อมโยงโครงการ 100%</span>
              </span>
            </div>
          </div>

          {/* 2. Compact Wrapped Navigation (ไม่เลื่อน <---> จัดหมวดหมู่ชัดเจน อ่านง่าย) */}
          <div className="pt-2.5 flex flex-wrap items-center gap-2 sm:gap-4">
            {storeNavGroups.map((group, gIdx) => (
              <div key={gIdx} className="flex flex-wrap items-center gap-1">
                {group.items.map((t) => {
                  const Icon = t.icon
                  const isMatch = t.end
                    ? location.pathname === t.to
                    : location.pathname.startsWith(t.to)

                  return (
                    <NavLink
                      key={t.to}
                      to={t.to}
                      end={t.end}
                      className={({ isActive }) => `
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all
                        ${isActive
                          ? 'bg-hivis text-steel-950 font-black shadow-xs'
                          : 'text-steel-300 hover:bg-steel-800 hover:text-white'
                        }
                      `}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{t.label}</span>
                    </NavLink>
                  )
                })}
                {gIdx < storeNavGroups.length - 1 && (
                  <div className="hidden sm:block h-4 w-px bg-steel-700 mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Page Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6">
        <Outlet />
      </div>
    </div>
  )
}
