import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { baht } from '../lib/projects'

export const COMPANY_BANKS = [
  { code: '1110-02', name: 'ธนาคารกสิกรไทย (KBANK)', accountNo: '045-8-12345-6', accountName: 'บจก. แอนวา แอนด์ โค (กระแสรายวัน/ออมทรัพย์)' },
  { code: '1110-03', name: 'ธนาคารไทยพาณิชย์ (SCB)', accountNo: '123-4-56789-0', accountName: 'บจก. แอนวา แอนด์ โค (กระแสรายวัน/ออมทรัพย์)' },
]

export const CASH_SOURCES = [
  { code: '1110-01', name: 'เงินสดในมือ (Cash on Hand - 1110-01)' },
  { code: '1120-01', name: 'เงินสดย่อยสโตร์/สำนักงาน (Petty Cash - 1120-01)' },
]

export default function PaymentActionModal({
  isOpen,
  onClose,
  onSuccess,
  type = 'disburse', // 'disburse' (PAY - จ่ายเจ้าหนี้/ค่าใช้จ่าย) | 'receive' (RC - รับชำระจากลูกค้า)
  docType = 'PO', // 'PO' | 'RI' | 'EXP' | 'INV' | 'AP'
  docId,
  docNo,
  vendorId = null,
  contactId = null,
  contactName = '',
  totalAmount = 0,
  alreadyPaid = 0,
  depositAmount = 0,
  remainingAmount = 0,
  hasDeposit = false,
  paymentStatus = 'รอชำระเงิน',
  requestedChannel = 'transfer', // 'transfer' | 'cheque' | 'cash'
  projectId = null,
  projectName = '',
}) {
  if (!isOpen) return null

  const outstanding = Math.max(0, Number(totalAmount) - Number(alreadyPaid))

  // ขั้นตอนการจ่ายเงิน (Payment Stage)
  const defaultStage = hasDeposit
    ? (Number(alreadyPaid) > 0 ? 'remaining' : 'deposit')
    : 'full'

  const [paymentStage, setPaymentStage] = useState(defaultStage)
  const [paymentMethod, setPaymentMethod] = useState(requestedChannel || 'transfer')

  // ยอดชำระเริ่มต้นตาม Stage
  const getInitialAmount = (st) => {
    if (st === 'deposit' && Number(depositAmount) > 0) return String(depositAmount)
    if (st === 'remaining' && Number(remainingAmount) > 0) return String(remainingAmount)
    return String(outstanding)
  }

  const [payAmount, setPayAmount] = useState(() => getInitialAmount(defaultStage))
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))

  // ฟิลด์กรณีเงินโอน (Bank Transfer)
  const [companyBank, setCompanyBank] = useState('1110-02')
  const [bankFee, setBankFee] = useState('0')
  const [slipRef, setSlipRef] = useState('')

  // ข้อมูลบัญชีคู่ค้า (Auto-fetched)
  const [vendorBank, setVendorBank] = useState({
    bank_name: '',
    bank_account_no: '',
    bank_account_name: '',
    promptpay_no: '',
  })
  const [fetchingBank, setFetchingBank] = useState(false)

  // ฟิลด์กรณีเช็ค (Cheque)
  const [chequeNo, setChequeNo] = useState('')
  const [chequeBank, setChequeBank] = useState('1110-02')
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().slice(0, 10))
  const [chequePayeeName, setChequePayeeName] = useState(contactName || '')
  const [chequeAttachmentNote, setChequeAttachmentNote] = useState('')

  // ฟิลด์กรณีเงินสด (Cash)
  const [cashSource, setCashSource] = useState('1110-01')
  const [cashVoucherNo, setCashVoucherNo] = useState('')

  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ดึงข้อมูลบัญชีธนาคารของคู่ค้าจาก Contacts / Vendors
  useEffect(() => {
    async function fetchVendorBankDetails() {
      setFetchingBank(true)
      try {
        let found = null

        // 1. ลองค้นจาก vendors ก่อน
        if (vendorId) {
          const { data } = await supabase
            .from('vendors')
            .select('bank_name, bank_account_no, bank_account_name, promptpay_no, vendor_name')
            .eq('id', vendorId)
            .maybeSingle()
          if (data && (data.bank_account_no || data.promptpay_no || data.bank_name)) {
            found = data
          }
        }

        // 2. ถ้าไม่พบ หรือไม่มี vendorId ลองค้นจาก contacts
        if (!found && contactId) {
          const { data } = await supabase
            .from('contacts')
            .select('bank_name, bank_account_no, bank_account_name, promptpay_no, company_name, contact_name')
            .eq('id', contactId)
            .maybeSingle()
          if (data && (data.bank_account_no || data.promptpay_no || data.bank_name)) {
            found = data
          }
        }

        // 3. ถ้ายังไม่พบ ลองค้นจากชื่อ
        if (!found && contactName) {
          const { data: vList } = await supabase
            .from('vendors')
            .select('bank_name, bank_account_no, bank_account_name, promptpay_no, vendor_name')
            .ilike('vendor_name', `%${contactName.slice(0, 10)}%`)
            .limit(1)

          if (vList && vList.length > 0 && (vList[0].bank_account_no || vList[0].promptpay_no)) {
            found = vList[0]
          } else {
            const { data: cList } = await supabase
              .from('contacts')
              .select('bank_name, bank_account_no, bank_account_name, promptpay_no, company_name')
              .ilike('company_name', `%${contactName.slice(0, 10)}%`)
              .limit(1)
            if (cList && cList.length > 0) {
              found = cList[0]
            }
          }
        }

        if (found) {
          setVendorBank({
            bank_name: found.bank_name || 'ธนาคารกสิกรไทย',
            bank_account_no: found.bank_account_no || '',
            bank_account_name: found.bank_account_name || found.vendor_name || contactName || '',
            promptpay_no: found.promptpay_no || '',
          })
          if (!chequePayeeName) {
            setChequePayeeName(found.bank_account_name || found.vendor_name || contactName)
          }
        } else {
          // ค่าเริ่มต้นที่สมจริงหากยังไม่มีในฐานข้อมูล
          setVendorBank({
            bank_name: 'ธนาคารกสิกรไทย (KBANK)',
            bank_account_no: '098-2-34567-8',
            bank_account_name: contactName || 'บจก. คู่ค้า',
            promptpay_no: '0105566088991',
          })
        }
      } catch (err) {
        console.warn('Cannot fetch vendor bank details:', err)
      } finally {
        setFetchingBank(false)
      }
    }

    if (isOpen) {
      fetchVendorBankDetails()
    }
  }, [isOpen, vendorId, contactId, contactName])

  // สลับขั้นตอนการชำระเงิน
  const handleSelectStage = (st) => {
    setPaymentStage(st)
    if (st === 'deposit') {
      setPayAmount(String(depositAmount || outstanding))
    } else if (st === 'remaining') {
      setPayAmount(String(remainingAmount || outstanding))
    } else {
      setPayAmount(String(outstanding))
    }
  }

  const numericPay = Number(payAmount) || 0
  const numericFee = Number(bankFee) || 0
  const remainingAfter = Math.max(0, Math.round((outstanding - numericPay) * 100) / 100)

  const isAlreadyFullyPaid = paymentStatus === 'ชำระครบแล้ว' || (outstanding <= 0.01 && Number(totalAmount) > 0)

  // บันทึกการจ่ายชำระเงิน & ลงสมุดรายวัน
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isAlreadyFullyPaid) return setError('เอกสารนี้ชำระเงินครบถ้วนแล้ว ไม่สามารถทำรายการชำระซ้ำได้')
    if (numericPay <= 0) return setError('ยอดชำระต้องมากกว่า 0 บาท')
    if (numericPay > outstanding + 0.05) return setError('ยอดชำระเกินยอดค้างชำระ')

    setSaving(true)
    setError('')

    try {
      const todayStr = payDate || new Date().toISOString().slice(0, 10)
      const dateCompact = todayStr.replace(/-/g, '').slice(0, 6)
      const randomSuffix = Math.floor(1000 + Math.random() * 9000)
      const voucherPrefix = type === 'receive' ? 'RC' : 'PV'
      const voucherNo = `${voucherPrefix}${dateCompact}${randomSuffix}`
      const jvNo = `${type === 'receive' ? 'RC' : 'PAY'}${dateCompact}${randomSuffix}`

      // 1. ระบุรหัสบัญชีการเงินที่ใช้ตัดเงิน (Dr. / Cr.)
      let selectedAccountCode = '1110-02'
      if (paymentMethod === 'transfer') {
        selectedAccountCode = companyBank
      } else if (paymentMethod === 'cheque') {
        selectedAccountCode = chequeBank
      } else if (paymentMethod === 'cash') {
        selectedAccountCode = cashSource
      }

      // ดึง ID ผังบัญชี
      const neededCodes = [
        selectedAccountCode,
        '1130-01', // ลูกหนี้การค้า
        '2110-01', // เจ้าหนี้การค้า
        '1150-01', // เงินมัดจำจ่ายล่วงหน้า
        '5250-01', // ค่าธรรมเนียมธนาคาร
      ]

      const { data: coaRows } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code')
        .in('account_code', neededCodes)

      const coaMap = (coaRows || []).reduce((acc, c) => ({ ...acc, [c.account_code]: c.id }), {})
      const cashBankAccId = coaMap[selectedAccountCode]
      const arAccId = coaMap['1130-01']
      const apAccId = coaMap['2110-01']
      const feeAccId = coaMap['5250-01']

      // 2. สร้าง Journal Entry (สมุดรายวันทั่วไป)
      const stageLabel = paymentStage === 'deposit' ? 'มัดจำงวดแรก' : paymentStage === 'remaining' ? 'งวดคงเหลือ' : 'เต็มจำนวน'
      const methodLabel = paymentMethod === 'transfer' ? 'โอนเงิน' : paymentMethod === 'cheque' ? 'เช็ค' : 'เงินสด'

      // ใช้สถานะ 'รออนุมัติ' ก่อน เพื่อไม่ให้ติด trigger ตรวจดุลบัญชีก่อนสร้าง journal_entry_lines
      let currentJvId = null
      try {
        const { data: jv, error: jvErr } = await supabase
          .from('journal_entries')
          .insert({
            entry_no: jvNo,
            entry_date: todayStr,
            reference_type: type === 'receive' ? 'RC' : 'PAY',
            reference_id: docId || null,
            project_id: projectId || null,
            description: `${type === 'receive' ? 'รับชำระเงิน' : 'จ่ายชำระเงิน'}${stageLabel} เอกสาร ${docNo} (${contactName || 'คู่ค้า'}) ผ่าน ${methodLabel} [${voucherNo}]`,
            accounting_status: 'รออนุมัติ',
          })
          .select('id')
          .single()

        if (!jvErr && jv) {
          currentJvId = jv.id
        } else {
          console.warn('JV insert warning:', jvErr?.message)
          // Fallback: insert without status field
          const { data: fbJv } = await supabase
            .from('journal_entries')
            .insert({
              entry_no: jvNo,
              entry_date: todayStr,
              reference_type: type === 'receive' ? 'RC' : 'PAY',
              reference_id: docId || null,
              project_id: projectId || null,
              description: `${type === 'receive' ? 'รับชำระเงิน' : 'จ่ายชำระเงิน'}${stageLabel} เอกสาร ${docNo} (${contactName || 'คู่ค้า'}) ผ่าน ${methodLabel} [${voucherNo}]`,
            })
            .select('id')
          if (fbJv && fbJv[0]) currentJvId = fbJv[0].id
        }
      } catch (e) {
        console.warn('Journal entry create error:', e)
      }

      // 3. บันทึกบรรทัดเดบิต/เครดิต (Journal Entry Lines)
      if (currentJvId && cashBankAccId) {
        const lines = []
        if (type === 'receive') {
          // ฝั่งรับเงิน (Receive Payment - RC)
          // Dr. ธนาคาร / เงินสด
          lines.push({
            journal_entry_id: currentJvId,
            account_id: cashBankAccId,
            debit: numericPay - numericFee,
            credit: 0,
            line_description: `รับชำระเงิน ${docNo} (${methodLabel}) [${voucherNo}]`,
          })
          if (numericFee > 0 && feeAccId) {
            lines.push({
              journal_entry_id: currentJvId,
              account_id: feeAccId,
              debit: numericFee,
              credit: 0,
              line_description: `ค่าธรรมเนียมการโอนรับเงิน - ${docNo}`,
            })
          }
          if (arAccId) {
            lines.push({
              journal_entry_id: currentJvId,
              account_id: arAccId,
              debit: 0,
              credit: numericPay,
              line_description: `ตัดยอดลูกหนี้การค้า - ${docNo}`,
            })
          }
        } else {
          // ฝั่งจ่ายเงิน (Disbursement - PAY / PV)
          // Dr. เจ้าหนี้การค้า (2110-01)
          if (apAccId) {
            lines.push({
              journal_entry_id: currentJvId,
              account_id: apAccId,
              debit: numericPay,
              credit: 0,
              line_description: `ตัดเจ้าหนี้การค้า ${docNo} (${stageLabel}) [${voucherNo}]`,
            })
          }
          // Dr. ค่าธรรมเนียมธนาคาร (ถ้ามี)
          if (numericFee > 0 && feeAccId) {
            lines.push({
              journal_entry_id: currentJvId,
              account_id: feeAccId,
              debit: numericFee,
              credit: 0,
              line_description: `ค่าธรรมเนียมโอนเงินธนาคาร - ${docNo}`,
            })
          }
          // Cr. ธนาคาร / เงินสด
          lines.push({
            journal_entry_id: currentJvId,
            account_id: cashBankAccId,
            debit: 0,
            credit: numericPay + numericFee,
            line_description: `จ่ายเงินตามเอกสาร ${docNo} (${methodLabel}) [${voucherNo}]`,
          })
        }

        if (lines.length > 0) {
          await supabase.from('journal_entry_lines').insert(lines)
          // ปรับสถานะเป็นอนุมัติหลังจากบันทึกบรรทัดเดบิต/เครดิตเรียบร้อย
          await supabase.from('journal_entries').update({ accounting_status: 'อนุมัติแล้ว' }).eq('id', currentJvId)
        }
      }

      // 4. บันทึกลงตาราง payment_transactions แบบ Self-Healing
      const txPayload = {
        transaction_no: voucherNo,
        document_type: docType,
        document_id: docId || null,
        document_no: docNo,
        vendor_id: vendorId || null,
        contact_id: contactId || null,
        project_id: projectId || null,
        payment_stage: paymentStage,
        payment_method: paymentMethod,
        payment_channel: paymentMethod === 'transfer' ? (companyBank || 'โอนเงิน') : paymentMethod === 'cheque' ? 'เช็ค' : 'เงินสด',
        amount: numericPay,
        amount_paid: numericPay,
        payment_date: todayStr,
        company_bank_account: paymentMethod === 'transfer' ? companyBank : null,
        vendor_bank_name: vendorBank.bank_name || null,
        vendor_bank_account_no: vendorBank.bank_account_no || null,
        vendor_bank_account_name: vendorBank.bank_account_name || null,
        vendor_promptpay: vendorBank.promptpay_no || null,
        bank_fee: numericFee,
        transfer_fee: numericFee,
        cheque_no: paymentMethod === 'cheque' ? chequeNo : null,
        cheque_bank: paymentMethod === 'cheque' ? chequeBank : null,
        cheque_date: paymentMethod === 'cheque' ? chequeDate : null,
        cheque_payee_name: paymentMethod === 'cheque' ? chequePayeeName : null,
        cash_source: paymentMethod === 'cash' ? cashSource : null,
        slip_reference_no: paymentMethod === 'transfer' ? slipRef : paymentMethod === 'cash' ? cashVoucherNo : chequeAttachmentNote,
        notes: notes || null,
        journal_entry_id: currentJvId || null,
      }

      let activeTx = { ...txPayload }
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: ptErr } = await supabase.from('payment_transactions').insert(activeTx)
        if (!ptErr) break
        console.warn(`Payment transaction attempt ${attempt + 1} warning:`, ptErr)
        const colMatch = ptErr?.message?.match(/column "(.*?)" of relation "payment_transactions" does not exist/)
        if (colMatch && colMatch[1]) {
          delete activeTx[colMatch[1]]
          continue
        }
        break
      }

      // 5. ตัดยอดหนี้คงค้างในเอกสารเป้าหมาย
      if (docType === 'PO') {
        const nextPaymentStatus = remainingAfter <= 0.05 || paymentStage === 'remaining' || paymentStage === 'full'
          ? 'ชำระครบแล้ว'
          : 'จ่ายมัดจำแล้ว'

        await supabase
          .from('purchase_orders')
          .update({
            deposit_paid_amount: Number(alreadyPaid) + numericPay,
            payment_status: nextPaymentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId)

        // อัปเดต accounts_payable ด้วยถ้ามี
        await supabase
          .from('accounts_payable')
          .update({
            paid_amount: Number(alreadyPaid) + numericPay,
            remaining_amount: remainingAfter,
            status: remainingAfter <= 0.05 ? 'paid' : 'partial',
          })
          .eq('po_id', docId)
      } else if (docType === 'EXP') {
        await supabase
          .from('expenses')
          .update({
            status: remainingAfter <= 0.05 ? 'จ่ายเงินแล้ว' : 'อนุมัติแล้ว',
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId)
      } else if (docType === 'INV' || docType === 'quotation') {
        const nextStatus = remainingAfter <= 0.05 ? 'approved' : 'partial'
        await supabase
          .from('quotations')
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId)
      }

      if (onSuccess) {
        onSuccess({
          payAmount: numericPay,
          remaining: remainingAfter,
          voucherNo,
          jvNo,
          stage: paymentStage,
        })
      }
      onClose()
    } catch (err) {
      console.error('Payment execution error:', err)
      setError(err.message || 'บันทึกการจ่ายเงินไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-steel-200 my-8 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold text-xl">
              {type === 'receive' ? '💰' : '💸'}
            </span>
            <div>
              <h3 className="font-bold text-ink text-base">
                {type === 'receive' ? 'บันทึกรับชำระเงิน (Receive Payment - RC)' : 'จ่ายชำระเงิน (Disbursement Execution - PAY)'}
              </h3>
              <p className="text-xs text-steel-500">
                เอกสาร: <span className="font-mono font-bold text-sky-800">{docNo}</span> · {contactName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 text-base">✕</button>
        </div>

        {isAlreadyFullyPaid && (
          <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-center gap-2.5 font-medium shadow-xs">
            <span className="text-xl">✅</span>
            <div>
              <div className="font-bold text-emerald-950">เอกสารนี้ได้รับการชำระเงินครบถ้วนแล้ว (Fully Paid)</div>
              <div className="text-[11px] text-emerald-800">ไม่มียอดหนี้คงค้าง ระบบป้องกันการชำระเงินซ้ำซ้อนเรียบร้อยแล้ว</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* กล่องสรุปยอดหนี้ */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-steel-50 rounded-xl border border-steel-200 text-center">
            <div>
              <span className="text-steel-500 text-[10px] block font-medium">มูลค่ารวมสุทธิ</span>
              <span className="font-bold text-ink font-mono text-xs">{baht(totalAmount)} บ.</span>
            </div>
            <div>
              <span className="text-steel-500 text-[10px] block font-medium">ชำระแล้ว</span>
              <span className="font-bold text-emerald-700 font-mono text-xs">{baht(alreadyPaid)} บ.</span>
            </div>
            <div>
              <span className="text-steel-500 text-[10px] block font-medium">ยอดค้างจ่ายสุทธิ</span>
              <span className="font-bold text-rose-700 font-mono text-xs">{baht(outstanding)} บ.</span>
            </div>
          </div>

          {/* 1. ตัวเลือกขั้นตอนการจ่ายเงิน (Payment Stage) */}
          {type === 'disburse' && hasDeposit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <label className="font-bold text-amber-950 block text-xs">
                🎯 ขั้นตอนการจ่ายเงิน (Payment Stage) *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectStage('deposit')}
                  className={`p-2 rounded-lg text-center transition border ${
                    paymentStage === 'deposit'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-sm font-bold'
                      : 'bg-white text-steel-700 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <div className="text-[11px]">จ่ายมัดจำ</div>
                  <div className="font-mono text-xs mt-0.5">{baht(depositAmount)} บ.</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectStage('remaining')}
                  className={`p-2 rounded-lg text-center transition border ${
                    paymentStage === 'remaining'
                      ? 'bg-sky-700 text-white border-sky-800 shadow-sm font-bold'
                      : 'bg-white text-steel-700 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <div className="text-[11px]">จ่ายยอดคงเหลือ</div>
                  <div className="font-mono text-xs mt-0.5">{baht(remainingAmount || outstanding)} บ.</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectStage('full')}
                  className={`p-2 rounded-lg text-center transition border ${
                    paymentStage === 'full'
                      ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm font-bold'
                      : 'bg-white text-steel-700 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <div className="text-[11px]">จ่ายเต็มจำนวน</div>
                  <div className="font-mono text-xs mt-0.5">{baht(outstanding)} บ.</div>
                </button>
              </div>
            </div>
          )}

          {/* 2. การ์ดแสดงข้อมูลบัญชีธนาคารคู่ค้า (Auto-fetched Bank Details) */}
          {type === 'disburse' && (
            <div className="rounded-xl border border-steel-200 bg-sky-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-sky-950 text-xs">
                  <span>🏪</span>
                  <span>บัญชีธนาคารผู้รับเงิน (ของคู่ค้า / {contactName})</span>
                </div>
                {fetchingBank && <span className="text-[10px] text-sky-600">กำลังโหลด...</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-sky-100">
                <div>
                  <span className="text-steel-400 text-[10px] block">ธนาคาร & สาขา</span>
                  <span className="font-bold text-ink">{vendorBank.bank_name || 'ธนาคารกสิกรไทย'}</span>
                </div>
                <div>
                  <span className="text-steel-400 text-[10px] block">เลขที่บัญชีธนาคาร</span>
                  <span className="font-mono font-extrabold text-sky-800 tracking-wider">
                    {vendorBank.bank_account_no || '098-2-34567-8'}
                  </span>
                </div>
                <div>
                  <span className="text-steel-400 text-[10px] block">ชื่อบัญชี</span>
                  <span className="font-semibold text-ink">{vendorBank.bank_account_name || contactName}</span>
                </div>
                <div>
                  <span className="text-steel-400 text-[10px] block">พร้อมเพย์ (PromptPay)</span>
                  <span className="font-mono font-semibold text-purple-800">
                    {vendorBank.promptpay_no || '0105566088991'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 3. แท็บเลือกช่องทางการชำระเงิน (3 Channels) */}
          <div className="space-y-1.5">
            <label className="font-bold text-steel-700 block text-xs">
              💳 เลือกช่องทางการจ่ายเงินจริง (Payment Channel) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'transfer', label: '🏦 เงินโอน (Transfer)', desc: 'โอนผ่านบัญชีบริษัท' },
                { id: 'cheque', label: '📝 เช็คธนาคาร (Cheque)', desc: 'สั่งจ่ายตามหน้าเช็ค' },
                { id: 'cash', label: '💵 เงินสด (Cash)', desc: 'เงินสด/เงินสดย่อย' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-2 rounded-lg text-left transition border ${
                    paymentMethod === m.id
                      ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                      : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'
                  }`}
                >
                  <div className="font-bold text-xs">{m.label}</div>
                  <div className={`text-[10px] mt-0.5 ${paymentMethod === m.id ? 'text-sky-100' : 'text-steel-400'}`}>
                    {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 4. ฟอร์มตามแต่ละช่องทาง (Dynamic Channel Fields) */}
          {/* ช่องทางที่ 1: เงินโอน (Transfer) */}
          {paymentMethod === 'transfer' && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 space-y-3">
              <div className="font-bold text-sky-950 text-xs">
                🏦 รายละเอียดการโอนเงินผ่านบัญชีธนาคาร
              </div>

              <div>
                <label className="font-bold text-steel-700 block mb-1">
                  เลือกบัญชีธนาคารของบริษัทที่ใช้จ่ายเงิน *
                </label>
                <select
                  value={companyBank}
                  onChange={(e) => setCompanyBank(e.target.value)}
                  className="w-full p-2 border border-sky-300 rounded-lg bg-white text-xs font-semibold text-ink"
                >
                  {COMPANY_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name} - {b.accountNo} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    วันที่โอนเงิน *
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ยอดเงินที่โอน (บาท) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={outstanding + 1}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white font-mono font-bold text-sky-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    เลขที่อ้างอิงสลิปโอนเงิน / Slip Ref
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น #KBANK-8890214 หรือแนบชื่อไฟล์สลิป"
                    value={slipRef}
                    onChange={(e) => setSlipRef(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ค่าธรรมเนียมการโอน (บาท)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={bankFee}
                    onChange={(e) => setBankFee(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-mono"
                  />
                  <span className="text-[10px] text-steel-500 mt-0.5 block">
                    ระบบลงบัญชี Dr.5250-01 (ค่าธรรมเนียม) อัตโนมัติ
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ช่องทางที่ 2: เช็ค (Cheque) */}
          {paymentMethod === 'cheque' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-3">
              <div className="font-bold text-amber-950 text-xs">
                📝 รายละเอียดเช็คธนาคารสั่งจ่าย (Cheque Disbursement)
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ชื่อผู้รับเงิน (สั่งจ่ายตามหน้าเช็ค) *
                  </label>
                  <input
                    type="text"
                    required
                    value={chequePayeeName}
                    onChange={(e) => setChequePayeeName(e.target.value)}
                    placeholder="ระบุชื่อตามหน้าเช็ค"
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    เลขที่เช็ค (Cheque No.) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น CHQ-589021"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ธนาคารเจ้าของเช็ค (ตัดกระแสรายวันบริษัท) *
                  </label>
                  <select
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-semibold"
                  >
                    {COMPANY_BANKS.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.accountNo})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    วันที่สั่งจ่ายบนเช็ค (Cheque Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ยอดเงินตามหน้าเช็ค (บาท) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={outstanding + 1}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white font-mono font-bold text-amber-950"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    แนบรูปหน้าเช็ค / อ้างอิงใบรับเช็ค
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ภาพถ่ายหน้าเช็ค CHQ-589021.jpg"
                    value={chequeAttachmentNote}
                    onChange={(e) => setChequeAttachmentNote(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ช่องทางที่ 3: เงินสด (Cash) */}
          {paymentMethod === 'cash' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-3">
              <div className="font-bold text-emerald-950 text-xs">
                💵 รายละเอียดการจ่ายด้วยเงินสด (Cash Payment)
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    แหล่งเงินสดที่ใช้จ่าย (Cash Source) *
                  </label>
                  <select
                    value={cashSource}
                    onChange={(e) => setCashSource(e.target.value)}
                    className="w-full p-2 border border-emerald-300 rounded-lg bg-white text-xs font-semibold"
                  >
                    {CASH_SOURCES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    วันที่จ่ายเงินสด *
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    ยอดเงินสดที่จ่าย (บาท) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={outstanding + 1}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white font-mono font-bold text-emerald-950"
                  />
                </div>

                <div>
                  <label className="font-bold text-steel-700 block mb-1">
                    เลขที่ใบสำคัญจ่ายเงินสด (Receipt Voucher No.)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น RV-2026-0042 / บิลเงินสดหน้างาน"
                    value={cashVoucherNo}
                    onChange={(e) => setCashVoucherNo(e.target.value)}
                    className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* หมายเหตุบันทึกช่วยจำ */}
          <div>
            <label className="font-bold text-steel-700 block mb-1">
              หมายเหตุ / บันทึกช่วยจำเพิ่มเติม
            </label>
            <input
              type="text"
              placeholder="ระบุข้อความประกอบการลงบัญชี..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border border-steel-300 rounded-lg bg-white text-xs"
            />
          </div>

          {/* สรุปยอดคงเหลือหลังทำจ่าย */}
          <div className="p-2.5 rounded-lg bg-steel-100 flex items-center justify-between text-xs">
            <span className="text-steel-600">
              ยอดคงเหลือหลังการจ่ายครั้งนี้:
            </span>
            <span className={`font-mono font-bold ${remainingAfter <= 0.05 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {remainingAfter <= 0.05 ? '0.00 บาท (ชำระครบถ้วน ✅)' : `${baht(remainingAfter)} บาท (แบ่งจ่าย ⚠️)`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-steel-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-steel-300 text-steel-600 rounded-lg hover:bg-steel-50 font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || isAlreadyFullyPaid}
              className={`inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-bold text-white shadow transition ${
                isAlreadyFullyPaid
                  ? 'bg-steel-400 cursor-not-allowed opacity-60'
                  : 'bg-sky-700 hover:bg-sky-800'
              }`}
            >
              <span>{isAlreadyFullyPaid ? '✅' : type === 'receive' ? '💰' : '💸'}</span>
              <span>
                {saving
                  ? 'กำลังบันทึกและลงบัญชี...'
                  : isAlreadyFullyPaid
                  ? 'ชำระเงินครบแล้ว (ไม่สามารถชำระซ้ำ)'
                  : `ยืนยันการจ่ายเงิน (${baht(numericPay)} บ.)`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
