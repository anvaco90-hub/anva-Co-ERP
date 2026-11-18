import { useEffect, useState } from 'react'
import { getFileUrl, invalidateFileUrl } from '../lib/files'

// hook: ขอ URL ดูไฟล์จาก key (ถ้าเป็น URL เต็มอยู่แล้ว จะคืนค่าเดิม)
export function useFileUrl(fileKey, reloadToken = 0) {
  const [state, setState] = useState({ url: null, failed: false })
  useEffect(() => {
    let alive = true
    setState({ url: null, failed: false })
    if (!fileKey) return undefined
    getFileUrl(fileKey)
      .then((url) => alive && setState({ url, failed: false }))
      .catch(() => alive && setState({ url: null, failed: true }))
    return () => {
      alive = false
    }
  }, [fileKey, reloadToken])
  return state
}

// ใช้แทน <img src={item.image_url} /> — รับ key ของ R2 (หรือ URL เก่า) ได้ทั้งคู่
export default function R2Image({ fileKey, alt = '', className = '', ...rest }) {
  const [retry, setRetry] = useState(0)
  const { url, failed } = useFileUrl(fileKey, retry)

  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-steel-50 text-[10px] text-steel-400`}>
        เปิดรูปไม่ได้
      </div>
    )
  }
  if (!url) return <div className={`${className} animate-pulse bg-steel-100`} aria-hidden="true" />

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        // URL หมดอายุระหว่างเปิดหน้าค้างไว้ → ขอใหม่ 1 ครั้ง
        if (retry < 1) {
          invalidateFileUrl(fileKey)
          setRetry((n) => n + 1)
        }
      }}
      {...rest}
    />
  )
}
