export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ',
  accounting: 'บัญชี',
  purchasing: 'จัดซื้อ',
  store: 'สโตร์',
  hr: 'ฝ่ายบุคคล',
  management: 'ผู้บริหาร',
}

export const NAV_ITEMS = [
  { path: '/', label: 'แดชบอร์ด', roles: ['admin', 'accounting', 'purchasing', 'store', 'hr', 'management'] },
  { path: '/projects', label: 'โครงการ', roles: ['admin', 'management', 'accounting', 'purchasing', 'store'] },
  {
    path: '/quotations',
    label: 'งานขายและเสนอราคา',
    roles: ['admin', 'management', 'accounting', 'purchasing', 'store'],
    children: [
      { path: '/quotations', label: 'ใบเสนอราคา (QT)', roles: ['admin', 'management', 'accounting', 'purchasing', 'store'] },
      { path: '/boq', label: 'ประมาณราคา (BOQ)', roles: ['admin', 'management', 'accounting', 'purchasing', 'store'] },
      { path: '/contacts?role=customer', label: 'ทะเบียนลูกค้า (Customers)', roles: ['admin', 'management', 'accounting', 'purchasing', 'store'] },
    ],
  },
  {
    path: '/purchasing',
    label: 'จัดซื้อและพัสดุ',
    roles: ['admin', 'purchasing', 'store', 'management'],
    children: [
      { path: '/purchasing?tab=pipeline', label: 'ศูนย์งานจัดซื้อ (PR / PO)', roles: ['admin', 'purchasing', 'store', 'management'] },
      { path: '/purchasing?tab=pr', label: 'ใบขอซื้อ (PR)', roles: ['admin', 'purchasing', 'store', 'management'] },
      { path: '/purchasing?tab=po', label: 'ใบสั่งซื้อ (PO)', roles: ['admin', 'purchasing', 'store', 'management'] },
      { path: '/purchasing?tab=receipts', label: 'ตรวจรับของเข้า (GR)', roles: ['admin', 'purchasing', 'store', 'management'] },
      { path: '/contacts?role=vendor', label: 'ทะเบียนผู้ขาย (Vendors)', roles: ['admin', 'purchasing', 'store', 'management'] },
    ],
  },
  { path: '/store', label: 'สโตร์', roles: ['admin', 'store', 'management'] },
  {
    path: '/accounting',
    label: 'บัญชีและรายงาน',
    roles: ['admin', 'accounting', 'management'],
    children: [
      { path: '/accounting/journals', label: 'สมุดรายวัน & ตรวจสอบบัญชี', roles: ['admin', 'accounting', 'management'] },
      { path: '/accounting/ar-aging', label: 'รายงานลูกหนี้ (AR Aging)', roles: ['admin', 'accounting', 'management'] },
      { path: '/accounting/ap-aging', label: 'รายงานเจ้าหนี้ (AP Aging)', roles: ['admin', 'accounting', 'management'] },
      { path: '/accounting/expenses', label: 'ค่าใช้จ่ายและเงินสำรองจ่าย', roles: ['admin', 'accounting', 'management'] },
      { path: '/accounting/tax-reports', label: 'ระบบภาษีครบวงจร (ภ.พ.30/WHT)', roles: ['admin', 'accounting', 'management'] },
      { path: '/accounting/chart-of-accounts', label: 'ผังบัญชี (Chart of Accounts)', roles: ['admin', 'accounting', 'management'] },
    ],
  },
  { path: '/hr', label: 'บุคลากร', roles: ['admin', 'hr', 'management'] },
]