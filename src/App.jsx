import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import { NAV_ITEMS } from './lib/roles'

const rolesOf = (path) => NAV_ITEMS.find((i) => i.path === path).roles
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
        <Route path="projects" element={guarded('/projects', 'โครงการ', '2')} />
        <Route path="purchasing" element={guarded('/purchasing', 'จัดซื้อ', '3')} />
        <Route path="store" element={guarded('/store', 'สโตร์', '4')} />
        <Route path="accounting" element={guarded('/accounting', 'บัญชี', '5')} />
        <Route path="hr" element={guarded('/hr', 'บุคลากร', '6')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
