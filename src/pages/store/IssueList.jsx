import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime } from '../../lib/purchasing'

export default function IssueList() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('stock_issues')
      .select('id, issue_no, issue_date, notes, projects(project_code, project_name), issuer:profiles!issued_by(full_name), stock_issue_items(quantity, unit_cost, inventory_items(item_name, unit))')
      .order('issue_date', { ascending: false }).order('issue_no', { ascending: false }).limit(50)
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data)))
  }, [])

  if (!rows) return <p className="text-steel-500">{error || 'กำลังโหลด...'}</p>
  if (rows.length === 0) return <p className="rounded-lg bg-white p-5 text-steel-500">ยังไม่มีการเบิกวัสดุ</p>

  return (
    <ul className="max-w-3xl space-y-3">
      {rows.map((r) => {
        const total = r.stock_issue_items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0)
        return (
          <li key={r.id} className="rounded-lg bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>{r.issue_no}</b> <span className="text-steel-500">· {r.issue_date} · เข้าโครงการ {r.projects?.project_code} {r.projects?.project_name}</span></div>
              <b>{baht(total)} บาท</b>
            </div>
            <ul className="mt-2 text-steel-700">
              {r.stock_issue_items.map((i, idx) => (
                <li key={idx}>{i.inventory_items?.item_name} × {i.quantity} {i.inventory_items?.unit} @ {baht(i.unit_cost)} = {baht(Number(i.quantity) * Number(i.unit_cost))}</li>
              ))}
            </ul>
            {r.notes && <p className="mt-1 text-steel-500">หมายเหตุ: {r.notes}</p>}
            <p className="mt-1 text-xs text-steel-500">ผู้เบิก: {r.issuer?.full_name ?? '-'}</p>
          </li>
        )
      })}
    </ul>
  )
}
