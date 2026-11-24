import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { uploadQuotationFile, openFile } from '../../lib/files'
import R2Image from '../../components/R2Image'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import SearchableSelect from '../../components/SearchableSelect'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'
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
} from 'lucide-react'

const EMPTY_ITEM = {
  item_name: '',
  description: '',
  quantity: '1',
  unit: 'ชุด',
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
  const [duplicatedFromNo, setDuplicatedFromNo] = useState('')

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

  // 3. การเชื่อมโยงโครงการ
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [refNo, setRefNo] = useState('')

  // 4. รายการสินค้าและบริการ
  const [warehouseName, setWarehouseName] = useState(WAREHOUSES[0])
  const [catalog, setCatalog] = useState([])
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  // 5. การคำนวณเงินและภาษี
  const [taxType, setTaxType] = useState('vat_excluded') // 'vat_excluded' | 'vat_included' | 'vat_exempt'
  const [whtRate, setWhtRate] = useState('0') // '0' | '1' | '3'

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

  // โหลดโครงการ, ลูกค้า (รวมจาก contacts & customers), แคตตาล็อกสินค้า
  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name, client_name').order('project_code').then(({ data }) => setProjects(data ?? []))

    // ดึงรายชื่อลูกค้าจากทั้ง contacts (is_customer หรือ contact_type=customer) และ customers
    Promise.all([
      supabase.from('contacts').select('*').or('contact_type.eq.customer,is_customer.eq.true').order('company_name'),
      supabase.from('customers').select('*').order('customer_name'),
    ]).then(([contactsRes, customersRes]) => {
      const merged = []
      const seenNames = new Set()

      // 1. เพิ่มจาก contacts
      if (contactsRes.data) {
        contactsRes.data.forEach((c) => {
          const name = (c.company_name || c.business_name || '').trim()
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase())
            merged.push({
              id: c.id,
              customer_code: c.contact_code || '',
              customer_name: name,
              tax_id: c.tax_id || '',
              address: c.registered_address || c.address || '',
              postal_code: c.postal_code || '',
              branch_type: c.branch_type || 'head_office',
              branch_no: c.branch_code || '00000',
              phone: c.office_phone || c.phone || '',
              email: c.email || '',
            })
          }
        })
      }

      // 2. เพิ่มจาก customers ถ้ายังไม่มี
      if (customersRes.data) {
        customersRes.data.forEach((c) => {
          const name = (c.customer_name || c.company_name || '').trim()
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase())
            merged.push({
              id: c.id,
              customer_code: c.customer_code || '',
              customer_name: name,
              tax_id: c.tax_id || '',
              address: c.address || '',
              postal_code: c.postal_code || '',
              branch_type: c.branch_type || 'head_office',
              branch_no: c.branch_no || '00000',
              phone: c.phone || '',
              email: c.email || '',
            })
          }
        })
      }

      setCustomers(merged)
    })

    supabase.from('inventory_items').select('id, item_code, item_name, unit, avg_unit_cost').order('item_name').then(({ data }) => setCatalog(data ?? []))

    if (!id) {
      // สร้างเลขที่เอกสารชั่วคราว Auto Code เช่น QT2026110012
      const ym = new Date().toISOString().slice(0, 7).replace('-', '')
      const rand = String(Math.floor(Math.random() * 9000) + 1000)
      setQuotationNo(`QT${ym}${rand}`)

      if (duplicateFromId) {
        Promise.all([
          supabase.from('quotations').select('*').eq('id', duplicateFromId).single(),
          supabase.from('quotation_items').select('*').eq('quotation_id', duplicateFromId),
        ]).then(([qRes, itRes]) => {
          if (!qRes.error && qRes.data) {
            const q = qRes.data
            setDuplicatedFromNo(q.quotation_no)
            setCustomerName(q.customer_name || '')
            setCustomerAddress(q.customer_address || '')
            setCustomerPostalCode(q.customer_postal_code || '')
            setCustomerTaxId(q.customer_tax_id || '')
            setCustomerBranch(q.customer_branch || 'สำนักงานใหญ่')
            setProjectId(q.project_id || '')
            setRefNo(q.ref_no || '')
            setWarehouseName(q.warehouse_name || WAREHOUSES[0])
            setCustomerNotes(q.customer_notes || '')
            setInternalNotes(q.internal_notes || '')
            setTaxType(q.vat_rate === 0 ? 'vat_exempt' : 'vat_excluded')
            setWhtRate(String(q.wht_rate || '0'))

            if (itRes.data && itRes.data.length > 0) {
              setItems(
                itRes.data.map((i) => ({
                  item_name: i.item_name,
                  description: i.description || '',
                  quantity: String(i.quantity),
                  unit: i.unit || '',
                  unit_price: String(i.unit_price),
                  discount_percent: String(i.discount_percent || 0),
                }))
              )
            }
          }
        })
      }
    } else {
      // โหมดแก้ไข
      Promise.all([
        supabase.from('quotations').select('*').eq('id', id).single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', id),
      ]).then(([qRes, itRes]) => {
        if (qRes.error) return setError('ไม่พบใบเสนอราคา')
        const q = qRes.data
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
        setRefNo(q.ref_no || '')
        setWarehouseName(q.warehouse_name || WAREHOUSES[0])
        setCustomerNotes(q.customer_notes || '')
        setInternalNotes(q.internal_notes || '')
        setSignatureUrl(q.signature_url || '')
        setAttachmentUrl(q.attachment_url || '')
        setTaxType(q.vat_rate === 0 ? 'vat_exempt' : 'vat_excluded')
        setWhtRate(String(q.wht_rate || '0'))

        if (itRes.data && itRes.data.length > 0) {
          setItems(
            itRes.data.map((i) => ({
              id: i.id,
              item_name: i.item_name,
              description: i.description || '',
              quantity: String(i.quantity),
              unit: i.unit || '',
              unit_price: String(i.unit_price),
              discount_percent: String(i.discount_percent || 0),
            }))
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

  // อัปเดตรายการสินค้า
  const updItem = (index, key, val) => {
    const next = items.map((it, idx) => {
      if (idx !== index) return it
      const updated = { ...it, [key]: val }
      // บังคับจำนวนวัสดุให้เป็นจำนวนเต็ม (int เท่านั้น)
      if (key === 'quantity') {
        const cleanInt = val === '' ? '' : String(Math.max(1, parseInt(val, 10) || 1))
        updated.quantity = cleanInt
      }
      if (key === 'item_name') {
        const found = catalog.find((c) => c.item_name.toLowerCase() === String(val).trim().toLowerCase())
        if (found) {
          if (!updated.unit && found.unit) updated.unit = found.unit
          if (!Number(updated.unit_price) && found.avg_unit_cost) updated.unit_price = String(found.avg_unit_cost)
        }
      }
      return updated
    })
    setItems(next)
  }

  // คำนวณยอดเงิน (Financial Calculations)
  const lineTotals = items.map((it) => {
    const qty = parseInt(it.quantity, 10) || 0
    const price = Number(it.unit_price) || 0
    const disc = Number(it.discount_percent) || 0
    const raw = qty * price
    const discountVal = (raw * disc) / 100
    const lineTotal = Math.max(0, raw - discountVal)
    return { raw, discountVal, lineTotal }
  })

  const subtotal = lineTotals.reduce((s, l) => s + l.raw, 0)
  const totalDiscount = lineTotals.reduce((s, l) => s + l.discountVal, 0)
  const afterDiscount = subtotal - totalDiscount

  let vatAmount = 0
  let totalWithVat = afterDiscount

  if (taxType === 'vat_excluded') {
    vatAmount = Math.round(afterDiscount * 0.07 * 100) / 100
    totalWithVat = Math.round((afterDiscount + vatAmount) * 100) / 100
  } else if (taxType === 'vat_included') {
    vatAmount = Math.round(((afterDiscount * 7) / 107) * 100) / 100
    totalWithVat = afterDiscount
  } else {
    vatAmount = 0
    totalWithVat = afterDiscount
  }

  const whtAmount = Math.round(afterDiscount * (Number(whtRate) / 100) * 100) / 100
  const grandTotal = Math.round((totalWithVat - whtAmount) * 100) / 100

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

    // กรองเอาเฉพาะแถวที่มีการกรอกชื่อสินค้าจริง (ตัดแถวว่างทิ้งอัตโนมัติ)
    const validItems = (items || []).filter(
      (i) => i.item_name && i.item_name.trim()
    )

    if (validItems.length === 0) {
      setShowItemErrors(true)
      newErrors.items = 'รายการสินค้า/บริการยังไม่ได้กรอก (กรุณาระบุอย่างน้อย 1 รายการ)'
    } else {
      const hasInvalidItem = validItems.some(
        (i) => !i.quantity || Number(i.quantity) <= 0 || isNaN(Number(i.quantity)) || i.unit_price === '' || isNaN(Number(i.unit_price))
      )
      if (hasInvalidItem) {
        setShowItemErrors(true)
        newErrors.items = 'รายการสินค้า/บริการมีช่องที่ยังไม่กรอกครบถ้วน (กรุณาระบุจำนวน > 0 และราคาต่อหน่วย)'
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

    const payload = {
      quotation_no: quotationNo.trim(),
      issue_date: issueDate,
      quotation_date: issueDate, // รองรับ schema ทั้งสองเวอร์ชัน
      validity_days: parseInt(validityDays, 10) || 30,
      expiry_date: expiryDate || null,
      valid_until: expiryDate || null,
      sales_person: salesPerson.trim() || null,
      currency: currency || 'THB',
      customer_name: customerName.trim(),
      customer_address: customerAddress.trim() || null,
      customer_postal_code: customerPostalCode.trim() || null,
      customer_tax_id: customerTaxId.trim() || null,
      customer_branch: customerBranch.trim() || 'สำนักงานใหญ่',
      project_id: isUUID(projectId) ? projectId : null,
      ref_no: refNo.trim() || null,
      warehouse_name: warehouseName || 'สโตร์หลัก',
      subtotal,
      discount_amount: totalDiscount,
      after_discount: afterDiscount,
      vat_rate: taxType === 'vat_exempt' ? 0 : 7,
      vat_amount: vatAmount,
      wht_rate: Number(whtRate) || 0,
      wht_amount: whtAmount,
      grand_total: grandTotal,
      total_amount: grandTotal, // รองรับ schema ทั้งสองเวอร์ชัน
      customer_notes: customerNotes.trim() || null,
      notes: customerNotes.trim() || null,
      internal_notes: internalNotes.trim() || null,
      signature_url: signatureUrl || null,
      attachment_url: attachmentUrl || null,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }

    if (isUUID(profile?.id)) {
      payload.created_by = profile.id
    }

    try {
      let currentId = isUUID(id) ? id : null

      const saveRecord = async (currentPayload) => {
        if (currentId) {
          const { error: updErr } = await supabase.from('quotations').update(currentPayload).eq('id', currentId)
          if (updErr) throw updErr
          return currentId
        } else if (id) {
          const { error: updErr } = await supabase.from('quotations').update(currentPayload).eq('quotation_no', id)
          if (updErr) throw updErr
          return id
        } else {
          const { data: insData, error: insErr } = await supabase
            .from('quotations')
            .insert(currentPayload)
            .select('id')
          if (insErr) throw insErr
          return insData?.[0]?.id || null
        }
      }

      // ระบบบันทึกแบบ Self-Healing: ปลด foreign key หรือ column ที่ไม่มีในฐานข้อมูลอัตโนมัติ
      let savedId = null
      let activePayload = { ...payload }

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          savedId = await saveRecord(activePayload)
          break
        } catch (dbErr) {
          console.warn(`Quotation save attempt ${attempt + 1} error:`, dbErr)
          const errMsg = dbErr?.message || ''

          // หากเลขที่ QT ซ้ำในโหมดสร้างใหม่ ให้สร้างเลขใหม่แล้วลองอีกครั้ง
          if (!id && (errMsg.includes('duplicate key') || errMsg.includes('unique constraint') || errMsg.includes('quotation_no_key'))) {
            const ym = new Date().toISOString().slice(0, 7).replace('-', '')
            const rand = String(Math.floor(Math.random() * 90000) + 10000)
            const nextNo = `QT${ym}${rand}`
            activePayload.quotation_no = nextNo
            setQuotationNo(nextNo)
            continue
          }

          // Foreign key errors
          if (errMsg.includes('created_by')) {
            delete activePayload.created_by
            continue
          }
          if (errMsg.includes('project_id') || (errMsg.includes('foreign key') && errMsg.includes('project'))) {
            delete activePayload.project_id
            continue
          }
          if (errMsg.includes('customer_id') || (errMsg.includes('foreign key') && errMsg.includes('customer'))) {
            delete activePayload.customer_id
            continue
          }
          if (errMsg.includes('foreign key')) {
            delete activePayload.created_by
            delete activePayload.project_id
            delete activePayload.customer_id
            continue
          }

          // Column does not exist
          const colMatch = errMsg.match(/column "(.*?)" of relation "quotations" does not exist/)
          if (colMatch && colMatch[1]) {
            delete activePayload[colMatch[1]]
            continue
          }

          // Payload too large error (จาก base64 image)
          if (errMsg.includes('413') || errMsg.includes('payload') || errMsg.includes('too large')) {
            if (activePayload.attachment_url?.startsWith('data:')) delete activePayload.attachment_url
            if (activePayload.signature_url?.startsWith('data:')) delete activePayload.signature_url
            continue
          }

          if (attempt >= 3) throw dbErr
        }
      }

      if (!savedId) {
        savedId = currentId || id || quotationNo.trim()
      }

      // บันทึกรายการย่อย (บังคับ quantity เป็นจำนวนเต็ม int)
      if (savedId && isUUID(savedId)) {
        try {
          await supabase.from('quotation_items').delete().eq('quotation_id', savedId)
          const itemRows = validItems.map((it, idx) => ({
            quotation_id: savedId,
            item_name: it.item_name.trim(),
            description: it.description?.trim() || null,
            quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
            unit: it.unit?.trim() || 'รายการ',
            unit_price: Number(it.unit_price) || 0,
            discount_percent: Number(it.discount_percent) || 0,
            total_amount: lineTotals[idx]?.lineTotal || ((Math.max(1, parseInt(it.quantity, 10) || 1)) * (Number(it.unit_price) || 0)),
          }))
          const { error: itErr } = await supabase.from('quotation_items').insert(itemRows)
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
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">
            {id ? `แก้ไขใบเสนอราคา ${quotationNo}` : 'สร้างใบเสนอราคาใหม่ (New Quotation)'}
          </h2>
          <p className="text-xs text-steel-500">
            ออกเอกสารเสนอราคาสำหรับลูกค้า พร้อมคำนวณส่วนลด ภาษี และผูกกับโครงการ
          </p>
        </div>
        <Link to="/quotations" className="text-xs text-steel-500 hover:underline">
          ← กลับไปหน้ารายการ
        </Link>
      </div>

      {duplicatedFromNo && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-3.5 text-xs text-sky-900 flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-2">
            <span className="text-base"></span>
            <span>กำลังสร้างใบเสนอราคาใหม่โดยคัดลอกข้อมูลจาก: <strong>{duplicatedFromNo}</strong></span>
          </span>
          <span className="text-[11px] text-sky-800 font-bold bg-sky-200/70 px-2.5 py-0.5 rounded-full">
            สำเนาฉบับร่างใหม่
          </span>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-steel-200 bg-white p-6 shadow-sm space-y-6">
        {/* 1. ส่วนหัวเอกสารและข้อมูลอ้างอิง */}
        <div className="border-b border-steel-200 pb-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <span>1. ส่วนหัวเอกสารและข้อมูลอ้างอิง</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">เลขที่เอกสาร (Auto) *</label>
              <input
                className={fieldErrorClass(errors.quotationNo, "input text-xs font-mono font-bold bg-steel-50 text-sky-800")}
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
              <label className="block text-xs font-semibold text-steel-700 mb-1">วันที่ออกเอกสาร *</label>
              <input
                type="date"
                className={fieldErrorClass(errors.issueDate, "input text-xs")}
                value={issueDate}
                onChange={(e) => {
                  setIssueDate(e.target.value)
                  if (errors.issueDate) setErrors((prev) => ({ ...prev, issueDate: '' }))
                }}
              />
              <FieldError error={errors.issueDate} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">กำหนดยืนราคา (วัน) *</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min="1"
                  className="input text-xs w-20 text-center font-bold"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                />
                <span className="text-xs text-steel-500 self-center">วัน (ถึง {expiryDate || '-'})</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">พนักงานขาย / ผู้เสนอ *</label>
              <input
                className="input text-xs"
                value={salesPerson}
                onChange={(e) => setSalesPerson(e.target.value)}
                placeholder="ชื่อผู้รับผิดชอบ"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">สกุลเงิน (Currency)</label>
              <select className="input text-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 2. ข้อมูลลูกค้า (Customer Details) */}
        <div className="border-b border-steel-200 pb-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <span>2. ข้อมูลลูกค้า (Customer Details)</span>
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-steel-700 mb-1">
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
              <label className="block text-xs font-semibold text-steel-700 mb-1">
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
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                ที่อยู่ลูกค้า
              </label>
              <input
                className="input text-xs"
                placeholder="เลขที่ อาคาร ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                รหัสไปรษณีย์
              </label>
              <input
                className="input text-xs w-32 font-mono"
                placeholder="เช่น 10330"
                maxLength={5}
                value={customerPostalCode}
                onChange={(e) => setCustomerPostalCode(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                สำนักงาน / สาขา
              </label>
              <input
                className="input text-xs"
                placeholder="สำนักงานใหญ่ หรือ สาขาที่ 00001"
                value={customerBranch}
                onChange={(e) => setCustomerBranch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 3. การเชื่อมโยงโครงการ (Project Link) & คลังสินค้า */}
        <div className="border-b border-steel-200 pb-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <span>3. การเชื่อมโยงโครงการ และคลังสินค้า</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                เลือกโปรเจกต์ (โครงการ)
              </label>
              <SearchableProjectSelect
                projects={projects}
                value={projectId}
                onChange={(val) => handleSelectProject(val)}
                placeholder="พิมพ์รหัส หรือชื่อโครงการเพื่อค้นหา..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                เลขที่อ้างอิง (Ref No.)
              </label>
              <input
                className="input text-xs"
                placeholder="เช่น REF-6901 / เลขที่สั่งจ้าง"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                เลือกคลังสินค้า (Warehouse)
              </label>
              <select
                className="input text-xs"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 4. ตารางรายการสินค้าและบริการ (Itemized Table) */}
        <div className="border-b border-steel-200 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2">
              <span>4. รายการสินค้าและบริการ (Itemized Table)</span>
            </h3>
            <span className="text-xs text-steel-500">เลือกจากคลัง: <b>{warehouseName}</b></span>
          </div>

          <datalist id="catalog-quotation-items">
            {catalog.map((c) => (
              <option key={c.id} value={c.item_name}>[{c.item_code}] {c.unit ? `(${c.unit})` : ''}</option>
            ))}
          </datalist>

          <div className="space-y-3">
            <div className="hidden sm:grid sm:grid-cols-[auto_1fr_6rem_5rem_7rem_5rem_7rem_auto] gap-2.5 text-xs font-bold text-steel-600 dark:text-slate-400 px-3 pb-1 border-b border-steel-100 dark:border-slate-800">
              <span className="w-7 text-center">#</span>
              <span>ชื่อสินค้า / รายการงานวิศวกรรม *</span>
              <span className="text-right">จำนวน</span>
              <span className="text-center">หน่วย</span>
              <span className="text-right">ราคา/หน่วย</span>
              <span className="text-right">ส่วนลด %</span>
              <span className="text-right">ราคารวม ({currency})</span>
              <span className="w-10 text-center font-bold text-rose-600 dark:text-rose-400">ลบ</span>
            </div>

            {items.map((it, idx) => {
              const calc = lineTotals[idx]
              const nameEmpty = showItemErrors && !it.item_name?.trim()
              const qtyEmpty = showItemErrors && (!it.quantity || Number(it.quantity) <= 0)
              const priceEmpty = showItemErrors && (it.unit_price === '' || isNaN(Number(it.unit_price)))

              return (
                <div
                  key={idx}
                  className={`rounded-2xl border p-3.5 space-y-2.5 transition shadow-xs ${nameEmpty || qtyEmpty || priceEmpty
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-rose-950/20'
                    : 'border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-steel-300 dark:hover:border-slate-700'
                    }`}
                >
                  {/* แถวที่ 1: ข้อมูลสินค้าและตัวเลขราคา */}
                  <div className="grid grid-cols-2 sm:grid-cols-[auto_1fr_6rem_5rem_7rem_5rem_7rem_auto] gap-2.5 items-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-steel-100 dark:bg-slate-800 font-mono font-bold text-xs text-steel-700 dark:text-slate-300">
                      #{idx + 1}
                    </span>

                    <div className="col-span-2 sm:col-span-1">
                      <input
                        list="catalog-quotation-items"
                        className={fieldErrorClass(nameEmpty, "input text-xs w-full font-bold text-steel-900 dark:text-slate-100")}
                        placeholder="ระบุชื่อสินค้า / บริการ / อุปกรณ์..."
                        value={it.item_name}
                        onChange={(e) => updItem(idx, 'item_name', e.target.value)}
                      />
                      {nameEmpty && <FieldError error="กรุณาระบุชื่อสินค้า/บริการ" />}
                    </div>

                    <div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className={fieldErrorClass(qtyEmpty, "input text-xs text-right w-full font-mono font-bold")}
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

                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={fieldErrorClass(priceEmpty, "input text-xs text-right w-full font-mono")}
                        placeholder="ราคา/หน่วย"
                        value={it.unit_price}
                        onChange={(e) => updItem(idx, 'unit_price', e.target.value)}
                      />
                    </div>

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

                    <div className="col-span-2 sm:col-span-1 text-right font-mono font-black text-xs text-sky-900 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 py-2 px-3 rounded-xl border border-sky-100 dark:border-sky-800">
                      {baht(calc.lineTotal)}
                    </div>

                    <div className="flex justify-end sm:justify-center">
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

                  {/* แถวที่ 2: Richbox / Textarea ขยายลงล่าง สำหรับสเปกและรายละเอียด */}
                  <div className="pt-1 border-t border-steel-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-[11px] text-steel-500 dark:text-slate-400 mb-1">
                      <span className="flex items-center gap-1.5 font-semibold text-steel-700 dark:text-slate-300">
                        <Info className="h-3.5 w-3.5 text-steel-400 dark:text-slate-500" />
                        <span>รายละเอียดเฉพาะ / สเปกวิศวกรรม</span>
                      </span>
                      <span className="text-[10px] text-steel-400 dark:text-slate-500">รองรับข้อความหลายบรรทัดและหัวข้อย่อย</span>
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-steel-200 dark:border-slate-700 bg-steel-50/60 dark:bg-slate-800/60 p-2.5 text-xs text-steel-800 dark:text-slate-200 placeholder:text-steel-400 focus:bg-white dark:focus:bg-slate-800 focus:border-steel-900 dark:focus:border-amber-500 focus:outline-none transition leading-relaxed font-sans"
                      placeholder="เช่น • แผงโซล่าเซลล์ชนิด Monocrystalline Half-cell 550W Tier-1&#10;• รับประกันตัวผลิตภัณฑ์ 12 ปี และรับประกันประสิทธิภาพการผลิตไฟ 25 ปี&#10;• ได้รับมาตรฐานสากล TUV Rheinland / IEC 61215"
                      value={it.description || ''}
                      onChange={(e) => updItem(idx, 'description', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
              className="btn-ghost !py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-xl"
            >
              <Plus className="h-4 w-4" />
              <span>เพิ่มรายการสินค้า/บริการ</span>
            </button>
            <span className="text-xs text-steel-500">{items.length} รายการ</span>
          </div>
        </div>

        {/* 5. การคำนวณเงินและภาษี (Financial Calculations) */}
        <div className="border-b border-steel-200 pb-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <span>5. การคำนวณเงินและภาษี (Financial Calculations)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  การคิดภาษีมูลค่าเพิ่ม (VAT) *
                </label>
                <select
                  className="input text-xs"
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value)}
                >
                  <option value="vat_excluded">ราคาแยกภาษีมูลค่าเพิ่ม +7% (VAT Excluded)</option>
                  <option value="vat_included">ราคารวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Included)</option>
                  <option value="vat_exempt">ไม่มีภาษี / ได้รับการยกเว้น (VAT Exempt 0%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
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

            {/* ตารางสรุปการเงิน */}
            <div className="rounded-xl border border-steel-200 bg-steel-50 p-4 text-xs space-y-2">
              <div className="flex justify-between text-steel-600">
                <span>รวมเป็นเงิน (Subtotal):</span>
                <span className="font-semibold">{baht(subtotal)} {currency}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>ส่วนลดรวม (Total Discount):</span>
                <span>- {baht(totalDiscount)} {currency}</span>
              </div>
              <div className="flex justify-between font-bold text-ink border-t border-steel-200 pt-1.5">
                <span>ราคาหลังหักส่วนลด:</span>
                <span>{baht(afterDiscount)} {currency}</span>
              </div>
              <div className="flex justify-between text-steel-600">
                <span>ภาษีมูลค่าเพิ่ม (VAT {taxType === 'vat_exempt' ? '0' : '7'}%):</span>
                <span>+ {baht(vatAmount)} {currency}</span>
              </div>
              {Number(whtRate) > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>หักภาษี ณ ที่จ่าย ({whtRate}%):</span>
                  <span>- {baht(whtAmount)} {currency}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-base text-sky-900 border-t-2 border-sky-400 pt-2">
                <span>ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
                <span>{baht(grandTotal)} {currency}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. เงื่อนไขและหมายเหตุ (Terms & Notes) & ลายเซ็น/ไฟล์แนบ */}
        <div>
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <span>6. เงื่อนไข หมายเหตุ และลายเซ็น/ตราประทับ</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
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
              <label className="block text-xs font-semibold text-amber-800 mb-1">
                โน้ตภายในบริษัท (บันทึกเฉพาะทีมงาน ไม่แสดงให้ลูกค้าเห็น)
              </label>
              <textarea
                rows={4}
                className="input text-xs bg-amber-50/50 border-amber-200"
                placeholder="บันทึกต้นทุนแฝง, ข้อตกลงพิเศษกับลูกค้า, หรือข้อสังเกตของทีมขาย..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-steel-100">
            {/* ลายเซ็นอิเล็กทรอนิกส์และตราประทับ */}
            <div className="rounded-lg border border-steel-200 p-3 bg-steel-50/40">
              <span className="block text-xs font-semibold text-steel-700 mb-2">
                ️ ลายเซ็นอิเล็กทรอนิกส์และตราประทับบริษัท
              </span>
              <div className="flex items-center gap-3">
                {signatureUrl ? (
                  <div className="relative">
                    <R2Image fileKey={signatureUrl} alt="ลายเซ็น" className="h-14 w-28 object-contain border rounded bg-white" />
                    <button
                      type="button"
                      onClick={() => setSignatureUrl('')}
                      className="absolute -top-1 -right-1 rounded-full bg-red-600 text-white w-4 h-4 text-[10px] flex items-center justify-center cursor-pointer"
                    >

                    </button>
                  </div>
                ) : (
                  <div className="h-14 w-28 border border-dashed border-steel-300 rounded flex items-center justify-center text-[10px] text-steel-400">
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
                  <p className="text-[10px] text-steel-400 mt-1">รองรับไฟล์ PNG โปร่งใส หรือ JPG</p>
                </div>
              </div>
            </div>

            {/* ช่องแนบไฟล์เอกสารทั่วไป (รูปภาพ, PDF, Excel) */}
            <div className="rounded-lg border border-steel-200 p-3 bg-steel-50/40">
              <span className="block text-xs font-semibold text-steel-700 mb-2">
                แนบไฟล์เอกสารทั่วไป (รูปภาพ, PDF, Excel)
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
                  <div className="flex items-center gap-1.5 text-xs text-sky-700">
                    <span>✓ แนบแล้ว:</span>
                    <button
                      type="button"
                      onClick={() => openFile(attachmentUrl)}
                      className="underline font-semibold max-w-xs truncate text-sky-700 hover:text-sky-900 cursor-pointer text-left"
                    >
                      {attachmentName || 'ดูไฟล์แนบ'}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-steel-400 mt-1.5">เช่น สเปคสินค้า, BOQ ลูกค้า, หรือแบบร่างหน้างาน</p>
            </div>
          </div>
        </div>
      </div>

      {/* แสดงข้อความเตือนเมื่อมี Error */}
      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <span></span>
          <span>{error}</span>
        </div>
      )}

      {/* ปุ่มบันทึก */}
      <div className="flex items-center justify-end gap-3 pt-3">
        <Link to="/quotations" className="btn-ghost">
          ยกเลิก
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-primary !py-2 px-6 shadow-md"
        >
          {busy ? 'กำลังบันทึก...' : ' บันทึกใบเสนอราคา'}
        </button>
      </div>
    </div>
  )
}

