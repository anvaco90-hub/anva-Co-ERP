import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { formatIntQty, toIntQty } from '../../lib/store'
import { buildIssuableStockLines } from '../../lib/quotationStockCheck'
import { ensureStockIssueAccounting } from '../../lib/storeAccounting'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import CollapsibleDetailField from '../../components/common/CollapsibleDetailField'
import {
  Boxes,
  AlertCircle,
  CheckCircle2,
  Building2,
  ArrowLeft,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react'

const EMPTY_LINE = { item_id: '', quantity: '' }

const TARGET_OPTIONS = [
  {
    id: 'project',
    label: 'โครงการ (Project)',
    desc: 'เบิกเข้าโครงการโซล่าเซลล์ (คิดเป็นต้นทุนโครงการ)',
  },
  {
    id: 'office',
    label: 'ออฟฟิศ (Office)',
    desc: 'เบิกใช้สำนักงานส่วนกลาง (คิดเป็นค่าใช้จ่ายออฟฟิศ)',
  },
  {
    id: 'site',
    label: 'หน้างาน (Site)',
    desc: 'เบิกไปหน้างานบริการ / ซ่อมบำรุงฉุกเฉิน O&M',
  },
]

const ISSUE_REASONS = [
  { id: 'ตัดวัสดุไปใช้', label: 'ตัดวัสดุไปใช้', icon: '' },
  { id: 'ปรับจำนวนสินค้าจากการนับ', label: 'ปรับจำนวนสินค้าจากการนับ', icon: '' },
  { id: 'สินค้าสูญหาย', label: 'สินค้าสูญหาย', icon: '' },
  { id: 'ทำลายสินค้า', label: 'ทำลายสินค้า', icon: '' },
  { id: 'สินค้าชำรุด/เสื่อมสภาพ', label: 'สินค้าชำรุด/เสื่อมสภาพ', icon: '' },
  { id: 'ภัยพิบัติ/เสื่อมสภาพ', label: 'ภัยพิบัติ/เสื่อมสภาพ', icon: '' },
  { id: 'อื่น ๆ', label: 'อื่น ๆ', icon: '' },
]

export default function IssueForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [items, setItems] = useState([])
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showLineErrors, setShowLineErrors] = useState(false)

  // ปลายทางการเบิก (โครงการ / ออฟฟิศ / หน้างาน)
  const [targetType, setTargetType] = useState('project')
  const [projectId, setProjectId] = useState('')
  const [targetLocation, setTargetLocation] = useState('')

  // วัตถุประสงค์ / เหตุผลในการเบิก
  const [issueReason, setIssueReason] = useState('ตัดวัสดุไปใช้')

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search)
    const initialItemId = queryParams.get('item_id')
    const initialQtyParam = queryParams.get('qty') || queryParams.get('quantity')
    const initialProjectId = queryParams.get('project') || queryParams.get('project_id')
    const initialQuotationId = queryParams.get('quotation_id')

    Promise.all([
      supabase
        .from('projects')
        .select('id, project_code, project_name')
        .neq('status', 'completed')
        .order('project_code'),
      supabase
        .from('inventory_items')
        .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost, image_url')
        .gt('qty_on_hand', 0)
        .order('item_name'),
    ]).then(async ([pRes, iRes]) => {
      const fetchedProjects = pRes.data ?? []
      setProjects(fetchedProjects)
      const fetchedItems = iRes.data ?? []
      setItems(fetchedItems)

      if (initialProjectId && fetchedProjects.some((pr) => pr.id === initialProjectId)) {
        setTargetType('project')
        setProjectId(initialProjectId)
      }

      if (initialItemId) {
        const matched = fetchedItems.find((it) => it.id === initialItemId)
        if (matched) {
          const requested = toIntQty(initialQtyParam)
          const maxStock = Math.max(1, Math.floor(Number(matched.qty_on_hand) || 0))
          const prefillQty = requested > 0 ? Math.min(requested, maxStock) : 1
          setLines([{ item_id: initialItemId, quantity: String(prefillQty) }])
        }
      } else if (initialQuotationId) {
        const [qtRes, qItemsRes] = await Promise.all([
          supabase.from('quotations').select('id, quotation_no, project_id').eq('id', initialQuotationId).maybeSingle(),
          supabase.from('quotation_items').select('*').eq('quotation_id', initialQuotationId).order('id', { ascending: true }),
        ])
        const qt = qtRes.data
        const issuableLines = buildIssuableStockLines(qItemsRes.data || [], fetchedItems).filter((line) =>
          fetchedItems.some((inv) => inv.id === line.item_id)
        )
        if (issuableLines.length > 0) {
          setLines(issuableLines)
        }
        if (!initialProjectId && qt?.project_id && fetchedProjects.some((pr) => pr.id === qt.project_id)) {
          setTargetType('project')
          setProjectId(qt.project_id)
        }
        if (qt?.quotation_no) {
          setNotes((prev) => prev || `เบิกวัสดุตามใบเสนอราคา ${qt.quotation_no}`)
        }
      }
    })
  }, [location.search])

  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const upd = (i, k, v) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const ids = lines.map((l) => l.item_id)
  const duplicate = new Set(ids).size !== ids.length
  const total = lines.reduce(
    (s, l) =>
      s +
      (byId[l.item_id]
        ? toIntQty(l.quantity || 0) * Number(byId[l.item_id].avg_unit_cost || 0)
        : 0),
    0
  )

  async function save() {
    setError('')
    const newErrors = {}

    if (targetType === 'project' && !projectId) {
      newErrors.projectId = 'กรุณาค้นหาและเลือกโครงการปลายทาง'
    } else if (targetType === 'site' && !targetLocation.trim()) {
      newErrors.targetLocation = 'กรุณาระบุชื่อหน้างานหรือสถานที่'
    }

    const hasEmptyItem = lines.some((l) => !l.item_id)
    const hasInvalidQty = lines.some(
      (l) => !l.quantity || toIntQty(l.quantity) <= 0
    )
    const hasOverQty = lines.some((l) => {
      const it = byId[l.item_id]
      return it && toIntQty(l.quantity) > Number(it.qty_on_hand)
    })

    if (hasEmptyItem || hasInvalidQty) {
      newErrors.lines = 'กรุณาเลือกวัสดุและระบุจำนวนเต็ม (จำนวนเต็มบวก > 0) ให้ครบทุกแถว'
      setShowLineErrors(true)
    } else if (hasOverQty) {
      newErrors.lines = 'มีรายการที่ระบุจำนวนเกินกว่ายอดคงเหลือในคลังสโตร์'
    } else if (duplicate) {
      newErrors.lines = 'มีรายการวัสดุซ้ำกันในใบเบิก กรุณารวมเป็นบรรทัดเดียว'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setBusy(true)
    const payload = lines.map((l) => ({
      item_id: l.item_id,
      quantity: toIntQty(l.quantity),
    }))

    let targetSummary = ''
    if (targetType === 'project') {
      const proj = projects.find((p) => p.id === projectId)
      targetSummary = `โครงการ ${proj?.project_code || ''} ${proj?.project_name || ''}`
    } else if (targetType === 'office') {
      targetSummary = `ออฟฟิศ/สำนักงานส่วนกลาง${targetLocation.trim() ? ` (${targetLocation.trim()})` : ''}`
    } else {
      targetSummary = `หน้างาน (${targetLocation.trim()})`
    }

    const formattedNotes = `[ปลายทาง: ${targetSummary} | เหตุผล: ${issueReason}] ${notes.trim()}`.trim()

    // เรียก confirm_stock_issue
    const { data: rpcIssueId, error: rpcErr } = await supabase.rpc('confirm_stock_issue', {
      p_project_id: targetType === 'project' ? projectId : null,
      p_items: payload,
      p_notes: formattedNotes,
      p_issue_target: targetType,
      p_issue_reason: issueReason,
      p_target_location: targetLocation.trim() || null,
    })

    let createdIssueId = rpcIssueId || null
    if (rpcErr) {
      const { data: fbIssueId, error: fallbackErr } = await supabase.rpc('confirm_stock_issue', {
        p_project_id: targetType === 'project' ? projectId : null,
        p_items: payload,
        p_notes: formattedNotes,
      })

      if (fallbackErr) {
        setBusy(false)
        setError(fallbackErr.message || rpcErr.message)
        return
      }
      createdIssueId = fbIssueId || null
    }

    await ensureStockIssueAccounting({
      issueId: createdIssueId,
      projectId: targetType === 'project' ? projectId : null,
      issueTarget: targetType,
      lines: payload,
      itemsMap: byId,
      userId: profile?.id || null,
    }).catch((accErr) => console.warn('ensureStockIssueAccounting notice:', accErr))

    setBusy(false)
    navigate('/store/issues')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 font-sans text-slate-800 dark:text-slate-100">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-[#0f172a] p-5 sm:p-6 text-white shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 shrink-0 mt-0.5">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/25 font-mono font-bold px-2.5 py-0.5 text-[10px] uppercase tracking-wider">
                  STOCK ISSUE
                </span>
                <span className="text-xs text-slate-400">
                  เบิกพัสดุออกจากคลังเพื่อไปใช้งานจริง (จำนวนเต็ม int)
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                เบิกของ (Material Requisition)
              </h1>
              <p className="text-xs text-slate-400">
                หยิบของไปใช้งานที่โครงการ ออฟฟิศ หรือหน้างาน ระบบจะตัดยอดคงคลังทันที
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>ย้อนกลับ</span>
            </button>

            <Link
              to="/store/adjust"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs"
            >
              <span>คืนของเข้าสโตร์</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 text-xs sm:text-sm font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2 shadow-xs">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Main Form Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
        
        {/* Step 1: ปลายทางการเบิก */}
        <div className="space-y-3">
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>1. เลือกปลายทางที่จะนำของไปใช้ *</span>
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TARGET_OPTIONS.map((opt) => {
              const isSelected = targetType === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTargetType(opt.id)
                    if (errors.projectId) setErrors((prev) => ({ ...prev, projectId: '' }))
                    if (errors.targetLocation) setErrors((prev) => ({ ...prev, targetLocation: '' }))
                  }}
                  className={`rounded-xl p-3.5 text-left transition border cursor-pointer ${
                    isSelected
                      ? 'border-slate-900 dark:border-amber-400 bg-slate-900 dark:bg-slate-800 text-white shadow-sm ring-2 ring-slate-900/15 dark:ring-amber-400/25'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    <span className={isSelected ? 'text-white dark:text-amber-300' : ''}>{opt.label}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-400 dark:text-amber-400" />}
                  </div>
                  <div
                    className={`text-[11px] mt-1 line-clamp-2 ${
                      isSelected ? 'text-slate-300 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {opt.desc}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Dynamic Input Based on Target Type */}
          {targetType === 'project' ? (
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ค้นหาและเลือกโครงการปลายทาง *
              </label>
              <SearchableProjectSelect
                projects={projects}
                value={projectId}
                onChange={(id) => {
                  setProjectId(id)
                  if (errors.projectId) setErrors((prev) => ({ ...prev, projectId: '' }))
                }}
                error={errors.projectId}
                placeholder="พิมพ์ชื่อโครงการ หรือรหัสโครงการเพื่อค้นหา..."
              />
              <FieldError error={errors.projectId} />
            </div>
          ) : targetType === 'office' ? (
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ระบุแผนก / ส่วนงานในออฟฟิศ (ถ้ามี)
              </label>
              <input
                type="text"
                placeholder="เช่น แผนกบัญชี, ธุรการ, สโตร์, ส่วนกลาง"
                className="input text-xs sm:text-sm"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
              />
            </div>
          ) : (
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ระบุชื่อหน้างาน / สถานที่ติดตั้ง *
              </label>
              <input
                type="text"
                placeholder="เช่น หน้างานบ้านคุณวินิจ หาดใหญ่, งานซ่อม O&M ด่วน"
                className={fieldErrorClass(errors.targetLocation, 'input text-xs sm:text-sm')}
                value={targetLocation}
                onChange={(e) => {
                  setTargetLocation(e.target.value)
                  if (errors.targetLocation)
                    setErrors((prev) => ({ ...prev, targetLocation: '' }))
                }}
              />
              <FieldError error={errors.targetLocation} />
            </div>
          )}
        </div>

        {/* Step 2: วัตถุประสงค์ / เหตุผลในการเบิก */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>2. วัตถุประสงค์ / เหตุผลในการเบิก (Issue Reason) *</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              ช่วยแยกประเภทค่าใช้จ่ายและบันทึกบัญชี
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ISSUE_REASONS.map((r) => {
              const active = issueReason === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setIssueReason(r.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
                    active
                      ? 'bg-slate-900 dark:bg-amber-500 text-amber-300 dark:text-slate-950 border-slate-900 dark:border-amber-500 shadow-sm'
                      : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{r.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 3: รายการพัสดุที่จะเบิก */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Boxes className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>3. รายการพัสดุที่จะเบิก (จำนวนเต็ม int) *</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ราคาต่อหน่วยคือต้นทุนเฉลี่ยของสโตร์ (ระบบคิดให้อัตโนมัติ)
            </span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-400 dark:text-slate-400">
              ไม่มีวัสดุคงเหลือในสโตร์หลัก กรุณารับวัสดุเข้าคลังก่อน
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((l, i) => {
                const it = byId[l.item_id]
                const currentStock = toIntQty(it?.qty_on_hand || 0)
                const reqQty = l.quantity !== '' ? toIntQty(l.quantity) : 0
                const remaining = currentStock - reqQty
                const over = it && reqQty > currentStock
                const itemEmpty = showLineErrors && !l.item_id
                const qtyEmpty =
                  showLineErrors && (!l.quantity || reqQty <= 0)

                return (
                  <div
                    key={i}
                    className={`rounded-2xl border p-4 transition ${
                      itemEmpty || qtyEmpty || over
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-3 items-start">
                      {/* Searchable Combobox วัสดุ */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          ค้นหาและเลือกวัสดุ ({i + 1})
                        </label>
                        <div className="mt-1">
                          <SearchableItemSelect
                            items={items}
                            value={l.item_id}
                            onChange={(id) => upd(i, 'item_id', id)}
                            placeholder="พิมพ์รหัสหรือชื่อพัสดุเพื่อค้นหา..."
                          />
                        </div>
                        {itemEmpty && (
                          <FieldError error="กรุณาเลือกวัสดุ" />
                        )}
                      </div>

                      {/* จำนวนที่เบิก (int) */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          จำนวนที่เบิก {it ? `(${it.unit})` : ''}
                        </label>
                        <input
                          className={fieldErrorClass(
                            qtyEmpty || over,
                            'input mt-1 text-xs font-mono font-bold text-right'
                          )}
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={l.quantity}
                          onChange={(e) => {
                            const val = e.target.value
                            upd(i, 'quantity', val === '' ? '' : String(Math.floor(Number(val))))
                          }}
                        />
                        {qtyEmpty && <FieldError error="ระบุจำนวนเต็ม > 0" />}
                        {over && (
                          <FieldError error={`เกินยอดคงเหลือ (มี ${formatIntQty(currentStock)})`} />
                        )}
                      </div>

                      {/* ปุ่มลบ */}
                      <div className="pt-5 flex justify-end">
                        <button
                          type="button"
                          className="h-9 px-3 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl transition cursor-pointer border border-rose-200 dark:border-rose-900 shadow-2xs flex items-center justify-center gap-1 font-bold text-xs disabled:opacity-25 disabled:cursor-not-allowed"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines(lines.filter((_, idx) => idx !== i))
                          }
                          title="ลบแถวนี้"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>ลบ</span>
                        </button>
                      </div>
                    </div>

                    {/* แสดงสมการชัดเจน: คลังมี 11 เบิก 5 คงเหลือหลังเบิก 6 (เลขจำนวนเต็ม) */}
                    {it && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
                        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 dark:text-slate-300 gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                            <span className="rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-slate-700 dark:text-slate-200 font-semibold">
                              ในคลังมี: <b className="text-slate-900 dark:text-white">{formatIntQty(currentStock)}</b> {it.unit}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 font-bold">-</span>
                            <span className="rounded-md bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-amber-900 dark:text-amber-300 font-bold">
                              เบิก: <b>{formatIntQty(reqQty)}</b> {it.unit}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 font-bold">=</span>
                            <span
                              className={`rounded-md px-2.5 py-0.5 font-bold ${
                                over
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              }`}
                            >
                              {over
                                ? `ยอดเบิกเกิน (ขาดอีก ${formatIntQty(Math.abs(remaining))} ${it.unit})`
                                : `คงเหลือหลังเบิก: ${formatIntQty(remaining)} ${it.unit}`}
                            </span>
                          </div>

                          {/* ต้นทุนและมูลค่า */}
                          <div className="text-right">
                            <span className="text-slate-500 dark:text-slate-400">มูลค่าเบิก: </span>
                            <b className="font-mono text-slate-900 dark:text-white">
                              {baht(reqQty * Number(it.avg_unit_cost || 0))}
                            </b>{' '}
                            <span className="text-slate-500 dark:text-slate-400">บาท</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <FieldError error={errors.lines} />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
              className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-bold px-4 py-2 text-xs transition self-start shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ เพิ่มรายการวัสดุที่จะเบิก</span>
            </button>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">มูลค่าเบิกจ่ายรวมทั้งสิ้น:</span>
              <div className="font-mono font-black text-xl text-slate-900 dark:text-amber-400">
                {baht(total)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">บาท</span>
              </div>
            </div>
          </div>
        </div>

        {/* หมายเหตุ (พับซ่อนได้เพื่อความมินิมอล) */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3.5">
          <CollapsibleDetailField
            value={notes}
            onChange={setNotes}
            addLabel="เพิ่มหมายเหตุ / รายละเอียดการเบิก"
            editLabel="หมายเหตุ / รายละเอียดการเบิก"
            placeholder="เช่น เบิกสำหรับงานติดตั้งงวดที่ 1 หรือ ช่างเบิกไปใช้งานด่วน..."
            rows={2}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link
            to="/store/adjust"
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-semibold flex items-center gap-1"
          >
            <span>หากต้องการนำของเหลือมาคืนสโตร์  คลิกไปที่ "คืนของ"</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/store')}
              className="btn-ghost"
            >
              ยกเลิก
            </button>

            <button
              type="button"
              disabled={busy || items.length === 0}
              onClick={save}
              className="btn-primary flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{busy ? 'กำลังบันทึก...' : 'ยืนยันการเบิกของ'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
