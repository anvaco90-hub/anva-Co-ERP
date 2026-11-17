import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import { getItemVendorHistory } from '../../lib/purchasingHistory'
import { baht } from '../../lib/projects'
import ItemsEditor from './ItemsEditor'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import { FieldError, fieldErrorClass } from '../../components/FieldError'

export const PAYMENT_TYPES = [
  { value: 'credit_30', label: 'เครดิตเทอม 30 วัน (วางบิล-จ่ายเช็ค/โอน)' },
  { value: 'credit_60', label: 'เครดิตเทอม 60 วัน' },
  { value: 'cash', label: 'เงินสด / โอนชำระทันทีเมื่อได้รับของ' },
  { value: 'advance_deposit', label: 'มัดจำล่วงหน้า + จ่ายส่วนที่เหลือเมื่อส่งมอบ' },
  { value: 'cbd', label: 'ชำระเงินล่วงหน้า 100% ก่อนส่งของ (Cash Before Delivery)' },
  { value: 'pdc', label: 'เช็คลงวันที่ล่วงหน้า (Post-Dated Cheque)' },
  { value: 'other', label: 'เงื่อนไขอื่น ๆ (ตามตกลง)' },
]

export const WHT_RATES = [
  { value: '0', label: 'ไม่มีหัก ณ ที่จ่าย (0%)', description: 'ไม่มีภาษีหัก' },
  { value: '1', label: 'หัก 1% (ค่าขนส่ง/ยานพาหนะ)', description: 'ค่าขนส่ง' },
  { value: '2', label: 'หัก 2% (ค่าโฆษณา/ประชาสัมพันธ์)', description: 'ค่าโฆษณา' },
  { value: '3', label: 'หัก 3% (ค่าบริการ / ค่าจ้างทำของ / วิศวกรรม)', description: 'ค่าจ้างบริการ' },
  { value: '5', label: 'หัก 5% (ค่าเช่าทรัพย์สิน / เช่าเครื่องจักร)', description: 'ค่าเช่า' },
]

export default function POForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialPrId = params.get('pr') || ''
  const { profile } = useAuth()

  const [pr, setPr] = useState(null)
  const [po, setPo] = useState(null)
  const [pendingPrs, setPendingPrs] = useState([])
  const [selectedPrId, setSelectedPrId] = useState(initialPrId)
  const [vendors, setVendors] = useState([])
  const [vendorId, setVendorId] = useState('')
  const [vendorSuggestions, setVendorSuggestions] = useState([])
  const [buyerName, setBuyerName] = useState(profile?.full_name || '')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [selectedUsageItem, setSelectedUsageItem] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)

  // ฟิลด์บัญชีและภาษี
  const [paymentType, setPaymentType] = useState('credit_30')
  const [hasDeposit, setHasDeposit] = useState(false)
  const [depositPercent, setDepositPercent] = useState('30')
  const [depositAmount, setDepositAmount] = useState('')
  const [paymentChannelRequested, setPaymentChannelRequested] = useState('transfer') // 'transfer' | 'cheque' | 'cash'
  const [quotationNo, setQuotationNo] = useState('')
  const [quotationDate, setQuotationDate] = useState('')
  const [taxType, setTaxType] = useState('vat_included') // 'vat_included' | 'vat_excluded' | 'vat_exempt'
  const [whtRate, setWhtRate] = useState('0') // '0' | '1' | '2' | '3' | '5'
  const [vendorTaxInvoiceNo, setVendorTaxInvoiceNo] = useState('')
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [duplicateBanner, setDuplicateBanner] = useState(false)
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')

  // โหลดรายชื่อผู้ขายและโครงการ
  useEffect(() => {
    supabase.from('vendors').select('id, vendor_code, vendor_name, phone, tax_id').order('vendor_code').then(({ data }) => setVendors(data ?? []))
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))

    if (!id) {
      supabase.from('purchase_requisitions')
        .select('id, pr_no, request_date, status, project_id, projects(id, project_code, project_name)')
        .eq('status', 'pending')
        .order('request_date', { ascending: false })
        .then(({ data }) => setPendingPrs(data ?? []))
    }

    // โหลดรายการกรณีสร้างซ้ำ (Duplicate PO)
    const dupId = params.get('duplicate_from')
    if (dupId && !id) {
      Promise.all([
        supabase.from('purchase_orders').select('*, projects(id, project_code, project_name)').eq('id', dupId).single(),
        supabase.from('purchase_order_items').select('*').eq('po_id', dupId).order('item_name'),
      ]).then(([dupRes, itemsRes]) => {
        if (dupRes.data) {
          setDuplicateBanner(true)
          if (dupRes.data.project_id) setProjectId(dupRes.data.project_id)
          if (dupRes.data.vendor_id) setVendorId(dupRes.data.vendor_id)
          if (dupRes.data.pr_id) setSelectedPrId(dupRes.data.pr_id)
          setPaymentType(dupRes.data.payment_type || 'credit_30')
          setTaxType(dupRes.data.tax_type || 'vat_included')
          setWhtRate(String(dupRes.data.wht_rate || '0'))
          setDeliveryAddress(dupRes.data.delivery_address || '')
          setNotes(dupRes.data.notes ? `[สำเนาจาก ${dupRes.data.po_no}] ${dupRes.data.notes}` : `[สำเนาจาก ${dupRes.data.po_no}]`)
        }
        if (itemsRes.data && itemsRes.data.length > 0) {
          setItems(itemsRes.data.map((i) => ({
            item_name: i.item_name,
            quantity: String(i.quantity || 1),
            unit: i.unit || 'ชุด',
            price: String(i.unit_price || ''),
            received: 0,
          })))
        }
      })
    }

    // โหลดรายการจากใบเสนอราคา (กรณีส่งต่อจากฝ่ายขาย Quotation -> PO)
    const qId = params.get('quotation_id')
    if (qId && !id) {
      Promise.all([
        supabase.from('quotations').select('*, projects(id, project_code, project_name)').eq('id', qId).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', qId),
      ]).then(([qRes, itemsRes]) => {
        if (qRes.data) {
          if (qRes.data.project_id) setProjectId(qRes.data.project_id)
          setQuotationNo(qRes.data.quotation_no || '')
          setQuotationDate(qRes.data.issue_date || '')
        }
        if (itemsRes.data && itemsRes.data.length > 0) {
          setItems(itemsRes.data.map((i) => ({
            item_name: i.item_name,
            quantity: String(i.quantity || 1),
            unit: i.unit || 'ชุด',
            price: String(i.unit_price || ''),
            received: 0,
          })))
        }
      })
    }
  }, [id, params])

  // โหลดข้อมูลเมื่อเป็นโหมดแก้ไข (id)
  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('purchase_orders').select('*, projects(project_code, project_name), pr:purchase_requisitions(pr_no)').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('po_id', id).order('item_name'),
    ]).then(([a, b]) => {
      if (a.error) return setError('ไม่พบใบสั่งซื้อ')
      if (a.data.status === 'cancelled') return setError('ใบสั่งซื้อที่ยกเลิกแล้วแก้ไขไม่ได้')
      setPo(a.data)
      setVendorId(a.data.vendor_id || '')
      setProjectId(a.data.project_id || '')
      setBuyerName(a.data.buyer_name || profile?.full_name || '')
      setPaymentType(a.data.payment_type || 'credit_30')
      setHasDeposit(a.data.deposit_type === 'deposit')
      setDepositPercent(String(a.data.deposit_percent || '30'))
      setDepositAmount(a.data.deposit_amount ? String(a.data.deposit_amount) : '')
      setPaymentChannelRequested(a.data.payment_channel_requested || 'transfer')
      setQuotationNo(a.data.quotation_no || '')
      setQuotationDate(a.data.quotation_date || '')
      setTaxType(a.data.tax_type || 'vat_included')
      setWhtRate(String(a.data.wht_rate || '0'))
      setVendorTaxInvoiceNo(a.data.vendor_tax_invoice_no || '')
      setTaxInvoiceDate(a.data.tax_invoice_date || '')
      setExpectedDeliveryDate(a.data.expected_delivery_date || '')
      setDeliveryAddress(a.data.delivery_address || '')
      setNotes(a.data.notes || '')
      setItems((b.data ?? []).map((i) => ({
        id: i.id,
        item_name: i.item_name,
        quantity: String(i.quantity),
        unit: i.unit ?? '',
        price: String(i.unit_price),
        received: Number(i.qty_received || 0),
      })))
    })
  }, [id, profile])

  // โหลดข้อมูล PR เมื่อเลือก PR
  const loadPrData = async (prIdToLoad) => {
    if (!prIdToLoad) {
      setPr(null)
      return
    }
    const [a, b] = await Promise.all([
      supabase.from('purchase_requisitions').select('id, pr_no, status, project_id, projects(id, project_code, project_name)').eq('id', prIdToLoad).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', prIdToLoad),
    ])
    if (a.error || a.data.status !== 'pending') {
      return setError('ใบขอซื้อไม่พร้อมสั่งซื้อ (ไม่พบหรือสั่งซื้อไปแล้ว)')
    }
    setPr(a.data)
    setProjectId(a.data.project_id || '')
    setItems((b.data ?? []).map((i) => ({
      item_name: i.item_name,
      quantity: String(i.quantity),
      unit: i.unit ?? '',
      price: String(i.estimated_price || ''),
    })))
  }

  useEffect(() => {
    if (!id && selectedPrId) {
      loadPrData(selectedPrId)
    }
  }, [selectedPrId, id])

  // แนะนำร้านค้าเดิม
  useEffect(() => {
    const validNames = items.map((i) => i.item_name?.trim()).filter(Boolean)
    if (validNames.length === 0) {
      setVendorSuggestions([])
      return
    }

    const primaryName = validNames[0]
    getItemVendorHistory(primaryName).then((records) => {
      const unique = []
      const seen = new Set()
      records.forEach((r) => {
        const v = r.po?.vendor
        if (v && !seen.has(v.id)) {
          seen.add(v.id)
          unique.push({
            vendorId: v.id,
            vendorCode: v.vendor_code,
            vendorName: v.vendor_name,
            phone: v.phone,
            lastPrice: Number(r.unit_price || 0),
            unit: r.unit,
            poNo: r.po?.po_no,
            orderDate: r.po?.order_date,
            itemName: r.item_name,
          })
        }
      })
      setVendorSuggestions(unique)
    })
  }, [items])

  // คำนวณภาษีและยอดสุทธิ
  const rawSubtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0)
  let amountBeforeVat = rawSubtotal
  let vatAmount = 0
  let totalWithVat = rawSubtotal

  if (taxType === 'vat_included') {
    vatAmount = Math.round((rawSubtotal * 7 / 107) * 100) / 100
    amountBeforeVat = Math.round((rawSubtotal - vatAmount) * 100) / 100
    totalWithVat = rawSubtotal
  } else if (taxType === 'vat_excluded') {
    amountBeforeVat = rawSubtotal
    vatAmount = Math.round((rawSubtotal * 0.07) * 100) / 100
    totalWithVat = Math.round((rawSubtotal + vatAmount) * 100) / 100
  } else {
    amountBeforeVat = rawSubtotal
    vatAmount = 0
    totalWithVat = rawSubtotal
  }

  const whtAmount = Math.round((amountBeforeVat * (Number(whtRate) / 100)) * 100) / 100
  const netAmount = Math.round((totalWithVat - whtAmount) * 100) / 100

  // หาข้อมูลผู้ขายที่เลือก เพื่อวิเคราะห์ประเภทแบบภาษี ภ.ง.ด.3 / ภ.ง.ด.53
  const selectedVendor = vendors.find((v) => v.id === vendorId)
  const isJuristicVendor = selectedVendor
    ? /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด/i.test(selectedVendor.vendor_name)
    : true
  const whtFormType = isJuristicVendor ? 'ภ.ง.ด.53 (นิติบุคคล)' : 'ภ.ง.ด.3 (บุคคลธรรมดา)'

  // คำนวณมัดจำสองทิศทาง (Bi-directional calculation)
  const calcDepositAmount = hasDeposit
    ? (depositAmount !== '' ? Number(depositAmount) : Math.round((netAmount * (Number(depositPercent || 0) / 100)) * 100) / 100)
    : 0
  const calcRemainingAmount = hasDeposit
    ? Math.max(0, Math.round((netAmount - calcDepositAmount) * 100) / 100)
    : netAmount

  const handlePercentChange = (val) => {
    setDepositPercent(val)
    const p = parseFloat(val)
    if (!isNaN(p) && netAmount > 0) {
      const amt = Math.round((netAmount * (p / 100)) * 100) / 100
      setDepositAmount(String(amt))
    } else {
      setDepositAmount('')
    }
  }

  const handleAmountChange = (val) => {
    setDepositAmount(val)
    const a = parseFloat(val)
    if (!isNaN(a) && netAmount > 0) {
      const pct = Math.round((a / netAmount * 100) * 100) / 100
      setDepositPercent(String(pct))
    } else {
      setDepositPercent('')
    }
  }

  async function save(sendToAccounting = false) {
    setError('')
    const newErrors = {}

    if (!id && !selectedPrId) {
      newErrors.selectedPrId = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาเลือกใบขอซื้อ PR)'
    }
    if (!vendorId) {
      newErrors.vendorId = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาเลือกผู้ขาย/ร้านค้า)'
    }

    const hasEmptyItem = !items || items.length === 0 || !items.some((i) => i.item_name && i.item_name.trim())
    const hasInvalidQty = items.some((i) => !i.quantity || Number(i.quantity) <= 0 || isNaN(Number(i.quantity)))
    const hasInvalidPrice = items.some((i) => i.price === '' || isNaN(Number(i.price)))

    if (hasEmptyItem || hasInvalidQty || hasInvalidPrice) {
      setShowItemErrors(true)
      newErrors.items = 'รายการวัสดุมีช่องที่ยังไม่กรอก ช่องว่างนะ (กรุณากรอกชื่อ จำนวน และราคาต่อหน่วยให้ครบถ้วน)'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setError('⚠️ ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      return
    }

    setBusy(true)
    const p_items = items.map((i) => ({
      id: i.id,
      item_name: i.item_name,
      quantity: Number(i.quantity),
      unit: i.unit,
      price: Number(i.price) || 0,
    }))

    const extraFields = {
      buyer_name: buyerName,
      payment_type: paymentType,
      deposit_type: hasDeposit ? 'deposit' : 'none',
      deposit_percent: hasDeposit ? (Number(depositPercent) || 0) : 0,
      deposit_amount: calcDepositAmount,
      remaining_amount: calcRemainingAmount,
      payment_channel_requested: paymentChannelRequested,
      payment_status: sendToAccounting ? 'รอชำระเงิน' : (po?.payment_status || 'รอชำระเงิน'),
      quotation_no: quotationNo || null,
      quotation_date: quotationDate || null,
      tax_type: taxType,
      vat_rate: taxType === 'vat_exempt' ? 0 : 7,
      vat_amount: vatAmount,
      wht_rate: Number(whtRate),
      wht_amount: whtAmount,
      net_amount: netAmount,
      vendor_tax_invoice_no: vendorTaxInvoiceNo || null,
      tax_invoice_date: taxInvoiceDate || null,
      expected_delivery_date: expectedDeliveryDate || null,
      delivery_address: deliveryAddress || null,
      notes: notes || null,
      project_id: projectId || pr?.project_id || null,
    }

    try {
      if (id) {
        const { error: updErr } = await supabase.rpc('update_purchase_order', {
          p_po_id: id,
          p_vendor_id: vendorId,
          p_items,
        })
        if (updErr) throw updErr
        await supabase.from('purchase_orders').update(extraFields).eq('id', id)
        navigate(`/purchasing/po/${id}`)
      } else {
        if (!selectedPrId) throw new Error('กรุณาเลือกใบขอซื้อ (PR)')
        const { data: newId, error: insErr } = await supabase.rpc('create_purchase_order', {
          p_pr_id: selectedPrId,
          p_project_id: projectId || pr?.project_id || null,
          p_vendor_id: vendorId,
          p_items,
        })
        if (insErr) throw insErr
        if (newId) {
          await supabase.from('purchase_orders').update(extraFields).eq('id', newId)
        }
        navigate(`/purchasing/po/${newId}`)
      }
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const ready = vendorId && itemsValid(items) && (id ? po : pr)
  const hasReceived = items.some((i) => Number(i.received) > 0)

  return (
    <div className="max-w-4xl space-y-4">
      {duplicateBanner && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <div>
              <b>สร้างซ้ำจากใบสั่งซื้อเดิมเรียบร้อย!</b>
              <p className="text-blue-700 text-[11px]">ระบบคัดลอกข้อมูลร้านค้า โครงการ เงื่อนไข และรายการสินค้าเดิมมาให้แล้ว คุณสามารถปรับแก้จำนวน ราคา หรือเลือก PR ใหม่ได้</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDuplicateBanner(false)}
            className="text-xs text-blue-700 hover:text-blue-900 underline font-semibold cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {id ? `แก้ไขใบสั่งซื้อ ${po?.po_no ?? ''}` : params.get('duplicate_from') ? 'สร้างซ้ำใบสั่งซื้อ (Duplicate PO)' : 'สร้างใบสั่งซื้อ (PO)'}
        </h2>
        <Link to="/purchasing?tab=po" className="text-xs text-steel-500 hover:underline">← กลับไปรายการใบสั่งซื้อ</Link>
      </div>

      <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
        {/* เลือกหรือแสดง PR & โครงการ */}
        {id ? (
          <div className="border-b border-steel-100 pb-3">
            <div className="text-xs text-steel-500">อ้างอิงใบขอซื้อ (PR):</div>
            <div className="font-semibold text-sky-700">{po?.pr?.pr_no || 'สั่งตรง'}</div>
            <div className="mt-1 text-sm">
              โครงการ (Project Cost Center): <b>{po?.projects ? `${po.projects.project_code} ${po.projects.project_name}` : '🏢 ของกลางบริษัท / สต็อกส่วนกลาง'}</b>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink">
                เลือกใบขอซื้อ (PR) ที่ต้องการสั่งซื้อ *
                <select
                  className={fieldErrorClass(errors.selectedPrId, 'input mt-1')}
                  value={selectedPrId}
                  onChange={(e) => {
                    setSelectedPrId(e.target.value)
                    if (errors.selectedPrId) setErrors((prev) => ({ ...prev, selectedPrId: '' }))
                  }}
                >
                  <option value="">-- เลือกใบขอซื้อ (PR ที่รอสั่งซื้อ) --</option>
                  {pendingPrs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.pr_no} · {p.projects ? `${p.projects.project_code} ${p.projects.project_name}` : '🏢 ของกลางบริษัท'} ({p.request_date})
                    </option>
                  ))}
                </select>
              </label>
              <FieldError error={errors.selectedPrId} />
              {pendingPrs.length === 0 && !selectedPrId && (
                <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  ⚠️ ขณะนี้ไม่มีใบขอซื้อ (PR) ที่รอสั่งซื้อในระบบ — กรุณา{' '}
                  <Link to="/purchasing/pr/new" className="font-bold underline text-amber-900">สร้างใบขอซื้อ (PR)</Link> ก่อนออกใบสั่งซื้อ
                </div>
              )}
            </div>

            {/* Project Selector Override */}
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                โครงการที่ตัดต้นทุน (Project Cost Center - P&L Allocation)
              </label>
              <select
                className="input text-xs"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">-- ของกลางบริษัท / สต็อกส่วนกลาง --</option>
                {projects.map((pj) => (
                  <option key={pj.id} value={pj.id}>{pj.project_code} - {pj.project_name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ข้อมูลผู้ซื้อ และ ร้านค้า */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">
                ผู้ขาย / ร้านค้า *
                <select
                  className={fieldErrorClass(errors.vendorId, 'input mt-1')}
                  value={vendorId}
                  onChange={(e) => {
                    setVendorId(e.target.value)
                    if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: '' }))
                  }}
                >
                  <option value="">-- เลือกผู้ขาย --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.vendor_code} {v.vendor_name}</option>
                  ))}
                </select>
              </label>
              <FieldError error={errors.vendorId} />
            </div>

            <label className="block text-sm font-medium text-ink">
              ผู้สั่งซื้อ (จัดซื้อ)
              <input
                type="text"
                className="input mt-1"
                placeholder="ระบุชื่อผู้ดำเนินการสั่งซื้อ"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </label>
          </div>

          {/* แถบแนะนำร้านค้าเดิม */}
          {vendorSuggestions.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <div className="font-bold flex items-center gap-1.5">
                <span>🏪 ร้านค้าเดิมที่เคยสั่งซื้อวัสดุนี้มาก่อน (คลิกเพื่อเลือกใช้):</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {vendorSuggestions.map((vs) => {
                  const isSelected = vendorId === vs.vendorId
                  return (
                    <button
                      key={vs.vendorId}
                      type="button"
                      onClick={() => setVendorId(vs.vendorId)}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition border shadow-sm ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-400 font-bold'
                          : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      <span>📍 {vs.vendorName}</span>
                      <span className="font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded text-[11px]">
                        ราคาเดิม {baht(vs.lastPrice)} บ.
                      </span>
                      {isSelected ? <span className="ml-1 text-white">✓ กำลังเลือก</span> : <span className="ml-1 underline font-semibold">เลือกร้านนี้</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ข้อมูลการชำระเงิน เงื่อนไขมัดจำ และ ใบเสนอราคา */}
        <div className="rounded-lg border border-steel-200 bg-steel-50/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/80 pb-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">
              💳 เงื่อนไขการชำระเงิน และ ใบเสนอราคา (Payment Terms & Quotation)
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-steel-600 font-medium">เงื่อนไขมัดจำ:</span>
              <button
                type="button"
                onClick={() => setHasDeposit(false)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition border ${
                  !hasDeposit
                    ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                    : 'bg-white text-steel-700 border-steel-300 hover:bg-steel-100'
                }`}
              >
                ไม่มีมัดจำ (Full Payment)
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasDeposit(true)
                  if (!depositAmount && netAmount > 0) {
                    const amt = Math.round((netAmount * (Number(depositPercent || 30) / 100)) * 100) / 100
                    setDepositAmount(String(amt))
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition border ${
                  hasDeposit
                    ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                    : 'bg-white text-steel-700 border-steel-300 hover:bg-steel-100'
                }`}
              >
                มีมัดจำ (Deposit / Installment)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                ประเภทการชำระเงิน *
              </label>
              <select
                className="input text-xs"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
              >
                {PAYMENT_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                เลขที่ใบเสนอราคา (Quotation No.)
              </label>
              <input
                className="input text-xs"
                placeholder="เช่น QT-2026-089"
                value={quotationNo}
                onChange={(e) => setQuotationNo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                วันที่ใบเสนอราคา
              </label>
              <input
                type="date"
                className="input text-xs"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
              />
            </div>
          </div>

          {/* รายละเอียดมัดจำ vs จ่ายเต็มจำนวน */}
          {!hasDeposit ? (
            /* กรณีไม่มีมัดจำ (Full Payment) */
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-sky-900 block">💵 เงื่อนไขชำระเต็มจำนวน (Full Payment)</span>
                  <span className="text-[11px] text-sky-700">ชำระยอดรวมทั้งสิ้นหลังจากตรวจรับของหรือตามเครดิตเทอม</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-sky-700 block uppercase font-semibold">ยอดสุทธิที่ต้องชำระ (Net Payable)</span>
                  <span className="text-base font-extrabold text-sky-900 font-mono">{baht(netAmount)} บาท</span>
                </div>
              </div>

              <div className="pt-2 border-t border-sky-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-steel-700">ช่องทางที่ขอเบิกจ่าย:</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'transfer', label: '🏦 เงินโอน', icon: '↗️' },
                      { id: 'cheque', label: '📝 เช็คสั่งจ่าย', icon: '✍️' },
                      { id: 'cash', label: '💵 เงินสด', icon: '🪙' },
                    ].map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setPaymentChannelRequested(ch.id)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                          paymentChannelRequested === ch.id
                            ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                            : 'bg-white text-steel-700 border-steel-200 hover:bg-sky-50'
                        }`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[11px] text-sky-800 font-medium">
                  สถานะเมื่อบันทึก: <b className="text-amber-800">รอชำระเงิน (ส่งเรื่องไปยังฝ่ายบัญชี)</b>
                </span>
              </div>
            </div>
          ) : (
            /* กรณีมีมัดจำ (Deposit / Installment) - Bi-directional calculation */
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-900">
                    💰 ระบุเงื่อนไขมัดจำ (Bi-directional Auto-Calculating)
                  </span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-bold">
                    คำนวณอัตโนมัติ 2 ทิศทาง
                  </span>
                </div>
                <span className="text-xs text-steel-600">
                  ฐานยอดสุทธิ: <b className="font-mono text-ink">{baht(netAmount)}</b> บาท
                </span>
              </div>

              {/* ช่องกรอกสองทิศทาง: % มัดจำ vs ยอดเงินบาท */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-white rounded-lg border border-amber-200">
                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">
                    สัดส่วนมัดจำ (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      placeholder="เช่น 30"
                      value={depositPercent}
                      onChange={(e) => handlePercentChange(e.target.value)}
                      className="input text-xs font-bold font-mono pr-7 text-amber-950"
                    />
                    <span className="absolute right-2.5 top-2 text-xs font-bold text-steel-400">%</span>
                  </div>
                  <span className="text-[10px] text-amber-700 mt-0.5 block">
                    กรอก % เพื่อแปลงเป็นยอดเงินบาทอัตโนมัติ
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">
                    ยอดเงินมัดจำงวดแรก (บาท)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max={netAmount}
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className="input text-xs font-bold font-mono text-amber-950 pr-8"
                    />
                    <span className="absolute right-2.5 top-2 text-xs font-bold text-steel-400">บาท</span>
                  </div>
                  <span className="text-[10px] text-amber-700 mt-0.5 block">
                    หรือกรอกยอดเงินบาท เพื่อแปลงกลับเป็น % อัตโนมัติ
                  </span>
                </div>
              </div>

              {/* การ์ดสรุปยอดมัดจำ vs ยอดคงเหลือ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* การ์ดที่ 1: ยอดมัดจำงวดแรก */}
                <div className="rounded-lg bg-amber-100/70 border border-amber-300 p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-amber-900 block">
                      1. ยอดชำระมัดจำงวดแรก (First Deposit)
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                      {depositPercent || 0}%
                    </span>
                  </div>
                  <div className="mt-1.5 text-lg font-black text-amber-950 font-mono">
                    {baht(calcDepositAmount)} <span className="text-xs font-normal">บาท</span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-amber-200/80">
                    <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                      ช่องทางขอเบิกจ่ายงวดแรก:
                    </label>
                    <div className="flex gap-1">
                      {[
                        { id: 'transfer', label: 'เงินโอน' },
                        { id: 'cheque', label: 'เช็ค' },
                        { id: 'cash', label: 'เงินสด' },
                      ].map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setPaymentChannelRequested(ch.id)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition border ${
                            paymentChannelRequested === ch.id
                              ? 'bg-amber-700 text-white border-amber-800'
                              : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* การ์ดที่ 2: ยอดชำระคงเหลือ */}
                <div className="rounded-lg bg-white border border-steel-200 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-steel-700 block">
                        2. ยอดชำระคงเหลือ (Remaining Amount)
                      </span>
                      <span className="text-[10px] font-semibold text-steel-500 bg-steel-100 px-1.5 py-0.5 rounded">
                        {Math.max(0, 100 - Number(depositPercent || 0))}%
                      </span>
                    </div>
                    <div className="mt-1.5 text-lg font-black text-sky-900 font-mono">
                      {baht(calcRemainingAmount)} <span className="text-xs font-normal">บาท</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-steel-100 text-[11px] text-steel-500">
                    ชำระเมื่อส่งมอบสินค้าครบถ้วน หรือตามรอบวางบิล-จ่ายเงิน
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* กำหนดส่งมอบและสถานที่ส่งมอบ (Due Date & Delivery Information) */}
        <div className="rounded-xl border border-steel-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-steel-100 pb-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-800 flex items-center gap-1.5">
              <span>🚚</span>
              <span>กำหนดส่งมอบและสถานที่จัดส่ง (Delivery & Due Date)</span>
            </h4>
            <span className="text-[11px] text-steel-500">สำหรับระบบติดตามวันครบกำหนด</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-steel-800 mb-1">
                📅 วันที่กำหนดส่งมอบ / ครบกำหนด (Due Date)
              </label>
              <input
                type="date"
                className="input text-xs"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-[10px] text-steel-500 mr-1 self-center">ปุ่มลัด:</span>
                {[
                  { label: '+3 วัน', days: 3 },
                  { label: '+7 วัน (1 สัปดาห์)', days: 7 },
                  { label: '+15 วัน', days: 15 },
                  { label: '+30 วัน (1 เดือน)', days: 30 },
                ].map((s) => (
                  <button
                    key={s.days}
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + s.days)
                      setExpectedDeliveryDate(d.toISOString().split('T')[0])
                    }}
                    className="rounded bg-steel-100 hover:bg-steel-200 px-2 py-0.5 text-[10px] font-semibold text-steel-700 transition cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-steel-800 mb-1">
                📍 สถานที่ส่งมอบสินค้า / ที่อยู่จัดส่งหน้างาน
              </label>
              <input
                type="text"
                placeholder="เช่น สโตร์หลักสำนักงานใหญ่ หรือ ไซต์งานโครงการตามที่ระบุ"
                className="input text-xs"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <span className="text-[10px] text-steel-500 mt-1 block">
                จะนำไปแสดงในใบสั่งซื้อและป้ายจ่าหน้าซองพัสดุ
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-steel-800 mb-1">
                📝 ข้อตกลงและหมายเหตุเพิ่มเติมสำหรับผู้ขาย
              </label>
              <textarea
                rows={2}
                placeholder="เช่น ส่งของช่วงเวลา 09:00 - 16:00 น., กรุณาติดต่อหัวหน้าช่างก่อนเข้าส่ง 1 วัน"
                className="input text-xs leading-relaxed"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* รายการสั่งซื้อ */}
        <div className="text-sm font-medium text-ink pt-2">
          <div className="flex items-center justify-between mb-1">
            <span>รายการสั่งซื้อ *</span>
            {items.some((it) => it.item_name?.trim()) && (
              <button
                type="button"
                onClick={() => setSelectedUsageItem({ item_name: items[0].item_name })}
                className="text-xs text-sky-600 hover:underline flex items-center gap-1"
              >
                <span>📊 ดูประวัติโครงการที่เคยใช้วัสดุนี้</span>
              </button>
            )}
          </div>
          <div className="mt-1 font-normal">
            <ItemsEditor
              items={items}
              onChange={(newItems) => {
                setItems(newItems)
                if (errors.items) setErrors((prev) => ({ ...prev, items: '' }))
              }}
              priceLabel="ราคา/หน่วย"
              showErrors={showItemErrors}
            />
            <FieldError error={errors.items} />
          </div>
        </div>

        {/* การระบุภาษีและเอกสารกำกับภาษี (Tax & Accounting Specification) */}
        <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm space-y-4">
          <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">🧾 การระบุภาษีและเอกสารทางบัญชี</h4>

          {/* ฟิลด์เลขที่ใบกำกับภาษีผู้ขาย (บังคับเมื่อมี VAT) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-200">
            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                เลขที่ใบกำกับภาษีอ้างอิงของผู้ขาย (Vendor Tax Invoice No.) {taxType !== 'vat_exempt' && <span className="text-red-600">*</span>}
              </label>
              <input
                type="text"
                placeholder="เช่น INV-SCG-889021"
                className="input text-xs bg-white font-mono"
                value={vendorTaxInvoiceNo}
                onChange={(e) => setVendorTaxInvoiceNo(e.target.value)}
              />
              <span className="text-[10px] text-amber-700 mt-0.5 block">จำเป็นสำหรับลงบัญชีภาษีซื้อ (Input VAT) และ ภ.พ.30</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                วันที่ใบกำกับภาษี {taxType !== 'vat_exempt' && <span className="text-red-600">*</span>}
              </label>
              <input
                type="date"
                className="input text-xs bg-white"
                value={taxInvoiceDate}
                onChange={(e) => setTaxInvoiceDate(e.target.value)}
              />
              <span className="text-[10px] text-amber-700 mt-0.5 block">งวดเดือนภาษีจะถูกตัดตามวันที่ระบุนี้</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  ประเภทภาษีมูลค่าเพิ่ม (VAT) *
                </label>
                <select
                  className="input text-xs"
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value)}
                >
                  <option value="vat_included">ราคารวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Included)</option>
                  <option value="vat_excluded">ราคาแยกภาษีมูลค่าเพิ่ม +7% (VAT Excluded)</option>
                  <option value="vat_exempt">ไม่มีภาษี / ได้รับยกเว้นภาษี (VAT Exempt 0%)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-steel-700">
                    หักภาษี ณ ที่จ่าย (Withholding Tax - WHT)
                  </label>
                  {Number(whtRate) > 0 && (
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      📋 แบบยื่น: {whtFormType}
                    </span>
                  )}
                </div>
                <select
                  className="input text-xs"
                  value={whtRate}
                  onChange={(e) => setWhtRate(e.target.value)}
                >
                  {WHT_RATES.map((wr) => (
                    <option key={wr.value} value={wr.value}>{wr.label}</option>
                  ))}
                </select>
                <span className="text-[10px] text-steel-500 mt-1 block">
                  ระบบจับคู่อัตโนมัติ: บุคคลธรรมดา $\rightarrow$ ภ.ง.ด.3 / นิติบุคคล $\rightarrow$ ภ.ง.ด.53
                </span>
              </div>
            </div>

            {/* การ์ดสรุปยอดเงิน */}
            <div className="rounded-md border border-steel-200 bg-steel-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-steel-600">
                <span>มูลค่าสินค้าก่อนภาษี:</span>
                <span className="font-semibold">{baht(amountBeforeVat)} บาท</span>
              </div>
              <div className="flex justify-between text-steel-600">
                <span>ภาษีมูลค่าเพิ่ม (VAT {taxType === 'vat_exempt' ? '0' : '7'}%):</span>
                <span className="font-semibold">{baht(vatAmount)} บาท</span>
              </div>
              <div className="flex justify-between font-bold text-ink border-t border-steel-200 pt-1">
                <span>ยอดรวมภาษีมูลค่าเพิ่ม:</span>
                <span>{baht(totalWithVat)} บาท</span>
              </div>
              {Number(whtRate) > 0 && (
                <div className="flex justify-between text-purple-700 font-medium">
                  <span>หัก ณ ที่จ่าย ({whtRate}% - {whtFormType.split(' ')[0]}):</span>
                  <span>- {baht(whtAmount)} บาท</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm text-emerald-900 border-t-2 border-emerald-300 pt-1.5">
                <span>ยอดสุทธิที่ต้องชำระจริง (Net Payable):</span>
                <span>{baht(netAmount)} บาท</span>
              </div>
            </div>
          </div>
        </div>

        {hasReceived && (
          <p className="text-xs text-steel-500">
            * รายการที่รับของแล้ว แก้ได้เฉพาะจำนวน (ห้ามต่ำกว่าที่รับแล้ว) เพื่อให้สต็อกและบัญชีตรงกัน
          </p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-sky-800 transition disabled:opacity-50"
          onClick={() => save(true)}
          disabled={busy}
        >
          <span>🚀</span>
          <span>{busy ? 'กำลังบันทึก...' : 'บันทึกและส่งเรื่องไปยังฝ่ายบัญชี (รอชำระเงิน)'}</span>
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-steel-100 border border-steel-300 px-4 py-2.5 text-sm font-semibold text-steel-700 hover:bg-steel-200 transition disabled:opacity-50"
          onClick={() => save(false)}
          disabled={busy}
        >
          <span>💾</span>
          <span>บันทึกฉบับร่าง</span>
        </button>

        <Link to="/purchasing" className="btn-ghost">ยกเลิก</Link>
      </div>

      {/* Modal ประวัติโครงการที่ใช้วัสดุ */}
      {selectedUsageItem && (
        <ItemProjectUsageModal
          item={selectedUsageItem}
          onClose={() => setSelectedUsageItem(null)}
        />
      )}
    </div>
  )
}
