import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import ItemsEditor from './ItemsEditor'
import { FieldError } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'
import { FileText, CheckCircle2 } from 'lucide-react'

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

  // จัดการการซิงค์ราคาและภาษีจากใบเสนอราคา (Quotation -> PR Sync)
  const [quotationSync, setQuotationSync] = useState(null)
  const [prPriceMode, setPrPriceMode] = useState('with_vat') // 'with_vat' | 'net_before_vat'
  const loadedQuotationRef = useRef(false)

  const applyPriceMode = (mode, syncData = quotationSync) => {
    if (!syncData) return
    setPrPriceMode(mode)
    const vatMultiplier = (mode === 'with_vat' && syncData.hasVat) ? (1 + syncData.vatRate / 100) : 1

    setItems(syncData.rawItems.map((i) => {
      const rawPrice = Number(i.unit_price) || 0
      const discPct = Number(i.discount_percent) || 0
      const baseEffective = discPct > 0 
        ? rawPrice * (1 - discPct / 100) 
        : (i.total_amount && Number(i.quantity) > 0 
            ? Number(i.total_amount) / Number(i.quantity) 
            : rawPrice)
      const finalPrice = Math.round(baseEffective * vatMultiplier * 100) / 100

      return {
        item_name: i.item_name,
        quantity: String(i.quantity || 1),
        unit: i.unit || 'ชุด',
        price: String(finalPrice || ''),
        discount_percent: discPct > 0 ? String(discPct) : '0',
      }
    }))
  }

  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))
    supabase.from('customers').select('id, customer_code, customer_name').order('customer_name').then(({ data }) => setCustomers(data ?? []))
    supabase.from('vendors').select('id, vendor_code, vendor_name').order('vendor_name').then(({ data }) => setVendors(data ?? []))

    // โหลดรายการจากใบเสนอราคาถ้ามีการส่งต่อมา (Quotation -> PR)
    const qId = params.get('quotation_id')
    if (qId && !id && !loadedQuotationRef.current) {
      loadedQuotationRef.current = true
      Promise.all([
        supabase.from('quotations').select('*').eq('id', qId).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', qId),
      ]).then(([qRes, itemsRes]) => {
        if (qRes.data?.project_id) {
          setProjectId(qRes.data.project_id)
          setProjectMode('select')
        }
        if (qRes.data?.customer_name) {
          setCustomerName(qRes.data.customer_name)
        }
        
        const qItems = itemsRes.data || []
        const hasVat = qRes.data?.tax_type !== 'vat_exempt' && Number(qRes.data?.vat_rate ?? 7) > 0
        const vatRate = Number(qRes.data?.vat_rate ?? 7)

        const subtotalNet = qItems.reduce((s, i) => {
          const rawPrice = Number(i.unit_price) || 0
          const discPct = Number(i.discount_percent) || 0
          const eff = discPct > 0 ? rawPrice * (1 - discPct / 100) : (i.total_amount ? Number(i.total_amount) / (Number(i.quantity) || 1) : rawPrice)
          return s + eff * (Number(i.quantity) || 1)
        }, 0)
        const vatAmt = hasVat ? Math.round(subtotalNet * (vatRate / 100) * 100) / 100 : 0
        const grandTotal = Math.round((subtotalNet + vatAmt) * 100) / 100

        const syncObj = {
          quotation_no: qRes.data?.quotation_no,
          subtotalNet,
          hasVat,
          vatRate,
          vatAmt,
          grandTotal,
          rawItems: qItems,
        }
        setQuotationSync(syncObj)

        if (qRes.data?.quotation_no) {
          const qNoTag = `อ้างอิงใบเสนอราคา: ${qRes.data.quotation_no}`
          setNotes((prev) => {
            if (!prev) return qNoTag
            if (prev.includes(qRes.data.quotation_no)) return prev
            return `${prev}\n${qNoTag}`
          })
        }

        // ค่าเริ่มต้น: ซิงค์ราคาตามราคาสุทธิรวมภาษี (ถ้ามี VAT) เพื่อให้ยอด PR ตรงกับยอดรวมทั้งสิ้นของใบเสนอราคา
        applyPriceMode(hasVat ? 'with_vat' : 'net_before_vat', syncObj)
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
          notes: notes || null,
        }
        let updRes = await supabase.from('purchase_requisitions').update(prPayload).eq('id', targetPrId)
        if (updRes.error && updRes.error.message?.includes('does not exist')) {
          delete prPayload.customer_name
          delete prPayload.custom_project_name
          delete prPayload.suggested_vendor
          const tags = [
            customerName.trim() ? `[ลูกค้า: ${customerName.trim()}]` : '',
            finalCustomProjectName ? `[โครงการ: ${finalCustomProjectName}]` : '',
            suggestedVendor.trim() ? `[ร้านค้าแนะนำ: ${suggestedVendor.trim()}]` : '',
          ].filter(Boolean).join(' ')
          prPayload.notes = (notes ? `${notes}\n${tags}` : tags) || null
          await supabase.from('purchase_requisitions').update(prPayload).eq('id', targetPrId)
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
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{id ? 'แก้ไขใบขอซื้อ' : 'สร้างใบขอซื้อ (PR)'}</h2>
        <Link to="/purchasing?tab=pr" className="text-xs text-steel-500 hover:underline">← กลับไปรายการใบขอซื้อ</Link>
      </div>

      <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm border border-steel-200">
        {/* 1. โครงการ และ ลูกค้า (เลือกหรือพิมพ์เองได้) */}
        <div className="rounded-xl border border-steel-200 bg-steel-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-steel-700 flex items-center gap-1.5">
              <span>โครงการ และ ลูกค้า / ผู้ว่าจ้าง</span>
            </span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-steel-200 text-xs">
              <button
                type="button"
                disabled={status === 'ordered'}
                onClick={() => setProjectMode('select')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  projectMode === 'select' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                เลือกโครงการในระบบ
              </button>
              <button
                type="button"
                disabled={status === 'ordered'}
                onClick={() => setProjectMode('custom')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  projectMode === 'custom' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                พิมพ์ชื่อโครงการเอง
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
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
              {status === 'ordered' && <span className="text-[11px] text-amber-700 block mt-0.5">ออกใบสั่งซื้อแล้ว เปลี่ยนโครงการไม่ได้</span>}
              <span className="text-[11px] text-steel-500 mt-1 block">
                {projectMode === 'select' ? 'พิมพ์รหัสหรือชื่อเพื่อกรองทันที ไม่ต้องเลื่อนหา' : 'พิมพ์ชื่อโครงการเองได้อิสระ'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
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
              <span className="text-[11px] text-steel-500 mt-1 block">
                พิมพ์เพื่อค้นหาลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าใหม่ได้อิสระ
              </span>
            </div>
          </div>
        </div>

        {/* 2. ร้านค้าแนะนำ และ หมายเหตุ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-steel-700 mb-1">
              ร้านค้าที่แนะนำ / แหล่งซื้อ (Suggested Store / Vendor)
            </label>
            <SearchableSelect
              options={vendorOptions}
              value={suggestedVendor}
              onChange={(val) => setSuggestedVendor(val)}
              onCustomChange={(val) => setSuggestedVendor(val)}
              allowCustom={true}
              placeholder="พิมพ์ค้นหาร้านค้า หรือพิมพ์ชื่อร้านค้าที่ต้องการแนะนำ..."
              customPlaceholder="กด Enter เพื่อใช้ชื่อร้านค้านี้"
            />
            <span className="text-[11px] text-steel-500 mt-1 block">
              พิมพ์เพื่อค้นหาร้านค้าที่มี หรือพิมพ์ชื่อร้านแนะนำใหม่ส่งต่อให้จัดซื้อ
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-steel-700 mb-1">
              วัตถุประสงค์ / หมายเหตุเพิ่มเติม
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-steel-300 p-2.5 text-xs text-steel-900 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-500 resize-y"
              placeholder="เช่น วัสดุสำหรับเริ่มเทปูนสัปดาห์หน้า หรือ ขอซื้อด่วน"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* กล่องแสดงการซิงค์ข้อมูลและเลือกโหมดราคากับใบเสนอราคา */}
        {quotationSync && (
          <div className="rounded-xl border border-sky-300 bg-sky-50/70 p-4 space-y-2.5 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 pb-2.5">
              <div className="font-bold text-sky-950 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-sky-700" />
                <span>ซิงค์ข้อมูลจากใบเสนอราคา: <b className="font-mono text-sky-800">{quotationSync.quotation_no}</b></span>
              </div>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-sky-200">
                <button
                  type="button"
                  onClick={() => applyPriceMode('with_vat')}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                    prPriceMode === 'with_vat' ? 'bg-sky-700 text-white shadow-2xs' : 'text-sky-700 hover:bg-sky-50'
                  }`}
                  title="ปรับราคาต่อหน่วยให้รวม VAT เพื่อให้ยอดรวม PR ตรงกับยอดสุทธิทั้งสิ้น"
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${prPriceMode === 'with_vat' ? 'inline' : 'hidden'}`} />
                  <span>ราคารวม VAT 7% (฿{baht(quotationSync.grandTotal)} บ.)</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPriceMode('net_before_vat')}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                    prPriceMode === 'net_before_vat' ? 'bg-sky-700 text-white shadow-2xs' : 'text-sky-700 hover:bg-sky-50'
                  }`}
                  title="ใช้ราคาหลังหักส่วนลด แต่ยังไม่รวมภาษีมูลค่าเพิ่ม"
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${prPriceMode === 'net_before_vat' ? 'inline' : 'hidden'}`} />
                  <span>ราคาก่อน VAT (฿{baht(quotationSync.subtotalNet)} บ.)</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-600 text-xs">
              <span>ยอดสินค้าหลังส่วนลด: <b className="font-mono text-slate-900">{baht(quotationSync.subtotalNet)}</b> บ.</span>
              {quotationSync.hasVat && (
                <span>ภาษี VAT {quotationSync.vatRate}%: <b className="font-mono text-slate-900">+{baht(quotationSync.vatAmt)}</b> บ.</span>
              )}
              <span className="text-emerald-800 font-bold">
                ยอดสุทธิทั้งสิ้น: <b className="font-mono">{baht(quotationSync.grandTotal)}</b> บาท
              </span>
            </div>
          </div>
        )}

        {/* 3. รายการวัสดุ */}
        <div className="text-sm font-medium pt-2 border-t border-steel-100">
          รายการวัสดุ *
          <div className="mt-1 font-normal">
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <span></span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกใบขอซื้อ'}</button>
        <Link to={id ? `/purchasing/pr/${id}` : '/purchasing?tab=pr'} className="btn-ghost">ยกเลิก</Link>
      </div>
    </div>
  )
}