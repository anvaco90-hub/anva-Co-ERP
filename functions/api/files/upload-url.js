// POST /api/files/upload-url
// body: { kind, name, contentType, size }  →  { key, uploadUrl, headers, expiresIn }
import { KINDS, MAX_SIZE, UPLOAD_TTL, json, corsHeaders, getRole, r2Config, signFor, buildKey } from '../../_lib/files-common.js'

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
  if (!role) return json({ error: 'กรุณาเข้าสู่ระบบใหม่ (หรือบัญชียังไม่ได้เปิดใช้งาน)' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }
  const { kind, name, contentType, size } = body || {}

  const rule = KINDS[kind]
  if (!rule) return json({ error: 'ประเภทไฟล์แนบไม่ถูกต้อง' }, 400)
  if (!rule.upload.includes(role)) return json({ error: 'ไม่มีสิทธิ์อัปโหลดไฟล์ประเภทนี้' }, 403)
  if (!rule.types.includes(contentType)) return json({ error: 'รองรับเฉพาะ ' + rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ') }, 400)
  if (!Number.isInteger(size) || size <= 0) return json({ error: 'ขนาดไฟล์ไม่ถูกต้อง' }, 400)
  if (size > MAX_SIZE) return json({ error: 'ไฟล์ใหญ่เกิน 15 MB' }, 413)

  const key = buildKey(kind, name, contentType)

  // ผูก content-type และ content-length เข้ากับลายเซ็น: ส่งชนิด/ขนาดอื่นจากที่ขอ = R2 ปฏิเสธ
  const signed = { 'content-type': contentType }
  if (env.SIGN_CONTENT_LENGTH !== '0') signed['content-length'] = String(size)

  const uploadUrl = await signFor(cfg, 'PUT', key, { expires: UPLOAD_TTL, headers: signed })
  return json({ key, uploadUrl, headers: { 'Content-Type': contentType }, expiresIn: UPLOAD_TTL })
}
