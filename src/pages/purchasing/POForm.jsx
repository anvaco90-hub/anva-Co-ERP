import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Upload, FileText, CheckCircle2, Eye, Truck, Building2, Store, Receipt, Package, ArrowLeft, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  fetchUnifiedCustomers,
  fetchUnifiedVendors,
  ensureLegacyVendorId,
  upsertUnifiedContactFromLegacy,
} from '../../lib/contactsSync'
import { useAuth } from '../../context/AuthContext'
import { EMPTY_ITEM, itemsValid } from '../../lib/purchasing'
import { getItemVendorHistory } from '../../lib/purchasingHistory'
import { baht } from '../../lib/projects'
import { calculateTaxBreakdown, inferPoTaxType, inferQuotationTaxType } from '../../lib/tax'
import { buildPurchaseItemsFromQuotation, computeRemainingPrItems } from '../../lib/purchasingPricing'
import { extractPrSourceQuotation } from '../../lib/salesFlowUtils'
import { uploadQuotationFile, openFile } from '../../lib/files'
import ItemsEditor from './ItemsEditor'
import ItemProjectUsageModal from '../../components/ItemProjectUsageModal'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'
import CollapsibleDetailField from '../../components/common/CollapsibleDetailField'

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
  const [salesQuotationId, setSalesQuotationId] = useState('')
  const [salesQuotationNo, setSalesQuotationNo] = useState('')
  const [quotationPricingMeta, setQuotationPricingMeta] = useState(null)
  const [poPriceMode, setPoPriceMode] = useState('cost_baseline') // 'cost_baseline' | 'selling_ref'
  const [taxType, setTaxType] = useState('vat_excluded') // 'vat_excluded' (ราคาแยกภาษี +7% มาตรฐานจัดซื้อ) | 'vat_included' | 'vat_exempt'
  const [whtRate, setWhtRate] = useState('0') // '0' | '1' | '2' | '3' | '5'
  const [vendorTaxInvoiceNo, setVendorTaxInvoiceNo] = useState('')
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [duplicateBanner, setDuplicateBanner] = useState(false)
  const [prMultiPoInfo, setPrMultiPoInfo] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')

  // โหลดรายชื่อผู้ขายและโครงการ
  useEffect(() => {
    fetchUnifiedVendors().then((data) => setVendors(data ?? []))
    supabase.from('projects').select('id, project_code, project_name').order('project_code').then(({ data }) => setProjects(data ?? []))
    fetchUnifiedCustomers().then((data) => setCustomers(data ?? []))

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

    // โหลดรายการจากใบเสนอราคาขาย (กรณีส่งต่อจากฝ่ายขาย Quotation -> PO)
    const qId = params.get('quotation_id')
    if (qId && !id) {
      Promise.all([
        supabase.from('quotations').select('*, projects(id, project_code, project_name)').eq('id', qId).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', qId),
        supabase.from('inventory_items').select('id, item_code, item_name, unit, avg_unit_cost'),
      ]).then(async ([qRes, itemsRes, invRes]) => {
        const qt = qRes.data
        const qItems = itemsRes.data || []
        const invItems = invRes.data || []

        // ดึงรายการต้นทุนจาก BOQ ต้นทางถ้ามี (แยกต้นทุนวัสดุจากราคาขาย)
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

        if (qt) {
          if (qt.project_id) setProjectId(qt.project_id)
          if (qt.customer_name) setCustomerName(qt.customer_name)
          // เก็บอ้างอิงใบเสนอราคาขายแยกจากช่องใบเสนอราคาจากผู้ขาย (Vendor Quotation)
          setSalesQuotationId(qt.id || '')
          setSalesQuotationNo(qt.quotation_no || '')
          setTaxType(inferQuotationTaxType(qt))
          if (qt.wht_rate !== undefined && qt.wht_rate !== null) {
            setWhtRate(String(qt.wht_rate))
          }
        }

        const meta = {
          quotation: qt || {},
          quotationItems: qItems,
          boqItems,
          inventoryItems: invItems,
        }
        setQuotationPricingMeta(meta)
        setPoPriceMode('cost_baseline')

        if (qItems.length > 0) {
          setItems(
            buildPurchaseItemsFromQuotation({
              ...meta,
              mode: 'cost_baseline',
            })
          )
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
      setSalesQuotationId(a.data.quotation_id || '')
      setSalesQuotationNo(a.data.sales_quotation_no || '')
      setBuyerName(a.data.buyer_name || profile?.full_name || '')
      setPaymentType(a.data.payment_type || 'credit_30')
      setHasDeposit(a.data.deposit_type === 'deposit')
      setDepositPercent(String(a.data.deposit_percent || '30'))
      setDepositAmount(a.data.deposit_amount ? String(a.data.deposit_amount) : '')
      setPaymentChannelRequested(a.data.payment_channel_requested || 'transfer')
      setQuotationNo(a.data.quotation_no || '')
      setQuotationDate(a.data.quotation_date || '')
      setQuotationUrl(a.data.quotation_url || '')
      setTaxType(inferPoTaxType(a.data))
      setWhtRate(String(a.data.wht_rate || '0'))
      setVendorTaxInvoiceNo(a.data.vendor_tax_invoice_no || '')
      setTaxInvoiceDate(a.data.tax_invoice_date || '')
      setExpectedDeliveryDate(a.data.expected_delivery_date || '')
      setDeliveryAddress(a.data.delivery_address || '')
      setNotes(a.data.notes || '')
      setItems((b.data ?? []).map((i) => ({
        id: i.id,
        item_id: i.item_id || null,
        pr_item_id: i.pr_item_id || null,
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
    setPrMultiPoInfo(null)
    if (!prIdToLoad || prIdToLoad === 'DIRECT_PO') {
      setPr(null)
      return
    }
    const [a, b, existingPosRes] = await Promise.all([
      supabase.from('purchase_requisitions').select('*, projects(id, project_code, project_name)').eq('id', prIdToLoad).single(),
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', prIdToLoad),
      supabase
        .from('purchase_orders')
        .select('id, po_no, status, purchase_order_items(id, pr_item_id, item_name, quantity)')
        .eq('pr_id', prIdToLoad)
        .neq('status', 'cancelled'),
    ])
    if (a.error) {
      return setError('ไม่พบข้อมูลใบขอซื้อ')
    }
    setError('')
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
    const sourceQt = extractPrSourceQuotation(a.data)
    if (sourceQt.quotationId) {
      setSalesQuotationId(sourceQt.quotationId)
    }
    if (sourceQt.quotationNo) {
      setSalesQuotationNo(sourceQt.quotationNo)
    }
    // หาก PR ต้นทางระบุว่ากรอกราคาต่อหน่วยแบบรวม VAT 7% แล้ว ให้ตั้ง PO เป็น vat_included เพื่อไม่บวกซ้ำ
    if (a.data.notes && a.data.notes.includes('[ราคารวม VAT 7% แล้ว]')) {
      setTaxType('vat_included')
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

    const prItemsList = b.data || []
    const existingPos = existingPosRes?.error ? [] : existingPosRes?.data || []
    const existingPoItems = existingPos.flatMap((poRow) => poRow.purchase_order_items || [])

    if (prItemsList.length > 0) {
      const remaining = computeRemainingPrItems(prItemsList, existingPoItems)
      if (existingPos.length > 0) {
        setPrMultiPoInfo({
          prNo: a.data.pr_no,
          poNos: existingPos.map((poRow) => poRow.po_no),
          totalPrItems: prItemsList.length,
          remainingCount: remaining.items.length,
          fullyOrderedCount: remaining.fullyOrderedCount,
        })
      }

      const itemsToPrefill =
        existingPos.length > 0 && remaining.items.length > 0
          ? remaining.items
          : prItemsList.map((i) => ({
              item_id: i.item_id || null,
              pr_item_id: i.id,
              item_name: i.item_name,
              quantity: String(i.quantity),
              unit: i.unit ?? '',
              price: String(i.estimated_price || ''),
            }))

      setItems(itemsToPrefill.map((i) => ({ ...i, received: 0 })))
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
  const {
    amountBeforeVat,
    vatAmount,
    totalWithVat,
    whtAmount,
    netPayable: netAmount,
  } = calculateTaxBreakdown({
    rawTotal: rawSubtotal,
    taxType,
    whtRate,
    vatRate: 7,
  })
  const grandTotal = totalWithVat

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
          finalVendorId = await ensureLegacyVendorId(matchedV) || matchedV.id
        } else {
          const autoCode = `VEND-${Date.now().toString().slice(-4)}`
          const customPayload = {
            vendor_code: autoCode,
            vendor_name: finalCustomVendorName,
            phone: customVendorPhone.trim() || null,
            tax_id: customVendorTaxId.trim() || null,
            address: customVendorAddress.trim() || null,
          }
          try {
            const { data: newV, error: vInsErr } = await supabase.from('vendors').insert(customPayload).select().single()

            if (!vInsErr && newV) {
              finalVendorId = newV.id
              setVendors(prev => [...prev, newV])
              await upsertUnifiedContactFromLegacy({ role: 'vendor', record: newV })
            }
          } catch (e) {
            console.warn('Auto insert vendor fallback:', e)
          }

          if (!finalVendorId && vendors.length > 0) {
            finalVendorId = await ensureLegacyVendorId(vendors[0]) || vendors[0].id
          }
        }
      } else {
        const chosenV = vendors.find(v => v.id === finalVendorId)
        if (chosenV) {
          finalCustomVendorName = chosenV.vendor_name
          const guaranteedId = await ensureLegacyVendorId(chosenV)
          if (guaranteedId) finalVendorId = guaranteedId
        } else if (finalVendorId) {
          const guaranteedId = await ensureLegacyVendorId(finalVendorId)
          if (guaranteedId) finalVendorId = guaranteedId
        }
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
        remaining_amount: Math.max(0, Math.round((netAmount - Number(po?.deposit_paid_amount || 0)) * 100) / 100),
        payment_channel_requested: paymentChannelRequested,
        payment_status: sendToAccounting ? 'รอชำระเงิน' : (po?.payment_status || 'รอชำระเงิน'),
        quotation_id: salesQuotationId || null,
        sales_quotation_no: salesQuotationNo || null,
        quotation_no: quotationNo || null,
        quotation_date: quotationDate || null,
        quotation_url: finalQuotationUrl || null,
        total_amount: subtotal,
        grand_total: grandTotal,
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
        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await supabase.from('purchase_orders').update(payload).eq('id', targetId)
          if (!res.error) return
          const msg = res.error.message || ''
          if (!msg.includes('does not exist') && !msg.includes('Could not find')) throw res.error

          if (msg.includes('quotation_id')) {
            delete payload.quotation_id
            continue
          }
          if (msg.includes('sales_quotation_no')) {
            delete payload.sales_quotation_no
            if (salesQuotationNo && !String(payload.notes || '').includes(salesQuotationNo)) {
              payload.notes = [payload.notes, `[QT ขาย: ${salesQuotationNo}]`].filter(Boolean).join(' ')
            }
            continue
          }
          if (msg.includes('quotation_url')) {
            delete payload.quotation_url
            continue
          }

          delete payload.customer_name
          delete payload.custom_project_name
          delete payload.custom_vendor_name
          const tags = [
            customerName.trim() ? `[ลูกค้า: ${customerName.trim()}]` : '',
            finalCustomProjectName ? `[โครงการ: ${finalCustomProjectName}]` : '',
            finalCustomVendorName ? `[ร้านค้า: ${finalCustomVendorName}]` : '',
            salesQuotationNo ? `[QT ขาย: ${salesQuotationNo}]` : '',
          ].filter(Boolean).join(' ')
          payload.notes = (notes ? `${notes}\n${tags}` : tags) || null
        }
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
          const baseItems = p_items.map((it) => ({
            po_id: id,
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
            console.warn('Retrying update purchase_order_items without pr_item_id:', itErr)
            const { error: itErr2 } = await supabase.from('purchase_order_items').insert(baseItems)
            if (itErr2) console.warn('Could not re-insert items directly:', itErr2)
          }
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

      {prMultiPoInfo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3.5 text-xs text-amber-950 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div>
            <b className="font-bold">
              ใบขอซื้อ {prMultiPoInfo.prNo} มีใบสั่งซื้อแล้ว {prMultiPoInfo.poNos.length} ใบ ({prMultiPoInfo.poNos.join(', ')})
            </b>
            <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5">
              {prMultiPoInfo.remainingCount > 0
                ? `ระบบคัดกรองเหลือเฉพาะรายการที่ยังไม่ได้สั่งซื้อ (${prMultiPoInfo.remainingCount} จาก ${prMultiPoInfo.totalPrItems} รายการ) เพื่อออก PO แยกต่างร้านให้แล้ว`
                : `รายการทั้งหมดใน PR นี้ถูกออก PO ครบแล้ว (${prMultiPoInfo.totalPrItems} รายการ) — ระบบโหลดรายการตั้งต้นให้คุณปรับจำนวนหรือลบรายการได้ตามต้องการ`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPrMultiPoInfo(null)}
            className="text-xs text-amber-800 dark:text-amber-300 hover:underline font-semibold shrink-0 cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* แถบนำทางและหัวเรื่องหน้าฟอร์ม */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/purchasing?tab=po"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับรายการ PO</span>
          </Link>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {id
              ? `แก้ไขใบสั่งซื้อ ${po?.po_no ?? ''}`
              : params.get('duplicate_from')
              ? 'สร้างซ้ำใบสั่งซื้อ (Duplicate PO)'
              : 'ออกใบสั่งซื้อ (Purchase Order)'}
          </h2>
        </div>
      </div>

      {/* กรอบเอกสาร PO รูปแบบเป็นขั้นตอนชัดเจน */}
      <div className="space-y-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm">
        {/* ส่วนหัวเอกสาร (Masthead) */}
        <div className="rounded-xl bg-[#0f172a] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-white">ANVA &amp; CO., LTD.</span>
              <span className="rounded bg-sky-500/20 border border-sky-400/30 text-sky-300 px-2 py-0.5 text-[10px] font-bold">
                สำนักงานใหญ่
              </span>
            </div>
            <p className="text-xs text-slate-300">
              บริษัท อันวาแอนด์โค จำกัด · ผู้ดำเนินการสั่งซื้อ:{' '}
              <b className="text-white">{buyerName || profile?.full_name || 'ฝ่ายจัดซื้อ'}</b>
            </p>
          </div>

          <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-700/80 pt-3 sm:pt-0 sm:pl-5">
            <div className="text-[11px] font-semibold text-sky-300">ใบสั่งซื้อ / Purchase Order</div>
            <div className="font-mono text-lg font-black text-white mt-0.5">
              {po?.po_no || 'PO2026-XXXX (สร้างอัตโนมัติ)'}
            </div>
            <div className="text-[11px] text-slate-400">
              วันที่เอกสาร: <span className="font-mono text-slate-200">{new Date().toLocaleDateString('th-TH')}</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ขั้นที่ 1: แหล่งที่มาเอกสาร (PR) และคู่ค้า (โครงการ / ผู้ขาย)               */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 dark:bg-sky-600 text-white text-xs font-bold">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              แหล่งที่มาใบขอซื้อ (PR) และข้อมูลคู่ค้า
            </h3>
          </div>

          {/* เลือกรหัส PR อ้างอิง */}
          {!id ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  เลือกใบขอซื้อ (PR) หรือ สั่งซื้อตรง (Direct PO)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPrId('DIRECT_PO')
                    if (errors.selectedPrId) setErrors((prev) => ({ ...prev, selectedPrId: '' }))
                  }}
                  className="text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  สั่งซื้อตรง (ไม่ผ่าน PR)
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
                <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 px-3 py-2 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between">
                  <span>โหมดสั่งซื้อตรง (Direct PO): ระบุโครงการ ผู้ขาย และรายการสินค้าด้านล่างได้ทันที</span>
                  <button
                    type="button"
                    onClick={() => setSelectedPrId('')}
                    className="text-sky-700 dark:text-sky-300 font-bold hover:underline ml-2 cursor-pointer"
                  >
                    เปลี่ยนกลับ
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  เลือก PR เดิม (รองรับออกแยกหลาย PO สำหรับต่างร้านค้า ระบบจะคำนวณเฉพาะยอดคงเหลือให้อัตโนมัติ)
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-2.5 flex items-center gap-2 text-xs">
              <span className="text-slate-500">อ้างอิงใบขอซื้อ (PR):</span>
              <span className="font-mono font-bold text-sky-700 dark:text-sky-400">{po?.pr?.pr_no || 'สั่งซื้อตรง (Direct PO)'}</span>
            </div>
          )}

          {/* โครงการ & ลูกค้า (ซ้าย) vs ร้านค้า / ผู้ขาย (ขวา) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ซ้าย: โครงการ และ ลูกค้า */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-sky-600" />
                  <span>โครงการที่ตัดต้นทุน &amp; ลูกค้า</span>
                </span>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setProjectMode('select')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      projectMode === 'select' ? 'bg-sky-700 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    เลือกในระบบ
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectMode('custom')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      projectMode === 'custom' ? 'bg-sky-700 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    พิมพ์ชื่อเอง
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    โครงการ (Cost Center) *
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
                      placeholder="พิมพ์รหัส หรือชื่อโครงการ..."
                      customPlaceholder="กด Enter เพื่อใช้ชื่อโครงการนี้"
                    />
                  ) : (
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="เช่น โครงการติดตั้งโซลาร์สระบุรี"
                      value={customProjectName}
                      onChange={(e) => setCustomProjectName(e.target.value)}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ลูกค้า / ผู้ว่าจ้าง (ถ้ามี)
                  </label>
                  <SearchableSelect
                    options={customerOptions}
                    value={customerName}
                    onChange={(val) => setCustomerName(val)}
                    onCustomChange={(val) => setCustomerName(val)}
                    allowCustom={true}
                    placeholder="ค้นหา หรือพิมพ์ชื่อลูกค้า..."
                    customPlaceholder="กด Enter เพื่อใช้ชื่อลูกค้านี้"
                  />
                </div>
              </div>
            </div>

            {/* ขวา: ผู้ขาย / ร้านค้า */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-emerald-600" />
                  <span>ผู้ขาย / ร้านค้า (Vendor)</span>
                </span>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setVendorMode('select')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      vendorMode === 'select' ? 'bg-sky-700 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    เลือกร้านค้า
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorMode('custom')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      vendorMode === 'custom' ? 'bg-sky-700 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    เพิ่มร้านค้าใหม่
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                      placeholder="พิมพ์ชื่อร้านค้า รหัส หรือเลขภาษี..."
                      customPlaceholder="กด Enter เพื่อพิมพ์เป็นร้านค้าใหม่"
                      error={errors.vendorId}
                    />
                  ) : (
                    <input
                      type="text"
                      className={fieldErrorClass(errors.vendorId, 'input text-xs')}
                      placeholder="เช่น ไทวัสดุ สาขาสระบุรี"
                      value={customVendorName}
                      onChange={(e) => {
                        setCustomVendorName(e.target.value)
                        if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: '' }))
                      }}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ผู้ดำเนินการสั่งซื้อ (Buyer)
                  </label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="ระบุชื่อผู้สั่งซื้อ"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </div>
              </div>

              {vendorMode === 'custom' && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-2 border-t border-slate-200/70 dark:border-slate-700 text-xs">
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="เบอร์โทรร้านค้า (ถ้ามี)"
                    value={customVendorPhone}
                    onChange={(e) => setCustomVendorPhone(e.target.value)}
                  />
                  <input
                    type="text"
                    className="input text-xs font-mono"
                    placeholder="เลขภาษี 13 หลัก (ถ้ามี)"
                    value={customVendorTaxId}
                    onChange={(e) => setCustomVendorTaxId(e.target.value)}
                  />
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="ที่อยู่/สาขา (ถ้ามี)"
                    value={customVendorAddress}
                    onChange={(e) => setCustomVendorAddress(e.target.value)}
                  />
                </div>
              )}

              {vendorSuggestions.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900">
                  <div className="font-bold text-[11px] mb-1.5">ร้านค้าที่เคยสั่งซื้อวัสดุนี้มาก่อน:</div>
                  <div className="flex flex-wrap gap-1.5">
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
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition border cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-700 text-white border-emerald-800 font-bold'
                              : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          <span>{vs.vendorName}</span>
                          <span className="font-mono font-semibold opacity-80">({baht(vs.lastPrice)})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ขั้นที่ 2: รายการสั่งซื้อ & เชื่อมโยงต้นทุนใบเสนอราคาขาย (กรอกรายการก่อนคำนวณ) */}
        {/* ========================================================================= */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 dark:bg-sky-600 text-white text-xs font-bold">
                2
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Package className="h-4 w-4 text-sky-600" />
                <span>รายการสินค้าและราคาสั่งซื้อ *</span>
              </h3>
            </div>
            {items.some((it) => it.item_name?.trim()) && (
              <button
                type="button"
                onClick={() => setSelectedUsageItem({ item_name: items[0].item_name })}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
              >
                ดูประวัติโครงการที่เคยใช้วัสดุนี้
              </button>
            )}
          </div>

          {(salesQuotationNo || quotationPricingMeta) && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-emerald-950 dark:text-emerald-200">
                  <FileText className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>
                    อ้างอิงใบเสนอราคาขาย:{' '}
                    <b className="font-mono text-emerald-800 dark:text-emerald-300">{salesQuotationNo}</b>
                  </span>
                  {salesQuotationId && (
                    <Link
                      to={`/quotations/${salesQuotationId}`}
                      className="inline-flex items-center gap-1 rounded bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                    >
                      <span>เปิดดู QT</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                {quotationPricingMeta && (
                  <div className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPoPriceMode('cost_baseline')
                        setItems(
                          buildPurchaseItemsFromQuotation({
                            ...quotationPricingMeta,
                            mode: 'cost_baseline',
                          })
                        )
                      }}
                      className={`rounded px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                        poPriceMode === 'cost_baseline' ? 'bg-emerald-700 text-white' : 'text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      ต้นทุนซื้อจริง (BOQ/สต็อก)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPoPriceMode('selling_ref')
                        setItems(
                          buildPurchaseItemsFromQuotation({
                            ...quotationPricingMeta,
                            mode: 'selling_ref',
                          })
                        )
                      }}
                      className={`rounded px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                        poPriceMode === 'selling_ref' ? 'bg-sky-700 text-white' : 'text-sky-700 hover:bg-sky-50'
                      }`}
                    >
                      ราคาขาย QT (ก่อน VAT)
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                ระบุหรือปรับราคาซื้อจริงที่ตกลงกับร้านค้าในตารางด้านล่าง
              </p>
            </div>
          )}

          <div>
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
        </section>

        {/* ========================================================================= */}
        {/* ขั้นที่ 3: เงื่อนไขชำระ ส่งมอบ เอกสารผู้ขาย (ซ้าย 7 cols) + สรุปยอด (ขวา 5 cols) */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 dark:bg-sky-600 text-white text-xs font-bold">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              รูปแบบการชำระ การส่งมอบ และสรุปยอดใบสั่งซื้อ
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ซ้าย (7 cols): รูปแบบชำระ + ส่งมอบ + เอกสารอ้างอิง */}
            <div className="lg:col-span-7 space-y-4">
              {/* รูปแบบและเงื่อนไขการชำระเงิน (จัดซื้อกำหนดวิธีจ่าย ไม่ใช่หน้าตัดจ่ายเงินจริง) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    รูปแบบและเงื่อนไขการชำระเงิน (ว่าจะชำระอย่างไร)
                  </span>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHasDeposit(false)}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        !hasDeposit ? 'bg-sky-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                      }`}
                    >
                      ชำระเต็มจำนวน
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasDeposit(true)
                        if (!depositAmount && netAmount > 0) {
                          const amt = Math.round(netAmount * (Number(depositPercent || 30) / 100) * 100) / 100
                          setDepositAmount(String(amt))
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        hasDeposit ? 'bg-amber-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                      }`}
                    >
                      มีมัดจำ / แบ่งงวด
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ประเภทการชำระเงิน *
                    </label>
                    <SearchableSelect
                      options={paymentOptions}
                      value={paymentType}
                      onChange={(val) => setPaymentType(val)}
                      placeholder="เลือกเครดิตเทอม / เงินสด..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ช่องทางชำระที่ตกลงกับร้าน
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'transfer', label: 'โอนเงิน' },
                        { id: 'cheque', label: 'เช็ค' },
                        { id: 'cash', label: 'เงินสด' },
                      ].map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setPaymentChannelRequested(ch.id)}
                          className={`py-2 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                            paymentChannelRequested === ch.id
                              ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {hasDeposit && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                          สัดส่วนมัดจำงวดแรก (%)
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
                            className="input text-xs font-bold font-mono pr-7 bg-white dark:bg-slate-900"
                          />
                          <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                          มูลค่ามัดจำตามข้อตกลง (บาท)
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
                            className="input text-xs font-bold font-mono pr-9 bg-white dark:bg-slate-900"
                          />
                          <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">บาท</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900 dark:text-amber-300 pt-1 border-t border-amber-200/80 dark:border-amber-800/60">
                      <span>มัดจำงวดแรก: <b className="font-mono">{baht(calcDepositAmount)} บ.</b> ({depositPercent || 0}%)</span>
                      <span>ยอดงวดส่งมอบ/เครดิต: <b className="font-mono">{baht(calcRemainingAmount)} บ.</b></span>
                    </div>
                  </div>
                )}
              </div>

              {/* การส่งมอบ & หมายเหตุ */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Truck className="h-4 w-4 text-sky-600" />
                  <span>กำหนดส่งมอบและสถานที่จัดส่ง</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      วันครบกำหนดส่งมอบ (Due Date)
                    </label>
                    <input
                      type="date"
                      className="input text-xs"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {[
                        { label: '+3 วัน', days: 3 },
                        { label: '+7 วัน', days: 7 },
                        { label: '+15 วัน', days: 15 },
                        { label: '+30 วัน', days: 30 },
                      ].map((s) => (
                        <button
                          key={s.days}
                          type="button"
                          onClick={() => {
                            const d = new Date()
                            d.setDate(d.getDate() + s.days)
                            setExpectedDeliveryDate(d.toISOString().split('T')[0])
                          }}
                          className="rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      สถานที่ส่งมอบ / หน้างาน
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น สโตร์หลักสำนักงานใหญ่ หรือ ไซต์งานโครงการ"
                      className="input text-xs"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                    <CollapsibleDetailField
                      value={notes}
                      onChange={setNotes}
                      addLabel="เพิ่มหมายเหตุและเงื่อนไขสำหรับร้านค้า"
                      editLabel="หมายเหตุและเงื่อนไขสำหรับร้านค้า"
                      placeholder="เช่น ส่งของช่วง 09:00 - 16:00 น., โทรแจ้งหัวหน้าช่างก่อนเข้าหน้างาน"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* เอกสารอ้างอิงจากผู้ขาย (ใบเสนอราคาร้านค้า & ใบกำกับภาษี) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Receipt className="h-4 w-4 text-amber-600" />
                  <span>เอกสารอ้างอิงจากผู้ขาย (Vendor Quote &amp; Tax Invoice)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      เลขที่ใบเสนอราคาผู้ขาย
                    </label>
                    <input
                      className="input text-xs font-mono"
                      placeholder="เช่น QTV-SCG-2026-089"
                      value={quotationNo}
                      onChange={(e) => setQuotationNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      วันที่ใบเสนอราคาผู้ขาย
                    </label>
                    <input
                      type="date"
                      className="input text-xs"
                      value={quotationDate}
                      onChange={(e) => setQuotationDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
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
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-500" />
                    <span>{uploadingQuotation ? 'กำลังอัปโหลด...' : quotationUrl ? 'เปลี่ยนไฟล์ใบเสนอราคา' : 'แนบไฟล์ใบเสนอราคาผู้ขาย'}</span>
                  </label>

                  {quotationUrl && (
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate max-w-[180px]">
                        {quotationFile?.name || 'แนบไฟล์แล้ว'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openFile(quotationUrl)}
                        className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>เปิดดู</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuotationUrl('')
                          setQuotationFile(null)
                        }}
                        className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        ลบ
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      เลขที่ใบกำกับภาษีผู้ขาย (ถ้าได้รับแล้ว)
                    </label>
                    <input
                      type="text"
                      placeholder="กรอกภายหลังเมื่อได้รับบิล เช่น INV-889021"
                      className="input text-xs font-mono"
                      value={vendorTaxInvoiceNo}
                      onChange={(e) => setVendorTaxInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      วันที่ใบกำกับภาษีผู้ขาย
                    </label>
                    <input
                      type="date"
                      className="input text-xs"
                      value={taxInvoiceDate}
                      onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ขวา (5 cols): ภาษี & สรุปมูลค่าสุทธิของใบสั่งซื้อ */}
            <div className="lg:col-span-5 lg:sticky lg:top-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                  คำนวณภาษี &amp; ยอดสุทธิใบสั่งซื้อ
                </h4>
                {Number(whtRate) > 0 && (
                  <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    {whtFormType}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ประเภทภาษีมูลค่าเพิ่ม (VAT) *
                  </label>
                  <select
                    className="input text-xs bg-white dark:bg-slate-900"
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value)}
                  >
                    <option value="vat_excluded">ราคาแยกภาษีมูลค่าเพิ่ม +7% (VAT Excluded)</option>
                    <option value="vat_included">ราคารวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Included)</option>
                    <option value="vat_exempt">ไม่มีภาษี / ยกเว้นภาษี (VAT Exempt 0%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    หักภาษี ณ ที่จ่าย (WHT)
                  </label>
                  <select
                    className="input text-xs bg-white dark:bg-slate-900"
                    value={whtRate}
                    onChange={(e) => setWhtRate(e.target.value)}
                  >
                    {WHT_RATES.map((wr) => (
                      <option key={wr.value} value={wr.value}>{wr.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-xs space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>มูลค่าสินค้าก่อนภาษี:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{baht(amountBeforeVat)} บาท</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>ภาษีมูลค่าเพิ่ม (VAT {taxType === 'vat_exempt' ? '0' : '7'}%{taxType === 'vat_included' ? ' รวมในยอด' : ''}):</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{baht(vatAmount)} บาท</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span>ยอดรวมภาษีมูลค่าเพิ่ม:</span>
                  <span className="font-mono">{baht(totalWithVat)} บาท</span>
                </div>
                {Number(whtRate) > 0 && (
                  <div className="flex justify-between text-purple-700 dark:text-purple-300 font-medium">
                    <span>หัก ณ ที่จ่าย ({whtRate}% - {whtFormType.split(' ')[0]}):</span>
                    <span className="font-mono">- {baht(whtAmount)} บาท</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline font-black text-sm text-emerald-800 dark:text-emerald-400 border-t-2 border-emerald-300 dark:border-emerald-700 pt-2.5">
                  <span>ยอดสุทธิใบสั่งซื้อ:</span>
                  <span className="font-mono text-lg">{baht(netAmount)} บาท</span>
                </div>

                {hasDeposit && (
                  <div className="pt-2 border-t border-dashed border-amber-300 dark:border-amber-700 text-[11px] space-y-1 text-amber-900 dark:text-amber-300">
                    <div className="flex justify-between">
                      <span>มัดจำงวดแรก ({depositPercent || 0}%):</span>
                      <span className="font-mono font-bold">{baht(calcDepositAmount)} บาท</span>
                    </div>
                    <div className="flex justify-between">
                      <span>คงเหลือชำระตามเงื่อนไข:</span>
                      <span className="font-mono font-bold">{baht(calcRemainingAmount)} บาท</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {hasReceived && (
          <p className="text-xs text-slate-500">
            * รายการที่ตรวจรับของเข้าสโตร์แล้ว แก้ได้เฉพาะจำนวน (ห้ามต่ำกว่าที่รับแล้ว) เพื่อให้สต็อกถูกต้อง
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Link to="/purchasing?tab=po" className="btn-ghost">ยกเลิก</Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition disabled:opacity-50 cursor-pointer"
            onClick={() => save(false)}
            disabled={busy}
          >
            <span>บันทึกฉบับร่าง</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-800 transition disabled:opacity-50 cursor-pointer"
            onClick={() => save(true)}
            disabled={busy}
          >
            <span>{busy ? 'กำลังบันทึก...' : id ? 'บันทึกการแก้ไขใบสั่งซื้อ' : 'บันทึกใบสั่งซื้อ (PO)'}</span>
          </button>
        </div>
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
