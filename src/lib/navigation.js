/**
 * Pure sidebar matching and breadcrumb helpers for Layout navigation.
 */

function matchesBasePath(basePath, pathname) {
  if (!basePath) return false
  if (basePath === '/') return pathname === '/'
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

export function isNavChildActive(subPath, pathname = '/', search = '') {
  if (!subPath) return false

  if (subPath.includes('?')) {
    const [path, queryString] = subPath.split('?')
    const currentParams = new URLSearchParams(search)
    const targetParams = new URLSearchParams(queryString)

    if (path === '/purchasing' && targetParams.has('tab')) {
      const targetTab = targetParams.get('tab')
      if (pathname === '/purchasing') {
        const currentTab = currentParams.get('tab') || 'pipeline'
        return currentTab === targetTab
      }
      if (targetTab === 'pr') return pathname.startsWith('/purchasing/pr')
      if (targetTab === 'po') return pathname.startsWith('/purchasing/po')
      return false
    }

    if (path === '/contacts' && targetParams.get('role') === 'vendor' && pathname.startsWith('/purchasing/vendors')) {
      return true
    }

    if (pathname !== path) return false

    if (targetParams.has('role')) {
      const defaultRole = path === '/contacts' ? 'all' : null
      const currentRole = currentParams.get('role') || defaultRole
      return currentRole === targetParams.get('role')
    }

    for (const [key, val] of targetParams.entries()) {
      if (currentParams.get(key) !== val) return false
    }
    return true
  }

  return matchesBasePath(subPath, pathname)
}

export function isNavSectionActive(item, pathname = '/', search = '') {
  if (!item) return false
  if (matchesBasePath(item.path, pathname)) return true
  return (item.children || []).some((child) => isNavChildActive(child.path, pathname, search))
}

export function getInitialExpandedSections(navItems = [], pathname = '/', search = '') {
  const expanded = {}
  for (const item of navItems || []) {
    if (item?.children && item.children.length > 0) {
      expanded[item.path] = isNavSectionActive(item, pathname, search)
    }
  }
  return expanded
}

export function getLocationBreadcrumb(pathname = '/', search = '') {
  const params = new URLSearchParams(search)
  const tab = params.get('tab')
  const role = params.get('role')

  if (pathname.startsWith('/purchasing/po/new')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'ออกใบสั่งซื้อ (PO)', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/po/')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'รายละเอียดใบสั่งซื้อ (PO)', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/pr/new')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'ออกใบขอซื้อ (PR)', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/pr/')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'รายละเอียดใบขอซื้อ (PR)', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/quotation')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'เปรียบเทียบใบเสนอราคาผู้ขาย', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing/vendors')) {
    return { module: 'จัดซื้อและพัสดุ', feature: 'ทะเบียนผู้ขาย (Vendors)', modulePath: '/purchasing' }
  }
  if (pathname.startsWith('/purchasing')) {
    if (tab === 'pr') return { module: 'จัดซื้อและพัสดุ', feature: 'ใบขอซื้อ (PR)', modulePath: '/purchasing' }
    if (tab === 'po') return { module: 'จัดซื้อและพัสดุ', feature: 'ใบสั่งซื้อ (PO)', modulePath: '/purchasing' }
    if (tab === 'receipts') return { module: 'จัดซื้อและพัสดุ', feature: 'ตรวจรับของเข้า (GR)', modulePath: '/purchasing' }
    return { module: 'จัดซื้อและพัสดุ', feature: 'ศูนย์งานจัดซื้อ (PR / PO)', modulePath: '/purchasing' }
  }

  if (pathname.startsWith('/store/receipts')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'รับของเข้า (Goods Receipts - RI)', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/issue/new')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'เบิกจ่ายวัสดุ (Stock Issue)', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/issues')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'ประวัติการเบิก-คืนพัสดุ (Issue & Return Logs)', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/adjust')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'คืนของ & ปรับปรุงสต็อก', modulePath: '/store' }
  }
  if (pathname.startsWith('/store/items')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'ทะเบียนพัสดุ & หมวดหมู่', modulePath: '/store' }
  }
  if (pathname.startsWith('/store')) {
    return { module: 'คลังวัสดุและสโตร์', feature: 'สต็อกวัสดุวิศวกรรม', modulePath: '/store' }
  }

  if (pathname.startsWith('/projects/new')) {
    return { module: 'บริหารโครงการ', feature: 'สร้างโครงการใหม่', modulePath: '/projects' }
  }
  if (pathname.startsWith('/projects/')) {
    return { module: 'บริหารโครงการ', feature: 'รายละเอียดโครงการ', modulePath: '/projects' }
  }
  if (pathname.startsWith('/projects')) {
    return { module: 'บริหารโครงการ', feature: 'รายการโครงการทั้งหมด', modulePath: '/projects' }
  }

  if (pathname.startsWith('/accounting/expenses')) {
    return { module: 'บัญชีและรายงาน', feature: 'ค่าใช้จ่ายและเงินสำรองจ่าย', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/ap')) {
    return { module: 'บัญชีและรายงาน', feature: 'รายงานเจ้าหนี้ (AP Aging)', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/ar')) {
    return { module: 'บัญชีและรายงาน', feature: 'รายงานลูกหนี้ (AR Aging)', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/gl') || pathname.startsWith('/accounting/journal')) {
    return { module: 'บัญชีและรายงาน', feature: 'สมุดรายวันทั่วไป (GL)', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/tax-reports')) {
    return { module: 'บัญชีและรายงาน', feature: 'ระบบภาษีครบวงจร (ภ.พ.30/WHT)', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/chart-of-accounts')) {
    return { module: 'บัญชีและรายงาน', feature: 'ผังบัญชี (Chart of Accounts)', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting/reports')) {
    return { module: 'บัญชีและรายงาน', feature: 'งบการเงิน & รายงาน', modulePath: '/accounting' }
  }
  if (pathname.startsWith('/accounting')) {
    return { module: 'บัญชีและรายงาน', feature: 'ภาพรวมระบบบัญชี', modulePath: '/accounting' }
  }

  if (pathname.startsWith('/quotations/new')) {
    return { module: 'งานขายและเสนอราคา', feature: 'สร้างใบเสนอราคาใหม่', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/quotations/')) {
    return { module: 'งานขายและเสนอราคา', feature: 'รายละเอียดใบเสนอราคา', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/quotations')) {
    return { module: 'งานขายและเสนอราคา', feature: 'ใบเสนอราคา (QT)', modulePath: '/quotations' }
  }
  if (pathname.startsWith('/boq/new')) {
    return { module: 'ประมาณราคา (BOQ)', feature: 'สร้างใบประมาณราคาใหม่', modulePath: '/boq' }
  }
  if (pathname.startsWith('/boq/')) {
    return { module: 'ประมาณราคา (BOQ)', feature: 'รายละเอียด BOQ', modulePath: '/boq' }
  }
  if (pathname.startsWith('/boq')) {
    return { module: 'งานขายและเสนอราคา', feature: 'ประมาณราคา (BOQ)', modulePath: '/quotations' }
  }

  if (pathname.startsWith('/contacts')) {
    if (role === 'customer') {
      return { module: 'งานขายและเสนอราคา', feature: 'ทะเบียนลูกค้า (Customers)', modulePath: '/quotations' }
    }
    if (role === 'vendor') {
      return { module: 'จัดซื้อและพัสดุ', feature: 'ทะเบียนผู้ขาย (Vendors)', modulePath: '/purchasing' }
    }
    return { module: 'ทะเบียนคู่ค้าและลูกค้า', feature: 'รายชื่อผู้ติดต่อ', modulePath: '/contacts' }
  }

  if (pathname.startsWith('/hr')) {
    return { module: 'บุคลากร', feature: 'ระบบบริหารบุคลากร', modulePath: '/hr' }
  }

  if (pathname === '/') {
    return { module: 'หน้าหลัก', feature: 'แดชบอร์ดภาพรวม', modulePath: '/' }
  }

  return { module: 'ระบบบริหารงานก่อสร้าง', feature: pathname, modulePath: '/' }
}
