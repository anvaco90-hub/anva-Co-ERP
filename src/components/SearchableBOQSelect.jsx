import { useState, useRef, useEffect } from 'react'
import { Search, X, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { baht } from '../lib/projects'

export default function SearchableBOQSelect({
  boqs = [],
  value = '',
  onChange,
  placeholder = 'พิมพ์ค้นหาเลขที่ BOQ, ชื่อโครงการ หรือลูกค้า...',
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [openUpwards, setOpenUpwards] = useState(false)
  const containerRef = useRef(null)

  const selectedBoq = boqs.find((b) => b.id === value)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ตรวจสอบพื้นที่ว่างด้านล่าง หากเหลือน้อยกว่า 260px และด้านบนมีที่ว่าง ให้เปิดขึ้นด้านบนอัตโนมัติ
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 260 && rect.top > 260) {
        setOpenUpwards(true)
      } else {
        setOpenUpwards(false)
      }
    }
  }, [isOpen])

  const filtered = query.trim()
    ? boqs.filter((b) => {
        const qLower = query.toLowerCase()
        return (
          (b.boq_no || '').toLowerCase().includes(qLower) ||
          (b.customer_name || '').toLowerCase().includes(qLower) ||
          (b.title || '').toLowerCase().includes(qLower)
        )
      })
    : boqs

  return (
    <div ref={containerRef} className="relative w-full">
      {selectedBoq ? (
        // กล่องแสดงเอกสาร BOQ ที่เลือกแล้ว (แสดงข้อมูลครบถ้วน ชื่องาน ลูกค้า ยอดเงิน)
        <div className="flex items-start justify-between rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50/90 dark:bg-amber-950/40 p-3 transition shadow-2xs">
          <div className="flex items-start gap-2.5 min-w-0 pr-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-amber-950 dark:text-amber-200 bg-amber-200/90 dark:bg-amber-900/80 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                  {selectedBoq.boq_no}
                </span>
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                  ฿{baht(selectedBoq.grand_total || 0)}
                </span>
                {Number(selectedBoq.system_size_kwp || 0) > 0 && (
                  <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded">
                    {selectedBoq.system_size_kwp} kWp
                  </span>
                )}
              </div>
              {selectedBoq.title && (
                <div className="text-xs text-slate-900 dark:text-slate-100 font-bold leading-snug">
                  {selectedBoq.title}
                </div>
              )}
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                ลูกค้า: <strong className="text-slate-800 dark:text-slate-200 font-medium">{selectedBoq.customer_name || '-'}</strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setQuery('')
              setIsOpen(true)
            }}
            className="rounded-lg bg-white dark:bg-slate-800 p-1 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-amber-300 dark:border-amber-700 transition shrink-0 cursor-pointer text-xs font-bold px-2 py-1 flex items-center gap-1 shadow-2xs"
            title="เปลี่ยนเอกสาร BOQ"
          >
            <X className="h-3.5 w-3.5" />
            <span>เปลี่ยน</span>
          </button>
        </div>
      ) : (
        // ช่องพิมพ์ค้นหา BOQ
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            disabled={disabled}
            placeholder={placeholder}
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            className="w-full rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 pl-8 pr-7 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {isOpen && (
            <div
              className={`absolute left-0 right-0 ${
                openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
              } max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50 divide-y divide-slate-100 dark:divide-slate-800 text-xs animate-in fade-in zoom-in-95 duration-100`}
            >
              <div className="p-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10">
                <span>เลือกเอกสารประมาณการ BOQ ({filtered.length} รายการ)</span>
                {query && <span className="text-amber-700 dark:text-amber-400">ค้นหา: "{query}"</span>}
              </div>

              {filtered.length === 0 ? (
                <div className="p-4 text-center text-slate-400 dark:text-slate-500 space-y-1">
                  <p className="font-semibold">ไม่พบเอกสาร BOQ {query ? `"${query}"` : ''}</p>
                  <p className="text-[10px]">ตรวจสอบเลขที่ BOQ หรือชื่อโครงการอีกครั้ง</p>
                </div>
              ) : (
                filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onChange(b.id)
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className="w-full text-left p-3 hover:bg-amber-50/80 dark:hover:bg-slate-800/90 transition flex items-start justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 space-y-1.5 flex-1">
                      {/* แถว 1: เลขที่ BOQ, ยอดราคาขายสุทธิ, ขนาดระบบ */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-700">
                          {b.boq_no}
                        </span>
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                          ฿{baht(b.grand_total || 0)}
                        </span>
                        {Number(b.system_size_kwp || 0) > 0 && (
                          <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                            {b.system_size_kwp} kWp
                          </span>
                        )}
                      </div>

                      {/* แถว 2: ชื่องาน / รายละเอียดโครงการ (แสดงเต็มบรรทัด ไม่ตัดคำ) */}
                      {b.title && (
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {b.title}
                        </div>
                      )}

                      {/* แถว 3: ข้อมูลลูกค้า */}
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        <span>ลูกค้า: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{b.customer_name || '-'}</strong></span>
                      </div>
                    </div>

                    <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold group-hover:underline shrink-0 pt-1">
                      เลือก ↵
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
