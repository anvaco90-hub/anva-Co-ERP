import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadItemImage } from '../../lib/store'
import { X, Check, Upload, FileText } from 'lucide-react'

export default function CustomerPoModal({ quotation, onClose, onSuccess }) {
  if (!quotation) return null

  const [customerPoNo, setCustomerPoNo] = useState(quotation.customer_po_no || '')
  const [customerPoDate, setCustomerPoDate] = useState(quotation.customer_po_date || new Date().toISOString().split('T')[0])
  const [customerSignerName, setCustomerSignerName] = useState(quotation.customer_signer_name || '')
  const [customerPoFileUrl, setCustomerPoFileUrl] = useState(quotation.customer_po_file_url || '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      let url = null
      try {
        url = await uploadItemImage(file)
      } catch (err) {
        console.warn('API upload failed, using DataURL fallback:', err)
        url = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }
      setCustomerPoFileUrl(url)
    } catch {
      alert('อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!customerPoNo.trim()) {
      alert('กรุณาระบุเลขที่ใบสั่งซื้อของลูกค้า (Customer PO No.)')
      return
    }

    setBusy(true)
    try {
      const payload = {
        customer_po_no: customerPoNo.trim(),
        customer_po_date: customerPoDate || null,
        customer_signer_name: customerSignerName.trim() || null,
        customer_po_file_url: customerPoFileUrl || null,
        status: 'approved',
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('quotations').update(payload).eq('id', quotation.id)
      if (error) throw error

      if (onSuccess) onSuccess({ ...quotation, ...payload })
      onClose()
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-steel-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 bg-emerald-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>บันทึกการเซ็น PO ของลูกค้า</span>
                <span className="rounded bg-emerald-200 px-2 py-0.5 text-[11px] font-black text-emerald-950 font-mono">
                  {quotation.quotation_no}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-200">เอกสารขาย ➔ ลูกค้าเซ็นอนุมัติ PO ➔ ส่งต่อฝ่ายจัดซื้อสั่งของ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-emerald-300 hover:bg-emerald-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <span>🏢 ลูกค้า:</span>
              <span>{quotation.customer_name}</span>
            </div>
            <div className="text-[11px] text-emerald-800">
              เมื่อบันทึกข้อมูล PO ของลูกค้าแล้ว ระบบจะปรับสถานะใบเสนอราคานี้เป็น <b>"อนุมัติแล้ว (Approved)"</b> โดยอัตโนมัติ เพื่อให้ฝ่ายจัดซื้อสามารถดึงรายการไปเปิด PO สั่งของได้ทันที
            </div>
          </div>

          {/* 1. เลขที่ PO ลูกค้า */}
          <div>
            <label className="block text-xs font-bold text-steel-700 mb-1">
              เลขที่ใบสั่งซื้อของลูกค้า (Customer PO No.) *
            </label>
            <input
              type="text"
              required
              placeholder="เช่น PO-CPF-2026-088, PO-TRP-9921"
              value={customerPoNo}
              onChange={(e) => setCustomerPoNo(e.target.value)}
              className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs font-semibold text-steel-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {/* 2. วันที่ลูกค้าออก PO และผู้มีอำนาจลงนาม */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-steel-700 mb-1">
                วันที่ในใบสั่งซื้อของลูกค้า
              </label>
              <input
                type="date"
                value={customerPoDate}
                onChange={(e) => setCustomerPoDate(e.target.value)}
                className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs text-steel-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-steel-700 mb-1">
                ชื่อผู้มีอำนาจลงนามของลูกค้า
              </label>
              <input
                type="text"
                placeholder="เช่น คุณประสิทธิ์ เจริญกิจการ"
                value={customerSignerName}
                onChange={(e) => setCustomerSignerName(e.target.value)}
                className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs text-steel-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* 3. แนบไฟล์เอกสาร PO ที่เซ็นแล้ว */}
          <div>
            <label className="block text-xs font-bold text-steel-700 mb-1">
              ไฟล์ใบสั่งซื้อที่ลูกค้าเซ็นอนุมัติ (PDF หรือ รูปภาพ)
            </label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-steel-300 bg-steel-50 hover:bg-steel-100 px-3 py-2 text-xs font-semibold text-steel-700 cursor-pointer transition">
                <Upload className="h-3.5 w-3.5" />
                <span>{uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์อัปโหลด...'}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleUploadFile}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {customerPoFileUrl ? (
                customerPoFileUrl.includes('example.com') ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-800 font-semibold bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    <span>ไฟล์ตัวอย่างจำลองในระบบ</span>
                  </span>
                ) : (
                  <a
                    href={customerPoFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline font-bold truncate max-w-[200px]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>ดูไฟล์ที่แนบไว้</span>
                  </a>
                )
              ) : (
                <span className="text-[11px] text-steel-400">ยังไม่มีไฟล์แนบ</span>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-steel-100">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-steel-300 bg-white px-4 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-50 transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{busy ? 'กำลังบันทึก...' : 'บันทึกการอนุมัติ PO'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}

