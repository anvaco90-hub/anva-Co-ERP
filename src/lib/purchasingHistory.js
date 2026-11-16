import { supabase } from './supabase'

/**
 * ดึงประวัติการสั่งซื้อของวัสดุ (ร้านค้าเดิม, ราคาที่เคยซื้อ, วันที่, เลข PO)
 * @param {string} itemName ชื่อวัสดุ
 * @returns {Promise<Array>}
 */
export async function getItemVendorHistory(itemName) {
  if (!itemName || !itemName.trim()) return []
  const cleanName = itemName.trim().toLowerCase()

  try {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        item_name,
        quantity,
        unit,
        unit_price,
        po:purchase_orders!inner (
          id,
          po_no,
          order_date,
          status,
          vendor_id,
          vendor:vendors (
            id,
            vendor_code,
            vendor_name,
            phone,
            contact_person
          ),
          project:projects (
            id,
            project_code,
            project_name
          )
        )
      `)
      .ilike('item_name', cleanName)
      .neq('po.status', 'cancelled')
      .order('po(order_date)', { ascending: false })
      .limit(20)

    if (error) throw error

    // กรองและรวมข้อมูลผู้ขายที่ไม่ซ้ำ หรือเรียงตามล่าสุด
    const records = (data ?? []).filter((d) => d.po?.vendor)
    return records
  } catch (err) {
    console.warn('Error fetching item vendor history:', err)
    return []
  }
}

/**
 * ดึงประวัติว่าวัสดุนี้เคยถูกใช้/สั่งซื้อ/เบิก ในโครงการใดบ้าง
 * @param {string} itemName ชื่อวัสดุ
 * @param {string} [itemId] รหัส ID วัสดุใน inventory_items (ถ้ามี)
 * @returns {Promise<Object>} สรุปประวัติตามโครงการ
 */
export async function getItemProjectUsageHistory(itemName, itemId = null) {
  if (!itemName && !itemId) return { byProject: [], totalPurchased: 0, totalIssued: 0 }

  try {
    // 1. ดึงจากใบสั่งซื้อ (Purchases per project)
    let poQuery = supabase
      .from('purchase_order_items')
      .select(`
        id, quantity, unit, unit_price, qty_received,
        po:purchase_orders!inner (
          id, po_no, order_date, status,
          project:projects ( id, project_code, project_name )
        )
      `)
      .neq('po.status', 'cancelled')

    if (itemName) {
      poQuery = poQuery.ilike('item_name', itemName.trim())
    }

    const { data: poItems } = await poQuery

    // 2. ดึงจากใบเบิกสโตร์ (Issues per project) ถ้ามี itemId
    let issueItems = []
    if (itemId) {
      const { data: issues } = await supabase
        .from('stock_issue_items')
        .select(`
          id, quantity,
          issue:stock_issues!inner (
            id, issue_no, issue_date,
            project:projects ( id, project_code, project_name )
          )
        `)
        .eq('item_id', itemId)
      issueItems = issues ?? []
    }

    // รวมข้อมูลตามโครงการ
    const projectMap = new Map()

    // วนรอบ PO
    ;(poItems ?? []).forEach((pi) => {
      const proj = pi.po?.project
      if (!proj) return
      const cur = projectMap.get(proj.id) || {
        projectId: proj.id,
        projectCode: proj.project_code,
        projectName: proj.projectName,
        totalPurchased: 0,
        totalReceived: 0,
        totalIssued: 0,
        unit: pi.unit || '',
        lastDate: pi.po?.order_date,
        poList: [],
        issueList: [],
      }

      cur.totalPurchased += Number(pi.quantity || 0)
      cur.totalReceived += Number(pi.qty_received || 0)
      cur.poList.push({
        poNo: pi.po?.po_no,
        date: pi.po?.order_date,
        qty: Number(pi.quantity || 0),
        unitPrice: Number(pi.unit_price || 0),
      })
      if (!cur.lastDate || new Date(pi.po?.order_date) > new Date(cur.lastDate)) {
        cur.lastDate = pi.po?.order_date
      }
      projectMap.set(proj.id, cur)
    })

    // วนรอบ Issue
    ;(issueItems ?? []).forEach((ii) => {
      const proj = ii.issue?.project
      if (!proj) return
      const cur = projectMap.get(proj.id) || {
        projectId: proj.id,
        projectCode: proj.project_code,
        projectName: proj.project_name,
        totalPurchased: 0,
        totalReceived: 0,
        totalIssued: 0,
        unit: '',
        lastDate: ii.issue?.issue_date,
        poList: [],
        issueList: [],
      }

      cur.totalIssued += Number(ii.quantity || 0)
      cur.issueList.push({
        issueNo: ii.issue?.issue_no,
        date: ii.issue?.issue_date,
        qty: Number(ii.quantity || 0),
      })
      if (!cur.lastDate || new Date(ii.issue?.issue_date) > new Date(cur.lastDate)) {
        cur.lastDate = ii.issue?.issue_date
      }
      projectMap.set(proj.id, cur)
    })

    const byProject = Array.from(projectMap.values())
    const totalPurchased = byProject.reduce((s, p) => s + p.totalPurchased, 0)
    const totalIssued = byProject.reduce((s, p) => s + p.totalIssued, 0)

    return {
      byProject,
      totalPurchased,
      totalIssued,
    }
  } catch (err) {
    console.warn('Error fetching item project usage:', err)
    return { byProject: [], totalPurchased: 0, totalIssued: 0 }
  }
}

