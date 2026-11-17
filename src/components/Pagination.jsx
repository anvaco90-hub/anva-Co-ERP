import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

/**
 * Universal ERP Pagination Component
 * @param {number} currentPage - หน้าปัจจุบัน (เริ่มต้นที่ 1)
 * @param {number} totalItems - จำนวนรายการทั้งหมดที่ผ่านการกรองแล้ว
 * @param {number} pageSize - จำนวนรายการต่อหน้า (เช่น 10, 20, 50, 100)
 * @param {function} onPageChange - callback เมื่อคลิกเปลี่ยนหน้า (page: number)
 * @param {function} onPageSizeChange - callback เมื่อเลือกจำนวนรายการต่อหน้า (size: number)
 * @param {Array<number>} pageSizeOptions - ตัวเลือกจำนวนต่อหน้า (ค่าเริ่มต้น [10, 20, 50, 100])
 * @param {string} className - คลาสเสริม
 */
export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  // คำนวณช่วงรายการที่กำลังแสดง เช่น 1 - 20
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems)

  // สร้างลำดับหมายเลขหน้าแบบอัจฉริยะ (< 1 2 3 4 5 6 > หรือ 1 ... 4 5 6 ... 10)
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages = []
    if (safeCurrentPage <= 4) {
      // หน้าแรกๆ: 1 2 3 4 5 ... [last]
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push('...')
      pages.push(totalPages)
    } else if (safeCurrentPage >= totalPages - 3) {
      // หน้าท้ายๆ: 1 ... 16 17 18 19 20
      pages.push(1)
      pages.push('...')
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
    } else {
      // หน้าตรงกลาง: 1 ... 5 6 7 ... 20
      pages.push(1)
      pages.push('...')
      pages.push(safeCurrentPage - 1)
      pages.push(safeCurrentPage)
      pages.push(safeCurrentPage + 1)
      pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, safeCurrentPage])

  const handlePageClick = (page) => {
    if (page === '...' || page === safeCurrentPage) return
    if (page >= 1 && page <= totalPages && onPageChange) {
      onPageChange(page)
    }
  }

  if (totalItems <= 0) return null

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pt-4 pb-2 text-xs text-steel-600 select-none ${className}`}
    >
      {/* 1. สรุปจำนวนรายการ & ตัวเลือกจำนวนต่อหน้า (Items Info & Page Size Selector) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-medium text-steel-700">
          แสดง{' '}
          <span className="font-mono font-bold text-steel-950">
            {startItem.toLocaleString()} - {endItem.toLocaleString()}
          </span>{' '}
          จากทั้งหมด{' '}
          <span className="font-mono font-bold text-steel-950">
            {totalItems.toLocaleString()}
          </span>{' '}
          รายการ
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-steel-200">
            <span className="text-steel-500">หน้าละ:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-steel-300 bg-white px-2 py-1 text-xs font-semibold text-steel-800 shadow-2xs focus:border-steel-900 focus:outline-none transition cursor-pointer hover:border-steel-400"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} รายการ
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 2. แถบปุ่มเปลี่ยนหน้า (< 1 2 3 4 5 6 >) */}
      <div className="flex items-center gap-1 self-center sm:self-auto">
        {/* หน้าแรกสุด (First) */}
        {totalPages > 5 && (
          <button
            type="button"
            onClick={() => handlePageClick(1)}
            disabled={safeCurrentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-200 bg-white text-steel-600 transition hover:bg-steel-50 hover:text-steel-950 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
            title="หน้าแรกสุด"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}

        {/* หน้าก่อนหน้า (Previous <) */}
        <button
          type="button"
          onClick={() => handlePageClick(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-200 bg-white text-steel-600 transition hover:bg-steel-50 hover:text-steel-950 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
          title="หน้าก่อนหน้า"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* ตัวเลขหน้า (< 1 2 3 4 5 6 >) */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, idx) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-8 w-7 items-center justify-center text-xs font-bold text-steel-400"
                >
                  …
                </span>
              )
            }

            const isActive = page === safeCurrentPage

            return (
              <button
                key={page}
                type="button"
                onClick={() => handlePageClick(page)}
                className={`flex h-8 min-w-[32px] px-2 items-center justify-center rounded-lg text-xs font-bold transition shadow-2xs ${
                  isActive
                    ? 'bg-steel-900 text-hivis font-black ring-1 ring-steel-900 shadow-xs'
                    : 'border border-steel-200 bg-white text-steel-700 hover:bg-steel-50 hover:text-steel-950 hover:border-steel-300'
                }`}
              >
                {page}
              </button>
            )
          })}
        </div>

        {/* หน้าถัดไป (Next >) */}
        <button
          type="button"
          onClick={() => handlePageClick(safeCurrentPage + 1)}
          disabled={safeCurrentPage === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-200 bg-white text-steel-600 transition hover:bg-steel-50 hover:text-steel-950 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
          title="หน้าถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* หน้าสุดท้าย (Last) */}
        {totalPages > 5 && (
          <button
            type="button"
            onClick={() => handlePageClick(totalPages)}
            disabled={safeCurrentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-200 bg-white text-steel-600 transition hover:bg-steel-50 hover:text-steel-950 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
            title="หน้าสุดท้าย"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

