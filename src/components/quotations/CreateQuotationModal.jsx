import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { Package, FileSpreadsheet, ArrowRight, X, Plus } from 'lucide-react'

export default function CreateQuotationModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [boqs, setBoqs] = useState([])
  const [selectedBoqId, setSelectedBoqId] = useState('')
  const [loadingBoqs, setLoadingBoqs] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoadingBoqs(true)
    supabase
      .from('boqs')
      .select('id, boq_no, title, customer_name, grand_total, status')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return
        setBoqs(data || [])
        setLoadingBoqs(false)
      })
      .catch(() => {
        if (active) setLoadingBoqs(false)
      })
    return () => {
      active = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCreateProduct = () => {
    onClose()
    navigate('/quotations/new?type=product')
  }

  const handleGoToSelectedBoq = () => {
    onClose()
    if (selectedBoqId) {
      navigate(`/boq/${selectedBoqId}`)
    } else {
      navigate('/boq')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-900 px-6 py-4 text-white">
          <div>
            <h3 className="text-base font-bold">เลือกประเภทใบเสนอราคา (Create Quotation)</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              เลือกรูปแบบเอกสารให้เหมาะกับงาน: ขายสินค้าจาก Store หรือ รับงานโครงการจาก BOQ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Card 1: ขายสินค้า (Product Sales) */}
          <div className="rounded-2xl border-2 border-sky-200 dark:border-sky-800/80 bg-sky-50/50 dark:bg-sky-950/20 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
                  <Package className="h-5 w-5" />
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/70 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-700">
                  QT-S-...
                </span>
              </div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                ขายสินค้า (จาก Store)
              </h4>
              <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                <li>เลือกสินค้าจากคลัง Store (ไม่ผ่าน BOQ)</li>
                <li>ราคาตั้งต้น = ต้นทุนเฉลี่ย Store (แก้ไขได้)</li>
                <li>กรอก Markup % ทั้งใบ + เลือกส่วนลดทั้งใบหรือต่อรายการ</li>
                <li>ลูกค้าเห็นราคาต่อชิ้น (รวมกำไรแล้ว) + ยอดรวม</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleCreateProduct}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white py-2.5 px-4 text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>สร้างใบเสนอราคาขายสินค้า</span>
            </button>
          </div>

          {/* Card 2: รับงาน (Project / BOQ) */}
          <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow-xs">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-700">
                  QT-P-...
                </span>
              </div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                รับงาน (สร้างจาก BOQ)
              </h4>
              <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                <li>สร้างจากเอกสารประมาณราคา (BOQ)</li>
                <li>ดึงราคาเสนอขายสุทธิอัตโนมัติ (ไม่มีส่วนลด)</li>
                <li>ลูกค้าเห็นเฉพาะรายการสินค้า + ยอดรวมสุทธิ</li>
              </ul>

              <div className="pt-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  เลือกเอกสาร BOQ (ถ้ามี):
                </label>
                <select
                  value={selectedBoqId}
                  onChange={(e) => setSelectedBoqId(e.target.value)}
                  disabled={loadingBoqs}
                  className="w-full rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">
                    {loadingBoqs ? 'กำลังโหลดรายการ BOQ...' : '-- ไปหน้ารายการ BOQ ทั้งหมด --'}
                  </option>
                  {boqs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.boq_no} · {b.customer_name || b.title} (฿{baht(b.grand_total || 0)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoToSelectedBoq}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-4 text-xs font-black shadow-xs transition cursor-pointer"
            >
              <span>{selectedBoqId ? 'เปิด BOQ เพื่อสร้าง QT' : 'ไปหน้าระบบ BOQ'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
