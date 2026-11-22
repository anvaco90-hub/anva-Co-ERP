import React from 'react'

/**
 * ANVA & Co ERP Standard Universal Status Badge
 * 5 Standard States: draft | progress | success | warning | danger
 */
const STATUS_MAP = {
  // 1. ร่าง / รอ (Gray)
  draft: {
    group: 'draft',
    label: 'ฉบับร่าง',
    badgeCls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dotCls: 'bg-slate-400 dark:bg-slate-500',
  },
  pending: {
    group: 'draft',
    label: 'รอดำเนินการ',
    badgeCls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dotCls: 'bg-slate-400 dark:bg-slate-500',
  },
  open: {
    group: 'draft',
    label: 'เปิดใช้งาน',
    badgeCls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dotCls: 'bg-slate-400 dark:bg-slate-500',
  },

  // 2. กำลังดำเนินการ (Blue)
  in_progress: {
    group: 'progress',
    label: 'กำลังดำเนินการ',
    badgeCls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dotCls: 'bg-sky-500',
  },
  installing: {
    group: 'progress',
    label: 'กำลังติดตั้ง',
    badgeCls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dotCls: 'bg-sky-500',
  },
  partial: {
    group: 'progress',
    label: 'รับบางส่วน',
    badgeCls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dotCls: 'bg-sky-500',
  },
  waiting_approval: {
    group: 'progress',
    label: 'รออนุมัติ',
    badgeCls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dotCls: 'bg-sky-500',
  },

  // 3. สำเร็จ (Green)
  success: {
    group: 'success',
    label: 'สำเร็จ',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  approved: {
    group: 'success',
    label: 'อนุมัติแล้ว',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  ordered: {
    group: 'success',
    label: 'สั่งซื้อแล้ว',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  received: {
    group: 'success',
    label: 'รับครบแล้ว',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  paid: {
    group: 'success',
    label: 'ชำระแล้ว',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  completed: {
    group: 'success',
    label: 'ส่งมอบแล้ว',
    badgeCls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },

  // 4. ต้องระวัง (Orange / Amber)
  warning: {
    group: 'warning',
    label: 'ต้องระวัง',
    badgeCls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  near_due: {
    group: 'warning',
    label: 'ใกล้ครบกำหนด',
    badgeCls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  urgent: {
    group: 'warning',
    label: 'ด่วน / ต้องส่ง',
    badgeCls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  low_stock: {
    group: 'warning',
    label: 'สต็อกต่ำ',
    badgeCls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  unpaid: {
    group: 'warning',
    label: 'รอชำระเงิน',
    badgeCls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },

  // 5. มีปัญหา / ยกเลิก (Red)
  danger: {
    group: 'danger',
    label: 'มีปัญหา',
    badgeCls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
  overdue: {
    group: 'danger',
    label: 'เกินกำหนด',
    badgeCls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
  cancelled: {
    group: 'danger',
    label: 'ยกเลิก',
    badgeCls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
  rejected: {
    group: 'danger',
    label: 'ถูกปฏิเสธ',
    badgeCls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
}

export default function StatusBadge({
  status,
  group,
  label,
  dot = true,
  className = '',
}) {
  const key = String(status || group || 'draft').toLowerCase()
  const config = STATUS_MAP[key] || {
    label: label || status || 'ไม่ระบุ',
    badgeCls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dotCls: 'bg-slate-400',
  }

  const displayLabel = label || config.label

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeCls} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotCls}`} />}
      <span className="truncate">{displayLabel}</span>
    </span>
  )
}
