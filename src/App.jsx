import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import PurchasingLayout from './pages/purchasing/PurchasingLayout'
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
import { NAV_ITEMS } from './lib/roles'

const rolesOf = (path) => NAV_ITEMS.find((i) => i.path === path).roles
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
        <Route path="purchasing" element={guard('/purchasing', <PurchasingLayout />)}>
          <Route index element={<PRList />} />
          <Route path="pr/new" element={<PRForm />} />
          <Route path="pr/:id" element={<PRDetail />} />
          <Route path="pr/:id/edit" element={<ProtectedRoute roles={['purchasing', 'admin']}><PRForm /></ProtectedRoute>} />
          <Route path="po" element={<POList />} />
          <Route path="po/new" element={<POForm />} />
          <Route path="po/:id" element={<PODetail />} />
          <Route path="po/:id/edit" element={<ProtectedRoute roles={['purchasing', 'admin']}><POForm /></ProtectedRoute>} />
          <Route path="vendors" element={<Vendors />} />
        </Route>
        <Route path="store" element={guard('/store', <StoreLayout />)}>
          <Route index element={<StockList />} />
          <Route path="receipts" element={<ReceiptsList />} />
          <Route path="issue/new" element={<ProtectedRoute roles={['store', 'admin']}><IssueForm /></ProtectedRoute>} />
          <Route path="issues" element={<IssueList />} />
          <Route path="adjust" element={<ProtectedRoute roles={['store', 'admin']}><AdjustStock /></ProtectedRoute>} />
          <Route path="items" element={<ItemsMaster />} />
        </Route>
        <Route path="accounting" element={guarded('/accounting', 'บัญชี', '5')} />
        <Route path="hr" element={guarded('/hr', 'บุคลากร', '6')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
