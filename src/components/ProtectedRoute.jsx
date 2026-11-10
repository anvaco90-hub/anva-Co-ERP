import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// บังคับล็อกอิน และ (ถ้ากำหนด roles) ต้องมี role ที่อนุญาต
export default function ProtectedRoute({ roles, children }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <div className="p-8 text-steel-500">กำลังโหลด...</div>
  if (!session) return <Navigate to="/login" replace />

  if (!profile || !profile.is_active) {
    return (
      <div className="mx-auto mt-20 max-w-md rounded-lg bg-white p-6 text-center">
        <p className="font-semibold">บัญชียังไม่ได้เปิดใช้งาน</p>
        <p className="mt-2 text-sm text-steel-500">กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดสิทธิ์การใช้งาน</p>
      </div>
    )
  }
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}
