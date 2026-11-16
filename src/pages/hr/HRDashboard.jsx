import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'

export default function HRDashboard() {
  const [activeTab, setActiveTab] = useState('employees') // 'employees' | 'attendance' | 'leaves' | 'assets'
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaves, setLeaves] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [empRes, attRes, levRes, astRes] = await Promise.all([
          supabase.from('employees').select('*').order('emp_code', { ascending: true }),
          supabase.from('attendance_records').select('*').order('work_date', { ascending: false }),
          supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
          supabase.from('company_assets').select('*').order('asset_code', { ascending: true }),
        ])
        setEmployees(empRes.data || [])
        setAttendance(attRes.data || [])
        setLeaves(levRes.data || [])
        setAssets(astRes.data || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const totalPayroll = employees.reduce((s, e) => s + Number(e.salary || 0), 0)
  const totalOtHours = attendance.reduce((s, a) => s + Number(a.ot_hours || 0), 0)
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length
  const totalAssetsCount = assets.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">ระบบบริหารทรัพยากรบุคคล (HR Management)</h1>
        <p className="text-xs text-steel-500">
          ทะเบียนประวัติพนักงาน, ลงเวลาผ่านระบบ GPS & OT หน้างาน, ระบบยื่นใบลา และการจัดการทรัพย์สินบริษัท
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-steel-200 shadow-sm">
          <div className="text-xs text-steel-500 font-medium">จำนวนพนักงานทั้งหมด</div>
          <div className="text-2xl font-bold text-ink mt-1">{employees.length} คน</div>
        </div>
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-xs text-emerald-700 font-medium">ค่าใช้จ่ายเงินเดือนรวม / เดือน</div>
          <div className="text-xl font-bold text-emerald-800 mt-1 font-mono">{baht(totalPayroll)} บ.</div>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 shadow-sm">
          <div className="text-xs text-purple-700 font-medium">ชั่วโมงทำงานล่วงเวลา (OT รวม)</div>
          <div className="text-xl font-bold text-purple-800 mt-1 font-mono">{totalOtHours} ชม.</div>
        </div>
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-xs text-blue-700 font-medium">ทรัพย์สินและอุปกรณ์บริษัท</div>
          <div className="text-xl font-bold text-blue-800 mt-1">{totalAssetsCount} รายการ</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-steel-200 pb-2">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'employees' ? 'bg-sky-700 text-white shadow' : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          👥 ทะเบียนพนักงาน
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'attendance' ? 'bg-sky-700 text-white shadow' : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          📍 ลงเวลา GPS & OT หน้างาน
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'leaves' ? 'bg-sky-700 text-white shadow' : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          📝 การขอลาและอนุมัติ {pendingLeaves > 0 && <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-xs">{pendingLeaves}</span>}
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
            activeTab === 'assets' ? 'bg-sky-700 text-white shadow' : 'bg-white text-steel-600 hover:bg-steel-100 border border-steel-200'
          }`}
        >
          💻 ทรัพย์สินบริษัท (รถ/คอมพิวเตอร์)
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-steel-400">กำลังโหลดข้อมูลบุคลากร...</div>
      ) : activeTab === 'employees' ? (
        /* TAB 1: ทะเบียนพนักงาน */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm">รายชื่อพนักงานประจำ ANVA & CO., LTD.</h3>
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
                  <th className="px-4 py-3">เบอร์ติดต่อ</th>
                  <th className="px-4 py-3">วันที่เริ่มงาน</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
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
                    <td className="px-4 py-3 text-xs text-steel-500 font-mono">{e.phone || '-'}</td>
                    <td className="px-4 py-3 text-xs text-steel-500">{e.start_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-medium">
                        ปฏิบัติงานปกติ
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'attendance' ? (
        /* TAB 2: ลงเวลา GPS & OT */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
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
                  <th className="px-4 py-3">พิกัด GPS หน้างานโครงการ</th>
                  <th className="px-4 py-3 text-center">OT (ชม.)</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {attendance.map((a) => (
                  <tr key={a.id} className="hover:bg-steel-50/50">
                    <td className="px-4 py-3 text-xs font-semibold text-ink">{a.work_date}</td>
                    <td className="px-4 py-3 font-medium text-ink">{a.emp_name}</td>
                    <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">{a.check_in_time}</td>
                    <td className="px-4 py-3 text-center font-mono text-sky-700 font-bold">{a.check_out_time}</td>
                    <td className="px-4 py-3 text-xs text-steel-500">📍 {a.gps_location}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-purple-700">
                      {Number(a.ot_hours) > 0 ? `+${a.ot_hours}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        a.status === 'normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {a.status === 'normal' ? 'ตรงเวลา' : 'สาย'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'leaves' ? (
        /* TAB 3: การขอลา */
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
                        {l.leave_type === 'sick' ? '🩺 ลาป่วย' : '💼 ลากิจ'}
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
                        {l.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 4: ทรัพย์สินบริษัท */
        <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 bg-steel-50 border-b border-steel-200">
            <h3 className="font-bold text-ink text-sm">ทะเบียนทรัพย์สินและอุปกรณ์ประจำตัวพนักงาน (Asset Management)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-steel-600">
              <thead className="bg-steel-50/75 text-xs font-semibold text-steel-700 border-b border-steel-200">
                <tr>
                  <th className="px-4 py-3">รหัสทรัพย์สิน</th>
                  <th className="px-4 py-3">ชื่อทรัพย์สิน / อุปกรณ์</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3">Serial No.</th>
                  <th className="px-4 py-3">ผู้ถือครอง / ผู้รับผิดชอบ</th>
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
                    <td className="px-4 py-3 text-sm text-steel-700 font-medium">👤 {ast.assigned_to}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{baht(ast.purchase_cost)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                        ใช้งานอยู่
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
