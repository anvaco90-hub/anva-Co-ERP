import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
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
        <Route path="purchasing" element={guarded('/purchasing', 'จัดซื้อ', '3')} />
        <Route path="store" element={guarded('/store', 'สโตร์', '4')} />
        <Route path="accounting" element={guarded('/accounting', 'บัญชี', '5')} />
        <Route path="hr" element={guarded('/hr', 'บุคลากร', '6')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
