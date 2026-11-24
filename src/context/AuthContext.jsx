import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // { id, full_name, role, is_active }
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', userId)
      .single()
    setProfile(error ? null : data)
  }

  // ล้าง token ที่หมดอายุหรือไม่ถูกต้องออกจาก localStorage เพื่อป้องกัน 400 Bad Request ลูปซ้ำ
  const clearStaleSession = () => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key)
        }
      })
    } catch (e) {
      console.warn('Unable to access localStorage to clear stale token:', e)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        console.warn('Session recovery error, resetting stale auth:', error.message)
        clearStaleSession()
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch (_) {}
        setSession(null)
        setProfile(null)
      } else {
        setSession(data?.session || null)
        if (data?.session) await loadProfile(data.session.user.id)
      }
      setLoading(false)
    }).catch(async (err) => {
      console.warn('Failed to retrieve session:', err)
      clearStaleSession()
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch (_) {}
      setSession(null)
      setProfile(null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === 'SIGNED_OUT' || !s) {
        setSession(null)
        setProfile(null)
      } else if (event === 'TOKEN_REFRESH_FAILED') {
        clearStaleSession()
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch (_) {}
        setSession(null)
        setProfile(null)
      } else {
        setSession(s)
        setTimeout(() => (s ? loadProfile(s.user.id) : setProfile(null)), 0)
      }
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  const value = {
    session,
    profile,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}