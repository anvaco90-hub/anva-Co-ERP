import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadQuotationFile, openFile } from '../../lib/files'
import { ensureSalesInvoiceForQuotation } from '../../lib/salesBilling'
import { isQuotationDirectApproval, resolveCustomerApprovalRef } from '../../lib/salesFlowUtils'
import { X, Check, Upload, FileText, FileCheck2 } from 'lucide-react'

export default function CustomerPoModal({
  quotation,
  onClose,
  onSuccess,
  defaultAutoCreateAr = true,
}) {
  if (!quotation) return null

  const existingRef = String(quotation.customer_po_no || '').trim()
  const initialMode =
    existingRef && !isQuotationDirectApproval(existingRef, quotation.quotation_no)
      ? 'customer_po'
      : 'signed_qt'

  const [approvalMode, setApprovalMode] = useState(initialMode)
  const [customPoNo, setCustomPoNo] = useState(initialMode === 'customer_po' ? existingRef : '')
  const [customerPoDate, setCustomerPoDate] = useState(
    quotation.customer_po_date || new Date().toISOString().split('T')[0]
  )
  const [customerSignerName, setCustomerSignerName] = useState(quotation.customer_signer_name || '')
  const [customerPoFileUrl, setCustomerPoFileUrl] = useState(quotation.customer_po_file_url || '')
  const [autoCreateInvoice, setAutoCreateInvoice] = useState(defaultAutoCreateAr)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const resolvedRefNo = resolveCustomerApprovalRef({
    mode: approvalMode,
    quotationNo: quotation.quotation_no,
    customPoNo,
  })

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      let url = null
      try {
        url = await uploadQuotationFile(file)
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
    if (!resolvedRefNo) {
      alert('กรุณาระบุเลขที่ใบสั่งซื้อของลูกค้า (หรือสลับเป็นอ้างอิงเลขที่ใบเสนอราคา)')
      return
    }

    setBusy(true)
    try {
      const payload = {
        customer_po_no: resolvedRefNo,
        customer_po_date: customerPoDate || null,
        customer_signer_name: customerSignerName.trim() || null,
        customer_po_file_url: customerPoFileUrl || null,
        status: 'approved',
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('quotations').update(payload).eq('id', quotation.id)
      if (error) throw error

      const updatedQt = { ...quotation, ...payload }
      let invoiceMsg = ''
      if (autoCreateInvoice) {
        try {
          const { invoice, created } = await ensureSalesInvoiceForQuotation({
            quotation: updatedQt,
            issueDate: customerPoDate || new Date().toISOString().split('T')[0],
            customerPoNo: resolvedRefNo,
          })
          invoiceMsg = created
            ? `\n• ออกใบแจ้งหนี้ AR เลขที่ ${invoice.invoice_no} + ตั้งลูกหนี้ / ภาษีขายอัตโนมัติแล้ว`
            : `\n• เชื่อมต่อใบแจ้งหนี้ AR เดิมเลขที่ ${invoice.invoice_no} แล้ว`
        } catch (invErr) {
          console.warn('Auto create AR invoice warning:', invErr)
          invoiceMsg = '\n• หมายเหตุ: สามารถกดออกใบแจ้งหนี้ AR เพิ่มเติมในขั้นที่ 5 ได้'
        }
      }

      if (onSuccess) await onSuccess(updatedQt, invoiceMsg)
      onClose()
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-steel-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 dark:border-slate-800 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shrink-0">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                CUSTOMER APPROVAL
              </span>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <span>บันทึกการอนุมัติ / เซ็นใบเสนอราคา</span>
                <span className="rounded bg-emerald-200 px-2 py-0.5 text-[11px] font-black text-emerald-950 font-mono">
                  {quotation.quotation_no}
                </span>
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-sans">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-emerald-900 dark:text-emerald-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <span>ลูกค้า:</span>
              <span>{quotation.customer_name}</span>
            </div>
            <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
              เมื่อบันทึกการอนุมัติแล้ว ระบบจะเปลี่ยนสถานะใบเสนอราคาเป็น <b>"ลูกค้าอนุมัติ (Approved)"</b> เพื่อส่งต่อจัดซื้อ / เบิกของ / วางบิล AR ทันที
            </div>
          </div>

          {/* เลือกรูปแบบการอนุมัติ */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-steel-700 dark:text-slate-300">
              รูปแบบเอกสารที่ลูกค้ายืนยัน *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setApprovalMode('signed_qt')}
                className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                  approvalMode === 'signed_qt'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                    : 'border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold text-xs">เซ็นรับใบเสนอราคาโดยตรง</div>
                <div className="text-[10px] opacity-80 mt-0.5 font-mono">
                  ใช้รหัส {quotation.quotation_no} อัตโนมัติ
                </div>
              </button>

              <button
                type="button"
                onClick={() => setApprovalMode('customer_po')}
                className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                  approvalMode === 'customer_po'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                    : 'border-steel-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-steel-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold text-xs">ลูกค้าออกใบ PO แยก</div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  ระบุเลขที่ PO ของบริษัทลูกค้า
                </div>
              </button>
            </div>
          </div>

          {/* 1. เลขที่เอกสารอ้างอิง */}
          <div>
            <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
              {approvalMode === 'signed_qt'
                ? 'เลขที่ใบเสนอราคาที่อนุมัติ (อ้างอิงอัตโนมัติ)'
                : 'เลขที่ใบสั่งซื้อของลูกค้า (Customer PO No.) *'}
            </label>
            {approvalMode === 'signed_qt' ? (
              <div className="w-full rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-slate-800 px-3 py-2 text-sm font-mono font-bold text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                <span>{quotation.quotation_no}</span>
                <span className="text-[10px] font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                  อ้างอิงตามใบเสนอราคา
                </span>
              </div>
            ) : (
              <input
                type="text"
                required
                placeholder="เช่น PO-CUST-2026-0089"
                value={customPoNo}
                onChange={(e) => setCustomPoNo(e.target.value)}
                className="w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-steel-900 dark:text-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            )}
          </div>

          {/* 2. วันที่อนุมัติและผู้มีอำนาจลงนาม */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                วันที่ลูกค้าอนุมัติ / เซ็นรับ
              </label>
              <input
                type="date"
                value={customerPoDate}
                onChange={(e) => setCustomerPoDate(e.target.value)}
                className="w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-steel-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                ผู้ลงนาม / ผู้อนุมัติฝั่งลูกค้า
              </label>
              <input
                type="text"
                placeholder="เช่น คุณวิชัย (กรรมการผู้จัดการ)"
                value={customerSignerName}
                onChange={(e) => setCustomerSignerName(e.target.value)}
                className="w-full rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-steel-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* 3. แนบไฟล์หลักฐาน */}
          <div>
            <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
              แนบหลักฐานใบเสนอราคาที่ลูกค้าเซ็นรับ หรือใบสั่งซื้อลูกค้า (PDF / รูปภาพ)
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-steel-300 dark:border-slate-700 bg-steel-50 dark:bg-slate-800 hover:bg-steel-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-steel-700 dark:text-slate-200 cursor-pointer transition">
                <Upload className="h-3.5 w-3.5" />
                <span>{uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์อัปโหลด...'}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleUploadFile}
                  disabled={uploading || busy}
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
                  <button
                    type="button"
                    onClick={() => openFile(customerPoFileUrl)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-bold truncate max-w-[200px] cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>ดูไฟล์ที่แนบไว้</span>
                  </button>
                )
              ) : (
                <span className="text-[11px] text-steel-400">ยังไม่มีไฟล์แนบ (ไม่บังคับ)</span>
              )}
            </div>
          </div>

          {/* ตัวเลือกสร้าง AR Invoice อัตโนมัติ */}
          <label className="flex items-start gap-2 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 p-3 text-xs text-sky-900 dark:text-sky-200 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCreateInvoice}
              onChange={(e) => setAutoCreateInvoice(e.target.checked)}
              className="mt-0.5 rounded border-steel-300 text-emerald-700"
            />
            <div>
              <div className="font-bold">ออกใบแจ้งหนี้ลูกหนี้ (AR) &amp; ลงภาษีขาย ภ.พ.30 อัตโนมัติทันที</div>
              <div className="text-[11px] text-sky-700 dark:text-sky-300">
                สร้างเอกสาร INV ตั้งลูกหนี้ AR Aging, ลงสมุดรายวัน (JV) และภาษีขายตามเงื่อนไข VAT ให้อัตโนมัติ
              </div>
            </div>
          </label>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-steel-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-steel-700 dark:text-slate-200 hover:bg-steel-50 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy || uploading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{busy ? 'กำลังบันทึก...' : 'บันทึกการอนุมัติใบเสนอราคา'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
