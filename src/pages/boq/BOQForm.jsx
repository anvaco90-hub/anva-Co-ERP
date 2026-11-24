import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
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
} from 'lucide-react'

export const SOLAR_BOQ_CATEGORIES = [
  '1. งานแผงโซล่าเซลล์ (Solar PV Modules)',
  '2. งานอินเวอร์เตอร์ (Inverters)',
  '3. งานโครงสร้างติดตั้งและอุปกรณ์ยึด (Mounting & Support)',
  '4. งานระบบไฟฟ้า AC/DC และตู้ MDB (AC/DC BOS & Protection)',
  '5. งานสายไฟ ท่อร้อยสาย และอุปกรณ์ประกอบ (Cables & Conduits)',
  '6. งานค่าแรงติดตั้งและทดสอบระบบ (Installation Labor & Test)',
  '7. งานวิศวกรรมและขออนุญาตภาครัฐ (Engineering & Grid Permitting)',
  '8. งานระบบประปาและสุขาภิบาล (Plumbing & Sanitation)',
  '9. งานโครงสร้างและงานโยธา (Civil & Structure)',
  '10. งานอื่น ๆ และบริการทั่วไป (Other Services)',
]

// หน่วยนับมาตรฐานที่ใช้บ่อยในระบบวิศวกรรมและก่อสร้าง
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

// ข้อ 2: บรรทัดว่างเริ่มต้น ไม่มีข้อมูลจำลอง เพื่อให้ผู้ใช้เลือกและกรอกเอง
const EMPTY_BOQ_LINE = {
  category: '',
  item_code: '',
  item_name: '',
  description: '',
  quantity: '',
  unit: '',
  material_unit_cost: '',
  labor_unit_cost: '',
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

  // Lines State (ข้อ 2: เริ่มต้นด้วยบรรทัดว่าง 1 แถว ให้ผู้ใช้กรอกเอง)
  const [items, setItems] = useState([{ ...EMPTY_BOQ_LINE }])

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

    supabase
      .from('contacts')
      .select('id, company_name, business_name, contact_type')
      .order('company_name')
      .then(({ data }) => setContacts(data ?? []))

    supabase
      .from('inventory_items')
      .select('id, item_code, item_name, unit, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setCatalog(data ?? []))

    if (!id) {
      // เลขรันเริ่มต้น
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
      supabase.from('boq_items').select('*').eq('boq_id', id).order('sort_order', { ascending: true }),
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
        setItems(
          itemsRes.data.map((it) => ({
            category: it.category || SOLAR_BOQ_CATEGORIES[0],
            item_code: it.item_code || '',
            item_name: it.item_name || '',
            description: it.description || '',
            quantity: it.quantity != null ? String(it.quantity) : '',
            unit: it.unit || '',
            material_unit_cost: it.material_unit_cost != null ? String(it.material_unit_cost) : '',
            labor_unit_cost: it.labor_unit_cost != null ? String(it.labor_unit_cost) : '',
          }))
        )
      }
    })
  }, [id])

  // รายชื่อลูกค้าและคู่ค้าในระบบทั้งหมด (ข้อ 6: คีย์มีบันทึกรายชื่อในระบบให้เลือกด้วย)
  const customerSuggestions = useMemo(() => {
    const set = new Set()
    ;(contacts || []).forEach((c) => {
      const name = (c.company_name || c.business_name || '').trim()
      if (name) set.add(name)
    })
    ;(projects || []).forEach((p) => {
      const name = (p.client_name || '').trim()
      if (name) set.add(name)
    })
    return Array.from(set)
  }, [contacts, projects])

  // ข้อ 5: ถ้าเปลี่ยนโครงการ ควรเปลี่ยนชื่อและลูกค้าด้วย
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

  // ฟังก์ชันลบแถว (ถ้าเหลือ 1 แถว จะล้างค่ากลับเป็นค่าว่างเพื่อให้ผู้ใช้กรอกใหม่)
  const handleRemoveRow = (idxToRemove) => {
    if (items.length <= 1) {
      setItems([{ ...EMPTY_BOQ_LINE }])
    } else {
      setItems(items.filter((_, i) => i !== idxToRemove))
    }
  }

  // ฟังก์ชันอัปเดตบรรทัด
  const updItem = (index, key, val) => {
    const next = items.map((it, idx) => {
      if (idx !== index) return it
      const updated = { ...it, [key]: val }

      // Auto-suggest unit & price จาก catalog ถ้าเลือกชื่อวัสดุตรงกัน
      if (key === 'item_name') {
        const found = catalog.find(
          (c) => c.item_name.toLowerCase() === String(val).trim().toLowerCase()
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
    })
    setItems(next)
  }

  // คำนวณสรุปตัวเลข (Financial Calculations)
  const lineCalcs = items.map((it) => {
    const qty = Number(it.quantity) || 0
    const matUnit = Number(it.material_unit_cost) || 0
    const labUnit = Number(it.labor_unit_cost) || 0
    const totalMat = qty * matUnit
    const totalLab = qty * labUnit
    const totalLine = totalMat + totalLab
    return { qty, matUnit, labUnit, totalMat, totalLab, totalLine }
  })

  // ข้อ 4: แยกต้นทุนค่าวัสดุ และ ต้นทุนค่าแรง ออกต่างหาก
  const totalMaterialCost = lineCalcs.reduce((s, l) => s + l.totalMat, 0)
  const totalLaborCost = lineCalcs.reduce((s, l) => s + l.totalLab, 0)
  const totalCost = totalMaterialCost + totalLaborCost

  const markupRate = Number(markupPercent) || 0
  const markupAmount = (totalCost * markupRate) / 100
  const grandTotal = totalCost + markupAmount

  // บันทึก BOQ
  async function save() {
    setError('')
    const newErrors = {}

    if (!boqNo.trim()) newErrors.boqNo = 'กรุณาระบุเลขที่ BOQ'
    if (!title.trim()) newErrors.title = 'กรุณาระบุชื่องาน / รายละเอียดโครงการ'

    const hasEmptyName = items.some((it) => !it.item_name?.trim())
    const hasInvalidQty = items.some((it) => !it.quantity || Number(it.quantity) <= 0)

    if (hasEmptyName || hasInvalidQty) {
      setShowItemErrors(true)
      newErrors.items = 'กรุณาระบุชื่อรายการและจำนวนที่มากกว่า 0 ให้ครบทุกแถว'
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
        const { data: insData, error: insErr } = await supabase.from('boqs').insert([boqPayload]).select('id').single()
        if (insErr) throw insErr
        boqId = insData.id
      }

      // ลบรายการเดิมแล้วใส่ใหม่
      if (isEdit) {
        await supabase.from('boq_items').delete().eq('boq_id', boqId)
      }

      const itemRows = items.map((it, idx) => {
        const c = lineCalcs[idx]
        return {
          boq_id: boqId,
          category: it.category || SOLAR_BOQ_CATEGORIES[0],
          item_code: it.item_code || null,
          item_name: it.item_name.trim(),
          description: it.description?.trim() || null,
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'ชุด',
          material_unit_cost: c.matUnit,
          labor_unit_cost: c.labUnit,
          total_material_cost: c.totalMat,
          total_labor_cost: c.totalLab,
          total_amount: c.totalLine,
          sort_order: idx + 1,
        }
      })

      const { error: itemsErr } = await supabase.from('boq_items').insert(itemRows)
      if (itemsErr) throw itemsErr

      navigate(`/boq/${boqId}`)
    } catch (err) {
      console.error(err)
      setError('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-6 font-sans text-slate-800 dark:text-slate-100 transition-colors">
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
              กำหนดหมวดหมู่งาน แยกค่าวัสดุ ค่าแรง และคำนวณราคาเสนอขายอัตโนมัติ (รองรับโหมดกลางวันและกลางคืน)
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

      {/* 2. Main Form Card (ข้อ 1 & 7: มองเห็นคมชัดทั้งกลางวันและกลางคืน จัดเลย์เอาต์เข้าใจง่าย) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
        
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
                className={fieldErrorClass(errors.boqNo, 'input font-mono font-bold text-xs w-full bg-slate-50 dark:bg-slate-800/80')}
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

            {/* เชื่อมโยงโครงการ (ข้อ 5: เปลี่ยนโครงการ อัปเดตชื่องานและชื่อลูกค้าให้อัตโนมัติ) */}
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

            {/* ชื่อลูกค้า / เจ้าของโครงการ (ข้อ 6: คีย์มีบันทึกรายชื่อในระบบให้เลือกด้วย) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>ชื่อลูกค้า / เจ้าของโครงการ</span>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">มีรายชื่อในระบบ</span>
              </label>
              <input
                type="text"
                list="boq-customer-list"
                className="input text-xs w-full"
                placeholder="พิมพ์เพื่อค้นหา หรือเลือกจากรายชื่อลูกค้าในระบบ..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <datalist id="boq-customer-list">
                {customerSuggestions.map((name, i) => (
                  <option key={i} value={name} />
                ))}
              </datalist>
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

        {/* ส่วนที่ 2: รายการถอดแบบพัสดุและค่าแรง (Itemized BOQ) */}
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>2. รายการถอดแบบพัสดุและค่าแรง (Itemized BOQ)</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                พิมพ์สเปกแบบขยายลงล่างได้อิสระ แยกต้นทุนค่าวัสดุและค่าแรงออกจากกันชัดเจน
              </p>
            </div>
            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY_BOQ_LINE }])}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 px-3.5 py-1.5 text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span> เพิ่มรายการถอดแบบ</span>
            </button>
          </div>

          {/* Datalists สำหรับเลือกชื่อวัสดุในคลัง และ หน่วยนับ */}
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

          {/* ข้อ 1 & 3: แถบหัวตาราง (Table Header) และตารางแบบเลื่อนแนวนอน ป้องกันตกขอบจอ และมองเห็นถังขยะชัดเจน 100% */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[1020px] space-y-3">
              <div className="grid grid-cols-[2.5rem_12.5rem_1fr_4.5rem_4.5rem_6.5rem_6.5rem_7.5rem_3rem] gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider items-center shadow-2xs">
                <span className="text-center">#</span>
                <span>หมวดหมู่งาน</span>
                <span>ชื่อรายการพัสดุ / บริการ (มีรายชื่อให้เลือก)</span>
                <span className="text-right">จำนวน</span>
                <span className="text-center">หน่วย</span>
                <span className="text-right text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 py-1 px-1.5 rounded-lg border border-sky-200/60 dark:border-sky-800">
                  ค่าวัสดุ/หน่วย
                </span>
                {/* ข้อ 4: แยกค่าแรงออก ต่างหาก ชัดเจน */}
                <span className="text-right text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 py-1 px-1.5 rounded-lg border border-amber-200/60 dark:border-amber-800 flex items-center justify-end gap-1">
                  <Wrench className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span>ค่าแรง/หน่วย</span>
                </span>
                <span className="text-right text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 py-1 px-1.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800">
                  รวมเงิน (บ.)
                </span>
                <span className="text-center text-rose-600 dark:text-rose-400">ลบ</span>
              </div>

              {/* รายการแถวถอดแบบ (BOQ Item Rows) */}
              {items.map((it, idx) => {
                const c = lineCalcs[idx]
                const nameEmpty = showItemErrors && !it.item_name?.trim()
                const qtyEmpty = showItemErrors && (!it.quantity || Number(it.quantity) <= 0)

                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-3.5 space-y-3 transition shadow-xs ${
                      nameEmpty || qtyEmpty
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* แถวข้อมูลหลัก: Grid คงที่ตามหัวตาราง */}
                    <div className="grid grid-cols-[2.5rem_12.5rem_1fr_4.5rem_4.5rem_6.5rem_6.5rem_7.5rem_3rem] gap-2 items-center">
                      {/* 1. ลำดับ */}
                      <div className="flex items-center justify-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-bold text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          #{idx + 1}
                        </span>
                      </div>

                      {/* 2. หมวดหมู่งาน (ค่าว่างเริ่มต้นเพื่อให้ผู้ใช้เลือกเอง) */}
                      <div>
                        <select
                          className="input text-xs w-full font-bold text-sky-900 dark:text-sky-300 bg-sky-50/60 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800"
                          value={it.category}
                          onChange={(e) => updItem(idx, 'category', e.target.value)}
                        >
                          <option value="">-- เลือกหมวดหมู่งาน --</option>
                          {SOLAR_BOQ_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. ชื่อรายการพัสดุ / บริการ (มี datalist แนะนำจากคลัง) */}
                      <div>
                        <input
                          list="boq-catalog-items"
                          type="text"
                          className={fieldErrorClass(
                            nameEmpty,
                            'input text-xs w-full font-bold text-slate-900 dark:text-slate-100 placeholder:font-normal'
                          )}
                          placeholder="พิมพ์ชื่อพัสดุ หรือเลือกจากคลัง..."
                          value={it.item_name}
                          onChange={(e) => updItem(idx, 'item_name', e.target.value)}
                        />
                      </div>

                      {/* 4. จำนวน (ค่าว่างเพื่อให้ผู้ใช้กรอกเอง) */}
                      <div>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className={fieldErrorClass(
                            qtyEmpty,
                            'input text-xs text-right w-full font-mono font-bold'
                          )}
                          placeholder="จำนวน"
                          value={it.quantity}
                          onChange={(e) => updItem(idx, 'quantity', e.target.value)}
                        />
                      </div>

                      {/* 5. หน่วยนับ */}
                      <div>
                        <input
                          list="boq-unit-list"
                          type="text"
                          className="input text-xs text-center w-full"
                          placeholder="หน่วย"
                          value={it.unit}
                          onChange={(e) => updItem(idx, 'unit', e.target.value)}
                        />
                      </div>

                      {/* 6. ค่าวัสดุ/หน่วย */}
                      <div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input text-xs text-right w-full font-mono text-slate-900 dark:text-slate-100"
                          placeholder="ค่าวัสดุ"
                          title="ต้นทุนค่าวัสดุต่อหน่วย"
                          value={it.material_unit_cost}
                          onChange={(e) => updItem(idx, 'material_unit_cost', e.target.value)}
                        />
                      </div>

                      {/* 7. ค่าแรง/หน่วย (ข้อ 4: แยกค่าแรงออก ต่างหาก) */}
                      <div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input text-xs text-right w-full font-mono text-amber-800 dark:text-amber-300 font-bold bg-amber-50/40 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 focus:border-amber-500"
                          placeholder="ค่าแรง"
                          title="ต้นทุนค่าแรงต่อหน่วย (แยกต่างหาก)"
                          value={it.labor_unit_cost}
                          onChange={(e) => updItem(idx, 'labor_unit_cost', e.target.value)}
                        />
                      </div>

                      {/* 8. ราคารวมแถว */}
                      <div>
                        <div className="text-right font-mono font-black text-xs text-slate-900 dark:text-emerald-400 bg-slate-50 dark:bg-slate-800/80 py-2 px-2 rounded-xl border border-slate-200 dark:border-slate-700">
                          {baht(c.totalLine)}
                        </div>
                      </div>

                      {/* 9. ปุ่มลบ (ไอคอนถังขยะสีแดง มองเห็นชัดเจน 100% ไม่ถูกปิดหรือหลุดขอบ) */}
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl transition cursor-pointer border border-rose-200 dark:border-rose-900 shadow-2xs"
                          title={items.length <= 1 ? "ล้างข้อมูลแถวนี้เป็นค่าว่าง" : "ลบแถวนี้"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* แถวล่าง: สเปกวิศวกรรม (กด Enter ได้อิสระ) + ป้ายแยกค่าวัสดุและค่าแรงชัดเจน */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Info className="h-3 w-3 text-slate-400" />
                          <span>สเปกวิศวกรรมและเงื่อนไขเทคนิค (กด Enter ขึ้นบรรทัดใหม่ได้อิสระ)</span>
                        </span>

                        {/* ข้อ 4: สรุปแยกค่าวัสดุ และค่าแรงอย่างเด่นชัด */}
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-800 text-sky-800 dark:text-sky-300 font-mono text-[11px] px-2 py-0.5">
                            วัสดุรวม: {baht(c.totalMat)} บ.
                          </span>
                          <span className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-mono font-bold text-[11px] px-2 py-0.5 flex items-center gap-1">
                            <Wrench className="h-2.5 w-2.5" />
                            <span>แรงรวม: {baht(c.totalLab)} บ.</span>
                          </span>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:border-slate-900 dark:focus:border-amber-500 focus:outline-none transition leading-relaxed font-sans"
                        placeholder="เช่น • สเปกแผง Tier-1 Mono Half-cell&#10;• รางอลูมิเนียมอะโนไดซ์ 6005-T5&#10;• รับประกันงานติดตั้ง 2 ปี"
                        value={it.description || ''}
                        onChange={(e) => updItem(idx, 'description', e.target.value)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <FieldError error={errors.items} />

          <button
            type="button"
            onClick={() => setItems([...items, { ...EMPTY_BOQ_LINE }])}
            className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 w-full py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-400 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span> เพิ่มรายการพัสดุ / บริการใน BOQ</span>
          </button>
        </div>

        {/* ส่วนที่ 3: สรุปต้นทุน กำไร และราคาเสนอขาย (Financial Summary) */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* หมายเหตุ */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              หมายเหตุ / เงื่อนไขทั่วไปใน BOQ
            </label>
            <textarea
              rows={5}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-900 dark:focus:border-amber-500 focus:outline-none"
              placeholder="เช่น กำหนดยืนราคา 30 วัน, ไม่รวมงานปรับปรุงโครงสร้างหลังคาเดิม, การชำระเงินแบ่ง 3 งวด..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* สรุปตัวเลขทางการเงิน (ข้อ 4: แยกต้นทุนค่าวัสดุ และ ต้นทุนค่าแรง ออกต่างหาก) */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-5 space-y-3 text-xs">
            {/* กล่องแยกค่าวัสดุ vs ค่าแรง */}
            <div className="grid grid-cols-2 gap-2 pb-1">
              {/* ค่าวัสดุ */}
              <div className="rounded-xl bg-white dark:bg-slate-800 p-3 border border-sky-100 dark:border-sky-900/60 shadow-2xs">
                <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-bold text-[11px] mb-1">
                  <Package className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>รวมต้นทุนค่าวัสดุ</span>
                </div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                  {baht(totalMaterialCost)} <span className="text-[10px] font-normal text-slate-500">บ.</span>
                </div>
              </div>

              {/* ค่าแรง (แยกออกต่างหาก) */}
              <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-900/80 shadow-2xs">
                <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 font-bold text-[11px] mb-1">
                  <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>รวมต้นทุนค่าแรง</span>
                </div>
                <div className="font-mono font-bold text-sm text-amber-900 dark:text-amber-300">
                  {baht(totalLaborCost)} <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">บ.</span>
                </div>
              </div>
            </div>

            {/* รวมต้นทุนตรง */}
            <div className="flex justify-between items-center text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-200 dark:border-slate-700 font-bold">
              <span>รวมต้นทุนตรง (Total Direct Cost):</span>
              <span className="font-mono text-sm">{baht(totalCost)} บาท</span>
            </div>

            {/* อัตรามาร์กอัปกำไร */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-slate-500" />
                <span>กำไร / มาร์กอัป (Markup %):</span>
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
              <span>จำนวนเงินกำไร (Markup Value):</span>
              <span className="font-mono font-bold">+{baht(markupAmount)} บาท</span>
            </div>

            {/* ราคารวมเสนอขายสุทธิ */}
            <div className="pt-3 border-t-2 border-slate-300 dark:border-slate-600 flex justify-between items-center text-sm font-black text-slate-900 dark:text-slate-100">
              <span>ราคารวมเสนอขาย (Selling Price):</span>
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
            <span>{busy ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข BOQ' : 'บันทึกเอกสาร BOQ'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
