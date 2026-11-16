import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import QuotationPrintModal from '../../components/reports/QuotationPrintModal'

const STATUS_MAP = {
  draft: { label: 'ฉบับร่าง (Draft)', color: 'bg-steel-100 text-steel-700 border-steel-300' },
  sent: { label: 'ส่งลูกค้าแล้ว (Sent)', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  approved: { label: 'ลูกค้าอนุมัติ (Approved)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'ปฏิเสธ (Rejected)', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  expired: { label: 'หมดอายุ (Expired)', color: 'bg-amber-100 text-amber-800 border-amber-300' },
}

export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchDetail = async () => {
    setLoading(true)
    try {
      const [qRes, itemsRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, projects(id, project_code, project_name)')
          .eq('id', id)
          .single(),
        supabase
          .from('quotation_items')
          .select('*')
          .eq('quotation_id', id)
          .order('id', { ascending: true }),
      ])

      if (qRes.error) throw qRes.error
      setQuotation(qRes.data)
      setItems(itemsRes.data || [])
    } catch (err) {
      console.error('Failed to load quotation detail:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  const handleStatusChange = async (newStatus) => {
    if (!quotation) return
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', quotation.id)

      if (error) throw error
      setQuotation((prev) => ({ ...prev, status: newStatus }))
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`ยืนยันการลบใบเสนอราคา ${quotation?.quotation_no} หรือไม่? ข้อมูลจะถูกลบถาวร`)) {
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('quotations').delete().eq('id', quotation.id)
      if (error) throw error
      alert('ลบใบเสนอราคาเรียบร้อยแล้ว')
      navigate('/quotations')
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center text-steel-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-steel-300 border-t-sky-600 mb-2" />
          <p>กำลังโหลดข้อมูลใบเสนอราคา...</p>
        </div>
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="rounded-xl border border-steel-200 bg-white p-12 text-center text-steel-500">
        <p className="text-lg font-bold text-ink">ไม่พบข้อมูลใบเสนอราคา</p>
        <Link to="/quotations" className="mt-4 inline-block text-sky-600 hover:underline">
          ← กลับไปหน้ารายการใบเสนอราคา
        </Link>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[quotation.status] || {
    label: quotation.status,
    color: 'bg-steel-100 text-steel-700 border-steel-300',
  }

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/quotations"
            className="rounded-lg border border-steel-200 bg-white px-3 py-1.5 text-sm font-medium text-steel-600 hover:bg-steel-50 shadow-sm"
          >
            ← กลับ
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{quotation.quotation_no}</h1>
              <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-steel-500">
              สร้างเมื่อ: {new Date(quotation.created_at).toLocaleString('th-TH')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Switcher */}
          <select
            value={quotation.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="rounded-lg border border-steel-300 bg-white px-3 py-2 text-xs font-semibold text-steel-700 shadow-sm focus:border-sky-500 focus:outline-none"
          >
            <option value="draft">ฉบับร่าง (Draft)</option>
            <option value="sent">ส่งลูกค้าแล้ว (Sent)</option>
            <option value="approved">ลูกค้าอนุมัติ (Approved)</option>
            <option value="rejected">ปฏิเสธ (Rejected)</option>
            <option value="expired">หมดอายุ (Expired)</option>
          </select>

          {/* Edit */}
          <Link
            to={`/quotations/${quotation.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-steel-300 bg-white px-3 py-2 text-xs font-semibold text-steel-700 shadow-sm hover:bg-steel-50 transition"
          >
            <span>✏️</span>
            <span>แก้ไข</span>
          </Link>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 transition"
          >
            <span>🗑️</span>
            <span>ลบ</span>
          </button>

          {/* Print PDF Button */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-sky-800 transition"
          >
            <span>🖨️</span>
            <span>พิมพ์ใบเสนอราคา (PDF)</span>
          </button>
        </div>
      </div>

      {/* Grid: ข้อมูลหลัก 2 คอลัมน์ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* คอลัมน์ซ้าย (กว้าง 2 ส่วน): ข้อมูลลูกค้า และ โครงการ */}
        <div className="lg:col-span-2 space-y-6">
          {/* ข้อมูลลูกค้า */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🏢</span>
              <span>ข้อมูลลูกค้า (Customer Details)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-steel-400">ชื่อลูกค้า / บริษัท</div>
                <div className="font-semibold text-ink text-base mt-0.5">{quotation.customer_name}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">สำนักงาน / สาขา</div>
                <div className="font-medium text-ink mt-0.5">{quotation.customer_branch || 'สำนักงานใหญ่'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">เลขประจำตัวผู้เสียภาษี (Tax ID)</div>
                <div className="font-mono text-ink mt-0.5">{quotation.customer_tax_id || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">รหัสไปรษณีย์</div>
                <div className="font-mono text-ink mt-0.5">{quotation.customer_postal_code || '-'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-steel-400">ที่อยู่</div>
                <div className="text-steel-700 mt-0.5">{quotation.customer_address || '-'}</div>
              </div>
            </div>
          </div>

          {/* ข้อมูลโครงการและคลังสินค้า */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🏗️</span>
              <span>โครงการและคลังสินค้าอ้างอิง</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-steel-400">โครงการ (Project Link)</div>
                <div className="font-semibold text-ink mt-0.5">
                  {quotation.projects ? (
                    <span className="text-sky-700">
                      [{quotation.projects.project_code}] {quotation.projects.project_name}
                    </span>
                  ) : (
                    <span className="text-steel-500 font-normal">🏢 ของกลางบริษัท / สต็อกส่วนกลาง</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-steel-400">เลขที่อ้างอิง (Ref No.)</div>
                <div className="font-medium text-ink mt-0.5">{quotation.ref_no || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-steel-400">คลังสินค้าจ่ายวัสดุ</div>
                <div className="font-medium text-ink mt-0.5">{quotation.warehouse_name || 'สโตร์หลัก'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์ขวา (กว้าง 1 ส่วน): ข้อมูลเอกสาร & พนักงานขาย */}
        <div className="space-y-6">
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>📋</span>
              <span>ข้อมูลเอกสาร & การเงิน</span>
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">วันที่เสนอราคา:</span>
                <span className="font-semibold text-ink">{quotation.issue_date || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">กำหนดยืนราคา:</span>
                <span className="font-medium text-ink">{quotation.validity_days} วัน</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">วันครบกำหนด:</span>
                <span className="font-semibold text-amber-700">{quotation.expiry_date || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-steel-50">
                <span className="text-steel-500">พนักงานขาย:</span>
                <span className="font-semibold text-ink">👤 {quotation.sales_person || '-'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-steel-500">สกุลเงิน:</span>
                <span className="font-bold text-ink">{quotation.currency || 'THB'}</span>
              </div>
            </div>
          </div>

          {/* ลายเซ็นอิเล็กทรอนิกส์และเอกสารแนบ */}
          <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-steel-100 pb-3 mb-4">
              <span>🖋️</span>
              <span>ลายเซ็นและเอกสารแนบ</span>
            </h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-steel-400 mb-1">ลายเซ็นอิเล็กทรอนิกส์ & ตราประทับ</div>
                {quotation.signature_url ? (
                  <div className="p-2 border border-steel-200 rounded-lg bg-steel-50 flex items-center justify-center">
                    <img
                      src={quotation.signature_url}
                      alt="Signature"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-steel-400 italic bg-steel-50 p-3 rounded text-center">
                    ไม่มีลายเซ็นแนบ
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs text-steel-400 mb-1">ไฟล์แนบเอกสารทั่วไป</div>
                {quotation.attachment_url ? (
                  <a
                    href={quotation.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg border border-steel-200 bg-sky-50 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    <span>📎</span>
                    <span className="truncate">ดาวน์โหลดไฟล์แนบ</span>
                  </a>
                ) : (
                  <div className="text-xs text-steel-400 italic bg-steel-50 p-2 rounded text-center">
                    ไม่มีไฟล์แนบ
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-steel-50 px-5 py-3 border-b border-steel-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <span>📦</span>
            <span>รายการสินค้าและบริการ (Itemized Table)</span>
          </h2>
          <span className="text-xs text-steel-500 font-medium">
            ทั้งหมด {items.length} รายการ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-steel-600">
            <thead className="border-b border-steel-200 bg-steel-50/75 text-xs font-semibold text-steel-700">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">ชื่อสินค้า / รายละเอียด</th>
                <th className="px-4 py-3 text-right w-24">จำนวน</th>
                <th className="px-4 py-3 text-center w-20">หน่วย</th>
                <th className="px-4 py-3 text-right w-32">ราคาต่อหน่วย</th>
                <th className="px-4 py-3 text-right w-24">ส่วนลด (%)</th>
                <th className="px-4 py-3 text-right w-36">ราคารวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {items.map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-steel-50/50">
                  <td className="px-4 py-3 text-center text-xs text-steel-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{it.item_name}</div>
                    {it.description && (
                      <div className="text-xs text-steel-500 mt-0.5">{it.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{Number(it.quantity || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-xs text-steel-500">{it.unit || 'หน่วย'}</td>
                  <td className="px-4 py-3 text-right font-mono">{baht(it.unit_price || 0)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {Number(it.discount_percent || 0) > 0 ? (
                      <span className="text-rose-600 font-medium">{it.discount_percent}%</span>
                    ) : (
                      <span className="text-steel-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink font-mono">
                    {baht(it.total_amount || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary Calculation Panel */}
        <div className="border-t border-steel-200 bg-steel-50 p-6">
          <div className="max-w-md ml-auto space-y-2 text-sm">
            <div className="flex justify-between text-steel-600">
              <span>รวมเป็นเงิน (Subtotal):</span>
              <span className="font-mono font-medium">{baht(quotation.subtotal || 0)}</span>
            </div>
            {Number(quotation.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>ส่วนลดรวม:</span>
                <span className="font-mono font-medium">-{baht(quotation.discount_amount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-steel-600">
              <span>ราคาหลังหักส่วนลด:</span>
              <span className="font-mono font-medium">{baht(quotation.after_discount || quotation.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between text-steel-600">
              <span>ภาษีมูลค่าเพิ่ม (VAT {quotation.vat_rate || 7}%):</span>
              <span className="font-mono font-medium">+{baht(quotation.vat_amount || 0)}</span>
            </div>
            {Number(quotation.wht_amount || 0) > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>หัก ภาษี ณ ที่จ่าย ({quotation.wht_rate}%):</span>
                <span className="font-mono font-medium">-{baht(quotation.wht_amount || 0)}</span>
              </div>
            )}
            <div className="border-t border-steel-300 pt-3 flex justify-between items-center text-lg font-bold text-ink">
              <span>ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
              <span className="text-xl text-sky-700 font-mono">
                {baht(quotation.grand_total || 0)} {quotation.currency || 'THB'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Conditions & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* หมายเหตุแสดงให้ลูกค้าเห็น */}
        <div className="rounded-xl border border-steel-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-ink text-sm flex items-center gap-2 mb-2">
            <span>📝</span>
            <span>หมายเหตุและเงื่อนไข (แสดงให้ลูกค้าเห็น)</span>
          </h3>
          <div className="whitespace-pre-line text-xs text-steel-600 bg-steel-50 p-4 rounded-lg min-h-[90px] border border-steel-100">
            {quotation.customer_notes || 'ไม่มีข้อกำหนดเพิ่มเติม'}
          </div>
        </div>

        {/* โน้ตภายในบริษัท */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2 mb-2">
            <span>🔒</span>
            <span>โน้ตภายในบริษัท (ทีมงานเห็นเท่านั้น)</span>
          </h3>
          <div className="whitespace-pre-line text-xs text-amber-800 bg-amber-50 p-4 rounded-lg min-h-[90px] border border-amber-200/60">
            {quotation.internal_notes || 'ไม่มีบันทึกภายใน'}
          </div>
        </div>
      </div>

      {/* Print PDF Modal */}
      {showPrintModal && (
        <QuotationPrintModal
          quotation={quotation}
          items={items}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  )
}

