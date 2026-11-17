import { useState } from 'react'
import { baht } from '../../lib/projects'
import { Check, Copy, Share2, MessageCircle, ExternalLink, X } from 'lucide-react'

export default function QuotationShareModal({ quotation, onClose }) {
  if (!quotation) return null

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedText, setCopiedText] = useState(false)

  const qtUrl = `${window.location.origin}/quotations/${quotation.id}`
  const customerName = quotation.customer_name || 'ลูกค้า'
  const projectInfo = quotation.projects ? `${quotation.projects.project_code} ${quotation.projects.project_name}` : (quotation.ref_no || 'โครงการทั่วไป')
  const validUntilStr = quotation.valid_until || quotation.expiry_date || 'ตามเงื่อนไขในเอกสาร'
  const totalAmountStr = baht(quotation.grand_total || quotation.total_amount || 0)

  const summaryMessage = `📄 *ใบเสนอราคา (Quotation) - ANVA & Co.*
• เลขที่: ${quotation.quotation_no}
• ลูกค้า: ${customerName}
• โครงการ: ${projectInfo}
• ยอดเสนอราคารวม (VAT): ${totalAmountStr} บาท
• กำหนดยืนราคาถึง: ${validUntilStr}
${quotation.customer_po_no ? `• เลขที่ PO ลูกค้า: ${quotation.customer_po_no}\n` : ''}• ลิงก์ตรวจสอบเอกสาร: ${qtUrl}`

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2500)
      } else {
        setCopiedText(true)
        setTimeout(() => setCopiedText(false), 2500)
      }
    } catch {
      // fallback
    }
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `ใบเสนอราคา ${quotation.quotation_no} - ANVA & Co.`,
          text: summaryMessage,
          url: qtUrl,
        })
      } catch {
        // user cancelled
      }
    } else {
      copyToClipboard(qtUrl, 'link')
    }
  }

  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(summaryMessage)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-steel-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 bg-steel-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-hivis" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>แชร์ใบเสนอราคา</span>
                <span className="rounded bg-hivis px-2 py-0.5 text-[11px] font-black text-ink font-mono">
                  {quotation.quotation_no}
                </span>
              </h3>
              <p className="text-[11px] text-steel-400">ส่งต่อให้ลูกค้า ทีมงาน หรือฝ่ายจัดซื้อเพื่อเปิด PO</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-steel-400 hover:bg-steel-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Card สรุปข้อมูล */}
          <div className="rounded-xl border border-steel-200 bg-steel-50/70 p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between items-start">
              <span className="text-steel-500">ลูกค้า:</span>
              <span className="font-bold text-steel-900 text-right truncate max-w-[280px]">{customerName}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-steel-500">โครงการ:</span>
              <span className="font-semibold text-steel-800 text-right truncate max-w-[280px]">{projectInfo}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-steel-200/60">
              <span className="text-steel-600 font-semibold">ยอดเสนอราคารวม (สุทธิ):</span>
              <span className="font-black text-sm text-sky-900 font-mono">{totalAmountStr} บาท</span>
            </div>
          </div>

          {/* ช่องแชร์ 1: คัดลอกลิงก์ตรง */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-steel-700 flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-steel-500" />
              <span>ลิงก์สำหรับเปิดดูเอกสาร (Web Link)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={qtUrl}
                className="w-full rounded-xl border border-steel-300 bg-steel-50 px-3 py-2 text-xs font-mono text-steel-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(qtUrl, 'link')}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-steel-900 hover:bg-steel-800 px-3 py-2 text-xs font-bold text-hivis shadow-xs transition cursor-pointer"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? 'คัดลอกแล้ว!' : 'คัดลอก'}</span>
              </button>
            </div>
          </div>

          {/* ช่องแชร์ 2: ข้อความสรุปสำหรับแชท */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-steel-700">ข้อความสรุปใบเสนอราคา</label>
              <button
                type="button"
                onClick={() => copyToClipboard(summaryMessage, 'text')}
                className="text-xs text-sky-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedText ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedText ? 'คัดลอกข้อความแล้ว!' : 'คัดลอกทั้งหมด'}</span>
              </button>
            </div>
            <textarea
              readOnly
              rows={5}
              value={summaryMessage}
              className="w-full rounded-xl border border-steel-200 bg-steel-50 p-2.5 text-xs text-steel-800 font-sans focus:outline-none leading-relaxed"
            />
          </div>

          {/* ปุ่มแชร์ด่วน 3 ทางเลือก */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <a
              href={lineShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] py-2.5 px-3 text-xs font-bold text-white shadow-xs transition text-center"
            >
              <MessageCircle className="h-4 w-4" />
              <span>แชร์เข้า LINE</span>
            </a>

            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-steel-300 bg-white hover:bg-steel-50 py-2.5 px-3 text-xs font-bold text-steel-800 shadow-xs transition cursor-pointer"
            >
              <Share2 className="h-4 w-4 text-steel-600" />
              <span>ส่งต่อผ่านอุปกรณ์</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-steel-100 bg-steel-50/50 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-steel-300 bg-white px-4 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-100 transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  )
}

