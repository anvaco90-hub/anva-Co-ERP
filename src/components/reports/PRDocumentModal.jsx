import { baht } from '../../lib/projects'

export default function PRDocumentModal({ pr, items, onClose }) {
  if (!pr) return null

  const handlePrint = () => {
    window.print()
  }

  const reqDate = pr.request_date
    ? new Date(pr.request_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const totalEstimated = (items ?? []).reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.estimated_price || 0),
    0
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* แถบควบคุมด้านบน */}
        <div className="no-print flex items-center justify-between border-b border-steel-200 bg-steel-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <span className="font-bold text-ink">พิมพ์ใบขอซื้อ / บันทึก PDF (PR: {pr.pr_no})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-700 transition"
            >
              <span>🖨️</span>
              <span>พิมพ์ใบขอซื้อ / บันทึกเป็น PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm font-medium text-steel-700 hover:bg-steel-50"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ */}
        <div className="flex-1 overflow-y-auto p-8 bg-steel-50">
          <div
            id="printable-report"
            className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm border border-steel-200 rounded text-black font-sans leading-relaxed text-xs"
          >
            {/* หัวบริษัท */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-lg font-bold">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
                <p className="text-xs text-neutral-600">ANVA CONSTRUCTION & ENGINEERING CO., LTD.</p>
                <p className="text-[11px] text-neutral-500 mt-1">ฝ่ายควบคุมงานก่อสร้างและพัสดุ</p>
              </div>
              <div className="text-right">
                <div className="rounded border-2 border-black bg-neutral-100 px-3 py-1.5 inline-block text-center">
                  <h2 className="text-base font-extrabold uppercase tracking-wide">ใบขอซื้อ</h2>
                  <p className="text-[10px] font-bold">PURCHASE REQUISITION (PR)</p>
                </div>
                <div className="mt-2 text-xs space-y-0.5">
                  <div>เลขที่: <b className="font-mono text-sm">{pr.pr_no}</b></div>
                  <div>วันที่ขอ: <b>{reqDate}</b></div>
                </div>
              </div>
            </div>

            {/* ข้อมูลโครงการ */}
            <div className="my-4 rounded border border-neutral-300 p-3 text-xs space-y-1">
              <div>โครงการ: <b className="text-sm">{pr.projects?.project_code} {pr.projects?.project_name}</b></div>
              <div>ผู้ขอซื้อ: <b>{pr.creator?.full_name || 'เจ้าหน้าที่หน้างาน / สโตร์'}</b></div>
              {pr.notes && <div>วัตถุประสงค์ / หมายเหตุ: <span className="italic">{pr.notes}</span></div>}
            </div>

            {/* ตารางรายการขอซื้อ */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-black bg-neutral-100 font-bold">
                  <th className="py-2 px-2 text-center w-10">ลำดับ</th>
                  <th className="py-2 px-3 text-left">รายการวัสดุที่ต้องการ</th>
                  <th className="py-2 px-2 text-right w-24">จำนวน</th>
                  <th className="py-2 px-2 text-center w-16">หน่วย</th>
                  <th className="py-2 px-3 text-right w-28">ราคาประมาณการ/หน่วย</th>
                  <th className="py-2 px-3 text-right w-32">รวมประมาณการ (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it, idx) => {
                  const estLine = Number(it.quantity || 0) * Number(it.estimated_price || 0)
                  return (
                    <tr key={it.id || idx} className="border-b border-neutral-200">
                      <td className="py-2 px-2 text-center text-neutral-500">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium">{it.item_name}</td>
                      <td className="py-2 px-2 text-right font-semibold">{it.quantity}</td>
                      <td className="py-2 px-2 text-center text-neutral-600">{it.unit || '-'}</td>
                      <td className="py-2 px-3 text-right">{baht(it.estimated_price)}</td>
                      <td className="py-2 px-3 text-right font-semibold">{baht(estLine)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black font-bold text-sm bg-neutral-100">
                  <td colSpan={5} className="py-2 px-3 text-right">ยอดรวมประมาณการทั้งสิ้น:</td>
                  <td className="py-2 px-3 text-right text-sky-800">{baht(totalEstimated)}</td>
                </tr>
              </tfoot>
            </table>

            {/* ช่องลงนาม */}
            <div className="mt-16 grid grid-cols-3 gap-6 text-center text-xs">
              <div className="space-y-12">
                <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                <div>
                  <p className="font-semibold">({pr.creator?.full_name || '..................................'})</p>
                  <p className="text-[11px] text-neutral-500">ผู้ขอซื้อ (หน้างาน / สโตร์)</p>
                  <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>

              <div className="space-y-12">
                <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                <div>
                  <p className="font-semibold">(..................................)</p>
                  <p className="text-[11px] text-neutral-500">ผู้ตรวจสอบ (ฝ่ายจัดซื้อ)</p>
                  <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>

              <div className="space-y-12">
                <div className="border-b border-dotted border-black w-3/4 mx-auto" />
                <div>
                  <p className="font-semibold">(..................................)</p>
                  <p className="text-[11px] text-neutral-500">ผู้มีอำนาจอนุมัติ (ผู้บริหาร)</p>
                  <p className="text-[10px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

