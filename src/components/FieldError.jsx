import React from 'react'

/**
 * แสดงข้อความเตือนเมื่อช่องฟอร์มว่าง หรือกรอกข้อมูลไม่ครบถ้วน
 * ตัวอย่างข้อความ: "ช่องนี้ยังไม่กรอก ช่องว่างนะ"
 */
export function FieldError({ error }) {
  if (!error) return null

  return (
    <div className="mt-1 flex items-center gap-1 text-xs font-bold text-rose-600 animate-in fade-in slide-in-from-top-1 duration-150">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[11px] font-black ring-1 ring-rose-300">
        !
      </span>
      <span>{error}</span>
    </div>
  )
}

/**
 * คืนค่า CSS Class สำหรับ Input/Select เมื่อมี Error
 */
export function fieldErrorClass(hasError, baseClass = '') {
  if (hasError) {
    return `${baseClass} !border-rose-500 !ring-2 !ring-rose-200 !bg-rose-50/40 text-rose-950 placeholder-rose-300 focus:!border-rose-600 focus:!ring-rose-300`
  }
  return baseClass
}

export default FieldError

