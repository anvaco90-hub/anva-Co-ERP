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

  try {
    const { error: uploadError } = await supabase.storage
      .from('item-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true })

    if (!uploadError) {
      const { data } = supabase.storage.from('item-images').getPublicUrl(filePath)
      if (data?.publicUrl) return data.publicUrl
    } else {
      console.warn('Storage upload warning:', uploadError)
    }
  } catch (storageErr) {
    console.warn('Storage upload exception:', storageErr)
  }

  // Fallback: ใช้ Data URL พร้อมบีบอัดภาพเพื่อป้องกันปัญหา HTTP 413 Payload Too Large
  return new Promise((resolve) => {
    if (file.type && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const maxWidth = 1000
          let w = img.width
          let h = img.height
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w)
            w = maxWidth
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72)
          resolve(compressedDataUrl)
        }
        img.onerror = () => resolve(e.target.result)
        img.src = e.target.result
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
  })
}
