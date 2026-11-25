/**
 * Compute Purchasing-scoped 4-step Procurement Workflow (`1. PR → 2. PO → 3. ตรวจรับ (GR/RI) → 4. ปิดงานจัดซื้อ`).
 * Payment execution (`PAY`) and paid/unpaid ledger tracking belong to Accounting and do not block Purchasing completion.
 */
export function computeProcurementFlow({
  mode = 'po', // 'pr' | 'po'
  pr = null,
  po = null,
  linkedPos = [],
  items = [],
  grns = [],
}) {
  if (mode === 'po' && po) {
    const isCancelled = po.status === 'cancelled'
    const prNo = pr?.pr_no || po.pr?.pr_no || null
    const prId = pr?.id || po.pr_id || null
    const hasPr = Boolean(prNo || prId)

    const poItems = items.length > 0 ? items : po.purchase_order_items || []
    const totalOrdered = poItems.reduce((s, i) => s + Number(i.quantity || 0), 0)
    const totalReceived = poItems.reduce((s, i) => s + Number(i.qty_received || 0), 0)

    const isFullyReceived =
      po.status === 'received' ||
      (poItems.length > 0 && poItems.every((i) => Number(i.qty_received || 0) >= Number(i.quantity || 0)))
    const isPartialReceived = !isFullyReceived && (po.status === 'partial' || totalReceived > 0)
    const isComplete = !isCancelled && isFullyReceived

    let currentStep = 3
    let currentStepLabel = 'ขั้นที่ 3/4 · รอตรวจรับสินค้า'
    let statusBadgeText = 'รอรับของเข้าสโตร์'

    if (isCancelled) {
      currentStep = 2
      currentStepLabel = 'ยกเลิกคำสั่งซื้อ'
      statusBadgeText = 'ยกเลิกคำสั่งซื้อ (Cancelled)'
    } else if (isComplete) {
      currentStep = 4
      currentStepLabel = 'ขั้นที่ 4/4 · ปิดงานจัดซื้อ (รับครบ)'
      statusBadgeText = 'รับของครบ 100% · ปิดงานจัดซื้อ'
    } else if (isPartialReceived) {
      currentStep = 3
      currentStepLabel = 'ขั้นที่ 3/4 · รับของบางส่วน'
      statusBadgeText = 'รับของบางส่วน (Partial)'
    }

    return {
      isCancelled,
      hasPr,
      prNo,
      prId,
      totalOrdered,
      totalReceived,
      isFullyReceived,
      isPartialReceived,
      isComplete,
      currentStep,
      currentStepLabel,
      statusBadgeText,
      grnCount: grns?.length || 0,
      stepStates: {
        s1: isCancelled ? 'cancelled' : 'done',
        s2: isCancelled ? 'cancelled' : 'done',
        s3: isCancelled ? 'cancelled' : isFullyReceived ? 'done' : 'active',
        s4: isCancelled ? 'cancelled' : isComplete ? 'done' : 'pending',
      },
    }
  }

  // mode === 'pr'
  const isCancelled = pr?.status === 'cancelled'
  const activePos = (linkedPos || []).filter((p) => p.status !== 'cancelled')
  const hasActivePo = activePos.length > 0 || pr?.status === 'ordered'

  const allReceived =
    activePos.length > 0 &&
    activePos.every((p) => {
      const pItems = p.purchase_order_items || []
      return (
        p.status === 'received' ||
        (pItems.length > 0 && pItems.every((i) => Number(i.qty_received || 0) >= Number(i.quantity || 0)))
      )
    })
  const someReceived = activePos.some((p) => {
    const pItems = p.purchase_order_items || []
    return (
      p.status === 'received' ||
      p.status === 'partial' ||
      pItems.some((i) => Number(i.qty_received || 0) > 0)
    )
  })
  const isComplete = !isCancelled && hasActivePo && allReceived

  let currentStep = 2
  let currentStepLabel = 'ขั้นที่ 2/4 · รอออกใบสั่งซื้อ (PO)'
  let statusBadgeText = 'รอสั่งซื้อ (Pending PO)'

  if (isCancelled) {
    currentStep = 1
    currentStepLabel = 'ยกเลิกใบขอซื้อ'
    statusBadgeText = 'ยกเลิกใบขอซื้อ (Cancelled)'
  } else if (isComplete) {
    currentStep = 4
    currentStepLabel = 'ขั้นที่ 4/4 · ปิดงานจัดซื้อ (รับครบ)'
    statusBadgeText = 'รับของครบ 100% · ปิดงานจัดซื้อ'
  } else if (hasActivePo) {
    currentStep = 3
    currentStepLabel = someReceived ? 'ขั้นที่ 3/4 · รับของบางส่วน' : 'ขั้นที่ 3/4 · รอรับของเข้าสโตร์'
    statusBadgeText = someReceived ? 'ออก PO แล้ว · รับบางส่วน' : 'ออก PO แล้ว · รอรับของ'
  }

  return {
    isCancelled,
    activePos,
    hasActivePo,
    allReceived,
    someReceived,
    isComplete,
    currentStep,
    currentStepLabel,
    statusBadgeText,
    stepStates: {
      s1: isCancelled ? 'cancelled' : 'done',
      s2: isCancelled ? 'cancelled' : hasActivePo ? 'done' : 'active',
      s3: isCancelled ? 'cancelled' : !hasActivePo ? 'pending' : allReceived ? 'done' : 'active',
      s4: isCancelled ? 'cancelled' : isComplete ? 'done' : 'pending',
    },
  }
}
