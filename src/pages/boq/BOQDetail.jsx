import { useEffect, useState, Fragment } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
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
} from 'lucide-react'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  approved: { label: 'อนุมัติแล้ว (Approved)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  converted_to_quotation: { label: 'เปิดใบเสนอราคาแล้ว', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  archived: { label: 'เก็บถาวร', color: 'bg-steel-100 text-steel-500 border-steel-200' },
}

export default function BOQDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [boq, setBoq] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)

  const fetchDetail = async () => {
    setLoading(true)
    try {
      // ดึงข้อมูล boq และ boq_items ควบคู่กัน (แก้ปัญหา PostgREST Foreign Key Relationship Error: PGRST200)
      const [bRes, itemsRes] = await Promise.all([
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
      ])

      if (bRes.error) throw bRes.error

      let boqData = bRes.data
      if (boqData?.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id, project_code, project_name, client_name')
          .eq('id', boqData.project_id)
          .maybeSingle()
        if (proj) boqData = { ...boqData, projects: proj }
      }

      setBoq(boqData)
      setItems(itemsRes.data || [])
    } catch (err) {
      console.error('Failed to load BOQ detail:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  // แปลง BOQ เป็นใบเสนอราคา (Convert to Quotation)
  const handleConvertToQuotation = async () => {
    if (!boq || items.length === 0) return
    if (!window.confirm(`ยืนยันการแปลง BOQ "${boq.boq_no}" เป็นใบเสนอราคาหรือไม่?`)) {
      return
    }

    setConverting(true)
    try {
      // 1. สร้างรหัสใบเสนอราคาใหม่
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const rand = Math.floor(1000 + Math.random() * 9000)
      const qNo = `QT-${year}${month}-${rand}`

      const quotationPayload = {
        quotation_no: qNo,
        customer_name: boq.customer_name || boq.projects?.client_name || 'ลูกค้าโครงการ ' + (boq.projects?.project_code || ''),
        project_id: boq.project_id || null,
        issue_date: d.toISOString().split('T')[0],
        validity_days: 30,
        subtotal: boq.grand_total,
        discount_amount: 0,
        after_discount: boq.grand_total,
        vat_rate: 7,
        vat_amount: Math.round(Number(boq.grand_total) * 0.07 * 100) / 100,
        grand_total: Math.round(Number(boq.grand_total) * 1.07 * 100) / 100,
        status: 'draft',
        ref_no: boq.boq_no,
        customer_notes: boq.notes || `อ้างอิงเอกสารถอดแบบและประมาณราคาเลขที่ ${boq.boq_no}`,
      }

      const { data: qData, error: qErr } = await supabase
        .from('quotations')
        .insert([quotationPayload])
        .select('id')
        .single()

      if (qErr) throw qErr

      // 2. ใส่รายการสินค้าในใบเสนอราคา
      const markupRatio = 1 + Number(boq.markup_percent || 0) / 100
      const qItemRows = items.map((it) => {
        const costPerUnit = Number(it.material_unit_cost || 0) + Number(it.labor_unit_cost || 0)
        const sellingPricePerUnit = Math.round(costPerUnit * markupRatio * 100) / 100
        const total = Math.round(sellingPricePerUnit * Number(it.quantity || 1) * 100) / 100

        return {
          quotation_id: qData.id,
          item_name: it.item_name,
          description: it.description || null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: sellingPricePerUnit,
          discount_percent: 0,
          total_amount: total,
        }
      })

      const { error: itemsErr } = await supabase.from('quotation_items').insert(qItemRows)
      if (itemsErr) throw itemsErr

      // 3. อัปเดตสถานะ BOQ
      await supabase.from('boqs').update({ status: 'converted_to_quotation' }).eq('id', boq.id)

      alert(`แปลงเป็นใบเสนอราคาเลขที่ ${qNo} สำเร็จ!`)
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

  if (loading) {
    return (
      <div className="py-16 text-center text-xs text-steel-400">
        กำลังโหลดข้อมูล BOQ...
      </div>
    )
  }

  if (!boq) {
    return (
      <div className="rounded-2xl border border-steel-200 bg-white p-12 text-center space-y-3">
        <p className="font-bold text-steel-900">ไม่พบเอกสาร BOQ นี้</p>
        <Link to="/boq" className="text-xs text-sky-700 font-bold hover:underline">
          ← กลับหน้ารายการ BOQ
        </Link>
      </div>
    )
  }

  const st = STATUS_MAP[boq.status] || {
    label: boq.status,
    color: 'bg-steel-100 text-steel-700 border-steel-200',
  }

  // จัดกลุ่มรายการตามหมวดหมู่
  const grouped = items.reduce((acc, it) => {
    const cat = it.category || 'งานทั่วไป'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(it)
    return acc
  }, {})

  return (
    <div className="space-y-6 font-sans text-slate-800 max-w-5xl">
      {/* 1. Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/boq"
            className="rounded-xl border border-steel-200 bg-white px-3 py-1.5 text-xs font-bold text-steel-700 hover:bg-steel-50 transition shadow-2xs"
          >
            ← กลับ
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                {boq.boq_no}
              </h1>
              <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border ${st.color}`}>
                {st.label}
              </span>
            </div>
            <p className="text-xs text-steel-500 mt-0.5">
              สร้างเมื่อ: {new Date(boq.created_at).toLocaleString('th-TH')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ปุ่มแปลงเป็นใบเสนอราคา */}
          <button
            type="button"
            disabled={converting}
            onClick={handleConvertToQuotation}
            className="rounded-xl bg-hivis hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileCheck2 className="h-4 w-4" />
            <span>{converting ? 'กำลังแปลง...' : 'แปลงเป็นใบเสนอราคา'}</span>
          </button>

          {/* พิมพ์เอกสาร */}
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>พิมพ์ BOQ</span>
          </button>

          {/* แก้ไข */}
          <Link
            to={`/boq/${boq.id}/edit`}
            className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3.5 py-2 text-xs font-bold text-steel-700 transition shadow-2xs flex items-center gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" />
            <span>แก้ไข</span>
          </Link>

          {/* ลบ */}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Summary Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold text-steel-500 uppercase">ขนาดติดตั้ง (kWp)</span>
          <div className="mt-1 text-xl font-mono font-black text-amber-700 flex items-center gap-1">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>{Number(boq.system_size_kwp || 0) > 0 ? `${Number(boq.system_size_kwp).toLocaleString()} kWp` : '-'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold text-steel-500 uppercase">ต้นทุนวัสดุรวม</span>
          <div className="mt-1 text-xl font-mono font-bold text-steel-800">
            {baht(boq.total_material_cost || 0)} <span className="text-xs font-normal text-steel-500">บ.</span>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold text-steel-500 uppercase">ต้นทุนค่าแรงรวม</span>
          <div className="mt-1 text-xl font-mono font-bold text-steel-800">
            {baht(boq.total_labor_cost || 0)} <span className="text-xs font-normal text-steel-500">บ.</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-900 uppercase">ราคาเสนอขาย (สุทธิ)</span>
          <div className="mt-1 text-xl font-mono font-black text-emerald-800">
            {baht(boq.grand_total || 0)} <span className="text-xs font-normal text-emerald-700">บ.</span>
          </div>
        </div>
      </div>

      {/* 3. รายละเอียดโครงการ */}
      <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-2xs space-y-3">
        <h2 className="font-bold text-sm text-steel-900 flex items-center gap-2 border-b border-steel-100 pb-2">
          <span>ข้อมูลโครงการและงานที่ถอดแบบ</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-steel-400">ชื่องาน / รายละเอียด:</span>
            <div className="font-bold text-steel-900 text-sm mt-0.5">{boq.title}</div>
          </div>
          <div>
            <span className="text-steel-400">ลูกค้า / เจ้าของโครงการ:</span>
            <div className="font-semibold text-steel-800 mt-0.5">{boq.customer_name || '-'}</div>
          </div>
          <div>
            <span className="text-steel-400">โครงการในระบบ (Project):</span>
            <div className="font-semibold text-sky-800 mt-0.5">
              {boq.projects ? `[${boq.projects.project_code}] ${boq.projects.project_name}` : 'ทั่วไป'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. รายการพัสดุและค่าแรง แยกเป็นกล่องหมวดหมู่งานอย่างชัดเจน (Web Category Cards) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-sky-700 dark:text-sky-400" />
            <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
              รายการพัสดุและค่าแรงตามหมวดหมู่งาน
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {Object.keys(grouped).length} หมวดหมู่ · {items.length} รายการ
            </span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            มาร์กอัปกำไร: <b className="text-emerald-700 dark:text-emerald-400">+{boq.markup_percent || 15}%</b>
          </span>
        </div>

        {/* วนลูปแสดงแยกกล่องหมวดหมู่งาน แต่ละหมวดหมู่เป็นการ์ดแยกกันชัดเจน ไม่ปนกัน */}
        {Object.entries(grouped).map(([category, catItems], cIdx) => {
          const catMatCost = catItems.reduce((s, it) => s + (Number(it.material_unit_cost || 0) * Number(it.quantity || 0)), 0)
          const catLabCost = catItems.reduce((s, it) => s + (Number(it.labor_unit_cost || 0) * Number(it.quantity || 0)), 0)
          const catTotal = catItems.reduce((s, it) => s + Number(it.total_amount || 0), 0)

          return (
            <div
              key={category}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all"
            >
              {/* Category Card Header */}
              <div className="bg-slate-50/90 dark:bg-slate-800/80 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
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
                </div>
              </div>

              {/* Items Table inside Category */}
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
                        รวมเฉพาะหมวดที่ {cIdx + 1} ({category}):
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
            <button
              type="button"
              disabled={converting}
              onClick={handleConvertToQuotation}
              className="rounded-xl bg-hivis hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileCheck2 className="h-4 w-4" />
              <span>{converting ? 'กำลังแปลง...' : 'แปลงเป็นใบเสนอราคา'}</span>
            </button>
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

