import { useEffect, useState, useMemo, Fragment } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import CustomerSelectField from '../../components/CustomerSelectField'
import { fetchUnifiedCustomers } from '../../lib/contactsSync'
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Sun,
  Wrench,
  Package,
  Layers,
  Calculator,
  Building2,
  User,
  Info,
  DollarSign,
  FolderPlus,
  ChevronRight,
  ListPlus,
} from 'lucide-react'

export const SOLAR_BOQ_CATEGORIES = [
  '1. งานแผงโซล่าเซลล์ (Solar PV Modules)',
  '2. งานอินเวอร์เตอร์ (Inverters)',
  '3. งานโครงสร้างติดตั้งและอุปกรณ์ยึด (Mounting & Support)',
  '4. งานระบบไฟฟ้า AC/DC และตู้ MDB (AC/DC BOS & Protection)',
  '5. งานสายไฟ ท่อร้อยสาย และอุปกรณ์ประกอบ (Cables & Conduits)',
  '6. งานวิศวกรรมและขออนุญาตภาครัฐ (Engineering & Grid Permitting)',
  '7. งานระบบประปาและสุขาภิบาล (Plumbing & Sanitation)',
  '8. งานโครงสร้างและงานโยธา (Civil & Structure)',
  '9. งานอื่น ๆ และบริการทั่วไป (Other Materials & Services)',
]

export const COMMON_UNITS = [
  'ชุด',
  'แผง',
  'เครื่อง',
  'เมตร',
  'ม้วน',
  'อัน',
  'เส้น',
  'ชิ้น',
  'ตัว',
  'จุด',
  'ตารางเมตร',
  'งาน',
  'กล่อง',
  'เหมา',
]

const EMPTY_MATERIAL_ITEM = {
  item_code: '',
  item_name: '',
  description: '',
  quantity: '1',
  unit: 'ชุด',
  material_unit_cost: '',
}

const EMPTY_LABOR_ITEM = {
  item_name: '',
  description: '',
  quantity: '1',
  unit: 'งาน',
  labor_unit_cost: '',
}

const createCategory = (name = '') => ({
  id: 'cat_' + Math.random().toString(36).slice(2, 9),
  name: name || SOLAR_BOQ_CATEGORIES[0],
  items: [
    {
      ...EMPTY_MATERIAL_ITEM,
      id: 'item_' + Math.random().toString(36).slice(2, 9),
    },
  ],
})

/**
 * แปลงรายการ boq_items จากฐานข้อมูลเข้าสู่โครงสร้าง State ที่แยกหมวดหมู่และค่าแรง
 */
function parseBoqItemsToState(rawItems) {
  const catMap = new Map()
  const laborList = []

  rawItems.forEach((it) => {
    const matCost = Number(it.material_unit_cost || 0)
    const labCost = Number(it.labor_unit_cost || 0)
    const isLaborOnly =
      (labCost > 0 && matCost === 0) ||
      String(it.category || '').includes('ค่าแรง') ||
      String(it.category || '').toLowerCase().includes('labor')

    if (isLaborOnly) {
      laborList.push({
        id: it.id || 'labor_' + Math.random().toString(36).slice(2, 9),
        item_name: it.item_name || '',
        description: it.description || '',
        quantity: it.quantity != null ? String(it.quantity) : '1',
        unit: it.unit || 'งาน',
        labor_unit_cost: labCost ? String(labCost) : (matCost ? String(matCost) : ''),
      })
    } else {
      const catName = it.category || SOLAR_BOQ_CATEGORIES[0]
      if (!catMap.has(catName)) {
        catMap.set(catName, [])
      }
      catMap.get(catName).push({
        id: it.id || 'item_' + Math.random().toString(36).slice(2, 9),
        item_code: it.item_code || '',
        item_name: it.item_name || '',
        description: it.description || '',
        quantity: it.quantity != null ? String(it.quantity) : '1',
        unit: it.unit || 'ชุด',
        material_unit_cost: matCost ? String(matCost) : '',
      })

      // หากเป็นรายการเดิมที่มีทั้งค่าวัสดุและค่าแรงในแถวเดียวกัน ให้แยกค่าแรงออกมาเข้า laborList
      if (labCost > 0) {
        laborList.push({
          id: 'labor_' + Math.random().toString(36).slice(2, 9),
          item_name: `ค่าแรง: ${it.item_name}`,
          description: it.description || '',
          quantity: it.quantity != null ? String(it.quantity) : '1',
          unit: it.unit || 'งาน',
          labor_unit_cost: String(labCost),
        })
      }
    }
  })

  let categories = Array.from(catMap.entries()).map(([name, items]) => ({
    id: 'cat_' + Math.random().toString(36).slice(2, 9),
    name,
    items,
  }))

  if (categories.length === 0) {
    categories = [createCategory(SOLAR_BOQ_CATEGORIES[0])]
  }

  return { categories, laborItems: laborList }
}

export default function BOQForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [projects, setProjects] = useState([])
  const [contacts, setContacts] = useState([])
  const [catalog, setCatalog] = useState([])

  // Header State
  const [boqNo, setBoqNo] = useState('')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [systemSizeKwp, setSystemSizeKwp] = useState('')
  const [markupPercent, setMarkupPercent] = useState('15')
  const [notes, setNotes] = useState('')

  // Categories State (จัดกลุ่มตามหมวดหมู่งาน เพิ่มรายการในหมวดเดิมได้ทันที)
  const [categories, setCategories] = useState([createCategory(SOLAR_BOQ_CATEGORIES[0])])

  // Labor Items State (แยกรายการค่าแรงออกมาต่างหาก ไม่ปนกับพัสดุ)
  const [laborItems, setLaborItems] = useState([
    {
      ...EMPTY_LABOR_ITEM,
      id: 'labor_' + Math.random().toString(36).slice(2, 9),
      item_name: 'ค่าแรงติดตั้งและทดสอบระบบ (Installation & Commissioning)',
    },
  ])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)

  // โหลดโครงการ, ลูกค้าในระบบ, และ Catalog พัสดุ
  useEffect(() => {
    supabase
      .from('projects')
      .select('id, project_code, project_name, client_name')
      .order('project_code')
      .then(({ data }) => setProjects(data ?? []))

    fetchUnifiedCustomers()
      .then((list) => setContacts(list ?? []))
      .catch(() => {})

    supabase
      .from('inventory_items')
      .select('id, item_code, item_name, unit, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setCatalog(data ?? []))

    if (!id) {
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const rand = Math.floor(1000 + Math.random() * 9000)
      setBoqNo(`BOQ-${year}${month}-${rand}`)
      return
    }

    // โหมดแก้ไข
    Promise.all([
      supabase.from('boqs').select('*').eq('id', id).single(),
      supabase
        .from('boq_items')
        .select('*')
        .eq('boq_id', id)
        .order('sort_order', { ascending: true }),
    ]).then(([bRes, itemsRes]) => {
      if (bRes.error) return setError('ไม่พบเอกสาร BOQ นี้')
      const b = bRes.data
      setBoqNo(b.boq_no || '')
      setTitle(b.title || '')
      setProjectId(b.project_id || '')
      setCustomerName(b.customer_name || '')
      setSystemSizeKwp(b.system_size_kwp ? String(b.system_size_kwp) : '')
      setMarkupPercent(b.markup_percent != null ? String(b.markup_percent) : '15')
      setNotes(b.notes || '')

      if (itemsRes.data && itemsRes.data.length > 0) {
        const { categories: parsedCats, laborItems: parsedLabors } = parseBoqItemsToState(
          itemsRes.data
        )
        setCategories(parsedCats)
        setLaborItems(
          parsedLabors.length > 0
            ? parsedLabors
            : [
                {
                  ...EMPTY_LABOR_ITEM,
                  id: 'labor_' + Math.random().toString(36).slice(2, 9),
                  item_name: 'ค่าแรงติดตั้งและทดสอบระบบ',
                },
              ]
        )
      }
    })
  }, [id])

  // จัดการเมื่อเปลี่ยนโครงการ
  const handleProjectChange = (selectedId) => {
    setProjectId(selectedId)
    if (!selectedId) return
    const p = projects.find((x) => x.id === selectedId)
    if (p) {
      setTitle(`งานประมาณราคาและติดตั้ง: ${p.project_name}`)
      if (p.client_name) {
        setCustomerName(p.client_name)
      }
    }
  }

  // ── Category Actions ────────────────────────────────────────────────────────
  const addCategory = () => {
    const nextCatName =
      SOLAR_BOQ_CATEGORIES[categories.length % SOLAR_BOQ_CATEGORIES.length] ||
      `หมวดงานที่ ${categories.length + 1}`
    setCategories([...categories, createCategory(nextCatName)])
  }

  const removeCategory = (catId) => {
    if (categories.length <= 1) {
      setCategories([createCategory(SOLAR_BOQ_CATEGORIES[0])])
    } else {
      setCategories(categories.filter((c) => c.id !== catId))
    }
  }

  const updateCategoryName = (catId, newName) => {
    setCategories(categories.map((c) => (c.id === catId ? { ...c, name: newName } : c)))
  }

  // ── Item Actions under a Category ──────────────────────────────────────────
  const addItemToCategory = (catId) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c
        return {
          ...c,
          items: [
            ...c.items,
            { ...EMPTY_MATERIAL_ITEM, id: 'item_' + Math.random().toString(36).slice(2, 9) },
          ],
        }
      })
    )
  }

  const removeItemFromCategory = (catId, itemId) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c
        if (c.items.length <= 1) {
          return {
            ...c,
            items: [
              { ...EMPTY_MATERIAL_ITEM, id: 'item_' + Math.random().toString(36).slice(2, 9) },
            ],
          }
        }
        return {
          ...c,
          items: c.items.filter((it) => it.id !== itemId),
        }
      })
    )
  }

  const updateItemInCategory = (catId, itemId, field, value) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c
        return {
          ...c,
          items: c.items.map((it) => {
            if (it.id !== itemId) return it
            let processedVal = value
            if (field === 'quantity' && value !== '') {
              const parsed = parseInt(value, 10)
              processedVal = isNaN(parsed) ? '' : String(Math.max(1, parsed))
            }
            const updated = { ...it, [field]: processedVal }

            if (field === 'item_name') {
              const found = catalog.find(
                (catItem) => catItem.item_name.toLowerCase() === String(value).trim().toLowerCase()
              )
              if (found) {
                if (!updated.unit && found.unit) updated.unit = found.unit
                if (!Number(updated.material_unit_cost) && found.avg_unit_cost) {
                  updated.material_unit_cost = String(found.avg_unit_cost)
                }
                if (found.item_code) updated.item_code = found.item_code
              }
            }
            return updated
          }),
        }
      })
    )
  }

  // ── Labor Actions ─────────────────────────────────────────────────────────
  const addLaborItem = () => {
    setLaborItems([
      ...laborItems,
      { ...EMPTY_LABOR_ITEM, id: 'labor_' + Math.random().toString(36).slice(2, 9) },
    ])
  }

  const removeLaborItem = (laborId) => {
    if (laborItems.length <= 1) {
      setLaborItems([
        { ...EMPTY_LABOR_ITEM, id: 'labor_' + Math.random().toString(36).slice(2, 9) },
      ])
    } else {
      setLaborItems(laborItems.filter((l) => l.id !== laborId))
    }
  }

  const updateLaborItem = (laborId, field, value) => {
    setLaborItems(
      laborItems.map((l) => {
        if (l.id !== laborId) return l
        let processedVal = value
        if (field === 'quantity' && value !== '') {
          const parsed = parseInt(value, 10)
          processedVal = isNaN(parsed) ? '' : String(Math.max(1, parsed))
        }
        return { ...l, [field]: processedVal }
      })
    )
  }

  // ── Calculations ───────────────────────────────────────────────────────────
  const categoryCalculations = useMemo(() => {
    return categories.map((cat) => {
      const itemCalcs = cat.items.map((it) => {
        const qty = parseInt(it.quantity, 10) || 0
        const matUnit = Number(it.material_unit_cost) || 0
        const totalMat = qty * matUnit
        return { qty, matUnit, totalMat }
      })
      const catTotal = itemCalcs.reduce((s, it) => s + it.totalMat, 0)
      return { itemCalcs, catTotal }
    })
  }, [categories])

  const totalMaterialCost = useMemo(() => {
    return categoryCalculations.reduce((s, c) => s + c.catTotal, 0)
  }, [categoryCalculations])

  const laborCalculations = useMemo(() => {
    return laborItems.map((l) => {
      const qty = parseInt(l.quantity, 10) || 0
      const labUnit = Number(l.labor_unit_cost) || 0
      const totalLab = qty * labUnit
      return { qty, labUnit, totalLab }
    })
  }, [laborItems])

  const totalLaborCost = useMemo(() => {
    return laborCalculations.reduce((s, l) => s + l.totalLab, 0)
  }, [laborCalculations])

  const totalCost = totalMaterialCost + totalLaborCost
  const markupRate = Number(markupPercent) || 0
  const markupAmount = (totalCost * markupRate) / 100
  const grandTotal = totalCost + markupAmount

  // ── บันทึก BOQ ─────────────────────────────────────────────────────────────
  async function save() {
    setError('')
    const newErrors = {}

    if (!boqNo.trim()) newErrors.boqNo = 'กรุณาระบุเลขที่ BOQ'
    if (!title.trim()) newErrors.title = 'กรุณาระบุชื่องาน / รายละเอียดโครงการ'

    const allMaterialItems = categories.flatMap((c) => c.items)
    const hasEmptyMatName = allMaterialItems.some((it) => !it.item_name?.trim())
    const hasInvalidMatQty = allMaterialItems.some(
      (it) => !it.quantity || parseInt(it.quantity, 10) <= 0
    )

    // ตรวจสอบรายการซ้ำในหมวดงานเดียวกัน
    const hasDuplicateInCat = categories.some((cat) => {
      const names = cat.items
        .map((it) => it.item_name?.trim().toLowerCase())
        .filter(Boolean)
      return new Set(names).size !== names.length
    })

    const activeLaborItems = laborItems.filter(
      (l) => l.item_name?.trim() || Number(l.labor_unit_cost) > 0
    )
    const hasInvalidLaborQty = activeLaborItems.some(
      (l) => !l.quantity || parseInt(l.quantity, 10) <= 0
    )

    if (hasEmptyMatName || hasInvalidMatQty || hasInvalidLaborQty) {
      setShowItemErrors(true)
      newErrors.items = 'กรุณาระบุชื่อรายการและจำนวนที่มากกว่า 0 ให้ครบถ้วน'
    } else if (hasDuplicateInCat) {
      setShowItemErrors(true)
      newErrors.items = 'พบรายการซ้ำในหมวดงานเดียวกัน กรุณาปรับเปลี่ยนจำนวนที่รายการเดิมแทนการเลือกรายการซ้ำ'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setBusy(true)
    try {
      const boqPayload = {
        boq_no: boqNo.trim(),
        title: title.trim(),
        project_id: projectId || null,
        customer_name: customerName.trim() || null,
        system_size_kwp: Number(systemSizeKwp) || 0,
        markup_percent: markupRate,
        markup_amount: markupAmount,
        total_material_cost: totalMaterialCost,
        total_labor_cost: totalLaborCost,
        total_cost: totalCost,
        grand_total: grandTotal,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      let boqId = id
      if (isEdit) {
        const { error: updErr } = await supabase.from('boqs').update(boqPayload).eq('id', id)
        if (updErr) throw updErr
      } else {
        const { data: insData, error: insErr } = await supabase
          .from('boqs')
          .insert([boqPayload])
          .select('id')
          .single()
        if (insErr) throw insErr
        boqId = insData.id
      }

      // ลบรายการเดิมแล้วใส่ใหม่
      if (isEdit) {
        await supabase.from('boq_items').delete().eq('boq_id', boqId)
      }

      const itemRows = []
      let sortOrder = 1

      // 1. รายการพัสดุ (จัดตามหมวดหมู่งาน ตัดค่าแรงออก)
      categories.forEach((cat) => {
        cat.items.forEach((it) => {
          const qty = parseInt(it.quantity, 10) || 1
          const matUnit = Number(it.material_unit_cost) || 0
          const totalMat = qty * matUnit
          itemRows.push({
            boq_id: boqId,
            category: cat.name.trim() || SOLAR_BOQ_CATEGORIES[0],
            item_code: it.item_code || null,
            item_name: it.item_name.trim(),
            description: it.description?.trim() || null,
            quantity: qty,
            unit: it.unit || 'ชุด',
            material_unit_cost: matUnit,
            labor_unit_cost: 0,
            total_material_cost: totalMat,
            total_labor_cost: 0,
            total_amount: totalMat,
            sort_order: sortOrder++,
          })
        })
      })

      // 2. รายการค่าแรงและงานบริการติดตั้ง
      activeLaborItems.forEach((l) => {
        const qty = parseInt(l.quantity, 10) || 1
        const labUnit = Number(l.labor_unit_cost) || 0
        const totalLab = qty * labUnit
        itemRows.push({
          boq_id: boqId,
          category: '6. งานค่าแรงติดตั้งและทดสอบระบบ (Installation Labor & Test)',
          item_code: null,
          item_name: l.item_name.trim(),
          description: l.description?.trim() || null,
          quantity: qty,
          unit: l.unit || 'งาน',
          material_unit_cost: 0,
          labor_unit_cost: labUnit,
          total_material_cost: 0,
          total_labor_cost: totalLab,
          total_amount: totalLab,
          sort_order: sortOrder++,
        })
      })

      if (itemRows.length > 0) {
        const { error: itemsErr } = await supabase.from('boq_items').insert(itemRows)
        if (itemsErr) throw itemsErr
      }

      navigate(`/boq/${boqId}`)
    } catch (err) {
      console.error(err)
      setError('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full space-y-6 font-sans text-slate-800 dark:text-slate-100 transition-colors">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6 text-white shadow-md border border-steel-700 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                BOQ ESTIMATOR
              </span>
              <span className="text-xs text-slate-300">
                {isEdit ? 'แก้ไขเอกสาร BOQ' : 'สร้างรายการประเมินราคา BOQ ใหม่'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-amber-400" />
              <span>{isEdit ? `แก้ไข BOQ: ${boqNo}` : 'ถอดแบบและประมาณราคา (BOQ Form)'}</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              จัดกลุ่มรายการตามหมวดหมู่งาน เพิ่มรายการในงานเดิมได้ทันที และแยกส่วนค่าแรงออกต่างหากอย่างชัดเจน
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ย้อนกลับ</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 p-4 text-xs font-semibold text-rose-800 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* 2. Main Form Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-8">
        {/* ส่วนที่ 1: ข้อมูลหัวเอกสารและโครงการ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>1. ข้อมูลหัวเอกสารและโครงการ</span>
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ช่องที่มีเครื่องหมาย <span className="text-rose-500 font-bold">*</span> จำเป็นต้องระบุ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* เลขที่ BOQ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                เลขที่เอกสาร BOQ *
              </label>
              <input
                type="text"
                className={fieldErrorClass(
                  errors.boqNo,
                  'input font-mono font-bold text-xs w-full bg-slate-50 dark:bg-slate-800/80'
                )}
                value={boqNo}
                onChange={(e) => setBoqNo(e.target.value)}
                placeholder="BOQ-202611-001"
              />
              <FieldError error={errors.boqNo} />
            </div>

            {/* ชื่องาน / รายละเอียดงานติดตั้ง */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ชื่องาน / รายละเอียดงานติดตั้ง *
              </label>
              <input
                type="text"
                list="boq-project-titles"
                className={fieldErrorClass(errors.title, 'input font-bold text-xs w-full')}
                placeholder="เช่น งานติดตั้งระบบ Solar Rooftop 100 kWp หรือคลิกเลือกจากโครงการ"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <datalist id="boq-project-titles">
                {projects.map((p) => (
                  <option key={p.id} value={`งานติดตั้งและประมาณราคา: ${p.project_name}`} />
                ))}
              </datalist>
              <FieldError error={errors.title} />
            </div>

            {/* เชื่อมโยงโครงการ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                เชื่อมโยงโครงการ (ถ้ามี)
              </label>
              <select
                className="input text-xs w-full"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
              >
                <option value="">-- ไม่ระบุโครงการ / ถอดแบบก่อนขาย --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.project_code}] {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            {/* ชื่อลูกค้า / เจ้าของโครงการ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>ชื่อลูกค้า / เจ้าของโครงการ</span>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">
                  ค้นหาจากสมุดรายชื่อได้
                </span>
              </label>
              <CustomerSelectField
                value={customerName}
                onChange={(val) => setCustomerName(val)}
                placeholder="ค้นหาชื่อลูกค้า หรือพิมพ์ชื่อใหม่..."
              />
            </div>

            {/* กำลังผลิตติดตั้ง */}
            <div>
              <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>กำลังผลิตติดตั้ง (kWp) - ถ้ามี</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input text-xs font-mono font-bold w-full text-amber-800 dark:text-amber-300"
                placeholder="เช่น 100 หรือ 150.5"
                value={systemSizeKwp}
                onChange={(e) => setSystemSizeKwp(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Datalists สำหรับตัวเลือกหมวดหมู่งาน, รายการวัสดุในคลัง, และหน่วยนับ */}
        <datalist id="boq-categories-list">
          {SOLAR_BOQ_CATEGORIES.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>

        <datalist id="boq-catalog-items">
          {catalog.map((c) => (
            <option key={c.id} value={c.item_name}>
              [{c.item_code}] ({c.unit}) ราคาเฉลี่ย {baht(c.avg_unit_cost)} บ.
            </option>
          ))}
        </datalist>

        <datalist id="boq-unit-list">
          {COMMON_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        {/* ส่วนที่ 2: รายการถอดแบบพัสดุและอุปกรณ์ (จัดกลุ่มตามหมวดหมู่งาน ตัดค่าแรงออก) */}
        <div className="space-y-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>2. รายการถอดแบบพัสดุและอุปกรณ์ (Material Items by Category)</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                จัดกลุ่มรายการตามหมวดหมู่งาน ตัดช่องค่าแรงออกจากพัสดุ และสามารถเพิ่มรายการอื่นต่อในงานเดิมได้ทันที
              </p>
            </div>
            <button
              type="button"
              onClick={addCategory}
              className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-800 dark:text-sky-300 px-3.5 py-1.5 text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto transition"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>+ เพิ่มหมวดหมู่งานใหม่</span>
            </button>
          </div>

          {/* รายการหมวดหมู่งาน (แต่ละหมวดมีรายการย่อยอยู่ภายใน) */}
          <div className="space-y-6">
            {categories.map((cat, catIdx) => {
              const catCalc = categoryCalculations[catIdx]

              return (
                <div
                  key={cat.id}
                  className="rounded-2xl border-2 border-sky-200 dark:border-sky-900/60 bg-white dark:bg-slate-900/95 overflow-hidden shadow-sm"
                >
                  {/* แถบหัวหมวดหมู่งาน */}
                  <div className="p-3.5 sm:p-4 bg-sky-50/70 dark:bg-sky-950/40 border-b border-sky-200 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                      <span className="flex h-8 px-2.5 items-center justify-center rounded-xl bg-sky-700 text-white font-bold text-xs shrink-0 shadow-xs">
                        หมวดที่ {catIdx + 1}
                      </span>
                      <div className="flex-1">
                        <input
                          list={`boq-categories-list-${cat.id}`}
                          type="text"
                          value={cat.name}
                          onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                          className="input text-xs font-bold w-full bg-white dark:bg-slate-900 text-sky-950 dark:text-sky-200 border-sky-300 dark:border-sky-800 focus:ring-1 focus:ring-sky-500"
                          placeholder="เลือกหรือพิมพ์ชื่อหมวดหมู่งาน เช่น 1. งานแผงโซล่าเซลล์..."
                        />
                        <datalist id={`boq-categories-list-${cat.id}`}>
                          {SOLAR_BOQ_CATEGORIES.filter((catOption) => {
                            // ตัดหมวดหมู่งานที่ถูกเลือกไปแล้วในหมวดอื่นออก
                            return !categories.some(
                              (otherCat) =>
                                otherCat.id !== cat.id &&
                                otherCat.name.trim().toLowerCase() === catOption.trim().toLowerCase()
                            )
                          }).map((catOption) => (
                            <option key={catOption} value={catOption} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-normal">
                          รวมเฉพาะหมวดที่ {catIdx + 1}:
                        </span>
                        <span className="font-mono font-bold text-xs text-sky-800 dark:text-sky-300">
                          {baht(catCalc?.catTotal || 0)} บ.
                        </span>
                      </div>

                      {categories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCategory(cat.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg transition border border-rose-200 dark:border-rose-900 shadow-2xs"
                          title="ลบหมวดหมู่งานนี้ทั้งหมด"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* รายการพัสดุ / อุปกรณ์ภายในหมวดนี้ */}
                  <div className="p-4 space-y-3.5 bg-slate-50/40 dark:bg-slate-900/40">
                    {cat.items.map((it, itemIdx) => {
                      const itemCalc = catCalc?.itemCalcs[itemIdx]
                      const nameEmpty = showItemErrors && !it.item_name?.trim()
                      const qtyEmpty =
                        showItemErrors && (!it.quantity || parseInt(it.quantity, 10) <= 0)
                      const isDuplicate = cat.items.some(
                        (other) =>
                          other.id !== it.id &&
                          other.item_name?.trim().toLowerCase() === it.item_name?.trim().toLowerCase() &&
                          it.item_name?.trim()
                      )

                      return (
                        <div
                          key={it.id}
                          className={`rounded-xl border p-3.5 space-y-3 transition shadow-2xs bg-white dark:bg-slate-900 ${
                            isDuplicate
                              ? 'border-amber-400 dark:border-amber-600 bg-amber-50/20 dark:bg-amber-950/20 ring-1 ring-amber-400/50'
                              : nameEmpty || qtyEmpty
                              ? 'border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          {/* บรรทัดที่ 1: ลำดับ, ชื่อพัสดุ / บริการ, และปุ่มลบ */}
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-14 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                              #{catIdx + 1}.{itemIdx + 1}
                            </span>

                            <div className="flex-1 min-w-[200px]">
                              <input
                                list={`boq-catalog-items-${cat.id}-${it.id}`}
                                type="text"
                                className={fieldErrorClass(
                                  nameEmpty || isDuplicate,
                                  `input text-xs w-full text-left font-bold text-slate-900 dark:text-slate-100 placeholder:font-normal ${
                                    isDuplicate ? 'border-amber-400 dark:border-amber-600 focus:border-amber-500' : ''
                                  }`
                                )}
                                placeholder="พิมพ์ชื่อพัสดุ / อุปกรณ์ หรือเลือกจากคลังสินค้า..."
                                value={it.item_name}
                                onChange={(e) =>
                                  updateItemInCategory(cat.id, it.id, 'item_name', e.target.value)
                                }
                              />
                              {/* Datalist ที่ตัดรายการที่ถูกเลือกในหมวดนี้ออกแล้ว */}
                              <datalist id={`boq-catalog-items-${cat.id}-${it.id}`}>
                                {catalog
                                  .filter((c) => {
                                    // ตัดรายการเดิมที่ถูกเลือกไปแล้วในหมวดงานนี้ออก เพื่อไม่ให้เลือกซ้ำ
                                    return !cat.items.some(
                                      (other) =>
                                        other.id !== it.id &&
                                        other.item_name?.trim().toLowerCase() === c.item_name.trim().toLowerCase()
                                    )
                                  })
                                  .map((c) => (
                                    <option key={c.id} value={c.item_name}>
                                      [{c.item_code}] ({c.unit}) ราคาเฉลี่ย {baht(c.avg_unit_cost)} บ.
                                    </option>
                                  ))}
                              </datalist>

                              {isDuplicate && (
                                <span className="block text-[10px] text-amber-700 dark:text-amber-400 font-bold mt-1">
                                  ⚠️ รายการนี้ถูกเลือกในหมวดนี้แล้ว กรุณาปรับเปลี่ยนจำนวนที่รายการเดิมแทน
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => removeItemFromCategory(cat.id, it.id)}
                              className="h-8 px-2.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded-lg transition border border-rose-200 dark:border-rose-900 shadow-2xs flex items-center gap-1 font-bold text-xs shrink-0"
                              title={
                                cat.items.length <= 1 ? 'ล้างข้อมูลเป็นค่าว่าง' : 'ลบรายการนี้'
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">ลบ</span>
                            </button>
                          </div>

                          {/* บรรทัดที่ 2: ช่องคำนวณ (จำนวน, หน่วย, ค่าวัสดุ, รวมเงิน) - ตัดค่าแรงออก */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            {/* ช่องที่ 1: จำนวน & หน่วยนับ */}
                            <div className="rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                              <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                จำนวน &amp; หน่วย
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  className={fieldErrorClass(
                                    qtyEmpty,
                                    'input text-xs w-full font-mono font-bold bg-white dark:bg-slate-900'
                                  )}
                                  placeholder="จำนวน"
                                  value={it.quantity}
                                  onChange={(e) =>
                                    updateItemInCategory(cat.id, it.id, 'quantity', e.target.value)
                                  }
                                />
                                <input
                                  list="boq-unit-list"
                                  type="text"
                                  className="input text-xs w-full bg-white dark:bg-slate-900"
                                  placeholder="หน่วย"
                                  value={it.unit}
                                  onChange={(e) =>
                                    updateItemInCategory(cat.id, it.id, 'unit', e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            {/* ช่องที่ 2: ค่าวัสดุ/หน่วย (บ.) */}
                            <div className="rounded-lg p-2.5 bg-sky-50/40 dark:bg-sky-950/20 border border-sky-200/80 dark:border-sky-800">
                              <span className="block text-[11px] font-bold text-sky-800 dark:text-sky-300 mb-1 flex items-center gap-1">
                                <Package className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                <span>ค่าวัสดุ/หน่วย (บ.)</span>
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input text-xs w-full font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900"
                                placeholder="0.00"
                                value={it.material_unit_cost}
                                onChange={(e) =>
                                  updateItemInCategory(
                                    cat.id,
                                    it.id,
                                    'material_unit_cost',
                                    e.target.value
                                  )
                                }
                              />
                            </div>

                            {/* ช่องที่ 3: รวมเงินสุทธิของรายการ (เฉพาะค่าวัสดุ) */}
                            <div className="rounded-lg p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between">
                              <span className="block text-[11px] font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                                รวมเงินวัสดุ (บ.)
                              </span>
                              <div className="h-8 px-2.5 flex items-center justify-start font-mono font-black text-xs text-slate-900 dark:text-emerald-400 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                                {baht(itemCalc?.totalMat || 0)} บาท
                              </div>
                            </div>
                          </div>

                          {/* บรรทัดที่ 3: สเปกวิศวกรรมและเงื่อนไขเทคนิค */}
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                            <input
                              type="text"
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                              placeholder="สเปกเทคนิค / รุ่น / รายละเอียดเพิ่มเติม (เช่น แผง Tier-1 Half-cell, รางอลูมิเนียม 6005-T5)..."
                              value={it.description || ''}
                              onChange={(e) =>
                                updateItemInCategory(cat.id, it.id, 'description', e.target.value)
                              }
                            />
                          </div>
                        </div>
                      )
                    })}

                    {/* ปุ่มเพิ่มรายการในงานเดิมต่อได้ทันที โดยไม่ต้องเลือกหรือพิมพ์หมวดงานเดิมซ้ำอีก */}
                    <button
                      type="button"
                      onClick={() => addItemToCategory(cat.id)}
                      className="rounded-xl border-2 border-dashed border-sky-300 dark:border-sky-800 hover:border-sky-400 dark:hover:border-sky-700 bg-sky-50/60 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-800 dark:text-sky-300 w-full py-2.5 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <Plus className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <span>
                        + เพิ่มรายการอื่นในหมวดที่ {catIdx + 1} ({cat.name ? cat.name.split(' ')[1] || cat.name.slice(0, 25) : 'งานนี้'}) ต่อ
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <FieldError error={errors.items} />

          {/* ปุ่มเพิ่มหมวดหมู่งานใหม่ */}
          <button
            type="button"
            onClick={addCategory}
            className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 w-full py-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-400 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <FolderPlus className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>+ เพิ่มหมวดหมู่งานใหม่ (Add New Work Category)</span>
          </button>
        </div>

        {/* ส่วนที่ 3: รายการค่าแรงและบริการติดตั้ง */}
        <div className="space-y-4 pt-6 border-t-2 border-amber-200 dark:border-amber-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">
            <div>
              <h2 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>3. รายการค่าแรงและบริการติดตั้ง (Labor &amp; Installation Services)</span>
              </h2>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                กำหนดต้นทุนค่าแรงและงานบริการติดตั้ง สามารถระบุเป็นค่าแรงเหมา หรือค่าแรงตามหน่วยงานได้
              </p>
            </div>
            <button
              type="button"
              onClick={addLaborItem}
              className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-100 hover:bg-amber-200 text-amber-900 dark:text-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 px-3.5 py-1.5 text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ เพิ่มรายการค่าแรง</span>
            </button>
          </div>

          {/* รายการค่าแรง */}
          <div className="space-y-3">
            {laborItems.map((l, lIdx) => {
              const lCalc = laborCalculations[lIdx]

              return (
                <div
                  key={l.id}
                  className="rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/25 dark:bg-amber-950/20 p-3.5 space-y-3 transition shadow-2xs hover:border-amber-300"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 px-2.5 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shrink-0 shadow-2xs">
                      ค่าแรง #{lIdx + 1}
                    </span>

                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        className="input text-xs w-full font-bold text-amber-950 dark:text-amber-100 bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 focus:ring-1 focus:ring-amber-500"
                        placeholder="ระบุชื่องานค่าแรง / บริการติดตั้ง เช่น ค่าแรงติดตั้งแผงโซล่าเซลล์, ค่าทดสอบระบบ..."
                        value={l.item_name}
                        onChange={(e) => updateLaborItem(l.id, 'item_name', e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLaborItem(l.id)}
                      className="h-8 px-2.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-900 hover:bg-rose-50 rounded-lg transition border border-rose-200 dark:border-rose-900 shadow-2xs flex items-center gap-1 font-bold text-xs shrink-0"
                      title="ลบรายการค่าแรงนี้"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">ลบ</span>
                    </button>
                  </div>

                  {/* ช่องตัวเลขค่าแรง */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-100 dark:border-amber-900/60">
                    <div className="rounded-lg p-2.5 bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800">
                      <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        จำนวน &amp; หน่วย
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="input text-xs w-full font-mono font-bold bg-white dark:bg-slate-900"
                          placeholder="จำนวน"
                          value={l.quantity}
                          onChange={(e) => updateLaborItem(l.id, 'quantity', e.target.value)}
                        />
                        <input
                          list="boq-unit-list"
                          type="text"
                          className="input text-xs w-full bg-white dark:bg-slate-900"
                          placeholder="หน่วย"
                          value={l.unit}
                          onChange={(e) => updateLaborItem(l.id, 'unit', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg p-2.5 bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800">
                      <span className="block text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                        <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>ค่าแรง/หน่วย (บ.)</span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input text-xs w-full font-mono font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-900"
                        placeholder="0.00"
                        value={l.labor_unit_cost}
                        onChange={(e) => updateLaborItem(l.id, 'labor_unit_cost', e.target.value)}
                      />
                    </div>

                    <div className="rounded-lg p-2.5 bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800 flex flex-col justify-between">
                      <span className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1">
                        รวมเงินค่าแรง (บ.)
                      </span>
                      <div className="h-8 px-2.5 flex items-center justify-start font-mono font-black text-xs text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800 shadow-2xs">
                        {baht(lCalc?.totalLab || 0)} บาท
                      </div>
                    </div>
                  </div>

                  {/* รายละเอียด/ขอบเขตงานค่าแรง */}
                  <div className="pt-1.5 border-t border-amber-100 dark:border-amber-900/60">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                      placeholder="ขอบเขตงานค่าแรง / เงื่อนไขการติดตั้งเพิ่มเติม..."
                      value={l.description || ''}
                      onChange={(e) => updateLaborItem(l.id, 'description', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={addLaborItem}
            className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 w-full py-2.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ เพิ่มรายการค่าแรง / บริการติดตั้ง</span>
          </button>
        </div>

        {/* ส่วนที่ 4: สรุปต้นทุน กำไร และราคาเสนอขาย (Financial Summary) */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* หมายเหตุ */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              หมายเหตุ / เงื่อนไขทั่วไปใน BOQ
            </label>
            <textarea
              rows={6}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-900 dark:focus:border-amber-500 focus:outline-none"
              placeholder="เช่น กำหนดยืนราคา 30 วัน, ไม่รวมงานปรับปรุงโครงสร้างหลังคาเดิม, การชำระเงินแบ่ง 3 งวด..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* สรุปตัวเลขทางการเงิน แยกค่าวัสดุ vs ค่าแรง ชัดเจน */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-5 space-y-3.5 text-xs">
            {/* กล่องแยกค่าวัสดุ vs ค่าแรง */}
            <div className="grid grid-cols-2 gap-2.5 pb-1">
              {/* ค่าวัสดุ */}
              <div className="rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-sky-200 dark:border-sky-900/60 shadow-2xs">
                <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-bold text-[11px] mb-1">
                  <Package className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>รวมต้นทุนค่าวัสดุ</span>
                </div>
                <div className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                  {baht(totalMaterialCost)}{' '}
                  <span className="text-[10px] font-normal text-slate-500">บ.</span>
                </div>
              </div>

              {/* ค่าแรง */}
              <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/40 p-3.5 border border-amber-300 dark:border-amber-900/80 shadow-2xs">
                <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 font-bold text-[11px] mb-1">
                  <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>รวมต้นทุนค่าแรง</span>
                </div>
                <div className="font-mono font-bold text-base text-amber-900 dark:text-amber-300">
                  {baht(totalLaborCost)}{' '}
                  <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
                    บ.
                  </span>
                </div>
              </div>
            </div>

            {/* รวมต้นทุนตรง */}
            <div className="flex justify-between items-center text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-200 dark:border-slate-700 font-bold">
              <span>รวมต้นทุนตรงทั้งหมด (วัสดุ + แรง):</span>
              <span className="font-mono text-sm">{baht(totalCost)} บาท</span>
            </div>

            {/* อัตรามาร์กอัปกำไร */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-slate-500" />
                <span>กำไรส่วนเพิ่ม (Markup %):</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="0.5"
                  className="input w-16 text-right font-mono font-bold text-xs py-1"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                />
                <span className="font-bold">%</span>
              </div>
            </div>

            <div className="flex justify-between text-emerald-800 dark:text-emerald-400">
              <span>จำนวนเงินกำไร (Markup Amount):</span>
              <span className="font-mono font-bold">+{baht(markupAmount)} บาท</span>
            </div>

            {/* ราคารวมเสนอขายสุทธิ */}
            <div className="pt-3 border-t-2 border-slate-300 dark:border-slate-600 flex justify-between items-center text-sm font-black text-slate-900 dark:text-slate-100">
              <span>ราคารวมเสนอขายสุทธิ (Selling Price):</span>
              <span className="text-xl font-mono text-emerald-700 dark:text-emerald-400">
                {baht(grandTotal)} <span className="text-xs font-normal text-slate-500">บาท</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => navigate('/boq')}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-amber-300 dark:text-slate-950 font-black px-6 py-2.5 text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {busy ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข BOQ' : 'บันทึกเอกสาร BOQ'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
