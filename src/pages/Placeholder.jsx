// หน้าจองที่ของโมดูลที่ยังไม่ได้สร้าง
export default function Placeholder({ title, step }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 rounded-lg bg-white p-5 text-steel-500">โมดูลนี้จะสร้างในขั้นที่ {step}</p>
    </div>
  )
}
