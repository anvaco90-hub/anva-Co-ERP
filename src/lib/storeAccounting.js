import { supabase as defaultSupabase } from './supabase'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Compute weighted average unit cost after returning items back to Main Store.
 */
export function computeReturnWeightedAvgCost({
  curQty = 0,
  curAvgCost = 0,
  returnQty = 0,
  returnUnitCost = 0,
}) {
  const q0 = Math.max(0, Number(curQty) || 0)
  const c0 = Math.max(0, Number(curAvgCost) || 0)
  const q1 = Math.max(0, Number(returnQty) || 0)
  const c1 = Math.max(0, Number(returnUnitCost) || 0)

  const nextQty = q0 + q1
  if (nextQty <= 0) return round2(c0 || c1)
  if (q1 <= 0) return round2(c0)
  if (c1 <= 0 && c0 > 0) return round2(c0)
  return round2(((q0 * c0) + (q1 * c1)) / nextQty)
}

/**
 * Compute total pre-VAT inventory valuation for a Stock Issue batch.
 */
export function computeIssueTotalCost(lines = [], itemsMap = {}) {
  return round2(
    (lines || []).reduce((sum, l) => {
      const qty = Math.max(0, Number(l?.quantity) || 0)
      const inv = itemsMap?.[l?.item_id] || l?.inventory_items || null
      const unitCost =
        Number(l?.unit_cost) > 0
          ? Number(l.unit_cost)
          : Number(inv?.avg_unit_cost || 0)
      return sum + qty * unitCost
    }, 0)
  )
}

function generateJvNo(docDate) {
  const ym = String(docDate || new Date().toISOString().slice(0, 10))
    .replace(/-/g, '')
    .slice(0, 6)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `JV${ym}${rand}`
}

async function consumeStockLotsFifo(itemId, qtyToConsume, client) {
  let remaining = Math.max(0, Number(qtyToConsume) || 0)
  if (!itemId || remaining <= 0) return

  const { data: lots } = await client
    .from('stock_lots')
    .select('id, qty_remaining, received_date, created_at')
    .eq('item_id', itemId)
    .gt('qty_remaining', 0)
    .order('received_date', { ascending: true })
    .order('created_at', { ascending: true })

  for (const lot of lots || []) {
    if (remaining <= 0) break
    const lotRem = Number(lot.qty_remaining || 0)
    if (lotRem <= 0) continue
    const take = Math.min(remaining, lotRem)
    await client
      .from('stock_lots')
      .update({ qty_remaining: round2(lotRem - take) })
      .eq('id', lot.id)
    remaining = round2(remaining - take)
  }
}

async function insertBalancedJournalEntry(
  {
    referenceType,
    fallbackReferenceType = 'MANUAL',
    referenceId,
    docDate,
    projectId = null,
    description,
    createdBy = null,
    debitAccountCode,
    creditAccountCode,
    amount,
    debitLineDesc,
    creditLineDesc,
  },
  client
) {
  const roundedAmt = round2(amount)
  if (roundedAmt <= 0) return null

  const { data: coaRows } = await client
    .from('chart_of_accounts')
    .select('id, account_code')
    .in('account_code', [debitAccountCode, creditAccountCode, '5110-01', '1140-01'])

  const coaMap = Object.fromEntries((coaRows || []).map((c) => [c.account_code, c.id]))
  const debitAccId = coaMap[debitAccountCode] || coaMap['5110-01']
  const creditAccId = coaMap[creditAccountCode] || coaMap['1140-01']
  if (!debitAccId || !creditAccId) return null

  let entryNo = generateJvNo(docDate)
  try {
    const { data: genNo } = await client.rpc('generate_journal_entry_no', {
      p_date: docDate,
      p_prefix: 'JV',
    })
    if (genNo) entryNo = genNo
  } catch (_) {}

  let jvId = null
  const typesToTry = [referenceType, fallbackReferenceType].filter(
    (t, i, arr) => t && arr.indexOf(t) === i
  )

  for (const refType of typesToTry) {
    const { data: jvRow, error: jvErr } = await client
      .from('journal_entries')
      .insert({
        entry_no: entryNo,
        entry_date: docDate,
        reference_type: refType,
        reference_id: referenceId || null,
        project_id: projectId || null,
        description,
        accounting_status: 'รอดำเนินการ',
        created_by: createdBy || null,
      })
      .select('id')
      .single()

    if (!jvErr && jvRow?.id) {
      jvId = jvRow.id
      break
    }
    if (jvErr?.message?.includes('journal_entries_entry_no_key')) {
      entryNo = generateJvNo(docDate)
      continue
    }
  }

  if (!jvId) return null

  await client.from('journal_entry_lines').insert([
    {
      journal_entry_id: jvId,
      account_id: debitAccId,
      debit: roundedAmt,
      credit: 0,
      line_description: debitLineDesc,
    },
    {
      journal_entry_id: jvId,
      account_id: creditAccId,
      debit: 0,
      credit: roundedAmt,
      line_description: creditLineDesc,
    },
  ])

  return jvId
}

/**
 * Self-healing & idempotent GL / FIFO stock_lots sync after `confirm_stock_issue`.
 * No-ops on GL/lots if database migration 043 already posted them.
 */
export async function ensureStockIssueAccounting(
  { issueId = null, projectId = null, issueTarget = 'project', lines = [], itemsMap = {}, userId = null },
  client = defaultSupabase
) {
  let issue = null
  if (issueId) {
    const { data } = await client
      .from('stock_issues')
      .select('id, issue_no, issue_date, project_id, issue_target, journal_entry_id')
      .eq('id', issueId)
      .maybeSingle()
    issue = data
  }
  if (!issue?.id) return { ok: false, reason: 'issue_not_found' }

  const effectiveProjectId = issue.project_id ?? projectId ?? null
  const issueNo = issue.issue_no || 'ISS'
  const docDate = String(issue.issue_date || new Date().toISOString().slice(0, 10)).slice(0, 10)

  const { data: issueItems } = await client
    .from('stock_issue_items')
    .select('id, item_id, quantity, unit_cost')
    .eq('issue_id', issue.id)

  const resolvedLines = (issueItems && issueItems.length > 0 ? issueItems : lines).map((l) => {
    const inv = itemsMap?.[l.item_id]
    const cost = Number(l.unit_cost) > 0 ? Number(l.unit_cost) : Number(inv?.avg_unit_cost || 0)
    return { ...l, unit_cost: cost }
  })

  // Ensure unit_cost on stock_issue_items wasn't saved as 0 when item has avg_unit_cost
  for (const row of issueItems || []) {
    if (!(Number(row.unit_cost) > 0)) {
      const invCost = Number(itemsMap?.[row.item_id]?.avg_unit_cost || 0)
      if (invCost > 0) {
        await client.from('stock_issue_items').update({ unit_cost: invCost }).eq('id', row.id)
      }
    }
  }

  const totalCost = computeIssueTotalCost(resolvedLines, itemsMap)

  // Check if DB already posted GL (if so, DB migration 043 also updated stock_lots)
  const { data: existingJv } = await client
    .from('journal_entries')
    .select('id')
    .eq('reference_id', issue.id)
    .in('reference_type', ['ISS', 'MANUAL'])
    .neq('accounting_status', 'ยกเลิก')
    .limit(1)

  if (issue.journal_entry_id || (existingJv && existingJv.length > 0)) {
    return { ok: true, skipped: true, totalCost }
  }

  // Legacy RPC before 043 did NOT deduct stock_lots FIFO — sync stock_lots once here
  for (const l of resolvedLines) {
    await consumeStockLotsFifo(l.item_id, l.quantity, client)
  }

  if (totalCost > 0) {
    const target = issue.issue_target || issueTarget || 'project'
    const debitAcc = target === 'office' ? '5230-01' : '5110-01'
    const jvId = await insertBalancedJournalEntry(
      {
        referenceType: 'ISS',
        fallbackReferenceType: 'MANUAL',
        referenceId: issue.id,
        docDate,
        projectId: effectiveProjectId,
        description: `เบิกวัสดุจากคลังสโตร์ ${issueNo}`,
        createdBy: userId,
        debitAccountCode: debitAcc,
        creditAccountCode: '1140-01',
        amount: totalCost,
        debitLineDesc: `ต้นทุนเบิกวัสดุ - ${issueNo}`,
        creditLineDesc: `ตัดสต็อกวัสดุคงเหลือ - ${issueNo}`,
      },
      client
    )

    if (jvId) {
      await client
        .from('stock_issues')
        .update({ journal_entry_id: jvId })
        .eq('id', issue.id)
    }
  }

  return { ok: true, skipped: false, totalCost }
}

/**
 * Self-healing & idempotent GL / weighted-avg / stock_lots sync after `adjust_stock`.
 */
export async function ensureStockAdjustmentAccounting(
  {
    adjId = null,
    itemId,
    sourceProjectId = null,
    prevQty = 0,
    newQty = 0,
    unitCost = null,
    curAvgCost = 0,
    reason = '',
    userId = null,
  },
  client = defaultSupabase
) {
  if (!adjId || !itemId) return { ok: false, reason: 'missing_ids' }

  const { data: adjRow } = await client
    .from('stock_adjustments')
    .select('id, adj_no, item_id, source_project_id, qty_before, qty_after, unit_cost, journal_entry_id, created_at')
    .eq('id', adjId)
    .maybeSingle()

  if (!adjRow) return { ok: false, reason: 'adj_not_found' }

  const effectiveCost =
    Number(adjRow.unit_cost) > 0
      ? round2(adjRow.unit_cost)
      : Number(unitCost) > 0
      ? round2(unitCost)
      : round2(curAvgCost)

  // Patch zero unit_cost on stock_adjustments if DB `adjust_stock` wrote 0
  if (effectiveCost > 0 && !(Number(adjRow.unit_cost) > 0)) {
    await client
      .from('stock_adjustments')
      .update({ unit_cost: effectiveCost })
      .eq('id', adjRow.id)
  }

  const qtyBefore = Number(adjRow.qty_before ?? prevQty) || 0
  const qtyAfter = Number(adjRow.qty_after ?? newQty) || 0
  const diff = qtyAfter - qtyBefore
  const absQty = Math.abs(diff)
  const effProjectId = adjRow.source_project_id ?? sourceProjectId ?? null
  const docDate = String(adjRow.created_at || new Date().toISOString()).slice(0, 10)
  const adjNo = adjRow.adj_no || 'ADJ'

  const { data: existingJv } = await client
    .from('journal_entries')
    .select('id')
    .eq('reference_id', adjRow.id)
    .in('reference_type', ['ADJ', 'MANUAL'])
    .neq('accounting_status', 'ยกเลิก')
    .limit(1)

  const alreadyHandledByDb = Boolean(adjRow.journal_entry_id || (existingJv && existingJv.length > 0))

  if (!alreadyHandledByDb && absQty > 0) {
    if (diff > 0) {
      // Return to store: recalculate weighted average & add return stock_lot
      const nextAvg = computeReturnWeightedAvgCost({
        curQty: qtyBefore,
        curAvgCost,
        returnQty: absQty,
        returnUnitCost: effectiveCost,
      })
      if (nextAvg > 0) {
        await client
          .from('inventory_items')
          .update({ avg_unit_cost: nextAvg, updated_at: new Date().toISOString() })
          .eq('id', itemId)
      }

      await client.from('stock_lots').insert({
        item_id: itemId,
        source_project_id: effProjectId,
        lot_type: 'adjustment',
        received_date: docDate,
        qty_received: absQty,
        qty_remaining: absQty,
        unit_cost: effectiveCost,
      })
    } else {
      await consumeStockLotsFifo(itemId, absQty, client)
    }

    const totalValue = round2(absQty * effectiveCost)
    if (totalValue > 0) {
      const isReturn = diff > 0
      const jvId = await insertBalancedJournalEntry(
        {
          referenceType: 'ADJ',
          fallbackReferenceType: 'MANUAL',
          referenceId: adjRow.id,
          docDate,
          projectId: effProjectId,
          description: `${isReturn ? 'รับคืนพัสดุเข้าสโตร์' : 'ตัดปรับปรุง/ชำรุดพัสดุ'} ${adjNo}: ${reason}`.trim(),
          createdBy: userId,
          debitAccountCode: isReturn ? '1140-01' : '5110-01',
          creditAccountCode: isReturn ? '5110-01' : '1140-01',
          amount: totalValue,
          debitLineDesc: isReturn ? `รับคืนวัสดุเข้าสต็อก - ${adjNo}` : `ตัดวัสดุชำรุด/สูญหาย - ${adjNo}`,
          creditLineDesc: isReturn ? `ลดต้นทุนวัสดุโครงการ - ${adjNo}` : `ลดยอดสต็อกวัสดุ - ${adjNo}`,
        },
        client
      )

      if (jvId) {
        await client
          .from('stock_adjustments')
          .update({ journal_entry_id: jvId })
          .eq('id', adjRow.id)
      }
    }
  }

  return { ok: true, effectiveCost, skipped: alreadyHandledByDb }
}
