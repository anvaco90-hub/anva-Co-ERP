import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import {
  computePayrollPlan,
  postPayrollToAccounting,
  fetchPayrollHistory,
} from '../../lib/payrollAccounting'
import {
  Users, Clock, Calendar, Briefcase, DollarSign,
  CheckCircle2, AlertCircle, Plus, RefreshCw, ChevronDown,
} from 'lucide-react'

// ── ค่าคงที่ ──────────────────────────────────────────────────────────────
const SSF_RATE  = 0.05   // ประกันสังคม 5% (ทั้งลูกจ้างและนายจ้าง)
const OT_MULT   = 1.5    // OT 1.5 เท่า (อัตราต่ำสุดตามกฎหมาย)

// คำนวณอัตรา OT จากเงินเดือน (เงินเดือน / 26 วัน / 8 ชม. * 1.5)
const calcOtRate = (salary) => round2(((Number(salary) || 0) / 26 / 8) * OT_MULT)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function HRDashboard() {
  const [activeTab, setActiveTab] = useState('employees')
  const [employees, setEmployees]   = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaves, setLeaves]         = useState([])
  const [assets, setAssets]         = useState([])
  const [payrollHistory, setPayrollHistory] = useState([])
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)

  // Payroll form state
  const [payrollForm, setPayrollForm] = useState({
    runCode:        '',
    payPeriodStart: '',
    payPeriodEnd:   '',
    payDate:        new Date().toISOString().slice(0, 10),
    projectId:      '',
    selectedEmpIds: [],   // เลือกหลายคนได้
    whtPct:         3,    // WHT ภ.ง.ด.1 (%)
    notes:          '',
  })
  const [payrollSaving, setPayrollSaving]   = useState(false)
  const [payrollError, setPayrollError]     = useState('')
  const [payrollSuccess, setPayrollSuccess] = useState('')

  // ── โหลดข้อมูล ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [empRes, attRes, levRes, astRes, prjRes] = await Promise.all([
        supabase.from('employees').select('*').order('emp_code', { ascending: true }),
        supabase.from('attendance_records').select('*').order('work_date', { ascending: false }),
        supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
        supabase.from('company_assets').select('*').order('asset_code', { ascending: true }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
      ])
      setEmployees(empRes.data || [])
      setAttendance(attRes.data || [])
      setLeaves(levRes.data || [])
      setAssets(astRes.data || [])
      setProjects(prjRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadPayrollHistory() {
    try {
      const rows = await fetchPayrollHistory({ limit: 200 })
      setPayrollHistory(rows)
    } catch (err) {
      console.error('fetchPayrollHistory', err)
    }
  }

  // โหลดประวัติ payroll เมื่อสลับมา tab payroll
  useEffect(() => {
    if (activeTab === 'payroll') loadPayrollHistory()
  }, [activeTab])

  // ── KPI ─────────────────────────────────────────────────────────────────
  const totalPayroll   = employees.reduce((s, e) => s + Number(e.salary || 0), 0)
  const totalOtHours   = attendance.reduce((s, a) => s + Number(a.ot_hours || 0), 0)
  const pendingLeaves  = leaves.filter((l) => l.status === 'pending').length
  const totalAssetsCount = assets.length

  // ── คำนวณตัวอย่าง payroll preview สำหรับพนักงานที่เลือก ──────────────
  const selectedEmployees = useMemo(
    () => employees.filter((e) => payrollForm.selectedEmpIds.includes(e.id)),
    [employees, payrollForm.selectedEmpIds]
  )

  const payrollPreviewRows = useMemo(() => {
    return selectedEmployees.map((e) => {
      // หา OT ชั่วโมงในงวดจาก attendance
      const otHours = attendance
        .filter(
          (a) =>
            a.emp_id === e.id &&
            (!payrollForm.payPeriodStart || a.work_date >= payrollForm.payPeriodStart) &&
            (!payrollForm.payPeriodEnd || a.work_date <= payrollForm.payPeriodEnd)
        )
        .reduce((s, a) => s + Number(a.ot_hours || 0), 0)

      const salary     = Number(e.salary || 0)
      const otRate     = calcOtRate(salary)
      const otAmount   = round2(otHours * otRate)
      const ssfEmp     = round2(Math.min(salary, 15000) * SSF_RATE)
      const ssfEmpr    = ssfEmp
      const grossPay   = round2(salary + otAmount)
      const whtAmount  = round2(grossPay * (Number(payrollForm.whtPct || 0) / 100))
      const { netPay } = computePayrollPlan({
        baseSalary: salary,
        otAmount,
        ssfEmployee: ssfEmp,
        ssfEmployer: ssfEmpr,
        whtAmount,
        projectId: payrollForm.projectId || null,
      })

      return { emp: e, salary, otHours, otRate, otAmount, ssfEmp, ssfEmpr, grossPay, whtAmount, netPay }
    })
  }, [selectedEmployees, attendance, payrollForm])

  const previewTotal = useMemo(
    () => payrollPreviewRows.reduce((s, r) => s + r.grossPay, 0),
    [payrollPreviewRows]
  )

  // ── Toggle เลือก/ยกเลิกพนักงาน ─────────────────────────────────────────
  function toggleEmp(id) {
    setPayrollForm((f) => ({
      ...f,
      selectedEmpIds: f.selectedEmpIds.includes(id)
        ? f.selectedEmpIds.filter((x) => x !== id)
        : [...f.selectedEmpIds, id],
    }))
  }

  function selectAllEmps() {
    setPayrollForm((f) => ({
      ...f,
      selectedEmpIds:
        f.selectedEmpIds.length === employees.length
          ? []
          : employees.map((e) => e.id),
    }))
  }

  // ── บันทึก payroll ──────────────────────────────────────────────────────
  async function handlePostPayroll(e) {
    e.preventDefault()
    setPayrollError('')
    setPayrollSuccess('')

    if (payrollPreviewRows.length === 0) {
      return setPayrollError('กรุณาเลือกพนักงานอย่างน้อย 1 คน')
    }
    if (!payrollForm.payPeriodStart || !payrollForm.payPeriodEnd || !payrollForm.payDate) {
      return setPayrollError('กรุณาระบุงวดและวันที่จ่ายเงินเดือนให้ครบ')
    }
    const runCode =
      payrollForm.runCode.trim() ||
      `PAY-${payrollForm.payPeriodEnd.slice(0, 7).replace('-', '')}`

    setPayrollSaving(true)
    try {
      const results = []
      for (const row of payrollPreviewRows) {
        const res = await postPayrollToAccounting({
          runCode,
          payPeriodStart: payrollForm.payPeriodStart,
          payPeriodEnd:   payrollForm.payPeriodEnd,
          payDate:        payrollForm.payDate,
          empId:          row.emp.id,
          empName:        row.emp.full_name,
          department:     row.emp.department,
          projectId:      payrollForm.projectId || null,
          baseSalary:     row.salary,
          otHours:        row.otHours,
          otRate:         row.otRate,
          ssfEmployee:    row.ssfEmp,
          ssfEmployer:    row.ssfEmpr,
          whtAmount:      row.whtAmount,
          notes:          payrollForm.notes,
        })
        results.push(res)
      }
      setPayrollSuccess(
        `บันทึกสำเร็จ ${results.length} คน รวม ${baht(previewTotal)} บาท ` +
        `พร้อมลง GL (PAY_PAYROLL) และ Expenses แล้ว`
      )
      setPayrollForm((f) => ({ ...f, selectedEmpIds: [] }))
      await loadPayrollHistory()
    } catch (err) {
      console.error('postPayrollToAccounting error:', err)
      setPayrollError(err.message || 'บันทึกเงินเดือนไม่สำเร็จ')
    } finally {
      setPayrollSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">ระบบบริหารทรัพยากรบุคคล (HR Management)</h1>
        <p className="text-xs text-steel-500">
          ทะเบียนประวัติพนักงาน, ลงเวลาผ่านระบบ GPS &amp; OT หน้างาน, ระบบยื่นใบลา, จ่ายเงินเดือน→บัญชี
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-xs text-steel-500 font-medium flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> จำนวนพนักงานทั้งหมด
          </div>
          <div className="text-2xl font-bold text-ink mt-1">{employees.length} คน</div>
        </div>
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" /> ค่าใช้จ่ายเงินเดือนรวม / เดือน
          </div>
          <div className="text-xl font-bold text-emerald-800 mt-1 font-mono">{baht(totalPayroll)} บ.</div>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 shadow-sm">
          <div className="text-xs text-purple-700 font-medium flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> ชั่วโมง OT รวม
          </div>
          <div className="text-xl font-bold text-purple-800 mt-1 font-mono">{totalOtHours} ชม.</div>
        </div>
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-xs text-blue-700 font-medium flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" /> ทรัพย์สินบริษัท
          </div>
          <div className="text-xl font-bold text-blue-800 mt-1">{totalAssetsCount} รายการ</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-steel-200 pb-2">
        {[
          { key: 'employees',  label: '👥 ทะเบียนพนักงาน' },
          { key: 'attendance', label: '⏱️ ลงเวลา GPS & OT' },
          { key: 'leaves',     label: `📝 การขอลา${pendingLeaves > 0 ? ` (${pendingLeaves})` : ''}` },
          { key: 'assets',     label: '💼 ทรัพย์สินบริษัท' },
          { key: 'payroll',    label: '💵 จ่ายเงินเดือน→บัญชี' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
              activeTab === key
                ? 'bg-sky-700 text-white shadow'
                : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-steel-400">กำลังโหลดข้อมูลบุคลากร...</div>

      ) : activeTab === 'employees' ? (
        /* ── TAB 1: ทะเบียนพนักงาน ── */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200">
            <h3 className="font-bold text-ink text-sm">รายชื่อพนักงานประจำ ANVA &amp; CO., LTD.</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ - สกุล</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">ตำแหน่ง</th>
                  <th className="px-4 py-3 text-right">เงินเดือนฐาน</th>
                  <th className="px-4 py-3 text-right">อัตรา OT/ชม.</th>
                  <th className="px-4 py-3">เบอร์ติดต่อ</th>
                  <th className="px-4 py-3">วันเริ่มงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-sky-800 text-xs">{e.emp_code}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{e.full_name}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="bg-steel-100 text-steel-700 px-2 py-0.5 rounded">{e.department}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{e.position}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{baht(e.salary)}</td>
                    <td className="px-4 py-3 text-right font-mono text-purple-700">{baht(calcOtRate(e.salary))}</td>
                    <td className="px-4 py-3 text-xs text-steel-500 font-mono">{e.phone || '-'}</td>
                    <td className="px-4 py-3 text-xs text-steel-500">{e.start_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : activeTab === 'attendance' ? (
        /* ── TAB 2: ลงเวลา GPS & OT ── */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200">
            <h3 className="font-bold text-ink text-sm">ประวัติการลงเวลาและพิกัด Check-in หน้างาน (GPS Mobile)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">พนักงาน</th>
                  <th className="px-4 py-3 text-center">เวลาเข้า</th>
                  <th className="px-4 py-3 text-center">เวลาออก</th>
                  <th className="px-4 py-3">พิกัด GPS</th>
                  <th className="px-4 py-3 text-center">OT (ชม.)</th>
                  <th className="px-4 py-3 text-right">ค่า OT</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {attendance.map((a) => {
                  const emp    = employees.find((e) => e.id === a.emp_id)
                  const otRate = calcOtRate(emp?.salary ?? 0)
                  const otAmt  = round2(Number(a.ot_hours || 0) * otRate)
                  return (
                    <tr key={a.id} className="hover:bg-steel-50/50">
                      <td className="px-4 py-3 text-xs font-semibold text-ink">{a.work_date}</td>
                      <td className="px-4 py-3 font-medium text-ink">{a.emp_name}</td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">{a.check_in_time}</td>
                      <td className="px-4 py-3 text-center font-mono text-sky-700 font-bold">{a.check_out_time}</td>
                      <td className="px-4 py-3 text-xs text-steel-500">{a.gps_location}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-purple-700">
                        {Number(a.ot_hours) > 0 ? `+${a.ot_hours}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-purple-800 text-xs">
                        {otAmt > 0 ? baht(otAmt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          a.status === 'normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {a.status === 'normal' ? 'ตรงเวลา' : 'สาย'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      ) : activeTab === 'leaves' ? (
        /* ── TAB 3: การขอลา ── */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200">
            <h3 className="font-bold text-ink text-sm">คำขอลาพักผ่อน / ลากิจ / ลาป่วย และขั้นตอนการอนุมัติ</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">พนักงาน</th>
                  <th className="px-4 py-3">ประเภทการลา</th>
                  <th className="px-4 py-3">ช่วงวันที่ลา</th>
                  <th className="px-4 py-3 text-center">จำนวนวัน</th>
                  <th className="px-4 py-3">เหตุผล</th>
                  <th className="px-4 py-3">ผู้อนุมัติ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {leaves.map((l) => (
                  <tr key={l.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 font-semibold text-ink">{l.emp_name}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded font-medium ${
                        l.leave_type === 'sick' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {l.leave_type === 'sick' ? '🤒 ลาป่วย' : '📅 ลากิจ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{l.start_date} ถึง {l.end_date}</td>
                    <td className="px-4 py-3 text-center font-bold text-ink">{l.days} วัน</td>
                    <td className="px-4 py-3 text-xs text-steel-500">{l.reason}</td>
                    <td className="px-4 py-3 text-xs text-steel-600 font-medium">{l.approver || 'รออนุมัติ'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        l.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {l.status === 'approved' ? '✅ อนุมัติแล้ว' : '⏳ รออนุมัติ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : activeTab === 'assets' ? (
        /* ── TAB 4: ทรัพย์สินบริษัท ── */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200">
            <h3 className="font-bold text-ink text-sm">ทะเบียนทรัพย์สินและอุปกรณ์ประจำตัวพนักงาน (Asset Management)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">รหัสทรัพย์สิน</th>
                  <th className="px-4 py-3">ชื่อทรัพย์สิน</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3">Serial No.</th>
                  <th className="px-4 py-3">ผู้ถือครอง</th>
                  <th className="px-4 py-3 text-right">มูลค่าซื้อ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {assets.map((ast) => (
                  <tr key={ast.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-sky-800 text-xs">{ast.asset_code}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{ast.asset_name}</td>
                    <td className="px-4 py-3 text-xs text-steel-500">{ast.category}</td>
                    <td className="px-4 py-3 text-xs font-mono text-steel-400">{ast.serial_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-steel-700 font-medium">{ast.assigned_to}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{baht(ast.purchase_cost)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">ใช้งานอยู่</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : activeTab === 'payroll' ? (
        /* ── TAB 5: จ่ายเงินเดือน→บัญชี ── */
        <div className="space-y-5">

          {/* ── ฟอร์มจ่ายเงินเดือน ── */}
          <div className="bg-white rounded-xl border border-steel-200 shadow-sm">
            <div className="p-4 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-sky-700" />
                  ประมวลผลและบันทึกจ่ายเงินเดือน (Payroll Run)
                </h3>
                <p className="text-xs text-steel-500 mt-0.5">
                  เลือกพนักงาน → ระบุงวด → กดบันทึก จะสร้าง Expenses + GL (Dr.5200/5121 Cr.2130) อัตโนมัติ
                </p>
              </div>
              <button
                onClick={loadAll}
                className="p-1.5 rounded-lg border border-steel-200 hover:bg-steel-100 text-steel-500"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handlePostPayroll} className="p-4 space-y-4 text-xs">
              {/* งวดและวันที่ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">รหัสรอบจ่าย</label>
                  <input
                    type="text"
                    placeholder="เช่น PAY-202611"
                    value={payrollForm.runCode}
                    onChange={(e) => setPayrollForm(f => ({ ...f, runCode: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg font-mono text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-steel-700 block mb-1">ต้นงวด *</label>
                  <input
                    type="date"
                    required
                    value={payrollForm.payPeriodStart}
                    onChange={(e) => setPayrollForm(f => ({ ...f, payPeriodStart: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-steel-700 block mb-1">สิ้นงวด *</label>
                  <input
                    type="date"
                    required
                    value={payrollForm.payPeriodEnd}
                    onChange={(e) => setPayrollForm(f => ({ ...f, payPeriodEnd: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-steel-700 block mb-1">วันที่จ่าย *</label>
                  <input
                    type="date"
                    required
                    value={payrollForm.payDate}
                    onChange={(e) => setPayrollForm(f => ({ ...f, payDate: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* โครงการ และ WHT */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">โครงการ (ถ้าเป็นค่าแรงหน้างาน)</label>
                  <select
                    value={payrollForm.projectId}
                    onChange={(e) => setPayrollForm(f => ({ ...f, projectId: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg text-ink bg-white focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">— ไม่ระบุโครงการ (เงินเดือนทั่วไป) —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_code} — {p.project_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-steel-700 block mb-1">อัตรา WHT ภ.ง.ด.1 (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    step="0.1"
                    value={payrollForm.whtPct}
                    onChange={(e) => setPayrollForm(f => ({ ...f, whtPct: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg font-mono text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-steel-700 block mb-1">หมายเหตุ</label>
                  <input
                    type="text"
                    value={payrollForm.notes}
                    onChange={(e) => setPayrollForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="งวดประจำเดือน..."
                    className="w-full px-2.5 py-1.5 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* ตารางเลือกพนักงาน + preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-steel-700">เลือกพนักงาน ({payrollForm.selectedEmpIds.length}/{employees.length})</label>
                  <button
                    type="button"
                    onClick={selectAllEmps}
                    className="text-sky-700 font-bold text-xs hover:underline"
                  >
                    {payrollForm.selectedEmpIds.length === employees.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>

                <div className="rounded-xl border border-steel-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-steel-600">
                      <thead className="bg-steel-50 text-steel-700 font-semibold border-b border-steel-200">
                        <tr>
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={payrollForm.selectedEmpIds.length === employees.length && employees.length > 0}
                              onChange={selectAllEmps}
                              className="h-3.5 w-3.5 rounded"
                            />
                          </th>
                          <th className="px-3 py-2">พนักงาน</th>
                          <th className="px-3 py-2">แผนก</th>
                          <th className="px-3 py-2 text-right">เงินเดือน</th>
                          <th className="px-3 py-2 text-right text-purple-700">OT (ชม.)</th>
                          <th className="px-3 py-2 text-right text-purple-700">ค่า OT</th>
                          <th className="px-3 py-2 text-right text-amber-700">ประกัน สสค.</th>
                          <th className="px-3 py-2 text-right text-rose-700">WHT</th>
                          <th className="px-3 py-2 text-right font-bold text-emerald-800">ยอดโอนสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {employees.map((e) => {
                          const isSelected = payrollForm.selectedEmpIds.includes(e.id)
                          const preview    = payrollPreviewRows.find((r) => r.emp.id === e.id)
                          return (
                            <tr
                              key={e.id}
                              className={`cursor-pointer transition ${isSelected ? 'bg-sky-50/70' : 'hover:bg-steel-50/40'}`}
                              onClick={() => toggleEmp(e.id)}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="h-3.5 w-3.5 rounded pointer-events-none"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-ink block">{e.full_name}</span>
                                <span className="text-[10px] text-sky-700 font-mono">{e.emp_code}</span>
                              </td>
                              <td className="px-3 py-2 text-steel-500">{e.department}</td>
                              <td className="px-3 py-2 text-right font-mono">{baht(e.salary)}</td>
                              <td className="px-3 py-2 text-right font-mono text-purple-700">
                                {isSelected && preview ? preview.otHours : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-purple-700">
                                {isSelected && preview ? baht(preview.otAmount) : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-amber-700">
                                {isSelected && preview ? baht(preview.ssfEmp) : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-rose-700">
                                {isSelected && preview ? baht(preview.whtAmount) : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                                {isSelected && preview ? baht(preview.netPay) : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {selectedEmployees.length > 0 && (
                        <tfoot className="bg-sky-50 border-t-2 border-sky-300 text-xs font-bold">
                          <tr>
                            <td colSpan="3" className="px-3 py-2 text-sky-800">
                              รวม {selectedEmployees.length} คน
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {baht(payrollPreviewRows.reduce((s, r) => s + r.salary, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-purple-700">
                              {payrollPreviewRows.reduce((s, r) => s + r.otHours, 0).toFixed(1)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-purple-700">
                              {baht(payrollPreviewRows.reduce((s, r) => s + r.otAmount, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-amber-700">
                              {baht(payrollPreviewRows.reduce((s, r) => s + r.ssfEmp, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-rose-700">
                              {baht(payrollPreviewRows.reduce((s, r) => s + r.whtAmount, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                              {baht(payrollPreviewRows.reduce((s, r) => s + r.netPay, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>

              {/* GL Preview Banner */}
              {selectedEmployees.length > 0 && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs">
                  <div className="font-bold text-sky-800 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    GL ที่จะถูกสร้างอัตโนมัติ ({payrollForm.projectId ? 'Dr. 5121 ต้นทุนค่าแรงโครงการ' : 'Dr. 5200-01 ค่าใช้จ่ายเงินเดือน'})
                  </div>
                  <div className="text-steel-600 space-y-0.5 font-mono">
                    <div>Dr. {payrollForm.projectId ? '5121' : '5200-01'} ..... {baht(previewTotal)}</div>
                    <div>Cr. 2130-01 (เงินเดือนค้างจ่าย) ..... {baht(previewTotal)}</div>
                  </div>
                </div>
              )}

              {/* Error / Success */}
              {payrollError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{payrollError}
                </div>
              )}
              {payrollSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />{payrollSuccess}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={payrollSaving || selectedEmployees.length === 0}
                  className="px-6 py-2.5 bg-sky-700 text-white rounded-xl hover:bg-sky-800 font-bold shadow-sm flex items-center gap-2 disabled:opacity-50 text-xs"
                >
                  {payrollSaving ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> กำลังบันทึก...</>
                  ) : (
                    <><DollarSign className="h-4 w-4" /> บันทึกจ่ายเงินเดือน + ลง GL</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ── ประวัติการจ่ายเงินเดือน ── */}
          <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
            <div className="p-3 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-steel-600" /> ประวัติรอบจ่ายเงินเดือน (Payroll History)
              </h3>
              <button
                onClick={loadPayrollHistory}
                className="p-1.5 rounded-lg border border-steel-200 hover:bg-steel-100 text-steel-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-steel-600">
                <thead className="bg-steel-50/75 font-semibold text-steel-700 border-b border-steel-200">
                  <tr>
                    <th className="px-3 py-2.5">รหัสรอบ</th>
                    <th className="px-3 py-2.5">พนักงาน</th>
                    <th className="px-3 py-2.5">แผนก</th>
                    <th className="px-3 py-2.5">งวด</th>
                    <th className="px-3 py-2.5">วันที่จ่าย</th>
                    <th className="px-3 py-2.5">โครงการ</th>
                    <th className="px-3 py-2.5 text-right">เงินเดือน</th>
                    <th className="px-3 py-2.5 text-right text-purple-700">OT</th>
                    <th className="px-3 py-2.5 text-right font-bold">Gross</th>
                    <th className="px-3 py-2.5 text-right text-emerald-700">Net</th>
                    <th className="px-3 py-2.5 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {payrollHistory.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="px-3 py-10 text-center text-steel-400">
                        ยังไม่มีประวัติการจ่ายเงินเดือน — กรอกฟอร์มด้านบนเพื่อเริ่มต้น
                      </td>
                    </tr>
                  ) : (
                    payrollHistory.map((p) => (
                      <tr key={p.id} className="hover:bg-steel-50/40">
                        <td className="px-3 py-2 font-mono font-bold text-sky-800">{p.run_code}</td>
                        <td className="px-3 py-2 font-semibold text-ink">{p.emp_name}</td>
                        <td className="px-3 py-2 text-steel-500">{p.department}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-steel-500">
                          {p.pay_period_start} → {p.pay_period_end}
                        </td>
                        <td className="px-3 py-2 font-mono">{p.pay_date}</td>
                        <td className="px-3 py-2 text-sky-700 text-[10px]">
                          {p.projects?.project_code || '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{baht(p.base_salary)}</td>
                        <td className="px-3 py-2 text-right font-mono text-purple-700">{baht(p.ot_amount)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{baht(p.gross_pay)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{baht(p.net_pay)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {p.status === 'paid' ? '✅ จ่ายแล้ว' : p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
