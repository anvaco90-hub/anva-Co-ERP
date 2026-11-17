import { useEffect, useState } from 'react'
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
  Layers,
  Calculator,
  Sun,
  Zap,
} from 'lucide-react'

export const SOLAR_BOQ_CATEGORIES = [
  '1. งานแผงโซล่าเซลล์ (Solar PV Modules)',
  '2. งานอินเวอร์เตอร์ (Inverters)',
  '3. งานโครงสร้างติดตั้งและอุปกรณ์ยึด (Mounting & Support)',
  '4. งานระบบไฟฟ้า AC/DC และตู้ MDB (AC/DC BOS & Protection)',
  '5. งานสายไฟ ท่อร้อยสาย และอุปกรณ์ประกอบ (Cables & Conduits)',
  '6. งานค่าแรงติดตั้งและทดสอบระบบ (Installation Labor & Test)',
  '7. งานวิศวกรรมและขออนุญาตภาครัฐ (Engineering & Grid Permitting)',
  '8. งานอื่น ๆ และบริการพิเศษ (Other Services)',
]

const EMPTY_BOQ_LINE = {
  category: SOLAR_BOQ_CATEGORIES[0],
  item_code: '',
  item_name: '',
  description: '',
  quantity: '1',
  unit: 'ชุด',
  material_unit_cost: '0',
  labor_unit_cost: '0',
}

export default function BOQForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [projects, setProjects] = useState([])
  const [catalog, setCatalog] = useState([])

  // Header State
  const [boqNo, setBoqNo] = useState('')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [systemSizeKwp, setSystemSizeKwp] = useState('')
  const [markupPercent, setMarkupPercent] = useState('15')
  const [notes, setNotes] = useState('')

  // Lines State
  const [items, setItems] = useState([
    {
      ...EMPTY_BOQ_LINE,
      category: SOLAR_BOQ_CATEGORIES[0],
      item_name: 'แผงโซล่าเซลล์ Tier-1 Mono Half-cell 550W',
      description: '• กำลังผลิต 550W\n• รับประกันสินค้า 12 ปี, รับประกันผลผลิต 25 ปี',
      quantity: '180',
      unit: 'แผง',
      material_unit_cost: '3800',
      labor_unit_cost: '200',
    },
    {
      ...EMPTY_BOQ_LINE,
      category: SOLAR_BOQ_CATEGORIES[1],
      item_name: 'อินเวอร์เตอร์ On-Grid Three Phase 100 kW',
      description: '• ประสิทธิภาพ 98.6%\n• รองรับ Wi-Fi Monitoring รับประกัน 5 ปี',
      quantity: '1',
      unit: 'เครื่อง',
      material_unit_cost: '115000',
      labor_unit_cost: '5000',
    },
  ])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showItemErrors, setShowItemErrors] = useState(false)

  // โหลดโครงการ และ Catalog พัสดุ
  useEffect(() => {
    supabase.from('projects').select('id, project_code, project_name, client_name').order('project_code').then(({ data }) => setProjects(data ?? []))
    supabase.from('inventory_items').select('id, item_code, item_name, unit, avg_unit_cost').order('item_name').then(({ data }) => setCatalog(data ?? []))

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
            quantity: String(it.quantity || 1),
            unit: it.unit || 'ชุด',
            material_unit_cost: String(it.material_unit_cost || 0),
            labor_unit_cost: String(it.labor_unit_cost || 0),
          }))
        )
      }
    })
  }, [id])

  // ฟังก์ชันอัปเดตบรรทัด
  const updItem = (index, key, val) => {
    const next = items.map((it, idx) => {
      if (idx !== index) return it
      const updated = { ...it, [key]: val }
      // Auto-suggest unit & price จาก catalog ถ้าตรงกัน
      if (key === 'item_name') {
        const found = catalog.find((c) => c.item_name.toLowerCase() === String(val).trim().toLowerCase())
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
      newErrors.items = 'กรุณาระบุชื่อสินค้าและจำนวนให้ครบทุกแถว'
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
    <div className="max-w-5xl space-y-6 font-sans text-slate-800">
      {/* 1. Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                BOQ ESTIMATOR
              </span>
              <span className="text-xs text-steel-300">
                {isEdit ? 'แก้ไขเอกสาร BOQ' : 'สร้างรายการประเมินราคา BOQ ใหม่'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-hivis" />
              <span>{isEdit ? `แก้ไข BOQ: ${boqNo}` : 'ถอดแบบและประมาณราคา (BOQ Form)'}</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-300">
              กำหนดหมวดหมู่งาน แยกค่าวัสดุ ค่าแรง และคำนวณราคาเสนอขายอัตโนมัติ
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-steel-800 hover:bg-steel-700 text-steel-200 border border-steel-600 px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ย้อนกลับ</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* 2. Main Form Card */}
      <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-sm space-y-6">
        {/* ส่วนที่ 1: ข้อมูลทั่วไปของ BOQ */}
        <div className="space-y-4">
          <h2 className="font-bold text-sm text-steel-900 flex items-center gap-2 border-b border-steel-100 pb-2">
            <span>📋 1. ข้อมูลหัวเอกสารและโครงการ</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-steel-700 mb-1">
                เลขที่เอกสาร BOQ *
              </label>
              <input
                type="text"
                className={fieldErrorClass(errors.boqNo, 'input font-mono font-bold text-xs w-full')}
                value={boqNo}
                onChange={(e) => setBoqNo(e.target.value)}
                placeholder="BOQ-202611-001"
              />
              <FieldError error={errors.boqNo} />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-steel-700 mb-1">
                ชื่องาน / รายละเอียดงานติดตั้ง *
              </label>
              <input
                type="text"
                className={fieldErrorClass(errors.title, 'input font-bold text-xs w-full')}
                placeholder="เช่น งานติดตั้งระบบ Solar Rooftop 100 kWp โรงงานอุตสาหกรรม"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <FieldError error={errors.title} />
            </div>

            <div>
              <label className="block text-xs font-bold text-steel-700 mb-1">
                เชื่อมโยงโครงการ (ถ้ามี)
              </label>
              <select
                className="input text-xs w-full"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  const p = projects.find((x) => x.id === e.target.value)
                  if (p?.client_name && !customerName) setCustomerName(p.client_name)
                }}
              >
                <option value="">-- ไม่ระบุโครงการ / ถอดแบบก่อนขาย --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.project_code}] {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-steel-700 mb-1">
                ชื่อลูกค้า / เจ้าของโครงการ
              </label>
              <input
                type="text"
                className="input text-xs w-full"
                placeholder="เช่น บริษัท สยาม ฟู๊ด จำกัด"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-700 mb-1 flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>กำลังผลิตติดตั้ง (kWp)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input text-xs font-mono font-bold w-full text-amber-900"
                placeholder="เช่น 100 หรือ 150.5"
                value={systemSizeKwp}
                onChange={(e) => setSystemSizeKwp(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ส่วนที่ 2: ตารางรายการถอดแบบ (BOQ Items) */}
        <div className="space-y-4 pt-4 border-t border-steel-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-steel-900 flex items-center gap-2">
                <span>📦 2. รายการถอดแบบพัสดุและค่าแรง (Itemized BOQ)</span>
              </h2>
              <p className="text-[11px] text-steel-500 mt-0.5">
                รองรับการพิมพ์สเปกแบบขยายลงล่าง (Enter หลายบรรทัด) แยกต้นทุนค่าวัสดุและค่าแรง
              </p>
            </div>
            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY_BOQ_LINE }])}
              className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3.5 py-1.5 text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-steel-700" />
              <span>+ เพิ่มรายการ</span>
            </button>
          </div>

          <datalist id="boq-catalog-items">
            {catalog.map((c) => (
              <option key={c.id} value={c.item_name}>
                [{c.item_code}] ({c.unit})
              </option>
            ))}
          </datalist>

          <div className="space-y-3">
            {items.map((it, idx) => {
              const c = lineCalcs[idx]
              const nameEmpty = showItemErrors && !it.item_name?.trim()
              const qtyEmpty = showItemErrors && (!it.quantity || Number(it.quantity) <= 0)

              return (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 space-y-3 transition shadow-xs ${
                    nameEmpty || qtyEmpty ? 'border-rose-300 bg-rose-50/20' : 'border-steel-200 bg-white hover:border-steel-300'
                  }`}
                >
                  {/* แถวบน: หมวดงาน, ชื่อรายการ, จำนวน, หน่วย, ค่าวัสดุ, ค่าแรง, รวมแถว, ลบ */}
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_12rem_1fr_5rem_4.5rem_6.5rem_6.5rem_7.5rem_auto] gap-2.5 items-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-steel-100 font-mono font-bold text-xs text-steel-700">
                      #{idx + 1}
                    </span>

                    {/* หมวดหมู่งาน */}
                    <div>
                      <select
                        className="input text-xs w-full font-bold text-sky-900 bg-sky-50/50"
                        value={it.category}
                        onChange={(e) => updItem(idx, 'category', e.target.value)}
                      >
                        {SOLAR_BOQ_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* ชื่อรายการ */}
                    <div>
                      <input
                        list="boq-catalog-items"
                        type="text"
                        className={fieldErrorClass(nameEmpty, 'input text-xs w-full font-bold text-steel-900')}
                        placeholder="ระบุชื่อพัสดุ / รายการงาน..."
                        value={it.item_name}
                        onChange={(e) => updItem(idx, 'item_name', e.target.value)}
                      />
                    </div>

                    {/* จำนวน */}
                    <div>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className={fieldErrorClass(qtyEmpty, 'input text-xs text-right w-full font-mono font-bold')}
                        placeholder="จำนวน"
                        value={it.quantity}
                        onChange={(e) => updItem(idx, 'quantity', e.target.value)}
                      />
                    </div>

                    {/* หน่วย */}
                    <div>
                      <input
                        type="text"
                        className="input text-xs text-center w-full"
                        placeholder="หน่วย"
                        value={it.unit}
                        onChange={(e) => updItem(idx, 'unit', e.target.value)}
                      />
                    </div>

                    {/* ค่าวัสดุ/หน่วย */}
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input text-xs text-right w-full font-mono"
                        placeholder="ค่าวัสดุ"
                        title="ต้นทุนค่าวัสดุต่อหน่วย"
                        value={it.material_unit_cost}
                        onChange={(e) => updItem(idx, 'material_unit_cost', e.target.value)}
                      />
                    </div>

                    {/* ค่าแรง/หน่วย */}
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input text-xs text-right w-full font-mono text-amber-800"
                        placeholder="ค่าแรง"
                        title="ต้นทุนค่าแรงต่อหน่วย"
                        value={it.labor_unit_cost}
                        onChange={(e) => updItem(idx, 'labor_unit_cost', e.target.value)}
                      />
                    </div>

                    {/* ราคารวมแถว */}
                    <div className="text-right font-mono font-black text-xs text-slate-900 bg-steel-50 py-2 px-2.5 rounded-xl border border-steel-200">
                      {baht(c.totalLine)}
                    </div>

                    {/* ปุ่มลบ */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        disabled={items.length === 1}
                        className="p-1.5 text-steel-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-20 cursor-pointer"
                        title="ลบแถวนี้"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* แถวล่าง: Richbox / Textarea สำหรับสเปกวิศวกรรม (กด Enter ได้อิสระ) */}
                  <div className="pt-1 border-t border-steel-100">
                    <div className="flex items-center justify-between text-[11px] text-steel-500 mb-1">
                      <span className="font-semibold text-steel-700 flex items-center gap-1.5">
                        <span>📝</span>
                        <span>สเปกวิศวกรรมและเงื่อนไขเทคนิค (กด Enter ขึ้นบรรทัดใหม่ได้อิสระ)</span>
                      </span>
                      <span className="text-[10px] text-steel-400">
                        วัสดุรวม: {baht(c.totalMat)} บ. | แรงรวม: {baht(c.totalLab)} บ.
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-steel-200 bg-steel-50/50 p-2.5 text-xs text-steel-800 placeholder:text-steel-400 focus:bg-white focus:border-steel-900 focus:outline-none transition leading-relaxed font-sans"
                      placeholder="เช่น • สเปกแผง Tier-1 Mono Half-cell&#10;• รางอลูมิเนียมอะโนไดซ์ 6005-T5&#10;• รับประกันงานติดตั้ง 2 ปี"
                      value={it.description || ''}
                      onChange={(e) => updItem(idx, 'description', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <FieldError error={errors.items} />

          <button
            type="button"
            onClick={() => setItems([...items, { ...EMPTY_BOQ_LINE }])}
            className="rounded-xl border border-dashed border-steel-300 w-full py-2.5 text-xs font-bold text-steel-600 hover:bg-steel-50 hover:border-steel-400 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ เพิ่มรายการพัสดุ / บริการใน BOQ</span>
          </button>
        </div>

        {/* ส่วนที่ 3: สรุปต้นทุน กำไร และราคาเสนอขาย (Financial Summary) */}
        <div className="pt-4 border-t border-steel-100 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
          {/* หมายเหตุ */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-steel-700">
              หมายเหตุ / เงื่อนไขทั่วไปใน BOQ
            </label>
            <textarea
              rows={4}
              className="w-full rounded-xl border border-steel-300 bg-white p-3 text-xs text-steel-800 placeholder:text-steel-400 focus:border-steel-900 focus:outline-none"
              placeholder="เช่น กำหนดยืนราคา 30 วัน, ไม่รวมงานปรับปรุงโครงสร้างหลังคาเดิม..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* สรุปตัวเลข */}
          <div className="rounded-2xl bg-steel-50 border border-steel-200 p-5 space-y-2.5 text-xs">
            <div className="flex justify-between text-steel-600">
              <span>รวมต้นทุนค่าวัสดุ (Total Material):</span>
              <span className="font-mono font-bold">{baht(totalMaterialCost)} บาท</span>
            </div>

            <div className="flex justify-between text-amber-800">
              <span>รวมต้นทุนค่าแรง (Total Labor):</span>
              <span className="font-mono font-bold">{baht(totalLaborCost)} บาท</span>
            </div>

            <div className="flex justify-between text-steel-800 pt-1 border-t border-steel-200 font-bold">
              <span>รวมต้นทุนตรง (Total Direct Cost):</span>
              <span className="font-mono">{baht(totalCost)} บาท</span>
            </div>

            {/* อัตรามาร์กอัปกำไร */}
            <div className="flex items-center justify-between pt-1 border-t border-steel-200">
              <span className="font-bold text-steel-700 flex items-center gap-1.5">
                <span>📈</span>
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

            <div className="flex justify-between text-emerald-800">
              <span>จำนวนเงินกำไร (Markup Value):</span>
              <span className="font-mono font-bold">+{baht(markupAmount)} บาท</span>
            </div>

            <div className="pt-3 border-t-2 border-steel-300 flex justify-between items-center text-sm font-black text-slate-900">
              <span>ราคารวมเสนอขาย (Selling Price):</span>
              <span className="text-xl font-mono text-emerald-800">
                {baht(grandTotal)} <span className="text-xs font-normal text-steel-500">บาท</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-steel-100">
          <button
            type="button"
            onClick={() => navigate('/boq')}
            className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-5 py-2.5 text-xs font-bold text-steel-700 transition cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-black px-6 py-2.5 text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{busy ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข BOQ' : '✓ บันทึกเอกสาร BOQ'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

