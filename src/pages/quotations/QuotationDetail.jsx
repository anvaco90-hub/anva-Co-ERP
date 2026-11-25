import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  FileText, Send, CheckCircle2, ShoppingCart, Truck, FileCheck, Printer,
  Edit3, Trash2, ArrowRight, ExternalLink, X, Building2, User, FolderGit2,
  Calendar, CreditCard, ChevronRight, AlertCircle, AlertTriangle, Eye, Plus, Check,
  ArrowLeft, ArrowUpFromLine, Clock, DollarSign, Package, Paperclip, ReceiptText, ShieldCheck,
  Warehouse, Sparkles, FileSpreadsheet, MapPin, MoreVertical, Copy
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { inferQuotationTaxType } from '../../lib/tax'
import { ensureSalesInvoiceForQuotation, fetchQuotationLinkedDocs } from '../../lib/salesBilling'
import { computeQuotationWorkflow, getCustomerApprovalDisplay } from '../../lib/salesFlowUtils'
import { checkQuotationStock, summarizeQuotationStock, summarizeItemLotSources } from '../../lib/quotationStockCheck'
import { buildQuotationTaxUpdatePayload } from '../../lib/quotationPrintUtils'
import { saveQuotationWithFallback } from '../../lib/boqToQuotation'
import PaymentActionModal from '../../components/PaymentActionModal'
import { canIssueStock, formatIntQty } from '../../lib/store'
import { openFile } from '../../lib/files'
import R2Image from '../../components/R2Image'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'
import CustomerPoModal from '../../components/quotations/CustomerPoModal'
import CustomerPoPrintModal from '../../components/reports/CustomerPoPrintModal'
import {
  CompactProcurementSteps,
  computeProcurementFlow,
} from '../../components/purchasing/ProcurementWorkflowStepper'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  sent: { label: 'ส่งลูกค้าแล้ว (Sent)', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  approved: { label: 'ลูกค้าอนุมัติ (Approved)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'ปฏิเสธ (Rejected)', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  expired: { label: 'หมดอายุ (Expired)', color: 'bg-amber-100 text-amber-800 border-amber-300' },
}

export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [quotation, setQuotation] = useState(null)
  const [items, setItems] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [stockLots, setStockLots] = useState([])
  const [sourceBoq, setSourceBoq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingVat, setUpdatingVat] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMoreMenu])

  // ข้อมูลเอกสารเชื่อมโยง (PR, PO, ใบเบิกสโตร์, Sales Invoices) & Modal รับเงิน / ออก AR
  const [linkedDocs, setLinkedDocs] = useState({ prs: [], pos: [], invoices: [], issues: [] })
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Modal บันทึกการอนุมัติ / เอกสารเซ็นรับของลูกค้า
  const [showPoModal, setShowPoModal] = useState(false)
  const [showCustomerPoDoc, setShowCustomerPoDoc] = useState(false)

  const openPoModal = () => {
    setShowPoModal(true)
  }

  const refreshLinkedDocs = async (qt = quotation) => {
    if (!qt?.id) return
    const docs = await fetchQuotationLinkedDocs(qt)
    setLinkedDocs(docs)
  }

  const handleCreateInvoiceNow = async () => {
    if (!quotation?.id) return
    setCreatingInvoice(true)
    try {
      const { invoice, created } = await ensureSalesInvoiceForQuotation({
        quotation,
        issueDate: quotation.customer_po_date || new Date().toISOString().split('T')[0],
        customerPoNo: quotation.customer_po_no || '',
      })
      await refreshLinkedDocs(quotation)
      alert(
        created
          ? `ออกใบแจ้งหนี้ตั้งลูกหนี้ (AR) เลขที่ ${invoice.invoice_no} และลงบัญชี / ภาษีขาย (ภ.พ.30) เรียบร้อยแล้ว`
          : `ใบเสนอราคานี้มีใบแจ้งหนี้ AR เลขที่ ${invoice.invoice_no} อยู่ในระบบแล้ว`
      )
    } catch (err) {
      alert('ออกใบแจ้งหนี้ AR ไม่สำเร็จ: ' + (err.message || ''))
    } finally {
      setCreatingInvoice(false)
    }
  }

  const fetchDetail = async () => {
    setLoading(true)
    try {
      const [qRes, itemsRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, projects(id, project_code, project_name)')
          .eq('id', id)
          .single(),
        supabase
          .from('quotation_items')
          .select('*')
          .eq('quotation_id', id)
          .order('id', { ascending: true }),
      ])

      if (qRes.error) throw qRes.error
      const qt = qRes.data
      setQuotation(qt)
      setItems(itemsRes.data || [])

      // ดึงเอกสารเชื่อมโยงทั้งหมด (BOQ ต้นทาง + PR / PO / ใบเบิก + Sales Invoices + สต็อกคงเหลือ & Lot ต้นทาง)
      const [docsResult, matchedBoqResult, invRes, lotsRes] = await Promise.all([
        fetchQuotationLinkedDocs(qt),
        (async () => {
          let matchedBoq = null
          if (qt?.boq_id) {
            const { data: bById } = await supabase
              .from('boqs')
              .select('id, boq_no, title, status')
              .eq('id', qt.boq_id)
              .maybeSingle()
            matchedBoq = bById || null
          }
          if (!matchedBoq && qt?.ref_no) {
            const { data: bByNo } = await supabase
              .from('boqs')
              .select('id, boq_no, title, status')
              .eq('boq_no', qt.ref_no)
              .maybeSingle()
            matchedBoq = bByNo || null
          }
          return matchedBoq
        })(),
        supabase
          .from('inventory_items')
          .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost'),
        supabase
          .from('stock_lots')
          .select('item_id, source_project_id, qty_remaining, projects(project_code, project_name)')
          .gt('qty_remaining', 0),
      ])

      setLinkedDocs(docsResult)
      setSourceBoq(matchedBoqResult)
      setInventoryItems(invRes?.data || [])
      setStockLots(lotsRes?.error ? [] : lotsRes?.data || [])
    } catch (err) {
      console.error('Failed to load quotation detail:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  const handleStatusChange = async (newStatus) => {
    if (!quotation) return
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', quotation.id)

      if (error) throw error
      setQuotation((prev) => ({ ...prev, status: newStatus }))
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleTaxTypeChange = async (nextTaxType) => {
    if (!quotation || updatingVat) return
    const hasActiveInvoice = (linkedDocs?.invoices || []).some(
      (inv) => inv && !['ยกเลิก', 'cancelled'].includes(String(inv.status || '').toLowerCase())
    )
    if (hasActiveInvoice) {
      alert('ใบเสนอราคานี้มีใบแจ้งหนี้ (AR) แล้ว ไม่สามารถเปลี่ยนโหมด VAT ได้โดยตรง')
      return
    }

    setUpdatingVat(true)
    try {
      const updatePayload = buildQuotationTaxUpdatePayload(quotation, nextTaxType)
      await saveQuotationWithFallback(supabase, updatePayload, quotation.id)
      setQuotation((prev) => (prev ? { ...prev, ...updatePayload } : prev))
    } catch (err) {
      alert('เปลี่ยนรูปแบบ VAT ไม่สำเร็จ: ' + (err.message || ''))
    } finally {
      setUpdatingVat(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`ยืนยันการลบใบเสนอราคา ${quotation?.quotation_no} หรือไม่? ข้อมูลจะถูกลบถาวร`)) {
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('quotations').delete().eq('id', quotation.id)
      if (error) throw error

      // หากลบใบเสนอราคาที่แปลงมาจาก BOQ ให้คืนสถานะ BOQ เป็น approved หากไม่มีใบเสนอราคาอื่นผูกอยู่
      if (sourceBoq?.id && sourceBoq.status === 'converted_to_quotation') {
        const { data: remainingQt } = await supabase
          .from('quotations')
          .select('id')
          .eq('ref_no', sourceBoq.boq_no)
          .limit(1)
        if (!remainingQt || remainingQt.length === 0) {
          await supabase.from('boqs').update({ status: 'approved' }).eq('id', sourceBoq.id)
        }
      }

      alert('ลบใบเสนอราคาเรียบร้อยแล้ว')
      navigate('/quotations')
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
      setDeleting(false)
    }
  }

  const stockRows = useMemo(
    () => checkQuotationStock(items, inventoryItems),
    [items, inventoryItems]
  )
  const stockSummary = useMemo(() => summarizeQuotationStock(stockRows), [stockRows])
  const lotSourcesByItem = useMemo(() => summarizeItemLotSources(stockLots), [stockLots])
  const userCanIssueStock = canIssueStock(profile?.role)

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center text-steel-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-steel-300 border-t-sky-600 mb-2" />
          <p>กำลังโหลดข้อมูลใบเสนอราคา...</p>
        </div>
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="rounded-xl border border-steel-200 bg-white p-12 text-center text-steel-500">
        <p className="text-lg font-bold text-ink">ไม่พบข้อมูลใบเสนอราคา</p>
        <Link to="/quotations" className="mt-4 inline-block text-sky-600 hover:underline">
          ← กลับไปหน้ารายการใบเสนอราคา
        </Link>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[quotation.status] || {
    label: quotation.status,
    color: 'bg-steel-100 text-steel-700 border-steel-300',
  }

  const flow = computeQuotationWorkflow({
    quotation,
    prs: linkedDocs.prs,
    pos: linkedDocs.pos,
    invoices: linkedDocs.invoices,
    stockSummary,
    issues: linkedDocs.issues,
  })
  const linkedProcurementFlow =
    flow.activePRs.length > 0 || flow.activePOs.length > 0
      ? computeProcurementFlow({
          mode: flow.latestPR ? 'pr' : 'po',
          pr: flow.latestPR,
          po: flow.latestPO,
          linkedPos: flow.activePOs,
        })
      : null
  const approval = getCustomerApprovalDisplay(quotation)

  const renderLotSourceChips = (itemId) => {
    const lots = itemId ? lotSourcesByItem[itemId] : null
    if (!lots || lots.length === 0) return null
    return (
      <div className="flex flex-wrap justify-end gap-1 mt-0.5">
        {lots.map((lot, lIdx) => (
          <span
            key={lot.projectId || `central-${lIdx}`}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
              lot.isCentral
                ? 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
            }`}
            title={lot.projectName}
          >
            <span>{lot.isCentral ? 'คลังกลาง' : `เหลือจาก ${lot.projectCode || lot.projectName}`}</span>
            <span className="font-mono font-bold">({formatIntQty(lot.qty)})</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pb-16">
      {/* 1. แบนเนอร์หัวหน้าเอกสารระดับบริหาร (Executive Corporate ERP Banner - เลย์เอาต์ 2 ชั้น สมดุลเต็มความกว้าง) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-white shadow-sm space-y-4">
        {/* ชั้นที่ 1: ส่วนหัวเรื่อง + ป้ายกำกับ (ซ้าย) และ แถบเครื่องมือคำสั่ง Action Toolbar (ขวา) */}
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          {/* ข้อมูลหัวเรื่อง รหัส และป้ายสถานะ */}
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 shrink-0 mt-0.5">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              {/* แถบป้ายกำกับด้านบน (Badge Row) - แยกบรรทัดอย่างเป็นระเบียบ ไม่โดนปุ่มขวาเบียด */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/25 font-bold whitespace-nowrap">
                  QUOTATION DOCUMENT
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full border shadow-2xs whitespace-nowrap ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                {quotation.customer_po_no && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                    <FileCheck className="h-3 w-3" />
                    <span>{approval.shortLabel}</span>
                  </span>
                )}
              </div>

              {/* รหัสเอกสารใบเสนอราคา */}
              <h1 className="text-2xl font-black tracking-tight text-white font-mono whitespace-nowrap">
                {quotation.quotation_no}
              </h1>

              <p className="text-xs text-slate-400 truncate">
                เอกสารเสนอราคาโครงการวิศวกรรมและติดตั้งระบบโซลาร์เซลล์
              </p>
            </div>
          </div>

          {/* แถบปุ่ม Action ด้านขวา (จัดเรียงเป็นแถวสมดุล สัดส่วนคงที่ h-9 - Option A) */}
          <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">
            {/* ปุ่มตามลำดับขั้นตอนหลัก */}
            {quotation.customer_po_no ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowCustomerPoDoc(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 h-9 px-3.5 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{approval.isDirectQt ? 'ดูหลักฐานอนุมัติ' : 'ดูเอกสาร PO'}</span>
                </button>
                <Link
                  to={`/purchasing/po/new?quotation_id=${quotation.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 h-9 px-3.5 text-xs font-black shadow-xs transition"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>ส่งต่อจัดซื้อ (เปิด PO)</span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={openPoModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>ลูกค้าเซ็นอนุมัติใบเสนอราคา</span>
              </button>
            )}

            {/* ปุ่มพิมพ์ PDF */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              title="พิมพ์เอกสารใบเสนอราคามาตรฐาน หรือบันทึก PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>พิมพ์ใบเสนอราคา (PDF)</span>
            </button>

            {/* Status Dropdown */}
            <select
              value={quotation.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updatingStatus}
              className="rounded-xl border border-slate-700 bg-slate-800/90 text-slate-100 h-9 px-3 text-xs font-bold shadow-xs focus:outline-none cursor-pointer"
            >
              <option value="draft">ฉบับร่าง (Draft)</option>
              <option value="sent">ส่งลูกค้าแล้ว (Sent)</option>
              <option value="approved">ลูกค้าอนุมัติ (Approved)</option>
              <option value="rejected">ปฏิเสธ (Rejected)</option>
              <option value="expired">หมดอายุ (Expired)</option>
            </select>

            {/* ทางเลือก A: ปุ่มแก้ไข อยู่ด้านนอก เป็น 1-Click Action */}
            <Link
              to={`/quotations/${quotation.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>แก้ไข</span>
            </Link>

            {/* ทางเลือก A: เมนูเพิ่มเติม [ ⋮ ] รวมปุ่มทำสำเนา และปุ่มลบเอกสาร */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setShowMoreMenu((prev) => !prev)}
                className={`inline-flex items-center justify-center rounded-xl border h-9 w-9 text-xs transition cursor-pointer shadow-xs ${
                  showMoreMenu
                    ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                    : 'border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-300'
                }`}
                title="ตัวเลือกเพิ่มเติม"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-700 bg-slate-800 py-1.5 text-xs shadow-xl z-50 animate-in fade-in zoom-in-95">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      navigate(`/quotations/new?duplicate_from=${quotation.id}`)
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5 text-sky-400" />
                    <span>ทำสำเนาใบเสนอราคา</span>
                  </button>
                  <div className="my-1 border-t border-slate-700/70" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      handleDelete()
                    }}
                    disabled={deleting}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-rose-400 hover:bg-rose-500/15 transition cursor-pointer font-bold"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>ลบใบเสนอราคา</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ชั้นที่ 2: แถบข้อมูลสรุปอ้างอิงเต็มความกว้าง (โครงการและข้อมูลทั้งหมดอยู่บรรทัดเดียวกันแบบเต็มจอ ไม่โดนปุ่มบีบ) */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>วันที่ออก: <strong className="text-white font-mono">{quotation.issue_date ? new Date(quotation.issue_date).toLocaleDateString('th-TH') : '-'}</strong></span>
          </span>

          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>ยืนราคา: <strong className="text-white">{quotation.validity_days || '30'} วัน</strong> (ถึง {quotation.expiry_date || '-'})</span>
          </span>

          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>ลูกค้า: <strong className="text-white">{quotation.customer_name}</strong></span>
          </span>

          {quotation.projects && (
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <FolderGit2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>โครงการ: <strong className="text-sky-300">[{quotation.projects.project_code}] {quotation.projects.project_name}</strong></span>
            </span>
          )}

          {sourceBoq && (
            <Link
              to={`/boq/${sourceBoq.id}`}
              className="flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full bg-amber-500/15 border border-amber-400/30 px-2.5 py-0.5 text-amber-300 hover:bg-amber-500/25 transition"
            >
              <FileSpreadsheet className="h-3 w-3 shrink-0" />
              <span>BOQ ต้นทาง: <strong className="font-mono">{sourceBoq.boq_no}</strong></span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </Link>
          )}
        </div>
      </div>

      {/* 2. Visual Sales & Execution Workflow Pipeline (ผังแสดงลำดับขั้นตอนการทำงาน 1 -> 2 -> 3 -> 4 -> 5) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              <FolderGit2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ลำดับขั้นตอนการทำงาน (Sales &amp; Solar EPC Workflow)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ผังกระบวนการเริ่มตั้งแต่เสนอราคาจนถึงส่งมอบงาน ชี้ชัดว่าขั้นตอนปัจจุบันอยู่จุดใดและต้องทำอะไรต่อ
              </p>
            </div>
          </div>
          <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            สถานะปัจจุบัน: <span className="text-sky-600 dark:text-sky-400 font-bold">{statusInfo.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Step 1: ออกใบเสนอราคา */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs shadow-xs">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  เสร็จสิ้นแล้ว
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                1. ออกใบเสนอราคา
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5">
                {quotation.quotation_no}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                สร้างรายการและคำนวณต้นทุนเรียบร้อย
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
              วันที่: {quotation.issue_date ? new Date(quotation.issue_date).toLocaleDateString('th-TH') : '-'}
            </div>
          </div>

          {/* Step 2: ส่งให้ลูกค้าพิจารณา */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              quotation.status !== 'draft'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : 'border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 ring-2 ring-sky-400/20'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    quotation.status !== 'draft' ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white animate-pulse'
                  }`}
                >
                  {quotation.status !== 'draft' ? <Check className="h-3.5 w-3.5" /> : '2'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    quotation.status !== 'draft' ? 'text-emerald-800 dark:text-emerald-300' : 'text-sky-800 dark:text-sky-300'
                  }`}
                >
                  {quotation.status !== 'draft' ? 'ส่งลูกค้าแล้ว' : 'กำลังดำเนินการ'}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                2. ส่งให้ลูกค้าพิจารณา
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {quotation.validity_days ? `ยืนราคา ${quotation.validity_days} วัน` : 'รอผลการพิจารณาข้อเสนอ'}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="text-sky-700 dark:text-sky-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="h-3 w-3" />
                <span>พิมพ์ใบเสนอราคา</span>
              </button>
            </div>
          </div>

          {/* Step 3: ลูกค้าลงนามอนุมัติ / PO ลูกค้า */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              quotation.customer_po_no || quotation.status === 'approved'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : quotation.status === 'sent'
                ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 ring-2 ring-amber-400/20'
                : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    quotation.customer_po_no || quotation.status === 'approved'
                      ? 'bg-emerald-600 text-white'
                      : quotation.status === 'sent'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {quotation.customer_po_no || quotation.status === 'approved' ? <Check className="h-3.5 w-3.5" /> : '3'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    quotation.customer_po_no || quotation.status === 'approved'
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {approval.statusShort}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                3. ลูกค้าเซ็นอนุมัติใบเสนอราคา
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                {quotation.customer_po_no ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">{approval.shortLabel}</span>
                ) : (
                  'รอลูกค้าเซ็นรับ / อนุมัติงาน'
                )}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              {quotation.customer_po_no ? (
                <button
                  type="button"
                  onClick={() => setShowCustomerPoDoc(true)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="h-3 w-3" />
                  <span>{approval.isDirectQt ? 'ดูหลักฐานการอนุมัติ' : 'ดูเอกสาร PO ลูกค้า'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openPoModal}
                  className="text-amber-800 dark:text-amber-300 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ บันทึกการเซ็นอนุมัติ</span>
                </button>
              )}
            </div>
          </div>

          {/* Step 4: ส่งต่อจัดซื้อ & สโตร์ (เชื่อมข้อมูล PR / PO จริง) */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              flow.step4State === 'done'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : flow.step4State === 'in_progress'
                ? 'border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 ring-2 ring-sky-400/20'
                : flow.step4State === 'ready'
                ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-700 ring-2 ring-amber-400/20'
                : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    flow.step4State === 'done'
                      ? 'bg-emerald-600 text-white'
                      : flow.step4State === 'in_progress'
                      ? 'bg-sky-600 text-white'
                      : flow.step4State === 'ready'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {flow.step4State === 'done' ? <Check className="h-3.5 w-3.5" /> : '4'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                    flow.step4State === 'done'
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : flow.step4State === 'in_progress'
                      ? 'text-sky-800 dark:text-sky-300'
                      : flow.step4State === 'ready'
                      ? 'text-amber-900 dark:text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {flow.step4Badge}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                4. ส่งต่อจัดซื้อ &amp; สโตร์
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {flow.step4Detail}
              </div>
              {(flow.activePRs.length > 0 || flow.activePOs.length > 0 || flow.activeIssues.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {flow.activePRs.map((prItem) => (
                    <Link
                      key={prItem.id}
                      to={`/purchasing/pr/${prItem.id}`}
                      className="inline-flex items-center gap-0.5 rounded bg-sky-100/80 dark:bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-sky-800 dark:text-sky-300 hover:underline"
                    >
                      <span>{prItem.pr_no}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  ))}
                  {flow.activePOs.map((poItem) => (
                    <Link
                      key={poItem.id}
                      to={`/purchasing/po/${poItem.id}`}
                      className="inline-flex items-center gap-0.5 rounded bg-emerald-100/80 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300 hover:underline"
                    >
                      <span>{poItem.po_no}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  ))}
                  {flow.activeIssues.map((iss) => (
                    <Link
                      key={iss.id}
                      to="/store/issues"
                      className="inline-flex items-center gap-0.5 rounded bg-teal-100/80 dark:bg-teal-950/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-teal-800 dark:text-teal-300 hover:underline"
                      title={iss.notes || 'ใบเบิกสต็อก'}
                    >
                      <span>เบิก {iss.issue_no}</span>
                    </Link>
                  ))}
                </div>
              )}
              {linkedProcurementFlow && (
                <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <CompactProcurementSteps flow={linkedProcurementFlow} />
                </div>
              )}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
              {stockSummary.issuableCount > 0 && userCanIssueStock && (
                <>
                  <Link
                    to={`/store/issue/new?quotation_id=${quotation.id}${quotation.project_id ? `&project_id=${quotation.project_id}` : ''}`}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px] font-bold flex items-center gap-1"
                  >
                    <ArrowUpFromLine className="h-3 w-3" />
                    <span>เบิกสต็อก ({stockSummary.issuableCount})</span>
                  </Link>
                  <span className="text-slate-300">|</span>
                </>
              )}
              <Link
                to={`/purchasing/po/new?quotation_id=${quotation.id}`}
                className="text-amber-900 dark:text-amber-300 hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                <ShoppingCart className="h-3 w-3" />
                <span>เปิด PO ซื้อของ</span>
              </Link>
              <span className="text-slate-300">|</span>
              <Link
                to={`/purchasing/pr/new?quotation_id=${quotation.id}${stockSummary.shortageCount > 0 ? '&shortfall_only=1' : ''}`}
                className="text-slate-700 dark:text-slate-300 hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                <span>
                  {stockSummary.shortageCount > 0
                    ? `เปิด PR ส่วนที่ขาด (${stockSummary.shortageCount})`
                    : 'เปิด PR'}
                </span>
              </Link>
            </div>
          </div>

          {/* Step 5: ส่งมอบงาน & วางบิล AR (เชื่อมข้อมูล sales_invoices จริง) */}
          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              flow.step5State === 'done'
                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                : flow.step5State === 'billed' || flow.step5State === 'partial'
                ? 'border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 ring-2 ring-sky-400/20'
                : flow.step5State === 'ready'
                ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800'
                : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold text-xs shadow-xs ${
                    flow.step5State === 'done'
                      ? 'bg-emerald-600 text-white'
                      : flow.step5State === 'billed' || flow.step5State === 'partial'
                      ? 'bg-sky-600 text-white'
                      : flow.step5State === 'ready'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {flow.step5State === 'done' ? <Check className="h-3.5 w-3.5" /> : '5'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                    flow.step5State === 'done'
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : flow.step5State === 'billed' || flow.step5State === 'partial'
                      ? 'text-sky-800 dark:text-sky-300'
                      : flow.step5State === 'ready'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {flow.step5Badge}
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-2 text-xs">
                5. ส่งมอบงาน &amp; วางบิล AR
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {flow.step5Detail}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]">
              {!flow.latestInvoice ? (
                <button
                  type="button"
                  disabled={creatingInvoice}
                  onClick={handleCreateInvoiceNow}
                  className="text-sky-700 dark:text-sky-400 hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  <span>{creatingInvoice ? 'กำลังสร้าง AR...' : 'ออกใบแจ้งหนี้ (AR)'}</span>
                </button>
              ) : flow.totalRemaining > 0.05 ? (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <DollarSign className="h-3 w-3" />
                  <span>รับชำระเงิน (RC)</span>
                </button>
              ) : (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>ปิดยอดลูกหนี้ครบ</span>
                </span>
              )}

              <Link
                to="/accounting/ar-aging"
                className="text-slate-500 hover:text-sky-700 hover:underline font-medium shrink-0"
              >
                AR Aging →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Customer Approval Banner (แสดงเมื่อลูกค้าเซ็นรับใบเสนอราคา / ออก PO แล้ว) */}
      {quotation.customer_po_no && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/40 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs text-xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-emerald-950 dark:text-emerald-200 text-base">
                  {approval.isDirectQt
                    ? 'ลูกค้าเซ็นอนุมัติใบเสนอราคาแล้ว'
                    : 'ลูกค้าเซ็นอนุมัติ / ออกใบสั่งซื้อ (PO) แล้ว'}
                </span>
                <span className="rounded-full bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  {approval.badgeLabel}
                </span>
                {flow.latestInvoice && (
                  <span className="rounded-full bg-sky-100 text-sky-900 px-2.5 py-0.5 text-[10px] font-mono font-bold">
                    AR: {flow.latestInvoice.invoice_no}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300 font-mono flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {approval.isDirectQt ? 'เลขที่ใบเสนอราคาที่อนุมัติ:' : 'เลขที่ PO ลูกค้า:'}{' '}
                  <b>{approval.refNo}</b>
                </span>
                {quotation.customer_po_date && (
                  <span>วันที่อนุมัติ: <b>{new Date(quotation.customer_po_date).toLocaleDateString('th-TH')}</b></span>
                )}
                {quotation.customer_signer_name && (
                  <span>ผู้ลงนาม: <b>{quotation.customer_signer_name}</b></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCustomerPoDoc(true)}
              className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-emerald-900 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-slate-700 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{approval.isDirectQt ? 'ดูหลักฐานการอนุมัติ' : 'เปิดดูไฟล์ PO ลูกค้า'}</span>
            </button>
            {!flow.latestInvoice ? (
              <button
                type="button"
                disabled={creatingInvoice}
                onClick={handleCreateInvoiceNow}
                className="rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ReceiptText className="h-3.5 w-3.5" />
                <span>{creatingInvoice ? 'กำลังออกใบแจ้งหนี้...' : 'ออกใบแจ้งหนี้ (AR)'}</span>
              </button>
            ) : flow.totalRemaining > 0.05 ? (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>รับชำระเงิน ({baht(flow.totalRemaining)} บ.)</span>
              </button>
            ) : null}
            <Link
              to={`/purchasing/po/new?quotation_id=${quotation.id}`}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 text-xs font-black shadow-xs transition flex items-center gap-1.5"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>{approval.isDirectQt ? 'ส่งต่อจัดซื้อ / เปิด PO' : 'สั่งซื้อของตาม PO นี้'}</span>
            </Link>
          </div>
        </div>
      )}

      {/* 4. ข้อมูลหลัก 2 คอลัมน์ (Master Details Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* คอลัมน์ที่ 1: ข้อมูลลูกค้าและสถานที่ส่งมอบ */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>ข้อมูลลูกค้าและสถานที่ส่งมอบ (Customer &amp; Delivery Info)</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Client Profile</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <div className="text-slate-400">ชื่อลูกค้า / บริษัทลูกค้า</div>
              <div className="font-bold text-slate-900 dark:text-white text-base mt-0.5">
                {quotation.customer_name}
              </div>
            </div>

            <div>
              <div className="text-slate-400">สำนักงาน / สาขา</div>
              <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_branch || 'สำนักงานใหญ่'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">เลขประจำตัวผู้เสียภาษี (Tax ID)</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_tax_id || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">รหัสไปรษณีย์</div>
              <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.customer_postal_code || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">คลังสินค้าจ่ายพัสดุ</div>
              <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                <span>{quotation.warehouse_name || 'สโตร์หลัก'}</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="text-slate-400">ที่อยู่สำหรับออกเอกสาร</div>
              <div className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed flex items-start gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{quotation.customer_address || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์ที่ 2: ข้อมูลโครงการและเงื่อนไขเอกสาร */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>ข้อมูลโครงการและการเงิน (Project &amp; Commercial Terms)</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Commercial</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <div className="text-slate-400">โปรเจกต์งานวิศวกรรม (Project Link)</div>
              <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {quotation.projects ? (
                  <span className="text-sky-700 dark:text-sky-400 font-bold">
                    [{quotation.projects.project_code}] {quotation.projects.project_name}
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">งานขายทั่วไป / ไม่ได้ระบุโครงการ</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">เลขที่อ้างอิง (Ref No. / BOQ)</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {sourceBoq ? (
                  <Link
                    to={`/boq/${sourceBoq.id}`}
                    className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                  >
                    <span>{sourceBoq.boq_no}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  quotation.ref_no || '-'
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">พนักงานขาย / ผู้เสนอราคา</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>{quotation.sales_person || '-'}</span>
              </div>
            </div>

            <div>
              <div className="text-slate-400">วันที่เสนอราคา</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {quotation.issue_date || '-'}
              </div>
            </div>

            <div>
              <div className="text-slate-400">วันครบกำหนดยืนราคา</div>
              <div className="font-mono font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                {quotation.expiry_date || '-'} ({quotation.validity_days || 30} วัน)
              </div>
            </div>

            <div>
              <div className="text-slate-400">สกุลเงิน</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {quotation.currency || 'THB'}
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="text-slate-400 mb-1.5 flex items-center justify-between gap-2">
                <span>การคิดภาษี (สวิตช์เลือก VAT)</span>
                {flow.latestInvoice && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    ออกใบแจ้งหนี้ AR แล้ว (ล็อก VAT)
                  </span>
                )}
              </div>
              {(() => {
                const qtTaxType = inferQuotationTaxType(quotation)
                const vatModes = [
                  { value: 'vat_excluded', label: 'มี VAT แยก +7%' },
                  { value: 'vat_included', label: 'มี VAT รวม 7% แล้ว' },
                  { value: 'vat_exempt', label: 'ไม่มี VAT (0%)' },
                ]
                return (
                  <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-1">
                    {vatModes.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        disabled={updatingVat || Boolean(flow.latestInvoice)}
                        onClick={() => handleTaxTypeChange(mode.value)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                          qtTaxType === mode.value
                            ? 'bg-sky-700 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* 5. ตารางรายการสินค้าและบริการ (Itemized Table + เช็กสต็อกภายใน) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden space-y-0">
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              รายการสินค้าและบริการ (Itemized Table)
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              คลัง: <b>{quotation.warehouse_name || 'สโตร์หลัก'}</b>
            </span>
            <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              {items.length} รายการ
            </span>
          </div>
        </div>

        {/* แถบสรุปสถานะสต็อกภายในและทางลัดเบิกของ / เปิด PR เฉพาะส่วนที่ขาด (ไม่แสดงใน PDF ลูกค้า) */}
        {items.length > 0 && (
          <div className="no-print bg-slate-50/70 dark:bg-slate-900/80 px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <Warehouse className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                <span>เช็กสต็อกภายใน (ไม่แสดงใน PDF ลูกค้า)</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>พร้อมเบิก {stockSummary.enoughCount}</span>
              </span>

              {stockSummary.partialCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  <span>มีบางส่วน {stockSummary.partialCount}</span>
                </span>
              )}

              {(stockSummary.outOfStockCount + stockSummary.notInInventoryCount) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 font-bold text-rose-800 dark:text-rose-300">
                  <AlertCircle className="h-3 w-3" />
                  <span>ของหมด/ไม่มีในคลัง {stockSummary.outOfStockCount + stockSummary.notInInventoryCount}</span>
                </span>
              )}

              {stockSummary.serviceCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 font-medium text-slate-600 dark:text-slate-400">
                  <span>ข้ามค่าแรง/บริการ {stockSummary.serviceCount}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {stockSummary.issuableCount > 0 && userCanIssueStock && (
                <Link
                  to={`/store/issue/new?quotation_id=${quotation.id}${quotation.project_id ? `&project_id=${quotation.project_id}` : ''}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 text-xs font-bold shadow-2xs transition"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  <span>เบิกจากสต็อก ({stockSummary.issuableCount} รายการ)</span>
                </Link>
              )}

              {stockSummary.shortageCount > 0 && (
                <Link
                  to={`/purchasing/pr/new?quotation_id=${quotation.id}&shortfall_only=1`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-1.5 text-xs font-black shadow-2xs transition"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>เปิด PR เฉพาะส่วนที่ขาด ({stockSummary.shortageCount} รายการ)</span>
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">ชื่อสินค้า / สเปกวิศวกรรม</th>
                <th className="px-4 py-3 text-right w-24">จำนวน</th>
                <th className="px-4 py-3 text-center w-20">หน่วย</th>
                <th className="px-4 py-3 text-right w-32">ราคา/หน่วย</th>
                <th className="px-4 py-3 text-right w-24">ส่วนลด (%)</th>
                <th className="px-4 py-3 text-right w-36">ราคารวม ({quotation.currency || 'THB'})</th>
                <th className="px-4 py-3 text-right w-56 no-print">เช็กสต็อกภายใน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it, idx) => {
                const stock = stockRows[idx]
                const projectQuery = quotation.project_id ? `&project_id=${quotation.project_id}` : ''
                const issueUrl = stock?.itemId
                  ? `/store/issue/new?item_id=${stock.itemId}&qty=${Math.max(1, Math.floor(stock.issueQty || 0))}&quotation_id=${quotation.id}${projectQuery}`
                  : ''
                const prShortfallUrl = `/purchasing/pr/new?quotation_id=${quotation.id}&shortfall_only=1`

                return (
                <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                    {it.description && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line leading-relaxed font-normal bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
                        {it.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatIntQty(it.quantity)}
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs text-slate-500 dark:text-slate-400">
                    {it.unit || 'หน่วย'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                    {baht(it.unit_price || 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs">
                    {Number(it.discount_percent || 0) > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{it.discount_percent}%</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {baht(it.total_amount || 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs no-print">
                    {stock?.status === 'service' ? (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        ค่าแรง/บริการ (ข้ามเช็ก)
                      </span>
                    ) : stock?.status === 'enough' ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>พร้อมเบิก (มี {formatIntQty(stock.inStock)})</span>
                        </span>
                        {userCanIssueStock && issueUrl && (
                          <Link
                            to={issueUrl}
                            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            <ArrowUpFromLine className="h-3 w-3" />
                            <span>เบิกจากสต็อก →</span>
                          </Link>
                        )}
                        {renderLotSourceChips(stock.itemId)}
                      </div>
                    ) : stock?.status === 'partial' ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          <span>มี {formatIntQty(stock.inStock)} / ขาด {formatIntQty(stock.shortfall)}</span>
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          {userCanIssueStock && issueUrl && Math.floor(stock.issueQty) >= 1 && (
                            <Link
                              to={issueUrl}
                              className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              เบิก {formatIntQty(Math.floor(stock.issueQty))}
                            </Link>
                          )}
                          <Link
                            to={prShortfallUrl}
                            className="font-bold text-amber-800 dark:text-amber-300 hover:underline"
                          >
                            เปิด PR ขาด {formatIntQty(stock.shortfall)} →
                          </Link>
                        </div>
                        {renderLotSourceChips(stock.itemId)}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                          <AlertCircle className="h-3 w-3" />
                          <span>
                            {stock?.status === 'not_in_inventory'
                              ? `ไม่มีในคลัง (ขาด ${formatIntQty(stock?.shortfall || 0)})`
                              : `ของหมด (ขาด ${formatIntQty(stock?.shortfall || 0)})`}
                          </span>
                        </span>
                        <Link
                          to={prShortfallUrl}
                          className="text-[11px] font-bold text-rose-700 dark:text-rose-400 hover:underline"
                        >
                          เปิด PR ({formatIntQty(stock?.shortfall || 0)}) →
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* สรุปการเงินระดับบริหาร (Financial Summary Calculation Panel) */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-6">
          <div className="max-w-md ml-auto space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>รวมเป็นเงิน (Subtotal):</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {baht(quotation.subtotal || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
            {Number(quotation.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>ส่วนลดรวม (Total Discount):</span>
                <span className="font-mono font-bold">-{baht(quotation.discount_amount || 0)} {quotation.currency || 'THB'}</span>
              </div>
            )}
            {(() => {
              const qtTaxType = inferQuotationTaxType(quotation)
              const vatRateDisp = qtTaxType === 'vat_exempt' ? 0 : (quotation.vat_rate ?? 7)
              return (
                <>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span>{qtTaxType === 'vat_included' ? 'ราคาหลังหักส่วนลด (รวม VAT):' : 'ราคาหลังหักส่วนลด:'}</span>
                    <span className="font-mono">{baht(quotation.after_discount || quotation.subtotal || 0)} {quotation.currency || 'THB'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>ภาษีมูลค่าเพิ่ม (VAT {vatRateDisp}%{qtTaxType === 'vat_included' ? ' รวมในยอด' : ''}):</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {qtTaxType === 'vat_included' ? '' : '+'}{baht(quotation.vat_amount || 0)} {quotation.currency || 'THB'}
                    </span>
                  </div>
                </>
              )
            })()}
            {Number(quotation.wht_amount || 0) > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                <span>หักภาษี ณ ที่จ่าย ({quotation.wht_rate}%):</span>
                <span className="font-mono font-bold">-{baht(quotation.wht_amount || 0)} {quotation.currency || 'THB'}</span>
              </div>
            )}
            <div className="border-t-2 border-sky-400 dark:border-sky-600 pt-3 flex justify-between items-center text-sm font-extrabold text-sky-950 dark:text-sky-300">
              <span className="text-base">ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
              <span className="text-xl text-sky-800 dark:text-sky-300 font-mono font-black">
                {baht(quotation.grand_total || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. เงื่อนไข หมายเหตุ และลายเซ็น/เอกสารแนบ (Terms, Notes & Attachments) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* หมายเหตุสำหรับลูกค้า & โน้ตภายใน */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>หมายเหตุและเงื่อนไข (Notes &amp; Terms)</span>
          </h3>

          <div className="space-y-3">
            <div>
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                หมายเหตุที่แสดงให้ลูกค้าเห็น:
              </span>
              <div className="whitespace-pre-line text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 min-h-[70px]">
                {quotation.customer_notes || 'ไม่มีข้อกำหนดเพิ่มเติม'}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">
                โน้ตภายในบริษัท (ทีมงานเห็นเท่านั้น):
              </span>
              <div className="whitespace-pre-line text-xs text-amber-900 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 min-h-[70px]">
                {quotation.internal_notes || 'ไม่มีบันทึกภายใน'}
              </div>
            </div>
          </div>
        </div>

        {/* ลายเซ็นอิเล็กทรอนิกส์และเอกสารแนบ */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FileCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span>ลายเซ็นและเอกสารแนบ (Signatures &amp; Files)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                ลายเซ็นอิเล็กทรอนิกส์ &amp; ตราประทับ
              </span>
              {quotation.signature_url ? (
                <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center min-h-[90px]">
                  <R2Image
                    fileKey={quotation.signature_url}
                    alt="Signature"
                    className="max-h-20 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-center min-h-[90px] flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                  ไม่มีลายเซ็นแนบ
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                ไฟล์แนบเอกสารทั่วไป
              </span>
              {quotation.attachment_url ? (
                <div className="min-h-[90px] flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() => openFile(quotation.attachment_url)}
                    className="w-full flex items-center gap-2 p-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-xs font-semibold text-sky-700 dark:text-sky-300 transition cursor-pointer text-left shadow-2xs"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-sky-600" />
                    <span className="truncate">เปิด / ดาวน์โหลดไฟล์แนบ</span>
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1 text-center">สเปคสินค้า / แบบร่าง / ใบเสนอราคา</p>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-center min-h-[90px] flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                  ไม่มีไฟล์แนบ
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print PDF Modal */}
      {showPrintModal && (
        <QuotationPrintModal
          quotation={quotation}
          items={items}
          onClose={() => setShowPrintModal(false)}
          onChangeTaxType={flow.latestInvoice ? null : handleTaxTypeChange}
          updatingVat={updatingVat}
        />
      )}

      {/* Customer PO Print & View Modal */}
      {showCustomerPoDoc && (
        <CustomerPoPrintModal
          quotation={quotation}
          items={items}
          onClose={() => setShowCustomerPoDoc(false)}
          onEdit={() => {
            setShowCustomerPoDoc(false)
            openPoModal()
          }}
        />
      )}

      {/* Customer Approval Modal (Shared Component) */}
      {showPoModal && (
        <CustomerPoModal
          quotation={quotation}
          defaultAutoCreateAr={linkedDocs.invoices.length === 0}
          onClose={() => setShowPoModal(false)}
          onSuccess={async (updatedQt, invoiceMsg = '') => {
            setQuotation(updatedQt)
            await refreshLinkedDocs(updatedQt)
            alert(`บันทึกการอนุมัติใบเสนอราคาเรียบร้อยแล้ว (สถานะ: ลูกค้าอนุมัติ)${invoiceMsg}`)
          }}
        />
      )}

      {/* Receive Payment Modal for Linked AR Invoice */}
      {showPaymentModal && flow.latestInvoice && (
        <PaymentActionModal
          isOpen={true}
          type="receive"
          docType="INV"
          docId={flow.latestInvoice.id}
          docNo={flow.latestInvoice.invoice_no}
          contactId={flow.latestInvoice.contact_id || null}
          contactName={quotation.customer_name}
          totalAmount={Number(flow.latestInvoice.total_amount || 0)}
          alreadyPaid={Number(flow.latestInvoice.paid_amount || 0)}
          projectId={quotation.project_id}
          projectName={quotation.projects?.project_name}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false)
            fetchDetail()
          }}
        />
      )}
    </div>
  )
}

