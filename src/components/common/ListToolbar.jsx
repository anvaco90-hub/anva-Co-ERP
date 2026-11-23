import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  X,
  Filter,
  Calendar,
  Download,
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
  Kanban,
  Check,
  ChevronDown,
  Plus,
} from 'lucide-react'
import Button from './Button'

/**
 * ANVA & Co ERP Standard Universal List Toolbar
 * Standard Order: [Search] [Filters ▾] [Date Range ▾] [Status ▾] ... [View Modes] [Export ▾] [Columns ] [+ Primary Action]
 */
export default function ListToolbar({
  search = '',
  onSearchChange = () => {},
  searchPlaceholder = 'ค้นหาเลขที่เอกสาร, ชื่อลูกค้า, เบอร์โทร (กด / เพื่อค้นหา)...',
  filterCount = 0,
  onToggleFilters = null,
  datePresets = [
    { value: 'all', label: 'ทุกช่วงเวลา' },
    { value: 'today', label: 'วันนี้' },
    { value: '7days', label: '7 วัน' },
    { value: 'month', label: 'เดือนนี้' },
    { value: 'quarter', label: 'ไตรมาส' },
    { value: 'year', label: 'ปีนี้' },
  ],
  activeDatePreset = 'all',
  onDatePresetChange = null,
  statusOptions = [],
  activeStatus = '',
  onStatusChange = null,
  viewModes = null, // e.g. ['table', 'cards']
  activeViewMode = 'table',
  onViewModeChange = null,
  onExport = null, // (type: 'excel' | 'csv' | 'pdf') => void
  columns = null, // [{ key, label, visible }]
  onToggleColumn = null,
  activeChips = [], // [{ key, label, onRemove }]
  onClearAllFilters = null,
  primaryAction = null, // { label: '+ สร้างใหม่', onClick, to, icon }
  customFilters = null,
}) {
  const searchInputRef = useRef(null)
  const [localSearch, setLocalSearch] = useState(search)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [showDateMenu, setShowDateMenu] = useState(false)

  // 1. Debounce Search 300ms
  useEffect(() => {
    setLocalSearch(search)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch])

  // 2. Keyboard shortcut: Press "/" to focus search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const closeMenus = () => {
      setShowExportMenu(false)
      setShowColumnMenu(false)
      setShowDateMenu(false)
    }
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [])

  const activeDateLabel =
    datePresets.find((p) => p.value === activeDatePreset)?.label || 'ช่วงวันที่'

  return (
    <div className="space-y-2.5">
      {/* Main Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[var(--surface)] p-2.5 sm:p-3 rounded-card border border-[var(--border)] shadow-xs">
        {/* Left Side: Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* 1. Search Box with Debounce & Shortcut / */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-9 pl-9 pr-8 text-xs sm:text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-input text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:outline-none transition-all"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('')
                  onSearchChange('')
                  searchInputRef.current?.focus()
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition cursor-pointer"
                title="ล้างคำค้นหา"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 2. Filter Button with Active Count Badge */}
          {onToggleFilters && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleFilters()
              }}
              className={`h-9 px-3 rounded-input text-xs font-semibold inline-flex items-center gap-1.5 border transition cursor-pointer ${
                filterCount > 0
                  ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>ตัวกรอง</span>
              {filterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--primary)] text-white">
                  {filterCount}
                </span>
              )}
            </button>
          )}

          {/* 3. Date Presets Dropdown */}
          {onDatePresetChange && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDateMenu(!showDateMenu)
                  setShowExportMenu(false)
                  setShowColumnMenu(false)
                }}
                className="h-9 px-3 rounded-input text-xs font-medium inline-flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] transition cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{activeDateLabel}</span>
                <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
              </button>

              {showDateMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 mt-1 w-44 rounded-card bg-[var(--surface)] border border-[var(--border)] shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs"
                >
                  {datePresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        onDatePresetChange(preset.value)
                        setShowDateMenu(false)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-input text-left transition cursor-pointer ${
                        activeDatePreset === preset.value
                          ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-bold'
                          : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <span>{preset.label}</span>
                      {activeDatePreset === preset.value && (
                        <Check className="h-3.5 w-3.5 text-[var(--primary)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Status Selector */}
          {statusOptions.length > 0 && onStatusChange && (
            <select
              value={activeStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="h-9 px-2.5 rounded-input text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none transition cursor-pointer"
            >
              <option value="">ทุกสถานะ</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Custom Slot */}
          {customFilters}
        </div>

        {/* Right Side: View Modes + Export + Columns + Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Toggle: Table / Cards / Kanban */}
          {viewModes && viewModes.length > 1 && onViewModeChange && (
            <div className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-input border border-[var(--border)]">
              {viewModes.includes('table') && (
                <button
                  type="button"
                  onClick={() => onViewModeChange('table')}
                  className={`p-1.5 rounded-button text-xs transition cursor-pointer ${
                    activeViewMode === 'table'
                      ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="มุมมองตาราง (Table)"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
              )}
              {viewModes.includes('cards') && (
                <button
                  type="button"
                  onClick={() => onViewModeChange('cards')}
                  className={`p-1.5 rounded-button text-xs transition cursor-pointer ${
                    activeViewMode === 'cards'
                      ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="มุมมองการ์ด (Cards)"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              )}
              {viewModes.includes('kanban') && (
                <button
                  type="button"
                  onClick={() => onViewModeChange('kanban')}
                  className={`p-1.5 rounded-button text-xs transition cursor-pointer ${
                    activeViewMode === 'kanban'
                      ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="มุมมองคัมบัง (Kanban)"
                >
                  <Kanban className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Export Dropdown */}
          {onExport && (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-3.5 w-3.5" />}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowExportMenu(!showExportMenu)
                  setShowColumnMenu(false)
                  setShowDateMenu(false)
                }}
              >
                <span>ส่งออก</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>

              {showExportMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 mt-1 w-36 rounded-card bg-[var(--surface)] border border-[var(--border)] shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onExport('excel')
                      setShowExportMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-input text-[var(--text)] hover:bg-[var(--surface-2)] transition cursor-pointer text-left"
                  >
                    <span></span>
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExport('csv')
                      setShowExportMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-input text-[var(--text)] hover:bg-[var(--surface-2)] transition cursor-pointer text-left"
                  >
                    <span></span>
                    <span>CSV (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExport('pdf')
                      setShowExportMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-input text-[var(--text)] hover:bg-[var(--surface-2)] transition cursor-pointer text-left"
                  >
                    <span></span>
                    <span>PDF (.pdf)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Column Visibility Picker */}
          {columns && onToggleColumn && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowColumnMenu(!showColumnMenu)
                  setShowExportMenu(false)
                  setShowDateMenu(false)
                }}
                tooltip="เลือกแสดง/ซ่อนคอลัมน์"
              />

              {showColumnMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 mt-1 w-48 rounded-card bg-[var(--surface)] border border-[var(--border)] shadow-xl p-2 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs space-y-1.5"
                >
                  <div className="font-bold text-[11px] text-[var(--text-muted)] uppercase tracking-wider px-1">
                    แสดงคอลัมน์
                  </div>
                  {columns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[var(--surface-2)] cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={col.visible !== false}
                        onChange={() => onToggleColumn(col.key)}
                        className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Primary Action Button: 40px Solid Brand Green */}
          {primaryAction && (
            primaryAction.to ? (
              <Button
                as={Link}
                to={primaryAction.to}
                variant="primary"
                size="md"
                icon={primaryAction.icon || <Plus className="h-4 w-4" />}
              >
                {primaryAction.label}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={primaryAction.onClick}
                icon={primaryAction.icon || <Plus className="h-4 w-4" />}
              >
                {primaryAction.label}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {(activeChips.length > 0 || localSearch) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">
            ตัวกรองที่เลือก:
          </span>

          {localSearch && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] font-medium">
              <span>ค้นหา: "{localSearch}"</span>
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('')
                  onSearchChange('')
                }}
                className="hover:text-rose-600 transition"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--primary-soft)] border border-[var(--primary)]/40 text-[var(--primary)] font-medium"
            >
              <span>{chip.label}</span>
              {chip.onRemove && (
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="hover:text-rose-600 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}

          {onClearAllFilters && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline px-1 cursor-pointer"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>
      )}
    </div>
  )
}
