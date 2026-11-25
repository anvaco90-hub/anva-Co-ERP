import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, canCreatePurchasing, formatDateTimeParts } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { formatThaiDate } from '../../lib/poDueStatus'
import { thaiBahtText } from './PODetail'
import StatusBadge from '../../components/common/StatusBadge'
import AuditPanel from './AuditPanel'
import PRDocumentModal from '../../components/reports/PRDocumentModal'
import ProcurementWorkflowStepper from '../../components/purchasing/ProcurementWorkflowStepper'
import {
  ArrowLeft,
  Printer,
  Edit3,
  Trash2,
  Plus,
  ShoppingCart,
  Building2,
  Calendar,
  User,
  Store,
  FileText,
  CheckCircle2,
  Clock,
  Layers,
  ExternalLink,
  Sun,
  ShieldCheck,
  FolderGit2,
  MoreVertical,
} from 'lucide-react'

export default function PRDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const canEdit = canCreatePurchasing(profile?.role)

  const [pr, setPr] = useState(null)
  const [items, setItems] = useState([])
  const [pos, setPos] = useState([])
  const [showPrPdf, setShowPrPdf] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef(null)
  const [viewStyle, setViewStyle] = useState(() => (searchParams.get('mode') === 'paper' ? 'paper' : 'portal')) // 'portal' | 'paper'
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase
        .from('purchase_requisitions')
        .select('*, projects(id, project_code, project_name, customer_name)')
        .eq('id', id)
        .single(),
      supabase
        .from('purchase_requisition_items')
        .select('*')
        .eq('pr_id', id)
        .order('item_name'),
      supabase
        .from('purchase_orders')
        .select(
          'id, po_no, order_date, expected_delivery_date, status, total_amount, grand_total, net_amount, tax_type, vat_rate, vat_amount, wht_rate, wht_amount, payment_status, deposit_paid_amount, remaining_amount, payment_type, custom_vendor_name, vendor_name, purchase_order_items(quantity, unit_price, qty_received)'
        )
        .eq('pr_id', id)
        .then(async (res) => {
          if (res.error) {
            console.warn('PRDetail purchase_orders join warning:', res.error);
            const fb = await supabase.from('purchase_orders').select('*').eq('pr_id', id);
            return fb;
          }
          return res;
        }),
    ]).then(async ([a, b, c]) => {
      if (a.error) {
        console.warn('PR load warning:', a.error)
        const fb = await supabase.from('purchase_requisitions').select('*').eq('id', id).single()
        if (fb.error) return setError('ไม่พบใบขอซื้อนี้ในระบบ')
        setPr(fb.data)
      } else {
        setPr(a.data)
      }
      setItems(b.data ?? [])
      setPos(c.data ?? [])
    })
  }, [id])

  async function remove() {
    if (!confirm('ยืนยันลบใบขอซื้อนี้? (ข้อมูลจะถูกจัดเก็บเข้าบันทึกประวัติ)')) return
    setDeleting(true)
    try {
      const { error: rpcErr } = await supabase.rpc('delete_purchase_requisition', {
        p_pr_id: id,
        p_reason: 'ลบจากหน้ารายละเอียดใบขอซื้อ',
      })
      if (rpcErr) {
        const { error: directErr } = await supabase.from('purchase_requisitions').delete().eq('id', id)
        if (directErr) throw directErr
      }
      navigate('/purchasing?tab=pr')
    } catch (err) {
      alert('ไม่สามารถลบใบขอซื้อได้: ' + (err.message || err))
    } finally {
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800 space-y-3 font-sans">
        <p className="text-sm font-bold">{error}</p>
        <Link to="/purchasing?tab=pr" className="inline-flex items-center gap-1 text-xs font-semibold underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>กลับไปหน้ารายการใบขอซื้อ (PR)</span>
        </Link>
      </div>
    )
  }

  if (!pr) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-3 font-sans">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-steel-900 border-t-hivis" />
        <p className="text-xs font-semibold text-steel-500">กำลังโหลดรายละเอียดใบขอซื้อ...</p>
      </div>
    )
  }

  const totalEstimatedAmount = items.reduce(
    (sum, it) => sum + (Number(it.quantity || 0) * Number(it.estimated_price || 0)),
    0
  )

  const projectName =
    pr.custom_project_name ||
    (pr.projects ? `[${pr.projects.project_code}] ${pr.projects.project_name}` : 'ของกลางบริษัท / สต็อกส่วนกลาง')
  const activePos = pos.filter((p) => p.status !== 'cancelled')

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] pb-20 pt-2 font-sans space-y-5">
      <div className="max-w-6xl mx-auto px-4 space-y-5">

        {/* 0. แถบนำทางด้านบน & สลับมุมมอง */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/purchasing?tab=pr"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition"
            title="กลับไปรายการใบขอซื้อ"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับรายการใบขอซื้อ (PR)</span>
          </Link>

          <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300/70 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setViewStyle('portal')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewStyle === 'portal'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              มุมมองระบบ &amp; Workflow
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('paper')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewStyle === 'paper'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              รายงาน A4
            </button>
          </div>
        </div>

        {/* 1. แบนเนอร์หัวเอกสารระดับบริหาร (#0f172a สไตล์เดียวกับ QuotationDetail & PODetail) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-white shadow-sm space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            {/* ซ้าย: ไอคอน + ป้ายสถานะ + เลขที่เอกสาร */}
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 shrink-0 mt-0.5">
                <FileText className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/25 font-bold whitespace-nowrap">
                    PURCHASE REQUISITION
                  </span>
                  <StatusBadge status={pr.status} />
                  {activePos.map((p) => (
                    <Link
                      key={p.id}
                      to={`/purchasing/po/${p.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 hover:underline whitespace-nowrap"
                    >
                      <ShoppingCart className="h-3 w-3" />
                      <span>PO: {p.po_no}</span>
                    </Link>
                  ))}
                </div>

                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="text-2xl font-black tracking-tight text-white font-mono whitespace-nowrap">
                    {pr.pr_no}
                  </h1>
                  <span className="font-mono text-sm font-bold text-emerald-300">
                    ฿{baht(totalEstimatedAmount)} บาท
                  </span>
                </div>

                <p className="text-xs text-slate-400 truncate">
                  ใบขอซื้อพัสดุและอุปกรณ์โครงการวิศวกรรม · {items.length} รายการ ({thaiBahtText(totalEstimatedAmount)})
                </p>
              </div>
            </div>

            {/* ขวา: ปุ่มคำสั่ง (Option A - แก้ไขข้างนอก ลบใน ⋮) */}
            <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">
              {activePos.length > 0 ? (
                <Link
                  to={`/purchasing/po/${activePos[0].id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 h-9 px-3.5 text-xs font-bold transition shadow-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>ดูใบสั่งซื้อ ({activePos[0].po_no})</span>
                </Link>
              ) : canEdit && pr.status === 'pending' ? (
                <Link
                  to={`/purchasing/po/new?pr=${pr.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 h-9 px-3.5 text-xs font-black shadow-xs transition"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>สร้างใบสั่งซื้อ (เปิด PO)</span>
                </Link>
              ) : null}

              <button
                type="button"
                onClick={() => setShowPrPdf(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>พิมพ์ใบขอซื้อ (PDF)</span>
              </button>

              {canEdit && pr.status !== 'cancelled' && (
                <Link
                  to={`/purchasing/pr/${pr.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>แก้ไข</span>
                </Link>
              )}

              {canEdit && (
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
                          setViewStyle((v) => (v === 'portal' ? 'paper' : 'portal'))
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-sky-400" />
                        <span>{viewStyle === 'portal' ? 'สลับเป็นรายงาน A4' : 'สลับเป็นมุมมองระบบ'}</span>
                      </button>
                      <div className="my-1 border-t border-slate-700/70" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false)
                          remove()
                        }}
                        disabled={deleting}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-rose-400 hover:bg-rose-500/15 transition cursor-pointer font-bold"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span>{deleting ? 'กำลังลบ...' : 'ลบใบขอซื้อ'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ชั้นที่ 2: แถบข้อมูลสรุปอ้างอิงเต็มความกว้าง */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Calendar className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span>วันที่ขอซื้อ: <strong className="text-white font-mono">{formatThaiDate(pr.request_date)}</strong></span>
            </span>

            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Store className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>ผู้ขายแนะนำ: <strong className="text-white">{pr.suggested_vendor || 'ฝ่ายจัดซื้อเทียบราคา'}</strong></span>
            </span>

            {pr.customer_name && (
              <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Building2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>ลูกค้า: <strong className="text-white">{pr.customer_name}</strong></span>
              </span>
            )}

            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <FolderGit2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>โครงการ: <strong className="text-sky-300">{projectName}</strong></span>
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: Portal Mode (ผัง Workflow 5 ขั้นตอน + รายละเอียด)               */}
        {/* ------------------------------------------------------------------ */}
        {viewStyle === 'portal' && (
          <div className="space-y-4">
            {/* 2. ผังลำดับขั้นตอนการทำงาน (PR -> PO Procurement Workflow) */}
            <ProcurementWorkflowStepper
              mode="pr"
              pr={pr}
              linkedPos={pos}
              items={items}
              canCreate={canEdit}
              onPrintPdf={() => setShowPrPdf(true)}
            />

            {/* 3. Metadata 4-Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-sky-500" />
                  <span>โครงการ / แผนก</span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-2">
                  {projectName}
                </div>
                {pr.customer_name && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    ลูกค้า: {pr.customer_name}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-amber-500" />
                  <span>วันที่ขอซื้อ</span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                  {formatThaiDate(pr.request_date)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  เวลาบันทึก: {pr.created_at ? formatDateTimeParts(pr.created_at).dateStr : '-'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-emerald-500" />
                  <span>ผู้ขาย / ร้านค้าแนะนำ</span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-2">
                  {pr.suggested_vendor || 'ให้ฝ่ายจัดซื้อเปรียบเทียบราคา'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
                  <span>สถานะการขอซื้อ</span>
                </div>
                <div>
                  <StatusBadge status={pr.status} />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pr.status === 'ordered' ? 'ออกใบสั่งซื้อเรียบร้อยแล้ว' : 'รอการอนุมัติและออกใบสั่งซื้อ'}
                </div>
              </div>
            </div>

            {/* 3. Items Table (รายการพัสดุวิศวกรรม) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-600" />
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    รายการพัสดุและอุปกรณ์ที่ขอซื้อ ({items.length} รายการ)
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ราคาประมาณการต่อหน่วย (ก่อนเจรจาต่อรอง)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5 w-12 text-center">#</th>
                      <th className="py-3 px-3.5">รายการพัสดุ / สเปกวิศวกรรม</th>
                      <th className="py-3 px-3.5 w-24 text-right">จำนวน</th>
                      <th className="py-3 px-3.5 w-24">หน่วยนับ</th>
                      <th className="py-3 px-3.5 w-36 text-right">ราคาประมาณ/หน่วย</th>
                      <th className="py-3 px-3.5 w-36 text-right">รวมเป็นเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {items.map((it, idx) => {
                      const lineTotal = Number(it.quantity || 0) * Number(it.estimated_price || 0)
                      return (
                        <tr key={it.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3.5 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-slate-100">
                            {it.item_name}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {it.quantity}
                          </td>
                          <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400">
                            {it.unit || 'ชิ้น'}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                            ฿{baht(it.estimated_price)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            ฿{baht(lineTotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/60 border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                    <tr>
                      <td colSpan={4} className="py-3 px-4 text-slate-600 dark:text-slate-300 text-xs italic">
                        ({thaiBahtText(totalEstimatedAmount)})
                      </td>
                      <td className="py-3 px-3.5 text-right text-slate-700 dark:text-slate-300">
                        มูลค่ารวมทั้งสิ้น:
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-base font-black text-emerald-700 dark:text-emerald-400">
                        ฿{baht(totalEstimatedAmount)} บ.
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 4. PO Linkage Card (ความเชื่อมโยงกับใบสั่งซื้อ) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-emerald-600" />
                <span>ความเชื่อมโยงกับใบสั่งซื้อ (Purchase Order Linkage)</span>
              </h3>

              {pos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {pos.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-emerald-800 dark:text-emerald-300">
                            {p.po_no}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ({formatThaiDate(p.order_date)})
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          ผู้ขาย: <strong>{p.custom_vendor_name || p.vendors?.vendor_name || 'ไม่ระบุ'}</strong>
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          ยอดรวม: ฿{baht(p.total_amount)} บ.
                        </div>
                      </div>

                      <Link
                        to={`/purchasing/po/${p.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
                      >
                        <span>เปิดดู PO</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-xs text-amber-900 dark:text-amber-200">
                      ⏳ รายการนี้ยังไม่ได้สร้างใบสั่งซื้อ (PO)
                    </div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      สามารถดึงรายการวัสดุทั้งหมดในใบขอซื้อนี้ไปสร้างใบสั่งซื้อได้อย่างรวดเร็ว
                    </div>
                  </div>
                  {canEdit && (
                    <Link
                      to={`/purchasing/po/new?pr=${pr.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span> ออกใบสั่งซื้อ (PO) ทันที</span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* 5. 3-Party Official Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ผู้ขอซื้อ (Requester)</div>
                <div className="h-10 border-b border-dashed border-slate-300 dark:border-slate-700" />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">วิศวกรโครงการ / ผู้เบิก</div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ผู้ตรวจสอบงบประมาณ (Reviewer)</div>
                <div className="h-10 border-b border-dashed border-slate-300 dark:border-slate-700" />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">ฝ่ายจัดซื้อ / บัญชีต้นทุน</div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ผู้อนุมัติ (Approver)</div>
                <div className="h-10 border-b border-dashed border-slate-300 dark:border-slate-700" />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">ผู้จัดการโครงการ / ผู้มีอำนาจลงนาม</div>
              </div>
            </div>

            {/* 6. Audit Trail */}
            <AuditPanel docId={pr.id} row={pr} />
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: Paper Mode (กระดาษรายงานแบบเป็นทางการสไตล์ A4 รายงานจริง)        */}
        {/* ------------------------------------------------------------------ */}
        {viewStyle === 'paper' && (
          <div className="max-w-4xl mx-auto bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-2xl border border-slate-300 font-sans space-y-6">
            {/* Paper Header */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-amber-400 font-black flex items-center justify-center text-2xl shadow-sm">
                  </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">
                    บริษัท อันวาแอนด์โค จำกัด (ANVA & CO., LTD.)
                  </h2>
                  <p className="text-xs text-slate-600">
                    ระบบบริหารคลังพัสดุและวิศวกรรมโซลาร์เซลล์มาตรฐานสากล
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xl font-black font-mono text-slate-900">
                  ใบขอซื้อ (PR)
                </div>
                <div className="font-mono text-sm font-bold text-sky-700">
                  {pr.pr_no}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  วันที่: {formatThaiDate(pr.request_date)}
                </div>
              </div>
            </div>

            {/* Paper Metadata Table */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1.5">
                <div>
                  <span className="font-bold text-slate-500">โครงการเป้าหมาย:</span>{' '}
                  <span className="font-bold text-slate-900">{projectName}</span>
                </div>
                {pr.customer_name && (
                  <div>
                    <span className="font-bold text-slate-500">ลูกค้า / ผู้ว่าจ้าง:</span>{' '}
                    <span className="text-slate-800">{pr.customer_name}</span>
                  </div>
                )}
                <div>
                  <span className="font-bold text-slate-500">ผู้ขอซื้อ:</span>{' '}
                  <span className="text-slate-800">วิศวกรผู้รับผิดชอบโครงการ</span>
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <div>
                  <span className="font-bold text-slate-500">สถานะเอกสาร:</span>{' '}
                  <span className="font-bold text-emerald-700">
                    {pr.status === 'ordered' ? 'สั่งซื้อแล้ว' : 'รอสั่งซื้อ'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">ร้านค้าแนะนำ:</span>{' '}
                  <span className="text-slate-800">{pr.suggested_vendor || '-'}</span>
                </div>
                {pos.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-500">ใบสั่งซื้อที่ออก:</span>{' '}
                    <span className="font-mono font-bold text-emerald-800">{pos.map((p) => p.po_no).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Paper Table */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold uppercase">
                  <tr>
                    <th className="py-2 px-3 text-center w-12 border-r border-slate-300">#</th>
                    <th className="py-2 px-3 border-r border-slate-300">รายการพัสดุ / รายละเอียดสเปก</th>
                    <th className="py-2 px-3 text-right w-20 border-r border-slate-300">จำนวน</th>
                    <th className="py-2 px-3 w-16 border-r border-slate-300">หน่วย</th>
                    <th className="py-2 px-3 text-right w-28 border-r border-slate-300">ราคาประมาณ/หน่วย</th>
                    <th className="py-2 px-3 text-right w-32">รวมเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, idx) => {
                    const lineTotal = Number(it.quantity || 0) * Number(it.estimated_price || 0)
                    return (
                      <tr key={it.id || idx}>
                        <td className="py-2 px-3 text-center font-mono border-r border-slate-200">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold border-r border-slate-200">{it.item_name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{it.quantity}</td>
                        <td className="py-2 px-3 border-r border-slate-200">{it.unit}</td>
                        <td className="py-2 px-3 text-right font-mono border-r border-slate-200">฿{baht(it.estimated_price)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">฿{baht(lineTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3 italic text-slate-600 border-r border-slate-300">
                      ({thaiBahtText(totalEstimatedAmount)})
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-slate-300">ยอดรวมทั้งสิ้น:</td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-slate-900">
                      ฿{baht(totalEstimatedAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Paper Signatures */}
            <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs">
              <div className="space-y-4">
                <div className="h-12 border-b border-slate-400" />
                <div className="font-bold text-slate-800">ผู้ขอซื้อ</div>
                <div className="text-[11px] text-slate-500">วันที่: ...../...../..........</div>
              </div>
              <div className="space-y-4">
                <div className="h-12 border-b border-slate-400" />
                <div className="font-bold text-slate-800">ผู้ตรวจสอบงบประมาณ</div>
                <div className="text-[11px] text-slate-500">วันที่: ...../...../..........</div>
              </div>
              <div className="space-y-4">
                <div className="h-12 border-b border-slate-400" />
                <div className="font-bold text-slate-800">ผู้อนุมัติสั่งซื้อ</div>
                <div className="text-[11px] text-slate-500">วันที่: ...../...../..........</div>
              </div>
            </div>
          </div>
        )}

        {/* Modal พิมพ์ใบขอซื้อ PDF ขนาด A4 */}
        {showPrPdf && (
          <PRDocumentModal
            pr={pr}
            items={items}
            onClose={() => setShowPrPdf(false)}
          />
        )}
      </div>
    </div>
  )
}
