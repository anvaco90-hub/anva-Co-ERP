import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ในไฟล์ .env')
}

// ใช้ anon key เท่านั้น — สิทธิ์จริงควบคุมด้วย RLS ในฐานข้อมูล
export const supabase = createClient(url ?? '', anonKey ?? '')
