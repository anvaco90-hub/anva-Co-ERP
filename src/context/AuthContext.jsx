import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // { id, full_name, role, is_active }
  const [loading, setLoading] = useState(true)

  // โหลด profile (มี role) ของผู้ใช้ที่ล็อกอินอยู่
  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', userId)
      .single()
    setProfile(error ? null : data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // เลื่อนไปรอบถัดไปเพื่อเลี่ยงเรียก supabase ใน callback ตรง ๆ (deadlock)
      setTimeout(() => (s ? loadProfile(s.user.id) : setProfile(null)), 0)
    })
    return () => sub.subscription.unsubscribe()
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
