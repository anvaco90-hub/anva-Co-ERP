import { useState, useRef, useEffect } from 'react'
import { Search, X, Building2, CheckCircle2 } from 'lucide-react'

export default function SearchableProjectSelect({
  projects = [],
  value = '',
  onChange,
  error = '',
  placeholder = 'พิมพ์รหัส หรือชื่อโครงการเพื่อค้นหา...',
  required = false,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const selectedProject = projects.find((p) => p.id === value)

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = query.trim()
    ? projects.filter(
        (p) =>
          (p.project_code || '').toLowerCase().includes(query.toLowerCase()) ||
          (p.project_name || '').toLowerCase().includes(query.toLowerCase())
      )
    : projects

  return (
    <div ref={containerRef} className="relative w-full">
      {selectedProject ? (
        // กล่องแสดงโครงการที่เลือกแล้ว
        <div className="flex items-center justify-between rounded-xl border-2 border-emerald-500/80 dark:border-emerald-500/60 bg-emerald-50/80 dark:bg-emerald-950/40 p-2.5 transition">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <span className="font-mono text-xs font-black text-emerald-950 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/80 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 mr-1.5">
                {selectedProject.project_code}
              </span>
              <span className="text-xs sm:text-sm font-bold text-steel-900 dark:text-slate-100 truncate">
                {selectedProject.project_name}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setQuery('')
              setIsOpen(true)
            }}
            className="rounded-lg bg-white dark:bg-slate-800 p-1 text-steel-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-emerald-200 dark:border-emerald-800 transition shrink-0 cursor-pointer text-xs font-bold px-2 py-1 flex items-center gap-1 shadow-2xs"
            title="เปลี่ยนโครงการ"
          >
            <X className="h-3.5 w-3.5" />
            <span>เปลี่ยน</span>
          </button>
        </div>
      ) : (
        // ช่องค้นหาโครงการ
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400 dark:text-slate-500" />
          <input
            type="text"
            required={required}
            placeholder={placeholder}
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            className={`w-full rounded-xl border pl-9 pr-8 py-2.5 text-xs sm:text-sm font-semibold text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:outline-none transition shadow-2xs ${
              error
                ? 'border-rose-400 bg-rose-50/30 dark:bg-rose-950/20 focus:border-rose-600'
                : 'border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-steel-900 dark:focus:border-amber-400'
            }`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600 dark:text-slate-400 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}

          {/* Dropdown ผลการค้นหา */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="p-1.5 text-[10px] font-bold uppercase text-steel-400 dark:text-slate-400 border-b border-steel-100 dark:border-slate-800 bg-steel-50 dark:bg-slate-800/80 flex items-center justify-between">
                <span>เลือกโครงการ ({filtered.length} รายการ)</span>
                {query && <span>ผลการค้นหา: "{query}"</span>}
              </div>

              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-steel-400 dark:text-slate-400">
                  ไม่พบโครงการที่ค้นหา
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id)
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className="w-full text-left p-2.5 hover:bg-steel-50 dark:hover:bg-slate-800 transition border-b border-steel-50 dark:border-slate-800 last:border-b-0 flex items-center justify-between group cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-steel-700 dark:text-slate-300 bg-steel-100 dark:bg-slate-800 px-1.5 py-0.5 rounded group-hover:bg-steel-900 group-hover:text-white dark:group-hover:bg-amber-400 dark:group-hover:text-slate-950 transition">
                          {p.project_code}
                        </span>
                        <span className="text-xs font-bold text-steel-900 dark:text-slate-100 truncate">
                          {p.project_name}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-steel-400 dark:text-slate-400 font-semibold group-hover:text-steel-900 dark:group-hover:text-white shrink-0">
                      เลือก ↵
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  )
}

