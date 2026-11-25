import { baht } from '../../lib/projects'
import { computePoTotals } from '../../lib/tax'
import { PAYMENT_TYPES } from '../../pages/purchasing/POForm'
import { printElement } from '../../lib/printElement'
import { Printer, X } from 'lucide-react'

export default function PODocumentModal({ po, items, onClose }) {
  if (!po) return null

  const handlePrint = () => {
    printElement('printable-report', `ใบสั่งซื้อ-${po.po_no}`)
  }

  const orderDate = po.order_date
    ? new Date(po.order_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const {
    vatRate,
    amountBeforeVat,
    vatAmount,
    whtRate,
    whtAmount,
    netPayable: netAmount,
  } = computePoTotals(po, items)

  const paymentLabel = PAYMENT_TYPES.find((p) => p.value === po.payment_type)?.label || 'เครดิตเทอม 30 วัน'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Modal Container */}
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* แถบควบคุมด้านบน (ไม่แสดงในตอนพิมพ์) */}
        <div className="no-print flex items-center justify-between border-b border-steel-200 bg-steel-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-emerald-700" />
            <span className="font-bold text-ink">พิมพ์ใบสั่งซื้อ / บันทึก PDF (PO: {po.po_no})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>พิมพ์ใบสั่งซื้อ / บันทึกเป็น PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm font-medium text-steel-700 hover:bg-steel-50 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4 Purchase Order Format) */}
        <div className="flex-1 overflow-y-auto p-8 bg-steel-50">
          <div
            id="printable-report"
            className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm border border-steel-200 rounded text-black font-sans leading-relaxed text-xs"
          >
            {/* หัวบริษัทและชื่อเอกสาร */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-lg font-bold">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
                <p className="text-xs text-neutral-600">ANVA CONSTRUCTION & ENGINEERING CO., LTD.</p>
                <p className="text-[11px] text-neutral-500 mt-1">สำนักงานใหญ่: อาคารเอ็นจิเนียริ่ง คอมเพล็กซ์ กรุงเทพมหานคร</p>
                <p className="text-[11px] text-neutral-500">เลขประจำตัวผู้เสียภาษีอากร: 0105562000000</p>
              </div>
              <div className="text-right">
                <div className="rounded border-2 border-black bg-neutral-100 px-3 py-1.5 inline-block text-center">
                  <h2 className="text-base font-extrabold uppercase tracking-wide">ใบสั่งซื้อ</h2>
                  <p className="text-[10px] font-bold">PURCHASE ORDER (PO)</p>
                </div>
                <div className="mt-2 text-xs space-y-0.5">
                  <div>เลขที่: <b className="font-mono text-sm">{po.po_no}</b></div>
                  <div>วันที่: <b>{orderDate}</b></div>
                  {po.expected_delivery_date && (
                    <div className="text-emerald-800">กำหนดส่งมอบ: <b>{po.expected_delivery_date}</b></div>
                  )}
                  {po.pr?.pr_no && <div>อ้างอิง PR: <b className="font-mono">{po.pr.pr_no}</b></div>}
                  {po.quotation_no && <div>ใบเสนอราคา: <b>{po.quotation_no}</b></div>}
                </div>
              </div>
            </div>

            {/* ข้อมูลโครงการ และ ผู้ขาย */}
            <div className="my-4 grid grid-cols-2 gap-4 rounded border border-neutral-300 p-3 text-xs">
              <div className="space-y-1">
                <span className="font-bold text-neutral-700 underline">ผู้ขาย / VENDOR:</span>
                <div className="font-bold text-sm">{po.custom_vendor_name || po.vendors?.vendor_name || '-'}</div>
                {po.vendors?.vendor_code && <div className="text-neutral-600">รหัสผู้ขาย: {po.vendors.vendor_code}</div>}
                {po.vendors?.contact_person && <div>ผู้ติดต่อ: {po.vendors.contact_person}</div>}
                {po.vendors?.phone && <div>โทรศัพท์: {po.vendors.phone}</div>}
                {po.vendors?.tax_id && <div>เลขผู้เสียภาษี: {po.vendors.tax_id}</div>}
              </div>

              <div className="space-y-1 border-l border-neutral-200 pl-4">
                <span className="font-bold text-neutral-700 underline">ส่งมอบให้โครงการ / PROJECT:</span>
                <div className="font-bold text-sm">
                  {po.custom_project_name || (po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท / สต็อกส่วนกลาง')}
                </div>
                {po.customer_name && (
                  <div className="text-neutral-800">ลูกค้า / ผู้ว่าจ้าง: <b>{po.customer_name}</b></div>
                )}
                <div className="text-neutral-600">สถานที่ส่งมอบ: {po.delivery_address || 'สโตร์หลัก / หน้างานโครงการ'}</div>
                <div className="mt-2 text-neutral-700">
                  ผู้สั่งซื้อ: <b>{po.buyer_name || po.creator?.full_name || 'เจ้าหน้าที่จัดซื้อ'}</b>
                </div>
                <div className="text-neutral-700">
                  เงื่อนไขชำระเงิน: <b>{paymentLabel}</b>
                </div>
              </div>
            </div>

            {/* ตารางรายการสินค้า */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-black bg-neutral-100 font-bold">
                  <th className="py-2 px-2 text-center w-10">ลำดับ</th>
                  <th className="py-2 px-3 text-left">รายการวัสดุ / รายละเอียด</th>
                  <th className="py-2 px-2 text-right w-20">จำนวน</th>
                  <th className="py-2 px-2 text-center w-16">หน่วย</th>
                  <th className="py-2 px-3 text-right w-24">ราคา/หน่วย</th>
                  <th className="py-2 px-3 text-right w-28">จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it, idx) => {
                  const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0)
                  return (
                    <tr key={it.id || idx} className="border-b border-neutral-200">
                      <td className="py-2 px-2 text-center text-neutral-500">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium">{it.item_name}</td>
                      <td className="py-2 px-2 text-right font-semibold">{it.quantity}</td>
                      <td className="py-2 px-2 text-center text-neutral-600">{it.unit || '-'}</td>
                      <td className="py-2 px-3 text-right">{baht(it.unit_price)}</td>
                      <td className="py-2 px-3 text-right font-semibold">{baht(lineTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-300">
                  <td colSpan={4} rowSpan={4} className="py-2 px-3 align-top border-r border-neutral-200 text-[11px] text-neutral-600 space-y-1">
                    <p className="font-bold text-black">เงื่อนไขการส่งมอบและการชำระเงิน:</p>
                    <p>1. ชำระเงิน: <b>{paymentLabel}</b></p>
                    {po.quotation_no && <p>2. ตามใบเสนอราคาเลขที่: <b>{po.quotation_no}</b> {po.quotation_date ? `ลงวันที่ ${po.quotation_date}` : ''}</p>}
                    <p>3. กรุณาแนบสำเนาใบสั่งซื้อนี้มาพร้อมกับใบส่งสินค้า / ใบแจ้งหนี้ทุกครั้ง</p>
                    {po.notes && <p>4. หมายเหตุ: <span className="font-semibold text-black">{po.notes}</span></p>}
                  </td>
                  <td className="py-1.5 px-3 text-right font-medium">มูลค่าสินค้าก่อนภาษี:</td>
                  <td className="py-1.5 px-3 text-right font-semibold">{baht(amountBeforeVat)}</td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-right text-neutral-600">ภาษีมูลค่าเพิ่ม ({vatRate}%):</td>
                  <td className="py-1 px-3 text-right text-neutral-600">{baht(vatAmount)}</td>
                </tr>
                {whtRate > 0 && (
                  <tr>
                    <td className="py-1 px-3 text-right text-amber-800">หัก ณ ที่จ่าย ({whtRate}%):</td>
                    <td className="py-1 px-3 text-right text-amber-800">- {baht(whtAmount)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-black font-bold text-sm bg-neutral-100">
                  <td className="py-2 px-3 text-right">ยอดสุทธิที่ต้องชำระ:</td>
                  <td className="py-2 px-3 text-right text-emerald-800">{baht(netAmount)}</td>
                </tr>
              </tfoot>
            </table>

            {/* ช่องลงนามอนุมัติ 4 ฝ่าย */}
            <div className="mt-14 grid grid-cols-4 gap-4 text-center text-xs">
              <div className="space-y-10">
                <div className="border-b border-dotted border-black w-4/5 mx-auto" />
                <div>
                  <p className="font-semibold">({po.buyer_name || '..................................'})</p>
                  <p className="text-[10px] text-neutral-500">ผู้สั่งซื้อ (ฝ่ายจัดซื้อ)</p>
                  <p className="text-[9px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>

              <div className="space-y-10">
                <div className="border-b border-dotted border-black w-4/5 mx-auto" />
                <div>
                  <p className="font-semibold">(..................................)</p>
                  <p className="text-[10px] text-neutral-500">ผู้ตรวจรับของ (สโตร์)</p>
                  <p className="text-[9px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>

              <div className="space-y-10">
                <div className="border-b border-dotted border-black w-4/5 mx-auto" />
                <div>
                  <p className="font-semibold">(..................................)</p>
                  <p className="text-[10px] text-neutral-500">ผู้อนุมัติสั่งซื้อ (ผู้บริหาร)</p>
                  <p className="text-[9px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>

              <div className="space-y-10">
                <div className="border-b border-dotted border-black w-4/5 mx-auto" />
                <div>
                  <p className="font-semibold">(..................................)</p>
                  <p className="text-[10px] text-neutral-500">ผู้ขายยินยอมรับคำสั่งซื้อ</p>
                  <p className="text-[9px] text-neutral-400">วันที่: ..... / ..... / .........</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
