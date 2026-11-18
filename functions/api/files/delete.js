// POST /api/files/delete   body: { key }   (สิทธิ์เท่ากับสิทธิ์อัปโหลดของประเภทนั้น)
import { KINDS, UPLOAD_TTL, json, getRole, r2Config, signFor, parseKey } from '../../_lib/files-common.js'

export async function onRequestPost({ request, env }) {
  const cfg = r2Config(env)
  if (cfg.error) return json({ error: cfg.error }, 500)

  const role = await getRole(request, env)
  if (!role) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }
  const info = parseKey(body?.key)
  if (!info) return json({ error: 'key ไม่ถูกต้อง' }, 400)
  if (!KINDS[info.kind].upload.includes(role)) return json({ error: 'ไม่มีสิทธิ์ลบไฟล์ประเภทนี้' }, 403)

  const url = await signFor(cfg, 'DELETE', body.key, { expires: UPLOAD_TTL })
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return json({ error: 'ลบไฟล์ไม่สำเร็จ' }, 502)
  return json({ ok: true })
}
