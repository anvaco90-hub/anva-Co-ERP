import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleLogin() {
    setBusy(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-steel-900 p-4">
      <div className="w-full max-w-sm rounded-lg border-t-8 border-hivis bg-white p-6">
        <h1 className="text-xl font-bold">เข้าสู่ระบบ ERP ก่อสร้าง</h1>
        <div className="mt-5 space-y-3">
          <label className="block text-sm">
            อีเมล
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            รหัสผ่าน
            <input
              className="input mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" onClick={handleLogin} disabled={busy || !email || !password}>
            {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
