import { baht } from '../../lib/projects'
import { formatIntQty } from '../../lib/store'
import { getCustomerApprovalDisplay } from '../../lib/salesFlowUtils'
import { printElement } from '../../lib/printElement'
import R2Image, { useFileUrl } from '../R2Image'
import { Printer, X, Edit3, ExternalLink, FileCheck, FileText } from 'lucide-react'

export default function CustomerPoPrintModal({ quotation, items = [], onClose, onEdit }) {
  if (!quotation) return null

  const approval = getCustomerApprovalDisplay(quotation)

  const handlePrint = () => {
    printElement('printable-report', `${approval.isDirectQt ? 'เอกสารอนุมัติ' : 'ใบสั่งซื้อลูกค้า'}-${approval.refNo || quotation.quotation_no}`)
  }

  const { url: fileUrl } = useFileUrl(quotation.customer_po_file_url)

  const poDateStr = quotation.customer_po_date
    ? new Date(quotation.customer_po_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : quotation.issue_date
      ? new Date(quotation.issue_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      : '-'

  const isImageFile = quotation.customer_po_file_url && (
    quotation.customer_po_file_url.startsWith('data:image') ||
    /\.(png|jpg|jpeg|webp|gif)/i.test(quotation.customer_po_file_url)
  )

  const openAttachedFile = () => {
    const target = fileUrl || quotation.customer_po_file_url
    if (target) window.open(target, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs">
      {/* Modal Container */}
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-steel-200">
        
        {/* แถบควบคุมด้านบน (ซ่อนตอนพิมพ์เด็ดขาดด้วย class no-print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 bg-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-white">
                  {approval.docTitle}
                </span>
                <span className="rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  {approval.badgeLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {approval.shortLabel} | อ้างอิงใบเสนอราคา: {quotation.quotation_no}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 transition shadow-2xs cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5 text-amber-400" />
                <span>แก้ไขข้อมูลการอนุมัติ</span>
              </button>
            )}

            {quotation.customer_po_file_url && !quotation.customer_po_file_url.includes('example.com') && (
              <button
                type="button"
                onClick={openAttachedFile}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-800 bg-sky-950/60 hover:bg-sky-900 px-3 py-1.5 text-xs font-bold text-sky-200 transition shadow-2xs cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-sky-400" />
                <span>เปิดไฟล์แนบต้นฉบับ</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-black shadow-md transition cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>พิมพ์เอกสาร PO (A4)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ส่วนเอกสารที่พิมพ์ (A4 Customer Purchase Order Format) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100">
          <div
            id="printable-report"
            className="paper-sheet mx-auto max-w-[210mm] bg-white p-6 sm:p-10 shadow-lg border border-steel-200 rounded-xl text-black font-sans leading-relaxed text-xs space-y-6"
          >
            {/* หัวบริษัทและชื่อเอกสาร */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-black pb-5">
              <div>
                <h1 className="text-lg font-black text-black">บริษัท อันวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
                <p className="text-xs text-neutral-700 font-semibold">ANVA CONSTRUCTION &amp; ENGINEERING CO., LTD.</p>
                <p className="text-[11px] text-neutral-600 mt-1">สำนักงานใหญ่: อาคารเอ็นจิเนียริ่ง คอมเพล็กซ์ กรุงเทพมหานคร | โทร 02-123-4567</p>
                <p className="text-[11px] text-neutral-600">เลขประจำตัวผู้เสียภาษีอากร: 0105562098711</p>
              </div>
              <div className="sm:text-right">
                <div className="rounded border-2 border-black bg-neutral-100 px-4 py-2 inline-block text-center">
                  <h2 className="text-base font-extrabold uppercase tracking-wider text-black">
                    {approval.isDirectQt ? 'เอกสารอนุมัติใบเสนอราคา' : 'ใบสั่งซื้อจากลูกค้า'}
                  </h2>
                  <p className="text-[10px] font-bold text-neutral-700">
                    {approval.isDirectQt ? 'CUSTOMER APPROVED QUOTATION' : 'CUSTOMER PURCHASE ORDER (PO)'}
                  </p>
                </div>
                <div className="mt-2 text-xs space-y-0.5 text-neutral-800">
                  <div>
                    {approval.isDirectQt ? 'เลขที่อ้างอิงการอนุมัติ:' : 'เลขที่ PO ลูกค้า:'}{' '}
                    <b className="font-mono text-sm text-black">{approval.refNo}</b>
                  </div>
                  <div>วันที่อนุมัติ / ออกเอกสาร: <b>{poDateStr}</b></div>
                  <div>อ้างอิงใบเสนอราคา: <b className="font-mono">{quotation.quotation_no}</b></div>
                  {quotation.projects && (
                    <div>โครงการ: <b>[{quotation.projects.project_code}] {quotation.projects.project_name}</b></div>
                  )}
                </div>
              </div>
            </div>

            {/* ข้อมูลลูกค้า & ผู้จำหน่าย (2 Boxes) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded border border-neutral-300 p-4 text-xs bg-neutral-50/70">
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 border-b border-neutral-200 pb-1 flex items-center justify-between">
                  <span>ผู้สั่งซื้อ (CUSTOMER / CLIENT):</span>
                  <span className="text-[10px] font-mono text-emerald-700 font-bold">VERIFIED</span>
                </div>
                <div className="text-sm font-extrabold text-black">{quotation.customer_name}</div>
                <div>สาขา: {quotation.customer_branch || 'สำนักงานใหญ่'}</div>
                <div>เลขประจำตัวผู้เสียภาษี: <span className="font-mono font-bold">{quotation.customer_tax_id || '-'}</span></div>
                <div>ที่อยู่: {quotation.customer_address || '-'} {quotation.customer_postal_code || ''}</div>
              </div>

              <div className="space-y-1 sm:border-l sm:border-neutral-300 sm:pl-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 border-b border-neutral-200 pb-1">
                  สั่งซื้อถึง (SUPPLIER / CONTRACTOR):
                </div>
                <div className="text-sm font-extrabold text-black">บริษัท อันวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</div>
                <div>สาขา: สำนักงานใหญ่ (00000)</div>
                <div>เลขประจำตัวผู้เสียภาษี: <span className="font-mono font-bold">0105562098711</span></div>
                <div>ระบบวิศวกรรมพลังงานแสงอาทิตย์และงานก่อสร้างครบวงจร</div>
              </div>
            </div>

            {/* ตารางรายการสินค้า / บริการ */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-neutral-300">
                <thead>
                  <tr className="border-b-2 border-black bg-neutral-100 text-neutral-800 font-bold uppercase">
                    <th className="py-2.5 px-3 text-center w-10 border-r border-neutral-300">#</th>
                    <th className="py-2.5 px-3 border-r border-neutral-300">รายการสินค้า / บริการที่สั่งซื้อ</th>
                    <th className="py-2.5 px-3 text-right w-24 border-r border-neutral-300">จำนวน</th>
                    <th className="py-2.5 px-3 text-center w-20 border-r border-neutral-300">หน่วย</th>
                    <th className="py-2.5 px-3 text-right w-28 border-r border-neutral-300">ราคา/หน่วย</th>
                    <th className="py-2.5 px-3 text-right w-32">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {(items ?? []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 text-center text-neutral-600 font-mono border-r border-neutral-200">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900 border-r border-neutral-200">{it.item_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 border-r border-neutral-200">
                        {formatIntQty(it.quantity)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-neutral-600 border-r border-neutral-200">{it.unit || 'ชุด'}</td>
                      <td className="py-2.5 px-3 text-right font-mono border-r border-neutral-200">{baht(it.unit_price || 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900">
                        {baht(it.total_amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ยอดสรุปภาษี & เงื่อนไข */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-3 border-t-2 border-black">
              <div className="text-xs text-neutral-600 space-y-1">
                <div>เงื่อนไข: ส่งมอบและติดตั้งตามรายละเอียดสัญญาและใบเสนอราคา</div>
                <div>สถานที่ส่งมอบ: {quotation.customer_address || 'หน้างานโครงการลูกค้า'}</div>
              </div>

              <div className="w-full sm:w-72 space-y-1.5 text-xs">
                <div className="flex justify-between text-neutral-700">
                  <span>รวมเป็นเงิน:</span>
                  <span className="font-mono font-semibold">{baht(quotation.subtotal || 0)}</span>
                </div>
                {Number(quotation.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-rose-600 font-medium">
                    <span>ส่วนลด:</span>
                    <span className="font-mono">-{baht(quotation.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-neutral-700">
                  <span>ภาษีมูลค่าเพิ่ม 7%:</span>
                  <span className="font-mono font-semibold">{baht(quotation.vat_amount || 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-black pt-2 border-t border-neutral-300">
                  <span>ยอดสุทธิทั้งสิ้น:</span>
                  <span className="font-mono text-base">{baht(quotation.grand_total || quotation.total_amount || 0)}</span>
                </div>
              </div>
            </div>

            {/* หลักฐานเอกสารใบสั่งซื้อของลูกค้าที่แนบไว้ */}
            {quotation.customer_po_file_url && !quotation.customer_po_file_url.includes('example.com') && (
              <div className="rounded-xl border border-neutral-300 p-4 bg-neutral-50/50 space-y-2">
                <div className="text-xs font-bold text-neutral-800 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-700" />
                    <span>หลักฐานเอกสารใบสั่งซื้อของลูกค้าที่แนบไว้:</span>
                  </span>
                  <button
                    type="button"
                    onClick={openAttachedFile}
                    className="no-print text-xs font-bold text-sky-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>เปิดไฟล์แนบต้นฉบับ ↗</span>
                  </button>
                </div>
                {isImageFile ? (
                  <div className="flex justify-center bg-white p-2 rounded-lg border border-neutral-200">
                    <R2Image
                      fileKey={quotation.customer_po_file_url}
                      alt="Customer PO Evidence"
                      className="max-h-72 max-w-full rounded object-contain shadow-2xs"
                    />
                  </div>
                ) : fileUrl ? (
                  <div className="rounded-lg overflow-hidden border border-neutral-300">
                    <iframe
                      src={fileUrl}
                      title="Customer PO PDF"
                      className="w-full h-80 rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="p-3 text-center text-neutral-600 font-mono text-xs border border-dashed border-neutral-300 rounded">
                    เอกสารแนบ: {quotation.customer_po_no} (คลิกเปิดไฟล์แนบต้นฉบับ)
                  </div>
                )}
              </div>
            )}

            {/* ช่องลงนาม 2 ฝ่าย พร้อมพิมพ์ */}
            <div className="pt-6 border-t border-neutral-300 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="space-y-4">
                <div className="text-neutral-700 font-bold">ผู้มีอำนาจลงนามของผู้สั่งซื้อ (Customer)</div>
                <div className="h-14 border-b border-dashed border-neutral-400 mx-6"></div>
                <div>
                  <div className="font-bold text-black">{quotation.customer_signer_name || quotation.customer_name}</div>
                  <div className="text-neutral-500 text-[11px] mt-0.5">
                    วันที่: {poDateStr}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-neutral-700 font-bold">ผู้รับคำสั่งซื้อ (Acknowledged &amp; Accepted By ANVA &amp; CO.)</div>
                <div className="h-14 border-b border-dashed border-neutral-400 mx-6"></div>
                <div>
                  <div className="font-bold text-black">บริษัท อันวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</div>
                  <div className="text-neutral-500 text-[11px] mt-0.5">
                    วันที่: {new Date().toLocaleDateString('th-TH')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer (ซ่อนตอนพิมพ์) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white px-6 py-4 border-t border-steel-200">
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3.5 py-2 text-xs font-bold text-steel-700 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="h-4 w-4 text-amber-600" />
                <span>แก้ไขข้อมูล / แนบไฟล์ใหม่</span>
              </button>
            )}
            {quotation.customer_po_file_url && !quotation.customer_po_file_url.includes('example.com') && (
              <button
                type="button"
                onClick={openAttachedFile}
                className="rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 px-3.5 py-2 text-xs font-bold text-sky-800 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>เปิดไฟล์แนบต้นฉบับ</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>พิมพ์เอกสาร PO</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <X className="h-4 w-4" />
              <span>ปิดหน้าต่าง</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
