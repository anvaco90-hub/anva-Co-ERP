import { ArrowUpDown } from 'lucide-react'

/**
 * Standard Sort & Filter Control for ANVA & Co. ERP
 * มอบมาตรฐานการค้นหาและเรียงลำดับที่เป็นเอกภาพและสมดุลทั่วทั้งระบบ
 * 
 * @param {string} value - ค่าการเรียงลำดับปัจจุบัน (e.g. 'date_desc', 'name_asc')
 * @param {function} onChange - ฟังก์ชัน callback เมื่อเปลี่ยนค่า
 * @param {Array<{value: string, label: string}>} options - รายการตัวเลือกเรียงลำดับ
 * @param {string} className - คลาสตกแต่งเพิ่มเติม
 */
export default function TableSortFilter({
  value,
  onChange,
  options = [],
  className = '',
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-1.5 text-xs shadow-2xs transition hover:border-slate-400 dark:hover:border-slate-600 ${className}`}
      title="เลือกรูปแบบการเรียงลำดับข้อมูล (ก-ฮ / ตัวเลข / วันที่)"
    >
      <ArrowUpDown className="h-3.5 w-3.5 text-sky-600 dark:text-amber-400 shrink-0" />
      <span className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap text-[11px]">
        เรียงลำดับ:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer text-xs pr-1"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1"
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

