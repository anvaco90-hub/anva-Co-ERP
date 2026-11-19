import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen, Users, Building2, Percent, Receipt, FileText, CheckCircle2
} from 'lucide-react'

const TABS = [
  {
    to: '/accounting/journals',
    label: 'สมุดรายวัน & ตรวจสอบบัญชี',
    subLabel: 'Journal Entries & GL',
    icon: BookOpen,
  },
  {
    to: '/accounting/ar-aging',
    label: 'รายงานลูกหนี้ (AR Aging)',
    subLabel: 'Accounts Receivable',
    icon: Users,
  },
  {
    to: '/accounting/ap-aging',
    label: 'รายงานเจ้าหนี้ (AP Aging)',
    subLabel: 'Accounts Payable',
    icon: Building2,
  },
  {
    to: '/accounting/expenses',
    label: 'ค่าใช้จ่าย & เงินสำรองจ่าย',
    subLabel: 'Expenses & Advances',
    icon: Receipt,
  },
  {
    to: '/accounting/tax-reports',
    label: 'ระบบภาษีครบวงจร',
    subLabel: 'ภ.พ.30 & WHT',
    icon: Percent,
  },
  {
    to: '/accounting/chart-of-accounts',
    label: 'ผังบัญชี',
    subLabel: 'Chart of Accounts',
    icon: FileText,
  },
]

export default function AccountingLayout() {
  return (
    <div className="space-y-4">
      {/* Top Navigation Bar with FlowAccount ERP Styling */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-steel-200 dark:border-slate-800 shadow-sm p-1.5 overflow-x-auto">
        <nav className="flex items-center gap-1 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                    isActive
                      ? 'bg-sky-700 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm'
                      : 'text-steel-600 dark:text-slate-300 hover:text-sky-800 dark:hover:text-amber-300 hover:bg-steel-50 dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <div className="text-left">
                  <div className="leading-tight">{tab.label}</div>
                  <div className="text-[10px] font-normal opacity-75">{tab.subLabel}</div>
                </div>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Render the Active Sub-Page */}
      <div>
        <Outlet />
      </div>
    </div>
  )
}

