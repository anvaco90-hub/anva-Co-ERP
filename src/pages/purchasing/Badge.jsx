export default function Badge({ map, status }) {
  const s = map[status] ?? { label: status, cls: '' }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
}
