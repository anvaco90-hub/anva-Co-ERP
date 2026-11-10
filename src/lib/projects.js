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

// หมวดงบที่แนะนำ (พิมพ์หมวดอื่นเองได้)
export const BUDGET_CATEGORIES = ['ค่าวัสดุ', 'ค่าแรง', 'ค่าเครื่องจักร', 'ค่าผู้รับเหมาช่วง', 'ค่าใช้จ่ายอื่น']

export const baht = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ผู้ที่แก้ไขโครงการได้ (ต้องตรงกับ RLS ใน 001/002)
export const canEditProjects = (role) => ['admin', 'management'].includes(role)
