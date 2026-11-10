// ชื่อ role ภาษาไทย
export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ',
  accounting: 'บัญชี',
  purchasing: 'จัดซื้อ',
  store: 'สโตร์',
  hr: 'ฝ่ายบุคคล',
  management: 'ผู้บริหาร',
}

// เมนู + role ที่เห็นเมนูนั้น (ฝั่ง UI เท่านั้น — การป้องกันจริงอยู่ที่ RLS)
export const NAV_ITEMS = [
  { path: '/', label: 'แดชบอร์ด', roles: ['admin', 'accounting', 'purchasing', 'store', 'hr', 'management'] },
  { path: '/projects', label: 'โครงการ', roles: ['admin', 'management', 'accounting', 'purchasing', 'store'] },
  { path: '/purchasing', label: 'จัดซื้อ', roles: ['admin', 'purchasing', 'management'] },
  { path: '/store', label: 'สโตร์', roles: ['admin', 'store', 'management'] },
  { path: '/accounting', label: 'บัญชี', roles: ['admin', 'accounting', 'management'] },
  { path: '/hr', label: 'บุคลากร', roles: ['admin', 'hr', 'management'] },
]
