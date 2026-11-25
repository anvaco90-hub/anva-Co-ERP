import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { baht, STATUS_LABELS, STATUS_STYLES } from '../lib/projects'
import { ROLE_LABELS } from '../lib/roles'
import LowStockAlert from '../components/LowStockAlert'
import {
  computeDashboardPaymentMetrics,
  getDashboardAgingReferenceDate,
  hasAnyLiveData,
} from '../lib/dashboardUtils'
import {
  SIMULATED_PROJECTS,
  SIMULATED_QUOTATION_ITEMS,
  SIMULATED_INVOICES,
  SIMULATED_ACCOUNTS_PAYABLE,
  SIMULATED_EXPENSES,
  SIMULATED_PAYMENT_TRANSACTIONS,
  SIMULATED_INVENTORY_ITEMS,
  SIMULATED_PURCHASE_ORDERS,
  SIMULATED_GOODS_RECEIPTS,
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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  ArrowRight,
  Receipt,
  PieChart,
  ShoppingCart,
  Boxes,
  Briefcase,
  BookOpen,
  Search,
  X,
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

  // Department Datasets
  const [invoices, setInvoices] = useState([])
  const [quotations, setQuotations] = useState([])
  const [quotationItems, setQuotationItems] = useState([])
  const [apList, setApList] = useState([])
  const [expenses, setExpenses] = useState([])
  const [paymentTx, setPaymentTx] = useState([])
  const [projects, setProjects] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [goodsReceipts, setGoodsReceipts] = useState([])

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

  // UI view toggles & Filters
  const [productViewTab, setProductViewTab] = useState('products') // 'products' | 'projects'
  const [salesSearch, setSalesSearch] = useState('')
  const [salesLimit, setSalesLimit] = useState('5') // '5' | '10' | '20' | 'all'
  const [salesCollapsed, setSalesCollapsed] = useState(false)

  const [recentDocTab, setRecentDocTab] = useState('all') // 'all' | 'revenue' | 'receivables' | 'expenses' | 'purchasing'
  const [recentDocSearch, setRecentDocSearch] = useState('')
  const [recentDocLimit, setRecentDocLimit] = useState('6') // '6' | '12' | '24' | 'all'
  const [recentDocCollapsed, setRecentDocCollapsed] = useState(false)

  const [showReceivablesInChart, setShowReceivablesInChart] = useState(true)

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
    setPurchaseOrders(SIMULATED_PURCHASE_ORDERS)
    setGoodsReceipts(SIMULATED_GOODS_RECEIPTS)
  }

  // Helper to switch back to Live Database Data
  const applyLiveDbData = (data) => {
    const d = data || liveDbData
    if (!d) return
    setIsDemoMode(false)
    setInvoices(d.invoices || [])
    setQuotations(d.quotations || [])
    setQuotationItems(d.quotationItems || [])
    setApList(d.apList || [])
    setExpenses(d.expenses || [])
    setPaymentTx(d.paymentTx || [])
    setProjects(d.projects || [])
    setInventoryItems(d.inventoryItems || [])
    setPurchaseOrders(d.purchaseOrders || [])
    setGoodsReceipts(d.goodsReceipts || [])
  }

  const toggleDemoMode = () => {
    if (isDemoMode) {
      if (liveDbData) {
        applyLiveDbData()
      }
    } else {
      applyDemoData()
    }
  }

  // ----------------------------------------------------------------------------
  // 3. Fetch Data from Supabase (Cross-Department Integration)
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
        poRes,
      ] = await Promise.all([
        supabase
          .from('sales_invoices')
          .select('id, invoice_no, issue_date, due_date, subtotal, vat_rate, vat_amount, total_amount, paid_amount, remaining_amount, is_opening_balance, status, notes, customer_id, project_id, projects(project_code, project_name)')
          .order('issue_date', { ascending: false }),

        supabase
          .from('quotations')
          .select('id, quotation_no, issue_date, quotation_date, customer_name, total_amount, grand_total, status, project_id')
          .order('issue_date', { ascending: false }),

        supabase
          .from('quotation_items')
          .select('id, quotation_id, item_id, item_name, description, quantity, unit, unit_price, total_amount, quotations(issue_date, quotation_date, status, customer_name)'),

        supabase
          .from('accounts_payable')
          .select('id, ap_no, vendor_id, vendor_name, invoice_no, invoice_date, due_date, credit_days, total_debt, paid_amount, remaining_amount, status, payment_method, alert_level, po_id, purchase_orders(po_no, project_id, projects(project_name))')
          .order('due_date', { ascending: true }),

        supabase
          .from('expenses')
          .select('id, expense_no, expense_date, due_date, expense_category, account_code, description, payment_method, payment_source, company_bank_account, advance_payer_name, reimbursement_status, subtotal, vat_amount, wht_amount, total_amount, is_asset, accounting_status, status, project_id, projects(project_name), vendor_id')
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

        supabase
          .from('purchase_orders')
          .select('id, po_no, order_date, total_amount, status, vendor_id, project_id, custom_vendor_name, vendors(vendor_name), projects(project_name, project_code)')
          .order('order_date', { ascending: false })
          .then(async (res) => {
            if (res.error) {
              const fb = await supabase.from('purchase_orders').select('*').order('order_date', { ascending: false });
              return fb;
            }
            return res;
          }),
      ])

      const realData = {
        invoices: invRes?.data || [],
        quotations: qtRes?.data || [],
        quotationItems: qtItemsRes?.data || [],
        apList: apRes?.data || [],
        expenses: expRes?.data || [],
        paymentTx: payRes?.data || [],
        projects: prjRes?.data || [],
        inventoryItems: invItemsRes?.data || [],
        purchaseOrders: poRes?.data || [],
        goodsReceipts: [],
      }
      setLiveDbData(realData)

      // Show Live DB whenever ANY real ERP data exists; fall back to Demo only on a completely empty database
      if (hasAnyLiveData(realData)) {
        applyLiveDbData(realData)
      } else {
        applyDemoData()
      }
      setLastRefreshed(new Date())
    } catch (err) {
      console.warn('Could not fetch live DB data, using simulation dataset:', err)
      applyDemoData()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // ----------------------------------------------------------------------------
  // 4. Period Filter Handlers & Filtering Logic
  // ----------------------------------------------------------------------------
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
      setCustomStartDate('')
      setCustomEndDate('')
    } else if (preset === 'Q4') {
      setFilterYear('2026')
      setFilterMonth('all')
      setCustomStartDate('2026-10-01')
      setCustomEndDate('2026-12-31')
    } else if (preset === '2026-11') {
      setFilterYear('2026')
      setFilterMonth('11')
      setCustomStartDate('')
      setCustomEndDate('')
    } else if (preset === '2026-10') {
      setFilterYear('2026')
      setFilterMonth('10')
      setCustomStartDate('')
      setCustomEndDate('')
    }
  }

  const isDateInFilter = (dateStr) => {
    if (!dateStr) return true
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return true

    const year = d.getFullYear()
    const month = d.getMonth() + 1 // 1-12

    if (customStartDate && customEndDate) {
      const from = new Date(customStartDate)
      const to = new Date(customEndDate)
      to.setHours(23, 59, 59, 999)
      return d >= from && d <= to
    }

    if (filterYear !== 'all' && year !== Number(filterYear)) {
      return false
    }

    if (filterMonth !== 'all' && month !== Number(filterMonth)) {
      return false
    }

    return true
  }

  // Filtered Datasets based on active Period Filter
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => isDateInFilter(inv.issue_date))
  }, [invoices, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => isDateInFilter(exp.expense_date))
  }, [expenses, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredApList = useMemo(() => {
    return apList.filter((ap) => isDateInFilter(ap.invoice_date || ap.due_date))
  }, [apList, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredQuotationItems = useMemo(() => {
    return quotationItems.filter((item) => {
      const st = String(item.quotations?.status || '').toLowerCase()
      if (st === 'cancelled' || st === 'ยกเลิก' || st === 'rejected') return false
      return isDateInFilter(item.quotations?.issue_date || item.quotations?.quotation_date)
    })
  }, [quotationItems, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredPaymentTx = useMemo(() => {
    return paymentTx.filter((tx) => isDateInFilter(tx.payment_date || tx.created_at))
  }, [paymentTx, filterYear, filterMonth, customStartDate, customEndDate])

  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => isDateInFilter(po.order_date))
  }, [purchaseOrders, filterYear, filterMonth, customStartDate, customEndDate])

  // ----------------------------------------------------------------------------
  // 5. Calculations for the 6 Core Features & Cross-Department Metrics
  // ----------------------------------------------------------------------------

  // (1) ยอดขายตามสินค้าและบริการ (Sales by Product / Service)
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
  }, [filteredInvoices, isDemoMode])

  // Filtered & Limited Sales by Product (ค้นหาและเลือกจำนวนบรรทัด)
  const filteredSalesByProduct = useMemo(() => {
    let list = salesByProduct
    if (salesSearch.trim()) {
      const q = salesSearch.toLowerCase().trim()
      list = list.filter((p) => p.name?.toLowerCase().includes(q))
    }
    return list
  }, [salesByProduct, salesSearch])

  const displayedSalesByProduct = useMemo(() => {
    if (salesLimit === 'all') return filteredSalesByProduct
    return filteredSalesByProduct.slice(0, Number(salesLimit))
  }, [filteredSalesByProduct, salesLimit])

  // Filtered & Limited Sales by Project (ค้นหาและเลือกจำนวนบรรทัด)
  const filteredSalesByProject = useMemo(() => {
    let list = salesByProject
    if (salesSearch.trim()) {
      const q = salesSearch.toLowerCase().trim()
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q)
      )
    }
    return list
  }, [salesByProject, salesSearch])

  const displayedSalesByProject = useMemo(() => {
    if (salesLimit === 'all') return filteredSalesByProject
    return filteredSalesByProject.slice(0, Number(salesLimit))
  }, [filteredSalesByProject, salesLimit])

  // (2) สรุปยอดเก็บเงิน (Collected Revenue / Receipts Summary)
  const totalInvoiced = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
  }, [filteredInvoices, isDemoMode])

  const totalCollected = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0)
  }, [filteredInvoices, isDemoMode])

  const collectionRate = totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '0.0'

  const fullyCollectedCount = filteredInvoices.filter((inv) => Number(inv.remaining_amount || 0) <= 0 && Number(inv.paid_amount || 0) > 0).length
  const partiallyCollectedCount = filteredInvoices.filter((inv) => Number(inv.paid_amount || 0) > 0 && Number(inv.remaining_amount || 0) > 0).length

  // (3) ยอดค้างรับ (Outstanding Receivables / AR Outstanding)
  const totalArRemaining = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.remaining_amount || 0), 0)
  }, [filteredInvoices, isDemoMode])

  const arInvoicesCount = filteredInvoices.filter((inv) => Number(inv.remaining_amount || 0) > 0).length

  // AR Aging Buckets
  const arAging = useMemo(() => {
    const today = getDashboardAgingReferenceDate(isDemoMode)
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
  }, [filteredInvoices, isDemoMode])

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
  const paymentMetrics = useMemo(
    () =>
      computeDashboardPaymentMetrics({
        apList: filteredApList,
        expenses: filteredExpenses,
        paymentTx: filteredPaymentTx,
      }),
    [filteredApList, filteredExpenses, filteredPaymentTx]
  )

  const apPaidAmount = paymentMetrics.apPaidAmount
  const expensesPaidAmount = paymentMetrics.expensesPaidAmount
  const totalPaymentsExecuted = paymentMetrics.totalPaymentsExecuted
  const paymentChannelStats = paymentMetrics

  // (1) & (6) ยอดขายและรายได้ตามเอกสาร (Total Sales & Revenue by Document)
  const totalSalesAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.subtotal || inv.total_amount || 0), 0)
  }, [filteredInvoices, isDemoMode])

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
      { rev: 350000, exp: 210000, rec: 50000 },
      { rev: 420000, exp: 260000, rec: 70000 },
      { rev: 580000, exp: 320000, rec: 90000 },
      { rev: 490000, exp: 280000, rec: 80000 },
      { rev: 620000, exp: 350000, rec: 120000 },
      { rev: 550000, exp: 310000, rec: 95000 },
      { rev: 374500, exp: 210000, rec: 60000 },
      { rev: 535000, exp: 290000, rec: 85000 },
      { rev: 428000, exp: 270000, rec: 75000 },
      { rev: 1572900, exp: 783000, rec: 320000 },
      { rev: 1915300, exp: 1047500, rec: 450000 },
      { rev: 650000, exp: 350000, rec: 110000 },
    ]

    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i + 1,
      monthName: THAI_MONTHS[i],
      shortName: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][i],
      revenue: isDemoMode && targetYear === 2026 ? demoBaseline[i].rev : 0,
      expense: isDemoMode && targetYear === 2026 ? demoBaseline[i].exp : 0,
      receivable: isDemoMode && targetYear === 2026 ? demoBaseline[i].rec : 0,
    }))

    if (!isDemoMode) {
      invoices.forEach((inv) => {
        if (!inv.issue_date) return
        const d = new Date(inv.issue_date)
        if (d.getFullYear() === targetYear) {
          const m = d.getMonth()
          months[m].revenue += Number(inv.subtotal || inv.total_amount || 0)
          months[m].receivable += Number(inv.remaining_amount || 0)
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
      ...months.map((m) => Math.max(m.revenue, m.expense, m.receivable)),
      100000
    )

    return { months, maxVal, targetYear }
  }, [invoices, expenses, filterYear, isDemoMode])

  // Cross-Department Integration Overview Numbers
  const purchasingStats = useMemo(() => {
    const totalPoAmt = filteredPurchaseOrders.reduce((sum, po) => sum + Number(po.total_amount || 0), 0)
    const openPos = filteredPurchaseOrders.filter((po) => po.status === 'open')
    return {
      count: filteredPurchaseOrders.length,
      totalAmount: totalPoAmt,
      openCount: openPos.length,
    }
  }, [filteredPurchaseOrders])

  const storeStats = useMemo(() => {
    const lowStockCount = inventoryItems.filter(
      (item) => Number(item.qty_on_hand || 0) <= Number(item.reorder_point || 0)
    ).length
    const totalInventoryValue = inventoryItems.reduce(
      (sum, item) => sum + Number(item.qty_on_hand || 0) * Number(item.avg_unit_cost || 0),
      0
    )
    return {
      itemCount: inventoryItems.length,
      lowStockCount,
      totalInventoryValue,
      receiptCount: goodsReceipts.length,
    }
  }, [inventoryItems, goodsReceipts])

  const projectStats = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'in_progress' || p.status === 'active')
    const totalContract = projects.reduce((sum, p) => sum + Number(p.contract_amount || 0), 0)
    return {
      totalCount: projects.length,
      activeCount: activeProjects.length,
      totalContract,
    }
  }, [projects])

  // Recent Documents Feed (Cross-Department Document Trace)
  const recentDocuments = useMemo(() => {
    const list = []

    filteredInvoices.forEach((inv) => {
      const remAmt = Number(inv.remaining_amount || 0)
      const isUnpaid = remAmt > 0
      list.push({
        id: inv.id,
        docNo: inv.invoice_no,
        date: inv.issue_date,
        dueDate: inv.due_date,
        type: 'INV',
        typeName: 'ใบแจ้งหนี้ / ส่งมอบงาน',
        dept: 'ฝ่ายขาย / AR',
        category: 'revenue',
        isReceivable: isUnpaid,
        remainingAmount: remAmt,
        paidAmount: Number(inv.paid_amount || 0),
        party: inv.customers?.company_name || inv.customers?.customer_name || 'ลูกค้าโครงการ',
        project: inv.projects?.project_name || inv.notes || '-',
        amount: Number(inv.total_amount || 0),
        statusText: inv.status || (isUnpaid ? 'รอเก็บเงิน' : 'เก็บเงินแล้ว'),
        statusColor: !isUnpaid
          ? 'bg-emerald-100 text-emerald-800'
          : remAmt < Number(inv.total_amount || 0)
            ? 'bg-sky-100 text-sky-800'
            : 'bg-amber-100 text-amber-800',
      })
    })

    filteredExpenses.forEach((exp) => {
      list.push({
        id: exp.id,
        docNo: exp.expense_no,
        date: exp.expense_date,
        type: 'EXP',
        typeName: 'ใบสำคัญจ่าย / ค่าใช้จ่าย',
        dept: 'ฝ่ายบัญชี / การเงิน',
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
        dept: 'ฝ่ายจัดซื้อ / บัญชี',
        category: 'expense',
        party: ap.vendor_name || 'คู่ค้า / ผู้จำหน่าย',
        project: ap.purchase_orders?.projects?.project_name || ap.invoice_no || '-',
        amount: Number(ap.total_debt || 0),
        statusText: ap.alert_level === 'urgent' ? 'เกินกำหนด' : ap.alert_level === 'warning' ? 'ใกล้ครบกำหนด' : 'ปกติ',
        statusColor: ap.alert_level === 'urgent' ? 'bg-rose-100 text-rose-800' : ap.alert_level === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-steel-100 text-steel-700',
      })
    })

    filteredPurchaseOrders.forEach((po) => {
      list.push({
        id: po.id,
        docNo: po.po_no,
        date: po.order_date,
        type: 'PO',
        typeName: 'ใบสั่งซื้อสินค้า/วัสดุ',
        dept: 'ฝ่ายจัดซื้อ',
        category: 'purchasing',
        party: po.custom_vendor_name || po.vendors?.vendor_name || po.vendor_name || 'ผู้ขายวัสดุ',
        project: po.project_name || po.projects?.project_name || '-',
        amount: Number(po.total_amount || 0),
        statusText: po.status_th || (po.status === 'received' ? 'รับของแล้ว' : 'สั่งซื้อแล้ว'),
        statusColor: po.status === 'received' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
      })
    })

    // Sort descending by date
    list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

    let filtered = list
    if (recentDocTab === 'revenue') filtered = filtered.filter((d) => d.category === 'revenue')
    else if (recentDocTab === 'receivables') filtered = filtered.filter((d) => d.type === 'INV' && d.remainingAmount > 0)
    else if (recentDocTab === 'expenses') filtered = filtered.filter((d) => d.category === 'expense')
    else if (recentDocTab === 'purchasing') filtered = filtered.filter((d) => d.category === 'purchasing')

    if (recentDocSearch.trim()) {
      const q = recentDocSearch.toLowerCase().trim()
      filtered = filtered.filter(
        (d) =>
          d.docNo?.toLowerCase().includes(q) ||
          d.party?.toLowerCase().includes(q) ||
          d.project?.toLowerCase().includes(q)
      )
    }

    return filtered
  }, [filteredInvoices, filteredExpenses, filteredApList, filteredPurchaseOrders, recentDocTab, recentDocSearch])

  // Filtered & Limited Recent Documents (เลือกจำนวนบรรทัดที่ต้องการแสดง)
  const displayedRecentDocs = useMemo(() => {
    if (recentDocLimit === 'all') return recentDocuments
    return recentDocuments.slice(0, Number(recentDocLimit))
  }, [recentDocuments, recentDocLimit])

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-14 font-sans text-steel-900 leading-normal">
      {/* ------------------------------------------------------------------------ */}
      {/* 1. Header & Welcome Bar                                                  */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 p-6 text-white shadow-lg border border-emerald-900/60">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-md bg-emerald-500 text-white px-2.5 py-0.5 text-xs font-black tracking-wide uppercase shrink-0 shadow-xs">
                Executive Overview
              </span>
              <span className="text-xs text-emerald-200/80 truncate">
                บริษัท แอนวา แอนด์ โค จำกัด (ANVA & CO., LTD.)
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl leading-snug">
              แดชบอร์ดบริหารธุรกิจและบัญชีการเงิน
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              สวัสดีคุณ <span className="font-bold text-white">{profile?.full_name || 'ผู้ใช้งาน'}</span> • สิทธิ์การใช้งาน: <span className="text-emerald-400 font-bold">{ROLE_LABELS[profile?.role] || profile?.role}</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0 flex-wrap">
            {/* Toggle Demo Simulation Mode Button */}
            <button
              onClick={toggleDemoMode}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm border ${isDemoMode
                ? 'bg-emerald-500 text-white border-emerald-400 ring-2 ring-emerald-400/30 hover:bg-emerald-400 shadow-emerald-500/20'
                : 'bg-slate-800/80 hover:bg-slate-700 text-white border-slate-600'
                }`}
              title="สลับระหว่างข้อมูลจำลองสำหรับทดสอบ (Demo) และข้อมูลจริงจากระบบ (Live DB)"
            >
              <span>{isDemoMode ? 'ข้อมูลจำลอง (Demo Active)' : '️ ข้อมูลจริง (Live DB)'}</span>
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
            <div className="text-right hidden md:block pl-2 border-l border-steel-700">
              <div className="text-[10px] text-steel-400 uppercase tracking-wider font-semibold">อัปเดตล่าสุด</div>
              <div className="text-xs font-bold text-steel-200">
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/80 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-slate-900 dark:via-emerald-950/20 dark:to-slate-900 p-4 text-xs text-emerald-950 dark:text-emerald-200 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 dark:bg-emerald-500 text-white font-black text-base shadow-xs">
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>กำลังแสดงผลชุดข้อมูลจำลองสมจริง (Realistic Enterprise Simulation Active)</span>
                <span className="rounded-md bg-emerald-200/90 dark:bg-emerald-900/80 px-2 py-0.5 text-[10px] font-black text-emerald-950 dark:text-emerald-300 uppercase border border-emerald-300 dark:border-emerald-700">
                  สำหรับผู้ทดลองระบบ
                </span>
              </div>
              <div className="text-emerald-800 dark:text-slate-300 text-xs mt-0.5 leading-relaxed">
                จำลองข้อมูลครบวงจร 6 ด้าน: ยอดขายตามสินค้า, สรุปยอดเก็บเงิน, ยอดค้างรับ (AR), ยอดค้างจ่าย (AP), สรุปยอดชำระเงิน, และรายได้-ค่าใช้จ่ายตามเอกสาร พร้อมเชื่อมโยง ฝ่ายจัดซื้อ ฝ่ายสโตร์ และฝ่ายโครงการ
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-medium shrink-0">
            <span className="rounded-lg bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-emerald-900 dark:text-slate-200 border border-emerald-200 dark:border-slate-700 shadow-xs">
              ทดสอบตัวกรอง ปี/เดือน/ไตรมาส ได้แบบเรียลไทม์
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------ */}
      {/* 2. Sticky Master Bar (แผงเลือกช่วงเวลา & ทางลัดโมดูลแบบคงที่ ไม่ต้องเลื่อนหา) */}
      {/* ------------------------------------------------------------------------ */}
      <div className="sticky top-0 z-30 rounded-2xl border border-steel-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 shadow-md transition-all">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-steel-500 dark:text-slate-400">
                ตัวกรองระยะเวลา & ทางลัด (Persistent Control Bar)
              </div>
              <div className="text-xs sm:text-sm font-bold text-steel-900 dark:text-white truncate">
                {periodPreset === 'all' && 'แสดงข้อมูลทั้งหมด (All Time)'}
                {periodPreset === '2026' && 'ปี พ.ศ. 2569 (2026 ทั้งปี)'}
                {periodPreset === 'Q4' && 'ไตรมาสที่ 4 / 2569 (ต.ค. - ธ.ค. 2026)'}
                {periodPreset === '2026-11' && 'ประจำเดือน พฤศจิกายน 2569 (Nov 2026)'}
                {periodPreset === '2026-10' && 'ประจำเดือน ตุลาคม 2569 (Oct 2026)'}
                {periodPreset === 'custom' && 'กำหนดช่วงเวลาเอง (Custom Period)'}
              </div>
            </div>
          </div>

          {/* Quick Preset Pills & Direct Department Nav Shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Presets */}
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: '2026', label: 'ปี 2569' },
              { id: 'Q4', label: 'ไตรมาส 4' },
              { id: '2026-11', label: 'พ.ย. 69' },
              { id: '2026-10', label: 'ต.ค. 69' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${periodPreset === preset.id
                  ? 'bg-emerald-700 dark:bg-amber-500 text-white dark:text-slate-950 shadow-xs'
                  : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700'
                  }`}
              >
                {preset.label}
              </button>
            ))}

            <div className="h-4 w-px bg-steel-200 dark:bg-slate-700 mx-1 hidden sm:block" />

            {/* Direct Module Jump Shortcuts */}
            <Link
              to="/purchasing"
              className="rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2 py-1 text-xs font-bold transition flex items-center gap-1"
              title="ฝ่ายจัดซื้อ (PO/PR)"
            >
              <ShoppingCart className="h-3 w-3 text-amber-700 dark:text-amber-400" />
              <span>จัดซื้อ</span>
            </Link>
            <Link
              to="/store"
              className="rounded-lg bg-teal-50 dark:bg-emerald-950/40 hover:bg-teal-100 dark:hover:bg-emerald-900/50 text-teal-900 dark:text-emerald-300 border border-teal-200 dark:border-emerald-800/60 px-2 py-1 text-xs font-bold transition flex items-center gap-1"
              title="ฝ่ายคลังสินค้าและสโตร์"
            >
              <Boxes className="h-3 w-3 text-teal-700 dark:text-emerald-400" />
              <span>สโตร์</span>
            </Link>
            <Link
              to="/projects"
              className="rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 px-2 py-1 text-xs font-bold transition flex items-center gap-1"
              title="ฝ่ายบริหารโครงการ"
            >
              <Briefcase className="h-3 w-3 text-blue-700 dark:text-blue-400" />
              <span>โครงการ</span>
            </Link>
            <Link
              to="/accounting/journals"
              className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 px-2 py-1 text-xs font-bold transition flex items-center gap-1"
              title="สมุดรายวันทั่วไป (GL)"
            >
              <BookOpen className="h-3 w-3 text-indigo-700 dark:text-indigo-400" />
              <span>บัญชี GL</span>
            </Link>
            <Link
              to="/accounting/tax-reports"
              className="rounded-lg bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-900 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 px-2 py-1 text-xs font-bold transition flex items-center gap-1"
              title="ระบบภาษี ภ.พ.30"
            >
              <span>ภ.พ.30</span>
            </Link>
          </div>
        </div>

        {/* Detailed Dropdown & Date Picker Controls */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-steel-100 dark:border-slate-800 pt-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="block text-[10px] font-bold text-steel-600 dark:text-slate-400 mb-0.5">เลือกปี (พ.ศ. / ค.ศ.)</label>
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-900 dark:text-slate-100 focus:border-hivis focus:outline-none"
            >
              <option value="all">ทุกปี (All Years)</option>
              <option value="2026">2569 (2026) - ปัจจุบัน</option>
              <option value="2025">2568 (2025)</option>
              <option value="2024">2567 (2024)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-steel-600 dark:text-slate-400 mb-0.5">เลือกเดือน</label>
            <select
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-900 dark:text-slate-100 focus:border-hivis focus:outline-none"
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
            <label className="block text-[10px] font-bold text-steel-600 dark:text-slate-400 mb-0.5">ตั้งแต่วันที่</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-900 dark:text-slate-100 focus:border-hivis focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-steel-600 dark:text-slate-400 mb-0.5">ถึงวันที่</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value)
                setPeriodPreset('custom')
              }}
              className="w-full rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-900 dark:text-slate-100 focus:border-hivis focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 3. Cross-Department Connected Hub (ศูนย์ข้อมูลเชื่อมโยงระหว่างฝ่าย)       */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-steel-900">
              ศูนย์ข้อมูลเชื่อมโยงระหว่างฝ่าย (Cross-Department Operations Hub)
            </h2>
          </div>
          <span className="text-xs text-steel-500">
            ดึงข้อมูลแบบเรียลไทม์จาก จัดซื้อ, สโตร์, โครงการ, บัญชี และการเงิน
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Dept 1: ฝ่ายจัดซื้อ (Purchasing Hub) */}
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 flex flex-col justify-between transition hover:border-amber-300 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <ShoppingCart className="h-4 w-4 text-amber-600" />
                  <span>ฝ่ายจัดซื้อ (Purchasing)</span>
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {purchasingStats.count} ใบสั่งซื้อ
                </span>
              </div>
              <div className="mt-2 text-lg font-black text-steel-900">
                {baht(purchasingStats.totalAmount)} <span className="text-xs font-normal text-steel-500">บาท</span>
              </div>
              <p className="mt-1 text-xs text-steel-600">
                รอส่งมอบ/เปิดอยู่: <span className="font-bold text-amber-800">{purchasingStats.openCount} ใบ</span>
              </p>
            </div>
            <Link
              to="/purchasing"
              className="mt-3 flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 border border-amber-200 hover:bg-amber-100/60 transition"
            >
              <span>ไปที่ PR/PO Hub</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Dept 2: ฝ่ายสโตร์ / คลังสินค้า (Store & Inventory) */}
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-4 flex flex-col justify-between transition hover:border-teal-300 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                  <Boxes className="h-4 w-4 text-teal-600" />
                  <span>ฝ่ายคลังสินค้า (Store)</span>
                </span>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  {storeStats.itemCount} รายการ
                </span>
              </div>
              <div className="mt-2 text-lg font-black text-steel-900">
                {baht(storeStats.totalInventoryValue)} <span className="text-xs font-normal text-steel-500">บาท</span>
              </div>
              <p className="mt-1 text-xs text-steel-600">
                สินค้าใกล้หมด (Reorder): <span className={`font-bold ${storeStats.lowStockCount > 0 ? 'text-rose-600' : 'text-teal-700'}`}>{storeStats.lowStockCount} รายการ</span>
              </p>
            </div>
            <Link
              to="/store"
              className="mt-3 flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-teal-800 border border-teal-200 hover:bg-teal-100/60 transition"
            >
              <span>ไปที่คลังสินค้า & ทะเบียนพัสดุ</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Dept 3: ฝ่ายบริหารโครงการ (Projects & Construction) */}
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-4 flex flex-col justify-between transition hover:border-blue-300 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                  <Briefcase className="h-4 w-4 text-blue-600" />
                  <span>ฝ่ายโครงการ (Projects)</span>
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  {projectStats.activeCount} กำลังดำเนินงาน
                </span>
              </div>
              <div className="mt-2 text-lg font-black text-steel-900">
                {baht(projectStats.totalContract)} <span className="text-xs font-normal text-steel-500">บาท</span>
              </div>
              <p className="mt-1 text-xs text-steel-600">
                ทั้งหมด: <span className="font-bold text-blue-800">{projectStats.totalCount} โครงการ</span>
              </p>
            </div>
            <Link
              to="/projects"
              className="mt-3 flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-blue-800 border border-blue-200 hover:bg-blue-100/60 transition"
            >
              <span>ไปที่ระบบบริหารโครงการ</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Dept 4: ฝ่ายบัญชีและการเงิน (Accounting & Taxes) */}
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 flex flex-col justify-between transition hover:border-indigo-300 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <span>ฝ่ายบัญชี (Accounting)</span>
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                  GL / ภ.พ.30
                </span>
              </div>
              <div className="mt-2 text-lg font-black text-steel-900">
                {baht(totalRevenueDoc)} <span className="text-xs font-normal text-steel-500">บาท</span>
              </div>
              <p className="mt-1 text-xs text-steel-600">
                กำไรสุทธิ: <span className="font-bold text-indigo-700">{baht(netCashMargin)} บ. ({netMarginPct}%)</span>
              </p>
            </div>
            <Link
              to="/accounting/journals"
              className="mt-3 flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 border border-indigo-200 hover:bg-indigo-100/60 transition"
            >
              <span>ไปที่สมุดรายวัน & ภาษี</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 4. Core Financial Stat Cards (แบบ 2-2-2: เลขเต็ม ชัดเจน เห็นภาพรวมครบถ้วน) */}
      {/* ------------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Row 1, Card 1: 1. ยอดขายตามสินค้าและบริการ */}
        <div className="rounded-2xl border border-amber-200/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                    1. ยอดขายตามสินค้าและบริการ
                  </span>
                  <div className="text-[11px] text-steel-500">
                    จากใบแจ้งหนี้ INV ทั้งสิ้น {filteredInvoices.length} ฉบับ
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                {salesByProduct.length} รายการสินค้า
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ยอดขายและส่งมอบงานรวม</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-steel-900 tracking-tight">
                {baht(totalSalesAmount)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* Mini Ranking Top 3 Products */}
            <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-steel-100 space-y-2">
              <div className="text-[11px] font-bold text-steel-600 uppercase tracking-wider flex items-center justify-between">
                <span>สินค้าและบริการขายดี Top 3</span>
                <span>มูลค่า / สัดส่วน</span>
              </div>
              {salesByProduct.slice(0, 3).map((p, idx) => (
                <div key={p.name} className="flex items-start justify-between text-xs gap-2 py-1">
                  <span className="text-steel-800 font-semibold break-words leading-snug flex-1" title={p.name}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {p.name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-steel-900">{baht(p.totalAmount)} บ.</span>
                    <span className="text-[11px] text-steel-500 font-mono w-12 text-right">({p.percent}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">วิเคราะห์ตามสินค้าและโครงการ</span>
            <a href="#sales-by-product" className="text-amber-800 font-bold hover:underline flex items-center gap-1">
              <span>ดูตารางอันดับแบบละเอียดทั้งหมด ({salesByProduct.length} รายการ)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Row 1, Card 2: 2. สรุปยอดเก็บเงิน */}
        <div className="rounded-2xl border border-emerald-200/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    2. สรุปยอดเก็บเงิน (Collected Receipts)
                  </span>
                  <div className="text-[11px] text-steel-500">
                    จากยอดเปิดบิลเรียกเก็บ {baht(totalInvoiced)} บาท
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                จัดเก็บได้ {collectionRate}%
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ยอดเงินที่จัดเก็บได้จริงแล้ว</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-800 tracking-tight">
                {baht(totalCollected)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* Collection Progress & Breakdown Stats */}
            <div className="mt-4 rounded-xl bg-emerald-50/50 p-3.5 border border-emerald-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span>ความคืบหน้าการจัดเก็บเงิน</span>
                <span>{collectionRate}% ({baht(totalCollected)} / {baht(totalInvoiced)})</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                <div
                  className="h-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${Math.min(Number(collectionRate), 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                <div className="rounded-lg bg-white p-2 border border-emerald-100">
                  <div className="text-[10px] text-steel-500">เก็บครบ 100%</div>
                  <div className="font-bold text-emerald-800 font-mono text-sm">{fullyCollectedCount} บิล</div>
                </div>
                <div className="rounded-lg bg-white p-2 border border-emerald-100">
                  <div className="text-[10px] text-steel-500">เก็บได้บางส่วน</div>
                  <div className="font-bold text-amber-700 font-mono text-sm">{partiallyCollectedCount} บิล</div>
                </div>
                <div className="rounded-lg bg-white p-2 border border-emerald-100">
                  <div className="text-[10px] text-steel-500">ยังรอเก็บเงิน</div>
                  <div className="font-bold text-rose-700 font-mono text-sm">{Math.max(filteredInvoices.length - fullyCollectedCount, 0)} บิล</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">ยอดคงค้างรอเก็บเงิน:</span>
            <span className="font-mono font-bold text-rose-700 text-sm">
              {baht(totalInvoiced - totalCollected)} บ.
            </span>
          </div>
        </div>

        {/* Row 2, Card 3: 3. ยอดค้างรับ (AR Outstanding) */}
        <div className="rounded-2xl border border-amber-300/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    3. ยอดค้างรับ (ลูกหนี้การค้า AR)
                  </span>
                  <div className="text-[11px] text-steel-500">
                    หนี้ค้างชำระจากลูกค้าและโครงการ
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-200">
                ลูกหนี้ค้าง {arInvoicesCount} บิล
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ยอดลูกหนี้ค้างรับคงเหลือสุทธิ</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-900 tracking-tight">
                {baht(totalArRemaining)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* AR Aging Preview */}
            <div className="mt-4 rounded-xl bg-amber-50/60 p-3.5 border border-amber-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-steel-800">
                <span>การกระจายสถานะหนี้ค้างรับ</span>
                <span>ยังไม่ครบ vs เกินกำหนด</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-amber-200">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>ยังไม่ถึงกำหนด (Current)</span>
                  </div>
                  <div className="mt-1 font-mono font-bold text-steel-900 text-base">{baht(arAging.current)} บ.</div>
                  <div className="text-[10px] text-steel-500">
                    {totalArRemaining > 0 ? ((arAging.current / totalArRemaining) * 100).toFixed(1) : 0}% ของยอดค้าง
                  </div>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-rose-200">
                  <div className="flex items-center gap-1.5 text-rose-700 font-bold text-[11px]">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>เกินกำหนดชำระ (Overdue)</span>
                  </div>
                  <div className="mt-1 font-mono font-bold text-rose-700 text-base">
                    {baht(totalArRemaining - arAging.current)} บ.
                  </div>
                  <div className="text-[10px] text-rose-600 font-bold">
                    {totalArRemaining > 0 ? (((totalArRemaining - arAging.current) / totalArRemaining) * 100).toFixed(1) : 0}% ต้องติดตามทวงถาม
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">วิเคราะห์อายุลูกหนี้ละเอียด 5 ช่วงเวลา:</span>
            <Link
              to="/accounting/ar-aging"
              className="text-amber-800 font-bold hover:underline flex items-center gap-1"
            >
              <span>เปิดดูรายงาน AR Aging ฉบับเต็ม</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Row 2, Card 4: 4. ยอดค้างจ่าย (AP Outstanding) */}
        <div className="rounded-2xl border border-rose-200/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-800 shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    4. ยอดค้างจ่าย (เจ้าหนี้การค้า AP)
                  </span>
                  <div className="text-[11px] text-steel-500">
                    หนี้ค้างจ่ายค่าวัสดุและผู้รับเหมา
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-900 border border-rose-200">
                เจ้าหนี้ค้าง {apCount} บิล
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ยอดหนี้ค้างจ่ายคงเหลือสุทธิ</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-rose-700 tracking-tight">
                {baht(totalApRemaining)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* AP Urgency Breakdown */}
            <div className="mt-4 rounded-xl bg-rose-50/50 p-3.5 border border-rose-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-steel-800">
                <span>ระดับความเร่งด่วนในการจ่ายชำระ</span>
                <span>จากยอดหนี้ {baht(totalApOriginal)} บ.</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-rose-200">
                  <div className="text-[10px] font-bold text-rose-700 flex items-center justify-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                    <span>วิกฤต (เกินกำหนด)</span>
                  </div>
                  <div className="mt-1 font-bold text-rose-700 font-mono text-base">{apUrgentCount} บิล</div>
                  <div className="text-[10px] text-steel-400">ต้องจ่ายทันที</div>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-700 flex items-center justify-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>เตือน (ใกล้ครบ)</span>
                  </div>
                  <div className="mt-1 font-bold text-amber-800 font-mono text-base">{apWarningCount} บิล</div>
                  <div className="text-[10px] text-steel-400">ภายใน 7 วัน</div>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-steel-200">
                  <div className="text-[10px] font-bold text-steel-600 flex items-center justify-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>สถานะปกติ</span>
                  </div>
                  <div className="mt-1 font-bold text-steel-800 font-mono text-base">
                    {Math.max(apCount - apUrgentCount - apWarningCount, 0)} บิล
                  </div>
                  <div className="text-[10px] text-steel-400">ยังไม่ครบกำหนด</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">วิเคราะห์ครบกำหนดชำระเจ้าหนี้:</span>
            <Link
              to="/accounting/ap-aging"
              className="text-rose-700 font-bold hover:underline flex items-center gap-1"
            >
              <span>เปิดดูรายงาน AP Aging ฉบับเต็ม</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Row 3, Card 5: 5. สรุปยอดชำระเงิน */}
        <div className="rounded-2xl border border-indigo-200/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800 shrink-0">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                    5. สรุปยอดชำระเงิน (Payments Executed)
                  </span>
                  <div className="text-[11px] text-steel-500">
                    กระแสเงินสดจ่ายชำระจริง (Outflow)
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800 border border-indigo-200">
                จ่ายแล้ว {filteredExpenses.length + filteredApList.filter(a => Number(a.paid_amount || 0) > 0).length} รายการ
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ยอดเงินที่จ่ายชำระจริงทั้งหมด</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-indigo-900 tracking-tight">
                {baht(totalPaymentsExecuted)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* Payment Outflow & Channel Distribution */}
            <div className="mt-4 rounded-xl bg-indigo-50/50 p-3.5 border border-indigo-100 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-indigo-100">
                  <div className="text-[10px] text-steel-500">จ่ายเจ้าหนี้ / ค่ามัดจำ</div>
                  <div className="font-bold text-steel-900 font-mono text-base">{baht(apPaidAmount)} บ.</div>
                  <div className="text-[10px] text-indigo-600 font-bold">
                    {totalPaymentsExecuted > 0 ? ((apPaidAmount / totalPaymentsExecuted) * 100).toFixed(0) : 0}% ของยอดจ่าย
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-indigo-100">
                  <div className="text-[10px] text-steel-500">จ่ายค่าใช้จ่ายโครงการ/สำรองจ่าย</div>
                  <div className="font-bold text-indigo-700 font-mono text-base">{baht(expensesPaidAmount)} บ.</div>
                  <div className="text-[10px] text-indigo-600 font-bold">
                    {totalPaymentsExecuted > 0 ? ((expensesPaidAmount / totalPaymentsExecuted) * 100).toFixed(0) : 0}% ของยอดจ่าย
                  </div>
                </div>
              </div>

              {/* Payment Method Channels */}
              <div className="pt-1 border-t border-indigo-100 flex items-center justify-between text-xs text-steel-600">
                <span className="font-semibold text-[11px]">ช่องทางชำระเงิน:</span>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-indigo-800 font-bold">โอน {paymentChannelStats.transferPct}%</span>
                  <span className="text-emerald-700 font-bold">สด {paymentChannelStats.cashPct}%</span>
                  <span className="text-amber-700 font-bold">เช็ค {paymentChannelStats.chequePct}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-indigo-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">ตรวจสอบรายละเอียดใบสำคัญจ่าย:</span>
            <Link
              to="/accounting/expenses"
              className="text-indigo-800 font-bold hover:underline flex items-center gap-1"
            >
              <span>ไปที่หน้าระบบค่าใช้จ่าย & การจ่ายเงิน</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Row 3, Card 6: 6. รายได้-ค่าใช้จ่ายสุทธิ */}
        <div className="rounded-2xl border border-sky-200/90 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                    6. รายได้และค่าใช้จ่ายสุทธิ (Net Margin)
                  </span>
                  <div className="text-[11px] text-steel-500">
                    ผลประกอบการกระแสเงินสดตามเอกสาร
                  </div>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${netCashMargin >= 0
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-rose-100 text-rose-800 border-rose-200'
                }`}>
                กำไรตามเอกสาร {netMarginPct}%
              </span>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-steel-500">ผลต่างกำไรสุทธิ (Net Margin)</div>
              <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${netCashMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                {baht(netCashMargin)} <span className="text-sm font-bold text-steel-500">บาท</span>
              </div>
            </div>

            {/* Revenue vs Expense Comparison Mini Block */}
            <div className="mt-4 rounded-xl bg-sky-50/50 p-3.5 border border-sky-100 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>รายได้รวม (Revenue)</span>
                  </div>
                  <div className="mt-1 font-mono font-bold text-emerald-800 text-base">{baht(totalRevenueDoc)} บ.</div>
                  <div className="text-[10px] text-steel-500">INV ทั้งหมด {filteredInvoices.length} ฉบับ</div>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-rose-200">
                  <div className="flex items-center gap-1.5 text-rose-700 font-bold text-[11px]">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>ค่าใช้จ่ายรวม (Expenses)</span>
                  </div>
                  <div className="mt-1 font-mono font-bold text-rose-700 text-base">{baht(totalExpenseDoc)} บ.</div>
                  <div className="text-[10px] text-steel-500">EXP ทั้งหมด {filteredExpenses.length} ฉบับ</div>
                </div>
              </div>

              {/* ยอดค้างรับและเงินสดรับจริง */}
              <div className="rounded-lg bg-amber-50/80 p-2 border border-amber-200/80 flex items-center justify-between text-xs">
                <span className="text-amber-900 font-semibold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-amber-700" />
                  <span>ยอดค้างรับ (Uncollected AR):</span>
                </span>
                <span className="font-mono font-bold text-amber-900">
                  {baht(totalArRemaining)} บ. <span className="text-[10px] font-normal text-amber-700">({arInvoicesCount} ฉบับ)</span>
                </span>
              </div>

              {/* Visual Balance Bar */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[10px] text-steel-500 mb-1">
                  <span className="text-emerald-700 font-bold">สัดส่วนรายได้ {((totalRevenueDoc / (totalRevenueDoc + totalExpenseDoc || 1)) * 100).toFixed(0)}%</span>
                  <span className="text-rose-700 font-bold">สัดส่วนรายจ่าย {((totalExpenseDoc / (totalRevenueDoc + totalExpenseDoc || 1)) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-rose-200 flex">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(totalRevenueDoc / (totalRevenueDoc + totalExpenseDoc || 1)) * 100}%` }}
                  />
                  <div
                    className="h-full bg-rose-400"
                    style={{ width: `${(totalExpenseDoc / (totalRevenueDoc + totalExpenseDoc || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sky-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">ดูกราฟเปรียบเทียบรายได้ 12 เดือน:</span>
            <a href="#monthly-trend" className="text-sky-800 font-bold hover:underline flex items-center gap-1">
              <span>เลื่อนดูกราฟเปรียบเทียบและประวัติเอกสาร ↓</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 5. Section 1: ยอดขายตามสินค้าและบริการ (Sales by Product / Project Table)  */}
      {/* ------------------------------------------------------------------------ */}
      <div id="sales-by-product" className="rounded-2xl border border-steel-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm scroll-mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-steel-900 dark:text-slate-100 truncate">
                1. ยอดขายตามสินค้าและบริการ (Sales by Product / Service)
              </h2>
              <p className="text-xs text-steel-500 dark:text-slate-400">
                วิเคราะห์สัดส่วนรายได้และปริมาณการขายแยกตามประเภทสินค้า วัสดุอุปกรณ์ และงานบริการ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-center shrink-0">
            {/* Toggle between Product View vs Project View */}
            <div className="flex items-center rounded-xl bg-steel-100 dark:bg-slate-800 p-1 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setProductViewTab('products')}
                className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${productViewTab === 'products'
                  ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-slate-100 shadow-sm'
                  : 'text-steel-600 dark:text-slate-400 hover:text-steel-900'
                  }`}
              >
                แยกตามสินค้า / วัสดุ ({salesByProduct.length})
              </button>
              <button
                type="button"
                onClick={() => setProductViewTab('projects')}
                className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${productViewTab === 'projects'
                  ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-slate-100 shadow-sm'
                  : 'text-steel-600 dark:text-slate-400 hover:text-steel-900'
                  }`}
              >
                แยกตามโครงการ ({salesByProject.length})
              </button>
            </div>

            {/* ปุ่มย่อ / ขยาย ตาราง */}
            <button
              type="button"
              onClick={() => setSalesCollapsed(!salesCollapsed)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-steel-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
              title={salesCollapsed ? 'ขยายตาราง' : 'ย่อตาราง'}
            >
              {salesCollapsed ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5 text-amber-600" />
                  <span>ขยายตาราง</span>
                </>
              ) : (
                <>
                  <ChevronUp className="h-3.5 w-3.5 text-steel-500" />
                  <span>ย่อตาราง</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* แผงควบคุม ค้นหา และ เลือกจำนวนบรรทัดที่ต้องการให้แสดง (Search & Row Limit Bar) */}
        {!salesCollapsed && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 pb-1">
            {/* Search Input Box with proper pl-10 to prevent icon overlapping */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder={productViewTab === 'products' ? 'ค้นหาชื่อสินค้า, วัสดุ, บริการ...' : 'ค้นหาชื่อโครงการ, รหัสโครงการ...'}
                className="w-full rounded-xl border border-steel-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-8 py-1.5 text-xs text-steel-900 dark:text-slate-100 placeholder:text-steel-400 focus:border-amber-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition shadow-2xs"
              />
              {salesSearch && (
                <button
                  type="button"
                  onClick={() => setSalesSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Row Limit Selector (เลือกจำนวนบรรทัดที่ต้องการแสดง) */}
            <div className="flex items-center gap-1.5 text-xs shrink-0 self-end sm:self-center">
              <span className="text-steel-500 dark:text-slate-400 font-semibold text-[11px]">แสดง:</span>
              {[
                { id: '5', label: '5 บรรทัด' },
                { id: '10', label: '10 บรรทัด' },
                { id: '20', label: '20 บรรทัด' },
                { id: 'all', label: 'ทั้งหมด' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSalesLimit(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                    salesLimit === opt.id
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-steel-100 dark:bg-slate-800 text-steel-600 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Product / Project Sales Table & Visual Bars */}
        {!salesCollapsed && (
          <div className="overflow-x-auto rounded-xl border border-steel-100 dark:border-slate-800">
            {productViewTab === 'products' ? (
              displayedSalesByProduct.length > 0 ? (
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead>
                    <tr className="border-b border-steel-100 dark:border-slate-800 bg-steel-50/70 dark:bg-slate-800/60 text-steel-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      <th className="py-3 px-3 w-14 text-center">อันดับ</th>
                      <th className="py-3 px-3.5">รายการสินค้า / บริการ</th>
                      <th className="py-3 px-3 text-right">จำนวน</th>
                      <th className="py-3 px-3 text-center">หน่วย</th>
                      <th className="py-3 px-3.5 text-right">มูลค่ายอดขายรวม (บาท)</th>
                      <th className="py-3 px-3.5 w-48 text-right">สัดส่วนยอดขาย (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-50 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {displayedSalesByProduct.map((p) => (
                      <tr key={p.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${p.rank === 1 ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' :
                            p.rank === 2 ? 'bg-slate-200 text-steel-800' :
                              p.rank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-steel-100 dark:bg-slate-800 text-steel-600 dark:text-slate-300'
                            }`}>
                            {p.rank === 1 ? '' : p.rank === 2 ? '' : p.rank === 3 ? '' : p.rank}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-steel-900 dark:text-slate-100 break-words leading-snug max-w-md" title={p.name}>
                          {p.name}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-steel-700 dark:text-slate-300">
                          {Number(p.totalQty).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3 px-3 text-center text-steel-500 dark:text-slate-400 font-medium">
                          {p.unit}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-steel-900 dark:text-slate-100">
                          {baht(p.totalAmount)}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-steel-100 dark:bg-slate-800">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                                style={{ width: `${p.percent}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-steel-700 dark:text-slate-300 w-12 text-right">{p.percent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-steel-400 text-xs space-y-2">
                  <p>ไม่พบข้อมูลยอดขายตามสินค้าที่ตรงกับคำค้นหา "{salesSearch}"</p>
                  {salesSearch && (
                    <button
                      type="button"
                      onClick={() => setSalesSearch('')}
                      className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      ล้างคำค้นหา
                    </button>
                  )}
                </div>
              )
            ) : (
              /* By Project */
              displayedSalesByProject.length > 0 ? (
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead>
                    <tr className="border-b border-steel-100 dark:border-slate-800 bg-steel-50/70 dark:bg-slate-800/60 text-steel-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      <th className="py-3 px-3 w-14 text-center">อันดับ</th>
                      <th className="py-3 px-3.5">ชื่อโครงการ / สัญญา</th>
                      <th className="py-3 px-3 text-center">รหัส</th>
                      <th className="py-3 px-3 text-center">จำนวนบิล</th>
                      <th className="py-3 px-3.5 text-right">มูลค่ายอดขายรวม (บาท)</th>
                      <th className="py-3 px-3.5 w-48 text-right">สัดส่วนยอดขาย (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-50 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {displayedSalesByProject.map((p) => (
                      <tr key={p.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${p.rank === 1 ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : 'bg-steel-100 dark:bg-slate-800 text-steel-600 dark:text-slate-300'
                            }`}>
                            {p.rank === 1 ? '' : p.rank}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-steel-900 dark:text-slate-100 break-words leading-snug max-w-md" title={p.name}>
                          {p.name}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-steel-500 dark:text-slate-400 font-medium">
                          {p.code}
                        </td>
                        <td className="py-3 px-3 text-center font-medium text-steel-700 dark:text-slate-300">
                          {p.count} งวด
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-steel-900 dark:text-slate-100">
                          {baht(p.totalAmount)}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-steel-100 dark:bg-slate-800">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                                style={{ width: `${p.percent}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-steel-700 dark:text-slate-300 w-12 text-right">{p.percent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-steel-400 text-xs space-y-2">
                  <p>ไม่พบข้อมูลยอดขายตามโครงการที่ตรงกับคำค้นหา "{salesSearch}"</p>
                  {salesSearch && (
                    <button
                      type="button"
                      onClick={() => setSalesSearch('')}
                      className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      ล้างคำค้นหา
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 6. Section 2: รายได้และค่าใช้จ่ายตามเอกสาร (Revenue & Expenses by Doc) - อยู่เดี่ยวเต็มความกว้าง */}
      {/* ------------------------------------------------------------------------ */}
      <div id="monthly-trend" className="rounded-2xl border border-steel-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6 scroll-mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-steel-900 dark:text-slate-100">
                6. รายได้และค่าใช้จ่ายตามเอกสาร (Revenue vs Expenses Trend)
              </h2>
              <p className="text-xs text-steel-500 dark:text-slate-400">
                เปรียบเทียบผลประกอบการกระแสเงินสดและสัดส่วนต้นทุนจากเอกสารจริงตลอด 12 เดือน
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-steel-600 dark:text-slate-300 shrink-0 bg-slate-50 dark:bg-slate-800 border border-steel-200 dark:border-slate-700 px-3 py-1.5 rounded-lg">
            ประจำปี พ.ศ. {monthlyTrend.targetYear + 543} ({monthlyTrend.targetYear})
          </div>
        </div>

        {/* Key Summary Mini Cards: 4 Cards เต็มความกว้าง 4 คอลัมน์ ข้อความอ่านได้ครบถ้วน ไม่บีบอัด */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <ArrowDownRight className="h-4 w-4 shrink-0" />
                <span>รายได้ตามเอกสาร (Revenue)</span>
              </div>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
                {filteredInvoices.length} INV
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-emerald-800 dark:text-emerald-300 font-mono">
              {baht(totalRevenueDoc)} <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">บ.</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
              <span>เก็บเงินแล้ว: {baht(totalCollected)} บ.</span>
              <span className="font-bold">({collectionRate}%)</span>
            </div>
          </div>

          {/* การ์ดยอดค้างรับ (Uncollected AR) */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-300">
                <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span>ยอดค้างรับ (Uncollected AR)</span>
              </div>
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 shrink-0">
                {arInvoicesCount} บิลรอเก็บ
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-amber-900 dark:text-amber-300 font-mono">
              {baht(totalArRemaining)} <span className="text-xs font-normal text-amber-700 dark:text-amber-400">บ.</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-amber-700 dark:text-amber-400">
                {totalRevenueDoc > 0 ? ((totalArRemaining / totalRevenueDoc) * 100).toFixed(1) : 0}% ของรายได้รวม
              </span>
              <Link
                to="/accounting/ar-aging"
                className="font-bold text-amber-800 dark:text-amber-300 hover:text-amber-900 hover:underline flex items-center gap-0.5 text-[11px]"
              >
                วิเคราะห์อายุ
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                <ArrowUpRight className="h-4 w-4 shrink-0" />
                <span>ค่าใช้จ่ายตามเอกสาร (Expenses)</span>
              </div>
              <span className="rounded-full bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300 shrink-0">
                {filteredExpenses.length} EXP
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-rose-800 dark:text-rose-300 font-mono">
              {baht(totalExpenseDoc)} <span className="text-xs font-normal text-rose-600 dark:text-rose-400">บ.</span>
            </div>
            <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
              จ่ายจริงแล้ว {baht(expensesPaidAmount)} บ.
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300">
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span>ผลต่างสุทธิ (Net Margin)</span>
              </div>
              <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:text-indigo-300 shrink-0">
                {netMarginPct}%
              </span>
            </div>
            <div className={`mt-2 text-xl font-black font-mono ${netCashMargin >= 0 ? 'text-indigo-900 dark:text-indigo-300' : 'text-rose-700 dark:text-rose-400'}`}>
              {baht(netCashMargin)} <span className="text-xs font-normal text-indigo-600 dark:text-indigo-400">บ.</span>
            </div>
            <div className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-400">
              เงินสดสุทธิรับจริง: {baht(totalCollected - totalExpenseDoc)} บ.
            </div>
          </div>
        </div>

        {/* Visual SVG Bar Chart for 12 Months (เปรียบเทียบ รายได้ vs ค้างรับ vs ค่าใช้จ่าย) - กราฟเต็มจอ สบายตา */}
        <div className="rounded-xl border border-steel-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-steel-700 dark:text-slate-300 mb-3 flex-wrap gap-2">
            <span>กราฟเปรียบเทียบ รายได้ (เขียว) vs ค้างรับ (ส้ม) vs ค่าใช้จ่าย (แดง) รายเดือน</span>
            <div className="flex items-center gap-3 text-[11px] flex-wrap">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> รายได้ (Revenue)
              </span>
              <button
                type="button"
                onClick={() => setShowReceivablesInChart(!showReceivablesInChart)}
                className={`flex items-center gap-1.5 font-bold transition px-2 py-0.5 rounded cursor-pointer ${showReceivablesInChart
                  ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                  : 'text-steel-400 hover:text-steel-600 line-through'
                  }`}
                title="คลิกเพื่อเปิด/ปิดแท่งค้างรับ"
              >
                <span className={`h-2.5 w-2.5 rounded-sm ${showReceivablesInChart ? 'bg-amber-400' : 'bg-steel-300'}`} />
                <span>ค้างรับ (Uncollected)</span>
              </button>
              <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> ค่าใช้จ่าย (Expenses)
              </span>
            </div>
          </div>

          <div className="h-56 w-full flex items-end justify-between gap-1 sm:gap-3 border-b border-steel-200 dark:border-slate-700 pb-2 pt-4 px-2">
            {monthlyTrend.months.map((m) => {
              const revHeight = (m.revenue / monthlyTrend.maxVal) * 100
              const recHeight = (m.receivable / monthlyTrend.maxVal) * 100
              const expHeight = (m.expense / monthlyTrend.maxVal) * 100

              return (
                <div key={m.monthIndex} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-16 z-20 hidden group-hover:flex flex-col items-start bg-steel-900 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none whitespace-nowrap">
                    <span className="font-bold border-b border-steel-700 pb-0.5 mb-0.5 w-full">{m.monthName}</span>
                    <span className="text-emerald-300">รายได้: {baht(m.revenue)} บ.</span>
                    <span className="text-amber-300">ค้างรับ: {baht(m.receivable)} บ.</span>
                    <span className="text-rose-300">จ่าย: {baht(m.expense)} บ.</span>
                  </div>

                  <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-44">
                    {/* Revenue Bar */}
                    <div
                      className="flex-1 max-w-[16px] bg-emerald-500 rounded-t transition-all duration-300 hover:brightness-110"
                      style={{ height: `${Math.max(revHeight, 2)}%` }}
                      title={`รายได้: ${baht(m.revenue)} บ.`}
                    />
                    {/* Receivable Bar */}
                    {showReceivablesInChart && (
                      <div
                        className="flex-1 max-w-[16px] bg-amber-400 rounded-t transition-all duration-300 hover:brightness-110"
                        style={{ height: `${Math.max(recHeight, 2)}%` }}
                        title={`ยอดค้างรับ: ${baht(m.receivable)} บ.`}
                      />
                    )}
                    {/* Expense Bar */}
                    <div
                      className="flex-1 max-w-[16px] bg-rose-400 rounded-t transition-all duration-300 hover:brightness-110"
                      style={{ height: `${Math.max(expHeight, 2)}%` }}
                      title={`ค่าใช้จ่าย: ${baht(m.expense)} บ.`}
                    />
                  </div>
                  <span className="text-[11px] text-steel-600 dark:text-slate-400 mt-2 font-bold">
                    {m.shortName}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 7. เอกสารล่าสุดในระบบ (Cross-Department Recent Documents Trace - อยู่เดี่ยวเต็มความกว้าง) */}
      {/* ------------------------------------------------------------------------ */}
      <div id="recent-documents" className="rounded-2xl border border-steel-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-steel-900 dark:text-slate-100 text-base">
                7. เอกสารล่าสุดในระบบ (Cross-Department Recent Documents)
              </h3>
              <p className="text-xs text-steel-500 dark:text-slate-400">
                ติดตามการเคลื่อนไหวของเอกสารข้ามฝ่าย (ใบแจ้งหนี้, ใบสำคัญจ่าย, ใบสั่งซื้อ, เจ้าหนี้การค้า)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-steel-700 dark:text-slate-300 border border-steel-200 dark:border-slate-700">
              {recentDocuments.length} รายการ
            </span>

            {/* ปุ่มย่อ / ขยาย รายการเอกสาร */}
            <button
              type="button"
              onClick={() => setRecentDocCollapsed(!recentDocCollapsed)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-steel-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
              title={recentDocCollapsed ? 'ขยายรายการ' : 'ย่อรายการ'}
            >
              {recentDocCollapsed ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5 text-sky-600" />
                  <span>ขยายรายการ</span>
                </>
              ) : (
                <>
                  <ChevronUp className="h-3.5 w-3.5 text-steel-500" />
                  <span>ย่อรายการ</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar, Row Limit, & Subtabs for Documents Feed (ตัวกรอง, ค้นหา, และเลือกจำนวนบรรทัด) */}
        {!recentDocCollapsed && (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 border-b border-steel-100 dark:border-slate-800 pb-3">
            {/* Subtabs for Documents Feed */}
            <div className="flex items-center gap-1.5 text-xs font-bold flex-wrap">
              <button
                type="button"
                onClick={() => setRecentDocTab('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${recentDocTab === 'all' ? 'bg-steel-900 text-white shadow-xs' : 'bg-steel-50 dark:bg-slate-800 text-steel-600 dark:text-slate-300 hover:bg-steel-100 dark:hover:bg-slate-700'}`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setRecentDocTab('revenue')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${recentDocTab === 'revenue' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100'}`}
              >
                รายได้ (INV)
              </button>
              <button
                type="button"
                onClick={() => setRecentDocTab('receivables')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${recentDocTab === 'receivables'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                  }`}
              >
                <span>ค้างรับ (AR)</span>
                {arInvoicesCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${recentDocTab === 'receivables' ? 'bg-white text-amber-800' : 'bg-amber-200 text-amber-900'
                    }`}>
                    {arInvoicesCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRecentDocTab('expenses')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${recentDocTab === 'expenses' ? 'bg-rose-700 text-white shadow-xs' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-100'}`}
              >
                รายจ่าย (EXP)
              </button>
              <button
                type="button"
                onClick={() => setRecentDocTab('purchasing')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${recentDocTab === 'purchasing' ? 'bg-amber-700 text-white shadow-xs' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'}`}
              >
                จัดซื้อ (PO)
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Search Box in Recent Documents with proper pl-10 (Fix icon overlap) */}
              <div className="relative flex-1 sm:w-64 min-w-[200px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={recentDocSearch}
                  onChange={(e) => setRecentDocSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่บิล, คู่ค้า, โครงการ..."
                  className="w-full rounded-xl border border-steel-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-8 py-1.5 text-xs text-steel-900 dark:text-slate-100 placeholder:text-steel-400 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition shadow-2xs"
                />
                {recentDocSearch && (
                  <button
                    type="button"
                    onClick={() => setRecentDocSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                    title="ล้างคำค้นหา"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Row Limit Selector (เลือกจำนวนบรรทัดที่ต้องการแสดง) */}
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <span className="text-steel-500 dark:text-slate-400 font-semibold text-[11px]">แสดง:</span>
                {[
                  { id: '6', label: '6 รายการ' },
                  { id: '12', label: '12 รายการ' },
                  { id: '24', label: '24 รายการ' },
                  { id: 'all', label: 'ทั้งหมด' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRecentDocLimit(opt.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      recentDocLimit === opt.id
                        ? 'bg-sky-700 text-white shadow-2xs'
                        : 'bg-steel-100 dark:bg-slate-800 text-steel-600 dark:text-slate-300 hover:bg-steel-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Spacious 2-Column Responsive Feed Cards - ข้อความอ่านได้ต่อเนื่อง ไม่ถูกตัด ไม่เบียด */}
        {!recentDocCollapsed && (
          displayedRecentDocs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayedRecentDocs.map((doc, idx) => (
                <div
                  key={`${doc.type}-${doc.id}-${idx}`}
                  className="rounded-xl border border-steel-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-xs transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-xs font-black shrink-0 ${doc.type === 'INV' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' :
                          doc.type === 'EXP' ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800' :
                            doc.type === 'PO' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}>
                          {doc.type}
                        </span>
                        <span className="font-mono text-xs font-bold text-steel-900 dark:text-slate-100">{doc.docNo}</span>
                      </div>
                      <span className="text-xs text-steel-400 dark:text-slate-500 font-mono shrink-0">{doc.date}</span>
                    </div>

                    {/* Party Name - ข้อความอ่านได้ต่อเนื่อง ไม่ truncate */}
                    <div className="mt-2 text-sm font-bold text-steel-900 dark:text-slate-100 break-words leading-snug" title={doc.party}>
                      {doc.party}
                    </div>

                    {/* Project / Description - ข้อความอ่านได้ต่อเนื่อง */}
                    <div className="text-xs text-steel-600 dark:text-slate-400 mt-1 break-words leading-relaxed" title={doc.project}>
                      {doc.project}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-steel-100 dark:border-slate-800 pt-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${doc.statusColor}`}>
                        {doc.statusText}
                      </span>
                      {doc.type === 'INV' && doc.remainingAmount > 0 && (
                        <span className="rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 font-mono text-[11px] font-bold px-2 py-0.5">
                          ค้างรับ {baht(doc.remainingAmount)} บ.
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-steel-900 dark:text-slate-100">
                        {baht(doc.amount)} <span className="text-xs font-normal text-steel-500 dark:text-slate-400">บ.</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-steel-400 text-xs space-y-2 border border-dashed rounded-xl">
              <p>ไม่พบเอกสารที่ตรงกับคำค้นหา "{recentDocSearch}"</p>
              {recentDocSearch && (
                <button
                  type="button"
                  onClick={() => setRecentDocSearch('')}
                  className="text-xs font-bold text-sky-700 hover:underline cursor-pointer"
                >
                  ล้างคำค้นหา
                </button>
              )}
            </div>
          )
        )}
      </div>

      {/* ------------------------------------------------------------------------ */}
      {/* 7. Section 3: AR & AP Aging Breakdown (วิเคราะห์อายุลูกหนี้ & หนี้เจ้าหนี้) */}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-steel-900 break-words leading-snug">{ap.vendor_name}</span>
                    <span className={`rounded-full px-2 py-0.2 text-[9px] font-bold shrink-0 ${ap.alert_level === 'urgent' ? 'bg-rose-100 text-rose-800' :
                      ap.alert_level === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                      {ap.alert_level === 'urgent' ? 'เกินกำหนด' : ap.alert_level === 'warning' ? 'เตือน' : 'ปกติ'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-steel-500 break-words leading-relaxed">
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
      {/* 8. Quick Navigation to Specialized Departments & Accounting Modules        */}
      {/* ------------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-steel-900 p-6 text-white shadow-sm border border-steel-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-bold text-base text-white">ต้องการตรวจสอบเอกสารและฝ่ายต่าง ๆ โดยละเอียด?</h3>
            <p className="mt-0.5 text-xs text-steel-400">
              เข้าถึงฝ่ายจัดซื้อ (PO), คลังสินค้า (Store), โครงการ (Projects), สมุดรายวันทั่วไป (GL) หรือรายงานภาษี ภ.พ.30 ได้ทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/purchasing"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              ฝ่ายจัดซื้อ (PO)
            </Link>
            <Link
              to="/store"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              คลังสินค้า (Store)
            </Link>
            <Link
              to="/projects"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              ฝ่ายโครงการ
            </Link>
            <Link
              to="/accounting/journals"
              className="rounded-xl bg-steel-800 hover:bg-steel-700 px-3 py-2 text-xs font-bold text-white transition border border-steel-700"
            >
              สมุดรายวันทั่วไป (GL)
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
