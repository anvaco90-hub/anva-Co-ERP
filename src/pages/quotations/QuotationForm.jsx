import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import {
  QUOTATION_TYPES,
  calculateDocumentPricing,
  generateTypedQuotationNo,
  inferQuotationTaxType,
  round2,
} from '../../lib/tax'
import { fetchUnifiedCustomers, ensureLegacyCustomerId } from '../../lib/contactsSync'
import {
  buildQuotationItemsFromBoq,
  matchBoqCustomer,
  formatCustomerBranchLabel,
  syncDraftItemsFromStore,
  saveQuotationWithFallback,
  saveQuotationItemsWithFallback,
} from '../../lib/boqToQuotation'
import { resolveQuotationType } from '../../lib/quotationPrintUtils'
import { checkQuotationStock } from '../../lib/quotationStockCheck'
import { formatIntQty } from '../../lib/store'
import { uploadQuotationFile, openFile } from '../../lib/files'
import R2Image from '../../components/R2Image'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import {
  FileText,
  Building2,
  User,
  Calendar,
  DollarSign,
  Percent,
  Plus,
  Trash2,
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  Paperclip,
  Package,
  Clock,
  Warehouse,
  Briefcase,
  FileCheck2,
  ReceiptText,
  X,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react'

const EMPTY_ITEM = {
  item_id: '',
  item_code: '',
  item_name: '',
  description: '',
  quantity: '1',
  unit: 'ชิ้น',
  base_cost: '0',
  unit_price: '0',
  discount_percent: '0',
}

const CURRENCIES = [
  { code: 'THB', name: 'THB - บาท (ไทย)' },
  { code: 'USD', name: 'USD - ดอลลาร์สหรัฐ' },
  { code: 'EUR', name: 'EUR - ยูโร' },
  { code: 'JPY', name: 'JPY - เยนญี่ปุ่น' },
  { code: 'CNY', name: 'CNY - หยวนจีน' },
]

const WAREHOUSES = ['สโตร์หลัก (Main Store)', 'คลังสินค้าส่วนกลาง (HQ)', 'คลังหน้างานโครงการ']

export default function QuotationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const duplicateFromId = searchParams.get('duplicate_from')
  const boqIdParam = searchParams.get('boq_id')
  const typeParam = searchParams.get('type')
  const initialQuotationType = boqIdParam
    ? QUOTATION_TYPES.PROJECT
    : typeParam === QUOTATION_TYPES.PROJECT
      ? QUOTATION_TYPES.PROJECT
      : QUOTATION_TYPES.PRODUCT

  const [duplicatedFromNo, setDuplicatedFromNo] = useState('')
  const [existingStatus, setExistingStatus] = useState('draft')
  const [quotationType, setQuotationType] = useState(initialQuotationType)

  // 1. ส่วนหัวเอกสารและข้อมูลอ้างอิง
  const [quotationNo, setQuotationNo] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [validityDays, setValidityDays] = useState('30')
  const [expiryDate, setExpiryDate] = useState('')
  const [salesPerson, setSalesPerson] = useState(profile?.full_name || 'มาเรียม จะปะกียา')
  const [currency, setCurrency] = useState('THB')

  // 2. ข้อมูลลูกค้า
  const [customers, setCustomers] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPostalCode, setCustomerPostalCode] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [customerBranch, setCustomerBranch] = useState('สำนักงานใหญ่')

  // 3. การเชื่อมโยงโครงการ & BOQ
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [boqsList, setBoqsList] = useState([])
  const [boqId, setBoqId] = useState('')
  const [refNo, setRefNo] = useState('')

  // 4. รายการสินค้าและบริการ
  const [warehouseName, setWarehouseName] = useState(WAREHOUSES[0])
  const [catalog, setCatalog] = useState([])
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  // 5. การคำนวณเงิน มาร์กอัป ส่วนลด และภาษี
  const [markupPercent, setMarkupPercent] = useState('0')
  const [discountMode, setDiscountMode] = useState(
    initialQuotationType === QUOTATION_TYPES.PRODUCT ? 'whole_bill' : 'none'
  ) // 'none' | 'whole_bill' | 'per_item'
  const [headerDiscountType, setHeaderDiscountType] = useState('amount') // 'amount' | 'percent'
  const [headerDiscountValue, setHeaderDiscountValue] = useState('0')
  const [taxType, setTaxType] = useState('vat_excluded') // 'vat_excluded' | 'vat_included' | 'vat_exempt'
  const [whtRate, setWhtRate] = useState('0') // '0' | '1' | '3'
  const [issuedBy, setIssuedBy] = useState('')
  const [issuedByName, setIssuedByName] = useState('')
  const [issuedAt, setIssuedAt] = useState('')

  // 6. เงื่อนไขและหมายเหตุ
  const [customerNotes, setCustomerNotes] = useState(
    '1. กำหนดยืนราคา 30 วันนับจากวันที่ออกเอกสาร\n2. กำหนดส่งมอบภายใน 7-14 วันหลังได้รับใบสั่งซื้อ\n3. เงื่อนไขการชำระเงิน: มัดจำ 30% วันสั่งจ้าง ส่วนที่เหลือชำระเมื่องานแล้วเสร็จ'
  )
  const [internalNotes, setInternalNotes] = useState('')
  const [signatureUrl, setSignatureUrl] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [attachmentName, setAttachmentName] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)
  const fileInputRef = useRef(null)
  const sigInputRef = useRef(null)

  // คำนวณวันหมดอายุอัตโนมัติเมื่อเปลี่ยนวันออกหรือระยะเวลายืนราคา
  useEffect(() => {
    if (issueDate && validityDays) {
      const d = new Date(issueDate)
      d.setDate(d.getDate() + Number(validityDays || 0))
      setExpiryDate(d.toISOString().split('T')[0])
    }
  }, [issueDate, validityDays])

  // สลับประเภทเอกสารในโหมดสร้างใหม่
  const handleSwitchQuotationType = (nextType) => {
    if (id || nextType === quotationType) return
    setQuotationType(nextType)
    setQuotationNo(generateTypedQuotationNo(nextType))
    if (nextType === QUOTATION_TYPES.PROJECT) {
      setDiscountMode('none')
      setHeaderDiscountValue('0')
    } else {
      setBoqId('')
      setDiscountMode('whole_bill')
      setMarkupPercent('0')
      setItems([{ ...EMPTY_ITEM }])
    }
  }

  // ฟังก์ชันดึงข้อมูลจาก BOQ มาใส่ในใบเสนอราคา (รับงาน)
  const applyBoqData = async (targetBoqId, boqPool = boqsList, custPool = customers) => {
    setBoqId(targetBoqId)
    if (!targetBoqId) return
    const selectedBoq = boqPool.find((b) => b.id === targetBoqId)
    if (!selectedBoq) return

    setQuotationType(QUOTATION_TYPES.PROJECT)
    if (!id) {
      setQuotationNo(generateTypedQuotationNo(QUOTATION_TYPES.PROJECT))
    }
    setDiscountMode('none')
    setHeaderDiscountValue('0')
    setMarkupPercent(String(Math.max(0, Number(selectedBoq.markup_percent) || 0)))
    setRefNo(selectedBoq.boq_no || '')
    if (selectedBoq.project_id) setProjectId(selectedBoq.project_id)

    const matchedCust = matchBoqCustomer(selectedBoq, custPool)
    if (matchedCust) {
      setCustomerName(matchedCust.customer_name)
      if (matchedCust.address) setCustomerAddress(matchedCust.address)
      if (matchedCust.postal_code) setCustomerPostalCode(matchedCust.postal_code)
      if (matchedCust.tax_id) setCustomerTaxId(matchedCust.tax_id)
      setCustomerBranch(formatCustomerBranchLabel(matchedCust))
    } else if (selectedBoq.customer_name) {
      setCustomerName(selectedBoq.customer_name)
    }

    if (selectedBoq.notes) {
      setCustomerNotes(selectedBoq.notes)
    }

    const { data: bItems } = await supabase
      .from('boq_items')
      .select('*')
      .eq('boq_id', targetBoqId)
      .order('sort_order', { ascending: true })

    if (bItems && bItems.length > 0) {
      const converted = buildQuotationItemsFromBoq(selectedBoq, bItems)
      setItems(
        converted.map((row) => ({
          item_id: row.item_id || '',
          item_code: row.item_code || '',
          item_name: row.item_name,
          description: row.description || '',
          quantity: String(row.quantity),
          unit: row.unit || 'ชุด',
          base_cost: String(row.base_cost ?? 0),
          unit_price: String(row.unit_price),
          discount_percent: '0',
        }))
      )
    }
  }

  // โหลดโครงการ, ลูกค้า (จาก contacts + customers), BOQ, แคตตาล็อกสินค้า Store
  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('id, project_code, project_name, client_name').order('project_code'),
      fetchUnifiedCustomers().catch(() => []),
      supabase.from('boqs').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory_items').select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost').order('item_name'),
    ]).then(([projRes, unifiedCusts, boqRes, invRes]) => {
      const projList = projRes.data ?? []
      const custList = unifiedCusts ?? []
      const bList = boqRes.error ? [] : boqRes.data ?? []
      setProjects(projList)
      setCustomers(custList)
      setBoqsList(bList)
      setCatalog(invRes.data ?? [])

      if (!id && boqIdParam) {
        applyBoqData(boqIdParam, bList, custList)
      }
    })

    if (!id) {
      setQuotationNo(generateTypedQuotationNo(initialQuotationType))

      if (duplicateFromId) {
        Promise.all([
          supabase.from('quotations').select('*').eq('id', duplicateFromId).single(),
          supabase.from('quotation_items').select('*').eq('quotation_id', duplicateFromId).order('id', { ascending: true }),
        ]).then(([qRes, itRes]) => {
          if (!qRes.error && qRes.data) {
            const q = qRes.data
            const srcType = resolveQuotationType(q)
            setQuotationType(srcType)
            setQuotationNo(generateTypedQuotationNo(srcType))
            setDuplicatedFromNo(q.quotation_no)
            setCustomerName(q.customer_name || '')
            setCustomerAddress(q.customer_address || '')
            setCustomerPostalCode(q.customer_postal_code || '')
            setCustomerTaxId(q.customer_tax_id || '')
            setCustomerBranch(q.customer_branch || 'สำนักงานใหญ่')
            setProjectId(q.project_id || '')
            setRefNo(q.ref_no || '')
            setBoqId(srcType === QUOTATION_TYPES.PROJECT ? q.boq_id || '' : '')
            setExistingStatus('draft')
            setWarehouseName(q.warehouse_name || WAREHOUSES[0])
            setMarkupPercent(String(Math.max(0, Number(q.markup_percent) || 0)))
            setDiscountMode(
              srcType === QUOTATION_TYPES.PROJECT
                ? 'none'
                : q.discount_mode && q.discount_mode !== 'none'
                  ? q.discount_mode
                  : 'whole_bill'
            )
            setHeaderDiscountType(q.header_discount_type || 'amount')
            setHeaderDiscountValue(String(Math.max(0, Number(q.header_discount_value) || 0)))
            setCustomerNotes(q.customer_notes || '')
            setInternalNotes(q.internal_notes || '')
            setTaxType(inferQuotationTaxType(q))
            setWhtRate(String(q.wht_rate || '0'))

            if (itRes.data && itRes.data.length > 0) {
              const mkPct = Math.max(0, Number(q.markup_percent) || 0)
              setItems(
                itRes.data.map((i) => {
                  const inferredCost =
                    i.base_cost != null
                      ? Number(i.base_cost)
                      : mkPct > 0
                        ? round2(Number(i.unit_price || 0) / (1 + mkPct / 100))
                        : Number(i.unit_price || 0)
                  return {
                    item_id: i.item_id || '',
                    item_code: i.item_code || '',
                    item_name: i.item_name,
                    description: i.description || '',
                    quantity: String(i.quantity),
                    unit: i.unit || '',
                    base_cost: String(round2(inferredCost)),
                    unit_price: String(i.unit_price),
                    discount_percent: srcType === QUOTATION_TYPES.PRODUCT ? String(i.discount_percent || 0) : '0',
                  }
                })
              )
            }
          }
        })
      }
    } else {
      // โหมดแก้ไข (รักษา Snapshot ราคาเดิม ไม่เปลี่ยนตาม Store/BOQ อัตโนมัติ)
      Promise.all([
        supabase.from('quotations').select('*').eq('id', id).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', id).order('id', { ascending: true }),
      ]).then(([qRes, itRes]) => {
        if (qRes.error) return setError('ไม่พบใบเสนอราคา')
        const q = qRes.data
        const loadedType = resolveQuotationType(q)
        setQuotationType(loadedType)
        setQuotationNo(q.quotation_no)
        setIssueDate(q.issue_date)
        setValidityDays(String(q.validity_days || 30))
        setExpiryDate(q.expiry_date || '')
        setSalesPerson(q.sales_person || '')
        setCurrency(q.currency || 'THB')
        setCustomerName(q.customer_name || '')
        setCustomerAddress(q.customer_address || '')
        setCustomerPostalCode(q.customer_postal_code || '')
        setCustomerTaxId(q.customer_tax_id || '')
        setCustomerBranch(q.customer_branch || 'สำนักงานใหญ่')
        setProjectId(q.project_id || '')
        setBoqId(q.boq_id || '')
        setRefNo(q.ref_no || '')
        setExistingStatus(q.status || 'draft')
        setWarehouseName(q.warehouse_name || WAREHOUSES[0])
        setMarkupPercent(String(Math.max(0, Number(q.markup_percent) || 0)))
        setDiscountMode(
          loadedType === QUOTATION_TYPES.PROJECT
            ? 'none'
            : q.discount_mode && q.discount_mode !== 'none'
              ? q.discount_mode
              : Number(q.discount_amount || 0) > 0 && !(itRes.data || []).some((x) => Number(x.discount_percent || 0) > 0)
                ? 'whole_bill'
                : (itRes.data || []).some((x) => Number(x.discount_percent || 0) > 0)
                  ? 'per_item'
                  : 'whole_bill'
        )
        setHeaderDiscountType(q.header_discount_type || 'amount')
        setHeaderDiscountValue(
          String(
            q.header_discount_value != null
              ? Number(q.header_discount_value)
              : Number(q.discount_amount || 0)
          )
        )
        setCustomerNotes(q.customer_notes || '')
        setInternalNotes(q.internal_notes || '')
        setSignatureUrl(q.signature_url || '')
        setAttachmentUrl(q.attachment_url || '')
        setIssuedBy(q.issued_by || '')
        setIssuedByName(q.issued_by_name || '')
        setIssuedAt(q.issued_at || '')
        setTaxType(inferQuotationTaxType(q))
        setWhtRate(String(q.wht_rate || '0'))

        if (itRes.data && itRes.data.length > 0) {
          const mkPct = Math.max(0, Number(q.markup_percent) || 0)
          setItems(
            itRes.data.map((i) => {
              const inferredCost =
                i.base_cost != null
                  ? Number(i.base_cost)
                  : mkPct > 0
                    ? round2(Number(i.unit_price || 0) / (1 + mkPct / 100))
                    : Number(i.unit_price || 0)
              return {
                id: i.id,
                item_id: i.item_id || '',
                item_code: i.item_code || '',
                item_name: i.item_name,
                description: i.description || '',
                quantity: String(i.quantity),
                unit: i.unit || '',
                base_cost: String(round2(inferredCost)),
                unit_price: String(i.unit_price),
                discount_percent: loadedType === QUOTATION_TYPES.PRODUCT ? String(i.discount_percent || 0) : '0',
              }
            })
          )
        }
      })
    }
  }, [id])

  // เมื่อเลือกลูกค้าจากรายชื่อเดิม
  const handleSelectCustomer = (cName) => {
    setCustomerName(cName)
    const found = customers.find((c) => (c.customer_name || '').toLowerCase() === (cName || '').trim().toLowerCase())
    if (found) {
      if (found.address) setCustomerAddress(found.address)
      if (found.postal_code) setCustomerPostalCode(found.postal_code)
      if (found.tax_id) setCustomerTaxId(found.tax_id)
      if (found.branch_no) setCustomerBranch(found.branch_type === 'head_office' ? 'สำนักงานใหญ่' : `สาขาที่ ${found.branch_no}`)
    }
  }

  // ตัวเลือกสำหรับ SearchableSelect ของลูกค้า
  const customerOptions = customers.map((c) => ({
    value: c.customer_name,
    label: c.customer_name,
    subLabel: [c.customer_code, c.branch_no ? `สาขา ${c.branch_no}` : '', c.phone].filter(Boolean).join(' • '),
    badge: c.tax_id ? `Tax: ${c.tax_id}` : '',
    keywords: `${c.customer_code || ''} ${c.tax_id || ''} ${c.address || ''} ${c.phone || ''}`,
  }))

  // เมื่อเลือกโครงการ ให้ดึงชื่อลูกค้าถ้าโครงการมีระบุ
  const handleSelectProject = (pId) => {
    setProjectId(pId)
    const found = projects.find((p) => p.id === pId)
    if (found && found.client_name && !customerName) {
      setCustomerName(found.client_name)
    }
  }

  // เลือกสินค้าจาก Store เข้าแถวรายการ (สำหรับประเภทขายสินค้า)
  const handleSelectCatalogItem = (index, invId) => {
    const selectedInv = catalog.find((c) => c.id === invId) || null
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        if (!selectedInv) {
          return {
            ...it,
            item_id: '',
            item_code: '',
            item_name: '',
            base_cost: '0',
          }
        }
        return {
          ...it,
          item_id: selectedInv.id,
          item_code: selectedInv.item_code || '',
          item_name: selectedInv.item_name || '',
          unit: selectedInv.unit || it.unit || 'ชิ้น',
          base_cost: String(round2(selectedInv.avg_unit_cost || 0)),
        }
      })
    )
  }

  // ซิงค์ต้นทุนล่าสุดจาก Store เฉพาะตอนยังเป็นฉบับร่าง (Draft) เท่านั้น
  const handleSyncStoreCosts = () => {
    if (existingStatus !== 'draft') return
    setItems((prev) => syncDraftItemsFromStore(prev, catalog, existingStatus))
  }

  // อัปเดตรายการสินค้า
  const updItem = (index, key, val) => {
    const next = items.map((it, idx) => {
      if (idx !== index) return it
      const updated = { ...it, [key]: val }
      // บังคับจำนวนวัสดุให้เป็นจำนวนเต็มเฉพาะโหมดขายสินค้า (โหมดรับงาน BOQ รองรับทศนิยม)
      if (key === 'quantity' && isProductMode) {
        const cleanInt = val === '' ? '' : String(Math.max(1, parseInt(val, 10) || 1))
        updated.quantity = cleanInt
      }
      if (key === 'item_name') {
        const found = catalog.find((c) => c.item_name.toLowerCase() === String(val).trim().toLowerCase())
        updated.item_id = found ? found.id : ''
        updated.item_code = found?.item_code || ''
        if (found) {
          if (!updated.unit && found.unit) updated.unit = found.unit
          if (!Number(updated.base_cost) && found.avg_unit_cost) {
            updated.base_cost = String(round2(found.avg_unit_cost))
          }
          if (!Number(updated.unit_price) && found.avg_unit_cost) {
            updated.unit_price = String(round2(found.avg_unit_cost))
          }
        }
      }
      return updated
    })
    setItems(next)
  }

  // คำนวณยอดเงินด้วย Unified Pricing Pipeline ชุดเดียวกับ BOQ
  const isProductMode = quotationType === QUOTATION_TYPES.PRODUCT
  const effectiveDiscountMode = isProductMode ? discountMode : 'none'

  const pricing = useMemo(
    () =>
      calculateDocumentPricing({
        items,
        markupPercent,
        pricingFromCost: isProductMode,
        discountMode: effectiveDiscountMode,
        headerDiscountType,
        headerDiscountValue,
        taxType,
        vatRate: 7,
        whtRate,
      }),
    [
      items,
      markupPercent,
      isProductMode,
      effectiveDiscountMode,
      headerDiscountType,
      headerDiscountValue,
      taxType,
      whtRate,
    ]
  )

  const liveStockRows = useMemo(
    () => checkQuotationStock(items, catalog),
    [items, catalog]
  )

  const lineTotals = pricing.lineRows
  const subtotal = pricing.subtotal
  const totalDiscount = pricing.discountAmount
  const afterDiscount = pricing.afterDiscount
  const amountBeforeVat = pricing.amountBeforeVat
  const vatAmount = pricing.vatAmount
  const totalWithVat = pricing.totalWithVat
  const whtAmount = pricing.whtAmount
  const grandTotal = pricing.grandTotal

  // จัดการอัปโหลดไฟล์แนบและลายเซ็น
  const handleUploadFile = async (e, type) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setBusy(true)
      let url = null
      try {
        url = await uploadQuotationFile(file)
      } catch (uploadErr) {
        console.warn('API upload failed, fallback to DataURL:', uploadErr)
        url = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }
      if (type === 'signature') {
        setSignatureUrl(url)
      } else {
        setAttachmentUrl(url)
        setAttachmentName(file.name)
      }
    } catch (err) {
      setError('อัปโหลดไฟล์ไม่สำเร็จ: ' + (err.message || ''))
    } finally {
      setBusy(false)
    }
  }

  // บันทึกใบเสนอราคา
  async function save() {
    setError('')
    const newErrors = {}

    if (!quotationNo.trim()) {
      newErrors.quotationNo = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุเลขที่เอกสาร)'
    }
    if (!customerName.trim()) {
      newErrors.customerName = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาระบุชื่อลูกค้า/บริษัท)'
    }
    if (!issueDate) {
      newErrors.issueDate = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุวันที่ออกเอกสาร)'
    }

    if (Number(markupPercent) < 0 || isNaN(Number(markupPercent))) {
      newErrors.markupPercent = 'อัตรามาร์กอัป % ห้ามติดลบ'
    }

    // กรองเอาเฉพาะแถวที่มีการกรอกชื่อสินค้าจริง (ตัดแถวว่างทิ้งอัตโนมัติ)
    const validItems = (items || []).filter(
      (i) => i.item_name && i.item_name.trim()
    )

    if (validItems.length === 0) {
      setShowItemErrors(true)
      newErrors.items = 'รายการสินค้า/บริการยังไม่ได้กรอก (กรุณาระบุอย่างน้อย 1 รายการ)'
    } else {
      const hasInvalidItem = validItems.some((i) => {
        const invalidQty = !i.quantity || Number(i.quantity) <= 0 || isNaN(Number(i.quantity))
        const invalidCostOrPrice = isProductMode
          ? i.base_cost === '' || isNaN(Number(i.base_cost)) || Number(i.base_cost) < 0
          : i.unit_price === '' || isNaN(Number(i.unit_price)) || Number(i.unit_price) < 0
        return invalidQty || invalidCostOrPrice
      })
      if (hasInvalidItem) {
        setShowItemErrors(true)
        newErrors.items = isProductMode
          ? 'รายการสินค้ามีช่องที่ยังไม่กรอกครบถ้วน (กรุณาระบุสินค้า จำนวน > 0 และต้นทุน >= 0)'
          : 'รายการสินค้า/บริการมีช่องที่ยังไม่กรอกครบถ้วน (กรุณาระบุจำนวน > 0 และราคาต่อหน่วย)'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setError('ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอกครบถ้วน (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setBusy(true)

    const isUUID = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

    const matchedCust = customers.find(
      (c) => (c.customer_name || '').toLowerCase() === customerName.trim().toLowerCase()
    )
    const resolvedCustomerId = matchedCust
      ? await ensureLegacyCustomerId(matchedCust).catch(() => null)
      : null

    const savePricing = calculateDocumentPricing({
      items: validItems,
      markupPercent,
      pricingFromCost: isProductMode,
      discountMode: effectiveDiscountMode,
      headerDiscountType,
      headerDiscountValue,
      taxType,
      vatRate: 7,
      whtRate,
    })

    const targetStatus = id ? existingStatus : 'draft'
    const isIssuedDoc = targetStatus !== 'draft'
    const resolvedIssuerId = isIssuedDoc
      ? isUUID(issuedBy)
        ? issuedBy
        : isUUID(profile?.id)
        ? profile.id
        : null
      : isUUID(issuedBy)
      ? issuedBy
      : null
    const resolvedIssuerName = isIssuedDoc
      ? issuedByName || profile?.full_name || salesPerson.trim() || null
      : issuedByName || null
    const resolvedIssuedAt = isIssuedDoc ? issuedAt || new Date().toISOString() : issuedAt || null

    const payload = {
      quotation_no: quotationNo.trim(),
      type: quotationType,
      issue_date: issueDate,
      quotation_date: issueDate, // รองรับ schema ทั้งสองเวอร์ชัน
      validity_days: parseInt(validityDays, 10) || 30,
      expiry_date: expiryDate || null,
      valid_until: expiryDate || null,
      sales_person: salesPerson.trim() || null,
      currency: currency || 'THB',
      customer_id: isUUID(resolvedCustomerId) ? resolvedCustomerId : null,
      customer_name: customerName.trim(),
      customer_address: customerAddress.trim() || null,
      customer_postal_code: customerPostalCode.trim() || null,
      customer_tax_id: customerTaxId.trim() || null,
      customer_branch: customerBranch.trim() || 'สำนักงานใหญ่',
      project_id: isUUID(projectId) ? projectId : null,
      boq_id: quotationType === QUOTATION_TYPES.PROJECT && isUUID(boqId) ? boqId : null,
      ref_no: refNo.trim() || null,
      warehouse_name: warehouseName || 'สโตร์หลัก',
      markup_percent: savePricing.markupPercent,
      discount_mode: savePricing.discountMode,
      header_discount_type:
        savePricing.discountMode === 'whole_bill' ? headerDiscountType : 'amount',
      header_discount_value:
        savePricing.discountMode === 'whole_bill'
          ? Math.max(0, round2(headerDiscountValue))
          : 0,
      total_cost: savePricing.totalCost,
      subtotal: savePricing.subtotal,
      discount_amount: savePricing.discountAmount,
      after_discount: savePricing.afterDiscount,
      tax_type: taxType,
      vat_rate: taxType === 'vat_exempt' ? 0 : 7,
      vat_amount: savePricing.vatAmount,
      wht_rate: Number(whtRate) || 0,
      wht_amount: savePricing.whtAmount,
      grand_total: savePricing.grandTotal,
      total_amount: savePricing.grandTotal, // รองรับ schema ทั้งสองเวอร์ชัน
      customer_notes: customerNotes.trim() || null,
      notes: customerNotes.trim() || null,
      internal_notes: internalNotes.trim() || null,
      signature_url: signatureUrl || null,
      attachment_url: attachmentUrl || null,
      issued_by: resolvedIssuerId,
      issued_by_name: resolvedIssuerName,
      issued_at: resolvedIssuedAt,
      status: targetStatus,
      updated_at: new Date().toISOString(),
    }

    if (isUUID(profile?.id)) {
      payload.created_by = profile.id
    }

    try {
      const currentId = isUUID(id) ? id : null
      const savedHeader = await saveQuotationWithFallback(supabase, payload, currentId)
      const savedId = savedHeader?.id || currentId || id || quotationNo.trim()
      if (savedHeader?.quotation_no) {
        setQuotationNo(savedHeader.quotation_no)
      }

      if (!id && quotationType === QUOTATION_TYPES.PROJECT && isUUID(boqId)) {
        await supabase.from('boqs').update({ status: 'converted_to_quotation' }).eq('id', boqId)
      }

      // บันทึกรายการย่อยพร้อม Snapshot ต้นทุน (`base_cost`) และราคาขายสุทธิ (`unit_price`, `total_amount`)
      if (savedId && isUUID(savedId)) {
        try {
          await supabase.from('quotation_items').delete().eq('quotation_id', savedId)
          const itemRows = validItems.map((it, idx) => {
            const lineCalc = savePricing.lineRows[idx]
            const qty = isProductMode
              ? Math.max(1, parseInt(it.quantity, 10) || 1)
              : Number(it.quantity) > 0
                ? Number(it.quantity)
                : 1
            return {
              quotation_id: savedId,
              item_id: isUUID(it.item_id) ? it.item_id : null,
              item_code: it.item_code || null,
              item_name: it.item_name.trim(),
              description: it.description?.trim() || null,
              quantity: qty,
              unit: it.unit?.trim() || 'ชิ้น',
              base_cost: lineCalc?.baseUnitCost ?? round2(it.base_cost || 0),
              unit_price: lineCalc?.unitSellingPrice ?? round2(it.unit_price || 0),
              discount_percent: lineCalc?.itemDiscountPercent ?? 0,
              total_amount: lineCalc?.lineTotal ?? 0,
            }
          })
          const { error: itErr } = await saveQuotationItemsWithFallback(supabase, itemRows)
          if (itErr) console.warn('Items insert warning:', itErr)
        } catch (itEx) {
          console.warn('Items insert exception:', itEx)
        }
      }

      navigate(`/quotations/${savedId}`)
    } catch (err) {
      console.error('Final quotation save error:', err)
      setError(err.message || 'บันทึกใบเสนอราคาไม่สำเร็จ')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full space-y-6 pb-16">
      {/* 0. แบนเนอร์หัวหน้าเอกสาร (Executive Corporate ERP Banner) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-steel-900 p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/20 border border-sky-400/30 text-sky-400 backdrop-blur-xs">
              <ReceiptText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-300 border border-sky-400/30 font-bold">
                  Quotation Management
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${isProductMode
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                      : 'bg-amber-400/20 text-amber-200 border-amber-400/40'
                    }`}
                >
                  {isProductMode ? 'ขายสินค้า (Store · QT-S)' : 'รับงาน (BOQ · QT-P)'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {id ? `ID: ${id}` : 'Draft Mode'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                {id ? `แก้ไขใบเสนอราคา ${quotationNo}` : 'สร้างใบเสนอราคาใหม่ (New Quotation)'}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                จัดทำเอกสารเสนอราคาอย่างเป็นระบบ คำนวณภาษี ส่วนลด และผูกกับโปรเจกต์งานวิศวกรรม
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/quotations"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700/80 hover:text-white transition shadow-2xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>กลับหน้ารายการ</span>
            </Link>
          </div>
        </div>
      </div>

      {/* แจ้งเตือนเมื่อคัดลอกมาจากเอกสารเดิม */}
      {duplicatedFromNo && (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/90 dark:bg-sky-950/40 p-4 text-xs text-sky-900 dark:text-sky-300 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>กำลังสร้างใบเสนอราคาใหม่โดยคัดลอกข้อมูลจาก: <strong className="font-mono text-sky-800 dark:text-sky-200">{duplicatedFromNo}</strong></span>
          </div>
          <span className="text-[11px] text-sky-800 dark:text-sky-300 font-bold bg-sky-200/70 dark:bg-sky-900/60 px-3 py-1 rounded-full border border-sky-300 dark:border-sky-700">
            สำเนาฉบับร่างใหม่
          </span>
        </div>
      )}

      {/* กล่องแสดง Error */}
      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 p-4 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* การ์ดที่ 1: ส่วนหัวเอกสาร ประเภท และข้อมูลโครงการ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>1. ข้อมูลหัวเอกสาร ประเภท และโครงการ (Header &amp; Type)</span>
          </h2>
          {!id ? (
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1 text-xs">
              <button
                type="button"
                onClick={() => handleSwitchQuotationType(QUOTATION_TYPES.PRODUCT)}
                className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${isProductMode
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                  }`}
              >
                ขายสินค้า (Store · QT-S)
              </button>
              <button
                type="button"
                onClick={() => handleSwitchQuotationType(QUOTATION_TYPES.PROJECT)}
                className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${!isProductMode
                    ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                  }`}
              >
                รับงาน (BOQ · QT-P)
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-mono">
              Type: {isProductMode ? 'ขายสินค้า (product)' : 'รับงาน (project)'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เลขที่เอกสาร (Auto) *
            </label>
            <input
              className={fieldErrorClass(
                errors.quotationNo,
                'input text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800/80 text-sky-700 dark:text-sky-400 border-slate-200 dark:border-slate-700'
              )}
              value={quotationNo}
              onChange={(e) => {
                setQuotationNo(e.target.value)
                if (errors.quotationNo) setErrors((prev) => ({ ...prev, quotationNo: '' }))
              }}
              placeholder="เช่น QT2026110012"
            />
            <FieldError error={errors.quotationNo} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              วันที่ออกเอกสาร *
            </label>
            <input
              type="date"
              className={fieldErrorClass(errors.issueDate, 'input text-xs')}
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value)
                if (errors.issueDate) setErrors((prev) => ({ ...prev, issueDate: '' }))
              }}
            />
            <FieldError error={errors.issueDate} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              กำหนดยืนราคา (วัน) *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                className="input text-xs w-24 text-center font-bold font-mono"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                วัน (หมดอายุ: <b className="text-slate-700 dark:text-slate-300">{expiryDate || '-'}</b>)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              พนักงานขาย / ผู้เสนอ *
            </label>
            <input
              className="input text-xs"
              value={salesPerson}
              onChange={(e) => setSalesPerson(e.target.value)}
              placeholder="ชื่อผู้รับผิดชอบ"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              สกุลเงิน (Currency)
            </label>
            <select
              className="input text-xs"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เชื่อมโยงโปรเจกต์ (โครงการ)
            </label>
            <SearchableProjectSelect
              projects={projects}
              value={projectId}
              onChange={(val) => handleSelectProject(val)}
              placeholder="พิมพ์รหัส หรือชื่อโครงการเพื่อค้นหา..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เลขที่อ้างอิง (Ref No.)
            </label>
            <input
              className="input text-xs"
              placeholder="เช่น REF-6901 / เลขที่สั่งจ้าง"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
            />
          </div>

          {!id && !isProductMode && boqsList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                ดึงรายการขายสุทธิจาก BOQ *
              </label>
              <select
                className="input text-xs"
                value={boqId}
                onChange={(e) => applyBoqData(e.target.value)}
              >
                <option value="">-- เลือกเอกสาร BOQ --</option>
                {boqsList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.boq_no} · {b.title || b.customer_name || 'BOQ'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* การ์ดที่ 2: ข้อมูลลูกค้าและสถานที่ส่งมอบ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>2. ข้อมูลลูกค้าและสถานที่ส่งมอบ (Customer & Delivery Info)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Client Profile</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ชื่อลูกค้า / บริษัทลูกค้า *
            </label>
            <SearchableSelect
              options={customerOptions}
              value={customerName}
              onChange={(val) => {
                handleSelectCustomer(val)
                if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }))
              }}
              onCustomChange={(val) => {
                setCustomerName(val)
                if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }))
              }}
              allowCustom={true}
              placeholder="พิมพ์ค้นหาชื่อลูกค้า, เลขภาษี หรือพิมพ์ชื่อลูกค้าใหม่..."
              customPlaceholder="กด Enter เพื่อใช้ชื่อลูกค้ารายใหม่นี้"
              error={errors.customerName}
            />
            <FieldError error={errors.customerName} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เลขประจำตัวผู้เสียภาษี
            </label>
            <input
              className="input text-xs font-mono"
              placeholder="เลข 13 หลัก"
              maxLength={13}
              value={customerTaxId}
              onChange={(e) => setCustomerTaxId(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ที่อยู่สำหรับออกเอกสาร
            </label>
            <input
              className="input text-xs"
              placeholder="เลขที่ อาคาร ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              รหัสไปรษณีย์
            </label>
            <input
              className="input text-xs w-full font-mono"
              placeholder="เช่น 10330"
              maxLength={5}
              value={customerPostalCode}
              onChange={(e) => setCustomerPostalCode(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              สำนักงาน / สาขา
            </label>
            <input
              className="input text-xs"
              placeholder="สำนักงานใหญ่ หรือ สาขาที่ 00001"
              value={customerBranch}
              onChange={(e) => setCustomerBranch(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เลือกคลังสินค้าส่งมอบ (Warehouse)
            </label>
            <select
              className="input text-xs"
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
            >
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* การ์ดที่ 3: ตารางรายการสินค้าและบริการ (Itemized Table) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>
                {isProductMode
                  ? '3. เลือกสินค้าจากสโตร์ & ต้นทุนตั้งต้น (Store Product Selection)'
                  : '3. รายการงานและวัสดุจาก BOQ (Project Items)'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isProductMode
                ? 'เลือกสินค้าจาก Store (ราคาตั้งต้น = ต้นทุนเฉลี่ย Store แก้ไขได้) ระบบเช็กสต็อกอัตโนมัติโดยยังไม่เปิด PR'
                : 'ดึงราคาเสนอขายสุทธิจาก BOQ (ไม่มีส่วนลดและไม่มีต้นทุนต่อบรรทัดฝั่งลูกค้า)'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isProductMode && (!id || existingStatus === 'draft') && (
              <button
                type="button"
                onClick={handleSyncStoreCosts}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-3 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition cursor-pointer"
                title="ดึงต้นทุนเฉลี่ยล่าสุดจาก Store เฉพาะขณะที่ใบเสนอราคายังเป็นฉบับร่าง (Draft)"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>ซิงค์ต้นทุนล่าสุดจาก Store</span>
              </button>
            )}
            {id && existingStatus !== 'draft' && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Snapshot ราคาถูกล็อกแล้ว ({existingStatus})
              </span>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              คลังสินค้า: <b className="text-slate-800 dark:text-slate-200">{warehouseName}</b>
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {items.length} รายการ
            </span>
          </div>
        </div>

        <datalist id="catalog-quotation-items">
          {catalog.map((c) => (
            <option key={c.id} value={c.item_name}>
              [{c.item_code}] {c.unit ? `(${c.unit})` : ''}
            </option>
          ))}
        </datalist>

        <div className="space-y-4">
          {/* หัวคอลัมน์มาตรฐานสำหรับหน้าจอคอมพิวเตอร์ */}
          <div
            className={`hidden lg:grid gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 px-3 pb-1.5 border-b border-slate-100 dark:border-slate-800 ${isProductMode
                ? effectiveDiscountMode === 'per_item'
                  ? 'lg:grid-cols-[auto_1fr_5.5rem_4.5rem_6.5rem_6.5rem_5rem_7.5rem_auto]'
                  : 'lg:grid-cols-[auto_1fr_5.5rem_4.5rem_7rem_7rem_7.5rem_auto]'
                : 'lg:grid-cols-[auto_1fr_6rem_5rem_7.5rem_8rem_auto]'
              }`}
          >
            <span className="w-8 text-center">#</span>
            <span>{isProductMode ? 'เลือกสินค้าจาก Store *' : 'ชื่อสินค้า / รายการงานวิศวกรรม *'}</span>
            <span className="text-right">จำนวน</span>
            <span className="text-center">หน่วย</span>
            {isProductMode && <span className="text-right">ต้นทุน/หน่วย</span>}
            <span className="text-right">{isProductMode ? 'ราคาขาย/หน่วย' : 'ราคา/หน่วย'}</span>
            {isProductMode && effectiveDiscountMode === 'per_item' && (
              <span className="text-right">ส่วนลด %</span>
            )}
            <span className="text-right">ราคารวม ({currency})</span>
            <span className="w-12 text-center font-bold text-rose-600 dark:text-rose-400">ลบ</span>
          </div>

          {items.map((it, idx) => {
            const calc = lineTotals[idx]
            const stock = liveStockRows[idx]
            const nameEmpty = showItemErrors && !it.item_name?.trim()
            const qtyEmpty = showItemErrors && (!it.quantity || Number(it.quantity) <= 0)
            const costOrPriceEmpty =
              showItemErrors &&
              (isProductMode
                ? it.base_cost === '' || isNaN(Number(it.base_cost)) || Number(it.base_cost) < 0
                : it.unit_price === '' || isNaN(Number(it.unit_price)) || Number(it.unit_price) < 0)

            return (
              <div
                key={idx}
                className={`rounded-2xl border p-4 space-y-3 transition shadow-xs ${nameEmpty || qtyEmpty || costOrPriceEmpty
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50/25 dark:bg-rose-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
              >
                {/* แถวที่ 1: ข้อมูลสินค้าและตัวเลขราคา */}
                <div
                  className={`grid grid-cols-2 gap-2.5 items-center ${isProductMode
                      ? effectiveDiscountMode === 'per_item'
                        ? 'lg:grid-cols-[auto_1fr_5.5rem_4.5rem_6.5rem_6.5rem_5rem_7.5rem_auto]'
                        : 'lg:grid-cols-[auto_1fr_5.5rem_4.5rem_7rem_7rem_7.5rem_auto]'
                      : 'lg:grid-cols-[auto_1fr_6rem_5rem_7.5rem_8rem_auto]'
                    }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 font-mono font-bold text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                    #{idx + 1}
                  </span>

                  <div className="col-span-2 lg:col-span-1 space-y-1.5">
                    {isProductMode ? (
                      <>
                        {it.item_name && !it.item_id && (
                          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                            รายการเดิม: {it.item_name} (เลือกจาก Store ด้านล่างเพื่อผูกสต็อก)
                          </div>
                        )}
                        <SearchableItemSelect
                          items={catalog}
                          value={it.item_id || ''}
                          onChange={(invId) => handleSelectCatalogItem(idx, invId)}
                          placeholder="พิมพ์รหัส หรือชื่อสินค้าจาก Store..."
                          error={nameEmpty ? 'กรุณาเลือกสินค้าจาก Store' : ''}
                        />
                      </>
                    ) : (
                      <>
                        <input
                          list="catalog-quotation-items"
                          className={fieldErrorClass(
                            nameEmpty,
                            'input text-xs w-full font-bold text-slate-900 dark:text-slate-100 placeholder:font-normal'
                          )}
                          placeholder="ระบุชื่อสินค้า / บริการ หรือเลือกจากคลังสินค้า..."
                          value={it.item_name}
                          onChange={(e) => updItem(idx, 'item_name', e.target.value)}
                        />
                        {nameEmpty && <FieldError error="กรุณาระบุชื่อสินค้า/บริการ" />}
                      </>
                    )}
                  </div>

                  <div>
                    <input
                      type="number"
                      min="1"
                      step={isProductMode ? '1' : 'any'}
                      className={fieldErrorClass(
                        qtyEmpty,
                        'input text-xs text-right w-full font-mono font-bold'
                      )}
                      placeholder="จำนวน"
                      value={it.quantity}
                      onChange={(e) => updItem(idx, 'quantity', e.target.value)}
                    />
                  </div>

                  <div>
                    <input
                      className="input text-xs text-center w-full"
                      placeholder="หน่วย"
                      value={it.unit}
                      onChange={(e) => updItem(idx, 'unit', e.target.value)}
                    />
                  </div>

                  {isProductMode && (
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={fieldErrorClass(
                          costOrPriceEmpty,
                          'input text-xs text-right w-full font-mono font-semibold text-amber-800 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                        )}
                        placeholder="ต้นทุน/หน่วย"
                        value={it.base_cost}
                        onChange={(e) => updItem(idx, 'base_cost', e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    {isProductMode ? (
                      <div
                        className="text-right font-mono font-bold text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 py-2 px-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800"
                        title="ราคาขายต่อหน่วย (ปัด 2 ตำแหน่งหลังบวก Markup %)"
                      >
                        {baht(calc?.unitSellingPrice ?? 0)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={fieldErrorClass(
                          costOrPriceEmpty,
                          'input text-xs text-right w-full font-mono'
                        )}
                        placeholder="ราคา/หน่วย"
                        value={it.unit_price}
                        onChange={(e) => updItem(idx, 'unit_price', e.target.value)}
                      />
                    )}
                  </div>

                  {isProductMode && effectiveDiscountMode === 'per_item' && (
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="input text-xs text-right w-full font-mono"
                        placeholder="ลด %"
                        value={it.discount_percent}
                        onChange={(e) => updItem(idx, 'discount_percent', e.target.value)}
                      />
                    </div>
                  )}

                  <div className="col-span-2 lg:col-span-1 text-right font-mono font-black text-xs text-sky-900 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 py-2 px-3 rounded-xl border border-sky-100 dark:border-sky-800">
                    {baht(calc?.lineTotal ?? 0)}
                  </div>

                  <div className="flex justify-end lg:justify-center">
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                      className="h-9 px-3 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl transition cursor-pointer border border-rose-200 dark:border-rose-900 shadow-2xs flex items-center justify-center gap-1.5 font-bold text-xs disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
                      title={items.length <= 1 ? 'รายการต้องมีอย่างน้อย 1 แถว' : 'ลบแถวนี้'}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="hidden xl:inline text-[11px]">ลบ</span>
                    </button>
                  </div>
                </div>

                {/* แถบสถานะเช็กสต็อกอัตโนมัติ (ภายในเท่านั้น — ไม่เปิด PR และไม่แสดงใน PDF) */}
                {it.item_name?.trim() && stock && stock.status !== 'service' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Warehouse className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span>สถานะสต็อกคงเหลือ (เช็กอัตโนมัติ ณ ตอนนี้ — ยังไม่เปิด PR):</span>
                    </span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full border ${stock.status === 'enough'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : stock.status === 'partial'
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}
                    >
                      {stock.status === 'enough'
                        ? `พร้อมเบิก (มี ${formatIntQty(stock.inStock)})`
                        : stock.status === 'partial'
                          ? `มีบางส่วน ${formatIntQty(stock.inStock)} / ขาด ${formatIntQty(stock.shortfall)}`
                          : stock.status === 'not_in_inventory'
                            ? `ไม่มีในคลัง (ขาด ${formatIntQty(stock.shortfall)})`
                            : `ของหมด (ขาด ${formatIntQty(stock.shortfall)})`}
                    </span>
                  </div>
                )}

                {/* แถวที่ 2: Richbox / Textarea ขยายลงล่าง สำหรับสเปกและรายละเอียด */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      <span>รายละเอียดเฉพาะ / สเปกวิศวกรรม (กด Enter ขึ้นบรรทัดใหม่ได้อิสระ)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      รองรับข้อความหลายบรรทัดและหัวข้อย่อย
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-slate-900 dark:focus:border-amber-500 focus:outline-none transition leading-relaxed font-sans"
                    placeholder="เช่น • แผงโซล่าเซลล์ชนิด Monocrystalline Half-cell 550W Tier-1&#10;• รับประกันตัวผลิตภัณฑ์ 12 ปี และรับประกันประสิทธิภาพการผลิตไฟ 25 ปี&#10;• ได้รับมาตรฐานสากล TUV Rheinland / IEC 61215"
                    value={it.description || ''}
                    onChange={(e) => updItem(idx, 'description', e.target.value)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="pt-2 flex justify-between items-center">
          <button
            type="button"
            onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-4 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition cursor-pointer shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            <span>เพิ่มรายการสินค้า/บริการ</span>
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            รวมรายการทั้งหมด <b>{items.length}</b> แถว
          </span>
        </div>
      </div>

      {/* การ์ดที่ 4: การคำนวณเงินและภาษี (Financial Calculations) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>4. การคำนวณเงินและภาษี (Financial Summary & Tax Settings)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Tax & Totals</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            {isProductMode ? (
              <>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>มาร์กอัปทั้งใบ (Markup %) *</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      +{baht(pricing.markupAmount)} {currency}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={fieldErrorClass(
                        errors.markupPercent,
                        'input text-xs font-mono font-bold text-right w-32'
                      )}
                      value={markupPercent}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || Number(raw) >= 0) {
                          setMarkupPercent(raw)
                        } else {
                          setMarkupPercent('0')
                        }
                        if (errors.markupPercent) setErrors((prev) => ({ ...prev, markupPercent: '' }))
                      }}
                    />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">% (บวกครั้งเดียวทั้งใบ · ห้ามติดลบ)</span>
                  </div>
                  <FieldError error={errors.markupPercent} />
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-4 space-y-3">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                    รูปแบบส่วนลด (Discount Mode)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setDiscountMode('whole_bill')}
                      className={`rounded-xl border px-3 py-2 font-bold transition cursor-pointer ${discountMode === 'whole_bill'
                          ? 'border-sky-600 bg-sky-700 text-white shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      ส่วนลดทั้งใบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountMode('per_item')}
                      className={`rounded-xl border px-3 py-2 font-bold transition cursor-pointer ${discountMode === 'per_item'
                          ? 'border-sky-600 bg-sky-700 text-white shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      ส่วนลดต่อรายการ (% รายแถว)
                    </button>
                  </div>

                  {discountMode === 'whole_bill' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input text-xs font-mono font-bold text-right flex-1"
                        placeholder="จำนวนส่วนลด"
                        value={headerDiscountValue}
                        onChange={(e) => {
                          const raw = e.target.value
                          setHeaderDiscountValue(raw === '' || Number(raw) >= 0 ? raw : '0')
                        }}
                      />
                      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setHeaderDiscountType('amount')}
                          className={`rounded-lg px-2.5 py-1 font-bold transition cursor-pointer ${headerDiscountType === 'amount'
                              ? 'bg-sky-700 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                            }`}
                        >
                          บาท
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeaderDiscountType('percent')}
                          className={`rounded-lg px-2.5 py-1 font-bold transition cursor-pointer ${headerDiscountType === 'percent'
                              ? 'bg-sky-700 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                            }`}
                        >
                          %
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-300">
                <div className="font-bold">ใบเสนอราคารับงาน (BOQ · QT-P)</div>
                <div className="text-[11px] mt-0.5">
                  ใช้ราคาเสนอขายสุทธิจาก BOQ (Markup +{pricing.markupPercent}%) และไม่มีส่วนลดในเอกสาร
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                การคิดภาษีมูลค่าเพิ่ม (สวิตช์ VAT) *
              </label>
              <select
                className="input text-xs"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value)}
              >
                <option value="vat_excluded">เปิด VAT — ราคาแยกภาษีมูลค่าเพิ่ม +7% (VAT Excluded)</option>
                <option value="vat_included">เปิด VAT — ราคารวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Included)</option>
                <option value="vat_exempt">ปิด VAT — ไม่มีภาษี / ยกเว้น (0%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                หักภาษี ณ ที่จ่าย (Withholding Tax - WHT)
              </label>
              <select
                className="input text-xs"
                value={whtRate}
                onChange={(e) => setWhtRate(e.target.value)}
              >
                <option value="0">ไม่หักภาษี ณ ที่จ่าย (0%)</option>
                <option value="1">หัก 1% (ค่าขนส่ง)</option>
                <option value="3">หัก 3% (ค่าบริการ / ค่าจ้างทำของ / ค่าเช่า)</option>
              </select>
            </div>
          </div>

          {/* สรุปการเงินระดับบริหาร (Executive Financial Card) */}
          <div className="space-y-3">
            {pricing.isBelowCost && (
              <div className="rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5 shadow-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-black text-rose-700 dark:text-rose-300">
                    คำเตือน: ราคาหลังหักส่วนลดต่ำกว่าต้นทุนรวม (-{baht(pricing.belowCostAmount)} {currency})
                  </div>
                  <div className="text-[11px] text-amber-900 dark:text-amber-300">
                    ระบบอนุญาตให้ออกใบได้โดยไม่ต้องขออนุมัติ แต่จะบันทึกผู้ออกใบเสนอราคา:{' '}
                    <strong className="underline">{profile?.full_name || salesPerson || 'ผู้ใช้งานปัจจุบัน'}</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-5 text-xs space-y-2.5 shadow-2xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
                <span>ต้นทุนรวมภายใน (ไม่แสดงใน PDF ลูกค้า):</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                  {baht(pricing.totalCost)} {currency}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>รวมเป็นเงินจากทุกบรรทัด (Subtotal):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  {baht(subtotal)} {currency}
                </span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>ส่วนลดรวม ({discountMode === 'whole_bill' ? 'ทั้งใบ' : 'ต่อรายการ'}):</span>
                  <span className="font-mono font-bold">- {baht(totalDiscount)} {currency}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
                <span>{taxType === 'vat_included' ? 'ราคาหลังหักส่วนลด (รวม VAT):' : 'ราคาหลังหักส่วนลด:'}</span>
                <span className="font-mono">{baht(afterDiscount)} {currency}</span>
              </div>
              {taxType === 'vat_included' && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>มูลค่าสินค้าก่อนภาษี (Before VAT):</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {baht(amountBeforeVat)} {currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>ภาษีมูลค่าเพิ่ม (VAT {taxType === 'vat_exempt' ? '0' : '7'}%{taxType === 'vat_included' ? ' รวมในยอด' : ''}):</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {taxType === 'vat_included' ? '' : '+ '}{baht(vatAmount)} {currency}
                </span>
              </div>
              {Number(whtRate) > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                  <span>หักภาษี ณ ที่จ่าย ({whtRate}%):</span>
                  <span className="font-mono font-bold">- {baht(whtAmount)} {currency}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-base text-sky-900 dark:text-sky-300 border-t-2 border-sky-400 dark:border-sky-600 pt-3">
                <span>ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
                <span className="font-mono text-lg">{baht(grandTotal)} {currency}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* การ์ดที่ 5: เงื่อนไข หมายเหตุ และลายเซ็น/ตราประทับ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span>5. เงื่อนไข หมายเหตุ และลายเซ็น/เอกสารแนบ (Terms & Attachments)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Signatures & Files</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              หมายเหตุ (แสดงให้ลูกค้าเห็นในใบเสนอราคา)
            </label>
            <textarea
              rows={4}
              className="input text-xs"
              placeholder="ระบุเงื่อนไขการส่งมอบ ชำระเงิน หรือการยืนราคา..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1.5">
              โน้ตภายในบริษัท (บันทึกเฉพาะทีมงาน ไม่แสดงให้ลูกค้าเห็น)
            </label>
            <textarea
              rows={4}
              className="input text-xs bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
              placeholder="บันทึกต้นทุนแฝง, ข้อตกลงพิเศษกับลูกค้า, หรือข้อสังเกตของทีมขาย..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          {/* ลายเซ็นอิเล็กทรอนิกส์และตราประทับ */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              ลายเซ็นอิเล็กทรอนิกส์และตราประทับบริษัท
            </span>
            <div className="flex items-center gap-3">
              {signatureUrl ? (
                <div className="relative">
                  <R2Image
                    fileKey={signatureUrl}
                    alt="ลายเซ็น"
                    className="h-14 w-28 object-contain border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setSignatureUrl('')}
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 text-white w-5 h-5 text-[10px] flex items-center justify-center cursor-pointer shadow-xs hover:bg-rose-700"
                    title="ลบลายเซ็น"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-14 w-28 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center text-[10px] text-slate-400">
                  ยังไม่มีลายเซ็น
                </div>
              )}
              <div>
                <input
                  ref={sigInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadFile(e, 'signature')}
                />
                <button
                  type="button"
                  onClick={() => sigInputRef.current?.click()}
                  className="btn-ghost !py-1 text-xs"
                  disabled={busy}
                >
                  {signatureUrl ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น/ตราประทับ'}
                </button>
                <p className="text-[10px] text-slate-400 mt-1">รองรับไฟล์ PNG โปร่งใส หรือ JPG</p>
              </div>
            </div>
          </div>

          {/* ช่องแนบไฟล์เอกสารทั่วไป (รูปภาพ, PDF, Excel) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              แนบไฟล์เอกสารประกอบ (PDF, รูปภาพ, Excel)
            </span>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
                className="hidden"
                onChange={(e) => handleUploadFile(e, 'attachment')}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost !py-1 text-xs"
                disabled={busy}
              >
                เลือกไฟล์แนบ
              </button>
              {attachmentUrl && (
                <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400">
                  <span>แนบแล้ว:</span>
                  <button
                    type="button"
                    onClick={() => openFile(attachmentUrl)}
                    className="underline font-semibold max-w-xs truncate hover:text-sky-900 dark:hover:text-sky-200 cursor-pointer text-left"
                  >
                    {attachmentName || 'ดูไฟล์แนบ'}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">เช่น สเปคสินค้า, BOQ ลูกค้า, หรือแบบร่างหน้างาน</p>
          </div>
        </div>
      </div>

      {/* แถบปุ่มบันทึกด้านล่าง (Bottom Action Bar) */}
      <div className="flex items-center justify-end gap-3 pt-3">
        <Link
          to="/quotations"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
        >
          ยกเลิก
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-6 py-2.5 text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          <span>{busy ? 'กำลังบันทึก...' : 'บันทึกใบเสนอราคา'}</span>
        </button>
      </div>
    </div>
  )
}

