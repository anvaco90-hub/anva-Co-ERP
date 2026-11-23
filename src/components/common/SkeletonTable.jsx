import React from 'react'

/**
 * ANVA & Co ERP Standard Shimmer Skeleton Table
 * Replaces old spinning circle with executive placeholder rows
 */
export default function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="w-full space-y-3 p-4 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800/60 w-full mb-3" />

      {/* Row Skeletons */}
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div
          key={rIdx}
          className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-800/60"
        >
          {Array.from({ length: cols }).map((_, cIdx) => (
            <div
              key={cIdx}
              className={`h-4 rounded bg-slate-200/80 dark:bg-slate-800 ${
                cIdx === 0
                  ? 'w-28'
                  : cIdx === 1
                  ? 'flex-1'
                  : cIdx === cols - 1
                  ? 'w-20'
                  : 'w-24'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
