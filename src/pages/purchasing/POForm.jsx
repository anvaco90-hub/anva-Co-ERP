import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Upload, Image as ImageIcon, FileText, CheckCircle2, X, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import { getItemVendorHistory } from '../../lib/purchasingHistory'
import { baht } from '../../lib/projects'
import { uploadQuotationFile, openFile } from '../../lib/files'
import ItemsEditor from './ItemsEditor'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'

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
  const [vendorMode, setVendorMode] = useState('select') // 'select' | 'custom'
  const [customVendorName, setCustomVendorName] = useState('')
  const [customVendorPhone, setCustomVendorPhone] = useState('')
  const [customVendorTaxId, setCustomVendorTaxId] = useState('')
  const [customVendorAddress, setCustomVendorAddress] = useState('')

  const [projectMode, setProjectMode] = useState('select') // 'select' | 'custom'
  const [customProjectName, setCustomProjectName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customers, setCustomers] = useState([])

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
  const [quotationUrl, setQuotationUrl] = useState('')
  const [quotationFile, setQuotationFile] = useState(null)
  const [uploadingQuotation, setUploadingQuotation] = useState(false)
  const [taxType, setTaxType] = useState('vat_excluded') // 'vat_excluded' (ราคาแยกภาษี +7% มาตรฐานจัดซื้อ) | 'vat_included' | 'vat_exempt'
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
    supabase.from('customers').select('id, customer_code, customer_name').order('customer_name').then(({ data }) => setCustomers(data ?? []))

    if (!id) {
      supabase.from('purchase_requisitions')
        .select('id, pr_no, request_date, status, project_id, projects(id, project_code, project_name)')
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
          if (dupRes.data.custom_project_name) {
            setCustomProjectName(dupRes.data.custom_project_name)
            if (!dupRes.data.project_id) setProjectMode('custom')
          }
          if (dupRes.data.customer_name) setCustomerName(dupRes.data.customer_name)
          if (dupRes.data.vendor_id) setVendorId(dupRes.data.vendor_id)
          if (dupRes.data.custom_vendor_name) setCustomVendorName(dupRes.data.custom_vendor_name)
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
          if (qRes.data.customer_name) setCustomerName(qRes.data.customer_name)
          setQuotationNo(qRes.data.quotation_no || '')
          setQuotationDate(qRes.data.issue_date || '')
          // ซิงค์ประเภทภาษีจากใบเสนอราคามาให้ตรงกัน (vat_exempt, vat_included, vat_excluded)
          if (qRes.data.vat_rate === 0) {
            setTaxType('vat_exempt')
          } else if (qRes.data.tax_type) {
            setTaxType(qRes.data.tax_type)
          } else {
            setTaxType('vat_excluded')
          }
          if (qRes.data.wht_rate !== undefined && qRes.data.wht_rate !== null) {
            setWhtRate(String(qRes.data.wht_rate))
          }
        }
        if (itemsRes.data && itemsRes.data.length > 0) {
          setItems(itemsRes.data.map((i) => {
            const rawPrice = Number(i.unit_price) || 0
            const discPct = Number(i.discount_percent) || 0
            // คำนวณราคาต่อหน่วยสุทธิหลังหักส่วนลดต่อรายการ
            const effectiveUnitPrice = discPct > 0 
              ? Math.round(rawPrice * (1 - discPct / 100) * 100) / 100 
              : (i.total_amount && Number(i.quantity) > 0 
                  ? Math.round((Number(i.total_amount) / Number(i.quantity)) * 100) / 100 
                  : rawPrice)

            return {
              item_name: i.item_name,
              quantity: String(i.quantity || 1),
              unit: i.unit || 'ชุด',
              price: String(effectiveUnitPrice || ''),
              received: 0,
            }
          }))
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
      setCustomVendorName(a.data.custom_vendor_name || '')
      if (a.data.custom_vendor_name && !a.data.vendor_id) setVendorMode('custom')

      setProjectId(a.data.project_id || '')
      setCustomProjectName(a.data.custom_project_name || '')
      if (a.data.custom_project_name && !a.data.project_id) setProjectMode('custom')

      setCustomerName(a.data.customer_name || '')
      setProjectId(a.data.project_id || '')
      setBuyerName(a.data.buyer_name || profile?.full_name || '')
      setPaymentType(a.data.payment_type || 'credit_30')
      setHasDeposit(a.data.deposit_type === 'deposit')
      setDepositPercent(String(a.data.deposit_percent || '30'))
      setDepositAmount(a.data.deposit_amount ? String(a.data.deposit_amount) : '')
      setPaymentChannelRequested(a.data.payment_channel_requested || 'transfer')
      setQuotationNo(a.data.quotation_no || '')
      setQuotationDate(a.data.quotation_date || '')
      setQuotationUrl(a.data.quotation_url || '')
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
    if (!prIdToLoad || prIdToLoad === 'DIRECT_PO') {
      setPr(null)
      return
    }
    const [a, b] = await Promise.all([
      supabase.from('purchase_requisitions').select('*, projects(id, project_code, project_name)').eq('id', prIdToLoad).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', prIdToLoad),
    ])
    if (a.error) {
      return setError('ไม่พบข้อมูลใบขอซื้อ')
    }
    if (a.data.status !== 'pending') {
      setError(`ℹ️ ใบขอซื้อ ${a.data.pr_no} มีสถานะเป็น "${a.data.status === 'ordered' ? 'สั่งซื้อแล้ว' : a.data.status}" (สามารถใช้ข้อมูลนี้เพื่อออก PO ซ้ำหรือสั่งซื้อเพิ่มเติมได้)`)
    }
    setPr(a.data)
    if (a.data.project_id) {
      setProjectId(a.data.project_id)
      setProjectMode('select')
    } else if (a.data.custom_project_name) {
      setCustomProjectName(a.data.custom_project_name)
      setProjectMode('custom')
    }
    if (a.data.customer_name) {
      setCustomerName(a.data.customer_name)
    }
    if (a.data.suggested_vendor) {
      setCustomVendorName(a.data.suggested_vendor)
      // Check if matches an existing vendor
      const matchedV = vendors.find(v => v.vendor_name.trim().toLowerCase() === a.data.suggested_vendor.trim().toLowerCase())
      if (matchedV) {
        setVendorId(matchedV.id)
        setVendorMode('select')
      } else {
        setVendorMode('custom')
      }
    }
    if (b.data && b.data.length > 0) {
      setItems(b.data.map((i) => ({
        item_name: i.item_name,
        quantity: String(i.quantity),
        unit: i.unit ?? '',
        price: String(i.estimated_price || ''),
      })))
    }
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
  const subtotal = rawSubtotal
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

  const grandTotal = totalWithVat
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

    // PR เป็นตัวเลือก (ถ้าไม่ระบุ ถือเป็นการสั่งซื้อตรง / Direct PO อัตโนมัติ)
    let effectivePrId = selectedPrId
    if (!id && (!effectivePrId || effectivePrId === 'DIRECT_PO')) {
      effectivePrId = 'DIRECT_PO'
    }
    
    if (vendorMode === 'custom') {
      if (!customVendorName.trim()) {
        newErrors.vendorId = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณากรอกชื่อร้านค้า/ผู้ขาย)'
      }
    } else {
      if (!vendorId) {
        newErrors.vendorId = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาเลือกผู้ขาย/ร้านค้า หรือเลือกพิมพ์ชื่อร้านเอง)'
      }
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
      setError('ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      return
    }

    setBusy(true)

    try {
      // 1. จัดการข้อมูลผู้ขาย (Vendor)
      let finalVendorId = vendorId
      let finalCustomVendorName = customVendorName.trim()

      if (vendorMode === 'custom') {
        const matchedV = vendors.find(v => (v.vendor_name || '').trim().toLowerCase() === finalCustomVendorName.toLowerCase())
        if (matchedV) {
          finalVendorId = matchedV.id
        } else {
          try {
            const autoCode = `VEND-${Date.now().toString().slice(-4)}`
            const { data: newV, error: vInsErr } = await supabase.from('vendors').insert({
              vendor_code: autoCode,
              vendor_name: finalCustomVendorName,
              phone: customVendorPhone.trim() || null,
              tax_id: customVendorTaxId.trim() || null,
              address: customVendorAddress.trim() || null,
            }).select().single()

            if (!vInsErr && newV) {
              finalVendorId = newV.id
              setVendors(prev => [...prev, newV])
            }
          } catch (e) {
            console.warn('Auto insert vendor fallback:', e)
          }

          if (!finalVendorId && vendors.length > 0) {
            finalVendorId = vendors[0].id
          }
        }
      } else {
        const chosenV = vendors.find(v => v.id === finalVendorId)
        if (chosenV) finalCustomVendorName = chosenV.vendor_name
      }

      // 2. จัดการโครงการ (Project)
      let finalProjectId = projectMode === 'custom' ? null : (projectId || null)
      let finalCustomProjectName = customProjectName.trim()
      if (projectMode === 'select' && projectId) {
        const chosenP = projects.find(p => p.id === projectId)
        if (chosenP) finalCustomProjectName = `${chosenP.project_code} ${chosenP.project_name}`
      }

      const p_items = items.map((i) => {
        const itemPrice = Number(i.price ?? i.unit_price) || 0
        return {
          id: i.id,
          item_id: i.item_id || null,
          item_name: i.item_name,
          quantity: Number(i.quantity) || 1,
          unit: i.unit || 'รายการ',
          price: itemPrice,
          unit_price: itemPrice,
          pr_item_id: i.pr_item_id || null,
        }
      })

      // อัปโหลดไฟล์ใบเสนอราคาหากมีไฟล์ใหม่
      let finalQuotationUrl = quotationUrl
      if (quotationFile) {
        setUploadingQuotation(true)
        try {
          const upUrl = await uploadQuotationFile(quotationFile)
          if (upUrl) finalQuotationUrl = upUrl
        } catch (err) {
          console.warn('Error uploading quotation:', err)
        }
        setUploadingQuotation(false)
      }

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
        quotation_url: finalQuotationUrl || null,
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
        project_id: finalProjectId || pr?.project_id || null,
        customer_name: customerName.trim() || null,
        custom_project_name: finalCustomProjectName || null,
        custom_vendor_name: finalCustomVendorName || null,
      }

      const applyExtraFields = async (targetId) => {
        let payload = { ...extraFields }
        let res = await supabase.from('purchase_orders').update(payload).eq('id', targetId)
        if (res.error && res.error.message?.includes('does not exist')) {
          if (res.error.message?.includes('quotation_url')) {
            delete payload.quotation_url
          }
          delete payload.customer_name
          delete payload.custom_project_name
          delete payload.custom_vendor_name
          const tags = [
            customerName.trim() ? `[ลูกค้า: ${customerName.trim()}]` : '',
            finalCustomProjectName ? `[โครงการ: ${finalCustomProjectName}]` : '',
            finalCustomVendorName ? `[ร้านค้า: ${finalCustomVendorName}]` : '',
          ].filter(Boolean).join(' ')
          payload.notes = (notes ? `${notes}\n${tags}` : tags) || null
          res = await supabase.from('purchase_orders').update(payload).eq('id', targetId)
        }
        if (res.error) throw res.error
      }

      if (id) {
        let updateSuccess = false
        try {
          const { error: updErr } = await supabase.rpc('update_purchase_order', {
            p_po_id: id,
            p_vendor_id: finalVendorId,
            p_items,
          })
          if (updErr) throw updErr
          updateSuccess = true
        } catch (rpcErr) {
          console.warn('RPC update_purchase_order error, falling back to direct table update:', rpcErr)
          // Fallback อัปเดตรายการตรง
          await supabase.from('purchase_orders').update({
            vendor_id: finalVendorId,
            project_id: finalProjectId || pr?.project_id || null,
            total_amount: subtotal,
            grand_total: grandTotal,
          }).eq('id', id)

          await supabase.from('purchase_order_items').delete().eq('po_id', id)
          const itemsPayload = p_items.map((it) => ({
            po_id: id,
            item_id: it.item_id || null,
            item_name: it.item_name,
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'รายการ',
            unit_price: Number(it.unit_price) || 0,
            total_amount: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
          }))
          const { error: itErr } = await supabase.from('purchase_order_items').insert(itemsPayload)
          if (itErr) console.warn('Direct items update warning:', itErr)
        }
        await applyExtraFields(id)
        navigate(`/purchasing/po/${id}`)
      } else {
        const isDirectPo = !selectedPrId || selectedPrId === 'DIRECT_PO'
        const actualPrId = isDirectPo ? null : selectedPrId
        let newId = null

        try {
          if (!isDirectPo && actualPrId) {
            const { data: rpcNewId, error: insErr } = await supabase.rpc('create_purchase_order', {
              p_pr_id: actualPrId,
              p_project_id: finalProjectId || pr?.project_id || null,
              p_vendor_id: finalVendorId,
              p_items,
            })
            if (insErr) throw insErr
            newId = rpcNewId
          } else {
            throw new Error('Direct PO fallback')
          }
        } catch (rpcErr) {
          console.warn('Using direct PO creation:', rpcErr?.message)

          // Fallback สร้างรหัสเอกสาร PO
          let genPoNo = `PO${new Date().toISOString().slice(2, 4)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
          try {
            const { data: noData } = await supabase.rpc('next_doc_no', { p_prefix: 'PO' })
            if (noData) genPoNo = noData
          } catch (_) {}

          // Fallback บันทึก PO โดยตรง
          const { data: poRows, error: poErr } = await supabase
            .from('purchase_orders')
            .insert({
              po_no: genPoNo,
              pr_id: actualPrId,
              project_id: finalProjectId || pr?.project_id || null,
              vendor_id: finalVendorId,
              order_date: new Date().toISOString().slice(0, 10),
              status: 'open',
              total_amount: subtotal,
              grand_total: grandTotal,
            })
            .select('id')

          if (poErr) throw poErr
          newId = poRows?.[0]?.id

          if (newId) {
            // Fallback บันทึกรายการสินค้าใน PO (ลองแบบมี pr_item_id ก่อน ถ้าไม่มีคอลัมน์ให้ตัดออก)
            const baseItems = p_items.map((it) => ({
              po_id: newId,
              item_id: it.item_id || null,
              item_name: it.item_name,
              quantity: Number(it.quantity) || 1,
              unit: it.unit || 'รายการ',
              unit_price: Number(it.unit_price) || 0,
              total_amount: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
            }))

            try {
              const itemsWithPr = baseItems.map((it, idx) => ({
                ...it,
                pr_item_id: p_items[idx]?.pr_item_id || null,
              }))
              const { error: itErr1 } = await supabase.from('purchase_order_items').insert(itemsWithPr)
              if (itErr1) throw itErr1
            } catch (itErr) {
              console.warn('Retrying insert purchase_order_items without pr_item_id:', itErr)
              const { error: itErr2 } = await supabase.from('purchase_order_items').insert(baseItems)
              if (itErr2) console.warn('Could not insert items directly:', itErr2)
            }

            // อัปเดตสถานะ PR เป็น ordered ถ้ามี PR ผูกไว้
            if (actualPrId) {
              await supabase.from('purchase_requisitions').update({ status: 'ordered', updated_at: new Date().toISOString() }).eq('id', actualPrId)
            }
          }
        }

        if (newId) {
          await applyExtraFields(newId)
          navigate(`/purchasing/po/${newId}`)
        } else {
          throw new Error('ไม่สามารถสร้างรหัสใบสั่งซื้อ (PO) ได้')
        }
      }
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const hasVendor = vendorMode === 'custom' ? Boolean(customVendorName.trim()) : Boolean(vendorId)
  const isDirectPo = !selectedPrId || selectedPrId === 'DIRECT_PO'
  const ready = hasVendor && itemsValid(items) && (id ? po : (isDirectPo || pr || items.length > 0))
  const hasReceived = items.some((i) => Number(i.received) > 0)

  // ตัวเลือกสำหรับ SearchableSelect ในการพิมพ์ค้นหา (เพิ่มตัวเลือกสั่งซื้อตรง และค้นหา PR ได้ทุกสถานะ)
  const prOptions = [
    {
      value: 'DIRECT_PO',
      badge: 'สั่งซื้อตรง',
      label: 'สั่งซื้อตรง / จัดซื้อด่วน (ไม่ต้องอ้างอิงใบขอซื้อ PR)',
      subLabel: 'กรอกโครงการ ผู้จำหน่าย และรายการพัสดุเพื่อออก PO ได้ทันทีโดยไม่ต้องมี PR',
      keywords: 'สั่งตรง ด่วน จัดซื้อตรง ไม่ใช้pr direct po ไม่มีpr 006 direct',
    },
    ...pendingPrs.map((p) => {
      const isOrdered = p.status === 'ordered'
      const statusText = isOrdered ? 'สั่งซื้อแล้ว' : p.status === 'pending' ? 'รอสั่งซื้อ' : p.status
      return {
        value: p.id,
        badge: p.pr_no,
        label: `${p.pr_no} [${statusText}] · ${p.projects ? `${p.projects.project_code} ${p.projects.project_name}` : 'ของกลางบริษัท'}`,
        subLabel: `วันที่ขอ: ${p.request_date} ${p.projects ? `(โครงการ: ${p.projects.project_name})` : ''}`,
        keywords: `${p.pr_no} ${p.pr_no.replace(/[^0-9]/g, '')} ${p.projects?.project_code || ''} ${p.projects?.project_name || ''} ${p.request_date}`,
      }
    }),
  ]

  const projectOptions = [
    { value: '', label: 'ของกลางบริษัท / สต็อกส่วนกลาง (ไม่ระบุโครงการ)', badge: 'ของกลาง', keywords: 'ของกลาง สต็อก ส่วนกลาง' },
    ...projects.map((pj) => ({
      value: pj.id,
      badge: pj.project_code,
      label: `${pj.project_code} - ${pj.project_name}`,
      subLabel: pj.project_name,
      keywords: `${pj.project_code} ${pj.project_name}`,
    })),
  ]

  const vendorOptions = vendors.map((v) => ({
    value: v.id,
    badge: v.vendor_code,
    label: v.vendor_name,
    subLabel: [v.phone ? `โทร: ${v.phone}` : '', v.tax_id ? `เลขภาษี: ${v.tax_id}` : ''].filter(Boolean).join(' · '),
    keywords: `${v.vendor_code} ${v.vendor_name} ${v.phone || ''} ${v.tax_id || ''}`,
  }))

  const customerOptions = customers.map((c) => ({
    value: c.customer_name,
    badge: c.customer_code || 'ลูกค้า',
    label: c.customer_name,
    keywords: `${c.customer_code || ''} ${c.customer_name}`,
  }))

  const paymentOptions = PAYMENT_TYPES.map((pt) => ({
    value: pt.value,
    label: pt.label,
    keywords: pt.label,
  }))

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {duplicateBanner && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 p-3.5 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg"></span>
            <div>
              <b>สร้างซ้ำจากใบสั่งซื้อเดิมเรียบร้อย!</b>
              <p className="text-blue-700 dark:text-blue-300 text-[11px]">ระบบคัดลอกข้อมูลร้านค้า โครงการ เงื่อนไข และรายการสินค้าเดิมมาให้แล้ว คุณสามารถปรับแก้จำนวน ราคา หรือเลือก PR ใหม่ได้</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDuplicateBanner(false)}
            className="text-xs text-blue-700 dark:text-blue-300 hover:text-blue-900 underline font-semibold cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span></span>
          <span>{id ? `แก้ไขใบสั่งซื้อ ${po?.po_no ?? ''}` : params.get('duplicate_from') ? 'สร้างซ้ำใบสั่งซื้อ (Duplicate PO)' : 'ออกใบสั่งซื้อ (Purchase Order - PO)'}</span>
        </h2>
        <Link to="/purchasing?tab=po" className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline">
          ← กลับไปรายการใบสั่งซื้อ
        </Link>
      </div>

      {/* ========================================================================= */}
      {/* กล่องเอกสารใบสั่งซื้อรูปแบบกระดาษ (Paper Receipt / Invoice Sheet Layout) */}
      {/* ========================================================================= */}
      <div className="space-y-6 rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-md">
        
        {/* 1. ส่วนหัวกระดาษเอกสาร (Company Brand & Document Title) */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b-2 border-steel-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                ANVA & CO., LTD.
              </span>
              <span className="rounded bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 px-1.5 py-0.5 text-[10px] font-bold">
                สำนักงานใหญ่
              </span>
            </div>
            <p className="text-xs text-steel-600 dark:text-slate-400 font-medium mt-0.5">
              บริษัท อันวาแอนด์โค จำกัด (ระบบบริหารงานวิศวกรรมและโครงการก่อสร้าง)
            </p>
            <p className="text-[11px] text-steel-500 dark:text-slate-400 mt-1">
              ผู้สั่งซื้อ: <b className="text-slate-800 dark:text-slate-200">{buyerName || profile?.full_name || 'ฝ่ายจัดซื้อ'}</b>
            </p>
          </div>

          <div className="sm:text-right bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 min-w-[240px]">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
              ใบสั่งซื้อ / PURCHASE ORDER
            </div>
            <div className="font-mono text-base font-black text-slate-900 dark:text-white mt-0.5">
              {po?.po_no || 'PO2026-XXXX (สร้างใหม่อัตโนมัติ)'}
            </div>
            <div className="text-[11px] text-steel-500 dark:text-slate-400 mt-1">
              วันที่: <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{new Date().toLocaleDateString('th-TH')}</span>
            </div>
          </div>
        </div>
        {/* เลือกรหัส PR อ้างอิง (กรณีสร้าง PO ใหม่) - ใช้ SearchableSelect พิมพ์ค้นหาได้ทันที */}
        {!id && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
              <label className="block text-sm font-medium text-ink">
                เลือกใบขอซื้อ (PR) หรือ สั่งซื้อตรง (Direct PO)
              </label>
              <button
                type="button"
                onClick={() => {
                  setSelectedPrId('DIRECT_PO')
                  if (errors.selectedPrId) setErrors((prev) => ({ ...prev, selectedPrId: '' }))
                }}
                className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline cursor-pointer flex items-center gap-1"
              >
                <span></span>
                <span>คลิกเพื่อสั่งซื้อตรง (ไม่ต้องอ้างอิง PR)</span>
              </button>
            </div>
            <SearchableSelect
              options={prOptions}
              value={selectedPrId}
              onChange={(val) => {
                setSelectedPrId(val)
                if (errors.selectedPrId) setErrors((prev) => ({ ...prev, selectedPrId: '' }))
              }}
              placeholder="พิมพ์เลขที่ PR, รหัสโครงการ หรือเลือก 'สั่งซื้อตรง'..."
              error={errors.selectedPrId}
              emptyActionLabel="สั่งซื้อตรงทันที (Direct PO ไม่ต้องอ้างอิง PR)"
              onEmptyAction={() => {
                setSelectedPrId('DIRECT_PO')
                if (errors.selectedPrId) setErrors((prev) => ({ ...prev, selectedPrId: '' }))
              }}
            />
            {selectedPrId === 'DIRECT_PO' ? (
              <div className="mt-2 rounded-lg bg-sky-50 border border-sky-200 p-2.5 text-xs text-sky-900 font-medium flex items-center justify-between">
                <span>โหมดสั่งซื้อตรง (Direct PO): คุณสามารถกรอกโครงการ ผู้ขาย และรายการวัสดุเพื่อออกใบสั่งซื้อได้ทันที</span>
                <button
                  type="button"
                  onClick={() => setSelectedPrId('')}
                  className="text-sky-700 font-bold hover:underline ml-2"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-steel-500">
                สามารถเลือกใบขอซื้อ (PR) ในระบบ หรือเลือก <b>"สั่งซื้อตรง"</b> เพื่อออกใบสั่งซื้อโดยไม่ต้องผ่าน PR ได้ทันที
              </p>
            )}
          </div>
        )}

        {id && (
          <div className="border-b border-steel-100 pb-3">
            <div className="text-xs text-steel-500">อ้างอิงใบขอซื้อ (PR):</div>
            <div className="font-semibold text-sky-700">{po?.pr?.pr_no || 'สั่งตรง'}</div>
          </div>
        )}

        {/* ข้อมูล 2 ฝั่งเหมือนใบสั่งซื้อกระดาษ: ผู้จำหน่าย / ร้านค้า (ซ้าย) vs โครงการ & ผู้สั่งซื้อ (ขวา) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. โครงการ และ ลูกค้า/ผู้ว่าจ้าง (สามารถพิมพ์ค้นหาหรือพิมพ์สร้างใหม่ได้ในช่องเดียวกัน) */}
        <div className="rounded-xl border border-steel-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-steel-700 flex items-center gap-1.5">
              <span></span>
              <span>โครงการ และ ลูกค้า / ผู้ว่าจ้าง (Project & Customer)</span>
            </span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-steel-200 text-xs">
              <button
                type="button"
                onClick={() => setProjectMode('select')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  projectMode === 'select' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                เลือกโครงการในระบบ
              </button>
              <button
                type="button"
                onClick={() => setProjectMode('custom')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  projectMode === 'custom' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                ️ พิมพ์ชื่อโครงการเอง
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ฟิลด์โครงการ (Searchable & Typeable) */}
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                โครงการที่ตัดต้นทุน (Project Cost Center) *
              </label>
              {projectMode === 'select' ? (
                <SearchableSelect
                  options={projectOptions}
                  value={projectId}
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
                  className="input text-xs"
                  placeholder="พิมพ์ระบุชื่อโครงการ เช่น โครงการติดตั้งโซลาร์สระบุรี หรือ งานซ่อมท่อไซต์ B"
                  value={customProjectName}
                  onChange={(e) => setCustomProjectName(e.target.value)}
                />
              )}
              <span className="text-[11px] text-steel-500 mt-1 block">
                {projectMode === 'select' ? 'พิมพ์รหัสหรือชื่อเพื่อค้นหาทันที หรือพิมพ์ชื่อใหม่แล้วกด Enter' : 'สามารถคีย์ชื่อโครงการ ไซต์งาน หรือชื่องานซ่อมได้อิสระ'}
              </span>
            </div>

            {/* ฟิลด์ชื่อลูกค้า / ผู้ว่าจ้าง (Searchable & Typeable) */}
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
                placeholder="พิมพ์เพื่อค้นหาลูกค้าในระบบ หรือพิมพ์ชื่อลูกค้าใหม่เอง..."
                customPlaceholder="กด Enter เพื่อใช้ชื่อลูกค้านี้"
              />
              <span className="text-[11px] text-steel-500 mt-1 block">
                พิมพ์เพื่อค้นหาลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าใหม่ได้อิสระ
              </span>
            </div>
          </div>
        </div>

        {/* 2. ข้อมูลร้านค้า / ผู้ขาย (Searchable & Typeable) */}
        <div className="rounded-xl border border-steel-200 bg-steel-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-steel-700 flex items-center gap-1.5">
              <span></span>
              <span>ผู้ขาย / ร้านค้า (Vendor / Supplier)</span>
            </span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-steel-200 text-xs">
              <button
                type="button"
                onClick={() => setVendorMode('select')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  vendorMode === 'select' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                 เลือกร้านค้าในระบบ
              </button>
              <button
                type="button"
                onClick={() => setVendorMode('custom')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  vendorMode === 'custom' ? 'bg-sky-700 text-white shadow-2xs font-bold' : 'text-steel-600 hover:text-steel-900'
                }`}
              >
                ️ พิมพ์ชื่อร้านค้าใหม่เอง
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                ชื่อผู้ขาย / ร้านค้า *
              </label>
              {vendorMode === 'select' ? (
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorId}
                  onChange={(val, opt) => {
                    if (opt?.isCustom) {
                      setVendorMode('custom')
                      setCustomVendorName(val)
                      setVendorId('')
                    } else {
                      setVendorId(val)
                      setCustomVendorName(opt?.label || '')
                    }
                    if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: '' }))
                  }}
                  allowCustom={true}
                  placeholder="พิมพ์ชื่อร้านค้า รหัส หรือเลขภาษีเพื่อค้นหา..."
                  customPlaceholder="กด Enter เพื่อพิมพ์ใช้เป็นร้านค้าใหม่"
                  error={errors.vendorId}
                />
              ) : (
                <input
                  type="text"
                  className={fieldErrorClass(errors.vendorId, 'input')}
                  placeholder="พิมพ์ชื่อร้านค้า/ผู้ขาย เช่น ไทวัสดุ สาขาสระบุรี, ร้านโฮมฮาร์ดแวร์"
                  value={customVendorName}
                  onChange={(e) => {
                    setCustomVendorName(e.target.value)
                    if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: '' }))
                  }}
                />
              )}
              {vendorMode === 'custom' && (
                <div className="mt-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                  ระบบจะบันทึกร้านค้านี้เข้าระบบให้อัตโนมัติ เพื่อให้เรียกใช้งานได้ในครั้งถัดไป
                </div>
              )}
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

          {/* รายละเอียดเพิ่มเติมของร้านค้ากรณีพิมพ์เอง */}
          {vendorMode === 'custom' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 border-t border-steel-200/70 text-xs">
              <label className="block font-medium text-steel-700">
                เบอร์โทรศัพท์ร้านค้า (ถ้ามี)
                <input
                  type="text"
                  className="input mt-1 text-xs"
                  placeholder="02-xxx-xxxx หรือ 08x-xxx-xxxx"
                  value={customVendorPhone}
                  onChange={(e) => setCustomVendorPhone(e.target.value)}
                />
              </label>
              <label className="block font-medium text-steel-700">
                เลขประจำตัวผู้เสียภาษี (ถ้ามี)
                <input
                  type="text"
                  className="input mt-1 text-xs font-mono"
                  placeholder="เลข 13 หลัก"
                  value={customVendorTaxId}
                  onChange={(e) => setCustomVendorTaxId(e.target.value)}
                />
              </label>
              <label className="block font-medium text-steel-700">
                ที่อยู่ร้านค้า (ถ้ามี)
                <input
                  type="text"
                  className="input mt-1 text-xs"
                  placeholder="ที่อยู่/สาขา"
                  value={customVendorAddress}
                  onChange={(e) => setCustomVendorAddress(e.target.value)}
                />
              </label>
            </div>
          )}

          {/* แถบแนะนำร้านค้าเดิม */}
          {vendorSuggestions.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <div className="font-bold flex items-center gap-1.5">
                <span> ร้านค้าเดิมที่เคยสั่งซื้อวัสดุนี้มาก่อน (คลิกเพื่อเลือกใช้):</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {vendorSuggestions.map((vs) => {
                  const isSelected = vendorMode === 'select' && vendorId === vs.vendorId
                  return (
                    <button
                      key={vs.vendorId}
                      type="button"
                      onClick={() => {
                        setVendorMode('select')
                        setVendorId(vs.vendorId)
                        if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: '' }))
                      }}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition border shadow-sm cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-400 font-bold'
                          : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      <span> {vs.vendorName}</span>
                      <span className="font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded text-[11px]">
                        ราคาเดิม {baht(vs.lastPrice)} บ.
                      </span>
                      {isSelected ? <span className="ml-1 text-white"> กำลังเลือก</span> : <span className="ml-1 underline font-semibold">เลือกร้านนี้</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* ข้อมูลการชำระเงิน เงื่อนไขมัดจำ และ ใบเสนอราคา */}
        <div className="rounded-lg border border-steel-200 bg-steel-50/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-200/80 pb-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">
               เงื่อนไขการชำระเงิน และ ใบเสนอราคา (Payment Terms & Quotation)
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
              <SearchableSelect
                options={paymentOptions}
                value={paymentType}
                onChange={(val) => setPaymentType(val)}
                placeholder="พิมพ์ค้นหาเงื่อนไขชำระเงิน เช่น เครดิต 30 วัน, เงินสด..."
              />
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

            {/* แนบรูปภาพ / ไฟล์ใบเสนอราคาจากผู้ขาย */}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold text-steel-700 dark:text-slate-300 mb-1">
                แนบรูปภาพ / เอกสารใบเสนอราคาจากผู้ขาย (Quotation Attachment)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  id="quotation-upload"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setQuotationFile(file)
                      setUploadingQuotation(true)
                      try {
                        const previewUrl = await uploadQuotationFile(file)
                        if (previewUrl) setQuotationUrl(previewUrl)
                      } catch (err) {
                        console.warn(err)
                      } finally {
                        setUploadingQuotation(false)
                      }
                    }
                  }}
                />
                <label
                  htmlFor="quotation-upload"
                  className="inline-flex items-center gap-2 rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-steel-700 dark:text-slate-200 transition shadow-2xs cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-steel-500" />
                  <span>{uploadingQuotation ? 'กำลังอัปโหลด...' : (quotationUrl ? 'เปลี่ยนรูป/ไฟล์ใบเสนอราคา' : ' คลิกเพื่อแนบรูปภาพ/ไฟล์ใบเสนอราคา')}</span>
                </label>

                {quotationUrl && (
                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate max-w-xs">
                      {quotationFile?.name || 'แนบใบเสนอราคาแล้ว'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFile(quotationUrl)}
                      className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 font-bold hover:underline ml-2 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>เปิดดูเอกสาร</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuotationUrl('')
                        setQuotationFile(null)
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                      title="ลบไฟล์แนบ"
                    >
                       ลบ
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-steel-400 dark:text-slate-500 mt-1">
                แนบรูปถ่ายใบเสนอราคา หรือสเปกราคาที่ได้จากร้านค้า เพื่อความโปร่งใสและตรวจสอบย้อนหลังได้ 100%
              </p>
            </div>
          </div>

          {/* รายละเอียดมัดจำ vs จ่ายเต็มจำนวน */}
          {!hasDeposit ? (
            /* กรณีไม่มีมัดจำ (Full Payment) */
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-sky-900 block"> เงื่อนไขชำระเต็มจำนวน (Full Payment)</span>
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
                      { id: 'transfer', label: ' เงินโอน', icon: '↗️' },
                      { id: 'cheque', label: 'เช็คสั่งจ่าย', icon: '️' },
                      { id: 'cash', label: ' เงินสด', icon: '' },
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
                    ระบุเงื่อนไขมัดจำ (Bi-directional Auto-Calculating)
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
              <span></span>
              <span>กำหนดส่งมอบและสถานที่จัดส่ง (Delivery & Due Date)</span>
            </h4>
            <span className="text-[11px] text-steel-500">สำหรับระบบติดตามวันครบกำหนด</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-steel-800 mb-1">
                วันที่กำหนดส่งมอบ / ครบกำหนด (Due Date)
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
                 สถานที่ส่งมอบสินค้า / ที่อยู่จัดส่งหน้างาน
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
                ข้อตกลงและหมายเหตุเพิ่มเติมสำหรับผู้ขาย
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
                <span>ดูประวัติโครงการที่เคยใช้วัสดุนี้</span>
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
          <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">การระบุภาษีและเอกสารทางบัญชี</h4>

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
                      แบบยื่น: {whtFormType}
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
                <span className="text-[10px] text-steel-500 dark:text-slate-400 mt-1 block">
                  ระบบจับคู่อัตโนมัติ: บุคคลธรรมดา  ภ.ง.ด.3 / นิติบุคคล  ภ.ง.ด.53
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
          <span></span>
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
          <span></span>
          <span>{busy ? 'กำลังบันทึก...' : 'บันทึกและส่งเรื่องไปยังฝ่ายบัญชี (รอชำระเงิน)'}</span>
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-steel-100 border border-steel-300 px-4 py-2.5 text-sm font-semibold text-steel-700 hover:bg-steel-200 transition disabled:opacity-50"
          onClick={() => save(false)}
          disabled={busy}
        >
          <span></span>
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
