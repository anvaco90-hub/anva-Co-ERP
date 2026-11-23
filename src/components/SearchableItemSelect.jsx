import { useState, useRef, useEffect } from 'react'
import { Search, X, Package, CheckCircle2 } from 'lucide-react'
import { formatIntQty } from '../lib/store'

export default function SearchableItemSelect({
  items = [],
  value = '',
  onChange,
  error = '',
  placeholder = 'พิมพ์ค้นหารหัส หรือชื่อพัสดุ...',
  required = false,
  filterAvailableOnly = false,
  onCreateNew,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const selectedItem = items.find((i) => i.id === value)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const availableItems = filterAvailableOnly
    ? items.filter((it) => Number(it.qty_on_hand || 0) > 0)
    : items

  const filtered = query.trim()
    ? availableItems.filter(
        (it) =>
          (it.item_code || '').toLowerCase().includes(query.toLowerCase()) ||
          (it.item_name || '').toLowerCase().includes(query.toLowerCase()) ||
          (it.item_categories?.name || '').toLowerCase().includes(query.toLowerCase())
      )
    : availableItems

  return (
    <div ref={containerRef} className="relative w-full">
      {selectedItem ? (
        // กล่องแสดงวัสดุที่เลือก
        <div className="flex items-center justify-between rounded-xl border-2 border-emerald-500/80 dark:border-emerald-500/70 bg-emerald-50/90 dark:bg-slate-900/90 p-2.5 transition shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-black text-white bg-emerald-800 dark:bg-slate-950 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-600 dark:border-emerald-500/60 shadow-xs tracking-wide">
                  {selectedItem.item_code}
                </span>
                <span className="text-xs sm:text-sm font-bold text-steel-900 dark:text-white truncate">
                  {selectedItem.item_name}
                </span>
              </div>
              <div className="text-[11px] text-steel-700 dark:text-slate-300 font-mono mt-1">
                คงเหลือในสโตร์: <b className="text-emerald-800 dark:text-emerald-400 font-bold">{formatIntQty(selectedItem.qty_on_hand)}</b> {selectedItem.unit || ''}
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
            className="rounded-lg bg-white dark:bg-slate-800 p-1 text-steel-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-emerald-200 dark:border-emerald-800 transition shrink-0 cursor-pointer text-xs font-bold px-2 py-1 flex items-center gap-1 shadow-2xs"
            title="เปลี่ยนรายการวัสดุ"
          >
            <X className="h-3.5 w-3.5" />
            <span>เปลี่ยน</span>
          </button>
        </div>
      ) : (
        // กล่องค้นหาวัสดุ
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
              
            </button>
          )}

          {/* Dropdown ผลการค้นหา */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="p-1.5 text-[10px] font-bold uppercase text-steel-400 dark:text-slate-400 border-b border-steel-100 dark:border-slate-800 bg-steel-50 dark:bg-slate-800/80 flex items-center justify-between">
                <span>พบ {filtered.length} รายการ</span>
                {query && <span>ค้นหา: "{query}"</span>}
              </div>

              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-steel-400 dark:text-slate-400 space-y-2">
                  <p>ไม่พบรายการวัสดุที่ค้นหา {query ? `"${query}"` : ''}</p>
                  {onCreateNew && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false)
                        onCreateNew(query)
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 transition shadow-xs cursor-pointer"
                    >
                      <span>+ ลงทะเบียนเป็นพัสดุใหม่ในสโตร์</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {filtered.slice(0, 60).map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onChange(it.id)
                        setIsOpen(false)
                        setQuery('')
                      }}
                      className="w-full text-left p-2.5 hover:bg-steel-50 dark:hover:bg-slate-800 transition border-b border-steel-50 dark:border-slate-800 last:border-b-0 flex items-center justify-between group cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-steel-700 dark:text-slate-300 bg-steel-100 dark:bg-slate-800 px-1.5 py-0.5 rounded group-hover:bg-steel-900 group-hover:text-white dark:group-hover:bg-amber-400 dark:group-hover:text-slate-950 transition">
                            {it.item_code}
                          </span>
                          <span className="text-xs font-bold text-steel-900 dark:text-slate-100 truncate">
                            {it.item_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-steel-500 dark:text-slate-400 font-mono mt-0.5">
                          คงเหลือ: <b>{formatIntQty(it.qty_on_hand)}</b> {it.unit || ''}
                        </div>
                      </div>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold group-hover:text-emerald-900 dark:group-hover:text-emerald-300 shrink-0">
                        เลือก ↵
                      </span>
                    </button>
                  ))}
                  {onCreateNew && (
                    <div className="p-2 border-t border-steel-100 dark:border-slate-800 bg-steel-50/70 dark:bg-slate-800/60 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false)
                          onCreateNew(query)
                        }}
                        className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer py-1"
                      >
                        <span>+ ลงทะเบียนเป็นพัสดุใหม่ในสโตร์</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  )
}

