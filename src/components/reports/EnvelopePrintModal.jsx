import { useState } from 'react'

export default function EnvelopePrintModal({ po, quotation, onClose }) {
  const doc = quotation || po
  if (!doc) return null

  const isQuotation = Boolean(quotation)
  const docBadge = isQuotation ? `QT: ${quotation.quotation_no || ''}` : `PO: ${po?.po_no || ''}`
  const docSubtitle = isQuotation
    ? 'จ่าหน้าซองจดหมายส่งใบเสนอราคา สัญญาจ้าง หรือเอกสารวางบิลถึงลูกค้า'
    : 'จ่าหน้าซองจดหมายส่งใบสั่งซื้อ เช็คชำระเงิน หรือเอกสารสัญญาถึงคู่ค้า'

  const [envelopeSize, setEnvelopeSize] = useState('c5') // 'c5' | 'dl' | 'label'
  const [senderName, setSenderName] = useState('บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด')
  const [senderAddress, setSenderAddress] = useState('อาคารเอ็นจิเนียริ่ง คอมเพล็กซ์ ถ.วิภาวดีรังสิต แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900 โทร. 02-555-8888')
  
  const defaultRecipientName = isQuotation ? (quotation.customer_name || 'ชื่อลูกค้า / บริษัทลูกค้า') : (po?.vendors?.vendor_name || 'ชื่อผู้ขาย / บริษัทคู่ค้า')
  const defaultContactPerson = isQuotation ? (quotation.customer_signer_name || quotation.contact_person || '') : (po?.vendors?.contact_person || '')
  const defaultRecipientAddress = isQuotation ? (quotation.customer_address || 'ตามที่อยู่จดทะเบียนของลูกค้า') : (po?.vendors?.address || 'ตามที่อยู่ที่ลงทะเบียนไว้กับบริษัท')
  const defaultRecipientPhone = isQuotation ? (quotation.customer_phone || '-') : (po?.vendors?.phone || '-')

  const [recipientName, setRecipientName] = useState(defaultRecipientName)
  const [contactPerson, setContactPerson] = useState(defaultContactPerson)
  const [recipientAddress, setRecipientAddress] = useState(defaultRecipientAddress)
  const [recipientPhone, setRecipientPhone] = useState(defaultRecipientPhone)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-steel-200">
        
        {/* แถบควบคุมด้านบน (ไม่แสดงเวลาสั่งพิมพ์) */}
        <div className="no-print flex flex-wrap items-center justify-between border-b border-steel-200 bg-steel-900 px-6 py-3.5 text-white gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✉️</span>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span>พิมพ์หน้าจ่าซองเอกสารจัดส่ง</span>
                <span className="rounded bg-hivis px-2 py-0.5 text-[11px] font-black text-ink font-mono">
                  {docBadge}
                </span>
              </div>
              <div className="text-[11px] text-steel-400">{docSubtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg bg-steel-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setEnvelopeSize('c5')}
                className={`rounded px-2.5 py-1 font-semibold transition ${envelopeSize === 'c5' ? 'bg-hivis text-ink font-bold' : 'text-steel-300 hover:text-white'}`}
                title="ซองจดหมาย C5 (162 x 229 มม.) พับครึ่ง A4"
              >
                ซอง C5 (มาตรฐาน)
              </button>
              <button
                type="button"
                onClick={() => setEnvelopeSize('dl')}
                className={`rounded px-2.5 py-1 font-semibold transition ${envelopeSize === 'dl' ? 'bg-hivis text-ink font-bold' : 'text-steel-300 hover:text-white'}`}
                title="ซองจดหมายยาว DL (110 x 220 มม.) พับ 3 ทบ"
              >
                ซองยาว DL
              </button>
              <button
                type="button"
                onClick={() => setEnvelopeSize('label')}
                className={`rounded px-2.5 py-1 font-semibold transition ${envelopeSize === 'label' ? 'bg-hivis text-ink font-bold' : 'text-steel-300 hover:text-white'}`}
                title="ป้ายจ่าหน้ากล่องพัสดุ / สติกเกอร์ A4"
              >
                ป้ายพัสดุ A4
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-md transition cursor-pointer"
            >
              <span>🖨️</span>
              <span>สั่งพิมพ์จ่าซอง</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-steel-700 bg-steel-800 hover:bg-steel-700 px-3 py-2 text-xs font-semibold text-steel-300 hover:text-white transition cursor-pointer"
            >
              ปิด
            </button>
          </div>
        </div>

        {/* ส่วนแก้ไขข้อมูลเบื้องต้นก่อนพิมพ์ (แสดงเฉพาะในหน้าจอ) */}
        <div className="no-print border-b border-steel-200 bg-slate-50 p-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="font-bold text-steel-700 block mb-1">ชื่อผู้รับ / บริษัทคู่ค้า (แก้ไขได้):</span>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-lg border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-steel-900 focus:outline-none focus:border-steel-800"
              />
            </div>
            <div>
              <span className="font-bold text-steel-700 block mb-1">ผู้ติดต่อ / แผนก:</span>
              <input
                type="text"
                value={contactPerson}
                placeholder="เช่น แผนกขาย หรือ ฝ่ายบัญชี"
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full rounded-lg border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-steel-900 focus:outline-none focus:border-steel-800"
              />
            </div>
            <div className="md:col-span-2">
              <span className="font-bold text-steel-700 block mb-1">ที่อยู่ผู้รับ:</span>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full rounded-lg border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-steel-900 focus:outline-none focus:border-steel-800"
              />
            </div>
          </div>
        </div>

        {/* บริเวณพรีวิวซองจดหมายที่พร้อมสั่งพิมพ์ */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-steel-100 flex items-center justify-center">
          
          <div
            id="printable-envelope"
            className={`bg-white shadow-xl border border-steel-300 text-black font-sans relative transition-all ${
              envelopeSize === 'c5'
                ? 'w-[229mm] min-h-[162mm] p-8'
                : envelopeSize === 'dl'
                ? 'w-[220mm] min-h-[110mm] p-6'
                : 'w-[210mm] min-h-[148mm] p-8'
            }`}
          >
            {/* ตราประทับไปรษณีย์ / กล่องชำระค่าฝากส่ง */}
            <div className="absolute top-6 right-8 text-right">
              <div className="inline-block border-2 border-black border-dashed px-3 py-2 text-center">
                <div className="text-[10px] font-bold tracking-widest uppercase">ชำระค่าฝากส่งเป็นรายเดือน</div>
                <div className="text-[9px] text-neutral-600">ใบอนุญาตที่ ปณ. 10900</div>
              </div>
            </div>

            {/* ส่วนผู้ส่ง (Sender) มุมซ้ายบน */}
            <div className="max-w-[100mm] border-b border-neutral-300 pb-3 text-xs leading-relaxed">
              <div className="font-bold text-neutral-500 uppercase text-[10px] tracking-wider mb-0.5">
                [ ชื่อและที่อยู่ผู้ส่ง / SENDER ]
              </div>
              <div className="font-bold text-sm text-black">{senderName}</div>
              <div className="text-neutral-700 text-[11px] mt-0.5">{senderAddress}</div>
              <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                เลขประจำตัวผู้เสียภาษี: 0105562000000
              </div>
            </div>

            {/* ส่วนผู้รับ (Recipient) กึ่งกลางค่อนไปทางขวาล่าง */}
            <div className={`mt-10 ml-auto max-w-[125mm] rounded-xl border-2 border-black bg-neutral-50/80 p-5 ${envelopeSize === 'dl' ? 'mt-4 p-4' : 'mt-8'}`}>
              <div className="font-extrabold text-neutral-800 uppercase text-[11px] tracking-wider border-b border-black pb-1 mb-2 flex items-center justify-between">
                <span>กรุณาส่ง / DELIVER TO :</span>
                <span className="font-mono text-[10px] font-bold text-neutral-600">คู่ค้า ANVA & CO.</span>
              </div>

              <div className="text-base font-extrabold text-black">
                {recipientName}
              </div>

              {contactPerson && (
                <div className="text-xs font-bold text-neutral-800 mt-1">
                  เรียน / ติดต่อ: <span className="underline">{contactPerson}</span>
                </div>
              )}

              <div className="text-xs text-neutral-800 mt-2 leading-relaxed">
                {recipientAddress}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-300 pt-2 text-[11px] font-semibold text-neutral-700">
                <span>โทรศัพท์: <b>{recipientPhone}</b></span>
                {po.vendors?.tax_id && <span>เลขประจำตัวผู้เสียภาษี: <b>{po.vendors.tax_id}</b></span>}
              </div>
            </div>

            {/* แถบเอกสารอ้างอิงด้านล่างสุด */}
            <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between border-t border-neutral-300 pt-2 text-[10px] text-neutral-600 font-mono">
              <div>
                <b>เอกสารแนบ:</b> ใบสั่งซื้อเลขที่ <b>{po.po_no}</b>
                {po.projects?.project_code && ` · โครงการ: ${po.projects.project_code} ${po.projects.project_name || ''}`}
              </div>
              <div>
                วันที่: {po.order_date || '-'} {po.expected_delivery_date ? `· กำหนดส่งมอบ: ${po.expected_delivery_date}` : ''}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

