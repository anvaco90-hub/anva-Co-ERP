import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/purchasing'

const HEADER = { vendor: 'ผู้ขาย', project: 'โครงการ', notes: 'หมายเหตุ', status: 'สถานะ', total_amount: 'ยอดรวม' }
const ACTION = { update: 'แก้ไข', cancel: 'ยกเลิก', delete: 'ลบ' }
const price = (i) => i.unit_price ?? i.estimated_price
const fmtItem = (i) => `${i.item_name} ${i.quantity}${i.unit ? ' ' + i.unit : ''}${price(i) != null ? ` @${price(i)}` : ''}`

// สรุปค่าเดิม → ค่าใหม่ จาก snapshot ที่ฐานข้อมูลเก็บไว้
function diffLines(o, n) {
  if (!o || !n) return []
  const lines = Object.entries(HEADER)
    .filter(([k]) => (o[k] ?? '') !== (n[k] ?? ''))
    .map(([k, label]) => `${label}: ${o[k] ?? '-'} → ${n[k] ?? '-'}`)
  const oi = (o.items ?? []).map(fmtItem)
  const ni = (n.items ?? []).map(fmtItem)
  oi.filter((x) => !ni.includes(x)).forEach((x) => lines.push(`รายการเดิม: ${x}`))
  ni.filter((x) => !oi.includes(x)).forEach((x) => lines.push(`รายการใหม่: ${x}`))
  return lines
}

// แสดงผู้สร้าง/ผู้แก้ไขล่าสุด และประวัติการแก้ไขของเอกสาร (row ต้องมี creator, updater, created_at, updated_at)
export default function AuditPanel({ docId, row }) {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    supabase.from('purchase_audit_log').select('*, user:profiles!changed_by(full_name)')
      .eq('doc_id', docId).order('changed_at', { ascending: false })
      .then(({ data }) => setLogs(data ?? []))
  }, [docId, row?.updated_at])

  return (
    <div className="mt-4 rounded-lg bg-white p-5 text-sm">
      <p>สร้างโดย <b>{row.creator?.full_name ?? '-'}</b> เมื่อ {fmtDateTime(row.created_at)}</p>
      {row.updated_at && <p>แก้ไขล่าสุดโดย <b>{row.updater?.full_name ?? '-'}</b> เมื่อ {fmtDateTime(row.updated_at)}</p>}
      {logs.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold">ประวัติการแก้ไข ({logs.length})</summary>
          <ul className="mt-2 space-y-3">
            {logs.map((l) => {
              const lines = diffLines(l.old_data, l.new_data)
              return (
                <li key={l.id} className="border-l-2 border-hivis pl-3">
                  <div><b>{ACTION[l.action]}</b> โดย {l.user?.full_name ?? '-'} · {fmtDateTime(l.changed_at)}</div>
                  {l.reason && <div className="text-steel-500">เหตุผล: {l.reason}</div>}
                  {l.action === 'delete' && <div className="text-steel-500">ลบเอกสาร {l.doc_no}</div>}
                  {lines.map((t, i) => <div key={i} className="text-steel-700">{t}</div>)}
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
