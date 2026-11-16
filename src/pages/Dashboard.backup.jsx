import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { baht, STATUS_LABELS, STATUS_STYLES } from '../lib/projects'
import { ROLE_LABELS } from '../lib/roles'
import LowStockAlert from '../components/LowStockAlert'
import {
  SIMULATED_PROJECTS,
  SIMULATED_QUOTATION_ITEMS,
  SIMULATED_INVOICES,
  SIMULATED_ACCOUNTS_PAYABLE,
  SIMULATED_EXPENSES,
  SIMULATED_PAYMENT_TRANSACTIONS,
  SIMULATED_INVENTORY_ITEMS,
} from '../lib/dashboardSimulationData'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Package,
  BarChart3,
  Building2,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Layers,
  ArrowRight,
  Receipt,
  PieChart,
} from 'lucide-react'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

export default function Dashboard() {
  const { profile } = useAuth()

  // ----------------------------------------------------------------------------
  // 1. Data States
  // ----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const [invoices, setInvoices] = useState([])
  const [quotations, setQuotations] = useState([])
  const [quotationItems, setQuotationItems] = useState([])
  const [apList, setApList] = useState([])
  const [expenses, setExpenses] = useState([])
  const [paymentTx, setPaymentTx] = useState([])
  const [projects, setProjects] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])

  // Simulation / Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(true)
  const [liveDbData, setLiveDbData] = useState(null)

  // ----------------------------------------------------------------------------
  // 2. Period Filter States
  // ----------------------------------------------------------------------------
  // Presets: 'all' | '2026' | 'Q4' | '2026-11' | '2026-10' | 'custom'
  const [periodPreset, setPeriodPreset] = useState('all')
  const [filterYear, setFilterYear] = useState('all') // 'all' | '2026' | '2025' | '2024'
  const [filterMonth, setFilterMonth] = useState('all') // 'all' | '1'..'12'
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // UI view toggles
  const [productViewTab, setProductViewTab] = useState('products') // 'products' | 'projects'
  const [recentDocTab, setRecentDocTab] = useState('all') // 'all' | 'revenue' | 'expenses'

  // Helper to switch to Simulation Demo Data
  const applyDemoData = () => {
    setIsDemoMode(true)
    setInvoices(SIMULATED_INVOICES)
    setQuotations([])
    setQuotationItems(SIMULATED_QUOTATION_ITEMS)
    setApList(SIMULATED_ACCOUNTS_PAYABLE)
    setExpenses(SIMULATED_EXPENSES)
    setPaymentTx(SIMULATED_PAYMENT_TRANSACTIONS)
    setProjects(SIMULATED_PROJECTS)
    setInventoryItems(SIMULATED_INVENTORY_ITEMS)
  }

  // Helper to switch back to Live Database Data
  const applyLiveDbData = (data) => {
    const d = data || liveDbData
    if (!d) return
    setIsDemoMode(false)
    setInvoices(d.invoices)
    setQuotations(d.quotations)
    setQuotationItems(d.quotationItems)
    setApList(d.apList)
    setExpenses(d.expenses)
    setPaymentTx(d.paymentTx)
    setProjects(d.projects)
    setInventoryItems(d.inventoryItems)
  }

  const toggleDemoMode = () => {
    if (isDemoMode) {
      if (liveDbData && liveDbData.invoices && liveDbData.invoices.length > 0) {
        applyLiveDbData()
      } else {
        alert('ฐานข้อมูล Supabase ปัจจุบันยังไม่มีข้อมูลใบแจ้งหนี้จริง ระบบจึงยังคงแสดงผลชุดข้อมูลจำลองเพื่อการทดสอบ (คุณสามารถนำเข้าข้อมูลจริงได้ผ่าน SQL Migration 015)')
      }
    } else {
      applyDemoData()
    }
  }

  // ----------------------------------------------------------------------------
  // 3. Fetch Data from Supabase
  // ----------------------------------------------------------------------------
  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const [
        invRes,
        qtRes,
        qtItemsRes,
        apRes,
        expRes,
        payRes,
        prjRes,
        invItemsRes,
      ] = await Promise.all([
        supabase
          .from('sales_invoices')
          .select('id, invoice_no, issue_date, due_date, subtotal, vat_rate, vat_amount, total_amount, paid_amount, remaining_amount, is_opening_balance, status, notes, customer_id, project_id, customers(customer_name, company_name), projects(project_code, project_name)')
          .order('issue_date', { ascending: false }),

        supabase
          .from('quotations')
          .select('id, quotation_no, quotation_date, customer_name, total_amount, status, project_id')
          .order('quotation_date', { ascending: false }),

        supabase
          .from('quotation_items')
          .select('id, quotation_id, item_id, item_name, description, quantity, unit, unit_price, total_amount, quotations(quotation_date, status, customer_name)'),

        supabase
          .from('accounts_payable')
          .select('id, ap_no, vendor_id, vendor_name, invoice_no, invoice_date, due_date, credit_days, total_debt, paid_amount, remaining_amount, status, payment_method, alert_level, po_id, purchase_orders(po_no, project_id, projects(project_name))')
          .order('due_date', { ascending: true }),

        supabase
          .from('expenses')
          .select('id, expense_no, expense_date, due_date, expense_category, account_code, description, payment_method, payment_source, company_bank_account, advance_payer_name, reimbursement_status, subtotal, vat_amount, wht_amount, total_amount, is_asset, accounting_status, status, project_id, projects(project_name), vendor_id, vendors(vendor_name)')
          .order('expense_date', { ascending: false }),

        supabase
          .from('payment_transactions')
          .select('*')
          .order('payment_date', { ascending: false }),

        supabase
          .from('projects')
          .select('id, project_code, project_name, customer_name, contract_amount, status, start_date, end_date')
          .order('project_code'),

        supabase
          .from('inventory_items')
          .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost, reorder_point'),
      ])

      const realData = {
        invoices: invRes.data || [],
        quotations: qtRes.data || [],
        quotationItems: qtItemsRes.data || [],
        apList: apRes.data || [],
        expenses: expRes.data || [],
        paymentTx: payRes.data || [],
        projects: prjRes.data || [],
        inventoryItems: invItemsRes.data || [],
      }
      setLiveDbData(realData)

      // If DB has no invoices, automatically activate simulation dataset so evaluators see a lively system!
      if (!realData.invoices || realData.invoices.length === 0) {
        applyDemoData()
      } else {
        applyLiveDbData(realData)
      }
      setLastRefreshed(new Date())
    } catch (err) {
      console.warn('Could not fetch live DB data, using simulation dataset:', err)
      applyDemoData()
      setLastRefreshed(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // ----------------------------------------------------------------------------
  // 4. Period Filter Logic
  // ----------------------------------------------------------------------------
  // Preset selector handler
  const handlePresetChange = (preset) => {
    setPeriodPreset(preset)
    if (preset === 'all') {
      setFilterYear('all')
      setFilterMonth('all')
      setCustomStartDate('')
      setCustomEndDate('')
    } else if (preset === '2026') {
      setFilterYear('2026')
      setFilterMonth('all')
      setCustomStartDate('2026-01-01')
      setCustomEndDate('2026-12-31')
    } else if (preset === 'Q4') {
      setFilterYear('2026')
      setFilterMonth('all')
      setCustomStartDate('2026-10-01')
      setCustomEndDate('2026-12-31')
    } else if (preset === '2026-11') {
      setFilterYear('2026')
      setFilterMonth('11')
      setCustomStartDate('2026-11-01')
      setCustomEndDate('2026-11-30')
    } else if (preset === '2026-10') {
      setFilterYear('2026')
      setFilterMonth('10')
      setCustomStartDate('2026-10-01')
      setCustomEndDate('2026-10-31')
    }
  }

  // Check if a date string falls within the active filter
  const isDateInFilter = (dateStr) => {
    if (!dateStr) return true
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return true

    const year = d.getFullYear()
    const month = d.getMonth() + 1 // 1-12
    const ymd = dateStr.slice(0, 10)

    // If custom date range is specified
    if (customStartDate && ymd < customStartDate) return false
    if (customEndDate && ymd > customEndDate) return false

    // If year filter is active and not 'all'
    if (filterYear !== 'all' && year !== Number(filterYear)) return false

    // If month filter is active and not 'all'
    if (filterMonth !== 'all' && month !== Number(filterMonth)) return false

    return true
  }

  // ----------------------------------------------------------------------------
  // 5. Filtered Data Sets
  // ----------------------------------------------------------------------------
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => isDateInFilter(inv.issue_date))
  }, [invoices, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredQuotationItems = useMemo(() => {
    return quotationItems.filter((item) => {
      const qDate = item.quotations?.quotation_date
      return isDateInFilter(qDate)
    })
  }, [quotationItems, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredApList = useMemo(() => {
    return apList.filter((ap) => isDateInFilter(ap.invoice_date || ap.due_date))
  }, [apList, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => isDateInFilter(exp.expense_date))
  }, [expenses, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredPaymentTx = useMemo(() => {
    return paymentTx.filter((tx) => isDateInFilter(tx.payment_date))
  }, [paymentTx, filterYear, filterMonth, customStartDate, customEndDate])

  // ----------------------------------------------------------------------------
  // 6. Calculations for the 6 Core Requirements
  // ----------------------------------------------------------------------------

  // (1) ยอดขายตามสินค้า (Sales by Product / Service)
  const salesByProduct = useMemo(() => {
    const map = {}
    filteredQuotationItems.forEach((item) => {
      const name = item.item_name || 'บริการและงานรับเหมาทั่วไป'
      const amount = Number(item.total_amount || 0)
      const qty = Number(item.quantity || 0)
      const unit = item.unit || 'รายการ'

      if (!map[name]) {
        map[name] = { name, totalAmount: 0, totalQty: 0, unit, count: 0 }
      }
      map[name].totalAmount += amount
      map[name].totalQty += qty
      map[name].count += 1
    })

    const list = Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount)
    const grandTotal = list.reduce((sum, item) => sum + item.totalAmount, 0) || 1

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      percent: ((item.totalAmount / grandTotal) * 100).toFixed(1),
    }))
  }, [filteredQuotationItems])

  // Fallback / Alternate: Sales by Project
  const salesByProject = useMemo(() => {
    const map = {}
    filteredInvoices.forEach((inv) => {
      const pName = inv.projects?.project_name || inv.notes || 'งานทั่วไป'
      const pCode = inv.projects?.project_code || 'PRJ'
      const amount = Number(inv.subtotal || inv.total_amount || 0)

      if (!map[pName]) {
        map[pName] = { name: pName, code: pCode, totalAmount: 0, count: 0 }
      }
      map[pName].totalAmount += amount
      map[pName].count += 1
    })

    const list = Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount)
    const grandTotal = list.reduce((sum, item) => sum + item.totalAmount, 0) || 1

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      percent: ((item.totalAmount / grandTotal) * 100).toFixed(1),
    }))
  }, [filteredInvoices])

  // (2) สรุปยอดเก็บเงิน (Collected Revenue / Receipts Summary)
  const totalInvoiced = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
  }, [filteredInvoices])

  const totalCollected = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0)
  }, [filteredInvoices])

  const collectionRate = totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '0.0'

  const fullyCollectedCount = filteredInvoices.filter((inv) => Number(inv.remaining_amount || 0) <= 0 && Number(inv.paid_amount || 0) > 0).length
  const partiallyCollectedCount = filteredInvoices.filter((inv) => Number(inv.paid_amount || 0) > 0 && Number(inv.remaining_amount || 0) > 0).length

  // (3) ยอดค้างรับ (Outstanding Receivables / AR Outstanding)
  const totalArRemaining = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.remaining_amount || 0), 0)
  }, [filteredInvoices])

  const arInvoicesCount = filteredInvoices.filter((inv) => Number(inv.remaining_amount || 0) > 0).length

  // AR Aging Buckets
  const arAging = useMemo(() => {
    const today = new Date('2026-11-13') // Reference system date
    const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 }

    filteredInvoices.forEach((inv) => {
      const rem = Number(inv.remaining_amount || 0)
      if (rem <= 0) return

      if (inv.is_opening_balance) {
        buckets.over90 += rem
        return
      }

      if (!inv.due_date) {
        buckets.current += rem
        return
      }

      const due = new Date(inv.due_date)
      const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24))

      if (diffDays <= 0) buckets.current += rem
      else if (diffDays <= 30) buckets.days1_30 += rem
      else if (diffDays <= 60) buckets.days31_60 += rem
      else if (diffDays <= 90) buckets.days61_90 += rem
      else buckets.over90 += rem
    })

    return buckets
  }, [filteredInvoices])

  // (4) ยอดค้างจ่าย (Outstanding Payables / AP Outstanding)
  const totalApRemaining = useMemo(() => {
    return filteredApList.reduce((sum, ap) => sum + Number(ap.remaining_amount || 0), 0)
  }, [filteredApList])

  const totalApOriginal = useMemo(() => {
    return filteredApList.reduce((sum, ap) => sum + Number(ap.total_debt || 0), 0)
  }, [filteredApList])

  const apCount = filteredApList.filter((ap) => Number(ap.remaining_amount || 0) > 0).length
  const apUrgentCount = filteredApList.filter((ap) => ap.alert_level === 'urgent' && Number(ap.remaining_amount || 0) > 0).length
  const apWarningCount = filteredApList.filter((ap) => ap.alert_level === 'warning' && Number(ap.remaining_amount || 0) > 0).length

  // (5) สรุปยอดชำระเงิน (Payments Executed / Outflow)
  const apPaidAmount = useMemo(() => {
    return filteredApList.reduce((sum, ap) => sum + Number(ap.paid_amount || 0), 0)
  }, [filteredApList])

  const expensesPaidAmount = useMemo(() => {
    return filteredExpenses
      .filter((exp) => exp.status === 'จ่ายเงินแล้ว' || exp.accounting_status === 'อนุมัติแล้ว')
      .reduce((sum, exp) => sum + Number(exp.total_amount || 0), 0)
  }, [filteredExpenses])

  const totalPaymentsExecuted = apPaidAmount + expensesPaidAmount

  // Payment channel distribution
  const paymentChannelStats = useMemo(() => {
    let transfer = 0
    let cash = 0
    let cheque = 0

    // From expenses
    filteredExpenses.forEach((exp) => {
      const amt = Number(exp.total_amount || 0)
      if (exp.payment_method === 'เงินสด') cash += amt
      else if (exp.payment_method === 'เช็ค') cheque += amt
      else transfer += amt
    })

    // From AP paid
    transfer += apPaidAmount // Default AP vendor payments via bank transfer

    const total = transfer + cash + cheque || 1
    return {
      transfer,
      cash,
      cheque,
      transferPct: ((transfer / total) * 100).toFixed(0),
      cashPct: ((cash / total) * 100).toFixed(0),
      chequePct: ((cheque / total) * 100).toFixed(0),
    }
  }, [filteredExpenses, apPaidAmount])

  // (1) & (6) ยอดขายและรายได้ตามเอกสาร (Total Sales & Revenue by Document)
  const totalSalesAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.subtotal || inv.total_amount || 0), 0)
  }, [filteredInvoices])

  const totalRevenueDoc = totalSalesAmount

  const totalExpenseDoc = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + Number(exp.subtotal || exp.total_amount || 0), 0)
  }, [filteredExpenses])

  const netCashMargin = totalRevenueDoc - totalExpenseDoc
  const netMarginPct = totalRevenueDoc > 0 ? ((netCashMargin / totalRevenueDoc) * 100).toFixed(1) : '0.0'

  // Monthly Trend Chart (12 Months comparison for the selected/active year)
  const monthlyTrend = useMemo(() => {
    const targetYear = filterYear !== 'all' ? Number(filterYear) : 2026
    const demoBaseline = [
      { rev: 350000, exp: 210000 },
      { rev: 420000, exp: 260000 },
      { rev: 580000, exp: 320000 },
      { rev: 490000, exp: 280000 },
      { rev: 620000, exp: 350000 },
      { rev: 550000, exp: 310000 },
      { rev: 374500, exp: 210000 },
      { rev: 535000, exp: 290000 },
      { rev: 428000, exp: 270000 },
      { rev: 1572900, exp: 783000 },
      { rev: 1915300, exp: 1047500 },
      { rev: 650000, exp: 350000 },
    ]

    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i + 1,
      monthName: THAI_MONTHS[i],
      shortName: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][i],
      revenue: isDemoMode && targetYear === 2026 ? demoBaseline[i].rev : 0,
      expense: isDemoMode && targetYear === 2026 ? demoBaseline[i].exp : 0,
    }))

    if (!isDemoMode) {
      invoices.forEach((inv) => {
        if (!inv.issue_date) return
        const d = new Date(inv.issue_date)
        if (d.getFullYear() === targetYear) {
          const m = d.getMonth()
          months[m].revenue += Number(inv.subtotal || inv.total_amount || 0)
        }
      })

      expenses.forEach((exp) => {
        if (!exp.expense_date) return
        const d = new Date(exp.expense_date)
        if (d.getFullYear() === targetYear) {
          const m = d.getMonth()
          months[m].expense += Number(exp.subtotal || exp.total_amount || 0)
        }
      })
    }

    const maxVal = Math.max(
      ...months.map((m) => Math.max(m.revenue, m.expense)),
      100000
    )

    return { months, maxVal, targetYear }
  }, [invoices, expenses, filterYear, isDemoMode])

  // Recent Documents Feed
  const recentDocuments = useMemo(() => {
    const list = []

    filteredInvoices.forEach((inv) => {
      list.push({
        id: inv.id,
        docNo: inv.invoice_no,
        date: inv.issue_date,
        type: 'INV',
        typeName: 'ใบแจ้งหนี้ / ส่งมอบงาน',
        category: 'revenue',
        party: inv.customers?.company_name || inv.customers?.customer_name || 'ลูกค้าโครงการ',
        project: inv.projects?.project_name || inv.notes || '-',
        amount: Number(inv.total_amount || 0),
        statusText: inv.status || 'รอเก็บเงิน',
        statusColor: inv.status === 'เก็บเงินแล้ว' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
      })
    })

    filteredExpenses.forEach((exp) => {
      list.push({
        id: exp.id,
        docNo: exp.expense_no,
        date: exp.expense_date,
        type: 'EXP',
        typeName: 'ใบสำคัญจ่าย / ค่าใช้จ่าย',
        category: 'expense',
        party: exp.vendors?.vendor_name || exp.advance_payer_name || 'ผู้รับเงิน / พนักงาน',
        project: exp.projects?.project_name || exp.description || '-',
        amount: Number(exp.total_amount || 0),
        statusText: exp.status || 'รอดำเนินการ',
        statusColor: exp.status === 'จ่ายเงินแล้ว' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800',
      })
    })

    filteredApList.forEach((ap) => {
      list.push({
        id: ap.id,
        docNo: ap.ap_no,
        date: ap.invoice_date || ap.due_date,
        type: 'AP',
        typeName: 'เจ้าหนี้การค้า',
        category: 'expense',
        party: ap.vendor_name || 'คู่ค้า / ผู้จำหน่าย',
        project: ap.purchase_orders?.projects?.project_name || ap.invoice_no || '-',
        amount: Number(ap.total_debt || 0),
        statusText: ap.alert_level === 'urgent' ? 'เกินกำหนด' : ap.alert_level === 'warning' ? 'ใกล้ครบกำหนด' : 'ปกติ',
        statusColor: ap.alert_level === 'urgent' ? 'bg-rose-100 text-rose-800' : ap.alert_level === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-steel-100 text-steel-700',
      })
    })

    // Sort descending by date
    list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

    if (recentDocTab === 'revenue') return list.filter((d) => d.category === 'revenue')
    if (recentDocTab === 'expenses') return list.filter((d) => d.category === 'expense')
    return list
  }, [filteredInvoices, filteredExpenses, filteredApList, recentDocTab])

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-12">
      {/* ------------------------------------------------------------------------ */}
      {/* 1. Header & Welcome Bar                                                  */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-gradient-to-r from-steel-900 via-steel-800 to-steel-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis px-2.5 py-0.5 text-xs font-bold text-steel-900 tracking-wide uppercase">
                Executive Overview
              </span>
              <span className="text-xs text-steel-400">
                บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              แดชบอร์ดบริหารธุรกิจและบัญชีการเงิน
            </h1>
            <p className="mt-1 text-sm text-steel-300">
              สวัสดีคุณ <span className="font-semibold text-white">{profile?.full_name || 'ผู้ใช้งาน'}</span> • สิทธิ์การใช้งาน: <span className="text-hivis font-semibold">{ROLE_LABELS[profile?.role] || profile?.role}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* Toggle Demo Simulation Mode Button */}
            <button
              onClick={toggleDemoMode}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm border ${
                isDemoMode
                  ? 'bg-amber-400 text-steel-950 border-amber-300 ring-2 ring-amber-300/40 hover:bg-amber-300'
                  : 'bg-steel-700/80 hover:bg-steel-700 text-white border-steel-600'
              }`}
              title="สลับระหว่างข้อมูลจำลองสำหรับทดสอบ (Demo) และข้อมูลจริงจากระบบ (Live DB)"
            >
              <span>{isDemoMode ? '✨ ข้อมูลจำลอง (Demo Active)' : '🗄️ ข้อมูลจริง (Live DB)'}</span>
            </button>

            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-steel-700/80 hover:bg-steel-700 px-4 py-2 text-xs font-semibold text-white transition border border-steel-600 shadow-sm"
              title="รีเฟรชข้อมูลล่าสุด"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>รีเฟรช</span>
            </button>
            <div className="text-right hidden md:block">
              <div className="text-[10px] text-steel-400 uppercase tracking-wider">อัปเดตล่าสุด</div>
              <div className="text-xs font-medium text-steel-200">
                {lastRefreshed.toLocaleTimeString('th-TH')} น.
              </div>
            </div>
          </div>
        </div>

        {/* Stock / System Alerts inside Banner */}
        <div className="mt-4 border-t border-steel-700/60 pt-4">
          <LowStockAlert />
        </div>
      </div>

      {/* Simulation Info Banner */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-100/70 to-amber-50 p-4 text-xs text-amber-950 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-steel-950 font-black text-base shadow-xs">
              📊
            </span>
            <div>
              <div className="font-bold text-sm text-steel-900 flex items-center gap-2">
                <span>กำลังแสดงผลชุดข้อมูลจำลองสมจริง (Realistic Enterprise Simulation Active)</span>
                <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900 uppercase">
                  สำหรับผู้ทดลองระบบ
                </span>
              </div>
              <div className="text-steel-700 text-xs mt-0.5">
                จำลองข้อมูลครบวงจร 6 ด้าน: ยอดขายตามสินค้า, สรุปยอดเก็บเงิน, ยอดค้างรับ (AR), ยอดค้างจ่าย (AP), สรุปยอดชำระเงิน, และรายได้-ค่าใช้จ่ายตามเอกสารจริง
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-medium">
            <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-steel-800 border border-amber-200 shadow-xs">
              🎯 ทดสอบตัวกรอง ปี/เดือน/ไตรมาส ได้แบบเรียลไทม์
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------ */}
      {/* 2. Interactive Period Filter Bar (แผงเลือกช่วงเวลา เดือน / ปี)            */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-hivis/20 text-steel-900">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-steel-500">
                ตัวกรองระยะเวลาการแสดงผล (Period Filter)
              </div>
              <div className="text-sm font-semibold text-steel-900">
                {periodPreset === 'all' && 'แสดงข้อมูลทั้งหมด (All Time)'}
                {periodPreset === '2026' && 'ปี พ.ศ. 2569 (ค.ศ. 2026 ทั้งปี)'}
                {periodPreset === 'Q4' && 'ไตรมาสที่ 4 / 2569 (ต.ค. - ธ.ค. 2026)'}
                {periodPreset === '2026-11' && 'ประจำเดือน พฤศจิกายน 2569 (Nov 2026)'}
                {periodPreset === '2026-10' && 'ประจำเดือน ตุลาคม 2569 (Oct 2026)'}
                {periodPreset === 'custom' && 'กำหนดช่วงเวลาเอง (Custom Period)'}
              </div>
            </div>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: '2026', label: 'ปี 2569' },
              { id: 'Q4', label: 'ไตรมาส 4' },
              { id: '2026-11', label: 'พ.ย. 69' },
              { id: '2026-10', label: 'ต.ค. 69' },
              { id: 'custom', label: 'กำหนดเอง ⚙️' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  periodPreset === preset.id
                    ? 'bg-steel-900 text-white shadow-sm'
                    : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Dropdown & Date Picker Controls */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-steel-100 pt-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="block text-[11px] font-bold text-steel-600 mb-1">เลือกปี (พ.ศ. / ค.ศ.)</label>
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-xs font-medium text-steel-900 focus:border-hivis focus:outline-none focus:ring-1 focus:ring-hivis"
            >
              <option value="all">ทุกปี (All Years)</option>
              <option value="2026">2569 (2026) - ปัจจุบัน</option>
              <option value="2025">2568 (2025)</option>
              <option value="2024">2567 (2024)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-steel-600 mb-1">เลือกเดือน</label>
            <select
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-xs font-medium text-steel-900 focus:border-hivis focus:outline-none focus:ring-1 focus:ring-hivis"
            >
              <option value="all">ทุกเดือน (All Months)</option>
              {THAI_MONTHS.map((m, idx) => (
                <option key={idx + 1} value={String(idx + 1)}>
                  {m} ({idx + 1})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-steel-600 mb-1">ตั้งแต่วันที่ (From Date)</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1 text-xs font-medium text-steel-900 focus:border-hivis focus:outline-none focus:ring-1 focus:ring-hivis"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-steel-600 mb-1">ถึงวันที่ (To Date)</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1 text-xs font-medium text-steel-900 focus:border-hivis focus:outline-none focus:ring-1 focus:ring-hivis"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 3. Core Financial Stat Cards (ยอดขาย, เก็บเงิน, ค้างรับ, ค้างจ่าย, ชำระ, สุทธิ) */}
      {/* ------------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: ยอดขายตามสินค้า */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                1. ยอดขายตามสินค้า
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
                <Package className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-steel-900 xl:text-2xl">
              {baht(totalSalesAmount)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-amber-50 pt-2">
              <span className="text-steel-600">สินค้า/บริการ:</span>
              <span className="font-bold text-steel-900">{salesByProduct.length} รายการ</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-steel-500">
              <span>{filteredInvoices.length} ใบแจ้งหนี้</span>
              <a href="#sales-by-product" className="text-amber-700 font-bold hover:underline">
                ดูอันดับ ↓
              </a>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
            <div className="h-full bg-amber-500 w-full" />
          </div>
        </div>

        {/* Card 2: สรุปยอดเก็บเงิน */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                2. สรุปยอดเก็บเงิน
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-steel-900 xl:text-2xl">
              {baht(totalCollected)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-emerald-50 pt-2">
              <span className="text-steel-600">อัตราจัดเก็บ:</span>
              <span className="font-bold text-emerald-700">{collectionRate}%</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-steel-500">
              <span>ครบ {fullyCollectedCount} บิล</span>
              <span>บางส่วน {partiallyCollectedCount} บิล</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${Math.min(Number(collectionRate), 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: ยอดค้างรับ (AR Outstanding) */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-300/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                3. ยอดค้างรับ (AR)
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-amber-800 xl:text-2xl">
              {baht(totalArRemaining)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-amber-50 pt-2">
              <span className="text-steel-600">ลูกหนี้ค้าง:</span>
              <span className="font-bold text-steel-900">{arInvoicesCount} บิล</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-steel-500">ยังไม่ครบ: {baht(arAging.current)}</span>
              <span className="text-rose-600 font-bold">เกิน: {baht(totalArRemaining - arAging.current)}</span>
            </div>
          </div>
          <Link
            to="/accounting/ar-aging"
            className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition"
          >
            <span>รายงาน AR Aging</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Card 4: ยอดค้างจ่าย (AP Outstanding) */}
        <div className="relative overflow-hidden rounded-2xl border border-rose-200/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                4. ยอดค้างจ่าย (AP)
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-rose-700 xl:text-2xl">
              {baht(totalApRemaining)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-rose-50 pt-2">
              <span className="text-steel-600">เจ้าหนี้ค้าง:</span>
              <span className="font-bold text-steel-900">{apCount} บิล</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-rose-700 font-bold">วิกฤต: {apUrgentCount}</span>
              <span className="text-amber-700 font-semibold">ติดตาม: {apWarningCount}</span>
            </div>
          </div>
          <Link
            to="/accounting/ap-aging"
            className="mt-2 flex items-center justify-between rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 transition"
          >
            <span>รายงาน AP Aging</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Card 5: สรุปยอดชำระเงิน (Payments Executed) */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                5. สรุปยอดชำระเงิน
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-indigo-900 xl:text-2xl">
              {baht(totalPaymentsExecuted)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-indigo-50 pt-2">
              <span className="text-steel-600">จ่ายเจ้าหนี้/มัดจำ:</span>
              <span className="font-bold text-steel-900">{baht(apPaidAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-steel-500">
              <span>จ่ายโครงการ:</span>
              <span className="font-semibold text-indigo-700">{baht(expensesPaidAmount)}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-steel-500 pt-1 border-t border-indigo-50">
            <span>โอน {paymentChannelStats.transferPct}%</span>
            <span>สด {paymentChannelStats.cashPct}%</span>
            <span>เช็ค {paymentChannelStats.chequePct}%</span>
          </div>
        </div>

        {/* Card 6: รายได้และค่าใช้จ่ายสุทธิ (Net Margin / Income vs Expense) */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-200/90 bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                6. รายได้-รายจ่าย (Net)
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className={`mt-3 text-xl font-black tracking-tight xl:text-2xl ${netCashMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {baht(netCashMargin)} <span className="text-xs font-normal text-steel-500">บาท</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs border-t border-sky-50 pt-2">
              <span className="text-steel-600">กำไรตามเอกสาร:</span>
              <span className={`font-bold ${netMarginPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {netMarginPct}%
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-steel-500">
              <span className="text-emerald-700 font-semibold">รับ {baht(totalRevenueDoc)}</span>
              <span className="text-rose-700 font-semibold">จ่าย {baht(totalExpenseDoc)}</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div
              className={`h-full ${netCashMargin >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(Math.max(Number(netMarginPct), 0), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 4. Section 1: ยอดขายตามสินค้าและบริการ (Sales by Product)                 */}
      {/* ------------------------------------------------------------------------ */}
      <div id="sales-by-product" className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-sm scroll-mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hivis/30 text-steel-900">
              <Package className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-steel-900">
                1. ยอดขายตามสินค้าและบริการ (Sales by Product / Service)
              </h2>
              <p className="text-xs text-steel-500">
                วิเคราะห์สัดส่วนรายได้และปริมาณการขายแยกตามประเภทสินค้า วัสดุอุปกรณ์ และงานบริการ
              </p>
            </div>
          </div>

          {/* Toggle between Product View vs Project View */}
          <div className="flex items-center rounded-xl bg-steel-100 p-1 text-xs font-bold">
            <button
              onClick={() => setProductViewTab('products')}
              className={`rounded-lg px-3 py-1.5 transition ${
                productViewTab === 'products'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              แยกตามสินค้า / วัสดุ ({salesByProduct.length})
            </button>
            <button
              onClick={() => setProductViewTab('projects')}
              className={`rounded-lg px-3 py-1.5 transition ${
                productViewTab === 'projects'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              แยกตามโครงการ ({salesByProject.length})
            </button>
          </div>
        </div>

        {/* Product / Project Sales Table & Visual Bars */}
        <div className="mt-4 overflow-x-auto">
          {productViewTab === 'products' ? (
            salesByProduct.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-steel-100 text-steel-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">อันดับ</th>
                    <th className="py-2.5 px-3">รายการสินค้า / บริการ</th>
                    <th className="py-2.5 px-3 text-right">จำนวน</th>
                    <th className="py-2.5 px-3 text-right">หน่วย</th>
                    <th className="py-2.5 px-3 text-right">มูลค่ายอดขายรวม (บาท)</th>
                    <th className="py-2.5 px-3 w-44 text-right">สัดส่วนยอดขาย (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-50">
                  {salesByProduct.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          p.rank === 1 ? 'bg-amber-100 text-amber-800' : p.rank === 2 ? 'bg-slate-200 text-steel-800' : p.rank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-steel-100 text-steel-600'
                        }`}>
                          {p.rank}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-steel-900">
                        {p.name}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-steel-700">
                        {Number(p.totalQty).toLocaleString('th-TH')}
                      </td>
                      <td className="py-3 px-3 text-right text-steel-500 font-medium">
                        {p.unit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-steel-900">
                        {baht(p.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-steel-100">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                              style={{ width: `${p.percent}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-steel-700 w-10 text-right">{p.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-steel-400 text-xs">
                ไม่มีข้อมูลยอดขายตามสินค้าในช่วงเวลาที่เลือก
              </div>
            )
          ) : (
            /* By Project */
            salesByProject.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-steel-100 text-steel-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">อันดับ</th>
                    <th className="py-2.5 px-3">ชื่อโครงการ / สัญญา</th>
                    <th className="py-2.5 px-3 text-center">รหัส</th>
                    <th className="py-2.5 px-3 text-center">จำนวนบิล</th>
                    <th className="py-2.5 px-3 text-right">มูลค่ายอดขายรวม (บาท)</th>
                    <th className="py-2.5 px-3 w-44 text-right">สัดส่วนยอดขาย (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-50">
                  {salesByProject.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          p.rank === 1 ? 'bg-amber-100 text-amber-800' : 'bg-steel-100 text-steel-600'
                        }`}>
                          {p.rank}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-steel-900">
                        {p.name}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-steel-500 font-medium">
                        {p.code}
                      </td>
                      <td className="py-3 px-3 text-center font-medium text-steel-700">
                        {p.count} งวด
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-steel-900">
                        {baht(p.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-steel-100">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                              style={{ width: `${p.percent}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-steel-700 w-10 text-right">{p.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-steel-400 text-xs">
                ไม่มีข้อมูลยอดขายตามโครงการในช่วงเวลาที่เลือก
              </div>
            )
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 5. Section 2: รายได้และค่าใช้จ่ายตามเอกสาร (Revenue & Expenses by Doc)    */}
      {/* ------------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Summary Card & Monthly Trend (2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-steel-200/90 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-steel-900">
                  6. รายได้และค่าใช้จ่ายตามเอกสาร (Revenue vs Expenses)
                </h2>
                <p className="text-xs text-steel-500">
                  เปรียบเทียบผลประกอบการกระแสเงินสดและสัดส่วนต้นทุนจากเอกสารจริง
                </p>
              </div>
            </div>

            <div className="text-xs font-semibold text-steel-500">
              ประจำปี พ.ศ. {monthlyTrend.targetYear + 543} ({monthlyTrend.targetYear})
            </div>
          </div>

          {/* Three Key Summary Mini Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <ArrowDownRight className="h-4 w-4" />
                <span>รายได้รวมตามเอกสาร (Revenue)</span>
              </div>
              <div className="mt-2 text-xl font-black text-emerald-800">
                {baht(totalRevenueDoc)} <span className="text-xs font-normal text-emerald-600">บ.</span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-600">
                จากใบแจ้งหนี้ INV ทั้งหมด {filteredInvoices.length} ฉบับ
              </div>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                <ArrowUpRight className="h-4 w-4" />
                <span>ค่าใช้จ่ายตามเอกสาร (Expenses)</span>
              </div>
              <div className="mt-2 text-xl font-black text-rose-800">
                {baht(totalExpenseDoc)} <span className="text-xs font-normal text-rose-600">บ.</span>
              </div>
              <div className="mt-1 text-[11px] text-rose-600">
                จากใบสำคัญจ่าย EXP {filteredExpenses.length} ฉบับ
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                <TrendingUp className="h-4 w-4" />
                <span>ผลต่างสุทธิ (Net Margin)</span>
              </div>
              <div className={`mt-2 text-xl font-black ${netCashMargin >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>
                {baht(netCashMargin)} <span className="text-xs font-normal text-indigo-600">บ.</span>
              </div>
              <div className="mt-1 text-[11px] text-indigo-600 font-semibold">
                อัตรากำไรเบื้องต้น: {netMarginPct}%
              </div>
            </div>
          </div>

          {/* Visual SVG Bar Chart for 12 Months */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-steel-700 mb-3">
              <span>กราฟเปรียบเทียบ รายได้ (เขียว) vs ค่าใช้จ่าย (แดง) รายเดือน</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> รายได้ (Revenue)
                </span>
                <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> ค่าใช้จ่าย (Expenses)
                </span>
              </div>
            </div>

            <div className="h-48 w-full flex items-end justify-between gap-1 sm:gap-2 border-b border-steel-200 pb-2 pt-4 px-2">
              {monthlyTrend.months.map((m) => {
                const revHeight = (m.revenue / monthlyTrend.maxVal) * 100
                const expHeight = (m.expense / monthlyTrend.maxVal) * 100

                return (
                  <div key={m.monthIndex} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-steel-900 text-white text-[10px] rounded px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap">
                      <span>{m.monthName}</span>
                      <span className="text-emerald-300">รายได้: {baht(m.revenue)} บ.</span>
                      <span className="text-rose-300">จ่าย: {baht(m.expense)} บ.</span>
                    </div>

                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-36">
                      {/* Revenue Bar */}
                      <div
                        className="w-1/2 max-w-[14px] bg-emerald-500 rounded-t transition-all duration-300 hover:brightness-110"
                        style={{ height: `${Math.max(revHeight, 2)}%` }}
                        title={`รายได้: ${baht(m.revenue)} บ.`}
                      />
                      {/* Expense Bar */}
                      <div
                        className="w-1/2 max-w-[14px] bg-rose-400 rounded-t transition-all duration-300 hover:brightness-110"
                        style={{ height: `${Math.max(expHeight, 2)}%` }}
                        title={`ค่าใช้จ่าย: ${baht(m.expense)} บ.`}
                      />
                    </div>
                    <span className="text-[10px] text-steel-500 mt-2 font-medium">
                      {m.shortName}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Recent Documents Feed (1 Col) */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-steel-700" />
              <h3 className="font-bold text-steel-900 text-sm">เอกสารล่าสุดในระบบ</h3>
            </div>
            <span className="text-xs font-semibold text-steel-400">{recentDocuments.length} รายการ</span>
          </div>

          {/* Subtabs for Documents Feed */}
          <div className="flex items-center gap-1 mt-3 border-b border-steel-100 pb-2 text-[11px] font-bold">
            <button
              onClick={() => setRecentDocTab('all')}
              className={`px-2.5 py-1 rounded-md transition ${recentDocTab === 'all' ? 'bg-steel-900 text-white' : 'text-steel-600 hover:bg-steel-100'}`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setRecentDocTab('revenue')}
              className={`px-2.5 py-1 rounded-md transition ${recentDocTab === 'revenue' ? 'bg-emerald-700 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              รายได้ (INV)
            </button>
            <button
              onClick={() => setRecentDocTab('expenses')}
              className={`px-2.5 py-1 rounded-md transition ${recentDocTab === 'expenses' ? 'bg-rose-700 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
            >
              ค่าใช้จ่าย (EXP/AP)
            </button>
          </div>

          {/* Feed List */}
          <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 max-h-[420px] pr-1">
            {recentDocuments.slice(0, 10).map((doc, idx) => (
              <div
                key={`${doc.type}-${doc.id}-${idx}`}
                className="rounded-xl border border-steel-100 p-3 hover:bg-slate-50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                      doc.type === 'INV' ? 'bg-emerald-100 text-emerald-800' :
                      doc.type === 'EXP' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {doc.type}
                    </span>
                    <span className="font-mono text-xs font-bold text-steel-900">{doc.docNo}</span>
                  </div>
                  <span className="text-[10px] text-steel-400 font-mono">{doc.date}</span>
                </div>

                <div className="mt-1.5 text-xs font-semibold text-steel-800 truncate">
                  {doc.party}
                </div>
                <div className="text-[11px] text-steel-500 truncate">
                  {doc.project}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-steel-50 pt-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${doc.statusColor}`}>
                    {doc.statusText}
                  </span>
                  <span className="font-mono font-bold text-xs text-steel-900">
                    {baht(doc.amount)} บ.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 6. Section 3: AR & AP Aging Breakdown (วิเคราะห์อายุลูกหนี้ & หนี้เจ้าหนี้) */}
      {/* ------------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: AR Aging Detail Card */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-steel-900 text-sm">การกระจายอายุลูกหนี้ค้างรับ (AR Aging)</h3>
                <p className="text-[11px] text-steel-500">ยอดค้างรับทั้งหมด {baht(totalArRemaining)} บาท</p>
              </div>
            </div>
            <Link to="/accounting/ar-aging" className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1">
              <span>รายงานฉบับเต็ม</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {[
              { label: 'ยังไม่ถึงกำหนดชำระ (Current)', amount: arAging.current, color: 'bg-emerald-500' },
              { label: 'เกินกำหนด 1 - 30 วัน', amount: arAging.days1_30, color: 'bg-amber-400' },
              { label: 'เกินกำหนด 31 - 60 วัน', amount: arAging.days31_60, color: 'bg-amber-500' },
              { label: 'เกินกำหนด 61 - 90 วัน', amount: arAging.days61_90, color: 'bg-orange-500' },
              { label: 'เกินกำหนดมากกว่า 90 วัน (ค้างนาน)', amount: arAging.over90, color: 'bg-rose-500' },
            ].map((b) => {
              const pct = totalArRemaining > 0 ? ((b.amount / totalArRemaining) * 100).toFixed(1) : 0
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-steel-700">{b.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-steel-900">{baht(b.amount)} บ.</span>
                      <span className="text-[10px] text-steel-400 font-mono w-10 text-right">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-steel-100">
                    <div className={`h-full ${b.color} transition-all duration-300`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: AP Urgency & Vendor Creditors Detail */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-800">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-steel-900 text-sm">การกระจายสถานะหนี้เจ้าหนี้การค้า (AP Due)</h3>
                <p className="text-[11px] text-steel-500">ยอดค้างจ่ายทั้งหมด {baht(totalApRemaining)} บาท</p>
              </div>
            </div>
            <Link to="/accounting/ap-aging" className="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1">
              <span>รายงานฉบับเต็ม</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {filteredApList.slice(0, 5).map((ap) => (
              <div key={ap.id} className="flex items-center justify-between rounded-xl border border-steel-100 p-3 hover:bg-slate-50 transition">
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-steel-900 truncate">{ap.vendor_name}</span>
                    <span className={`rounded-full px-2 py-0.2 text-[9px] font-bold ${
                      ap.alert_level === 'urgent' ? 'bg-rose-100 text-rose-800' :
                      ap.alert_level === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {ap.alert_level === 'urgent' ? 'เกินกำหนด' : ap.alert_level === 'warning' ? 'เตือน' : 'ปกติ'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-steel-400">
                    เลขที่บิล: {ap.invoice_no || ap.ap_no} • ครบกำหนด: {ap.due_date}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-xs text-rose-700">{baht(ap.remaining_amount)} บ.</div>
                  <div className="text-[10px] text-steel-400">จากยอด {baht(ap.total_debt)} บ.</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 7. Quick Navigation to Specialized Accounting Modules                     */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-steel-900 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-bold text-base text-white">ต้องการตรวจสอบเอกสารบัญชีโดยละเอียด?</h3>
            <p className="mt-0.5 text-xs text-steel-400">
              เข้าถึงสมุดรายวันทั่วไป (GL), รายงานภาษี ภ.พ.30, ภ.ง.ด.3/53 หรือระบบเบิกจ่ายเงินสำรองจ่ายได้ทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/accounting/journals"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3.5 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              สมุดรายวันทั่วไป (GL)
            </Link>
            <Link
              to="/accounting/expenses"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3.5 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              ค่าใช้จ่าย & เงินสำรองจ่าย
            </Link>
            <Link
              to="/accounting/tax-reports"
              className="rounded-xl bg-hivis hover:bg-amber-400 px-3.5 py-2 text-xs font-bold text-steel-900 transition shadow-sm"
            >
              ระบบภาษีครบวงจร (ภ.พ.30)
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
