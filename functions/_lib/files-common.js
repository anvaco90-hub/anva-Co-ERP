// ค่ากลาง + ตรวจสิทธิ์ สำหรับ /api/files/*
import { presign } from './sigv4.js'

export const MB = 1024 * 1024
export const MAX_SIZE = 15 * MB
export const UPLOAD_TTL = 300 // 5 นาที
export const VIEW_TTL = 600 // 10 นาที

export const ANY_ROLE = '*' // ทุก role ที่ active (get_my_role() ไม่ null)
const IMAGES = ['image/jpeg', 'image/png', 'image/webp']
const DOCS_AND_IMAGES = ['application/pdf', ...IMAGES]

// ★ แก้สิทธิ์ตรงนี้ที่เดียว ★
// upload = ใครอัปโหลด/ลบไฟล์ได้, view = ใครเปิดดูได้ (ANY_ROLE หรือรายชื่อ role), types = ชนิดไฟล์ที่รับ
export const KINDS = {
  quotations: { upload: ['purchasing', 'admin'], view: ANY_ROLE, types: DOCS_AND_IMAGES },
  'delivery-notes': { upload: ['purchasing', 'store', 'admin'], view: ANY_ROLE, types: DOCS_AND_IMAGES },
  items: { upload: ['store', 'admin'], view: ANY_ROLE, types: IMAGES },
}

export const EXT_BY_TYPE = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const TYPE_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  })

// ตรวจ JWT + อ่าน role ผ่าน get_my_role() ของ Supabase (คืน null ถ้า token ผิด/หมดอายุ/ผู้ใช้ยังไม่ active)
export async function getRole(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${m[1]}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!res.ok) return null
  const role = await res.json()
  return typeof role === 'string' ? role : null
}

export function r2Config(env) {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']
  const missing = need.filter((k) => !env[k])
  if (missing.length) return { error: 'ตั้งค่าเซิร์ฟเวอร์ไม่ครบ: ' + missing.join(', ') }
  return {
    host: env.R2_HOST || `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  }
}

export function signFor(cfg, method, key, opts = {}) {
  return presign({
    method,
    host: cfg.host,
    path: `/${cfg.bucket}/${key}`,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    ...opts,
  })
}

// ชื่อไฟล์ปลอดภัย: เก็บตัวอักษร (รวมไทย) ตัวเลข . _ - ที่เหลือแทนด้วย _
export function safeBaseName(name) {
  let base = String(name || 'file').split(/[\\/]/).pop().normalize('NFC')
  base = base.replace(/\.[^.]*$/, '') // ตัดนามสกุลเดิมทิ้ง (เราใส่ตามชนิดไฟล์เอง)
  base = base.replace(/[^\p{L}\p{N}\p{M}._-]+/gu, '_').replace(/^[_.-]+|[_.-]+$/g, '')
  return (base || 'file').slice(0, 80)
}

export function buildKey(kind, name, contentType) {
  const ym = new Date().toISOString().slice(0, 7) // 2026-11
  return `${kind}/${ym}/${crypto.randomUUID()}-${safeBaseName(name)}.${EXT_BY_TYPE[contentType]}`
}

const KEY_RE = /^([a-z-]+)\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-([^/]{1,120})\.(pdf|jpg|png|webp)$/u

// ตรวจรูปแบบ key ที่ Worker เป็นคนสร้างเท่านั้น คืน {kind, displayName, contentType} หรือ null
export function parseKey(key) {
  if (typeof key !== 'string' || key.length > 300 || key.includes('..')) return null
  const m = key.match(KEY_RE)
  if (!m || !KINDS[m[1]]) return null
  return { kind: m[1], displayName: `${m[2]}.${m[3]}`, contentType: TYPE_BY_EXT[m[3]] }
}
