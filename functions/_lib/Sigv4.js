// AWS Signature V4 — presigned URL (query-string signing) สำหรับ Cloudflare R2 (S3 API)
// ไม่มี dependency ใช้ WebCrypto ที่มีใน Workers/Pages Functions อยู่แล้ว

const enc = new TextEncoder()

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function sha256Hex(str) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(str)))
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

// encode ตามกติกา SigV4 (ไม่ encode A-Z a-z 0-9 - _ . ~)
const uriEncode = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/**
 * สร้าง presigned URL
 * @param {object} o
 * @param {string} o.method           GET | PUT | DELETE
 * @param {string} o.host             เช่น <account>.r2.cloudflarestorage.com
 * @param {string} o.path             เช่น /bucket/quotations/2026-11/xxx.pdf  (ยังไม่ encode)
 * @param {string} o.accessKeyId
 * @param {string} o.secretAccessKey
 * @param {number} o.expires          วินาที
 * @param {object} [o.headers]        header ที่ต้องผูกกับลายเซ็น (เช่น content-type, content-length)
 * @param {object} [o.query]          query เพิ่มเติม (เช่น response-content-type)
 * @param {string} [o.region]         R2 ใช้ 'auto'
 * @param {Date}   [o.now]            ไว้ทดสอบ
 */
export async function presign(o) {
  const region = o.region || 'auto'
  const now = o.now || new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') // 20260101T000000Z
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${region}/s3/aws4_request`

  // headers ที่เซ็น: host เสมอ + ที่ส่งเข้ามา (ชื่อเป็นตัวพิมพ์เล็ก)
  const hdrs = { host: o.host }
  for (const [k, v] of Object.entries(o.headers || {})) hdrs[k.toLowerCase()] = String(v).trim()
  const signedNames = Object.keys(hdrs).sort()
  const canonicalHeaders = signedNames.map((n) => `${n}:${hdrs[n]}\n`).join('')
  const signedHeaders = signedNames.join(';')

  const query = {
    ...(o.query || {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${o.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(o.expires),
    'X-Amz-SignedHeaders': signedHeaders,
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')

  const canonicalPath = o.path
    .split('/')
    .map((seg) => uriEncode(seg))
    .join('/')

  const canonicalRequest = [
    o.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  let k = await hmac(enc.encode('AWS4' + o.secretAccessKey), dateStamp)
  k = await hmac(k, region)
  k = await hmac(k, 's3')
  k = await hmac(k, 'aws4_request')
  const signature = toHex(await hmac(k, stringToSign))

  return `https://${o.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`
}