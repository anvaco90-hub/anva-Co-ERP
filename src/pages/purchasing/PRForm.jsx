import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchUnifiedCustomers, fetchUnifiedVendors } from '../../lib/contactsSync'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { inferQuotationTaxType, round2 } from '../../lib/tax'
import { buildPurchaseItemsFromQuotation } from '../../lib/purchasingPricing'
import {
  buildShortfallPrItems,
  canCreatePrFromQuotation,
  summarizeQuotationPrCoverage,
} from '../../lib/quotationStockCheck'
import { buildQuotationPrQuerySpecs } from '../../lib/salesFlowUtils'
import ItemsEditor from './ItemsEditor'
import { FieldError } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'
import CollapsibleDetailField from '../../components/common/CollapsibleDetailField'
import { FileText, CheckCircle2, AlertTriangle, ExternalLink, ArrowLeft, Building2, Package } from 'lucide-react'

// สร้าง (/purchasing/pr/new) และแก้ไข (/purchasing/pr/:id/edit) ใบขอซื้อ
export default function PRForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [projectMode, setProjectMode] = useState('select') // 'select' | 'custom'
  const [customProjectName, setCustomProjectName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customers, setCustomers] = useState([])
  const [suggestedVendor, setSuggestedVendor] = useState('')
  const [vendors, setVendors] = useState([])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)

  // จัดการการซิงค์ต้นทุนและลิงก์จากใบเสนอราคาขาย (Quotation -> PR Sync)
  const [salesQuotationId, setSalesQuotationId] = useState('')
  const [salesQuotationNo, setSalesQuotationNo] = useState('')
  const [quotationSync, setQuotationSync] = useState(null)
  const [existingQtPrs, setExistingQtPrs] = useState([])
  const [includeAlreadyRequested, setIncludeAlreadyRequested] = useState(false)
  const [prPriceMode, setPrPriceMode] = useState('cost_baseline') // 'cost_baseline' | 'net_before_vat' | 'with_vat'
  const loadedQuotationRef = useRef(false)
  const PR_VAT_INCLUDED_TAG = '[ราคารวม VAT 7% แล้ว]'

  const buildSyncedItems = (mode, syncData, includeAllOverride = includeAlreadyRequested) => {
    const paramsObj = {
      quotation: syncData.quotation || {},
      quotationItems: syncData.rawItems || [],
      boqItems: syncData.boqItems || [],
      inventoryItems: syncData.inventoryItems || [],
      mode,
    }
    const rawBuilt = syncData.shortfallOnly
      ? buildShortfallPrItems(paramsObj)
      : buildPurchaseItemsFromQuotation(paramsObj)

    if (syncData.shortfallOnly && !includeAllOverride && (syncData.existingPrItems || []).length > 0) {
      return summarizeQuotationPrCoverage(rawBuilt, syncData.existingPrItems).uncoveredItems
    }
    return rawBuilt
  }

  const applyPriceMode = (mode, syncData = quotationSync, includeAllOverride = includeAlreadyRequested) => {
    if (!syncData) return
    setPrPriceMode(mode)

    if (mode === 'cost_baseline') {
      const built = buildSyncedItems('cost_baseline', syncData, includeAllOverride)
      setItems(built.length > 0 ? built : [{ ...EMPTY_ITEM }])
    } else {
      const refItems = buildSyncedItems('selling_ref', syncData, includeAllOverride).map((row) => ({
        ...row,
        price:
          mode === 'with_vat' && syncData.hasVat
            ? String(round2(Number(row.sellingPriceRef || 0) * (1 + syncData.vatRate / 100)) || '')
            : row.price,
      }))
      setItems(refItems.length > 0 ? refItems : [{ ...EMPTY_ITEM }])
    }

    setNotes((prev) => {
      const cleaned = (prev || '')
        .split('\n')
        .filter((line) => line.trim() !== PR_VAT_INCLUDED_TAG)
        .join('\n')
        .trim()
      if (mode === 'with_vat' && syncData.hasVat) {
        return cleaned ? `${cleaned}\n${PR_VAT_INCLUDED_TAG}` : PR_VAT_INCLUDED_TAG
      }
      return cleaned
    })
  }

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))
    fetchUnifiedCustomers().then((data) => setCustomers(data ?? []))
    fetchUnifiedVendors().then((data) => setVendors(data ?? []))

    // โหลดรายการจากใบเสนอราคาขายถ้ามีการส่งต่อมา (Quotation -> PR)
    const qId = params.get('quotation_id')
    const shortfallOnly = params.get('shortfall_only') === '1'
    if (qId && !id && !loadedQuotationRef.current) {
      loadedQuotationRef.current = true
      Promise.all([
        supabase.from('quotations').select('*').eq('id', qId).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', qId),
        supabase.from('inventory_items').select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost'),
      ]).then(async ([qRes, itemsRes, invRes]) => {
        const qt = qRes.data
        if (qt?.project_id) {
          setProjectId(qt.project_id)
          setProjectMode('select')
        }
        if (qt?.customer_name) {
          setCustomerName(qt.customer_name)
        }
        setSalesQuotationId(qt?.id || '')
        setSalesQuotationNo(qt?.quotation_no || '')

        let boqItems = []
        if (qt?.boq_id) {
          const { data: bi } = await supabase.from('boq_items').select('*').eq('boq_id', qt.boq_id)
          if (bi) boqItems = bi
        } else if (qt?.ref_no) {
          const { data: bHead } = await supabase.from('boqs').select('id').eq('boq_no', qt.ref_no).maybeSingle()
          if (bHead?.id) {
            const { data: bi } = await supabase.from('boq_items').select('*').eq('boq_id', bHead.id)
            if (bi) boqItems = bi
          }
        }

        const qItems = itemsRes.data || []
        const qTaxType = inferQuotationTaxType(qt)
        const vatRate = Number(qt?.vat_rate ?? 7)
        const hasVat = qTaxType !== 'vat_exempt' && vatRate > 0

        const fallbackItemsNet = qItems.reduce((s, i) => {
          const rawPrice = Number(i.unit_price) || 0
          const discPct = Number(i.discount_percent) || 0
          const eff = discPct > 0 ? rawPrice * (1 - discPct / 100) : (i.total_amount ? Number(i.total_amount) / (Number(i.quantity) || 1) : rawPrice)
          return s + eff * (Number(i.quantity) || 1)
        }, 0)
        const rawAfterDisc =
          qt?.after_discount != null
            ? Number(qt.after_discount)
            : fallbackItemsNet

        let subtotalNet = round2(rawAfterDisc)
        let vatAmt = 0
        let grandTotal = round2(rawAfterDisc)

        if (qTaxType === 'vat_included' && hasVat) {
          vatAmt = round2((rawAfterDisc * vatRate) / (100 + vatRate))
          subtotalNet = Math.max(0, round2(rawAfterDisc - vatAmt))
          grandTotal = round2(rawAfterDisc)
        } else if (hasVat) {
          vatAmt = round2(subtotalNet * (vatRate / 100))
          grandTotal = round2(subtotalNet + vatAmt)
        }

        const invData = invRes.data || []
        const rawShortfallItems = shortfallOnly
          ? buildShortfallPrItems({
              quotation: qt || {},
              quotationItems: qItems,
              boqItems,
              inventoryItems: invData,
              mode: 'cost_baseline',
            })
          : qItems

        let activeExistingPrs = []
        let existingPrItems = []
        if (qt?.id) {
          try {
            const prSpecs = buildQuotationPrQuerySpecs(qt)
            if (prSpecs.primaryOr) {
              let prRes = await supabase
                .from('purchase_requisitions')
                .select(prSpecs.primarySelect)
                .or(prSpecs.primaryOr)
                .order('request_date', { ascending: false })
              if (prRes.error && prSpecs.fallbackOr) {
                prRes = await supabase
                  .from('purchase_requisitions')
                  .select(prSpecs.fallbackSelect)
                  .or(prSpecs.fallbackOr)
                  .order('request_date', { ascending: false })
              }
              activeExistingPrs = (prRes.data || []).filter((p) => p && p.status !== 'cancelled')
              const existingPrIds = activeExistingPrs.map((p) => p.id).filter(Boolean)
              if (existingPrIds.length > 0) {
                const piRes = await supabase
                  .from('purchase_requisition_items')
                  .select('*')
                  .in('pr_id', existingPrIds)
                if (!piRes.error && Array.isArray(piRes.data)) {
                  const prNoById = new Map(activeExistingPrs.map((p) => [p.id, p.pr_no]))
                  existingPrItems = piRes.data.map((pi) => ({
                    ...pi,
                    pr_no: prNoById.get(pi.pr_id) || '',
                  }))
                }
              }
            }
          } catch {
            // keep safe empty list
          }
        }
        setExistingQtPrs(activeExistingPrs)

        const prCoverage = shortfallOnly
          ? summarizeQuotationPrCoverage(rawShortfallItems, existingPrItems)
          : { uncoveredItems: rawShortfallItems, uncoveredCount: rawShortfallItems.length }

        const syncObj = {
          quotation: qt || {},
          quotation_no: qt?.quotation_no,
          isApproved: canCreatePrFromQuotation(qt),
          qTaxType,
          subtotalNet,
          hasVat,
          vatRate,
          vatAmt,
          grandTotal,
          rawItems: qItems,
          boqItems,
          inventoryItems: invData,
          shortfallOnly,
          shortfallCount: rawShortfallItems.length,
          uncoveredCount: prCoverage.uncoveredCount,
          existingPrItems,
        }
        setQuotationSync(syncObj)

        if (qt?.quotation_no) {
          const qNoTag = shortfallOnly
            ? `อ้างอิงใบเสนอราคา: ${qt.quotation_no} (ขอซื้อเฉพาะส่วนที่ขาดจากสต็อก)`
            : `อ้างอิงใบเสนอราคา: ${qt.quotation_no}`
          setNotes((prev) => {
            if (!prev) return qNoTag
            if (prev.includes(qt.quotation_no)) return prev
            return `${prev}\n${qNoTag}`
          })
        }

        // ค่าเริ่มต้น: ดึงจากต้นทุน BOQ / สต็อก แทนการเอาราคาขายลูกค้ามาตั้งเป็นราคาซื้อตรงๆ
        applyPriceMode('cost_baseline', syncObj)
      })
    }

    // โหลดรายการวัสดุจากสโตร์ถ้ามีการกดปุ่ม "สั่ง PR" มาจากหน้าสต็อก (?item_id=...)
    const itId = params.get('item_id')
    if (itId && !id && !qId) {
      supabase.from('inventory_items').select('id, item_code, item_name, unit, avg_unit_cost').eq('id', itId).single().then(({ data }) => {
        if (data) {
          setItems([{
            item_name: data.item_name,
            quantity: '1',
            unit: data.unit || 'ชิ้น',
            price: data.avg_unit_cost ? String(data.avg_unit_cost) : '',
            item_id: data.id,
          }])
        }
      })
    }

    if (!id) return
    Promise.all([
      supabase.from('purchase_requisitions').select('*').eq('id', id).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('item_name'),
    ]).then(([a, b]) => {
      if (a.error) return setError('ไม่พบใบขอซื้อ')
      setStatus(a.data.status)
      setProjectId(a.data.project_id || '')
      if (a.data.custom_project_name) {
        setCustomProjectName(a.data.custom_project_name)
        if (!a.data.project_id) setProjectMode('custom')
      }
      if (a.data.customer_name) setCustomerName(a.data.customer_name)
      if (a.data.suggested_vendor) setSuggestedVendor(a.data.suggested_vendor)
      if (a.data.notes) setNotes(a.data.notes)
      setItems((b.data ?? []).map((i) => ({ item_name: i.item_name, quantity: String(i.quantity), unit: i.unit ?? '', price: String(i.estimated_price ?? '') })))
    })
  }, [id, params])

  async function save() {
    setError('')
    const newErrors = {}

    const hasEmptyItem = !items || items.length === 0 || !items.some((i) => i.item_name && i.item_name.trim())
    const hasInvalidQty = items.some((i) => !i.quantity || Number(i.quantity) <= 0 || isNaN(Number(i.quantity)))
    const hasInvalidPrice = items.some((i) => i.price === '' || isNaN(Number(i.price)))

    if (hasEmptyItem || hasInvalidQty || hasInvalidPrice) {
      setShowItemErrors(true)
      newErrors.items = 'รายการวัสดุมีช่องที่ยังไม่กรอก ช่องว่างนะ (กรุณาระบุชื่อ จำนวน และราคาประมาณให้ครบถ้วน)'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setError('ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      return
    }

    setBusy(true)

    try {
      let finalProjectId = projectMode === 'custom' ? null : (projectId || null)
      let finalCustomProjectName = customProjectName.trim()
      if (projectMode === 'select' && projectId) {
        const chosenP = projects.find(p => p.id === projectId)
        if (chosenP) finalCustomProjectName = `${chosenP.project_code} ${chosenP.project_name}`
      }

      const p_items = items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity), unit: i.unit, estimated_price: Number(i.price) || 0 }))
      const { data, error } = id
        ? await supabase.rpc('update_purchase_requisition', { p_pr_id: id, p_project_id: finalProjectId, p_notes: notes || null, p_items })
        : await supabase.rpc('create_purchase_requisition', { p_project_id: finalProjectId, p_notes: notes || null, p_items })

      if (error) throw error

      const targetPrId = id || data
      if (targetPrId) {
        let prPayload = {
          customer_name: customerName.trim() || null,
          custom_project_name: finalCustomProjectName || null,
          suggested_vendor: suggestedVendor.trim() || null,
          quotation_id: salesQuotationId || null,
          sales_quotation_no: salesQuotationNo || null,
          notes: notes || null,
        }
        for (let attempt = 0; attempt < 4; attempt++) {
          const updRes = await supabase.from('purchase_requisitions').update(prPayload).eq('id', targetPrId)
          if (!updRes.error) break
          const msg = updRes.error.message || ''
          if (!msg.includes('does not exist') && !msg.includes('Could not find')) break

          if (msg.includes('quotation_id')) {
            delete prPayload.quotation_id
            continue
          }
          if (msg.includes('sales_quotation_no')) {
            delete prPayload.sales_quotation_no
            continue
          }
          delete prPayload.customer_name
          delete prPayload.custom_project_name
          delete prPayload.suggested_vendor
          const tags = [
            customerName.trim() ? `[ลูกค้า: ${customerName.trim()}]` : '',
            finalCustomProjectName ? `[โครงการ: ${finalCustomProjectName}]` : '',
            suggestedVendor.trim() ? `[ร้านค้าแนะนำ: ${suggestedVendor.trim()}]` : '',
          ].filter(Boolean).join(' ')
          prPayload.notes = (notes ? `${notes}\n${tags}` : tags) || null
        }
      }

      navigate(`/purchasing/pr/${targetPrId}`)
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // ตัวเลือกสำหรับ SearchableSelect
  const projectOptions = [
    { value: '', label: 'ของกลางบริษัท / สต็อกส่วนกลาง (ไม่ระบุโครงการ)', badge: 'ของกลาง', keywords: 'ของกลาง สต็อก ส่วนกลาง' },
    ...projects.map((p) => ({
      value: p.id,
      badge: p.project_code,
      label: `${p.project_code} ${p.project_name}`,
      subLabel: p.project_name,
      keywords: `${p.project_code} ${p.project_name}`,
    })),
  ]

  const customerOptions = customers.map((c) => ({
    value: c.customer_name,
    badge: c.customer_code || 'ลูกค้า',
    label: c.customer_name,
    keywords: `${c.customer_code || ''} ${c.customer_name}`,
  }))

  const vendorOptions = vendors.map((v) => ({
    value: v.vendor_name,
    badge: v.vendor_code,
    label: v.vendor_name,
    keywords: `${v.vendor_code || ''} ${v.vendor_name}`,
  }))

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* แถบนำทางและหัวเรื่อง */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={id ? `/purchasing/pr/${id}` : '/purchasing?tab=pr'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับรายการ PR</span>
          </Link>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {id ? 'แก้ไขใบขอซื้อ (Purchase Requisition)' : 'สร้างใบขอซื้อ (Purchase Requisition)'}
          </h2>
        </div>
      </div>

      {/* กรอบเอกสาร PR รูปแบบเป็นขั้นตอนชัดเจน */}
      <div className="space-y-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm">
        {/* ส่วนหัวเอกสาร (Masthead) */}
        <div className="rounded-xl bg-[#0f172a] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight text-white">ANVA &amp; CO., LTD.</span>
              <span className="rounded bg-sky-500/20 border border-sky-400/30 text-sky-300 px-2 py-0.5 text-[10px] font-bold">
                ใบขอซื้อพัสดุ
              </span>
            </div>
            <p className="text-xs text-slate-400">
              บันทึกความต้องการจัดซื้อวัสดุ/อุปกรณ์โครงการ ส่งต่อฝ่ายจัดซื้อเพื่อเปรียบเทียบราคาและออกใบสั่งซื้อ (PO)
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {id ? 'Mode: Edit PR' : 'Mode: New PR'}
          </div>
        </div>

        {/* 1. โครงการ ลูกค้า และร้านค้าแนะนำ */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 dark:bg-sky-600 text-white text-xs font-bold">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>โครงการ และ คู่ค้า / ผู้ว่าจ้าง</span>
              </h3>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                disabled={status === 'ordered'}
                onClick={() => setProjectMode('select')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  projectMode === 'select'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                เลือกโครงการในระบบ
              </button>
              <button
                type="button"
                disabled={status === 'ordered'}
                onClick={() => setProjectMode('custom')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  projectMode === 'custom'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                พิมพ์ชื่อโครงการเอง
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                โครงการ / จุดประสงค์ *
              </label>
              {projectMode === 'select' ? (
                <SearchableSelect
                  options={projectOptions}
                  value={projectId}
                  disabled={status === 'ordered'}
                  onChange={(val, opt) => {
                    if (opt?.isCustom) {
                      setProjectMode('custom')
                      setCustomProjectName(val)
                      setProjectId('')
                    } else {
                      setProjectId(val)
                      setCustomProjectName(opt?.label || '')
                    }
                  }}
                  allowCustom={true}
                  placeholder="พิมพ์รหัส หรือชื่อโครงการเพื่อค้นหา..."
                  customPlaceholder="กด Enter เพื่อใช้ชื่อโครงการนี้"
                />
              ) : (
                <input
                  type="text"
                  disabled={status === 'ordered'}
                  className="input text-xs"
                  placeholder="พิมพ์ระบุชื่อโครงการ เช่น โครงการติดตั้งโซลาร์สระบุรี"
                  value={customProjectName}
                  onChange={(e) => setCustomProjectName(e.target.value)}
                />
              )}
              {status === 'ordered' && <span className="text-[11px] text-amber-700 dark:text-amber-400 block mt-0.5">ออกใบสั่งซื้อแล้ว เปลี่ยนโครงการไม่ได้</span>}
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
                {projectMode === 'select' ? 'พิมพ์รหัสหรือชื่อเพื่อกรองทันที' : 'พิมพ์ชื่อโครงการเองได้อิสระ'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ลูกค้า / ผู้ว่าจ้าง (Customer / Client)
              </label>
              <SearchableSelect
                options={customerOptions}
                value={customerName}
                onChange={(val) => setCustomerName(val)}
                onCustomChange={(val) => setCustomerName(val)}
                allowCustom={true}
                placeholder="พิมพ์ค้นหาชื่อลูกค้า หรือพิมพ์ชื่อลูกค้าใหม่..."
                customPlaceholder="กด Enter เพื่อใช้ชื่อลูกค้านี้"
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
                ดึงจากสมุดรายชื่อ (Contacts) หรือพิมพ์ใหม่ได้
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ร้านค้าที่แนะนำ (Suggested Vendor)
              </label>
              <SearchableSelect
                options={vendorOptions}
                value={suggestedVendor}
                onChange={(val) => setSuggestedVendor(val)}
                onCustomChange={(val) => setSuggestedVendor(val)}
                allowCustom={true}
                placeholder="พิมพ์ค้นหาร้านค้า หรือพิมพ์ชื่อร้านแนะนำ..."
                customPlaceholder="กด Enter เพื่อใช้ชื่อร้านค้านี้"
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
                ช่วยแนะนำแหล่งซื้อส่งต่อให้ฝ่ายจัดซื้อ
              </span>
            </div>
          </div>

          {/* หมายเหตุพับซ่อนได้เพื่อความมินิมอล */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
            <CollapsibleDetailField
              value={notes}
              onChange={setNotes}
              addLabel="เพิ่มวัตถุประสงค์ / หมายเหตุเพิ่มเติม"
              editLabel="วัตถุประสงค์ / หมายเหตุเพิ่มเติม"
              placeholder="เช่น วัสดุสำหรับเริ่มเทปูนสัปดาห์หน้า หรือ ขอซื้อด่วน"
              rows={2}
            />
          </div>
        </section>

        {/* แจ้งเตือนหากใบเสนอราคานี้เปิด PR ไปแล้ว ป้องกันการเปิดซ้ำ */}
        {existingQtPrs.length > 0 && !id && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-950 dark:text-amber-200 space-y-2 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span>
                  ใบเสนอราคา {quotationSync?.quotation_no || salesQuotationNo} มีใบขอซื้ออยู่แล้ว {existingQtPrs.length} ใบ
                </span>
              </div>
              {quotationSync?.shortfallOnly && !includeAlreadyRequested && (
                <button
                  type="button"
                  onClick={() => {
                    setIncludeAlreadyRequested(true)
                    applyPriceMode(prPriceMode, quotationSync, true)
                  }}
                  className="rounded-lg border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  โหลดรายการที่ขอไปแล้วกลับมาทั้งหมด
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {existingQtPrs.map((existingPr) => (
                <Link
                  key={existingPr.id}
                  to={`/purchasing/pr/${existingPr.id}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 px-2.5 py-1 font-mono font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-slate-700"
                >
                  <span>เปิดดู {existingPr.pr_no}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              {quotationSync?.shortfallOnly && !includeAlreadyRequested
                ? quotationSync.uncoveredCount > 0
                  ? `ระบบคัดกรองออกให้แล้ว เหลือเฉพาะ ${quotationSync.uncoveredCount} รายการที่ยังไม่เคยขอซื้อใน PR เดิม`
                  : 'รายการขาดสต็อกทั้งหมดถูกขอซื้อครบแล้วใน PR ด้านบน — แนะนำให้เปิดดูหรือแก้ไข PR เดิมแทนการสร้างใหม่'
                : 'ตรวจสอบรายการด้านล่างก่อนบันทึกเพื่อหลีกเลี่ยงการขอซื้อซ้ำซ้อน'}
            </p>
          </div>
        )}

        {/* กล่องแสดงการซิงค์ข้อมูลและเลือกโหมดราคากับใบเสนอราคาขาย */}
        {quotationSync && (
          <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 p-4 space-y-2.5 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 dark:border-sky-800/80 pb-2.5">
              <div className="font-bold text-sky-950 dark:text-sky-200 flex items-center gap-1.5 flex-wrap">
                <FileText className="h-4 w-4 text-sky-700 dark:text-sky-400" />
                <span>ซิงค์ข้อมูลจากใบเสนอราคาขาย: <b className="font-mono text-sky-800 dark:text-sky-300">{quotationSync.quotation_no}</b></span>
                {quotationSync.shortfallOnly && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[10px] font-black text-amber-900 dark:text-amber-300">
                    เปิด PR เฉพาะส่วนที่ขาด ({quotationSync.shortfallCount} รายการ)
                  </span>
                )}
                {quotationSync.isApproved === false && (
                  <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-2.5 py-0.5 text-[10px] font-black text-rose-900 dark:text-rose-300">
                    คำเตือน: ใบเสนอราคานี้ยังไม่มีบันทึกการอนุมัติจากลูกค้า
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-sky-200 dark:border-sky-800">
                <button
                  type="button"
                  onClick={() => applyPriceMode('cost_baseline')}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                    prPriceMode === 'cost_baseline' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700'
                  }`}
                  title="ดึงต้นทุนวัสดุจาก BOQ หรือราคาเฉลี่ยคลัง และเว้นช่องที่ไม่รู้ให้กรอกราคาซื้อจริง"
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${prPriceMode === 'cost_baseline' ? 'inline' : 'hidden'}`} />
                  <span>ต้นทุนซื้อจริง (BOQ / สต็อก) · แนะนำ</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPriceMode('net_before_vat')}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                    prPriceMode === 'net_before_vat' ? 'bg-sky-700 text-white shadow-2xs' : 'text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-700'
                  }`}
                  title="ดึงราคาเสนอขายลูกค้า (ก่อน VAT) มาใช้เป็นตัวเลขตั้งต้นอ้างอิง"
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${prPriceMode === 'net_before_vat' ? 'inline' : 'hidden'}`} />
                  <span>ราคาขาย QT ก่อน VAT (฿{baht(quotationSync.subtotalNet)})</span>
                </button>
                {quotationSync.hasVat && (
                  <button
                    type="button"
                    onClick={() => applyPriceMode('with_vat')}
                    className={`px-3 py-1.5 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                      prPriceMode === 'with_vat' ? 'bg-sky-700 text-white shadow-2xs' : 'text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-700'
                    }`}
                    title="ใช้ราคารวม VAT 7% (ระบบจะทำเครื่องหมายให้ PO รู้ว่ารวม VAT แล้ว)"
                  >
                    <CheckCircle2 className={`h-3.5 w-3.5 ${prPriceMode === 'with_vat' ? 'inline' : 'hidden'}`} />
                    <span>รวม VAT 7% (฿{baht(quotationSync.grandTotal)})</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300 text-xs">
              <span>ยอดสินค้าก่อน VAT (ใน QT): <b className="font-mono text-slate-900 dark:text-white">{baht(quotationSync.subtotalNet)}</b> บ.</span>
              {quotationSync.hasVat && (
                <span>VAT {quotationSync.vatRate}% (ใน QT): <b className="font-mono text-slate-900 dark:text-white">+{baht(quotationSync.vatAmt)}</b> บ.</span>
              )}
              <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                ยอดรวมสุทธิ (QT): <b className="font-mono">{baht(quotationSync.grandTotal)}</b> บาท
              </span>
            </div>
            <p className="text-[11px] text-sky-900/80 dark:text-sky-300/80">
              * ระบบแยกราคาขายลูกค้าออกจากราคาขอซื้อจริงให้อัตโนมัติ (ดึงจาก BOQ/สต็อกก่อน หากไม่มีให้กรอกราคาประเมินซื้อจริง โดยแสดงราคาขาย QT กำกับใต้รายการให้เทียบกำไร)
            </p>
            {quotationSync.shortfallOnly && quotationSync.shortfallCount === 0 && (
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                ✓ สต็อกในคลังมีเพียงพอครบทุกรายการแล้ว ไม่มีส่วนที่ขาดสำหรับเปิด PR (สามารถกลับไปกดเบิกจากสต็อกได้ทันที)
              </div>
            )}
          </div>
        )}

        {/* 2. รายการวัสดุ */}
        <section className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 dark:bg-sky-600 text-white text-xs font-bold">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>รายการวัสดุขอซื้อ *</span>
            </h3>
          </div>
          <div>
            <ItemsEditor
              items={items}
              onChange={(newItems) => {
                setItems(newItems)
                if (errors.items) setErrors((prev) => ({ ...prev, items: '' }))
              }}
              priceLabel="ราคาประมาณ/หน่วย"
              showErrors={showItemErrors}
            />
            <FieldError error={errors.items} />
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3 text-xs sm:text-sm font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link
            to={id ? `/purchasing/pr/${id}` : '/purchasing?tab=pr'}
            className="btn-ghost"
          >
            ยกเลิก
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={busy}
          >
            {busy ? 'กำลังบันทึก...' : 'บันทึกใบขอซื้อ'}
          </button>
        </div>
      </div>
    </div>
  )
}