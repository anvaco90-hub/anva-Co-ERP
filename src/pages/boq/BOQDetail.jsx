import { useEffect, useState, useMemo, Fragment, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { baht } from '../../lib/projects'
import { fetchUnifiedCustomers, ensureLegacyCustomerId } from '../../lib/contactsSync'
import {
  buildQuotationPayloadFromBoq,
  matchBoqCustomer,
  saveQuotationWithFallback,
  saveQuotationItemsWithFallback,
} from '../../lib/boqToQuotation'
import { QUOTATION_TYPES, calculateTaxBreakdown, generateTypedQuotationNo } from '../../lib/tax'
import BOQPrintModal from '../../components/reports/BOQPrintModal'
import {
  FileSpreadsheet,
  ArrowLeft,
  Printer,
  Edit,
  Trash2,
  FileCheck2,
  ShoppingCart,
  Sun,
  Layers,
  CheckCircle2,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
  Calendar,
  Building2,
  FolderGit2,
  MoreVertical,
  Copy,
} from 'lucide-react'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  approved: { label: 'อนุมัติแล้ว (Approved)', color: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  converted_to_quotation: { label: 'เปิดใบเสนอราคาแล้ว', color: 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800' },
  archived: { label: 'เก็บถาวร', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
}

export default function BOQDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [boq, setBoq] = useState(null)
  const [items, setItems] = useState([])
  const [unifiedCustomers, setUnifiedCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [convertTaxType, setConvertTaxType] = useState('vat_excluded')
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [existingQuotation, setExistingQuotation] = useState(null)

  // ตัวกรองและค้นหา (Search & Category Filters)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [categoryMode, setCategoryMode] = useState('work') // 'work' (หมวดหมู่งาน) | 'material' (หมวดหมู่วัสดุและอุปกรณ์)
  const [catSearchQuery, setCatSearchQuery] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState({})
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

  const findLinkedQuotation = async (boqRecord) => {
    if (!boqRecord?.id && !boqRecord?.boq_no) return null

    // Try querying by boq_id OR ref_no first; fall back to ref_no if boq_id column isn't migrated yet
    if (boqRecord.id && boqRecord.boq_no) {
      const orRes = await supabase
        .from('quotations')
        .select('id, quotation_no, status')
        .or(`boq_id.eq.${boqRecord.id},ref_no.eq.${boqRecord.boq_no}`)
        .order('created_at', { ascending: false })

      if (!orRes.error) {
        return (orRes.data || []).find((q) => !['rejected', 'cancelled'].includes(q.status)) || null
      }
    }

    if (boqRecord.boq_no) {
      const refRes = await supabase
        .from('quotations')
        .select('id, quotation_no, status')
        .eq('ref_no', boqRecord.boq_no)
        .order('created_at', { ascending: false })
      if (!refRes.error) {
        return (refRes.data || []).find((q) => !['rejected', 'cancelled'].includes(q.status)) || null
      }
    }
    return null
  }

  const fetchDetail = async () => {
    setLoading(true)
    try {
      // ดึงข้อมูล boq, boq_items, inventory_items และ unifiedCustomers ควบคู่กัน
      const [bRes, itemsRes, invRes, custList] = await Promise.all([
        supabase
          .from('boqs')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('boq_items')
          .select('*')
          .eq('boq_id', id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('inventory_items')
          .select('item_code, item_name, item_categories(name)'),
        fetchUnifiedCustomers().catch(() => []),
      ])

      if (bRes.error) throw bRes.error

      setUnifiedCustomers(custList || [])

      let boqData = bRes.data
      if (boqData?.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id, project_code, project_name, client_name')
          .eq('id', boqData.project_id)
          .maybeSingle()
        if (proj) boqData = { ...boqData, projects: proj }
      }

      // แมปข้อมูลหมวดหมู่วัสดุอุปกรณ์จากคลังสินค้า
      const invMap = {}
      ;(invRes.data || []).forEach((inv) => {
        const catName = inv.item_categories?.name
        if (catName) {
          if (inv.item_code) invMap[inv.item_code] = catName
          if (inv.item_name) invMap[inv.item_name.trim().toLowerCase()] = catName
        }
      })

      const enrichedItems = (itemsRes.data || []).map((it) => {
        let matCat = invMap[it.item_code] || invMap[it.item_name?.trim().toLowerCase()]
        if (!matCat) {
          if (Number(it.labor_unit_cost) > 0 && Number(it.material_unit_cost) === 0) {
            matCat = 'งานบริการและค่าแรงติดตั้ง'
          } else {
            matCat = it.category || 'วัสดุและอุปกรณ์ทั่วไป'
          }
        }
        return {
          ...it,
          material_category: matCat,
        }
      })

      setBoq(boqData)
      setItems(enrichedItems)

      const linkedQt = await findLinkedQuotation(boqData)
      setExistingQuotation(linkedQt)
    } catch (err) {
      console.error('Failed to load BOQ detail:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  const matchedCustomer = useMemo(
    () => matchBoqCustomer(boq, unifiedCustomers),
    [boq, unifiedCustomers]
  )

  const conversionPreview = useMemo(() => {
    if (!boq) return null
    return buildQuotationPayloadFromBoq({
      boq,
      boqItems: items,
      matchedCustomer,
      taxType: convertTaxType,
      quotationNo: 'PREVIEW',
      salesPerson: profile?.full_name || null,
    })
  }, [boq, items, matchedCustomer, convertTaxType, profile?.full_name])

  // เปิดหน้าต่างเลือก VAT และตรวจซ้ำก่อนแปลง BOQ -> Quotation
  const handleConvertToQuotation = async () => {
    if (!boq || items.length === 0) return

    if (existingQuotation) {
      alert(`เอกสาร BOQ นี้ได้เคยถูกแปลงเป็นใบเสนอราคาเลขที่ "${existingQuotation.quotation_no}" แล้ว\nระบบจะนำท่านไปยังใบเสนอราคาดังกล่าว`)
      navigate(`/quotations/${existingQuotation.id}`)
      return
    }

    const alreadyQ = await findLinkedQuotation(boq)
    if (alreadyQ) {
      alert(`เอกสาร BOQ นี้มีใบเสนอราคาเลขที่ "${alreadyQ.quotation_no}" ในระบบอยู่แล้ว\nระบบจะนำท่านไปยังใบเสนอราคาเดิม`)
      setExistingQuotation(alreadyQ)
      navigate(`/quotations/${alreadyQ.id}`)
      return
    }

    setShowConvertModal(true)
  }

  // ยืนยันการแปลง BOQ เป็นใบเสนอราคาพร้อมข้อมูลลูกค้า + ภาษี + item reconciliation
  const handleConfirmConvert = async () => {
    if (!boq || items.length === 0) return
    setConverting(true)
    try {
      const alreadyQ = await findLinkedQuotation(boq)
      if (alreadyQ) {
        setExistingQuotation(alreadyQ)
        setShowConvertModal(false)
        navigate(`/quotations/${alreadyQ.id}`)
        return
      }

      const d = new Date()
      const qNo = generateTypedQuotationNo(QUOTATION_TYPES.PROJECT, d)

      const resolvedCustomerId = matchedCustomer
        ? await ensureLegacyCustomerId(matchedCustomer)
        : null

      const { payload: quotationPayload, itemRows } = buildQuotationPayloadFromBoq({
        boq,
        boqItems: items,
        matchedCustomer,
        taxType: convertTaxType,
        quotationNo: qNo,
        salesPerson: profile?.full_name || null,
        salesPersonId: profile?.id || null,
        issueDate: d.toISOString().split('T')[0],
        customerId: resolvedCustomerId,
      })

      if (profile?.id) {
        quotationPayload.created_by = profile.id
      }

      const qData = await saveQuotationWithFallback(supabase, quotationPayload)

      const qItemRows = itemRows.map((row) => ({
        quotation_id: qData.id,
        item_id: row.item_id || null,
        item_code: row.item_code || null,
        item_name: row.item_name,
        description: row.description || null,
        quantity: row.quantity,
        unit: row.unit,
        base_cost: row.base_cost ?? 0,
        unit_price: row.unit_price,
        discount_percent: 0,
        total_amount: row.total_amount,
      }))

      const { error: itemsErr } = await saveQuotationItemsWithFallback(supabase, qItemRows)
      if (itemsErr) throw itemsErr

      await supabase.from('boqs').update({ status: 'converted_to_quotation' }).eq('id', boq.id)

      setExistingQuotation({ id: qData.id, quotation_no: qData.quotation_no || qNo })
      setShowConvertModal(false)
      navigate(`/quotations/${qData.id}`)
    } catch (err) {
      alert('แปลงเป็นใบเสนอราคาไม่สำเร็จ: ' + err.message)
    } finally {
      setConverting(false)
    }
  }

  // ลบ BOQ
  const handleDelete = async () => {
    if (!window.confirm(`ยืนยันการลบ BOQ ${boq?.boq_no} หรือไม่?`)) return
    try {
      const { error } = await supabase.from('boqs').delete().eq('id', boq.id)
      if (error) throw error
      alert('ลบเอกสาร BOQ เรียบร้อยแล้ว')
      navigate('/boq')
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    }
  }

  // ฟังก์ชันหาหมวดหมู่ของรายการตามโหมดที่เลือก (งาน หรือ วัสดุและอุปกรณ์)
  const getItemCategory = (it) => {
    if (categoryMode === 'material') {
      return it.material_category || 'วัสดุและอุปกรณ์ทั่วไป'
    }
    return it.category || 'งานทั่วไป'
  }

  // รายการหมวดหมู่ทั้งหมดในเอกสารนี้ (ตามโหมดที่เลือก)
  const allCategories = useMemo(() => {
    const list = []
    items.forEach((it) => {
      const c = getItemCategory(it)
      if (!list.includes(c)) list.push(c)
    })
    return list
  }, [items, categoryMode])

  // กรองหมวดหมู่ตามคำค้นหาหมวดหมู่ (Search Categories)
  const filteredCategories = useMemo(() => {
    if (!catSearchQuery.trim()) return allCategories
    const q = catSearchQuery.toLowerCase().trim()
    return allCategories.filter((c) => c.toLowerCase().includes(q))
  }, [allCategories, catSearchQuery])

  // กรองรายการตามคำค้นหาและหมวดหมู่ที่เลือก
  const filteredItems = useMemo(() => {
    let res = items
    if (selectedCategory !== 'all') {
      res = res.filter((it) => getItemCategory(it) === selectedCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      res = res.filter(
        (it) =>
          it.item_name?.toLowerCase().includes(q) ||
          it.description?.toLowerCase().includes(q) ||
          it.category?.toLowerCase().includes(q) ||
          it.material_category?.toLowerCase().includes(q)
      )
    }
    return res
  }, [items, selectedCategory, searchQuery, categoryMode])

  // จัดกลุ่มรายการที่ผ่านการกรองตามหมวดหมู่
  const grouped = useMemo(() => {
    return filteredItems.reduce((acc, it) => {
      const cat = getItemCategory(it)
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(it)
      return acc
    }, {})
  }, [filteredItems, categoryMode])

  // ฟังก์ชันย่อ/ขยายเฉพาะหมวดหมู่
  const toggleCategoryCollapse = (cat) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }

  // ฟังก์ชันย่อทั้งหมด / ขยายทั้งหมด
  const isAllCollapsed =
    Object.keys(grouped).length > 0 &&
    Object.keys(grouped).every((cat) => collapsedCategories[cat])

  const toggleCollapseAll = () => {
    if (isAllCollapsed) {
      setCollapsedCategories({})
    } else {
      const all = {}
      Object.keys(grouped).forEach((cat) => {
        all[cat] = true
      })
      setCollapsedCategories(all)
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-xs text-slate-400 dark:text-slate-500">
        กำลังโหลดข้อมูล BOQ...
      </div>
    )
  }

  if (!boq) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
        <p className="font-bold text-slate-900 dark:text-white">ไม่พบเอกสาร BOQ นี้</p>
        <Link to="/boq" className="text-xs text-sky-700 dark:text-sky-400 font-bold hover:underline">
          ← กลับหน้ารายการ BOQ
        </Link>
      </div>
    )
  }

  const st = STATUS_MAP[boq.status] || {
    label: boq.status,
    color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  }

  return (
    <div className="space-y-6 font-sans text-slate-800 dark:text-slate-100 w-full">
      {/* 1. แบนเนอร์หัวหน้าเอกสารระดับบริหาร (Executive Corporate ERP Banner - เลย์เอาต์ 2 ชั้น สมดุลเต็มความกว้าง) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-white shadow-sm space-y-4">
        {/* ชั้นที่ 1: ส่วนหัวเรื่อง + ป้ายกำกับ (ซ้าย) และ แถบเครื่องมือคำสั่ง Action Toolbar (ขวา) */}
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          {/* ข้อมูลหัวเรื่อง รหัส และป้ายสถานะ */}
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 shrink-0 mt-0.5">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              {/* แถบป้ายกำกับด้านบน (Badge Row) - แยกบรรทัดอย่างเป็นระเบียบ ไม่โดนปุ่มขวาเบียด */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/25 font-bold whitespace-nowrap">
                  BOQ DOCUMENT
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full border shadow-2xs whitespace-nowrap ${st.color}`}>
                  {st.label}
                </span>
                {existingQuotation && (
                  <Link
                    to={`/quotations/${existingQuotation.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30 hover:underline whitespace-nowrap"
                  >
                    <FileCheck2 className="h-3 w-3" />
                    <span>ใบเสนอราคา: {existingQuotation.quotation_no}</span>
                  </Link>
                )}
              </div>

              {/* รหัสเอกสาร BOQ */}
              <h1 className="text-2xl font-black tracking-tight text-white font-mono whitespace-nowrap">
                {boq.boq_no}
              </h1>

              <p className="text-xs text-slate-400 truncate">
                {boq.title || 'เอกสารถอดแบบและประมาณราคาค่าวัสดุและค่าแรง (Bill of Quantities)'}
              </p>
            </div>
          </div>

          {/* แถบปุ่ม Action ด้านขวา (จัดเรียงเป็นแถวสมดุล สัดส่วนคงที่ h-9 - Option A) */}
          <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">
            {/* ปุ่มแปลงเป็นใบเสนอราคา (ถ้าแปลงแล้วจะเปิดดูใบเดิม ป้องกันกดซ้ำ) */}
            {existingQuotation ? (
              <Link
                to={`/quotations/${existingQuotation.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white h-9 px-3.5 text-xs font-bold shadow-xs transition"
                title="เอกสารนี้แปลงเป็นใบเสนอราคาแล้ว คลิกเพื่อเปิดดูใบเสนอราคา"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>ดูใบเสนอราคา ({existingQuotation.quotation_no})</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={converting}
                onClick={handleConvertToQuotation}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 h-9 px-3.5 text-xs font-black shadow-xs transition cursor-pointer disabled:opacity-50"
                title="แปลงรายการใน BOQ นี้เป็นใบเสนอราคาสำหรับลูกค้า (ทำได้ครั้งเดียว)"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>{converting ? 'กำลังแปลง...' : 'แปลงเป็นใบเสนอราคา'}</span>
              </button>
            )}

            {/* ปุ่มพิมพ์ BOQ */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 h-9 px-3.5 text-xs font-bold shadow-xs transition cursor-pointer"
              title="พิมพ์เอกสารถอดแบบและประมาณราคา (BOQ)"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>พิมพ์ BOQ</span>
            </button>

            {/* ทางเลือก A: ปุ่มแก้ไข อยู่ด้านนอก เป็น 1-Click Action */}
            <Link
              to={`/boq/${boq.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>แก้ไข</span>
            </Link>

            {/* ทางเลือก A: เมนูเพิ่มเติม [ ⋮ ] รวมปุ่มลบเอกสาร */}
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
                      handleDelete()
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-rose-400 hover:bg-rose-500/15 transition cursor-pointer font-bold"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>ลบเอกสาร BOQ</span>
                  </button>
                </div>
              )}
            </div>

            {/* ปุ่มย้อนกลับ */}
            <Link
              to="/boq"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 h-9 px-3 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>กลับ</span>
            </Link>
          </div>
        </div>

        {/* ชั้นที่ 2: แถบข้อมูลสรุปอ้างอิงเต็มความกว้าง (โครงการและข้อมูลทั้งหมดอยู่บรรทัดเดียวกันแบบเต็มจอ ไม่โดนปุ่มบีบ) */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>สร้างเมื่อ: <strong className="text-white font-mono">{new Date(boq.created_at).toLocaleString('th-TH')}</strong></span>
          </span>

          {boq.system_size_kwp && (
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>ขนาดติดตั้ง: <strong className="text-white">{boq.system_size_kwp} kWp</strong></span>
            </span>
          )}

          {(boq.customer_name || boq.projects?.client_name) && (
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>ลูกค้า: <strong className="text-white">{boq.customer_name || boq.projects?.client_name}</strong></span>
            </span>
          )}

          {boq.projects && (
            <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <FolderGit2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>โครงการ: <strong className="text-sky-300">[{boq.projects.project_code}] {boq.projects.project_name}</strong></span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Summary Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">ขนาดติดตั้ง (kWp)</span>
          <div className="mt-1 text-xl font-mono font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 tabular-nums">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>{Number(boq.system_size_kwp || 0) > 0 ? `${Number(boq.system_size_kwp).toLocaleString()} kWp` : '-'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">ต้นทุนวัสดุรวม</span>
          <div className="mt-1 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {baht(boq.total_material_cost || 0)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">บ.</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">ต้นทุนค่าแรงรวม</span>
          <div className="mt-1 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {baht(boq.total_labor_cost || 0)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">บ.</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">ราคาเสนอขาย (สุทธิ)</span>
          <div className="mt-1 text-xl font-mono font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
            {baht(boq.grand_total || 0)} <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400">บ.</span>
          </div>
        </div>
      </div>

      {/* 3. รายละเอียดโครงการ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-3">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <span>ข้อมูลโครงการและงานที่ถอดแบบ</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-400 dark:text-slate-500">ชื่องาน / รายละเอียด:</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{boq.title}</div>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500">ลูกค้า / เจ้าของโครงการ:</span>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{boq.customer_name || '-'}</div>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500">โครงการในระบบ (Project):</span>
            <div className="font-semibold text-sky-700 dark:text-sky-400 mt-0.5">
              {boq.projects ? `[${boq.projects.project_code}] ${boq.projects.project_name}` : 'ทั่วไป'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. รายการพัสดุและค่าแรง: แผงเลือกหมวดหมู่และค้นหามาตรฐานเดียวกับระบบคลังสินค้า */}
      <div className="space-y-4">
        {/* 4.1 Category Filter Card (สลับเลือกดูตามหมวดหมู่งาน หรือ หมวดหมู่วัสดุและอุปกรณ์ พร้อมช่องค้นหาหมวดหมู่) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
            {/* โหมดการเลือกดู: หมวดหมู่งาน vs หมวดหมู่วัสดุและอุปกรณ์ */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                <Layers className="h-4 w-4 text-sky-600 dark:text-amber-400" />
                <span>เลือกดูตาม:</span>
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryMode('work')
                    setSelectedCategory('all')
                    setCatSearchQuery('')
                  }}
                  className={`rounded-lg px-3 py-1.5 font-bold transition cursor-pointer ${
                    categoryMode === 'work'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  หมวดหมู่งาน
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryMode('material')
                    setSelectedCategory('all')
                    setCatSearchQuery('')
                  }}
                  className={`rounded-lg px-3 py-1.5 font-bold transition cursor-pointer ${
                    categoryMode === 'material'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  หมวดหมู่วัสดุและอุปกรณ์
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* ช่องค้นหาหมวดหมู่ (Search Categories) */}
              <div className="relative min-w-[160px] sm:w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={catSearchQuery}
                  onChange={(e) => setCatSearchQuery(e.target.value)}
                  placeholder={categoryMode === 'work' ? 'ค้นหาหมวดหมู่งาน...' : 'ค้นหาหมวดหมู่วัสดุ...'}
                  className="h-8 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-7 text-xs font-normal text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-2xs"
                />
                {catSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCatSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title="ล้างคำค้นหาหมวดหมู่"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <span className="text-slate-400 dark:text-slate-400 font-normal hidden sm:inline">
                แสดง {filteredItems.length} จาก {items.length} รายการ
              </span>

              {/* Dropdown เลือกหมวดหมู่ */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
              >
                <option value="all">
                  {categoryMode === 'work' ? 'หมวดหมู่งานทั้งหมด' : 'หมวดหมู่วัสดุและอุปกรณ์ทั้งหมด'} ({items.length} รายการ)
                </option>
                {filteredCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({items.filter((it) => getItemCategory(it) === cat).length} รายการ)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Pills (ห่อบรรทัดอย่างเป็นระเบียบ ไม่มี Scrollbar เกะกะ) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>ทั้งหมด</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  selectedCategory === 'all'
                    ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-950'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {items.length}
              </span>
            </button>

            {filteredCategories.map((cat) => {
              const count = items.filter((it) => getItemCategory(it) === cat).length
              const isSelected = selectedCategory === cat

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isSelected
                        ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-950'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}

            {filteredCategories.length === 0 && catSearchQuery && (
              <span className="text-xs text-slate-400 py-1">
                ไม่พบหมวดหมู่ที่ตรงกับ "{catSearchQuery}"
              </span>
            )}
          </div>
        </div>

        {/* 4.2 แถบตัวกรองและค้นหามาตรฐาน (Search, Collapse All & Actions Toolbar) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* ช่องค้นหา */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหารายการพัสดุ, งานบริการ, สเปกสินค้า..."
                className="input pl-10 pr-9 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {(selectedCategory !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all')
                  setSearchQuery('')
                }}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-bold px-2 py-1 cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            {/* ปุ่มย่อทุกหมวด / ขยายทุกหมวด */}
            {Object.keys(grouped).length > 0 && (
              <button
                type="button"
                onClick={toggleCollapseAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
              >
                {isAllCollapsed ? (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>ขยายทุกหมวด</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                    <span>ย่อทุกหมวด</span>
                  </>
                )}
              </button>
            )}

            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              มาร์กอัปกำไร: <b className="text-emerald-700 dark:text-emerald-400">+{boq.markup_percent || 15}%</b>
            </span>
          </div>
        </div>

        {/* กรณีค้นหาไม่พบรายการ */}
        {Object.keys(grouped).length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-2">
            <Search className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
              ไม่พบรายการที่ตรงกับคำค้นหา "{searchQuery}" {selectedCategory !== 'all' ? `ในหมวด "${selectedCategory}"` : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('all')
              }}
              className="text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
            >
              ล้างตัวกรองเพื่อแสดงรายการทั้งหมด
            </button>
          </div>
        )}

        {/* วนลูปแสดงแยกกล่องหมวดหมู่งาน แต่ละหมวดหมู่เป็นการ์ดแยกกันชัดเจน พับ/ขยายได้ */}
        {Object.entries(grouped).map(([category, catItems], cIdx) => {
          const catMatCost = catItems.reduce((s, it) => s + (Number(it.material_unit_cost || 0) * Number(it.quantity || 0)), 0)
          const catLabCost = catItems.reduce((s, it) => s + (Number(it.labor_unit_cost || 0) * Number(it.quantity || 0)), 0)
          const catTotal = catItems.reduce((s, it) => s + Number(it.total_amount || 0), 0)
          const isCollapsed = Boolean(collapsedCategories[category])

          return (
            <div
              key={category}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all"
            >
              {/* Category Card Header with Accordion Toggle */}
              <div
                onClick={() => toggleCategoryCollapse(category)}
                className="bg-slate-50/90 dark:bg-slate-800/80 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-100/80 dark:hover:bg-slate-800 transition"
                title={isCollapsed ? 'คลิกเพื่อขยายดูรายการ' : 'คลิกเพื่อย่อหมวดหมู่นี้'}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-600 text-white font-mono text-xs font-black shadow-2xs">
                    {cIdx + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{category}</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                        {catItems.length} รายการ
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    รวมเฉพาะหมวดนี้: <b className="font-mono text-slate-900 dark:text-slate-100 text-sm">฿{baht(catTotal)}</b>
                  </span>
                  <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </div>
                </div>
              </div>

              {/* Items Table inside Category (Rendered only when not collapsed) */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="table-auto w-full text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
                    <thead className="bg-slate-100/60 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12 border-r border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">#</th>
                        <th className="py-2.5 px-4 min-w-[240px] text-left border-r border-slate-200/60 dark:border-slate-700/60">รายการพัสดุและบริการ</th>
                        <th className="py-2.5 px-3 text-right w-24 border-r border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">จำนวน</th>
                        <th className="py-2.5 px-3 text-center w-20 border-r border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">หน่วย</th>
                        <th className="py-2.5 px-3.5 text-right w-32 border-r border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">ค่าวัสดุ/หน่วย</th>
                        <th className="py-2.5 px-3.5 text-right w-32 border-r border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">ค่าแรง/หน่วย</th>
                        <th className="py-2.5 px-4 text-right w-36 whitespace-nowrap">รวมเป็นเงิน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {catItems.map((it, idx) => (
                        <tr
                          key={it.id || idx}
                          className={`transition-colors border-b border-slate-200 dark:border-slate-800 ${
                            idx % 2 === 0
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/50 dark:bg-slate-800/30'
                          } hover:!bg-amber-50/60 dark:hover:!bg-slate-750`}
                        >
                          <td className="py-3 px-3 text-center text-slate-400 dark:text-slate-500 font-mono align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">{it.item_name}</div>
                            {it.description && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                                {it.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                            {Number(it.quantity || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400 align-middle border-r border-slate-200/60 dark:border-slate-800/60">
                            {it.unit}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-slate-700 dark:text-slate-300 align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums">
                            {baht(it.material_unit_cost || 0)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-amber-800 dark:text-amber-400 align-middle border-r border-slate-200/60 dark:border-slate-800/60 tabular-nums font-semibold">
                            {baht(it.labor_unit_cost || 0)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 align-middle tabular-nums">
                            {baht(it.total_amount || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50/70 dark:bg-slate-800/60 text-xs border-t border-slate-200 dark:border-slate-700">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-4 text-right text-slate-500 dark:text-slate-400 font-medium border-r border-slate-200 dark:border-slate-700">
                          รวมเฉพาะหมวด ({category}):
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 tabular-nums">
                          {baht(catMatCost)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-amber-800 dark:text-amber-400 border-r border-slate-200 dark:border-slate-700 tabular-nums font-semibold">
                          {baht(catLabCost)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          ฿{baht(catTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 5. กล่องสรุปโครงสร้างราคาและกำไรภาพรวม (Financial & Margin Summary Box) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/80 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>สรุปโครงสร้างต้นทุนและราคาเสนอขาย (Financial Summary)</span>
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            เอกสาร: {boq.boq_no}
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
          {/* ฝั่งซ้าย: ต้นทุนโดยตรง (Direct Cost) */}
          <div className="space-y-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
              1. สรุปต้นทุนโดยตรง (Direct Cost)
            </h4>
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
              <span>รวมต้นทุนค่าวัสดุและอุปกรณ์:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{baht(boq.total_material_cost || 0)} บาท</span>
            </div>
            <div className="flex items-center justify-between text-amber-800 dark:text-amber-400">
              <span>รวมต้นทุนค่าแรงและงานติดตั้ง:</span>
              <span className="font-mono font-bold">{baht(boq.total_labor_cost || 0)} บาท</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
              <span>รวมต้นทุนตรงทั้งสิ้น:</span>
              <span className="font-mono text-base">{baht(boq.total_cost || 0)} บาท</span>
            </div>
          </div>

          {/* ฝั่งขวา: การตั้งราคาและกำไร (Pricing & Margin) */}
          <div className="space-y-3 rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800 pb-2">
              2. กำไรและราคาขายเสนอจริง (Pricing & Markup)
            </h4>
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
              <span>อัตรากำไรมาร์กอัป (Markup):</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{boq.markup_percent || 15}%</span>
            </div>
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
              <span>กำไรส่วนเพิ่มที่เป็นตัวเงิน:</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{baht(boq.markup_amount || 0)} บาท</span>
            </div>
            <div className="border-t-2 border-emerald-500 pt-2 flex items-center justify-between font-black text-emerald-950 dark:text-emerald-100">
              <span className="text-sm">ราคารวมเสนอขายสุทธิ (Grand Total):</span>
              <span className="font-mono text-xl text-emerald-700 dark:text-emerald-400">฿{baht(boq.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {/* Action Callout Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            สถานะปัจจุบัน: <span className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-full border ${st.color}`}>{st.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {existingQuotation ? (
              <Link
                to={`/quotations/${existingQuotation.id}`}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5"
              >
                <FileCheck2 className="h-4 w-4" />
                <span>ดูใบเสนอราคา ({existingQuotation.quotation_no})</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={converting}
                onClick={handleConvertToQuotation}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 px-4 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileCheck2 className="h-4 w-4" />
                <span>{converting ? 'กำลังแปลง...' : 'แปลงเป็นใบเสนอราคา'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>พิมพ์ BOQ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal แปลง BOQ เป็นใบเสนอราคา (เลือกประเภทภาษี + ตรวจข้อมูลลูกค้า) */}
      {showConvertModal && conversionPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  แปลง BOQ เป็นใบเสนอราคา ({boq.boq_no})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  ตรวจสอบข้อมูลลูกค้าและเลือกรูปแบบภาษี (VAT 7%) ก่อนสร้างใบเสนอราคา
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-100">
                ลูกค้า: {conversionPreview.payload.customer_name}
              </div>
              {matchedCustomer ? (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 space-y-0.5">
                  <div>
                    เชื่อมข้อมูลจากสมุดรายชื่อสำเร็จ · เลขภาษี: {matchedCustomer.tax_id || '-'} · {conversionPreview.payload.customer_branch}
                  </div>
                  {matchedCustomer.address && (
                    <div className="text-slate-500 dark:text-slate-400 truncate">ที่อยู่: {matchedCustomer.address}</div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-amber-700 dark:text-amber-400">
                  ยังไม่พบข้อมูลเลขภาษี/ที่อยู่ในสมุดรายชื่อ (สามารถเพิ่มหรือแก้ไขต่อในใบเสนอราคาได้)
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-800 dark:text-slate-200">รูปแบบการคิดภาษีมูลค่าเพิ่ม (VAT)</div>
              {[
                {
                  value: 'vat_excluded',
                  title: 'แยกภาษีมูลค่าเพิ่ม +7% (VAT Excluded)',
                  desc: 'บวก VAT 7% เพิ่มจากราคาขายใน BOQ',
                },
                {
                  value: 'vat_included',
                  title: 'รวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Included)',
                  desc: 'ราคาขายใน BOQ รวม VAT ไว้แล้ว ถอดฐานภาษี 7/107 อัตโนมัติ',
                },
                {
                  value: 'vat_exempt',
                  title: 'ไม่คิดภาษีมูลค่าเพิ่ม (VAT Exempt 0%)',
                  desc: 'ยอดเสนอราคาเท่ากับยอดขาย BOQ โดยไม่มี VAT',
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                    convertTaxType === opt.value
                      ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 dark:border-sky-500'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="convertTaxType"
                    value={opt.value}
                    checked={convertTaxType === opt.value}
                    onChange={(e) => setConvertTaxType(e.target.value)}
                    className="mt-0.5 text-sky-600"
                  />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{opt.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 space-y-1.5">
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>รวมมูลค่ารายการ ({conversionPreview.itemRows.length} รายการ):</span>
                <span className="font-mono font-bold">{baht(conversionPreview.payload.subtotal)} บ.</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>
                  ภาษีมูลค่าเพิ่ม ({convertTaxType === 'vat_exempt' ? '0%' : '7%'}
                  {convertTaxType === 'vat_included' ? ' รวมในยอด' : ''}):
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {baht(conversionPreview.payload.vat_amount)} บ.
                </span>
              </div>
              <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-800 pt-1.5 text-sm font-black text-emerald-900 dark:text-emerald-300">
                <span>ยอดเสนอราคารวมสุทธิ:</span>
                <span className="font-mono">{baht(conversionPreview.payload.grand_total)} บาท</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={converting}
                onClick={() => setShowConvertModal(false)}
                className="btn-ghost"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={converting}
                onClick={handleConfirmConvert}
                className="btn-primary"
              >
                {converting ? 'กำลังสร้างใบเสนอราคา...' : 'ยืนยันสร้างใบเสนอราคา'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Print Modal */}
      {showPrintModal && (
        <BOQPrintModal
          boq={boq}
          items={items}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  )
}

