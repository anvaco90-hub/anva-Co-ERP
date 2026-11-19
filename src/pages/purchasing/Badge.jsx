export default function Badge({ map, status }) {
  const s = map[status] ?? { label: status, cls: 'bg-steel-100 dark:bg-slate-800 text-steel-800 dark:text-slate-200 border border-steel-300 dark:border-slate-700' }
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 whitespace-nowrap shadow-xs ${s.cls}`}>
      {s.label}
    </span>
  )
}