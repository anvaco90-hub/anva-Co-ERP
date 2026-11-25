import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import PurchasingLayout from './pages/purchasing/PurchasingLayout'
import PurchasingHub from './pages/purchasing/PurchasingHub'
import PRList from './pages/purchasing/PRList'
import PRForm from './pages/purchasing/PRForm'
import PRDetail from './pages/purchasing/PRDetail'
import POList from './pages/purchasing/POList'
import POForm from './pages/purchasing/POForm'
import PODetail from './pages/purchasing/PODetail'
import Vendors from './pages/purchasing/Vendors'
import StoreLayout from './pages/store/StoreLayout'
import StockList from './pages/store/StockList'
import IssueForm from './pages/store/IssueForm'
import IssueList from './pages/store/IssueList'
import ReceiptsList from './pages/store/ReceiptsList'
import AdjustStock from './pages/store/AdjustStock'
import ItemsMaster from './pages/store/ItemsMaster'
import ProjectList from './pages/projects/ProjectList'
import ProjectForm from './pages/projects/ProjectForm'
import ProjectDetail from './pages/projects/ProjectDetail'
import QuotationList from './pages/quotations/QuotationList'
import QuotationForm from './pages/quotations/QuotationForm'
import QuotationDetail from './pages/quotations/QuotationDetail'
import BOQList from './pages/boq/BOQList'
import BOQForm from './pages/boq/BOQForm'
import BOQDetail from './pages/boq/BOQDetail'
import AccountingDashboard from './pages/accounting/AccountingDashboard'
import AccountingLayout from './pages/accounting/AccountingLayout'
import JournalEntriesPage from './pages/accounting/JournalEntriesPage'
import ArAgingPage from './pages/accounting/ArAgingPage'
import ApAgingPage from './pages/accounting/ApAgingPage'
import ExpensesPage from './pages/accounting/ExpensesPage'
import TaxReportsPage from './pages/accounting/TaxReportsPage'
import ChartOfAccountsPage from './pages/accounting/ChartOfAccountsPage'
import HRDashboard from './pages/hr/HRDashboard'
import ContactsPage from './pages/contacts/ContactsPage'
import { NAV_ITEMS } from './lib/roles'

const rolesOf = (path) => {
  for (const item of NAV_ITEMS) {
    if (item.path === path) return item.roles
    if (item.children) {
      const child = item.children.find((c) => c.path === path || c.path.split('?')[0] === path)
      if (child) return child.roles || item.roles
    }
  }
  return ['admin', 'accounting', 'management']
}
const guard = (path, el) => <ProtectedRoute roles={rolesOf(path)}>{el}</ProtectedRoute>
const guarded = (path, title, step) => (
  <ProtectedRoute roles={rolesOf(path)}>
    <Placeholder title={title} step={step} />
  </ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={guard('/projects', <ProjectList />)} />
        {/* สร้าง/แก้ไขจำกัดเฉพาะ admin + management (ตรงกับ RLS) */}
        <Route path="projects/new" element={<ProtectedRoute roles={['admin', 'management']}><ProjectForm /></ProtectedRoute>} />
        <Route path="projects/:id" element={guard('/projects', <ProjectDetail />)} />
        <Route path="projects/:id/edit" element={<ProtectedRoute roles={['admin', 'management']}><ProjectForm /></ProtectedRoute>} />
        <Route path="quotations" element={guard('/quotations', <QuotationList />)} />
        <Route path="quotations/new" element={guard('/quotations', <QuotationForm />)} />
        <Route path="quotations/:id" element={guard('/quotations', <QuotationDetail />)} />
        <Route path="quotations/:id/edit" element={guard('/quotations', <QuotationForm />)} />
        
        {/* ระบบ BOQ (Bill of Quantities) */}
        <Route path="boq" element={guard('/boq', <BOQList />)} />
        <Route path="boq/new" element={guard('/boq', <BOQForm />)} />
        <Route path="boq/:id" element={guard('/boq', <BOQDetail />)} />
        <Route path="boq/:id/edit" element={guard('/boq', <BOQForm />)} />
        <Route path="purchasing" element={guard('/purchasing', <PurchasingLayout />)}>
          <Route index element={<PurchasingHub />} />
          <Route path="pr/new" element={<PRForm />} />
          <Route path="pr/:id" element={<PRDetail />} />
          <Route path="pr/:id/edit" element={<ProtectedRoute roles={['purchasing', 'store', 'admin']}><PRForm /></ProtectedRoute>} />
          <Route path="po" element={<Navigate to="/purchasing?tab=po" replace />} />
          <Route path="po/new" element={<POForm />} />
          <Route path="po/:id" element={<PODetail />} />
          <Route path="po/:id/edit" element={<ProtectedRoute roles={['purchasing', 'store', 'admin']}><POForm /></ProtectedRoute>} />
          <Route path="vendors" element={<Vendors />} />
        </Route>
        <Route path="store" element={<ProtectedRoute roles={['admin', 'store', 'management', 'purchasing']}><StoreLayout /></ProtectedRoute>}>
          <Route index element={<StockList />} />
          <Route path="receipts" element={<ReceiptsList />} />
          <Route path="issue/new" element={<ProtectedRoute roles={['store', 'admin', 'purchasing']}><IssueForm /></ProtectedRoute>} />
          <Route path="issues" element={<IssueList />} />
          <Route path="adjust" element={<ProtectedRoute roles={['store', 'admin']}><AdjustStock /></ProtectedRoute>} />
          <Route path="items" element={<ItemsMaster />} />
        </Route>
        <Route path="accounting" element={guard('/accounting', <AccountingLayout />)}>
          <Route index element={<Navigate to="/accounting/journals" replace />} />
          <Route path="journals" element={<JournalEntriesPage />} />
          <Route path="ar-aging" element={<ArAgingPage />} />
          <Route path="ap-aging" element={<ApAgingPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="tax-reports" element={<TaxReportsPage />} />
          <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="dashboard" element={<AccountingDashboard />} />
        </Route>
        <Route path="hr" element={guard('/hr', <HRDashboard />)} />
        <Route path="contacts" element={guard('/contacts', <ContactsPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
