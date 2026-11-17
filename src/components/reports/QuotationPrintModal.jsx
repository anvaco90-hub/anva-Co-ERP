import { baht } from '../../lib/projects'

export default function QuotationPrintModal({ quotation, items, onClose }) {
  if (!quotation) return null

  const handlePrint = () => {
    window.print()
  }

  const issueDateStr = quotation.issue_date
    ? new Date(quotation.issue_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const expiryDateStr = quotation.expiry_date
    ? new Date(quotation.expiry_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const currency = quotation.currency || 'THB'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Modal Container */}
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* แถบควบคุมด้านบน (ไม่แสดงตอนพิมพ์) */}
        <div className="no-print flex items-center justify-between border-b border-steel-200 bg-steel-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <span className="font-bold text-ink">พิมพ์ใบเสนอราคา / บันทึก PDF ({quotation.quotation_no})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-800 transition"
            >
              <span>🖨️</span>
              <span>พิมพ์ใบเสนอราคา / บันทึกเป็น PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm font-medium text-steel-700 hover:bg-steel-50"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4 Standard Format) */}
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
                <div className="rounded border-2 border-black bg-neutral-100 px-4 py-2 inline-block text-center">
                  <h2 className="text-base font-extrabold uppercase tracking-wider">ใบเสนอราคา</h2>
                  <p className="text-[10px] font-bold">QUOTATION</p>
                </div>
                <div className="mt-2 text-xs space-y-0.5">
                  <div>เลขที่: <b className="font-mono text-sm">{quotation.quotation_no}</b></div>
                  <div>วันที่: <b>{issueDateStr}</b></div>
                  <div>ยืนราคาถึง: <b>{expiryDateStr}</b> ({quotation.validity_days || 30} วัน)</div>
                </div>
              </div>
            </div>

            {/* ข้อมูลลูกค้า และ ข้อมูลการขาย */}
            <div className="my-4 grid grid-cols-2 gap-4 rounded border border-neutral-300 p-3 text-xs">
              <div className="space-y-1">
                <span className="font-bold text-neutral-700 underline">เรียน / CUSTOMER:</span>
                <div className="font-bold text-sm">{quotation.customer_name}</div>
                {quotation.customer_tax_id && (
                  <div>เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{quotation.customer_tax_id}</span> ({quotation.customer_branch || 'สำนักงานใหญ่'})</div>
                )}
                {quotation.customer_address && (
                  <div className="text-neutral-600">
                    ที่อยู่: {quotation.customer_address} {quotation.customer_postal_code}
                  </div>
                )}
              </div>

              <div className="space-y-1 border-l border-neutral-200 pl-4">
                <span className="font-bold text-neutral-700 underline">ข้อมูลโครงการและการเสนอราคา:</span>
                <div>โครงการ: <b>{quotation.projects ? `${quotation.projects.project_code} ${quotation.projects.project_name}` : 'ทั่วไป / ไม่ระบุโครงการ'}</b></div>
                {quotation.ref_no && <div>เลขที่อ้างอิง: <span className="font-mono font-semibold">{quotation.ref_no}</span></div>}
                <div>พนักงานขาย: <b>{quotation.sales_person || 'เจ้าหน้าที่ฝ่ายขาย'}</b></div>
                <div>สกุลเงิน: <b>{currency}</b> · คลังสินค้า: <b>{quotation.warehouse_name || 'สโตร์หลัก'}</b></div>
                {quotation.customer_po_no && (
                  <div className="rounded bg-emerald-50 border border-emerald-300 p-1.5 text-emerald-900 text-[11px] font-bold mt-1">
                    ✅ เลขที่ PO ลูกค้า: <span className="font-mono">{quotation.customer_po_no}</span> {quotation.customer_po_date ? `(ลงวันที่ ${new Date(quotation.customer_po_date).toLocaleDateString('th-TH')})` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* ตารางรายการสินค้าและบริการ */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-black bg-neutral-100 font-bold">
                  <th className="py-2 px-1 text-center w-8">ลำดับ</th>
                  <th className="py-2 px-3 text-left">รายการสินค้าและบริการ / รายละเอียด</th>
                  <th className="py-2 px-2 text-right w-16">จำนวน</th>
                  <th className="py-2 px-1 text-center w-12">หน่วย</th>
                  <th className="py-2 px-2 text-right w-20">ราคา/หน่วย</th>
                  <th className="py-2 px-1 text-right w-16">ส่วนลด</th>
                  <th className="py-2 px-3 text-right w-24">ราคารวม ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it, idx) => (
                  <tr key={it.id || idx} className="border-b border-neutral-200">
                    <td className="py-2 px-1 text-center text-neutral-500">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-neutral-900">{it.item_name}</div>
                      {it.description && (
                        <div className="text-[10px] text-neutral-600 mt-1 whitespace-pre-line leading-relaxed">
                          {it.description}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">{it.quantity}</td>
                    <td className="py-2 px-1 text-center text-neutral-600">{it.unit || '-'}</td>
                    <td className="py-2 px-2 text-right">{baht(it.unit_price)}</td>
                    <td className="py-2 px-1 text-right text-neutral-600">
                      {Number(it.discount_percent) > 0 ? `${it.discount_percent}%` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{baht(it.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-300">
                  <td colSpan={5} rowSpan={5} className="py-2 px-3 align-top border-r border-neutral-200 text-[11px] text-neutral-600 space-y-1">
                    <p className="font-bold text-black">เงื่อนไขและข้อกำหนด (Terms & Conditions):</p>
                    <p className="whitespace-pre-line">{quotation.customer_notes || 'กำหนดยืนราคาตามที่ระบุในเอกสาร'}</p>
                  </td>
                  <td className="py-1 px-2 text-right font-medium">รวมเป็นเงิน:</td>
                  <td className="py-1 px-3 text-right font-semibold">{baht(quotation.subtotal)}</td>
                </tr>
                {Number(quotation.discount_amount) > 0 && (
                  <tr>
                    <td className="py-1 px-2 text-right text-red-700">ส่วนลดรวม:</td>
                    <td className="py-1 px-3 text-right text-red-700">- {baht(quotation.discount_amount)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 px-2 text-right font-medium">ราคาหลังหักส่วนลด:</td>
                  <td className="py-1 px-3 text-right font-semibold">{baht(quotation.after_discount)}</td>
                </tr>
                <tr>
                  <td className="py-1 px-2 text-right text-neutral-600">ภาษีมูลค่าเพิ่ม ({quotation.vat_rate || 7}%):</td>
                  <td className="py-1 px-3 text-right text-neutral-600">{baht(quotation.vat_amount)}</td>
                </tr>
                {Number(quotation.wht_amount) > 0 && (
                  <tr>
                    <td className="py-1 px-2 text-right text-amber-800">หัก ณ ที่จ่าย ({quotation.wht_rate}%):</td>
                    <td className="py-1 px-3 text-right text-amber-800">- {baht(quotation.wht_amount)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-black font-bold text-sm bg-neutral-100">
                  <td colSpan={5} className="py-2 px-3 text-left">
                    จำนวนเงินทั้งสิ้น (สุทธิ)
                  </td>
                  <td className="py-2 px-2 text-right text-xs">ยอดรวมทั้งสิ้น:</td>
                  <td className="py-2 px-3 text-right text-sky-900">{baht(quotation.grand_total)} {currency}</td>
                </tr>
              </tfoot>
            </table>

            {/* ช่องลงนาม 2 ฝ่าย */}
            <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="rounded border border-neutral-300 p-4 space-y-4">
                <p className="font-bold text-neutral-800">ในนาม บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</p>
                <div className="h-16 flex items-center justify-center">
                  {quotation.signature_url ? (
                    <img src={quotation.signature_url} alt="ตราประทับ/ลายเซ็น" className="max-h-16 object-contain" />
                  ) : (
                    <div className="border-b border-dotted border-black w-3/5" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">({quotation.sales_person || 'ผู้มีอำนาจลงนาม / พนักงานขาย'})</p>
                  <p className="text-[10px] text-neutral-500">วันที่: {issueDateStr}</p>
                </div>
              </div>

              <div className="rounded border border-neutral-300 p-4 space-y-4">
                <p className="font-bold text-neutral-800">ตกลงสั่งจ้าง / สั่งซื้อตามใบเสนอราคานี้</p>
                <div className="h-16 flex items-center justify-center">
                  <div className="border-b border-dotted border-black w-3/5" />
                </div>
                <div>
                  <p className="font-semibold">(...................................................)</p>
                  <p className="text-[10px] text-neutral-500">ผู้มีอำนาจลงนาม / ประทับตราลูกค้า</p>
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

