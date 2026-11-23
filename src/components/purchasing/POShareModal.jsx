import { useState } from 'react'
import { baht } from '../../lib/projects'
import { formatThaiDate } from '../../lib/poDueStatus'
import { Check, Copy, Share2, MessageCircle, ExternalLink, X } from 'lucide-react'

export default function POShareModal({ po, onClose }) {
  if (!po) return null

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedText, setCopiedText] = useState(false)

  const poUrl = `${window.location.origin}/purchasing/po/${po.id}`
  const vendorName = po.vendors?.vendor_name || 'ผู้ขาย'
  const projectInfo = po.projects ? `${po.projects.project_code} ${po.projects.project_name}` : 'ของกลางบริษัท'
  const dueDateStr = po.expected_delivery_date ? formatThaiDate(po.expected_delivery_date) : 'ตามตกลง'

  const summaryMessage = `*ใบสั่งซื้อ (Purchase Order) - ANVA & Co.*
• เลขที่ PO: ${po.po_no}
• ผู้ขาย: ${vendorName}
• ส่งมอบโครงการ: ${projectInfo}
• ยอดรวม: ${baht(po.total_amount)} บาท
• กำหนดส่งมอบ: ${dueDateStr}
• ลิงก์ตรวจสอบเอกสาร: ${poUrl}`

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
          title: `ใบสั่งซื้อ ${po.po_no} - ANVA & Co.`,
          text: summaryMessage,
          url: poUrl,
        })
      } catch {
        // user cancelled share
      }
    } else {
      copyToClipboard(poUrl, 'link')
    }
  }

  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(summaryMessage)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-steel-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 bg-steel-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-hivis" />
            <div>
              <h3 className="text-base font-bold text-white">แชร์ใบสั่งซื้อ</h3>
              <p className="text-xs text-steel-400">ส่งต่อข้อมูลใบสั่งซื้อให้ผู้ขายหรือทีมงานผ่าน LINE / Email</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-steel-400 hover:bg-steel-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs sm:text-sm">
          
          {/* Card สรุปข้อมูล PO */}
          <div className="rounded-xl border border-steel-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-ink">{po.po_no}</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {baht(po.total_amount)} บาท
              </span>
            </div>
            <div className="text-xs text-steel-600">
              <b>ผู้ขาย:</b> {vendorName}
            </div>
            <div className="text-xs text-steel-600">
              <b>โครงการ:</b> {projectInfo}
            </div>
            <div className="text-xs text-steel-600">
              <b>กำหนดส่งมอบ:</b> {dueDateStr}
            </div>
          </div>

          {/* 1. คัดลอกลิงก์ตรง */}
          <div className="space-y-1.5">
            <label className="font-bold text-steel-800 text-xs flex items-center justify-between">
              <span>ลิงก์ตรงสำหรับเปิดดูเอกสาร (Web Link):</span>
              {copiedLink && <span className="text-emerald-600 font-bold flex items-center gap-1"> คัดลอกลิงก์แล้ว!</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={poUrl}
                className="w-full rounded-xl border border-steel-300 bg-steel-50 px-3 py-2 text-xs text-steel-800 font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(poUrl, 'link')}
                className="inline-flex items-center gap-1 rounded-xl bg-steel-900 hover:bg-steel-800 px-3.5 py-2 text-xs font-bold text-white transition shrink-0 cursor-pointer"
              >
                {copiedLink ? <Check className="h-4 w-4 text-hivis" /> : <Copy className="h-4 w-4" />}
                <span>{copiedLink ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
              </button>
            </div>
          </div>

          {/* 2. ข้อความสรุปสำหรับส่งในแชท / LINE */}
          <div className="space-y-1.5">
            <label className="font-bold text-steel-800 text-xs flex items-center justify-between">
              <span> ข้อความสรุปสำหรับส่งแชท (LINE / Email):</span>
              {copiedText && <span className="text-emerald-600 font-bold flex items-center gap-1"> คัดลอกข้อความแล้ว!</span>}
            </label>
            <textarea
              readOnly
              rows={5}
              value={summaryMessage}
              className="w-full rounded-xl border border-steel-300 bg-steel-50 p-3 text-xs text-steel-800 font-sans select-all focus:outline-none leading-relaxed"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyToClipboard(summaryMessage, 'text')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3 py-2 text-xs font-bold text-steel-800 transition cursor-pointer"
              >
                {copiedText ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-steel-600" />}
                <span>{copiedText ? 'คัดลอกข้อความสำเร็จ' : 'คัดลอกข้อความสรุป'}</span>
              </button>

              <a
                href={lineShareUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white transition shadow-xs"
              >
                <MessageCircle className="h-4 w-4" />
                <span>ส่งเข้าแอป LINE</span>
                <ExternalLink className="h-3 w-3 opacity-80" />
              </a>

              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 px-3.5 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer"
                >
                  <Share2 className="h-4 w-4" />
                  <span>แชร์ไปยังแอปอื่น...</span>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-steel-200 bg-steel-50 px-6 py-3 flex justify-end">
          <button
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

