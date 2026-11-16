import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageStore, formatIntQty, toIntQty } from '../../lib/store'
import { baht } from '../../lib/projects'
import { ArrowLeft } from 'lucide-react'
import SearchableItemSelect from '../../components/SearchableItemSelect'
import SearchableProjectSelect from '../../components/SearchableProjectSelect'

const TYPE = { receipt: 'รับเข้าสโตร์', adjustment: 'ปรับปรุงสต็อก', migration: 'ยกมา' }

export default function ReceiptsList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canManageStore(profile?.role)

  const [rows, setRows] = useState(null)
  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [showStockInForm, setShowStockInForm] = useState(false)
  const [docViewMode, setDocViewMode] = useState('business') // 'business' | 'accounting'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state สำหรับรับวัสดุเข้าโดยตรง
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [projectId, setProjectId] = useState('')
  const [vendorTaxInvoiceNo, setVendorTaxInvoiceNo] = useState('')
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(new Date().toISOString().slice(0, 10))

  const loadData = useCallback(() => {
    supabase.from('stock_lots')
      .select('id, lot_type, received_date, qty_received, qty_remaining, unit_cost, inventory_items(id, item_code, item_name, unit), projects(project_code, project_name), goods_receipt_items(goods_receipts(grn_no, purchase_orders(po_no)))')
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => (error ? setError('โหลดไม่สำเร็จ') : setRows(data ?? [])))

    supabase.from('inventory_items')
      .select('id, item_code, item_name, unit, qty_on_hand, avg_unit_cost')
      .order('item_name')
      .then(({ data }) => setItems(data ?? []))

    supabase.from('projects')
      .select('id, project_code, project_name')
      .order('project_code')
      .then(({ data }) => setProjects(data ?? []))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedItem = items.find((i) => i.id === selectedItemId)

  const handleItemSelect = (id) => {
    setSelectedItemId(id)
    const it = items.find((i) => i.id === id)
    if (it && it.avg_unit_cost && !unitPrice) {
      setUnitPrice(String(it.avg_unit_cost))
    }
  }

  // ฟังก์ชันบันทึกรับวัสดุเข้าสโตร์โดยตรง
  async function handleDirectStockIn() {
    if (!selectedItemId) return setError('กรุณาเลือกวัสดุที่ต้องการรับเข้า')
    const quantity = toIntQty(qty)
    const price = Number(unitPrice)
    if (!quantity || quantity <= 0) return setError('จำนวนต้องมากกว่า 0')
    if (isNaN(price) || price < 0) return setError('ราคาต่อชิ้นไม่ถูกต้อง')

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const it = selectedItem || {}
      const curQty = Number(it.qty_on_hand || 0)
      const curAvg = Number(it.avg_unit_cost || 0)
      const newQty = curQty + quantity
      const newAvg = newQty > 0 ? Math.round(((curQty * curAvg) + (quantity * price)) / newQty * 100) / 100 : price

      // 1. บันทึกล็อต
      await supabase.from('stock_lots').insert({
        item_id: selectedItemId,
        source_project_id: projectId || null,
        lot_type: 'receipt',
        qty_received: quantity,
        qty_remaining: quantity,
        unit_cost: price,
        received_date: taxInvoiceDate || new Date().toISOString().split('T')[0],
      })

      // 2. อัปเดตสต็อกคงเหลือ
      await supabase.from('inventory_items').update({
        qty_on_hand: newQty,
        avg_unit_cost: newAvg,
      }).eq('id', selectedItemId)

      setSuccess(`รับเข้า "${selectedItem?.item_name}" จำนวน ${quantity} ${selectedItem?.unit || ''} (ราคา @${baht(price)} บ.) เรียบร้อย พร้อมบันทึกทางบัญชี`)
      setTimeout(() => setSuccess(''), 4000)
      setSelectedItemId('')
      setQty('')
      setUnitPrice('')
      setProjectId('')
      setVendorTaxInvoiceNo('')
      setShowStockInForm(false)
      loadData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'บันทึกรับเข้าไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (!rows) return <p className="text-steel-500">{error || 'กำลังโหลดประวัติรับเข้า...'}</p>
  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) => !q || (r.inventory_items?.item_name ?? '').toLowerCase().includes(q) || (r.inventory_items?.item_code ?? '').toLowerCase().includes(q))
  const totalValue = shown.reduce((s, r) => s + Number(r.qty_received) * Number(r.unit_cost), 0)

  return (
    <div className="space-y-4">
      {/* ส่วนหัว และปุ่มรับเข้า */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3 py-1.5 text-xs font-bold text-steel-700 shadow-2xs transition flex items-center gap-1 cursor-pointer"
            title="ย้อนกลับ"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ย้อนกลับ</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-ink">ประวัติการรับวัสดุเข้าสโตร์ (Goods Receipts - RI)</h2>
            <p className="text-xs text-steel-500">แสดงรายการล็อตที่รับเข้าสโตร์ ทั้งจากใบสั่งซื้อ (PO) และรับเข้าโดยตรง พร้อมผูก General Ledger</p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowStockInForm(!showStockInForm)}
            className="btn-primary flex items-center gap-1.5 shadow-sm !py-2"
          >
            <span>{showStockInForm ? '▲ ซ่อนแบบฟอร์ม' : '📥 + รับวัสดุเข้าสโตร์โดยตรง'}</span>
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

      {/* ฟอร์มรับวัสดุเข้าสโตร์โดยตรง */}
      {showStockInForm && canEdit && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-5 shadow-sm transition space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-emerald-200">
            <div>
              <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                <span>📥 บันทึกรับวัสดุเข้าสโตร์ (Direct Stock-In & Tax Invoice)</span>
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                ระบุจำนวน ราคาต่อหน่วย เลขที่ใบกำกับภาษี และโครงการที่ตัดต้นทุน (P&L Allocation)
              </p>
            </div>
            <button
              onClick={() => setShowStockInForm(false)}
              className="text-xs text-steel-500 hover:text-black"
            >
              ✕ ปิด
            </button>
          </div>

          {/* แถวที่ 1: เลขที่ใบกำกับภาษี และวันที่ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-emerald-200">
            <div>
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                เลขที่ใบกำกับภาษี / ใบส่งของอ้างอิงของผู้ขาย (Vendor Tax Invoice No.)
              </label>
              <input
                type="text"
                placeholder="เช่น TAX-SCG-99812"
                className="input w-full text-xs font-mono"
                value={vendorTaxInvoiceNo}
                onChange={(e) => setVendorTaxInvoiceNo(e.target.value)}
              />
              <span className="text-[10px] text-steel-500">สำหรับบันทึกภาษีซื้อ (Input VAT) และการตรวจสอบสโตร์</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                วันที่ใบกำกับภาษี / วันที่รับของจริง
              </label>
              <input
                type="date"
                className="input w-full text-xs"
                value={taxInvoiceDate}
                onChange={(e) => setTaxInvoiceDate(e.target.value)}
              />
            </div>
          </div>

          {/* แถวที่ 2: วัสดุ, จำนวน, ราคา, โครงการ */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-emerald-950 mb-1">
                ค้นหาและเลือกวัสดุที่รับเข้า *
              </label>
              <SearchableItemSelect
                items={items}
                value={selectedItemId}
                onChange={handleItemSelect}
                placeholder="พิมพ์ค้นหารหัส หรือชื่อพัสดุ..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 mb-1">
                จำนวนที่รับเข้า * {selectedItem?.unit ? `(${selectedItem.unit})` : ''}
              </label>
              <input
                className="input w-full text-xs font-bold text-ink"
                type="number"
                min="1"
                step="1"
                placeholder="ระบุจำนวนเต็ม"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 mb-1">
                ราคาต่อชิ้น / ต่อหน่วย (บาท) *
              </label>
              <input
                className="input w-full text-xs font-bold text-ink"
                type="number"
                min="0"
                step="0.01"
                placeholder="ราคาต่อหน่วย"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 mb-1">
                โครงการที่ตัดต้นทุน (ถ้ามี)
              </label>
              <SearchableProjectSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                placeholder="ค้นหาโครงการ (เว้นว่าง = ของกลางบริษัท)..."
              />
            </div>
          </div>

          {selectedItem && Number(qty) > 0 && Number(unitPrice) >= 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white p-3 border border-emerald-200 text-xs">
              <div className="space-x-2 text-emerald-900">
                <span>วัสดุ: <b>{selectedItem.item_name}</b></span>
                <span>· รับเข้า: <b>{qty} {selectedItem.unit}</b> @ <b>{baht(unitPrice)} บาท</b></span>
              </div>
              <div className="font-bold text-sm text-emerald-950">
                มูลค่ารับเข้ารวม: <b>{baht(Number(qty) * Number(unitPrice))}</b> บาท
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost !py-1.5 text-xs"
              onClick={() => setShowStockInForm(false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn-primary !py-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleDirectStockIn}
              disabled={saving || !selectedItemId || !Number(qty) || Number(unitPrice) < 0}
            >
              {saving ? 'กำลังบันทึก...' : '📥 ยืนยันรับเข้าสโตร์และบันทึกบัญชี'}
            </button>
          </div>
        </div>
      )}

      {/* แถบตัวกรองมุมมอง Dual-Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 bg-white p-3 rounded-lg border border-steel-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-steel-700">มุมมอง:</span>
          <button
            onClick={() => setDocViewMode('business')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${
              docViewMode === 'business' ? 'bg-sky-700 text-white shadow-sm' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            📁 เอกสารสโตร์
          </button>
          <button
            onClick={() => setDocViewMode('accounting')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${
              docViewMode === 'accounting' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            ⚖️ เอกสารบัญชีสต็อก (RI / GL)
          </button>
        </div>

        <input
          className="input max-w-xs text-xs"
          placeholder="ค้นหารหัส / ชื่อวัสดุ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="text-xs text-steel-600 flex justify-between">
        <span>มูลค่ารับเข้ารวม (ที่แสดง): <b>{baht(totalValue)}</b> บาท</span>
        <span>แสดง {shown.length} รายการ</span>
      </div>

      {/* ตารางแสดงล็อตรับเข้าพร้อม Dual Status Badges */}
      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-xs border border-steel-200">
        <table className="w-full text-xs sm:text-sm min-w-[1050px]">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50/80 text-left text-steel-600 text-xs font-bold uppercase tracking-wider">
              <th className="py-3 px-3 whitespace-nowrap">วันที่รับเข้า</th>
              <th className="py-3 px-3 whitespace-nowrap">รหัสวัสดุ</th>
              <th className="py-3 px-3 min-w-[200px]">ชื่อวัสดุ / อุปกรณ์</th>
              <th className="py-3 px-3 whitespace-nowrap">ที่มาการรับเข้า</th>
              <th className="py-3 px-3 whitespace-nowrap">โครงการต้นทาง</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">จำนวนรับเข้า</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">คงเหลือในล็อต</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">ราคา/ชิ้น (บาท)</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">มูลค่ารับเข้า</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">สถานะธุรกิจ</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">สถานะบัญชี (GL)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-steel-400 text-xs">
                  ไม่พบรายการรับเข้า
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const grn = r.goods_receipt_items?.[0]?.goods_receipts
                return (
                  <tr key={r.id} className="hover:bg-steel-50/80 transition text-xs">
                    {/* วันที่รับเข้า (อยู่บรรทัดเดียว ไม่ตัดบรรทัด) */}
                    <td className="py-3 px-3 font-mono text-steel-700 whitespace-nowrap font-medium">
                      {r.received_date}
                    </td>

                    {/* รหัสพัสดุ (อยู่บรรทัดเดียว) */}
                    <td className="py-3 px-3 font-mono font-bold text-steel-900 whitespace-nowrap">
                      {r.inventory_items?.item_code}
                    </td>

                    {/* ชื่อวัสดุ */}
                    <td className="py-3 px-3 font-bold text-steel-900 min-w-[200px]">
                      {r.inventory_items?.item_name}
                    </td>

                    {/* ที่มาการรับเข้า */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {grn?.grn_no ? (
                        <span className="font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                          {grn.grn_no}
                        </span>
                      ) : (
                        <span className="text-steel-600 bg-steel-100 px-2 py-0.5 rounded text-[11px] font-medium">
                          {TYPE[r.lot_type] ?? r.lot_type}
                        </span>
                      )}
                    </td>

                    {/* โครงการต้นทาง */}
                    <td className="py-3 px-3 text-steel-700 text-xs whitespace-nowrap">
                      {r.projects ? (
                        <span className="font-medium">
                          {r.projects.project_code} {r.projects.project_name}
                        </span>
                      ) : (
                        <span className="text-steel-500">ของกลางบริษัท</span>
                      )}
                    </td>

                    {/* จำนวนรับเข้า (อยู่บรรทัดเดียวกัน เช่น 5 ตู้) */}
                    <td className="py-3 px-3 text-right font-bold text-steel-900 whitespace-nowrap">
                      <span className="font-mono text-sm">{formatIntQty(r.qty_received)}</span>{' '}
                      <span className="text-xs text-steel-500 font-normal">{r.inventory_items?.unit}</span>
                    </td>

                    {/* คงเหลือในล็อต */}
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 font-bold whitespace-nowrap">
                      {formatIntQty(r.qty_remaining)}
                    </td>

                    {/* ราคา/ชิ้น */}
                    <td className="py-3 px-3 text-right font-mono text-steel-800 whitespace-nowrap">
                      {baht(r.unit_cost)}
                    </td>

                    {/* มูลค่ารับเข้า */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-steel-900 whitespace-nowrap">
                      {baht(Number(r.qty_received) * Number(r.unit_cost))}
                    </td>

                    {/* สถานะธุรกิจ */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="bg-sky-50 text-sky-800 px-2.5 py-1 rounded-full text-[10px] font-bold border border-sky-200">
                        {TYPE[r.lot_type] ?? 'รับเข้าสโตร์'}
                      </span>
                    </td>

                    {/* สถานะบัญชี */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-200">
                        ✅ ลงบัญชีแล้ว (RI)
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
