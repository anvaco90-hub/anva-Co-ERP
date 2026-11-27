import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { Package, FileSpreadsheet, ArrowRight, X, Plus, Building2 } from 'lucide-react'
import SearchableProjectSelect from '../SearchableProjectSelect'
import SearchableBOQSelect from '../SearchableBOQSelect'

export default function CreateQuotationModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [boqs, setBoqs] = useState([])
  const [selectedBoqId, setSelectedBoqId] = useState('')
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoadingData(true)

    Promise.all([
      supabase
        .from('projects')
        .select('id, project_code, project_name, client_name')
        .order('project_code'),
      supabase
        .from('boqs')
        .select('id, boq_no, title, customer_name, grand_total, status, project_id, system_size_kwp')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
      .then(([projRes, boqRes]) => {
        if (!active) return
        setProjects(projRes.data || [])
        setBoqs(boqRes.data || [])
        setLoadingData(false)
      })
      .catch(() => {
        if (active) setLoadingData(false)
      })

    return () => {
      active = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCreateProduct = () => {
    onClose()
    const query = new URLSearchParams()
    query.set('type', 'product')
    if (selectedProjectId) query.set('project_id', selectedProjectId)
    navigate(`/quotations/new?${query.toString()}`)
  }

  const handleCreateProjectQuotation = () => {
    onClose()
    const query = new URLSearchParams()
    query.set('type', 'project')
    if (selectedProjectId) query.set('project_id', selectedProjectId)
    navigate(`/quotations/new?${query.toString()}`)
  }

  const handleGoToSelectedBoq = () => {
    onClose()
    if (selectedBoqId) {
      navigate(`/boq/${selectedBoqId}`)
    } else {
      navigate('/boq')
    }
  }

  // กรอง BOQ ตามโครงการที่เลือก (ถ้ามี)
  const filteredBoqs = selectedProjectId
    ? boqs.filter((b) => b.project_id === selectedProjectId)
    : boqs

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl relative my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-900 px-6 py-4 text-white rounded-t-2xl">
          <div>
            <h3 className="text-base font-bold">เลือกประเภทใบเสนอราคา (Create Quotation)</h3>
            <div className="text-xs text-slate-300 mt-1 space-y-0.5">
              <div>เลือกรูปแบบเอกสารให้เหมาะกับงาน</div>
              <div className="text-slate-400 text-[11px]">ขายสินค้าจาก Store หรือ งานโครงการจาก BOQ</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* ส่วนพิมพ์ค้นหา / เลือกโครงการ */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>พิมพ์ค้นหา หรือเลือกโครงการที่ต้องการเสนอราคา (ถ้ามี)</span>
              </label>
              {selectedProjectId && (
                <button
                  type="button"
                  onClick={() => setSelectedProjectId('')}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                >
                  ไม่ระบุโครงการ
                </button>
              )}
            </div>
            <SearchableProjectSelect
              projects={projects}
              value={selectedProjectId}
              onChange={(val) => {
                setSelectedProjectId(val)
                // ถ้าเปลี่ยนโครงการแล้ว BOQ เดิมไม่ได้อยู่ในโครงการนี้ ให้รีเซ็ต
                if (val && selectedBoqId) {
                  const b = boqs.find((item) => item.id === selectedBoqId)
                  if (b && b.project_id !== val) setSelectedBoqId('')
                }
              }}
              placeholder="พิมพ์รหัส หรือชื่อโครงการที่ต้องการเสนอราคา..."
            />
            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              <div>เมื่อเลือกโครงการ ระบบจะดึงรหัสโครงการและชื่อลูกค้าไปใส่ให้อัตโนมัติ</div>
              <div>และกรองเฉพาะเอกสาร BOQ ของโครงการนี้ให้ทันที</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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

            {/* Card 2: งานโครงการ (Project) */}
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
                  งานโครงการ (Project)
                </h4>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                  <li>สร้างใบเสนอราคางานโครงการ ระบุรายการเองได้โดยตรง</li>
                  <li>หรือเลือกดึงราคาจากเอกสารประมาณการโครงการ (BOQ)</li>
                  <li>ลูกค้าเห็นเฉพาะรายการงาน + ราคารวมสุทธิ</li>
                </ul>

                <div className="pt-1 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    พิมพ์ค้นหา หรือเลือก BOQ ต้นทาง (ถ้ามี):
                  </label>
                  <SearchableBOQSelect
                    boqs={filteredBoqs}
                    value={selectedBoqId}
                    onChange={setSelectedBoqId}
                    placeholder="พิมพ์เลข BOQ, ชื่อโครงการ หรือลูกค้า..."
                    disabled={loadingData}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {selectedBoqId ? (
                  <button
                    type="button"
                    onClick={handleGoToSelectedBoq}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-4 text-xs font-black shadow-xs transition cursor-pointer"
                  >
                    <span>เปิด BOQ เพื่อแปลงเป็น QT</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateProjectQuotation}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-4 text-xs font-black shadow-xs transition cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>สร้างใบเสนอราคางานโครงการ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
