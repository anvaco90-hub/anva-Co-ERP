// ไฟล์แนบทั้งระบบ — อัปโหลด/ดูไฟล์ผ่าน R2 (Cloudflare Pages Functions: /api/files/*)
// ทุกโมดูลต้องเรียกผ่านไฟล์นี้เท่านั้น ห้ามต่อ R2 หรือ supabase.storage ตรงๆ
import { supabase } from './supabase'

export const MAX_SIZE = 15 * 1024 * 1024 // ต้องตรงกับ MAX_SIZE ใน functions/_lib/files-common.js
export const ACCEPT_ALL = 'application/pdf,image/jpeg,image/png,image/webp'
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp'

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_DIMENSION = 1600 // ย่อรูปที่ด้านยาวเกินนี้
const SHRINK_ABOVE = 1.5 * 1024 * 1024 // ย่อรูปที่ใหญ่เกิน 1.5 MB ด้วย

async function api(path, body) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่')
  const res = await fetch(`/api/files/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(data?.error || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`)
  return data
}

// ย่อรูปก่อนอัปโหลด (รูปถ่ายจากมือถือมักใหญ่หลาย MB) — PDF ผ่านไปตามเดิม
async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) return file
  let bmp
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= SHRINK_ABOVE) {
    bmp.close?.()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // PNG โปร่งใสจะไม่กลายเป็นพื้นดำตอนแปลงเป็น JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
  if (!blob || (scale === 1 && blob.size >= file.size)) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

function putWithProgress(url, headers, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`อัปโหลดไม่สำเร็จ (${xhr.status})`))
    xhr.onerror = () => reject(new Error('เครือข่ายขัดข้อง อัปโหลดไม่สำเร็จ'))
    xhr.send(file)
  })
}

/**
 * อัปโหลดไฟล์ 1 ไฟล์ → คืน { r2Key, name, contentType, size } เก็บลงคอลัมน์ jsonb ได้เลย
 * kind: 'quotations' | 'delivery-notes' | 'items'
 */
export async function uploadFile(file, kind, { onProgress } = {}) {
  const prepared = await shrinkImage(file)
  if (!ALLOWED.includes(prepared.type)) throw new Error('รองรับเฉพาะ PDF, JPG, PNG, WebP')
  if (prepared.size > MAX_SIZE) throw new Error('ไฟล์ใหญ่เกิน 15 MB')

  const { key, uploadUrl, headers } = await api('upload-url', {
    kind,
    name: prepared.name,
    contentType: prepared.type,
    size: prepared.size,
  })
  await putWithProgress(uploadUrl, headers, prepared, onProgress)
  return { r2Key: key, name: prepared.name, contentType: prepared.type, size: prepared.size }
}

// ---------- ขอ URL สำหรับดูไฟล์ (อายุ 10 นาที) พร้อม cache + รวมคำขอเป็นก้อนเดียว ----------
const cache = new Map() // key -> { url, exp }
let pending = new Map() // key -> [{ resolve, reject }]
let timer = null

const isDirectUrl = (k) => /^(https?:|blob:|data:)/i.test(k)

export function invalidateFileUrl(key) {
  cache.delete(key)
}

export function getFileUrl(key) {
  if (!key) return Promise.resolve(null)
  if (isDirectUrl(key)) return Promise.resolve(key) // รูปเก่าที่ยังเป็น URL ของ Supabase
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now() + 30_000) return Promise.resolve(hit.url)
  return new Promise((resolve, reject) => {
    const list = pending.get(key) || []
    list.push({ resolve, reject })
    pending.set(key, list)
    if (!timer) timer = setTimeout(flush, 40)
  })
}

async function flush() {
  const batch = pending
  pending = new Map()
  timer = null
  const keys = [...batch.keys()]
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100)
    try {
      const data = await api('view-urls', { keys: chunk })
      const exp = Date.now() + data.expiresIn * 1000
      for (const k of chunk) {
        const url = data.urls?.[k]
        if (url) cache.set(k, { url, exp })
        for (const p of batch.get(k)) url ? p.resolve(url) : p.reject(new Error(data.errors?.[k] || 'เปิดไฟล์ไม่ได้'))
      }
    } catch (err) {
      for (const k of chunk) for (const p of batch.get(k)) p.reject(err)
    }
  }
}

// เปิดไฟล์ในแท็บใหม่ (เปิดแท็บก่อนแล้วค่อยใส่ URL กัน Safari บล็อก popup)
export async function openFile(key) {
  const w = window.open('about:blank', '_blank')
  if (w) w.opener = null
  try {
    const url = await getFileUrl(key)
    if (w) w.location.href = url
    else window.location.href = url
  } catch (err) {
    w?.close()
    throw err
  }
}

// ลบไฟล์ออกจาก R2 (ไม่ถูกเรียกอัตโนมัติ — ดูหมายเหตุในไฟล์ R2_SETUP.md)
export async function deleteFile(key) {
  await api('delete', { key })
}