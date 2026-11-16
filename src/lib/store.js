import { supabase } from './supabase'

// สิทธิ์จัดการสโตร์ (สโตร์ และ แอดมิน)
export const canManageStore = (role) => ['store', 'admin'].includes(role)
export const canIssueStock = canManageStore

// แปลงและจัดรูปแบบจำนวนนับในสโตร์ให้เป็นจำนวนเต็ม (Integer)
export function formatIntQty(val) {
  if (val === null || val === undefined || val === '') return '0'
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
  if (isNaN(num)) return '0'
  return Math.round(num).toLocaleString('th-TH')
}

export function toIntQty(val) {
  if (val === null || val === undefined || val === '') return 0
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
  if (isNaN(num)) return 0
  return Math.round(num)
}

// คำอุปสรรครหัสวัสดุแยกตามหมวดหมู่
export const CATEGORY_PREFIXES = {
  'ปูน ทราย หิน': 'CM',
  'เหล็ก': 'ST',
  'ไม้และแผ่นไม้': 'WD',
  'ไฟฟ้า': 'EL',
  'ประปาและสุขภัณฑ์': 'PL',
  'สีและเคมีภัณฑ์': 'CH',
  'อุปกรณ์/เครื่องมือ': 'TL',
  'อื่น ๆ': 'OT',
}

// หา Prefix ตามชื่อหมวดหมู่
export function getCategoryPrefix(categoryName) {
  if (!categoryName) return 'ITM'
  for (const [key, prefix] of Object.entries(CATEGORY_PREFIXES)) {
    if (categoryName.includes(key) || key.includes(categoryName)) return prefix
  }
  return 'ITM'
}

// อัปโหลดรูปภาพวัสดุไปยัง Supabase Storage bucket 'item-images'
export async function uploadItemImage(file) {
  if (!file) return null
  const ext = file.name.split('.').pop() || 'jpg'
  const cleanExt = ext.toLowerCase()
  const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${cleanExt}`
  const filePath = `uploads/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('item-images')
    .upload(filePath, file, { cacheControl: '3600', upsert: true })

  if (uploadError) {
    console.warn('Storage upload warning:', uploadError)
    // ถ้าไม่มี bucket หรือติดสิทธิ์ ให้ใช้ Data URL ชั่วคราวเพื่อให้ผู้ใช้ใช้งานต่อได้ไม่สะดุด
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.readAsDataURL(file)
    })
  }

  const { data } = supabase.storage.from('item-images').getPublicUrl(filePath)
  return data?.publicUrl || null
}
