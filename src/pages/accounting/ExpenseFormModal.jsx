import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ensureLegacyVendorId } from '../../lib/contactsSync'
import { baht } from '../../lib/projects'
import { FieldError, fieldErrorClass } from '../../components/FieldError'

export const EXPENSE_ACCOUNTS = [
  { code: '5110-01', name: 'ต้นทุนวัสดุก่อสร้างและอุปกรณ์', category: 'Cost of Materials' },
  { code: '5120-01', name: 'ต้นทุนค่าแรงงานก่อสร้างและหน้างาน', category: 'Direct Labor Cost' },
  { code: '5130-01', name: 'ต้นทุนค่าจ้างผู้รับเหมาช่วง', category: 'Subcontractor Cost' },
  { code: '5140-01', name: 'ต้นทุนค่าเช่าเครื่องจักรและยานพาหนะโครงการ', category: 'Machinery Rental' },
  { code: '5210-01', name: 'เงินเดือนและค่าตอบแทนพนักงาน', category: 'Salaries & Benefits' },
  { code: '5220-01', name: 'ค่าน้ำมันเชื้อเพลิงและค่าเดินทาง (Fleet Card)', category: 'Fuel & Travel' },
  { code: '5230-01', name: 'ค่าสาธารณูปโภค ค่าโทรศัพท์ และอินเทอร์เน็ต', category: 'Utilities' },
  { code: '5240-01', name: 'ค่าเสื่อมราคาและค่าตัดจำหน่าย', category: 'Depreciation' },
  { code: '5250-01', name: 'ค่าธรรมเนียมธนาคารและค่าที่ปรึกษา', category: 'Bank Charges & Fees' },
  { code: '1520-01', name: 'ยานพาหนะและเครื่องจักรกลหนัก (สินทรัพย์ถาวร)', category: 'Fixed Asset' },
  { code: '1510-01', name: 'อาคารสำนักงานและสโตร์ (สินทรัพย์ถาวร)', category: 'Fixed Asset' },
]

export const WHT_RATES = [
  { rate: 0, label: 'ไม่หักภาษี ณ ที่จ่าย (0%)', formHint: '-' },
  { rate: 1, label: '1% - ค่าขนส่ง / ค่าเบี้ยประกันวินาศภัย', formHint: 'ภ.ง.ด.3 / ภ.ง.ด.53' },
  { rate: 2, label: '2% - ค่าโฆษณา', formHint: 'ภ.ง.ด.3 / ภ.ง.ด.53' },
  { rate: 3, label: '3% - ค่าจ้างทำของ / ค่าบริการ / ผู้รับเหมา', formHint: 'ภ.ง.ด.3 / ภ.ง.ด.53' },
  { rate: 5, label: '5% - ค่าเช่าทรัพย์สิน / ยานพาหนะ', formHint: 'ภ.ง.ด.3 / ภ.ง.ด.53' },
]

export default function ExpenseFormModal({ isOpen, onClose, onSuccess, projects = [], vendors = [] }) {
  if (!isOpen) return null

  const today = new Date().toISOString().slice(0, 10)
  const defaultDocNo = `EXP${today.replace(/-/g, '').slice(0, 6)}${Math.floor(1000 + Math.random() * 9000)}`

  const [expenseNo, setExpenseNo] = useState(defaultDocNo)
  const [expenseDate, setExpenseDate] = useState(today)
  const [vendorId, setVendorId] = useState('')
  const [vendorNameCustom, setVendorNameCustom] = useState('')
  const [projectId, setProjectId] = useState('')
  const [accountCode, setAccountCode] = useState('5110-01')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('โอนเงิน')

  // แหล่งที่มาของเงิน (Payment Source)
  const [paymentSource, setPaymentSource] = useState('company_bank') // 'company_bank' | 'advance_payment'
  const [companyBankAccount, setCompanyBankAccount] = useState('1110-02') // KBANK
  const [companyBankSlipRef, setCompanyBankSlipRef] = useState('')
  const [advancePayerType, setAdvancePayerType] = useState('manager') // 'manager' | 'other'
  const [advancePayerName, setAdvancePayerName] = useState('')
  
  // Tax & Amount states
  const [subtotal, setSubtotal] = useState('')
  const [hasVat, setHasVat] = useState(true)
  const [vendorTaxInvoiceNo, setVendorTaxInvoiceNo] = useState('')
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(today)
  const [whtRate, setWhtRate] = useState(0)
  const [isAsset, setIsAsset] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})

  // Determine vendor name and juristic/natural person
  const selectedVendor = vendors.find((v) => v.id === vendorId)
  const effectiveVendorName = selectedVendor ? selectedVendor.vendor_name : vendorNameCustom
  const isJuristic = /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน/i.test(effectiveVendorName)
  const whtFormType = whtRate > 0 ? (isJuristic ? 'ภ.ง.ด.53 (นิติบุคคล)' : 'ภ.ง.ด.3 (บุคคลธรรมดา)') : null

  // Auto-switch account code if marked as asset
  useEffect(() => {
    if (isAsset) {
      if (!accountCode.startsWith('15')) {
        setAccountCode('1520-01')
      }
    } else {
      if (accountCode.startsWith('15')) {
        setAccountCode('5110-01')
      }
    }
  }, [isAsset])

  // Calculations
  const numericSubtotal = Number(subtotal) || 0
  const vatAmount = hasVat ? Math.round(numericSubtotal * 0.07 * 100) / 100 : 0
  const whtAmount = whtRate > 0 ? Math.round(numericSubtotal * (whtRate / 100) * 100) / 100 : 0
  const totalAmount = Math.round((numericSubtotal + vatAmount) * 100) / 100
  const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const newErrors = {}

    if (numericSubtotal <= 0) {
      newErrors.subtotal = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุมูลค่าก่อนภาษี)'
    }
    if (!description.trim()) {
      newErrors.description = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุรายละเอียดค่าใช้จ่าย)'
    }
    if (hasVat && !vendorTaxInvoiceNo.trim()) {
      newErrors.vendorTaxInvoiceNo = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุเลขที่ใบกำกับภาษีสำหรับ VAT 7%)'
    }
    if (paymentSource === 'advance_payment' && advancePayerType === 'other' && !advancePayerName.trim()) {
      newErrors.advancePayerName = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุชื่อผู้สำรองจ่าย)'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setError('ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)')
      return
    }

    setSaving(true)
    try {
      const isAdvance = paymentSource === 'advance_payment'
      const expStatus = isAdvance ? 'รอคืนเงินสำรองจ่าย' : 'จ่ายเงินแล้ว'
      const accStatus = isAdvance ? 'รอดำเนินการ' : 'อนุมัติแล้ว'
      const payerName = isAdvance ? (advancePayerType === 'manager' ? 'หัวหน้างานโครงการ (Project Manager)' : advancePayerName.trim()) : null

      const resolvedVendorId = selectedVendor
        ? await ensureLegacyVendorId(selectedVendor)
        : vendorId
        ? await ensureLegacyVendorId(vendorId)
        : null

      const payload = {
        expense_no: expenseNo,
        expense_date: expenseDate,
        vendor_id: resolvedVendorId || null,
        project_id: projectId || null,
        expense_category: isAsset ? 'สินทรัพย์ถาวร' : 'งานก่อสร้างและดำเนินงาน',
        account_code: accountCode,
        description: description.trim(),
        payment_method: paymentMethod,
        payment_source: paymentSource,
        company_bank_account: !isAdvance ? companyBankAccount : null,
        advance_payer_type: isAdvance ? advancePayerType : null,
        advance_payer_name: payerName,
        reimbursement_status: isAdvance ? 'รอคืนเงินสำรองจ่าย' : 'none',
        subtotal: numericSubtotal,
        vat_rate: hasVat ? 7.0 : 0.0,
        vat_amount: vatAmount,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        total_amount: totalAmount,
        vendor_tax_invoice_no: hasVat ? vendorTaxInvoiceNo.trim() : null,
        tax_invoice_date: hasVat ? taxInvoiceDate : null,
        is_asset: isAsset,
        status: expStatus,
        accounting_status: accStatus,
      }

      const { data, error: insertError } = await supabase
        .from('expenses')
        .insert(payload)
        .select()
        .single()

      if (insertError) throw insertError

      // บันทึกสมุดรายวันอัตโนมัติ (GL Posting)
      try {
        const jvDate = expenseDate || new Date().toISOString().slice(0, 10)
        const dateCompact = jvDate.replace(/-/g, '').slice(0, 6)
        const jvNo = `EXP${dateCompact}${Math.floor(1000 + Math.random() * 9000)}`

        const creditAccCode = !isAdvance ? companyBankAccount : '2160-01' // 2160-01 ค่าใช้จ่ายค้างจ่าย/เงินทดรอง
        const neededCoa = [accountCode, '1150-01', '2140-01', creditAccCode]
        const { data: coaData } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code')
          .in('account_code', neededCoa)

        const coaMap = (coaData || []).reduce((acc, c) => ({ ...acc, [c.account_code]: c.id }), {})

        const { data: jvRow } = await supabase
          .from('journal_entries')
          .insert({
            entry_no: jvNo,
            entry_date: jvDate,
            reference_type: 'EXP',
            reference_id: data.id,
            project_id: projectId || null,
            description: `บันทึกค่าใช้จ่าย ${expenseNo}: ${description.trim()} (${!isAdvance ? 'ตัดบัญชีบริษัท' : `สำรองจ่ายโดย ${payerName}`})`,
            accounting_status: accStatus,
          })
          .select()
          .single()

        if (jvRow?.id) {
          const lines = []
          // Dr. ค่าใช้จ่าย (หรือสินทรัพย์ถาวร)
          if (coaMap[accountCode]) {
            lines.push({
              journal_entry_id: jvRow.id,
              account_id: coaMap[accountCode],
              debit: numericSubtotal,
              credit: 0,
              line_description: `${description.trim()} - ${expenseNo}`,
            })
          }
          // Dr. ภาษีซื้อ (ถ้ามี)
          if (hasVat && vatAmount > 0 && coaMap['1150-01']) {
            lines.push({
              journal_entry_id: jvRow.id,
              account_id: coaMap['1150-01'],
              debit: vatAmount,
              credit: 0,
              line_description: `ภาษีซื้อ 7% - ใบกำกับภาษี ${vendorTaxInvoiceNo}`,
            })
          }
          // Cr. ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย (ถ้ามี)
          if (whtRate > 0 && whtAmount > 0 && coaMap['2140-01']) {
            lines.push({
              journal_entry_id: jvRow.id,
              account_id: coaMap['2140-01'],
              debit: 0,
              credit: whtAmount,
              line_description: `หัก ณ ที่จ่าย ${whtRate}% (${whtFormType?.split(' ')[0] || ''})`,
            })
          }
          // Cr. บัญชีธนาคารบริษัท หรือ ค่าใช้จ่ายค้างจ่าย
          if (coaMap[creditAccCode]) {
            lines.push({
              journal_entry_id: jvRow.id,
              account_id: coaMap[creditAccCode],
              debit: 0,
              credit: netPayable,
              line_description: !isAdvance ? `ตัดเงินจากบัญชีบริษัท (${creditAccCode})` : `เงินสำรองจ่ายรอคืน (${payerName})`,
            })
          }
          if (lines.length > 0) {
            await supabase.from('journal_entry_lines').insert(lines)
          }
        }
      } catch (jvErr) {
        console.warn('Auto JV warning for expense:', jvErr)
      }

      if (onSuccess) onSuccess(data)
      onClose()
    } catch (err) {
      console.error('Error creating expense:', err)
      setError(err.message || 'บันทึกค่าใช้จ่ายไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-steel-200 my-8 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold text-lg">
              </span>
            <div>
              <h3 className="font-bold text-ink text-base">
                บันทึกค่าใช้จ่ายใหม่ (New Expense - EXP)
              </h3>
              <p className="text-xs text-steel-500">
                รองรับภาษีมูลค่าเพิ่ม (VAT 7%), หัก ณ ที่จ่าย (WHT), และการลงทะเบียนสินทรัพย์ถาวร
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 text-base">
            
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Row 1: Document No, Date, Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-steel-700 block mb-1">เลขที่เอกสาร (EXP No.) *</label>
              <input
                type="text"
                required
                value={expenseNo}
                onChange={(e) => setExpenseNo(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">วันที่บันทึกค่าใช้จ่าย *</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">ช่องทางชำระเงิน *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="โอนเงิน"> โอนเงินผ่านธนาคาร</option>
                <option value="เงินสด"> เงินสด / เงินสดย่อย</option>
                <option value="เจ้าหนี้การค้า">ตั้งเจ้าหนี้การค้า (AP)</option>
              </select>
            </div>
          </div>

          {/* แหล่งที่มาของเงิน (Payment Source): โอนบัญชีบริษัท vs เงินสำรองจ่าย */}
          <div className="rounded-xl border border-steel-200 bg-steel-50/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-bold text-steel-800 text-xs flex items-center gap-1.5">
                <span></span>
                <span>แหล่งที่มาของเงิน (Payment Source) *</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentSource('company_bank')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition border ${
                    paymentSource === 'company_bank'
                      ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                      : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-100'
                  }`}
                >
                   โอน — บัญชีบริษัท
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource('advance_payment')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition border ${
                    paymentSource === 'advance_payment'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                      : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-100'
                  }`}
                >
                   เงินสำรองจ่าย (พนักงาน)
                </button>
              </div>
            </div>

            {paymentSource === 'company_bank' ? (
              <div className="p-3 bg-white rounded-lg border border-sky-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
                <div>
                  <label className="font-bold text-sky-950 block mb-1">
                    เลือกบัญชีธนาคารบริษัทที่ใช้จ่ายเงิน *
                  </label>
                  <select
                    value={companyBankAccount}
                    onChange={(e) => setCompanyBankAccount(e.target.value)}
                    className="w-full px-3 py-1.5 border border-sky-300 rounded-lg text-xs font-semibold text-ink bg-white"
                  >
                    <option value="1110-02">ธ.กสิกรไทย 045-8-12345-6 บจก. แอนวา แอนด์ โค (1110-02)</option>
                    <option value="1110-03">ธ.ไทยพาณิชย์ 123-4-56789-0 บจก. แอนวา แอนด์ โค (1110-03)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-sky-950 block mb-1">
                    เลขที่สลิปโอนเงิน / Slip Reference
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น #KBANK-982144"
                    value={companyBankSlipRef}
                    onChange={(e) => setCompanyBankSlipRef(e.target.value)}
                    className="w-full px-3 py-1.5 border border-steel-300 rounded-lg text-xs font-mono"
                  />
                  <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                     ตัดเงินจากบัญชีบริษัททันที และลงสมุดรายวัน (GL) สำเร็จ
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/70 rounded-lg border border-amber-200 space-y-2 animate-in fade-in duration-150">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-950 text-xs">
                    ระบุผู้สำรองจ่ายเงิน (Advance Payer):
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-900 text-xs">
                      <input
                        type="radio"
                        name="advancePayer"
                        checked={advancePayerType === 'manager'}
                        onChange={() => setAdvancePayerType('manager')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      หัวหน้า (Project Manager)
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-900 text-xs">
                      <input
                        type="radio"
                        name="advancePayer"
                        checked={advancePayerType === 'other'}
                        onChange={() => setAdvancePayerType('other')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      อื่นๆ (ระบุชื่อ)
                    </label>
                  </div>
                </div>

                {advancePayerType === 'other' && (
                  <div className="pt-1">
                    <input
                      type="text"
                      required={advancePayerType === 'other'}
                      placeholder="ระบุชื่อ-นามสกุล หรือตำแหน่งผู้สำรองจ่าย เช่น สมชาย ช่างไฟฟ้าหน้างาน..."
                      value={advancePayerName}
                      onChange={(e) => setAdvancePayerName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-100/70 p-2 rounded border border-amber-200 font-medium">
                  <span>⏳</span>
                  <span>ระบบจะตั้งสถานะเป็น <b>"รอคืนเงินสำรองจ่าย"</b> เพื่อให้ฝ่ายบัญชีกดปุ่ม "โอนเงินคืนสำรองจ่าย" หลังตรวจสอบ</span>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Vendor & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-steel-700 block mb-1">ผู้รับเงิน / คู่ค้า (Vendor) *</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">-- เลือกจากทะเบียนผู้จำหน่าย --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vendor_name} ({v.vendor_code || 'คู่ค้า'})
                  </option>
                ))}
              </select>
              {!vendorId && (
                <input
                  type="text"
                  placeholder="หรือพิมพ์ชื่อผู้รับเงิน / ร้านค้าโดยตรง..."
                  value={vendorNameCustom}
                  onChange={(e) => setVendorNameCustom(e.target.value)}
                  className="w-full mt-1.5 px-3 py-1.5 border border-steel-200 rounded-lg text-xs"
                />
              )}
            </div>
            <div>
              <label className="font-bold text-steel-700 block mb-1">
                ศูนย์ต้นทุนโครงการ (Project Cost Center)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">ค่าใช้จ่ายส่วนกลางบริษัท (Overhead / General)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} - {p.project_name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-steel-500 mt-0.5 block">
                เลือกโครงการเพื่อให้ต้นทุนสรุปเข้า Project P&L อัตโนมัติ
              </span>
            </div>
          </div>

          {/* Row 3: Account Code & Fixed Asset Flag */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-200">
            <div>
              <label className="font-bold text-amber-900 block mb-1">หมวดบัญชี (Chart of Account) *</label>
              <select
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-ink focus:ring-2 focus:ring-amber-500 bg-white font-medium"
              >
                {EXPENSE_ACCOUNTS.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-ink">
                <input
                  type="checkbox"
                  checked={isAsset}
                  onChange={(e) => setIsAsset(e.target.checked)}
                  className="h-4 w-4 rounded border-steel-300 text-sky-600 focus:ring-sky-500"
                />
                <span>บันทึกเป็นสินทรัพย์ถาวร (Record as Fixed Asset)</span>
              </label>
              <p className="text-[10px] text-steel-500 ml-6 mt-1">
                ทำเครื่องหมายหากเป็นการซื้อเครื่องจักร ยานพาหนะ หรืออุปกรณ์เพื่อลงทะเบียนทรัพย์สินบริษัท
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="font-bold text-steel-700 block mb-1">รายละเอียดค่าใช้จ่าย *</label>
            <input
              type="text"
              placeholder="เช่น ค่าจัดซื้อเหล็กข้ออ้อยหน้างานงวดที่ 1, ค่าน้ำมันรถโฟล์คลิฟท์..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (errors.description) setErrors((prev) => ({ ...prev, description: '' }))
              }}
              className={fieldErrorClass(errors.description, "w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500")}
            />
            <FieldError error={errors.description} />
          </div>

          {/* Tax & Amounts Section */}
          <div className="p-4 bg-steel-50 rounded-xl border border-steel-200 space-y-3">
            <h4 className="font-bold text-ink text-xs flex items-center gap-2">
              <span></span> รายละเอียดภาษีและการคำนวณเงินสุทธิ
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-steel-700 block mb-1">ยอดมูลค่าก่อนภาษี (บาท) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={subtotal}
                  onChange={(e) => {
                    setSubtotal(e.target.value)
                    if (errors.subtotal) setErrors((prev) => ({ ...prev, subtotal: '' }))
                  }}
                  className={fieldErrorClass(errors.subtotal, "w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-2 focus:ring-sky-500")}
                />
                <FieldError error={errors.subtotal} />
              </div>

              <div>
                <label className="font-bold text-steel-700 block mb-1">ภาษีมูลค่าเพิ่ม (VAT 7%)</label>
                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-steel-700">
                    <input
                      type="radio"
                      name="vatOption"
                      checked={hasVat}
                      onChange={() => setHasVat(true)}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    VAT 7% ({baht(vatAmount)} บ.)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-steel-700">
                    <input
                      type="radio"
                      name="vatOption"
                      checked={!hasVat}
                      onChange={() => setHasVat(false)}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    ไม่มี / ยกเว้น VAT
                  </label>
                </div>
              </div>

              <div>
                <label className="font-bold text-steel-700 block mb-1">
                  หัก ณ ที่จ่าย (Withholding Tax - WHT)
                </label>
                <select
                  value={whtRate}
                  onChange={(e) => setWhtRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  {WHT_RATES.map((w) => (
                    <option key={w.rate} value={w.rate}>
                      {w.label}
                    </option>
                  ))}
                </select>
                {whtFormType && (
                  <span className="text-[10px] text-sky-800 font-bold block mt-1">
                    แบบฟอร์ม: {whtFormType}
                  </span>
                )}
              </div>
            </div>

            {/* Vendor Tax Invoice Details (Required when VAT is active) */}
            {hasVat && (
              <div className="p-3 bg-sky-50/70 rounded-lg border border-sky-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
                <div>
                  <label className="font-bold text-sky-950 block mb-1">
                    เลขที่ใบกำกับภาษีอ้างอิงของผู้ขาย (Vendor Tax Inv No.) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น INV-2026-98765"
                    value={vendorTaxInvoiceNo}
                    onChange={(e) => {
                      setVendorTaxInvoiceNo(e.target.value)
                      if (errors.vendorTaxInvoiceNo) setErrors((prev) => ({ ...prev, vendorTaxInvoiceNo: '' }))
                    }}
                    className={fieldErrorClass(errors.vendorTaxInvoiceNo, "w-full px-3 py-2 border border-sky-300 rounded-lg font-mono font-semibold text-ink focus:ring-2 focus:ring-sky-500 bg-white")}
                  />
                  <FieldError error={errors.vendorTaxInvoiceNo} />
                  <span className="text-[10px] text-sky-700 mt-0.5 block">
                    ใช้บันทึกในรายงานภาษีซื้อ (ภ.พ.30)
                  </span>
                </div>
                <div>
                  <label className="font-bold text-sky-950 block mb-1">
                    วันที่ใบกำกับภาษีของผู้ขาย <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required={hasVat}
                    value={taxInvoiceDate}
                    onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-sky-300 rounded-lg text-ink focus:ring-2 focus:ring-sky-500 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Calculation Summary Box */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-steel-200 text-center">
              <div>
                <span className="text-[10px] text-steel-500 block">มูลค่าก่อนภาษี</span>
                <span className="font-mono font-bold text-ink">{baht(numericSubtotal)} บ.</span>
              </div>
              <div>
                <span className="text-[10px] text-steel-500 block">ภาษีซื้อ (7%)</span>
                <span className="font-mono font-bold text-sky-700">+{baht(vatAmount)} บ.</span>
              </div>
              <div>
                <span className="text-[10px] text-steel-500 block">หัก ณ ที่จ่าย ({whtRate}%)</span>
                <span className="font-mono font-bold text-amber-700">-{baht(whtAmount)} บ.</span>
              </div>
              <div className="bg-emerald-50 rounded-lg p-1.5 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-bold block">ยอดสุทธิจ่ายชำระ</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">{baht(netPayable)} บ.</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-steel-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-steel-300 text-steel-600 rounded-lg hover:bg-steel-50 font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : ' บันทึกค่าใช้จ่าย'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

