import { supabase as defaultSupabase } from './supabase'
import { computeGrnFinancials, resolvePoReceiveUnitCost } from './goodsReceiptUtils'
import { inferPoTaxType, round2 } from './tax'

function generateJvNo(docDate) {
  const ym = String(docDate || new Date().toISOString().slice(0, 10))
    .replace(/-/g, '')
    .slice(0, 6)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `JV${ym}${rand}`
}

async function resolveGrnRecord(poId, grnId, client) {
  if (grnId) {
    const { data } = await client
      .from('goods_receipts')
      .select('id, grn_no, po_id, received_date, received_by, journal_entry_id')
      .eq('id', grnId)
      .maybeSingle()
    if (data) return data
  }

  const { data: latest } = await client
    .from('goods_receipts')
    .select('id, grn_no, po_id, received_date, received_by, journal_entry_id')
    .eq('po_id', poId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return latest || null
}

/**
 * If an older database `confirm_goods_receipt` RPC stored VAT-inclusive PO `unit_price`
 * straight into `goods_receipt_items`, `stock_lots`, and `inventory_items.avg_unit_cost`,
 * normalize those rows to pre-VAT cost in-place. No-ops when DB migration 042 is active.
 */
async function normalizeVatIncludedStockCosts(grnId, po, expectedItems = [], client) {
  if (!grnId || !po || inferPoTaxType(po) !== 'vat_included') return

  const { data: griRows } = await client
    .from('goods_receipt_items')
    .select('id, po_item_id, qty_received, unit_cost')
    .eq('grn_id', grnId)

  if (!griRows || griRows.length === 0) return

  const affectedItemIds = new Set()

  for (const gri of griRows) {
    const matchedExpected = expectedItems.find((x) => x.po_item_id === gri.po_item_id)
    const targetPreVatCost =
      matchedExpected?.unit_cost ??
      resolvePoReceiveUnitCost({ rawUnitPrice: gri.unit_cost, po })

    const currentCost = round2(gri.unit_cost)
    if (Math.abs(currentCost - targetPreVatCost) <= 0.01) continue

    await client
      .from('goods_receipt_items')
      .update({ unit_cost: targetPreVatCost })
      .eq('id', gri.id)

    const { data: lots } = await client
      .from('stock_lots')
      .select('id, item_id, unit_cost')
      .eq('grn_item_id', gri.id)

    for (const lot of lots || []) {
      await client
        .from('stock_lots')
        .update({ unit_cost: targetPreVatCost })
        .eq('id', lot.id)
      if (lot.item_id) affectedItemIds.add(lot.item_id)
    }
  }

  for (const itemId of affectedItemIds) {
    const { data: itemLots } = await client
      .from('stock_lots')
      .select('qty_remaining, unit_cost')
      .eq('item_id', itemId)

    const totalQty = (itemLots || []).reduce((s, l) => s + (Number(l.qty_remaining) || 0), 0)
    const weightedAvg =
      totalQty > 0
        ? round2(
            (itemLots || []).reduce(
              (s, l) => s + (Number(l.qty_remaining) || 0) * (Number(l.unit_cost) || 0),
              0
            ) / totalQty
          )
        : 0

    await client
      .from('inventory_items')
      .update({ avg_unit_cost: weightedAvg, updated_at: new Date().toISOString() })
      .eq('id', itemId)
  }
}

/**
 * Ensure a confirmed Goods Receipt (RI) has:
 * 1) Pre-VAT stock costs in `goods_receipt_items` / `stock_lots` / `inventory_items`
 * 2) Balanced GL `journal_entries` + `journal_entry_lines` (Dr. 1140-01, Dr. 1150-01 VAT, Cr. 2110-01 AP)
 * 3) `INPUT_VAT` row in `tax_records` when VAT > 0
 * 4) Upserted `accounts_payable` row linked to the PO
 *
 * Completely idempotent: skips GL/Tax creation if PostgreSQL trigger/RPC already created it.
 */
export async function ensureGrnAccountingAndAp(
  { grnId = null, grnNo = '', po, poItems = [], itemsReceived = [], receivedDate = null, userId = null },
  client = defaultSupabase
) {
  if (!po?.id) return { ok: false, reason: 'missing_po' }

  const grn = await resolveGrnRecord(po.id, grnId, client)
  const resolvedGrnId = grn?.id || grnId || null
  const resolvedGrnNo = grn?.grn_no || grnNo || `RI-${po.po_no || po.id.slice(0, 6)}`
  const docDate = (grn?.received_date || receivedDate || new Date().toISOString().slice(0, 10)).slice(0, 10)

  // Step A: Normalize VAT-included stock costs if legacy RPC wrote gross prices
  if (resolvedGrnId) {
    await normalizeVatIncludedStockCosts(resolvedGrnId, po, itemsReceived, client).catch((err) => {
      console.warn('normalizeVatIncludedStockCosts notice:', err)
    })
  }

  // Step B: Read authoritative `goods_receipt_items` for this GRN + all GRNs on this PO
  let thisGrnItems = itemsReceived
  if (resolvedGrnId) {
    const { data: dbGri } = await client
      .from('goods_receipt_items')
      .select('id, po_item_id, qty_received, unit_cost')
      .eq('grn_id', resolvedGrnId)
    if (dbGri && dbGri.length > 0) {
      thisGrnItems = dbGri
    }
  }

  // Compute cumulative pre-VAT received across all GRNs of this PO
  const { data: allGrns } = await client
    .from('goods_receipts')
    .select('id')
    .eq('po_id', po.id)

  const grnIds = (allGrns || []).map((g) => g.id)
  let cumulativePreVat = null
  if (grnIds.length > 0) {
    const { data: allGris } = await client
      .from('goods_receipt_items')
      .select('qty_received, unit_cost')
      .in('grn_id', grnIds)
    if (allGris && allGris.length > 0) {
      cumulativePreVat = round2(
        allGris.reduce((s, r) => s + (Number(r.qty_received) || 0) * (Number(r.unit_cost) || 0), 0)
      )
    }
  }

  // Sum paid transactions from payment_transactions if any exist
  const { data: txRows } = await client
    .from('payment_transactions')
    .select('*')
    .eq('document_id', po.id)
  const paidFromTx =
    txRows && txRows.length > 0
      ? round2(txRows.reduce((s, p) => s + Number(p.amount_paid ?? p.amount ?? 0), 0))
      : null

  const financials = computeGrnFinancials({
    po,
    itemsReceived: thisGrnItems,
    cumulativePreVat,
    poItems,
    paidFromTransactions: paidFromTx,
    receivedDate: docDate,
  })

  // Step C: Ensure GL Journal Entry + Input VAT tax record (only if DB trigger hasn't already created it)
  if (resolvedGrnId && financials.subtotalPreVat > 0) {
    const { data: existingJvList } = await client
      .from('journal_entries')
      .select('id, entry_no, accounting_status')
      .eq('reference_type', 'RI')
      .eq('reference_id', resolvedGrnId)
      .neq('accounting_status', 'ยกเลิก')
      .limit(1)

    let jvId = grn?.journal_entry_id || existingJvList?.[0]?.id || null

    if (!jvId) {
      const { data: coaRows } = await client
        .from('chart_of_accounts')
        .select('id, account_code')
        .in('account_code', ['1140-01', '1150-01', '2110-01'])

      const coaMap = Object.fromEntries((coaRows || []).map((c) => [c.account_code, c.id]))
      const invAccId = coaMap['1140-01']
      const inputVatAccId = coaMap['1150-01']
      const apAccId = coaMap['2110-01']

      if (invAccId && apAccId) {
        let entryNo = generateJvNo(docDate)
        try {
          const { data: generatedNo } = await client.rpc('generate_journal_entry_no', {
            p_date: docDate,
            p_prefix: 'JV',
          })
          if (generatedNo) entryNo = generatedNo
        } catch (_) {}

        const { data: jvRow, error: jvErr } = await client
          .from('journal_entries')
          .insert({
            entry_no: entryNo,
            entry_date: docDate,
            reference_type: 'RI',
            reference_id: resolvedGrnId,
            project_id: po.project_id || null,
            description: `รับวัสดุก่อสร้างเข้าคลังสโตร์และตั้งเจ้าหนี้ตามใบรับของ ${resolvedGrnNo}`,
            accounting_status: 'รอดำเนินการ',
            created_by: grn?.received_by || userId || null,
          })
          .select('id')
          .single()

        if (!jvErr && jvRow?.id) {
          jvId = jvRow.id
          const lines = [
            {
              journal_entry_id: jvId,
              account_id: invAccId,
              contact_id: po.vendor_id || null,
              debit: financials.subtotalPreVat,
              credit: 0,
              line_description: `รับวัสดุเข้าสโตร์ - ${resolvedGrnNo}`,
            },
          ]

          if (financials.vatAmount > 0 && inputVatAccId) {
            lines.push({
              journal_entry_id: jvId,
              account_id: inputVatAccId,
              contact_id: po.vendor_id || null,
              debit: financials.vatAmount,
              credit: 0,
              line_description: `ภาษีซื้อ - ${resolvedGrnNo}`,
            })
          }

          lines.push({
            journal_entry_id: jvId,
            account_id: apAccId,
            contact_id: po.vendor_id || null,
            debit: 0,
            credit: financials.totalWithVat,
            line_description: `เจ้าหนี้การค้า - ${resolvedGrnNo}`,
          })

          await client.from('journal_entry_lines').insert(lines)
          await client
            .from('goods_receipts')
            .update({ journal_entry_id: jvId })
            .eq('id', resolvedGrnId)
        }
      }
    }

    // Ensure INPUT_VAT in tax_records when VAT > 0
    if (financials.vatAmount > 0) {
      const { data: existingTax } = await client
        .from('tax_records')
        .select('id')
        .eq('tax_type', 'INPUT_VAT')
        .eq('document_no', resolvedGrnNo)
        .neq('status', 'ยกเลิก')
        .limit(1)

      if (!existingTax || existingTax.length === 0) {
        const dtParts = financials.invoiceDate.split('-').map(Number)
        const taxYear = dtParts[0] || new Date().getFullYear()
        const taxMonth = dtParts[1] || new Date().getMonth() + 1
        const taxInvoiceNo = String(po.vendor_tax_invoice_no || '').trim() || resolvedGrnNo

        await client.from('tax_records').insert({
          tax_type: 'INPUT_VAT',
          tax_month: taxMonth,
          tax_year: taxYear,
          document_date: financials.invoiceDate,
          document_no: resolvedGrnNo,
          vendor_tax_invoice_no: taxInvoiceNo,
          contact_id: po.vendor_id || null,
          project_id: po.project_id || null,
          base_amount: financials.subtotalPreVat,
          vat_amount: financials.vatAmount,
          status: 'รอยื่นภาษี',
          journal_entry_id: jvId || null,
        })
      }
    }
  }

  // Step D: Upsert Accounts Payable record for this PO
  if (financials.apTotalDebt > 0) {
    let vendorName = po.vendors?.vendor_name || po.custom_vendor_name || ''
    if (!vendorName && po.vendor_id) {
      const { data: vnd } = await client
        .from('vendors')
        .select('vendor_name')
        .eq('id', po.vendor_id)
        .maybeSingle()
      vendorName = vnd?.vendor_name || ''
    }

    const invoiceNo =
      String(po.vendor_tax_invoice_no || '').trim() || resolvedGrnNo || po.po_no || ''

    const { data: existingAp } = await client
      .from('accounts_payable')
      .select('id, paid_amount')
      .eq('po_id', po.id)
      .limit(1)
      .maybeSingle()

    const effectivePaid = round2(Math.max(financials.paidAmount, Number(existingAp?.paid_amount || 0)))
    const effectiveRemaining = Math.max(0, round2(financials.apTotalDebt - effectivePaid))
    const effectiveStatus =
      effectiveRemaining <= 0.05 && financials.apTotalDebt > 0
        ? 'paid'
        : effectivePaid > 0
        ? 'partial'
        : 'pending'

    const apPayload = {
      ap_no: `AP-${po.po_no || resolvedGrnNo}`,
      po_id: po.id,
      po_no: po.po_no || null,
      vendor_id: po.vendor_id || null,
      vendor_name: vendorName || 'ผู้จำหน่าย/คู่ค้า',
      invoice_no: invoiceNo,
      invoice_date: financials.invoiceDate,
      due_date: financials.dueDate,
      credit_days: financials.creditDays,
      total_debt: financials.apTotalDebt,
      paid_amount: effectivePaid,
      remaining_amount: effectiveRemaining,
      status: effectiveStatus,
      alert_level: 'normal',
      updated_at: new Date().toISOString(),
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = existingAp?.id
        ? await client.from('accounts_payable').update(apPayload).eq('id', existingAp.id)
        : await client.from('accounts_payable').insert([apPayload])

      if (!res.error) break
      const msg = res.error?.message || ''
      if (!existingAp?.id && (msg.includes('duplicate key') || msg.includes('ap_no'))) {
        apPayload.ap_no = `AP-${po.po_no || resolvedGrnNo}-${Math.floor(100 + Math.random() * 900)}`
        continue
      }
      if (msg.includes('vendor_id') && msg.includes('foreign key')) {
        apPayload.vendor_id = null
        continue
      }
      const colMatch =
        msg.match(/column "(.*?)" of relation "accounts_payable" does not exist/i) ||
        msg.match(/Could not find the '(.*?)' column of 'accounts_payable'/i)
      if (colMatch && colMatch[1]) {
        delete apPayload[colMatch[1]]
        continue
      }
      console.warn('accounts_payable sync warning:', msg)
      break
    }
  }

  return { ok: true, grnId: resolvedGrnId, grnNo: resolvedGrnNo, financials }
}
