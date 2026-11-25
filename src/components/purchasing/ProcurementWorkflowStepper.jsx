import { Link } from 'react-router-dom'
import {
  Check,
  XCircle,
  Printer,
  ShoppingCart,
  PackageCheck,
  CreditCard,
  ExternalLink,
  Plus,
  FileText,
  History,
  ShieldCheck,
  Workflow,
  ArrowRight,
} from 'lucide-react'
import { baht } from '../../lib/projects'
import { formatThaiDate } from '../../lib/poDueStatus'
import { computePoPaymentSummary } from '../../lib/purchasing'
import { extractPrSourceQuotation } from '../../lib/salesFlowUtils'
import { PAYMENT_TYPES } from '../../pages/purchasing/POForm'

/**
 * คำนวณสถานะ 5 ขั้นตอนของวงจรจัดซื้อ (1.PR -> 2.PO -> 3.ตรวจรับ -> 4.จ่ายเงิน -> 5.ปิดวงจร)
 * ใช้ร่วมกันได้ทั้ง PRDetail, PODetail และ PurchasingHub เพื่อให้แสดงผลตรงกันทั้งระบบ
 */
export function computeProcurementFlow({
  mode = 'po', // 'pr' | 'po'
  pr = null,
  po = null,
  linkedPos = [],
  items = [],
  grns = [],
  payments = [],
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

    const paySummary = computePoPaymentSummary(po, poItems, payments)
    const isPaidInFull = paySummary.isPaidInFull
    const hasDepositPaid = paySummary.hasPartialPaid
    const isComplete = !isCancelled && isFullyReceived && isPaidInFull

    let currentStep = 3
    let currentStepLabel = 'ขั้นที่ 3/5 · รอตรวจรับสินค้า'
    let statusBadgeText = 'รอรับของเข้าสโตร์'

    if (isCancelled) {
      currentStep = 2
      currentStepLabel = 'ยกเลิกคำสั่งซื้อ'
      statusBadgeText = 'ยกเลิกคำสั่งซื้อ (Cancelled)'
    } else if (isComplete) {
      currentStep = 5
      currentStepLabel = 'ขั้นที่ 5/5 · ปิดวงจรสมบูรณ์'
      statusBadgeText = 'ปิดวงจรสมบูรณ์ (รับครบ & จ่ายแล้ว)'
    } else if (isFullyReceived && !isPaidInFull) {
      currentStep = 4
      currentStepLabel = 'ขั้นที่ 4/5 · พร้อมจ่ายชำระเงิน'
      statusBadgeText = hasDepositPaid ? 'รับของครบ · รอจ่ายส่วนที่เหลือ' : 'รับของครบแล้ว · รอจ่ายเงิน'
    } else if (isPartialReceived) {
      currentStep = 3
      currentStepLabel = 'ขั้นที่ 3/5 · รับของบางส่วน'
      statusBadgeText = 'รับของบางส่วน (Partial)'
    } else if (po.payment_type === 'cbd' && !isPaidInFull) {
      currentStep = 4
      currentStepLabel = 'รอจ่ายเงินก่อนส่งมอบ (CBD)'
      statusBadgeText = 'รอชำระเงินล่วงหน้า (CBD)'
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
      isPaidInFull,
      hasDepositPaid,
      isComplete,
      currentStep,
      currentStepLabel,
      statusBadgeText,
      stepStates: {
        s1: 'done',
        s2: isCancelled ? 'cancelled' : 'done',
        s3: isCancelled ? 'cancelled' : isFullyReceived ? 'done' : 'active',
        s4: isCancelled
          ? 'cancelled'
          : isPaidInFull
          ? 'done'
          : isFullyReceived || hasDepositPaid || po.payment_type === 'cbd'
          ? 'active'
          : 'pending',
        s5: isCancelled ? 'cancelled' : isComplete ? 'done' : 'pending',
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
  const allPaid =
    activePos.length > 0 &&
    activePos.every((p) => computePoPaymentSummary(p, p.purchase_order_items).isPaidInFull)
  const somePaid = activePos.some((p) => {
    const s = computePoPaymentSummary(p, p.purchase_order_items)
    return s.isPaidInFull || s.hasPartialPaid
  })
  const isComplete = !isCancelled && hasActivePo && allReceived && allPaid

  let currentStep = 2
  let currentStepLabel = 'ขั้นที่ 2/5 · รอออกใบสั่งซื้อ (PO)'
  let statusBadgeText = 'รอสั่งซื้อ (Pending PO)'

  if (isCancelled) {
    currentStep = 1
    currentStepLabel = 'ยกเลิกใบขอซื้อ'
    statusBadgeText = 'ยกเลิกใบขอซื้อ (Cancelled)'
  } else if (isComplete) {
    currentStep = 5
    currentStepLabel = 'ขั้นที่ 5/5 · ปิดวงจรสมบูรณ์'
    statusBadgeText = 'ปิดวงจรสมบูรณ์ (รับครบ & จ่ายแล้ว)'
  } else if (hasActivePo && allReceived && !allPaid) {
    currentStep = 4
    currentStepLabel = 'ขั้นที่ 4/5 · รับครบ · รอจ่ายเงิน'
    statusBadgeText = somePaid ? 'รับครบ · จ่ายมัดจำแล้ว' : 'รับของครบแล้ว · รอจ่ายเงิน'
  } else if (hasActivePo) {
    currentStep = 3
    currentStepLabel = someReceived ? 'ขั้นที่ 3/5 · รับของบางส่วน' : 'ขั้นที่ 3/5 · รอรับของเข้าสโตร์'
    statusBadgeText = someReceived ? 'ออก PO แล้ว · รับบางส่วน' : 'ออก PO แล้ว · รอรับของ'
  }

  return {
    isCancelled,
    activePos,
    hasActivePo,
    allReceived,
    someReceived,
    allPaid,
    somePaid,
    isComplete,
    currentStep,
    currentStepLabel,
    statusBadgeText,
    stepStates: {
      s1: isCancelled ? 'cancelled' : 'done',
      s2: isCancelled ? 'cancelled' : hasActivePo ? 'done' : 'active',
      s3: isCancelled ? 'cancelled' : !hasActivePo ? 'pending' : allReceived ? 'done' : 'active',
      s4: isCancelled
        ? 'cancelled'
        : !hasActivePo
        ? 'pending'
        : allPaid
        ? 'done'
        : allReceived || somePaid
        ? 'active'
        : 'pending',
      s5: isCancelled ? 'cancelled' : isComplete ? 'done' : 'pending',
    },
  }
}

/**
 * แถบ Stepper ขนาดกะทัดรัดสำหรับใช้ในตาราง/การ์ดของหน้า PurchasingHub
 */
export function CompactProcurementSteps({ flow }) {
  if (!flow) return null
  if (flow.isCancelled) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
        <XCircle className="h-3 w-3 shrink-0" />
        <span>ยกเลิกเอกสาร</span>
      </span>
    )
  }

  const steps = [
    { key: 's1', num: 1, label: 'PR', state: flow.stepStates.s1 },
    { key: 's2', num: 2, label: 'PO', state: flow.stepStates.s2 },
    { key: 's3', num: 3, label: 'รับของ', state: flow.stepStates.s3 },
    { key: 's4', num: 4, label: 'จ่าย', state: flow.stepStates.s4 },
    { key: 's5', num: 5, label: 'ปิดงาน', state: flow.stepStates.s5 },
  ]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((st, idx) => (
          <div key={st.key} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                st.state === 'done'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : st.state === 'active'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/30'
                  : 'bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              {st.state === 'done' ? (
                <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <span className="font-mono text-[9px]">{st.num}</span>
              )}
              <span>{st.label}</span>
            </span>
            {idx < steps.length - 1 && (
              <ArrowRight className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600 shrink-0" />
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        {flow.currentStepLabel}
      </div>
    </div>
  )
}

/**
 * ผังแสดงลำดับขั้นตอนการทำงานจัดซื้อ 5 ขั้นตอน (Procurement Workflow Pipeline Card)
 * รูปแบบเดียวกับ QuotationDetail ("ลำดับขั้นตอนการทำงาน")
 */
export default function ProcurementWorkflowStepper({
  mode = 'po', // 'pr' | 'po'
  pr = null,
  po = null,
  linkedPos = [],
  items = [],
  grns = [],
  payments = [],
  canCreate = false,
  canReceive = false,
  onPrintPdf,
  onOpenPayment,
  onScrollToReceive,
  onOpenGrnTab,
  onOpenPayTab,
  onOpenAuditTab,
}) {
  const flow = computeProcurementFlow({ mode, pr, po, linkedPos, items, grns, payments })
  const { stepStates, isCancelled } = flow

  const cardTheme = (state, tone = 'amber') => {
    if (state === 'cancelled') {
      return 'rounded-xl border border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 dark:border-rose-800/70 p-3.5 flex flex-col justify-between opacity-90'
    }
    if (state === 'done') {
      return 'rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3.5 flex flex-col justify-between'
    }
    if (state === 'active') {
      return tone === 'sky'
        ? 'rounded-xl border border-sky-400 bg-sky-50/60 dark:bg-sky-950/25 dark:border-sky-700 ring-2 ring-sky-400/20 p-3.5 flex flex-col justify-between'
        : 'rounded-xl border border-amber-400 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-700 ring-2 ring-amber-400/20 p-3.5 flex flex-col justify-between'
    }
    return 'rounded-xl border border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 p-3.5 flex flex-col justify-between opacity-80'
  }

  const circleTheme = (state, tone = 'amber') => {
    if (state === 'cancelled') {
      return 'flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white font-bold text-xs shadow-xs'
    }
    if (state === 'done') {
      return 'flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs shadow-xs'
    }
    if (state === 'active') {
      return tone === 'sky'
        ? 'flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white font-black text-xs shadow-xs animate-pulse'
        : 'flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-xs'
    }
    return 'flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs'
  }

  const labelTheme = (state, tone = 'amber') => {
    if (state === 'cancelled') return 'text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300'
    if (state === 'done') return 'text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300'
    if (state === 'active') {
      return tone === 'sky'
        ? 'text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300'
        : 'text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300'
    }
    return 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400'
  }

  const paymentTypeShort = po?.payment_type
    ? PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label?.split('(')[0]?.trim()
    : 'เครดิตเทอม'

  const poPaySummary = computePoPaymentSummary(po, items, payments)
  const grandTotalVal = poPaySummary.totalPayable
  const paidAmt = poPaySummary.paidAmount
  const remainingAmt = poPaySummary.remainingAmount
  const primaryLinkedPo = flow.activePos?.[0] || linkedPos?.[0]
  const sourceQt = extractPrSourceQuotation({
    quotation_id: po?.quotation_id || pr?.quotation_id || po?.pr?.quotation_id,
    sales_quotation_no: po?.sales_quotation_no || pr?.sales_quotation_no || po?.pr?.sales_quotation_no,
    notes: pr?.notes || po?.notes || po?.pr?.notes,
  })

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 shrink-0">
            <Workflow className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              ลำดับขั้นตอนการทำงาน (PR → PO Procurement Workflow)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ผังกระบวนการจัดซื้อตั้งแต่ขอซื้อ ออกใบสั่งซื้อ ตรวจรับเข้าสโตร์ จนถึงจ่ายชำระเงิน ชี้ชัดว่างานอยู่จุดใดและต้องทำอะไรต่อ
            </p>
          </div>
        </div>

        <div
          className={`text-xs font-mono font-bold px-3 py-1 rounded-full border ${
            isCancelled
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              : flow.isComplete
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}
        >
          สถานะปัจจุบัน:{' '}
          <span
            className={`font-bold ${
              isCancelled
                ? 'text-rose-700 dark:text-rose-300'
                : flow.isComplete
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            {flow.statusBadgeText}
          </span>
        </div>
      </div>

      {/* 5-Step Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Step 1: ใบขอซื้อ (PR / Source) */}
        <div className={cardTheme(stepStates.s1)}>
          <div>
            <div className="flex items-center justify-between">
              <span className={circleTheme(stepStates.s1)}>
                {stepStates.s1 === 'cancelled' ? <XCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </span>
              <span className={labelTheme(stepStates.s1)}>
                {stepStates.s1 === 'cancelled'
                  ? 'ยกเลิกแล้ว'
                  : mode === 'pr' || flow.hasPr
                  ? 'เสร็จสิ้นแล้ว'
                  : 'สั่งซื้อตรง'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
              1. ใบขอซื้อ / ต้นทาง (PR)
            </div>
            <div className="text-[11px] text-slate-700 dark:text-slate-300 font-mono mt-0.5 font-semibold">
              {mode === 'pr'
                ? pr?.pr_no
                : flow.prNo
                ? flow.prNo
                : 'Direct PO (ไม่ผ่าน PR)'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
              <div>
                {mode === 'pr'
                  ? `ขอซื้อ ${items?.length || 0} รายการ`
                  : flow.hasPr
                  ? 'เชื่อมโยงจากใบขอซื้อโครงการ'
                  : 'เปิดคำสั่งซื้อตรงกับผู้ขาย'}
              </div>
              {sourceQt.quotationNo && (
                <div className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                  อ้างอิง QT: {sourceQt.quotationNo}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-emerald-200/70 dark:border-emerald-800/60 text-[11px] flex flex-wrap items-center gap-2">
            {mode === 'pr' && onPrintPdf ? (
              <button
                type="button"
                onClick={onPrintPdf}
                className="text-sky-700 dark:text-sky-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="h-3 w-3" />
                <span>พิมพ์ใบขอซื้อ (PDF)</span>
              </button>
            ) : mode === 'po' && flow.prId ? (
              <Link
                to={`/purchasing/pr/${flow.prId}`}
                className="text-emerald-800 dark:text-emerald-300 hover:underline font-bold flex items-center gap-1"
              >
                <FileText className="h-3 w-3" />
                <span>เปิดดู PR {flow.prNo}</span>
              </Link>
            ) : !sourceQt.quotationId ? (
              <span className="font-mono text-emerald-800 dark:text-emerald-300">
                วันที่: {formatThaiDate(pr?.request_date || po?.order_date)}
              </span>
            ) : null}
            {sourceQt.quotationId && (
              <Link
                to={`/quotations/${sourceQt.quotationId}`}
                className="text-amber-700 dark:text-amber-300 hover:underline font-bold flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                <span>ดู {sourceQt.quotationNo || 'ใบเสนอราคา'}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Step 2: ออกใบสั่งซื้อ (PO) */}
        <div className={cardTheme(stepStates.s2, 'amber')}>
          <div>
            <div className="flex items-center justify-between">
              <span className={circleTheme(stepStates.s2, 'amber')}>
                {stepStates.s2 === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : stepStates.s2 === 'cancelled' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  '2'
                )}
              </span>
              <span className={labelTheme(stepStates.s2, 'amber')}>
                {stepStates.s2 === 'cancelled'
                  ? 'ยกเลิกแล้ว'
                  : stepStates.s2 === 'done'
                  ? mode === 'pr' && (flow.activePos?.length || 0) > 1
                    ? `ออกแล้ว ${flow.activePos.length} PO`
                    : 'ออก PO แล้ว'
                  : 'พร้อมออก PO'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
              2. ออกใบสั่งซื้อ (Open PO)
            </div>
            <div className="text-[11px] font-mono mt-0.5 text-slate-700 dark:text-slate-300 font-semibold truncate">
              {mode === 'po'
                ? po?.po_no
                : flow.hasActivePo
                ? flow.activePos.map((p) => p.po_no).join(', ')
                : 'ยังไม่ได้ออกใบสั่งซื้อ'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
              {mode === 'po'
                ? po?.custom_vendor_name || po?.vendors?.vendor_name || 'ผู้ขายทั่วไป'
                : flow.hasActivePo
                ? primaryLinkedPo?.custom_vendor_name || primaryLinkedPo?.vendors?.vendor_name || `สร้างแล้ว ${flow.activePos.length} ใบ`
                : pr?.suggested_vendor
                ? `แนะนำ: ${pr.suggested_vendor}`
                : 'เลือกผู้ขายและยืนยันราคาซื้อ'}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px]">
            {mode === 'po' ? (
              onPrintPdf ? (
                <button
                  type="button"
                  onClick={onPrintPdf}
                  className="text-emerald-800 dark:text-emerald-300 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="h-3 w-3" />
                  <span>พิมพ์ใบสั่งซื้อ (PDF)</span>
                </button>
              ) : (
                <span className="font-mono text-emerald-800 dark:text-emerald-300">
                  สั่งซื้อ: {formatThaiDate(po?.order_date)}
                </span>
              )
            ) : flow.hasActivePo && flow.activePos?.length > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {flow.activePos.map((poItem) => (
                    <Link
                      key={poItem.id}
                      to={`/purchasing/po/${poItem.id}`}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold inline-flex items-center gap-0.5 font-mono"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span>{poItem.po_no}</span>
                    </Link>
                  ))}
                </div>
                {canCreate && !isCancelled && pr && (
                  <Link
                    to={`/purchasing/po/new?pr=${pr.id}`}
                    className="text-amber-800 dark:text-amber-300 hover:underline font-bold flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>+ เพิ่ม PO อีกร้าน</span>
                  </Link>
                )}
              </div>
            ) : canCreate && !isCancelled && pr ? (
              <Link
                to={`/purchasing/po/new?pr=${pr.id}`}
                className="text-amber-900 dark:text-amber-300 hover:underline font-bold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>+ สร้างใบสั่งซื้อ (PO)</span>
              </Link>
            ) : (
              <span className="text-slate-400">รอฝ่ายจัดซื้อเปิด PO</span>
            )}
          </div>
        </div>

        {/* Step 3: ตรวจรับของเข้าสโตร์ (GR / RI) */}
        <div className={cardTheme(stepStates.s3, mode === 'po' && flow.isPartialReceived ? 'amber' : 'sky')}>
          <div>
            <div className="flex items-center justify-between">
              <span className={circleTheme(stepStates.s3, mode === 'po' && flow.isPartialReceived ? 'amber' : 'sky')}>
                {stepStates.s3 === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : stepStates.s3 === 'cancelled' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  '3'
                )}
              </span>
              <span className={labelTheme(stepStates.s3, mode === 'po' && flow.isPartialReceived ? 'amber' : 'sky')}>
                {stepStates.s3 === 'cancelled'
                  ? 'ยกเลิกแล้ว'
                  : stepStates.s3 === 'done'
                  ? 'รับครบแล้ว'
                  : stepStates.s3 === 'active'
                  ? mode === 'po'
                    ? flow.isPartialReceived
                      ? 'รับบางส่วน'
                      : 'รอรับของ'
                    : flow.someReceived
                    ? 'รับบางส่วน'
                    : 'รอตรวจรับ'
                  : 'ขั้นตอนถัดไป'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
              3. ตรวจรับเข้าสโตร์ (GR/RI)
            </div>
            <div className="text-[11px] font-mono mt-0.5 text-slate-700 dark:text-slate-300 font-semibold">
              {mode === 'po'
                ? flow.isFullyReceived
                  ? grns.length > 0
                    ? `${grns[0].grn_no} (${grns.length} รอบ)`
                    : 'เข้าสโตร์ครบ 100%'
                  : `รับแล้ว ${Math.round(flow.totalReceived)} / ${Math.round(flow.totalOrdered)} หน่วย`
                : flow.hasActivePo
                ? flow.allReceived
                  ? 'รับครบเข้าคลังแล้ว'
                  : flow.someReceived
                  ? 'ทยอยรับของบางส่วน'
                  : 'รอส่งมอบเข้าสโตร์'
                : 'รอออก PO ก่อน'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'po'
                ? po?.expected_delivery_date
                  ? `กำหนดส่ง: ${formatThaiDate(po.expected_delivery_date)}`
                  : 'สโตร์ตรวจนับรับของเข้าสต็อก'
                : 'ตรวจนับพัสดุและลงสต็อกอัตโนมัติ'}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px]">
            {mode === 'po' ? (
              !isCancelled && !flow.isFullyReceived && canReceive && onScrollToReceive ? (
                <button
                  type="button"
                  onClick={onScrollToReceive}
                  className="text-sky-700 dark:text-sky-300 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <PackageCheck className="h-3 w-3" />
                  <span>{flow.isPartialReceived ? 'ตรวจรับส่วนที่เหลือ' : 'ตรวจรับสินค้า (ออก RI)'}</span>
                </button>
              ) : flow.isFullyReceived && onOpenGrnTab ? (
                <button
                  type="button"
                  onClick={onOpenGrnTab}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <History className="h-3 w-3" />
                  <span>ดูประวัติใบรับของ ({grns.length})</span>
                </button>
              ) : (
                <span className="text-slate-400">{isCancelled ? 'ยกเลิกการรับของ' : 'รอสโตร์ตรวจรับ'}</span>
              )
            ) : flow.hasActivePo && primaryLinkedPo ? (
              <Link
                to={`/purchasing/po/${primaryLinkedPo.id}`}
                className="text-sky-700 dark:text-sky-400 hover:underline font-bold flex items-center gap-1"
              >
                <PackageCheck className="h-3 w-3" />
                <span>{flow.allReceived ? 'ดูประวัติตรวจรับใน PO' : 'ไปหน้าตรวจรับใน PO'}</span>
              </Link>
            ) : (
              <span className="text-slate-400">สถานะ: รอออกใบสั่งซื้อ</span>
            )}
          </div>
        </div>

        {/* Step 4: จ่ายชำระเงิน & บัญชี (Payment & AP) */}
        <div className={cardTheme(stepStates.s4, 'amber')}>
          <div>
            <div className="flex items-center justify-between">
              <span className={circleTheme(stepStates.s4, 'amber')}>
                {stepStates.s4 === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : stepStates.s4 === 'cancelled' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  '4'
                )}
              </span>
              <span className={labelTheme(stepStates.s4, 'amber')}>
                {stepStates.s4 === 'cancelled'
                  ? 'ยกเลิกแล้ว'
                  : stepStates.s4 === 'done'
                  ? 'ชำระครบแล้ว'
                  : stepStates.s4 === 'active'
                  ? flow.hasDepositPaid || flow.somePaid
                    ? 'จ่ายบางส่วน'
                    : 'พร้อมจ่ายเงิน'
                  : 'รอรับของก่อนจ่าย'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
              4. จ่ายชำระเงิน (PAY)
            </div>
            <div className="text-[11px] font-mono mt-0.5 text-slate-700 dark:text-slate-300 font-semibold">
              {mode === 'po'
                ? flow.isPaidInFull
                  ? `จ่ายครบ ฿${baht(grandTotalVal)}`
                  : flow.hasDepositPaid
                  ? `จ่ายแล้ว ฿${baht(paidAmt)} · ค้าง ฿${baht(remainingAmt)}`
                  : `ยอดสุทธิ ฿${baht(grandTotalVal)}`
                : flow.hasActivePo
                ? flow.allPaid
                  ? 'ชำระเงินครบถ้วน'
                  : flow.somePaid
                  ? 'ชำระมัดจำ/บางส่วนแล้ว'
                  : 'รอตั้งเบิกจ่ายเงิน'
                : 'รอตั้งเบิกตามเงื่อนไข'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
              {mode === 'po'
                ? paymentTypeShort
                : 'ตัดจ่ายสมุดรายวันและเจ้าหนี้ AP'}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px]">
            {mode === 'po' ? (
              flow.isPaidInFull && onOpenPayTab ? (
                <button
                  type="button"
                  onClick={onOpenPayTab}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <History className="h-3 w-3" />
                  <span>ดูประวัติจ่ายเงิน ({payments.length})</span>
                </button>
              ) : !isCancelled && !flow.isPaidInFull && onOpenPayment ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onOpenPayment}
                    className="text-amber-900 dark:text-amber-300 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <CreditCard className="h-3 w-3" />
                    <span>
                      {flow.hasDepositPaid
                        ? `จ่ายงวดถัดไป (฿${baht(remainingAmt)})`
                        : flow.isFullyReceived
                        ? 'จ่ายชำระเงิน (PAY)'
                        : 'จ่ายมัดจำ / แบ่งจ่าย'}
                    </span>
                  </button>
                  {payments.length > 0 && onOpenPayTab && (
                    <button
                      type="button"
                      onClick={onOpenPayTab}
                      className="text-sky-700 dark:text-sky-400 hover:underline font-semibold text-[10px] cursor-pointer"
                    >
                      ประวัติ ({payments.length})
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-slate-400">{isCancelled ? 'ยกเลิกการจ่ายเงิน' : 'ชำระตามกำหนด'}</span>
              )
            ) : flow.hasActivePo && primaryLinkedPo ? (
              <Link
                to={`/purchasing/po/${primaryLinkedPo.id}`}
                className="text-amber-800 dark:text-amber-300 hover:underline font-bold flex items-center gap-1"
              >
                <CreditCard className="h-3 w-3" />
                <span>{flow.allPaid ? 'ดูประวัติจ่ายเงินใน PO' : 'จัดการจ่ายเงินใน PO'}</span>
              </Link>
            ) : (
              <span className="text-slate-400">สถานะ: รอดำเนินการ</span>
            )}
          </div>
        </div>

        {/* Step 5: ปิดวงจรจัดซื้อ (Completed & Audit) */}
        <div className={cardTheme(stepStates.s5)}>
          <div>
            <div className="flex items-center justify-between">
              <span className={circleTheme(stepStates.s5)}>
                {stepStates.s5 === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : stepStates.s5 === 'cancelled' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  '5'
                )}
              </span>
              <span className={labelTheme(stepStates.s5)}>
                {stepStates.s5 === 'cancelled'
                  ? 'ยกเลิกแล้ว'
                  : stepStates.s5 === 'done'
                  ? 'ปิดวงจร 100%'
                  : 'ปลายทางจัดซื้อ'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
              5. ปิดวงจร &amp; บันทึกบัญชี
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {flow.isComplete
                ? 'พัสดุเข้าสต็อกพร้อมใช้งาน & ลงบัญชี AP สมบูรณ์แล้ว'
                : isCancelled
                ? 'บันทึกประวัติยกเลิกในระบบเรียบร้อย'
                : 'รับของครบ จ่ายเงินครบ และปิดรอบบัญชีโครงการ'}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px]">
            {onOpenAuditTab ? (
              <button
                type="button"
                onClick={onOpenAuditTab}
                className={`${
                  flow.isComplete
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
                } hover:underline font-bold flex items-center gap-1 cursor-pointer`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>{flow.isComplete ? 'ดูบันทึกบัญชี / Audit' : 'ดูบันทึกประวัติเอกสาร'}</span>
              </button>
            ) : (
              <span className={flow.isComplete ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                {flow.isComplete ? 'เสร็จสมบูรณ์ 100%' : `ปัจจุบัน: ${flow.currentStepLabel}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
