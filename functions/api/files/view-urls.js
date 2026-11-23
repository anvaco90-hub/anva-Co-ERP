// POST /api/files/view-urls
// body: { keys: [..] }  →  { urls: { key: url }, errors: { key: msg }, expiresIn }
import { KINDS, ANY_ROLE, VIEW_TTL, json, corsHeaders, getRole, r2Config, signFor, parseKey } from '../../_lib/files-common.js'

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function onRequestPost({ request, env }) {
  const cfg = r2Config(env)
  if (cfg.error) return json({ error: cfg.error }, 500)

  const role = await getRole(request, env)
  if (!role) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }
  const keys = Array.isArray(body?.keys) ? [...new Set(body.keys)].slice(0, 100) : []
  if (!keys.length) return json({ urls: {}, errors: {}, expiresIn: VIEW_TTL })

  const urls = {}
  const errors = {}
  await Promise.all(
    keys.map(async (key) => {
      const info = parseKey(key)
      if (!info) { errors[key] = 'invalid'; return }
      const v = KINDS[info.kind].view
      if (v !== ANY_ROLE && !v.includes(role)) { errors[key] = 'forbidden'; return }
      urls[key] = await signFor(cfg, 'GET', key, {
        expires: VIEW_TTL,
        query: {
          // บังคับ content-type ตามนามสกุลที่ Worker สร้างเอง ไม่เชื่อค่าที่ไฟล์ถูกอัปโหลดมา
          'response-content-type': info.contentType,
          'response-content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(info.displayName)}`,
        },
      })
    })
  )
  return json({ urls, errors, expiresIn: VIEW_TTL })
}
