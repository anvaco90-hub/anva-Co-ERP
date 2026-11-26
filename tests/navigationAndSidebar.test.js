import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NAV_ITEMS } from '../src/lib/roles.js'
import {
  getInitialExpandedSections,
  getLocationBreadcrumb,
  isNavChildActive,
  isNavSectionActive,
} from '../src/lib/navigation.js'

describe('Sidebar Navigation Items (src/lib/roles.js)', () => {
  it('removes redundant QT tabs/pipeline and keeps clean unique sales children', () => {
    const salesSection = NAV_ITEMS.find((item) => item.path === '/quotations')
    assert.ok(salesSection, 'Expected งานขายและเสนอราคา section')
    const childPaths = (salesSection.children || []).map((c) => c.path)

    assert.deepEqual(childPaths, ['/quotations', '/boq', '/contacts?role=customer'])
    assert.equal(childPaths.some((p) => p.includes('tab=pipeline')), false)
    assert.equal(childPaths.some((p) => p.includes('tab=signed')), false)
  })

  it('has clean labels without double spaces or typos across all NAV_ITEMS', () => {
    for (const item of NAV_ITEMS) {
      assert.doesNotMatch(item.label, /\s{2,}/, `Double space in label: ${item.label}`)
      assert.doesNotMatch(item.label, /พัปลด/, `Typo in label: ${item.label}`)
      for (const child of item.children || []) {
        assert.doesNotMatch(child.label, /\s{2,}/, `Double space in child label: ${child.label}`)
        assert.doesNotMatch(child.label, /พัปลด/, `Typo in child label: ${child.label}`)
      }
    }
  })
})

describe('Sidebar Section Highlighting & Breadcrumbs (src/lib/navigation.js)', () => {
  const salesItem = NAV_ITEMS.find((i) => i.path === '/quotations')
  const purchasingItem = NAV_ITEMS.find((i) => i.path === '/purchasing')

  it('activates and expands งานขายและเสนอราคา when visiting /boq or /contacts?role=customer', () => {
    assert.equal(isNavChildActive('/boq', '/boq', ''), true)
    assert.equal(isNavChildActive('/boq', '/boq/123/edit', ''), true)
    assert.equal(isNavSectionActive(salesItem, '/boq', ''), true)
    assert.equal(isNavSectionActive(salesItem, '/boq/new', ''), true)
    assert.equal(isNavSectionActive(purchasingItem, '/boq', ''), false)

    assert.equal(isNavChildActive('/contacts?role=customer', '/contacts', '?role=customer'), true)
    assert.equal(isNavSectionActive(salesItem, '/contacts', '?role=customer'), true)
    assert.equal(isNavSectionActive(purchasingItem, '/contacts', '?role=customer'), false)
  })

  it('activates only จัดซื้อและพัสดุ when visiting /contacts?role=vendor or purchasing PR/PO routes', () => {
    assert.equal(isNavChildActive('/contacts?role=vendor', '/contacts', '?role=vendor'), true)
    assert.equal(isNavSectionActive(purchasingItem, '/contacts', '?role=vendor'), true)
    assert.equal(isNavSectionActive(salesItem, '/contacts', '?role=vendor'), false)

    assert.equal(isNavChildActive('/purchasing?tab=pr', '/purchasing/pr/pr-1', ''), true)
    assert.equal(isNavChildActive('/purchasing?tab=po', '/purchasing/po/new', '?quotation_id=qt-1'), true)
    assert.equal(isNavSectionActive(purchasingItem, '/purchasing/po/new', '?quotation_id=qt-1'), true)
  })

  it('activates ใบเสนอราคา (QT) child for both list and detail routes without matching root dashboard globally', () => {
    const dashboardItem = NAV_ITEMS.find((i) => i.path === '/')
    assert.equal(isNavSectionActive(dashboardItem, '/', ''), true)
    assert.equal(isNavSectionActive(dashboardItem, '/quotations', ''), false)

    assert.equal(isNavChildActive('/quotations', '/quotations', ''), true)
    assert.equal(isNavChildActive('/quotations', '/quotations/qt-99/edit', ''), true)
    assert.equal(isNavSectionActive(salesItem, '/quotations/qt-99', ''), true)
  })

  it('computes initial expanded sections cleanly from active route', () => {
    const boqExpanded = getInitialExpandedSections(NAV_ITEMS, '/boq/42', '')
    assert.equal(boqExpanded['/quotations'], true)
    assert.equal(boqExpanded['/purchasing'], false)
    assert.equal('/contacts' in boqExpanded, false)

    const vendorExpanded = getInitialExpandedSections(NAV_ITEMS, '/contacts', '?role=vendor')
    assert.equal(vendorExpanded['/purchasing'], true)
    assert.equal(vendorExpanded['/quotations'], false)
  })

  it('returns clean typo-free breadcrumbs with accurate parent modules', () => {
    const issuesCrumb = getLocationBreadcrumb('/store/issues', '')
    assert.doesNotMatch(issuesCrumb.feature, /พัปลด/)
    assert.match(issuesCrumb.feature, /พัสดุ/)

    const purchasingCrumb = getLocationBreadcrumb('/purchasing', '')
    assert.doesNotMatch(purchasingCrumb.feature, /\s{2,}/)

    const customerCrumb = getLocationBreadcrumb('/contacts', '?role=customer')
    assert.equal(customerCrumb.modulePath, '/quotations')

    const vendorCrumb = getLocationBreadcrumb('/contacts', '?role=vendor')
    assert.equal(vendorCrumb.modulePath, '/purchasing')

    const boqCrumb = getLocationBreadcrumb('/boq', '')
    assert.equal(boqCrumb.modulePath, '/quotations')
  })
})
