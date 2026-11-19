import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X, ChevronDown, Check, Plus } from 'lucide-react'

/**
 * SearchableSelect / Combobox Component
 * ช่วยให้ผู้ใช้สามารถ "พิมพ์ค้นหาแล้วเจอทันที ไม่ต้องเลื่อนหาใน Dropdown ยาวๆ"
 * และรองรับการพิมพ์ค่าใหม่เอง (allowCustom)
 */
export default function SearchableSelect({
  options = [], // [{ value, label, subLabel, badge, keywords }]
  value = '',
  onChange,
  onCustomChange,
  placeholder = 'พิมพ์เพื่อค้นหา หรือเลือกจากรายการ...',
  allowCustom = false,
  customPlaceholder = 'กด Enter เพื่อใช้ข้อความนี้',
  error = '',
  disabled = false,
  icon: Icon = null,
  className = '',
  emptyActionLabel = '',
  onEmptyAction = null,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // หารายการที่ตรงกับ value ปัจจุบัน
  const selectedOption = useMemo(() => {
    return options.find((opt) => String(opt.value) === String(value))
  }, [options, value])

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // กรองรายการตาม query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase().trim()
    return options.filter((opt) => {
      const matchLabel = String(opt.label || '').toLowerCase().includes(q)
      const matchSub = String(opt.subLabel || '').toLowerCase().includes(q)
      const matchBadge = String(opt.badge || '').toLowerCase().includes(q)
      const matchKeywords = String(opt.keywords || '').toLowerCase().includes(q)
      return matchLabel || matchSub || matchBadge || matchKeywords
    })
  }, [options, query])

  // รีเซ็ต highlight index เมื่อผลการค้นหาเปลี่ยน
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  const handleSelect = (opt) => {
    onChange(opt.value, opt)
    setIsOpen(false)
    setQuery('')
  }

  const handleSelectCustom = (customText) => {
    if (!customText.trim()) return
    if (onCustomChange) {
      onCustomChange(customText.trim())
    } else {
      onChange(customText.trim(), { value: customText.trim(), label: customText.trim(), isCustom: true })
    }
    setIsOpen(false)
    setQuery('')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange('', null)
    if (onCustomChange) onCustomChange('')
    setQuery('')
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKeyDown = (e) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const maxIndex = allowCustom && query.trim() ? filteredOptions.length : filteredOptions.length - 1
      setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const maxIndex = allowCustom && query.trim() ? filteredOptions.length : filteredOptions.length - 1
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allowCustom && query.trim() && highlightedIndex === filteredOptions.length) {
        handleSelectCustom(query)
      } else if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex])
      } else if (allowCustom && query.trim()) {
        handleSelectCustom(query)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setQuery('')
    }
  }

  const isExactMatch = useMemo(() => {
    if (!query.trim()) return false
    return filteredOptions.some((o) => String(o.label).toLowerCase().trim() === query.toLowerCase().trim())
  }, [filteredOptions, query])

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* ส่วน Input แสดงผล / ค้นหา */}
      <div
        className={`relative flex items-center rounded-lg border bg-white dark:bg-slate-900 transition shadow-2xs ${
          disabled
            ? 'bg-steel-100 dark:bg-slate-800 cursor-not-allowed border-steel-200 dark:border-slate-700'
            : isOpen
            ? 'border-sky-600 dark:border-sky-500 ring-2 ring-sky-100 dark:ring-sky-950'
            : error
            ? 'border-rose-400 bg-rose-50/20 dark:bg-rose-950/20'
            : 'border-steel-300 dark:border-slate-700 hover:border-steel-400 dark:hover:border-slate-600'
        }`}
      >
        {Icon && (
          <div className="pl-3 text-steel-400 dark:text-slate-400 shrink-0">
            <Icon className="h-4 w-4" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex items-center">
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:outline-none"
              placeholder={selectedOption ? `เดิม: ${selectedOption.label}` : placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (allowCustom && onCustomChange) {
                  onCustomChange(e.target.value)
                }
              }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <div
              onClick={() => {
                if (!disabled) {
                  setIsOpen(true)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }
              }}
              className="w-full cursor-pointer px-3 py-2 flex items-center justify-between min-w-0"
            >
              {selectedOption ? (
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  {selectedOption.badge && (
                    <span className="font-mono text-[11px] font-bold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 px-1.5 py-0.2 rounded shrink-0">
                      {selectedOption.badge}
                    </span>
                  )}
                  <span className="text-xs sm:text-sm font-semibold text-steel-900 dark:text-slate-100 truncate">
                    {selectedOption.label}
                  </span>
                  {selectedOption.subLabel && (
                    <span className="text-xs text-steel-400 dark:text-slate-400 truncate hidden sm:inline">
                      · {selectedOption.subLabel}
                    </span>
                  )}
                </div>
              ) : value && allowCustom ? (
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  <span className="font-mono text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded shrink-0">
                    พิมพ์เอง
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-steel-900 dark:text-slate-100 truncate">
                    {value}
                  </span>
                </div>
              ) : (
                <span className="text-xs sm:text-sm text-steel-400 dark:text-slate-400 truncate">
                  {placeholder}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ปุ่มล้างค่า หรือ ลูกศร dropdown */}
        <div className="flex items-center pr-2 gap-1 shrink-0">
          {(value || query) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-steel-400 hover:bg-steel-100 dark:hover:bg-slate-800 hover:text-steel-700 dark:hover:text-slate-200 transition cursor-pointer"
              title="ล้างค่า"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen((prev) => !prev)
                if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50)
              }
            }}
            className="rounded p-1 text-steel-400 hover:text-steel-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180 text-sky-600 dark:text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown ผลการค้นหา */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-steel-100 dark:border-slate-800 bg-steel-50/95 dark:bg-slate-800/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-steel-500 dark:text-slate-400 backdrop-blur-xs">
            <span>
              {query.trim() ? `ผลการค้นหา (${filteredOptions.length})` : `รายการทั้งหมด (${options.length})`}
            </span>
            <span className="text-[10px] text-steel-400 dark:text-slate-500 lowercase font-normal">
              พิมพ์เพื่อกรอง หรือใช้ลูกศร ↑ ↓ Enter
            </span>
          </div>

          {/* รายการตัวเลือกที่ค้นหาเจอ */}
          <div className="p-1 space-y-0.5">
            {filteredOptions.length === 0 && !allowCustom && (
              <div className="py-5 px-4 text-center text-xs text-steel-500 dark:text-slate-400 space-y-2">
                <Search className="mx-auto h-5 w-5 text-steel-300 dark:text-slate-600" />
                <div>
                  <p className="font-semibold text-steel-700 dark:text-slate-200">ไม่พบรายการที่ตรงกับ "{query}"</p>
                  <p className="text-[11px] text-steel-400 dark:text-slate-400 mt-0.5">ลองพิมพ์ค้นหาด้วยคำอื่น หรือคลิกทางเลือกด้านล่าง</p>
                </div>
                {emptyActionLabel && onEmptyAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onEmptyAction()
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 font-bold text-xs cursor-pointer shadow-xs transition"
                  >
                    <span>{emptyActionLabel}</span>
                  </button>
                )}
              </div>
            )}

            {filteredOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value)
              const isHighlighted = idx === highlightedIndex

              return (
                <button
                  key={opt.value ?? idx}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 font-bold border border-sky-200 dark:border-sky-800'
                      : isHighlighted
                      ? 'bg-steel-100 dark:bg-slate-800 text-steel-900 dark:text-slate-100'
                      : 'hover:bg-steel-50 dark:hover:bg-slate-800/60 text-steel-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.badge && (
                      <span className="font-mono text-[11px] font-bold text-sky-800 dark:text-sky-300 bg-sky-100/70 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 px-1.5 py-0.2 rounded shrink-0">
                        {opt.badge}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{opt.label}</div>
                      {opt.subLabel && (
                        <div className="text-[11px] text-steel-500 dark:text-slate-400 truncate">{opt.subLabel}</div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 ml-2" />
                  )}
                </button>
              )
            })}

            {/* ตัวเลือกสร้างใหม่กรณี allowCustom */}
            {allowCustom && query.trim() && !isExactMatch && (
              <button
                type="button"
                onClick={() => handleSelectCustom(query)}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer border border-dashed border-sky-300 ${
                  highlightedIndex === filteredOptions.length ? 'bg-sky-100/70 text-sky-950 font-bold' : 'bg-sky-50/50 text-sky-900 hover:bg-sky-100/50'
                }`}
              >
                <Plus className="h-4 w-4 text-sky-600 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-sky-900">
                    ใช้ "{query}" เป็นค่าใหม่ (พิมพ์เอง)
                  </div>
                  <div className="text-[10px] text-sky-700">
                    {customPlaceholder}
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  )
}

