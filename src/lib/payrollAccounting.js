/**
 * @file payrollAccounting.js
 * ผูกรอบจ่ายเงินเดือน/OT เข้ากับ expenses, journal_entries และต้นทุนโครงการ
 *
 * Flow:
 *   HRDashboard.jsx (Payroll Tab)
 *     → computePayrollPlan()       คำนวณแผน GL
 *     → postPayrollToAccounting()  บันทึก payroll_entries + expenses + GL
 *     → markPayrollPaid()          อัปเดตสถานะเป็น paid
 */

import { supabase } from './supabase'

/** round เศษสตางค์ 2 ตำแหน่ง */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ── Account codes ──────────────────────────────────────────────────────────
const ACCT_SALARY_EXP    = '5200-01'  // ค่าใช้จ่ายเงินเดือนพนักงาน
const ACCT_OT_EXP        = '5200-02'  // ค่าล่วงเวลา OT
const ACCT_LABOR_EXP     = '5121'     // ต้นทุนค่าแรงงาน (เฉพาะโครงการ)
const ACCT_ACCRUED_PAY   = '2130-01'  // เงินเดือนค้างจ่าย
const ACCT_SSF_PAYABLE   = '2140-01'  // ประกันสังคมค้างจ่าย
const ACCT_CASH          = '1110-01'  // เงินสด/ธนาคาร

/**
 * หา UUID ของบัญชีจาก account_code
 * @param {string} code
 * @returns {Promise<string|null>}
 */
async function resolveAccountId(code) {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('account_code', code)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * คำนวณแผน GL สำหรับรอบจ่ายเงินเดือน (ไม่ต้องติดต่อ DB)
 * @param {object} params
 * @param {number} params.baseSalary   - เงินเดือนฐาน
 * @param {number} params.otAmount     - ค่า OT รวม
 * @param {number} params.ssfEmployee  - ประกันสังคม (ส่วนลูกจ้าง หักจากเงินเดือน)
 * @param {number} params.ssfEmployer  - ประกันสังคม (ส่วนนายจ้าง เป็นค่าใช้จ่ายบริษัท)
 * @param {number} params.whtAmount    - ภาษีหัก ณ ที่จ่าย
 * @param {string|null} params.projectId - ถ้ามี project → Dr. 5121 แทน 5200-01
 * @returns {{ lines: Array, grossPay: number, netPay: number }}
 */
export function computePayrollPlan({
  baseSalary = 0,
  otAmount = 0,
  ssfEmployee = 0,
  ssfEmployer = 0,
  whtAmount = 0,
  projectId = null,
}) {
  const grossPay = round2(baseSalary + otAmount)
  const netPay   = round2(grossPay - ssfEmployee - whtAmount)

  // เลือกบัญชีค่าใช้จ่ายหลัก
  const salaryExpAcct = projectId ? ACCT_LABOR_EXP : ACCT_SALARY_EXP
  const otExpAcct     = projectId ? ACCT_LABOR_EXP : ACCT_OT_EXP

  const lines = []

  // Dr. ต้นทุนเงินเดือน
  if (baseSalary > 0) {
    lines.push({ side: 'debit',  account_code: salaryExpAcct, amount: round2(baseSalary), memo: 'เงินเดือนพนักงาน' })
  }
  // Dr. ค่า OT
  if (otAmount > 0) {
    lines.push({ side: 'debit',  account_code: otExpAcct,     amount: round2(otAmount),   memo: 'ค่าล่วงเวลา (OT)' })
  }
  // Dr. ประกันสังคมส่วนนายจ้าง
  if (ssfEmployer > 0) {
    lines.push({ side: 'debit',  account_code: ACCT_SALARY_EXP, amount: round2(ssfEmployer), memo: 'ประกันสังคม (นายจ้าง)' })
  }

  // Cr. เงินเดือนค้างจ่าย (gross + SSF นายจ้าง)
  const totalLiability = round2(grossPay + ssfEmployer)
  lines.push({ side: 'credit', account_code: ACCT_ACCRUED_PAY, amount: totalLiability,     memo: 'เงินเดือนค้างจ่ายรวม' })

  // ตรวจยอด debit == credit
  const totalDebit  = round2(lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0))
  const totalCredit = round2(lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0))
  const diff = round2(totalDebit - totalCredit)
  if (diff !== 0) {
    // ปรับ rounding ที่ Cr. ท้ายสุด
    lines[lines.length - 1].amount = round2(lines[lines.length - 1].amount + diff)
  }

  return { lines, grossPay, netPay }
}

/**
 * สร้าง payroll_entry + expenses row + GL entry สำหรับ 1 พนักงาน
 * @param {object} entry
 * @returns {Promise<{ payrollEntry: object, expenseRow: object, journalEntry: object }>}
 */
export async function postPayrollToAccounting(entry) {
  const {
    runCode, payPeriodStart, payPeriodEnd, payDate,
    empId, empName, department,
    projectId = null,
    baseSalary, otHours = 0, otRate = 0,
    ssfEmployee = 0, ssfEmployer = 0,
    whtAmount = 0, notes = '',
  } = entry

  const otAmount = round2(otHours * otRate)
  const { lines, grossPay, netPay } = computePayrollPlan({
    baseSalary, otAmount, ssfEmployee, ssfEmployer, whtAmount, projectId,
  })

  // ── 1. สร้าง expenses row ──────────────────────────────────────────────
  const expCategory = projectId ? 'ค่าแรงโครงการ' : 'เงินเดือนพนักงาน'
  const expDesc     = `${runCode} — ${empName || 'พนักงาน'} (${payPeriodStart} ถึง ${payPeriodEnd})`

  const { data: expData, error: expErr } = await supabase
    .from('expenses')
    .insert({
      description:        expDesc,
      amount:             grossPay,
      total_amount:       grossPay,
      category:           expCategory,
      expense_date:       payDate,
      status:             'จ่ายเงินแล้ว',
      accounting_status:  'อนุมัติแล้ว',
      payment_method:     'โอนธนาคาร',
      project_id:         projectId || null,
      notes:              notes,
    })
    .select()
    .single()

  if (expErr) throw new Error(`expenses insert failed: ${expErr.message}`)

  // ── 2. resolve account IDs ─────────────────────────────────────────────
  const [debitIds, creditIds] = await Promise.all([
    Promise.all(
      lines.filter(l => l.side === 'debit').map(l => resolveAccountId(l.account_code))
    ),
    Promise.all(
      lines.filter(l => l.side === 'credit').map(l => resolveAccountId(l.account_code))
    ),
  ])

  const debitLines  = lines.filter(l => l.side === 'debit').map((l, i) => ({ ...l, account_id: debitIds[i] }))
  const creditLines = lines.filter(l => l.side === 'credit').map((l, i) => ({ ...l, account_id: creditIds[i] }))
  const allLines    = [...debitLines, ...creditLines]

  // ── 3. สร้าง journal_entry ─────────────────────────────────────────────
  const { data: jeData, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      entry_date:     payDate,
      reference_type: 'PAY_PAYROLL',
      reference_id:   expData.id,
      description:    expDesc,
      total_amount:   grossPay,
      status:         'posted',
    })
    .select()
    .single()

  if (jeErr) throw new Error(`journal_entry insert failed: ${jeErr.message}`)

  // ── 4. สร้าง journal_entry_items ──────────────────────────────────────
  const jeItems = allLines
    .filter(l => l.account_id)
    .map(l => ({
      journal_entry_id: jeData.id,
      account_id:       l.account_id,
      description:      l.memo,
      debit_amount:     l.side === 'debit'  ? l.amount : 0,
      credit_amount:    l.side === 'credit' ? l.amount : 0,
    }))

  if (jeItems.length > 0) {
    const { error: jiErr } = await supabase.from('journal_entry_items').insert(jeItems)
    if (jiErr) console.warn('journal_entry_items insert warn:', jiErr.message)
  }

  // ── 5. สร้าง payroll_entry row ─────────────────────────────────────────
  const { data: peData, error: peErr } = await supabase
    .from('payroll_entries')
    .insert({
      run_code:          runCode,
      pay_period_start:  payPeriodStart,
      pay_period_end:    payPeriodEnd,
      pay_date:          payDate,
      emp_id:            empId || null,
      emp_name:          empName || '',
      department:        department || '',
      project_id:        projectId || null,
      base_salary:       baseSalary,
      ot_hours:          otHours,
      ot_rate:           otRate,
      ssf_employee:      ssfEmployee,
      ssf_employer:      ssfEmployer,
      wht_amount:        whtAmount,
      gross_pay:         grossPay,
      net_pay:           netPay,
      status:            'paid',
      expense_id:        expData.id,
      journal_entry_id:  jeData.id,
      notes:             notes,
    })
    .select()
    .single()

  if (peErr) throw new Error(`payroll_entry insert failed: ${peErr.message}`)

  return { payrollEntry: peData, expenseRow: expData, journalEntry: jeData }
}

/**
 * โหลดประวัติ payroll_entries ทั้งหมด (หรือเฉพาะโครงการ)
 * @param {{ projectId?: string, limit?: number }} opts
 * @returns {Promise<Array>}
 */
export async function fetchPayrollHistory({ projectId, limit = 100 } = {}) {
  let q = supabase
    .from('payroll_entries')
    .select('*, projects(project_code, project_name)')
    .order('pay_date', { ascending: false })
    .limit(limit)

  if (projectId) q = q.eq('project_id', projectId)

  const { data, error } = await q
  if (error) throw new Error(`fetchPayrollHistory failed: ${error.message}`)
  return data || []
}

/**
 * คำนวณยอดค่าแรงรวมของโครงการจาก payroll_entries (สำหรับ ProjectDetail)
 * @param {string} projectId
 * @returns {Promise<number>}
 */
export async function getProjectLaborCost(projectId) {
  const { data, error } = await supabase
    .from('payroll_entries')
    .select('gross_pay')
    .eq('project_id', projectId)
    .neq('status', 'cancelled')

  if (error) return 0
  return round2((data || []).reduce((s, r) => s + Number(r.gross_pay || 0), 0))
}
