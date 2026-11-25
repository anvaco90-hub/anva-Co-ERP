import { ensureContactIdForEntity } from './contactsSync'
import { inferPoTaxType, computePoTotals, round2 } from './tax'
import { supabase as defaultSupabase } from './supabase'

export const ADVANCE_DEPOSIT_ACCOUNT_CODE = '1170-01'

/**
 * Determine Thai Withholding Tax form type ('WHT_3' | 'WHT_53') and GL liability account code.
 */
export function detectWhtFormType({
  vendorName = '',
  entityType = '',
  whtFormHint = '',
}) {
  if (whtFormHint === 'WHT_3' || whtFormHint === 'WHT_53') {
    return {
      taxType: whtFormHint,
      accountCode: whtFormHint === 'WHT_3' ? '2120-01' : '2120-02',
      label: whtFormHint === 'WHT_3' ? 'ภ.ง.ด. 3 (บุคคลธรรมดา)' : 'ภ.ง.ด. 53 (นิติบุคคล)',
    }
  }

  const isJuristic =
    entityType === 'corporate' ||
    /บริษัท|บจก|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน|corp|co\.,?\s*ltd|ltd\.?|inc\.?/i.test(
      String(vendorName || '')
    )

  const taxType = isJuristic ? 'WHT_53' : 'WHT_3'
  return {
    taxType,
    accountCode: taxType === 'WHT_3' ? '2120-01' : '2120-02',
    label: taxType === 'WHT_3' ? 'ภ.ง.ด. 3 (บุคคลธรรมดา)' : 'ภ.ง.ด. 53 (นิติบุคคล)',
  }
}

/**
 * Compute authoritative Double-Entry Journal lines and Withholding Tax (tax_records) values
 * for a Purchase Order / Expense / Invoice payment execution.
 *
 * Guarantees:
 *   1. Pre-receipt PO deposit/CBD payments Dr. 1170-01 Advance Payment (NEVER negative AP 2110-01).
 *   2. Post-receipt PO payments Dr. 2110-01 AP AND auto-clear any prior uncleared 1170-01 deposit.
 *   3. PO payments with WHT Cr. 2120-01/2120-02 WHT Payable and emit exact tax_records WHT_3/WHT_53 amounts.
 *   4. Total Debit ALWAYS equals Total Credit to the exact satang.
 */
export function computePoPaymentAccountingPlan({
  type = 'disburse',
  docType = 'PO',
  payAmount = 0,
  bankFee = 0,
  totalPayable = 0,
  alreadyPaid = 0,
  subtotalBeforeVat = 0,
  whtRate = 0,
  totalWhtAmount = 0,
  previouslyWithheldWht = 0,
  hasGoodsReceipt = true,
  unclearedDepositBalance = 0,
  vendorName = '',
  entityType = '',
  whtFormHint = '',
}) {
  const numericPay = Math.max(0, round2(payAmount))
  const numericFee = Math.max(0, round2(bankFee))
  const numericTotal = Math.max(0, round2(totalPayable))
  const numericAlreadyPaid = Math.max(0, round2(alreadyPaid))
  const remainingAfter = Math.max(0, round2(numericTotal - numericAlreadyPaid - numericPay))
  const isClosingPayment = numericTotal > 0 && remainingAfter <= 0.05

  const whtInfo = detectWhtFormType({ vendorName, entityType, whtFormHint })

  let whtForThisPayment = 0
  let whtBaseForThisPayment = 0

  const effectiveWhtRate = Number(whtRate) || 0
  const effectiveTotalWht = Math.max(0, round2(totalWhtAmount))

  if (type === 'disburse' && docType === 'PO' && effectiveWhtRate > 0 && effectiveTotalWht > 0 && numericPay > 0) {
    const remainingWhtToWithhold = Math.max(0, round2(effectiveTotalWht - (Number(previouslyWithheldWht) || 0)))
    if (isClosingPayment) {
      whtForThisPayment = remainingWhtToWithhold
    } else if (numericTotal > 0) {
      const ratio = Math.min(1, numericPay / numericTotal)
      whtForThisPayment = Math.min(remainingWhtToWithhold, round2(effectiveTotalWht * ratio))
    }

    if (whtForThisPayment > 0) {
      if (isClosingPayment && (Number(previouslyWithheldWht) || 0) <= 0.01 && Number(subtotalBeforeVat) > 0) {
        whtBaseForThisPayment = round2(subtotalBeforeVat)
      } else {
        whtBaseForThisPayment = round2((whtForThisPayment * 100) / effectiveWhtRate)
      }
    }
  }

  const isPreReceiptDeposit = type === 'disburse' && docType === 'PO' && !hasGoodsReceipt
  const settledObligation = round2(numericPay + whtForThisPayment)
  const depositToClear =
    type === 'disburse' && docType === 'PO' && !isPreReceiptDeposit
      ? Math.max(0, round2(unclearedDepositBalance))
      : 0

  return {
    numericPay,
    numericFee,
    remainingAfter,
    isClosingPayment,
    isPreReceiptDeposit,
    debitTargetCode: isPreReceiptDeposit ? ADVANCE_DEPOSIT_ACCOUNT_CODE : '2110-01',
    debitTargetAmount: round2(settledObligation + depositToClear),
    depositToClear,
    whtForThisPayment,
    whtBaseForThisPayment,
    whtRate: effectiveWhtRate,
    whtTaxType: whtInfo.taxType,
    whtAccountCode: whtInfo.accountCode,
    whtFormLabel: whtInfo.label,
    bankCreditAmount: round2(numericPay + numericFee),
    totalDebit: round2(settledObligation + depositToClear + numericFee),
    totalCredit: round2(numericPay + numericFee + whtForThisPayment + depositToClear),
  }
}

/**
 * Fetch live PO tax, WHT, GRN receipt status, prior withheld WHT, and uncleared 1170-01 deposit balance
 * so PaymentActionModal is accurate regardless of which parent page launched it.
 */
export async function fetchPoPaymentContext(
  { poId, fallbackVendorName = '', fallbackSubtotal = 0, fallbackWhtRate = 0, fallbackWhtAmount = 0 },
  client = defaultSupabase
) {
  if (!poId) {
    return {
      hasGoodsReceipt: false,
      subtotalBeforeVat: round2(fallbackSubtotal),
      whtRate: Number(fallbackWhtRate) || 0,
      totalWhtAmount: round2(fallbackWhtAmount),
      previouslyWithheldWht: 0,
      unclearedDepositBalance: 0,
      vendorName: fallbackVendorName,
      vendorTaxId: '',
      entityType: '',
      taxType: 'vat_excluded',
      poNo: '',
      projectId: null,
      vendorId: null,
    }
  }

  const [poRes, itemsRes, grnRes, txRes, jvRes, advCoaRes] = await Promise.all([
    client
      .from('purchase_orders')
      .select('*, vendors(id, vendor_name, tax_id)')
      .eq('id', poId)
      .maybeSingle(),
    client
      .from('purchase_order_items')
      .select('id, quantity, unit_price, total_amount')
      .eq('po_id', poId),
    client
      .from('goods_receipts')
      .select('id')
      .eq('po_id', poId)
      .limit(1),
    client
      .from('payment_transactions')
      .select('*')
      .eq('document_id', poId),
    client
      .from('journal_entries')
      .select('id, accounting_status, journal_entry_lines(account_id, debit, credit)')
      .eq('reference_id', poId)
      .eq('reference_type', 'PAY')
      .neq('accounting_status', 'ยกเลิก'),
    client
      .from('chart_of_accounts')
      .select('id, account_code')
      .eq('account_code', ADVANCE_DEPOSIT_ACCOUNT_CODE)
      .maybeSingle(),
  ])

  const po = poRes.data || null
  const poItems = itemsRes.data || []
  const poTotals = po
    ? computePoTotals(po, poItems)
    : {
        taxType: inferPoTaxType(null),
        amountBeforeVat: round2(fallbackSubtotal),
        whtRate: Number(fallbackWhtRate) || 0,
        whtAmount: round2(fallbackWhtAmount),
      }

  const hasGoodsReceipt =
    (grnRes.data && grnRes.data.length > 0) ||
    ['partial', 'received'].includes(String(po?.status || '').toLowerCase())

  let previouslyWithheldWht = round2(
    (txRes.data || []).reduce((s, t) => s + (Number(t?.wht_amount) || 0), 0)
  )
  if (previouslyWithheldWht <= 0 && po?.po_no) {
    const { data: whtTaxRows } = await client
      .from('tax_records')
      .select('wht_amount')
      .in('tax_type', ['WHT_3', 'WHT_53'])
      .neq('status', 'ยกเลิก')
      .ilike('document_no', `${po.po_no}%`)
    if (whtTaxRows && whtTaxRows.length > 0) {
      previouslyWithheldWht = round2(
        whtTaxRows.reduce((s, r) => s + (Number(r?.wht_amount) || 0), 0)
      )
    }
  }

  const advAccId = advCoaRes.data?.id || null
  let unclearedDepositBalance = 0
  if (advAccId && jvRes.data) {
    for (const jv of jvRes.data) {
      for (const line of jv.journal_entry_lines || []) {
        if (line.account_id === advAccId) {
          unclearedDepositBalance += (Number(line.debit) || 0) - (Number(line.credit) || 0)
        }
      }
    }
  }
  unclearedDepositBalance = Math.max(0, round2(unclearedDepositBalance))

  return {
    hasGoodsReceipt,
    subtotalBeforeVat:
      poTotals.amountBeforeVat > 0 ? poTotals.amountBeforeVat : round2(fallbackSubtotal),
    whtRate: poTotals.whtRate > 0 ? poTotals.whtRate : Number(fallbackWhtRate) || 0,
    totalWhtAmount:
      poTotals.whtAmount > 0 ? poTotals.whtAmount : round2(fallbackWhtAmount),
    previouslyWithheldWht,
    unclearedDepositBalance,
    vendorName: po?.vendors?.vendor_name || po?.custom_vendor_name || fallbackVendorName || '',
    vendorTaxId: po?.vendors?.tax_id || '',
    entityType: '',
    taxType: poTotals.taxType || 'vat_excluded',
    poNo: po?.po_no || '',
    projectId: po?.project_id || null,
    vendorId: po?.vendor_id || null,
  }
}

/**
 * Ensure COA account `1170-01` (Advance Payment to Vendors) exists even if migration 044 hasn't run yet.
 */
export async function ensureAdvanceDepositAccountId(client = defaultSupabase) {
  const { data: existing } = await client
    .from('chart_of_accounts')
    .select('id, account_code')
    .eq('account_code', ADVANCE_DEPOSIT_ACCOUNT_CODE)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Detect account_category style ('Asset' vs 'assets') from existing 1150-01 row
  const { data: sample } = await client
    .from('chart_of_accounts')
    .select('account_category')
    .eq('account_code', '1150-01')
    .maybeSingle()

  const category = sample?.account_category || 'Asset'
  const payloads = [
    {
      account_code: ADVANCE_DEPOSIT_ACCOUNT_CODE,
      account_name_th: 'เงินมัดจำจ่ายล่วงหน้าค่าสินค้า/บริการ',
      account_name_en: 'Advance Payment & Deposits to Vendors',
      account_category: category,
      is_system_default: true,
      is_active: true,
    },
    {
      account_code: ADVANCE_DEPOSIT_ACCOUNT_CODE,
      account_name_th: 'เงินมัดจำจ่ายล่วงหน้าค่าสินค้า/บริการ',
      account_category: category === 'Asset' ? 'assets' : 'Asset',
    },
  ]

  for (const p of payloads) {
    const { data: inserted, error } = await client
      .from('chart_of_accounts')
      .insert(p)
      .select('id')
      .maybeSingle()
    if (!error && inserted?.id) return inserted.id
  }

  return null
}

/**
 * Persist Withholding Tax (`WHT_3` / `WHT_53`) record into `tax_records` upon PO payment.
 */
export async function recordPoPaymentWhtTax(
  {
    taxType,
    paymentDate,
    docNo,
    voucherNo,
    contactId = null,
    vendorId = null,
    vendorName = '',
    vendorTaxId = '',
    projectId = null,
    baseAmount = 0,
    whtRate = 0,
    whtAmount = 0,
    journalEntryId = null,
  },
  client = defaultSupabase
) {
  const roundedWht = round2(whtAmount)
  if (roundedWht <= 0) return null

  const resolvedContactId =
    contactId ||
    (await ensureContactIdForEntity(
      {
        id: vendorId || null,
        vendor_name: vendorName || 'ผู้จำหน่าย/คู่ค้า',
        tax_id: vendorTaxId || null,
      },
      'vendor',
      client
    ).catch(() => null))

  const docDate = String(paymentDate || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const parts = docDate.split('-').map(Number)
  const taxYear = parts[0] || new Date().getFullYear()
  const taxMonth = parts[1] || new Date().getMonth() + 1

  const { data: inserted, error } = await client
    .from('tax_records')
    .insert({
      tax_type: taxType === 'WHT_3' ? 'WHT_3' : 'WHT_53',
      tax_month: taxMonth,
      tax_year: taxYear,
      document_date: docDate,
      document_no: voucherNo ? `${docNo} (${voucherNo})` : docNo,
      vendor_tax_invoice_no: voucherNo || docNo,
      contact_id: resolvedContactId || vendorId || null,
      project_id: projectId || null,
      base_amount: round2(baseAmount),
      vat_amount: 0,
      wht_rate: Number(whtRate) || 0,
      wht_amount: roundedWht,
      status: 'รอยื่นภาษี',
      journal_entry_id: journalEntryId || null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn('recordPoPaymentWhtTax warning:', error.message || error)
    return null
  }
  return inserted?.id || null
}
