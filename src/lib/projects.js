export const STATUS_LABELS = {
  planning: 'วางแผน',
  in_progress: 'กำลังก่อสร้าง',
  on_hold: 'หยุดชั่วคราว',
  completed: 'เสร็จสิ้น',
}

export const STATUS_STYLES = {
  planning: 'bg-steel-100 text-steel-700',
  in_progress: 'bg-hivis/30 text-ink',
  on_hold: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
}

export const BUDGET_CATEGORIES = [
  'หมวดค่าอุปกรณ์และวัสดุก่อสร้างหลัก',
  'หมวดค่าแรงงานและการติดตั้ง',
  'หมวดค่าเครื่องจักรและเช่าอุปกรณ์',
  'หมวดค่าผู้รับเหมาช่วงและบริการภายนอก',
  'หมวดค่าดำเนินการและโสหุ้ย',
  'งบสำรองฉุกเฉิน',
]

export const baht = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const canEditProjects = (role) => ['admin', 'management'].includes(role)