import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/roles'

// หน้าแรกชั่วคราว — ขั้นที่ 8 จะเปลี่ยนเป็นสรุปต้นทุนต่อโครงการ
export default function Dashboard() {
  const { profile } = useAuth()
  return (
    <div>
      <h1 className="text-2xl font-bold">สวัสดี {profile.full_name}</h1>
      <p className="mt-1 text-steel-500">สิทธิ์การใช้งาน: {ROLE_LABELS[profile.role]}</p>
      <div className="mt-6 rounded-lg bg-white p-5">
        <p className="font-semibold">โครงสร้างระบบพร้อมแล้ว</p>
        <p className="mt-1 text-sm text-steel-500">เลือกเมนูด้านข้างเพื่อเข้าโมดูล — แต่ละโมดูลจะทยอยเปิดใช้งานทีละขั้น</p>
      </div>
    </div>
  )
}
