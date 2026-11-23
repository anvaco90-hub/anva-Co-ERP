import { Fragment } from 'react'
import { baht } from '../../lib/projects'

export default function BOQPrintModal({ boq, items, onClose }) {
  if (!boq) return null

  const handlePrint = () => {
    window.print()
  }

  // จัดกลุ่มตามหมวดหมู่
  const grouped = (items ?? []).reduce((acc, it) => {
    const cat = it.category || 'งานทั่วไป'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(it)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden font-sans">
        {/* แถบควบคุมบน ไม่แสดงตอนพิมพ์ */}
        <div className="no-print flex items-center justify-between border-b border-steel-200 bg-steel-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl"></span>
            <span className="font-bold text-ink">พิมพ์เอกสารประมาณราคา BOQ ({boq.boq_no})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-800 transition cursor-pointer"
            >
              <span>️</span>
              <span>พิมพ์เอกสาร / บันทึก PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm font-medium text-steel-700 hover:bg-steel-50 cursor-pointer"
            >
              ปิด
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4) */}
        <div className="flex-1 overflow-y-auto p-8 bg-steel-50">
          <div
            id="printable-report"
            className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm border border-steel-200 rounded text-black leading-relaxed text-xs"
          >
            {/* หัวบริษัท */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-base font-bold">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
                <p className="text-xs text-neutral-600">ANVA CONSTRUCTION & ENGINEERING CO., LTD.</p>
                <p className="text-[11px] text-neutral-500 mt-1">บริการออกแบบ ติดตั้ง และบำรุงรักษาระบบโซล่าเซลล์ครบวงจร</p>
              </div>
              <div className="text-right">
                <div className="rounded border-2 border-black bg-neutral-100 px-4 py-2 inline-block text-center">
                  <h2 className="text-sm font-black uppercase tracking-wider">ใบถอดแบบและประมาณราคา</h2>
                  <p className="text-[10px] font-bold">BILL OF QUANTITIES (BOQ)</p>
                </div>
                <div className="mt-2 text-xs space-y-0.5">
                  <div>เลขที่: <b className="font-mono">{boq.boq_no}</b></div>
                  <div>วันที่: <b>{new Date(boq.created_at).toLocaleDateString('th-TH')}</b></div>
                  {Number(boq.system_size_kwp || 0) > 0 && (
                    <div>ขนาดติดตั้ง: <b>{Number(boq.system_size_kwp).toLocaleString()} kWp</b></div>
                  )}
                </div>
              </div>
            </div>

            {/* ข้อมูลโครงการ */}
            <div className="my-4 rounded border border-neutral-300 p-3 text-xs grid grid-cols-2 gap-4">
              <div>
                <span className="font-bold underline text-neutral-700">ชื่องาน / รายละเอียด:</span>
                <div className="font-bold text-sm mt-0.5">{boq.title}</div>
                {boq.customer_name && <div>ลูกค้า: <b>{boq.customer_name}</b></div>}
              </div>
              <div>
                <span className="font-bold underline text-neutral-700">โครงการอ้างอิง:</span>
                <div>
                  {boq.projects ? `[${boq.projects.project_code}] ${boq.projects.project_name}` : 'ทั่วไป'}
                </div>
              </div>
            </div>

            {/* ตารางแสดงรายละเอียดตามหมวด */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-black bg-neutral-100 font-bold">
                  <th className="py-2 px-1 text-center w-8">#</th>
                  <th className="py-2 px-2 text-left">รายการพัสดุและบริการ</th>
                  <th className="py-2 px-2 text-right w-16">จำนวน</th>
                  <th className="py-2 px-1 text-center w-12">หน่วย</th>
                  <th className="py-2 px-2 text-right w-20">ค่าวัสดุ/หน่วย</th>
                  <th className="py-2 px-2 text-right w-20">ค่าแรง/หน่วย</th>
                  <th className="py-2 px-2 text-right w-24">รวมเป็นเงิน</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, catItems], cIdx) => (
                  <Fragment key={category}>
                    <tr className="bg-neutral-100 font-bold border-y border-neutral-300">
                      <td colSpan={7} className="py-1.5 px-2 text-neutral-900">
                        หมวดที่ {cIdx + 1}: {category}
                      </td>
                    </tr>
                    {catItems.map((it, idx) => (
                      <tr key={it.id || idx} className="border-b border-neutral-200">
                        <td className="py-1.5 px-1 text-center text-neutral-400">{idx + 1}</td>
                        <td className="py-1.5 px-2">
                          <div className="font-semibold text-neutral-900">{it.item_name}</div>
                          {it.description && (
                            <div className="text-[10px] text-neutral-500 whitespace-pre-line leading-relaxed">
                              {it.description}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-medium">{it.quantity}</td>
                        <td className="py-1.5 px-1 text-center text-neutral-600">{it.unit}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{baht(it.material_unit_cost)}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{baht(it.labor_unit_cost)}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold">{baht(it.total_amount)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-400 font-semibold">
                  <td colSpan={6} className="py-1.5 px-2 text-right">รวมต้นทุนค่าวัสดุ:</td>
                  <td className="py-1.5 px-2 text-right font-mono">{baht(boq.total_material_cost)}</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={6} className="py-1 px-2 text-right">รวมต้นทุนค่าแรง:</td>
                  <td className="py-1 px-2 text-right font-mono">{baht(boq.total_labor_cost)}</td>
                </tr>
                <tr className="font-bold border-t border-neutral-300">
                  <td colSpan={6} className="py-1 px-2 text-right">รวมต้นทุนตรง (Direct Cost):</td>
                  <td className="py-1 px-2 text-right font-mono">{baht(boq.total_cost)}</td>
                </tr>
                <tr className="text-neutral-600">
                  <td colSpan={6} className="py-1 px-2 text-right">กำไร / มาร์กอัป ({boq.markup_percent || 15}%):</td>
                  <td className="py-1 px-2 text-right font-mono">+{baht(boq.markup_amount)}</td>
                </tr>
                <tr className="border-t-2 border-black font-black text-sm bg-neutral-100">
                  <td colSpan={5} className="py-2 px-2 text-left">ราคารวมเสนอขายทั้งสิ้น (สุทธิ)</td>
                  <td className="py-2 px-2 text-right text-xs">ยอดรวม:</td>
                  <td className="py-2 px-2 text-right font-mono text-neutral-900">{baht(boq.grand_total)} บาท</td>
                </tr>
              </tfoot>
            </table>

            {/* ช่องลงนาม */}
            <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="rounded border border-neutral-300 p-3 space-y-4">
                <p className="font-bold text-neutral-800">ผู้ถอดแบบและประมาณราคา</p>
                <div className="h-12 border-b border-dotted border-black w-3/5 mx-auto" />
                <p>(...................................................)</p>
                <p className="text-[10px] text-neutral-500">วิศวกรผู้ประมาณราคา</p>
              </div>

              <div className="rounded border border-neutral-300 p-3 space-y-4">
                <p className="font-bold text-neutral-800">ผู้อนุมัติราคาเสนอขาย</p>
                <div className="h-12 border-b border-dotted border-black w-3/5 mx-auto" />
                <p>(...................................................)</p>
                <p className="text-[10px] text-neutral-500">ผู้จัดการโครงการ / ผู้มีอำนาจลงนาม</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

