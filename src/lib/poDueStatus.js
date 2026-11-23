/**
 * Helper วิเคราะห์สถานะวันครบกำหนดส่งมอบ (PO Due Date Status)
 * รองรับการคำนวณวันคงเหลือ / วันที่เลยกำหนด / ส่งมอบเสร็จสิ้น
 */

export function getPoDueStatus(po) {
  if (!po) return null

  // 1. ถ้าใบสั่งซื้อถูกยกเลิก
  if (po.status === 'cancelled') {
    return {
      code: 'cancelled',
      label: 'ยกเลิกคำสั่งซื้อ',
      badgeCls: 'bg-steel-100 text-steel-500 border-steel-200',
      icon: '',
      daysDiff: null,
      description: 'ใบสั่งซื้อนี้ถูกยกเลิกแล้ว',
    }
  }

  // 2. ถ้าตรวจรับสินค้าครบถ้วนแล้ว
  if (po.status === 'received') {
    return {
      code: 'completed',
      label: 'ส่งมอบครบถ้วนแล้ว',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
      icon: '',
      daysDiff: null,
      description: 'ตรวจรับเข้าสโตร์เรียบร้อยครบทุกรายการ',
    }
  }

  // 3. ถ้าไม่ได้ระบุวันครบกำหนดส่งมอบ
  if (!po.expected_delivery_date) {
    return {
      code: 'no_date',
      label: 'ไม่ได้ระบุกำหนดส่ง',
      badgeCls: 'bg-steel-100 text-steel-500 border-steel-200',
      icon: '⏳',
      daysDiff: null,
      description: 'กรุณาระบุวันกำหนดส่งมอบในใบสั่งซื้อ',
    }
  }

  // 4. คำนวณความต่างของวันเทียบกับวันนี้
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // แยก parse yyyy-mm-dd เพื่อป้องกันปัญหา timezone
  const parts = String(po.expected_delivery_date).split('T')[0].split('-')
  const dueDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  dueDate.setHours(0, 0, 0, 0)

  const diffTime = dueDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  // เกินกำหนด (Overdue)
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays)
    return {
      code: 'overdue',
      label: `เกินกำหนด ${overdueDays} วัน`,
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-300 font-black animate-pulse',
      icon: '',
      daysDiff: diffDays,
      description: `เลยกำหนดส่งมอบมาแล้ว ${overdueDays} วัน ต้องเร่งรัดผู้ขายด่วน!`,
      isAlert: true,
    }
  }

  // ครบกำหนดวันนี้ (Today)
  if (diffDays === 0) {
    return {
      code: 'today',
      label: 'ครบกำหนดส่งวันนี้',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-400 font-black',
      icon: '',
      daysDiff: 0,
      description: 'สินค้ามีกำหนดส่งมอบภายในวันนี้',
      isAlert: true,
    }
  }

  // ใกล้ครบกำหนด (ภายใน 7 วัน)
  if (diffDays <= 7) {
    return {
      code: 'urgent',
      label: `อีก ${diffDays} วันครบกำหนด`,
      badgeCls: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
      icon: '⏰',
      daysDiff: diffDays,
      description: `ใกล้ถึงวันส่งมอบในอีก ${diffDays} วัน`,
      isAlert: false,
    }
  }

  // ส่งมอบตามกำหนดปกติ (> 7 วัน)
  return {
    code: 'on_track',
    label: `อีก ${diffDays} วัน`,
    badgeCls: 'bg-blue-50 text-blue-800 border-blue-200 font-medium',
    icon: '',
    daysDiff: diffDays,
    description: `อยู่ในกำหนดเวลาส่งมอบ (เหลืออีก ${diffDays} วัน)`,
    isAlert: false,
  }
}

/**
 * จัดรูปแบบวันที่ไทยแบบย่อหรือเต็ม
 */
export function formatThaiDate(dateStr, full = false) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: full ? 'long' : 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

