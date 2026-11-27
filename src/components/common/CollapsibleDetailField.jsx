import { useRef, useState } from 'react'
import { ChevronUp, FileText, Info, Plus } from 'lucide-react'

/**
 * ช่องกรอกรายละเอียด / สเปก / หมายเหตุแบบพับซ่อนได้ (Minimal Collapsible RichTextBox)
 * - ค่าเริ่มต้นพับไว้เพื่อไม่ให้ฟอร์มรกตา; กด "+ เพิ่มรายละเอียด" เพื่อเปิดกล่องข้อความหลายบรรทัด
 * - หากมีข้อความอยู่แล้วขณะพับ จะแสดงแถบตัวอย่างสั้นๆ บรรทัดเดียวพร้อมปุ่มกดเปิดแก้ไข
 */
export default function CollapsibleDetailField({
  value = '',
  onChange,
  addLabel = 'เพิ่มรายละเอียด',
  editLabel = 'รายละเอียด / สเปกเพิ่มเติม',
  hideLabel = 'ซ่อน',
  placeholder = 'พิมพ์รายละเอียดเพิ่มเติม (กด Enter ขึ้นบรรทัดใหม่ได้)...',
  hint = '',
  rows = 2,
  accent = 'slate',
  rightSlot = null,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const textareaRef = useRef(null)

  const trimmed = String(value || '').trim()
  const hasContent = trimmed.length > 0

  const focusTextarea = () => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  const handleOpen = () => {
    if (disabled) return
    setOpen(true)
    focusTextarea()
  }

  const buttonAccent =
    accent === 'amber'
      ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-900/40'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'

  const textareaAccent =
    accent === 'amber'
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/20 dark:bg-slate-900 focus:border-amber-500 dark:focus:border-amber-400'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-500 dark:focus:border-emerald-400'

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          {!open ? (
            <button
              type="button"
              disabled={disabled}
              onClick={handleOpen}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 max-w-full ${buttonAccent}`}
              title={hasContent ? 'คลิกเพื่อดูหรือแก้ไขข้อความทั้งหมด' : addLabel}
            >
              {hasContent ? (
                <>
                  <FileText className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-slate-700 dark:text-slate-200 shrink-0">{editLabel}:</span>
                  <span className="truncate max-w-[240px] sm:max-w-[380px] font-normal text-slate-500 dark:text-slate-400">
                    {trimmed.replace(/\s+/g, ' ')}
                  </span>
                  <span className="text-sky-600 dark:text-sky-400 font-bold shrink-0 ml-0.5">
                    แก้ไข
                  </span>
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 shrink-0" />
                  <span>{addLabel}</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span>{editLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <ChevronUp className="h-3 w-3" />
                <span>{hideLabel}</span>
              </button>
            </div>
          )}
        </div>

        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      {open && (
        <div className="space-y-1">
          <textarea
            ref={textareaRef}
            rows={rows}
            disabled={disabled}
            className={`w-full rounded-xl border p-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 transition leading-relaxed font-sans resize-y ${textareaAccent}`}
            placeholder={placeholder}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
          />
          {hint && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500 flex justify-end">
              {hint}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
