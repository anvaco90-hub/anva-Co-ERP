import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { fmtDateTime } from '../../lib/purchasing'
import {
  History,
  ArrowUpFromLine,
  Briefcase,
  User,
  Calendar,
  Layers,
  FileText,
  Boxes,
  Sun,
  Building2,
  MapPin,
  ArrowLeft,
  Tag,
} from 'lucide-react'

export default function IssueList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('stock_issues')
      .select(
        'id, issue_no, issue_date, notes, created_at, issue_target, issue_reason, target_location, projects(project_code, project_name), issuer:profiles!issued_by(full_name), stock_issue_items(quantity, unit_cost, inventory_items(item_name, unit, item_code))'
      )
      .order('issue_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          // Fallback ถ้ายังไม่มีคอลัมน์ใหม่
          supabase
            .from('stock_issues')
            .select(
              'id, issue_no, issue_date, notes, created_at, projects(project_code, project_name), issuer:profiles!issued_by(full_name), stock_issue_items(quantity, unit_cost, inventory_items(item_name, unit, item_code))'
            )
            .order('issue_date', { ascending: false })
            .limit(100)
            .then(({ data: fallbackData, error: fbErr }) => {
              if (fbErr) setError('โหลดไม่สำเร็จ')
              else setRows(fallbackData || [])
            })
        } else {
          setRows(data || [])
        }
      })
  }, [])

  if (!rows) {
    return (
      <div className="flex h-48 items-center justify-center space-y-2 font-sans">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-steel-900 border-t-hivis" />
        <span className="ml-3 text-xs font-semibold text-steel-500">
          กำลังโหลดประวัติการเบิกพัสดุ...
        </span>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6 font-sans text-slate-800">
      {/* 1. Header Banner: ANVA & Co Engineering Brand */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                ISSUE LOGS
              </span>
              <span className="text-xs text-steel-300">
                ประวัติการตัดสต็อกพัสดุและเบิกจ่ายทุกประเภท
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              ประวัติการเบิกพัสดุ / ตัดสต็อก (Stock Issue History)
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-300">
              ตรวจสอบรายการเบิกเข้าโครงการ ออฟฟิศ หน้างาน และการตัดชำรุด/สูญหาย ({rows.length} รายการล่าสุด)
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* ปุ่มย้อนกลับ (ข้อ 4) */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-xl bg-steel-800 hover:bg-steel-700 text-steel-200 border border-steel-600 px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>ย้อนกลับ</span>
            </button>

            <Link
              to="/store/issue/new"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-4 py-2 text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              <span>+ เบิกพัสดุ</span>
            </Link>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-300 bg-white p-12 text-center space-y-3">
          <Boxes className="mx-auto h-12 w-12 text-steel-300" />
          <h3 className="text-base font-bold text-steel-700">ยังไม่มีประวัติการเบิกพัสดุ</h3>
          <p className="text-xs text-steel-400">
            เมื่อมีการเบิกพัสดุเข้าโครงการ ออฟฟิศ หรือหน้างาน ข้อมูลใบเบิกและรายการตัดสต็อกจะแสดงที่นี่
          </p>
          <Link
            to="/store/issue/new"
            className="inline-flex rounded-xl bg-steel-900 text-hivis px-4 py-2 text-xs font-bold hover:bg-steel-800 transition"
          >
            สร้างใบเบิกแรก
          </Link>
        </div>
      ) : (
        <div className="space-y-3.5">
          {rows.map((r) => {
            const itemsList = r.stock_issue_items || []
            const total = itemsList.reduce(
              (s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0),
              0
            )

            // วิเคราะห์ปลายทางจากข้อมูลหรือ notes
            const isOffice = r.issue_target === 'office' || (r.notes && r.notes.includes('ออฟฟิศ'))
            const isSite = r.issue_target === 'site' || (r.notes && r.notes.includes('หน้างาน'))

            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl border border-steel-200 bg-white p-5 shadow-xs transition hover:border-steel-400 hover:shadow-sm space-y-3"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-steel-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-steel-100 px-2.5 py-1 text-xs font-mono font-black text-steel-900 border border-steel-200">
                      {r.issue_no}
                    </span>

                    {/* ป้ายปลายทาง (ข้อ 2 & 3) */}
                    {isOffice ? (
                      <span className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900 border border-blue-200">
                        <Building2 className="h-3.5 w-3.5 text-blue-600" />
                        <span>🏢 เบิกใช้ออฟฟิศ</span>
                        {r.target_location && (
                          <span className="text-blue-600 font-normal">({r.target_location})</span>
                        )}
                      </span>
                    ) : isSite ? (
                      <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-200">
                        <MapPin className="h-3.5 w-3.5 text-amber-600" />
                        <span>⚡ หน้างาน</span>
                        {r.target_location && (
                          <span className="text-amber-700 font-normal truncate max-w-[200px]">({r.target_location})</span>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-lg bg-steel-50 px-2.5 py-1 text-xs font-semibold text-steel-800 border border-steel-200">
                        <Briefcase className="h-3.5 w-3.5 text-steel-500" />
                        <span>{r.projects?.project_code || 'ส่วนกลาง'}</span>
                        <span className="text-steel-400">·</span>
                        <span className="truncate max-w-[200px]">{r.projects?.project_name || 'โครงการ'}</span>
                      </span>
                    )}

                    {/* เหตุผลการเบิก */}
                    {r.issue_reason && (
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                        {r.issue_reason}
                      </span>
                    )}

                    <span className="flex items-center gap-1 text-[11px] text-steel-500">
                      <Calendar className="h-3 w-3 text-steel-400" />
                      <span>{r.issue_date || (r.created_at ? r.created_at.slice(0, 10) : '-')}</span>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-steel-400 uppercase">มูลค่าเบิกรวม:</span>
                    <div className="font-mono text-base font-black text-steel-900">
                      {baht(total)} <span className="text-xs font-normal text-steel-400">บาท</span>
                    </div>
                  </div>
                </div>

                {/* Items breakdown list */}
                <div className="rounded-xl bg-steel-50/70 p-3 space-y-1.5 border border-steel-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-steel-500">
                    รายการพัสดุที่เบิก ({itemsList.length} รายการ):
                  </div>
                  <div className="divide-y divide-steel-100">
                    {itemsList.map((i, idx) => {
                      const itemTotal = Number(i.quantity || 0) * Number(i.unit_cost || 0)
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1 text-xs text-steel-700"
                        >
                          <span className="font-medium text-steel-900">
                            • {i.inventory_items?.item_name || 'พัสดุ'}
                          </span>
                          <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                            <span className="text-steel-600">
                              {i.quantity} {i.inventory_items?.unit} @ {baht(i.unit_cost)} บ.
                            </span>
                            <span className="font-bold text-steel-900 w-20 text-right">
                              {baht(itemTotal)} บ.
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Footer notes & issuer */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-steel-500 pt-1">
                  <div>
                    {r.notes && (
                      <span>
                        <b className="text-steel-700">บันทึก:</b> {r.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-steel-400">
                    <User className="h-3 w-3" />
                    <span>ผู้ทำรายการ: {r.issuer?.full_name || 'เจ้าหน้าที่สโตร์'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
