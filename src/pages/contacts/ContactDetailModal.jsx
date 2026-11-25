import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Building2, User, CreditCard, MapPin, Mail, Phone, FileText,
  Printer, ExternalLink, Calendar, CheckCircle2, Clock, Package, Edit3
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import { formatThaiDate } from '../../lib/poDueStatus'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'

export default function ContactDetailModal({ contact, onClose, onEdit }) {
  if (!contact) return null

  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'quotations' | 'pos'
  const [quotations, setQuotations] = useState([])
  const [pos, setPos] = useState([])
  const [loadingTx, setLoadingTx] = useState(true)
  const [showEnvelopeModal, setShowEnvelopeModal] = useState(false)

  const businessName = contact.business_name || contact.company_name || 'ไม่ระบุชื่อ'
  const taxId = contact.tax_id || '-'
  const branchText = contact.branch_type === 'head_office' || contact.branch_code === '00000'
    ? 'สำนักงานใหญ่ (00000)'
    : `สาขาย่อย (${contact.branch_code || 'สาขา'})`

  // โหลดประวัติธุรกรรมที่เคยทำไว้กับคู่ค้ารายนี้ (Quotations & POs)
  useEffect(() => {
    async function loadTransactions() {
      setLoadingTx(true)
      try {
        const [qRes, poRes] = await Promise.all([
          supabase
            .from('quotations')
            .select('id, quotation_no, issue_date, valid_until, grand_total, total_amount, status, customer_name, customer_po_no')
            .or(`customer_name.ilike.%${businessName}%,customer_id.eq.${contact.id}`)
            .order('issue_date', { ascending: false }),
          supabase
            .from('purchase_orders')
            .select('id, po_no, order_date, expected_delivery_date, total_amount, status, payment_type, custom_vendor_name, customer_name, vendor_name')
            .or(`vendor_id.eq.${contact.id},custom_vendor_name.ilike.%${businessName}%,customer_name.ilike.%${businessName}%`)
            .order('order_date', { ascending: false })
            .then(async (res) => {
              if (res.error) {
                const fb = await supabase
                  .from('purchase_orders')
                  .select('*')
                  .or(`vendor_id.eq.${contact.id},custom_vendor_name.ilike.%${businessName}%,customer_name.ilike.%${businessName}%`)
                  .order('order_date', { ascending: false });
                return fb;
              }
              return res;
            }),
        ])

        setQuotations(qRes.data ?? [])
        setPos(poRes.data ?? [])
      } catch (err) {
        console.warn('Error loading contact transactions:', err)
      } finally {
        setLoadingTx(false)
      }
    }

    loadTransactions()
  }, [contact.id, businessName])

  const totalQuotationValue = quotations.reduce((s, q) => s + Number(q.grand_total || q.total_amount || 0), 0)
  const totalPoValue = pos.reduce((s, p) => s + Number(p.total_amount || 0), 0)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
        <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-steel-200 overflow-hidden">
          
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between border-b border-steel-200 bg-steel-900 px-6 py-4 text-white gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-white/10 p-2.5 text-hivis">
                {contact.entity_type === 'individual' ? <User className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base sm:text-lg text-white truncate max-w-md">
                    {businessName}
                  </h3>
                  {contact.contact_code && (
                    <span className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs font-bold text-hivis">
                      {contact.contact_code}
                    </span>
                  )}
                  {contact.is_customer && (
                    <span className="rounded-full bg-sky-500/30 text-sky-200 border border-sky-400/40 px-2 py-0.5 text-[10px] font-bold">
                      ลูกค้า
                    </span>
                  )}
                  {contact.is_vendor && (
                    <span className="rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold">
                       ผู้จำหน่าย
                    </span>
                  )}
                </div>
                <div className="text-xs text-steel-400 mt-0.5 flex items-center gap-2">
                  <span>เลขผู้เสียภาษี: <b className="font-mono text-steel-200">{taxId}</b></span>
                  <span>·</span>
                  <span>{branchText}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEnvelopeModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-steel-700 bg-steel-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-steel-700 transition cursor-pointer"
                title="พิมพ์หน้าจ่าซองจดหมายถึงคู่ค้ารายนี้"
              >
                <Printer className="h-3.5 w-3.5 text-hivis" />
                <span>พิมพ์จ่าหน้าซอง</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEdit(contact)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 transition cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>แก้ไข</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-steel-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-steel-200 bg-steel-50/70 p-3 text-xs gap-2">
            <div className="px-3 border-r border-steel-200">
              <div className="text-[11px] text-steel-500">ใบเสนอราคาที่ออก (QT)</div>
              <div className="font-bold text-sm text-sky-800">{quotations.length} ใบ</div>
            </div>
            <div className="px-3 border-r border-steel-200">
              <div className="text-[11px] text-steel-500">มูลค่าเสนอราคารวม</div>
              <div className="font-bold text-sm text-sky-900">{baht(totalQuotationValue)} บ.</div>
            </div>
            <div className="px-3 border-r border-steel-200">
              <div className="text-[11px] text-steel-500">ใบสั่งซื้อที่สั่ง (PO)</div>
              <div className="font-bold text-sm text-emerald-800">{pos.length} ใบ</div>
            </div>
            <div className="px-3">
              <div className="text-[11px] text-steel-500">มูลค่าสั่งซื้อรวม</div>
              <div className="font-bold text-sm text-emerald-900">{baht(totalPoValue)} บ.</div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-steel-200 px-6 pt-3 bg-white flex items-center gap-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 transition border-b-2 cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-steel-500 hover:text-steel-800'
              }`}
            >
              ข้อมูลทั่วไป & ที่อยู่ติดต่อ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('quotations')}
              className={`pb-2.5 transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'quotations'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-steel-500 hover:text-steel-800'
              }`}
            >
              <span>ประวัติใบเสนอราคา (Quotations)</span>
              <span className="rounded-full bg-sky-100 text-sky-800 px-1.5 py-0.2 text-[10px]">{quotations.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className={`pb-2.5 transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pos'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-steel-500 hover:text-steel-800'
              }`}
            >
              <span>ประวัติใบสั่งซื้อ (Purchase Orders)</span>
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px]">{pos.length}</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 text-xs sm:text-sm">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                
                {/* ที่อยู่และช่องทางติดต่อ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* กล่องที่อยู่ */}
                  <div className="rounded-xl border border-steel-200 p-4 space-y-3 bg-white">
                    <div className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5 border-b border-steel-100 pb-2">
                      <MapPin className="h-4 w-4 text-rose-500" />
                      <span>ข้อมูลที่อยู่ (Address)</span>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-steel-500">ที่อยู่จดทะเบียนตาม ภ.พ.20:</div>
                      <div className="text-steel-800 mt-0.5 leading-relaxed font-medium">
                        {contact.registered_address || contact.address || '-'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-steel-500">ที่อยู่จัดส่งสินค้า / วางบิล:</div>
                      <div className="text-steel-800 mt-0.5 leading-relaxed font-medium">
                        {contact.shipping_address || contact.registered_address || contact.address || '-'}
                      </div>
                    </div>
                  </div>

                  {/* กล่องบุคคลผู้ประสานงาน */}
                  <div className="rounded-xl border border-steel-200 p-4 space-y-3 bg-white">
                    <div className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5 border-b border-steel-100 pb-2">
                      <User className="h-4 w-4 text-sky-500" />
                      <span>บุคคลผู้ประสานงาน (Contact Person)</span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] font-semibold text-steel-500">ชื่อผู้ติดต่อหลัก:</div>
                        <div className="text-steel-900 font-bold mt-0.5">
                          {contact.contact_person_name || contact.contact_person || '-'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-steel-500">เบอร์มือถือ:</div>
                          <div className="text-steel-800 font-medium">
                            {contact.contact_person_mobile || contact.phone || '-'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-steel-500">เบอร์สำนักงาน:</div>
                          <div className="text-steel-800 font-medium">
                            {contact.office_phone || '-'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold text-steel-500">อีเมลส่งเอกสาร:</div>
                        <div className="text-sky-700 font-medium">
                          {contact.contact_person_email || contact.email || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* บัญชีธนาคาร & เงื่อนไขทางการเงิน */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* บัญชีธนาคาร */}
                  <div className="rounded-xl border border-steel-200 p-4 space-y-3 bg-white">
                    <div className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5 border-b border-steel-100 pb-2">
                      <CreditCard className="h-4 w-4 text-emerald-600" />
                      <span>บัญชีธนาคารสำหรับโอนจ่าย (Bank Details)</span>
                    </div>

                    {contact.bank_account_no ? (
                      <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-3 text-xs space-y-1">
                        <div className="font-bold text-emerald-950 flex items-center justify-between">
                          <span> {contact.bank_name || 'ธนาคารพาณิชย์'}</span>
                          <span className="font-mono text-xs">{contact.bank_account_no}</span>
                        </div>
                        <div className="text-emerald-800">
                          ชื่อบัญชี: <b>{contact.bank_account_name || businessName}</b>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-steel-400 py-3 text-center">
                        ยังไม่มีข้อมูลบัญชีธนาคาร
                      </div>
                    )}
                  </div>

                  {/* เงื่อนไขทางการเงิน */}
                  <div className="rounded-xl border border-steel-200 p-4 space-y-3 bg-white">
                    <div className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5 border-b border-steel-100 pb-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      <span>เงื่อนไขทางการเงิน & บันทึกภายใน</span>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-steel-500">เครดิตเทอมการค้า:</div>
                      <div className="text-steel-900 font-bold mt-0.5">
                        {contact.credit_days ? `${contact.credit_days} วัน` : 'เงินสด / ชำระทันที'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-steel-500">บันทึกข้อความภายใน:</div>
                      <div className="text-steel-700 italic mt-0.5">
                        {contact.notes || '-'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* แท็บประวัติใบเสนอราคา */}
            {activeTab === 'quotations' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase text-steel-700">
                    รายการใบเสนอราคาที่เคยทำไว้กับลูกค้ารายนี้ ({quotations.length} รายการ)
                  </h4>
                  <Link
                    to="/quotations/new"
                    className="text-xs font-bold text-sky-700 hover:underline"
                  >
                    + สร้างใบเสนอราคาใหม่ให้ลูกค้ารายนี้
                  </Link>
                </div>

                {quotations.length === 0 ? (
                  <div className="py-12 text-center text-xs text-steel-400 border border-dashed rounded-xl">
                    <FileText className="mx-auto h-8 w-8 text-steel-300 mb-2" />
                    <p>ยังไม่มีประวัติใบเสนอราคากับคู่ค้ารายนี้</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-steel-200">
                    <table className="w-full text-left text-xs divide-y divide-steel-200">
                      <thead className="bg-steel-50 text-steel-700 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">เลขที่ใบเสนอราคา</th>
                          <th className="py-2.5 px-3">วันที่ออก</th>
                          <th className="py-2.5 px-3">วันครบกำหนด</th>
                          <th className="py-2.5 px-3 text-right">ยอดรวม (บาท)</th>
                          <th className="py-2.5 px-3 text-center">สถานะ</th>
                          <th className="py-2.5 px-3 text-right">ลิงก์</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100 bg-white">
                        {quotations.map((q) => (
                          <tr key={q.id} className="hover:bg-steel-50/70">
                            <td className="py-2.5 px-3 font-bold text-sky-700 font-mono">
                              <Link to={`/quotations/${q.id}`} className="hover:underline">
                                {q.quotation_no}
                              </Link>
                              {q.customer_po_no && (
                                <div className="text-[10px] text-emerald-700 font-semibold">
                                  PO: {q.customer_po_no}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-steel-600">{formatThaiDate(q.issue_date)}</td>
                            <td className="py-2.5 px-3 text-steel-600">{q.valid_until ? formatThaiDate(q.valid_until) : '-'}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-steel-900">
                              {baht(q.grand_total || q.total_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                q.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : q.status === 'sent'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-steel-100 text-steel-700'
                              }`}>
                                {q.status === 'approved' ? 'อนุมัติแล้ว' : q.status === 'sent' ? 'ส่งให้ลูกค้าแล้ว' : 'ฉบับร่าง'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Link
                                to={`/quotations/${q.id}`}
                                className="text-sky-700 hover:text-sky-900 font-semibold inline-flex items-center gap-1"
                              >
                                <span>เปิดดู</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* แท็บประวัติใบสั่งซื้อ */}
            {activeTab === 'pos' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase text-steel-700">
                    รายการใบสั่งซื้อที่เคยสั่งกับร้านค้ารายนี้ ({pos.length} รายการ)
                  </h4>
                  <Link
                    to="/purchasing/po/new"
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    + สร้างใบสั่งซื้อใหม่กับร้านนี้
                  </Link>
                </div>

                {pos.length === 0 ? (
                  <div className="py-12 text-center text-xs text-steel-400 border border-dashed rounded-xl">
                    <Package className="mx-auto h-8 w-8 text-steel-300 mb-2" />
                    <p>ยังไม่มีประวัติใบสั่งซื้อกับคู่ค้ารายนี้</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-steel-200">
                    <table className="w-full text-left text-xs divide-y divide-steel-200">
                      <thead className="bg-steel-50 text-steel-700 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">เลขที่ PO</th>
                          <th className="py-2.5 px-3">วันที่สั่งซื้อ</th>
                          <th className="py-2.5 px-3">กำหนดส่งของ</th>
                          <th className="py-2.5 px-3 text-right">ยอดรวม (บาท)</th>
                          <th className="py-2.5 px-3 text-center">สถานะรับของ</th>
                          <th className="py-2.5 px-3 text-right">ลิงก์</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100 bg-white">
                        {pos.map((p) => (
                          <tr key={p.id} className="hover:bg-steel-50/70">
                            <td className="py-2.5 px-3 font-bold text-emerald-700 font-mono">
                              <Link to={`/purchasing/po/${p.id}`} className="hover:underline">
                                {p.po_no}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-steel-600">{formatThaiDate(p.order_date)}</td>
                            <td className="py-2.5 px-3 text-steel-600">{p.expected_delivery_date ? formatThaiDate(p.expected_delivery_date) : '-'}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-steel-900">
                              {baht(p.total_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.status === 'received'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : p.status === 'partial'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {p.status === 'received' ? 'รับครบแล้ว' : p.status === 'partial' ? 'รับบางส่วน' : 'รอรับของ'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Link
                                to={`/purchasing/po/${p.id}`}
                                className="text-emerald-700 hover:text-emerald-900 font-semibold inline-flex items-center gap-1"
                              >
                                <span>เปิดดู</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-steel-200 bg-steel-50 px-6 py-3 text-xs">
            <span className="text-steel-500">
              สถานะ: <b className={contact.is_active !== false ? 'text-emerald-700' : 'text-rose-700'}>
                {contact.is_active !== false ? 'ใช้งานอยู่ (Active)' : 'ระงับ/ปิดการใช้งาน'}
              </b>
            </span>
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

      {/* พิมพ์หน้าจ่าซองจดหมายถึงคู่ค้ารายนี้ */}
      {showEnvelopeModal && (
        <EnvelopePrintModal
          contact={contact}
          onClose={() => setShowEnvelopeModal(false)}
        />
      )}
    </>
  )
}

