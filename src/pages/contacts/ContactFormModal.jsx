import { useState, useEffect } from 'react'
import { X, Building2, User, CreditCard, MapPin, Mail, Phone, FileText, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ContactFormModal({ contact = null, initialRole = 'both', onClose, onSaved }) {
  const isEdit = Boolean(contact?.id)

  const [form, setForm] = useState({
    contact_code: '',
    entity_type: 'corporate', // 'corporate' | 'individual'
    is_customer: initialRole === 'customer' || initialRole === 'both',
    is_vendor: initialRole === 'vendor' || initialRole === 'both',
    business_name: '',
    tax_id: '',
    branch_type: 'head_office', // 'head_office' | 'branch'
    branch_code: '00000',
    location_type: 'thailand', // 'thailand' | 'international'
    registered_address: '',
    postal_code: '',
    shipping_address: '',
    office_phone: '',
    fax: '',
    website: '',
    contact_person_name: '',
    contact_person_email: '',
    contact_person_mobile: '',
    credit_days: 30,
    notes: '',
    is_active: true,

    // ข้อมูลธนาคาร
    bank_name: '',
    bank_account_no: '',
    bank_account_name: '',
    branch_name: '',
    account_type: 'savings',
  })

  const [sameAsRegistered, setSameAsRegistered] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (contact) {
      setForm({
        contact_code: contact.contact_code || '',
        entity_type: contact.entity_type || 'corporate',
        is_customer: Boolean(contact.is_customer),
        is_vendor: Boolean(contact.is_vendor),
        business_name: contact.business_name || contact.company_name || '',
        tax_id: contact.tax_id || '',
        branch_type: contact.branch_type || (contact.branch_code === '00000' ? 'head_office' : 'branch'),
        branch_code: contact.branch_code || '00000',
        location_type: contact.location_type || 'thailand',
        registered_address: contact.registered_address || contact.address || '',
        postal_code: contact.postal_code || '',
        shipping_address: contact.shipping_address || contact.address || '',
        office_phone: contact.office_phone || contact.phone || '',
        fax: contact.fax || '',
        website: contact.website || '',
        contact_person_name: contact.contact_person_name || contact.contact_person || '',
        contact_person_email: contact.contact_person_email || contact.email || '',
        contact_person_mobile: contact.contact_person_mobile || contact.phone || '',
        credit_days: contact.credit_days ?? 30,
        notes: contact.notes || '',
        is_active: contact.is_active !== false,
        bank_name: contact.bank_name || '',
        bank_account_no: contact.bank_account_no || '',
        bank_account_name: contact.bank_account_name || '',
        branch_name: '',
        account_type: 'savings',
      })
    }
  }, [contact])

  const handleChange = (field, val) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: val }
      if (field === 'registered_address' && sameAsRegistered) {
        updated.shipping_address = val
      }
      return updated
    })
  }

  const handleCopyRegisteredAddress = () => {
    setSameAsRegistered(true)
    setForm((prev) => ({ ...prev, shipping_address: prev.registered_address }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.business_name.trim()) {
      return setError('กรุณาระบุชื่อบริษัท / ชื่อร้าน / ชื่อบุคคล')
    }

    if (!form.is_customer && !form.is_vendor) {
      return setError('กรุณาเลือกบทบาทคู่ค้าอย่างน้อย 1 รายการ (เป็นลูกค้า หรือ ผู้จำหน่าย)')
    }

    // ตรวจสอบ Tax ID (ถ้ากรอก)
    if (form.tax_id.trim() && form.tax_id.replace(/\D/g, '').length !== 13) {
      return setError('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
    }

    setBusy(true)

    try {
      const payload = {
        contact_code: form.contact_code.trim() || null,
        entity_type: form.entity_type,
        is_customer: form.is_customer,
        is_vendor: form.is_vendor,
        business_name: form.business_name.trim(),
        company_name: form.business_name.trim(),
        tax_id: form.tax_id.trim() || null,
        branch_type: form.branch_type,
        branch_code: form.branch_type === 'head_office' ? '00000' : (form.branch_code || '00001'),
        location_type: form.location_type,
        registered_address: form.registered_address.trim() || null,
        postal_code: form.postal_code.trim() || null,
        shipping_address: form.shipping_address.trim() || form.registered_address.trim() || null,
        address: form.registered_address.trim() || null,
        office_phone: form.office_phone.trim() || null,
        phone: form.office_phone.trim() || form.contact_person_mobile.trim() || null,
        email: form.contact_person_email.trim() || null,
        fax: form.fax.trim() || null,
        website: form.website.trim() || null,
        contact_person: form.contact_person_name.trim() || null,
        contact_person_name: form.contact_person_name.trim() || null,
        contact_person_email: form.contact_person_email.trim() || null,
        contact_person_mobile: form.contact_person_mobile.trim() || null,
        credit_days: Number(form.credit_days) || 0,
        notes: form.notes.trim() || null,
        bank_name: form.bank_name.trim() || null,
        bank_account_no: form.bank_account_no.trim() || null,
        bank_account_name: form.bank_account_name.trim() || null,
        is_active: form.is_active,
      }

      if (isEdit) {
        const { error: updErr } = await supabase.from('contacts').update(payload).eq('id', contact.id)
        if (updErr) throw updErr
      } else {
        // Auto-generate contact code if empty
        if (!payload.contact_code) {
          const prefix = payload.is_customer && !payload.is_vendor ? 'CUST' : !payload.is_customer && payload.is_vendor ? 'VEND' : 'CONT'
          payload.contact_code = `${prefix}-${Date.now().toString().slice(-4)}`
        }
        const { error: insErr } = await supabase.from('contacts').insert([payload])
        if (insErr) throw insErr
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'บันทึกข้อมูลคู่ค้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-steel-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 bg-steel-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-white/10 p-2">
              <Building2 className="h-5 w-5 text-hivis" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {isEdit ? 'แก้ไขข้อมูลคู่ค้า / ผู้ติดต่อ' : 'เพิ่มคู่ค้า / ผู้ติดต่อใหม่'}
              </h3>
              <p className="text-xs text-steel-400">
                สถาปัตยกรรมรวมศูนย์ รองรับทั้งลูกค้า (Sales) และผู้จำหน่าย (Purchasing)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-steel-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs sm:text-sm">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ส่วนที่ 1: สถานะทางกฎหมาย และ บทบาทคู่ค้า (Legal Entity & Roles) */}
          <div className="rounded-xl border border-steel-200 bg-steel-50/70 p-4 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5">
              <span>🏷️</span>
              <span>1. การจำแนกประเภท และ บทบาทคู่ค้า (Entity & Roles)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* ประเภทนิติบุคคล / บุคคลธรรมดา */}
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  สถานะทางกฎหมาย (Legal Entity Type) *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChange('entity_type', 'corporate')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      form.entity_type === 'corporate'
                        ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                        : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>นิติบุคคล (Corporate)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange('entity_type', 'individual')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      form.entity_type === 'individual'
                        ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                        : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>บุคคลธรรมดา (Individual)</span>
                  </button>
                </div>
              </div>

              {/* ติ๊กเลือกบทบาท (is_customer / is_vendor) */}
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  บทบาทคู่ค้าในระบบ (Business Role Flags) *
                </label>
                <div className="flex items-center gap-4 pt-1.5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-steel-800">
                    <input
                      type="checkbox"
                      checked={form.is_customer}
                      onChange={(e) => handleChange('is_customer', e.target.checked)}
                      className="rounded border-steel-300 text-sky-600 focus:ring-sky-500 h-4 w-4 cursor-pointer"
                    />
                    <span>🏢 ลูกค้า (Customer)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-steel-800">
                    <input
                      type="checkbox"
                      checked={form.is_vendor}
                      onChange={(e) => handleChange('is_vendor', e.target.checked)}
                      className="rounded border-steel-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                    />
                    <span>🏪 ผู้จำหน่าย / ร้านค้า (Vendor)</span>
                  </label>
                </div>
                <span className="text-[10px] text-steel-500 mt-1 block">
                  คู่ค้ารายหนึ่งสามารถเป็นได้ทั้งลูกค้าและผู้จำหน่ายพร้อมกัน
                </span>
              </div>
            </div>
          </div>

          {/* ส่วนที่ 2: ข้อมูลระบุตัวตนและเลขภาษี (Identity & Tax Info) */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">
              🏢 2. ข้อมูลระบุตัวตนและเลขภาษี (Identity & Tax Info)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  ชื่อบริษัท / ชื่อร้านค้า / ชื่อ-สกุล *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น บริษัท เจริญโภคภัณฑ์อาหาร จำกัด (มหาชน)"
                  value={form.business_name}
                  onChange={(e) => handleChange('business_name', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  รหัสอ้างอิงภายใน (Code)
                </label>
                <input
                  type="text"
                  placeholder="เช่น C-0001 หรือ V-0001"
                  value={form.contact_code}
                  onChange={(e) => handleChange('contact_code', e.target.value)}
                  className="input text-xs font-mono w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เลขประจำตัวผู้เสียภาษี (Tax ID 13 หลัก)
                </label>
                <input
                  type="text"
                  maxLength={13}
                  placeholder="เช่น 0107537000249"
                  value={form.tax_id}
                  onChange={(e) => handleChange('tax_id', e.target.value.replace(/\D/g, ''))}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  สถานะสาขา (Branch Type)
                </label>
                <select
                  value={form.branch_type}
                  onChange={(e) => handleChange('branch_type', e.target.value)}
                  className="input text-xs w-full"
                >
                  <option value="head_office">สำนักงานใหญ่ (Head Office)</option>
                  <option value="branch">สาขาย่อย (Branch)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  รหัสสาขา 5 หลัก
                </label>
                <input
                  type="text"
                  maxLength={5}
                  placeholder="00000"
                  disabled={form.branch_type === 'head_office'}
                  value={form.branch_type === 'head_office' ? '00000' : form.branch_code}
                  onChange={(e) => handleChange('branch_code', e.target.value.replace(/\D/g, ''))}
                  className="input text-xs font-mono w-full disabled:bg-steel-100"
                />
              </div>
            </div>
          </div>

          {/* ส่วนที่ 3: ที่อยู่จดทะเบียน และ ที่อยู่จัดส่ง (Addresses) */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">
              📍 3. ข้อมูลที่อยู่และการติดต่อ (Addresses & Contact Info)
            </h4>

            <div>
              <label className="block text-xs font-semibold text-steel-700 mb-1">
                ที่อยู่จดทะเบียนตาม ภ.พ.20 / บัตรประชาชน (Registered Address)
              </label>
              <textarea
                rows={2}
                placeholder="เลขที่ อาคาร ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"
                value={form.registered_address}
                onChange={(e) => handleChange('registered_address', e.target.value)}
                className="input text-xs w-full resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-steel-700">
                ที่อยู่สำหรับจัดส่งสินค้า / วางบิล (Shipping / Billing Address)
              </label>
              <button
                type="button"
                onClick={handleCopyRegisteredAddress}
                className="text-[11px] text-sky-700 hover:underline font-semibold cursor-pointer"
              >
                📋 คัดลอกจากที่อยู่จดทะเบียน
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="ที่อยู่สำหรับจัดส่งสินค้าหรือเอกสารวางบิล (กรณีต่างจากสำนักงานใหญ่)"
              value={form.shipping_address}
              onChange={(e) => handleChange('shipping_address', e.target.value)}
              className="input text-xs w-full resize-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เบอร์โทรศัพท์สำนักงาน (Office Phone)
                </label>
                <input
                  type="text"
                  placeholder="02-xxx-xxxx"
                  value={form.office_phone}
                  onChange={(e) => handleChange('office_phone', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เว็บไซต์ (Website)
                </label>
                <input
                  type="text"
                  placeholder="www.example.com"
                  value={form.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เครดิตเทอม (วัน)
                </label>
                <input
                  type="number"
                  placeholder="30"
                  value={form.credit_days}
                  onChange={(e) => handleChange('credit_days', e.target.value)}
                  className="input text-xs w-full font-mono"
                />
              </div>
            </div>
          </div>

          {/* ส่วนที่ 4: บุคคลผู้ประสานงาน (Contact Person) */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700">
              👤 4. บุคคลผู้ประสานงาน (Primary Contact Person)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  ชื่อผู้ติดต่อหลัก (Contact Person)
                </label>
                <input
                  type="text"
                  placeholder="คุณสมชาย ประสานงาน"
                  value={form.contact_person_name}
                  onChange={(e) => handleChange('contact_person_name', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เบอร์มือถือตรง (Mobile)
                </label>
                <input
                  type="text"
                  placeholder="08x-xxx-xxxx"
                  value={form.contact_person_mobile}
                  onChange={(e) => handleChange('contact_person_mobile', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  อีเมลสำหรับส่งเอกสาร (Email)
                </label>
                <input
                  type="email"
                  placeholder="contact@company.com"
                  value={form.contact_person_email}
                  onChange={(e) => handleChange('contact_person_email', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
            </div>
          </div>

          {/* ส่วนที่ 5: บัญชีธนาคารสำหรับทำจ่าย (Bank Accounts) */}
          <div className="rounded-xl border border-steel-200 bg-steel-50/70 p-4 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-steel-700 flex items-center gap-1.5">
              <span>💳</span>
              <span>5. บัญชีธนาคารของคู่ค้า (สำหรับฝั่งจัดซื้อ/ทำจ่าย PAY)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  ชื่อธนาคาร (Bank Name)
                </label>
                <input
                  type="text"
                  placeholder="เช่น กสิกรไทย, ไทยพาณิชย์, กรุงเทพ"
                  value={form.bank_name}
                  onChange={(e) => handleChange('bank_name', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  เลขที่บัญชี (Account No.)
                </label>
                <input
                  type="text"
                  placeholder="xxx-x-xxxxx-x"
                  value={form.bank_account_no}
                  onChange={(e) => handleChange('bank_account_no', e.target.value)}
                  className="input text-xs font-mono w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-steel-700 mb-1">
                  ชื่อบัญชี (Account Name)
                </label>
                <input
                  type="text"
                  placeholder="ชื่อบัญชีรับเงิน"
                  value={form.bank_account_name}
                  onChange={(e) => handleChange('bank_account_name', e.target.value)}
                  className="input text-xs w-full"
                />
              </div>
            </div>
          </div>

          {/* บันทึกข้อความภายใน (Internal Notes) */}
          <div>
            <label className="block text-xs font-semibold text-steel-700 mb-1">
              📝 บันทึกข้อความภายใน (Internal Memo)
            </label>
            <input
              type="text"
              placeholder="หมายเหตุเพิ่มเติมเกี่ยวกับคู่ค้ารายนี้..."
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="input text-xs w-full"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-steel-200">
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
              className="rounded-xl bg-sky-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-800 transition cursor-pointer flex items-center gap-1.5"
            >
              {busy ? (
                <span>กำลังบันทึก...</span>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>{isEdit ? 'บันทึกการแก้ไข' : 'บันทึกคู่ค้า'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

