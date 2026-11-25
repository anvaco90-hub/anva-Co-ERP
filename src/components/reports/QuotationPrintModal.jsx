import { baht } from '../../lib/projects'
import { buildCustomerQuotationSummary, getCustomerPrintItems } from '../../lib/quotationPrintUtils'
import { getCustomerApprovalDisplay } from '../../lib/salesFlowUtils'
import { printElement } from '../../lib/printElement'
import R2Image from '../R2Image'

const VAT_OPTIONS = [
  { value: 'vat_excluded', label: 'มี VAT +7%' },
  { value: 'vat_included', label: 'รวม VAT 7%' },
  { value: 'vat_exempt', label: 'ไม่มี VAT' },
]

export default function QuotationPrintModal({
  quotation,
  items,
  onClose,
  onChangeTaxType = null,
  updatingVat = false,
}) {
  if (!quotation) return null

  const handlePrint = () => {
    printElement('printable-report', `ใบเสนอราคา-${quotation.quotation_no}`)
  }

  const issueDateStr = quotation.issue_date
    ? new Date(quotation.issue_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const expiryDateStr = quotation.expiry_date
    ? new Date(quotation.expiry_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-'

  const currency = quotation.currency || 'THB'
  const summary = buildCustomerQuotationSummary(quotation)
  const printableItems = getCustomerPrintItems(items)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Modal Container */}
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* แถบควบคุมด้านบน (ไม่แสดงตอนพิมพ์) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 bg-steel-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">พิมพ์ใบเสนอราคา / บันทึก PDF ({quotation.quotation_no})</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onChangeTaxType && (
              <div className="inline-flex items-center rounded-lg border border-steel-300 bg-white p-0.5 text-xs">
                <span className="px-2 font-bold text-steel-500">VAT:</span>
                {VAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={updatingVat}
                    onClick={() => onChangeTaxType(opt.value)}
                    className={`rounded-md px-2.5 py-1 font-bold transition cursor-pointer disabled:opacity-50 ${
                      summary.taxType === opt.value
                        ? 'bg-sky-700 text-white shadow-2xs'
                        : 'text-steel-600 hover:bg-steel-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-800 transition cursor-pointer"
            >
              <span>พิมพ์ใบเสนอราคา / บันทึกเป็น PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm font-medium text-steel-700 hover:bg-steel-50 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4 Standard Format — ลูกค้าเห็นเฉพาะรายการสินค้าและยอดรวมพร้อมสถานะ VAT) */}
        <div className="flex-1 overflow-y-auto p-8 bg-steel-50">
          <div
            id="printable-report"
            className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm border border-steel-200 rounded text-black font-sans leading-relaxed text-xs"
          >
            {/* หัวบริษัทและชื่อเอกสาร */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-lg font-bold">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
                <p className="text-xs text-neutral-600">ANVA CONSTRUCTION &amp; ENGINEERING CO., LTD.</p>
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
                <div>สกุลเงิน: <b>{currency}</b></div>
                {(() => {
                  const approval = getCustomerApprovalDisplay(quotation)
                  if (!approval.isApproved) return null
                  return (
                    <div className="rounded bg-emerald-50 border border-emerald-300 p-1.5 text-emerald-900 text-[11px] font-bold mt-1">
                      {approval.isDirectQt ? (
                        <span>ลูกค้าเซ็นอนุมัติตามใบเสนอราคาแล้ว</span>
                      ) : (
                        <span>เลขที่ PO ลูกค้า: <span className="font-mono">{approval.refNo}</span></span>
                      )}{' '}
                      {quotation.customer_po_date ? `(ลงวันที่ ${new Date(quotation.customer_po_date).toLocaleDateString('th-TH')})` : ''}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* ตารางรายการสินค้า (แสดงเฉพาะรายการสินค้า จำนวน และหน่วย — ซ่อนค่าแรง/บริการและราคาต้นทุน) */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-black bg-neutral-100 font-bold">
                  <th className="py-2 px-2 text-center w-12">ลำดับ</th>
                  <th className="py-2 px-3 text-left">รายการสินค้า / รายละเอียด</th>
                  <th className="py-2 px-3 text-right w-24">จำนวน</th>
                  <th className="py-2 px-3 text-center w-24">หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {printableItems.length > 0 ? (
                  printableItems.map((it, idx) => (
                    <tr key={it.id || idx} className="border-b border-neutral-200">
                      <td className="py-2.5 px-2 text-center text-neutral-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900">{it.item_name}</div>
                        {it.description && (
                          <div className="text-[10px] text-neutral-600 mt-1 whitespace-pre-line leading-relaxed">
                            {it.description}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold font-mono">
                        {Number(it.quantity || 0).toLocaleString('th-TH')}
                      </td>
                      <td className="py-2.5 px-3 text-center text-neutral-600">{it.unit || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-neutral-200">
                    <td colSpan={4} className="py-4 px-3 text-center text-neutral-500">
                      งานบริการและติดตั้งตามรายละเอียดโครงการ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ส่วนสรุปยอดรวมและเงื่อนไข (แสดงยอดรวมทั้งสิ้น พร้อมระบุชัดเจนว่ามี VAT หรือไม่มี) */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 border-t-2 border-black pt-4">
              <div className="sm:col-span-7 space-y-2.5 text-[11px] text-neutral-700 pr-2">
                <div>
                  <p className="font-bold text-black">เงื่อนไขและข้อกำหนด (Terms &amp; Conditions):</p>
                  <p className="whitespace-pre-line mt-1">{quotation.customer_notes || 'กำหนดยืนราคาตามที่ระบุในเอกสาร'}</p>
                </div>

                <div className="inline-flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs">
                  <span className="font-bold text-neutral-700">เงื่อนไขภาษีมูลค่าเพิ่ม:</span>
                  <span className="font-extrabold text-black">{summary.vatStatusLabel}</span>
                </div>
              </div>

              <div className="sm:col-span-5 rounded border border-neutral-300 bg-neutral-50/70 p-3 space-y-1.5 text-xs">
                {summary.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between gap-2 text-neutral-700">
                      <span>มูลค่ารวมก่อนส่วนลด:</span>
                      <span className="font-mono font-semibold">{baht(summary.subtotal)} {currency}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-red-700">
                      <span>ส่วนลดรวม:</span>
                      <span className="font-mono font-semibold">- {baht(summary.discountAmount)} {currency}</span>
                    </div>
                  </>
                )}

                {summary.hasVat ? (
                  <>
                    <div className="flex justify-between gap-2 text-neutral-700">
                      <span>มูลค่าสินค้า/บริการ (ก่อน VAT):</span>
                      <span className="font-mono font-semibold">{baht(summary.amountBeforeVat)} {currency}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-neutral-700">
                      <span>
                        ภาษีมูลค่าเพิ่ม (VAT {summary.vatRate}%
                        {summary.taxType === 'vat_included' ? ' รวมในยอด' : ''}):
                      </span>
                      <span className="font-mono font-semibold">
                        {summary.taxType === 'vat_included' ? '' : '+ '}{baht(summary.vatAmount)} {currency}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between gap-2 text-neutral-700">
                    <span>ภาษีมูลค่าเพิ่ม (VAT):</span>
                    <span className="font-bold">ไม่มี VAT (0%)</span>
                  </div>
                )}

                {summary.whtAmount > 0 && (
                  <div className="flex justify-between gap-2 text-amber-800">
                    <span>หัก ณ ที่จ่าย ({summary.whtRate}%):</span>
                    <span className="font-mono font-semibold">- {baht(summary.whtAmount)} {currency}</span>
                  </div>
                )}

                <div className="border-t-2 border-black pt-2 mt-2 flex justify-between items-baseline gap-2">
                  <div>
                    <div className="font-extrabold text-sm text-black">ยอดรวมทั้งสิ้น (สุทธิ)</div>
                    <div className="text-[10px] font-semibold text-neutral-600">{summary.vatShortTag}</div>
                  </div>
                  <div className="font-mono text-base font-extrabold text-sky-900 whitespace-nowrap">
                    {baht(summary.grandTotal)} {currency}
                  </div>
                </div>
              </div>
            </div>

            {/* ช่องลงนาม 2 ฝ่าย */}
            <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="rounded border border-neutral-300 p-4 space-y-4">
                <p className="font-bold text-neutral-800">ในนาม บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</p>
                <div className="h-16 flex items-center justify-center">
                  {quotation.signature_url ? (
                    <R2Image fileKey={quotation.signature_url} alt="ตราประทับ/ลายเซ็น" className="max-h-16 object-contain" />
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
