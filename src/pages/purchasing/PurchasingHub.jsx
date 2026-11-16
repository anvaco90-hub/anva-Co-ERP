import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PR_STATUS, PO_STATUS, canCreatePurchasing, canReceiveGoods } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import Badge from './Badge'
import PaymentActionModal from '../../components/PaymentActionModal'

export default function PurchasingHub() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'pipeline' // 'pipeline' | 'pr' | 'po' | 'receipts'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [docViewMode, setDocViewMode] = useState('business') // 'business' | 'accounting'
  const [paymentTargetPo, setPaymentTargetPo] = useState(null)

  const [prs, setPrs] = useState([])
  const [pos, setPos] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ตัวกรอง
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedPrId, setExpandedPrId] = useState(null)
  const [expandedPoId, setExpandedPoId] = useState(null)

  const canCreate = canCreatePurchasing(profile.role)
  const canReceive = canReceiveGoods(profile.role)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [prsRes, posRes, projRes, venRes] = await Promise.all([
        supabase
          .from('purchase_requisitions')
          .select('id, pr_no, request_date, status, notes, project_id, projects(id, project_code, project_name), purchase_requisition_items(*)')
          .order('request_date', { ascending: false })
          .order('pr_no', { ascending: false }),
        supabase
          .from('purchase_orders')
          .select('id, po_no, pr_id, order_date, total_amount, status, buyer_name, vendor_id, project_id, vendors(id, vendor_code, vendor_name), projects(id, project_code, project_name), pr:purchase_requisitions(id, pr_no), purchase_order_items(*)')
          .order('order_date', { ascending: false })
          .order('po_no', { ascending: false }),
        supabase.from('projects').select('id, project_code, project_name').order('project_code'),
        supabase.from('vendors').select('id, vendor_code, vendor_name').order('vendor_code'),
      ])

      if (prsRes.error) throw prsRes.error
      if (posRes.error) throw posRes.error

      setPrs(prsRes.data ?? [])
      setPos(posRes.data ?? [])
      setProjects(projRes.data ?? [])
      setVendors(venRes.data ?? [])
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถโหลดข้อมูลจัดซื้อได้')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const changeTab = (tab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  // คำนวณสรุปยอด (KPIs)
  const pendingPrs = prs.filter((p) => p.status === 'pending')
  const openPos = pos.filter((p) => p.status === 'open')
  const partialPos = pos.filter((p) => p.status === 'partial')
  const totalSpend = pos.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + Number(p.total_amount || 0), 0)

  // แผนผังจับคู่ PR กับ PO
  const poByPrId = pos.reduce((acc, po) => {
    if (po.pr_id) {
      if (!acc[po.pr_id]) acc[po.pr_id] = []
      acc[po.pr_id].push(po)
    }
    return acc
  }, {})

  // ฟิลเตอร์ข้อมูล
  const q = search.trim().toLowerCase()
  const filterRow = (row, fields) => {
    if (filterProject && row.project_id !== filterProject) return false
    if (filterStatus && row.status !== filterStatus) return false
    if (!q) return true
    return fields.some((f) => String(f || '').toLowerCase().includes(q))
  }

  const filteredPrs = prs.filter((r) =>
    filterRow(r, [r.pr_no, r.projects?.project_name, r.projects?.project_code, r.notes])
  )
  const filteredPos = pos.filter((r) =>
    filterRow(r, [r.po_no, r.vendors?.vendor_name, r.projects?.project_name, r.projects?.project_code, r.pr?.pr_no, r.buyer_name])
  )
  const pendingReceipts = pos.filter((p) => ['open', 'partial'].includes(p.status) && filterRow(p, [p.po_no, p.vendors?.vendor_name, p.projects?.project_name]))

  return (
    <div className="space-y-5">
      {/* ส่วนหัว และปุ่มสร้างงาน */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">ศูนย์จัดการจัดซื้อ (PR + PO Hub)</h2>
          <p className="text-sm text-steel-500">เชื่อมโยงใบขอซื้อ (PR), ใบสั่งซื้อ (PO), และติดตามการรับสินค้าเข้าสต็อกในหน้าเดียว</p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Link to="/purchasing/pr/new" className="btn-primary flex items-center gap-1.5 shadow-sm">
              <span>+</span>
              <span>สร้างใบขอซื้อ (PR)</span>
            </Link>
            {pendingPrs.length > 0 && (
              <Link to={`/purchasing/po/new?pr=${pendingPrs[0].id}`} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
                ⚡ ออกใบสั่งซื้อ (PO) จาก PR
              </Link>
            )}
          </div>
        )}
      </div>

      {/* KPI สรุปสถานะงาน */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={() => { changeTab('pr'); setFilterStatus('pending') }}
          className={`rounded-lg border p-4 text-left transition ${filterStatus === 'pending' && activeTab === 'pr' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400' : 'border-steel-200 bg-white hover:border-amber-400'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">PR รอสั่งซื้อ</div>
          <div className="mt-1 text-2xl font-bold text-amber-900">{pendingPrs.length} <span className="text-xs font-normal text-amber-700">ใบ</span></div>
          <div className="mt-0.5 text-xs text-amber-600">รอดำเนินการออก PO</div>
        </button>

        <button
          onClick={() => { changeTab('receipts'); setFilterStatus('') }}
          className={`rounded-lg border p-4 text-left transition ${activeTab === 'receipts' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400' : 'border-steel-200 bg-white hover:border-blue-400'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">PO รอรับสินค้า</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{openPos.length} <span className="text-xs font-normal text-blue-700">ใบ</span></div>
          <div className="mt-0.5 text-xs text-blue-600">รอของส่งเข้าสโตร์</div>
        </button>

        <button
          onClick={() => { changeTab('receipts'); setFilterStatus('partial') }}
          className={`rounded-lg border p-4 text-left transition ${filterStatus === 'partial' && activeTab === 'receipts' ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-400' : 'border-steel-200 bg-white hover:border-purple-400'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-700">รับของบางส่วน</div>
          <div className="mt-1 text-2xl font-bold text-purple-900">{partialPos.length} <span className="text-xs font-normal text-purple-700">ใบ</span></div>
          <div className="mt-0.5 text-xs text-purple-600">ทยอยส่งมอบ</div>
        </button>

        <div className="rounded-lg border border-steel-200 bg-white p-4 text-left">
          <div className="text-xs font-semibold uppercase tracking-wider text-steel-500">ยอดสั่งซื้อรวม</div>
          <div className="mt-1 text-xl font-bold text-ink">{baht(totalSpend)}</div>
          <div className="mt-0.5 text-xs text-steel-500">{pos.length} ใบสั่งซื้อทั้งหมด</div>
        </div>
      </div>

      {/* แถบตัวกรองและเลือกมุมมอง */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 pb-3">
          {/* แถบสลับ Tab */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => changeTab('pipeline')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'pipeline' ? 'bg-ink text-white' : 'text-steel-600 hover:bg-steel-100'}`}
            >
              🔄 สายงาน PR ➔ PO (Pipeline)
            </button>
            <button
              onClick={() => changeTab('pr')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'pr' ? 'bg-ink text-white' : 'text-steel-600 hover:bg-steel-100'}`}
            >
              📋 ใบขอซื้อ (PR) <span className="ml-1 text-xs opacity-75">({prs.length})</span>
            </button>
            <button
              onClick={() => changeTab('po')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'po' ? 'bg-ink text-white' : 'text-steel-600 hover:bg-steel-100'}`}
            >
              🛒 ใบสั่งซื้อ (PO) <span className="ml-1 text-xs opacity-75">({pos.length})</span>
            </button>
            <button
              onClick={() => changeTab('receipts')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'receipts' ? 'bg-emerald-700 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              📦 รับสินค้าเข้าสโตร์ <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-xs font-bold text-emerald-800">{pendingReceipts.length}</span>
            </button>
          </div>

          {/* ช่องค้นหา */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:max-w-xs">
            <input
              type="text"
              placeholder="ค้นหาเลขที่, โครงการ, ร้านค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full text-xs"
            />
            {(search || filterProject || filterStatus) && (
              <button
                onClick={() => { setSearch(''); setFilterProject(''); setFilterStatus('') }}
                className="whitespace-nowrap text-xs text-red-600 hover:underline"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>

        {/* ตัวกรองรอง */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-steel-500">กรองตามโครงการ:</span>
          <select
            className="input !py-1 text-xs max-w-xs"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">ทุกโครงการ</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} {p.project_name}</option>
            ))}
          </select>

          <span className="ml-3 font-medium text-steel-500">สถานะ:</span>
          <select
            className="input !py-1 text-xs max-w-xs"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">ทุกสถานะ</option>
            {activeTab === 'pr' || activeTab === 'pipeline' ? (
              Object.entries(PR_STATUS).map(([k, v]) => (
                <option key={k} value={k}>PR: {v.label}</option>
              ))
            ) : null}
            {activeTab === 'po' || activeTab === 'receipts' || activeTab === 'pipeline' ? (
              Object.entries(PO_STATUS).map(([k, v]) => (
                <option key={k} value={k}>PO: {v.label}</option>
              ))
            ) : null}
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-lg bg-white p-8 text-center text-steel-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <>
          {/* TAB 1: มุมมองเชื่อมโยง PR ➔ PO (Pipeline) */}
          {activeTab === 'pipeline' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-steel-500">
                <span>แสดงการเชื่อมโยงจากใบขอซื้อหน้างาน (PR) สู่ใบสั่งซื้อ (PO) และการรับของ</span>
                <span>{filteredPrs.length} รายการ</span>
              </div>

              {filteredPrs.length === 0 ? (
                <div className="rounded-lg bg-white p-8 text-center text-steel-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>
              ) : (
                filteredPrs.map((pr) => {
                  const linkedPos = poByPrId[pr.id] || []
                  const isPending = pr.status === 'pending'
                  const isExpanded = expandedPrId === pr.id

                  return (
                    <div key={pr.id} className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm transition hover:border-steel-300">
                      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_auto_1.2fr]">
                        {/* ฝั่งซ้าย: ข้อมูล PR */}
                        <div className="space-y-1.5 border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                          <div className="flex items-center justify-between gap-2">
                            <Link to={`/purchasing/pr/${pr.id}`} className="text-base font-bold text-sky-700 hover:underline">
                              {pr.pr_no}
                            </Link>
                            <Badge map={PR_STATUS} status={pr.status} />
                          </div>
                          <div className="text-sm font-semibold text-ink">
                            {pr.projects?.project_code} {pr.projects?.project_name}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-steel-500">
                            <span>📅 ขอซื้อเมื่อ: {pr.request_date}</span>
                            <span>📦 {pr.purchase_requisition_items?.length || 0} รายการ</span>
                          </div>
                          {pr.notes && <div className="text-xs text-steel-600 italic">หมายเหตุ: {pr.notes}</div>}

                          <div className="pt-1 flex gap-2 text-xs">
                            <button
                              onClick={() => setExpandedPrId(isExpanded ? null : pr.id)}
                              className="text-steel-500 hover:text-ink hover:underline"
                            >
                              {isExpanded ? '▲ ซ่อนรายการวัสดุ' : '▼ ดูรายการวัสดุ'}
                            </button>
                            <Link to={`/purchasing/pr/${pr.id}`} className="text-sky-600 hover:underline">ดูรายละเอียด PR</Link>
                          </div>
                        </div>

                        {/* ตรงกลาง: สัญลักษณ์ลูกศรเชื่อมโยง */}
                        <div className="hidden lg:flex flex-col items-center justify-center self-center px-1 text-steel-400">
                          <span className="text-xl">➔</span>
                        </div>

                        {/* ฝั่งขวา: PO ที่เชื่อมโยง */}
                        <div className="space-y-2">
                          {linkedPos.length > 0 ? (
                            <div className="space-y-2">
                              {linkedPos.map((po) => (
                                <div key={po.id} className="rounded-md border border-steel-100 bg-steel-50/70 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Link to={`/purchasing/po/${po.id}`} className="font-bold text-emerald-700 hover:underline">
                                        {po.po_no}
                                      </Link>
                                      <span className="text-xs text-steel-500">({po.order_date})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm text-ink">{baht(po.total_amount)} บาท</span>
                                      <Badge map={PO_STATUS} status={po.status} />
                                    </div>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center justify-between text-xs text-steel-600">
                                    <span>🏪 ร้านค้า: <b>{po.vendors?.vendor_name || '-'}</b></span>
                                    {po.buyer_name && <span>ผู้สั่งซื้อ: {po.buyer_name}</span>}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-steel-200/60">
                                    {po.status !== 'cancelled' && (
                                      <button
                                        type="button"
                                        onClick={() => setPaymentTargetPo(po)}
                                        className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800 border border-sky-300 hover:bg-sky-100 transition shadow-xs"
                                        title="บันทึกจ่ายชำระเงิน (PAY)"
                                      >
                                        <span>💸</span>
                                        <span>จ่ายชำระ</span>
                                      </button>
                                    )}
                                    {['open', 'partial'].includes(po.status) && canReceive && (
                                      <Link
                                        to={`/purchasing/po/${po.id}`}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                                      >
                                        <span>📦</span>
                                        <span>ตรวจรับสินค้า</span>
                                      </Link>
                                    )}
                                    <Link
                                      to={`/purchasing/po/${po.id}`}
                                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-steel-700 border border-steel-300 hover:bg-steel-50 hover:text-ink transition shadow-xs"
                                    >
                                      <span>ดู PO</span>
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : isPending ? (
                            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-4 text-center">
                              <p className="text-xs text-amber-800 font-medium">ยังไม่ได้ออกใบสั่งซื้อ (รอจัดซื้อดำเนินการ)</p>
                              {canCreate && (
                                <Link
                                  to={`/purchasing/po/new?pr=${pr.id}`}
                                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                                >
                                  ⚡ ออกใบสั่งซื้อ (PO) ทันที
                                </Link>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-md border border-steel-100 p-3 text-xs text-steel-400 text-center">
                              ใบขอซื้อถูกยกเลิกแล้ว
                            </div>
                          )}
                        </div>
                      </div>

                      {/* รายการวัสดุย่อย (เมื่อกดขยาย) */}
                      {isExpanded && pr.purchase_requisition_items && (
                        <div className="mt-4 border-t border-steel-200 pt-3">
                          <div className="text-xs font-semibold text-steel-600 mb-2">รายการวัสดุที่ขอซื้อ:</div>
                          <div className="overflow-x-auto rounded border border-steel-100 bg-steel-50 p-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-left text-steel-500">
                                  <th className="py-1">ลำดับ</th>
                                  <th>ชื่อวัสดุ</th>
                                  <th className="text-right">จำนวน</th>
                                  <th>หน่วย</th>
                                  <th className="text-right">ราคาประมาณ/หน่วย</th>
                                  <th className="text-right">รวมประมาณ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pr.purchase_requisition_items.map((item, idx) => (
                                  <tr key={item.id || idx} className="border-b last:border-0 border-steel-100">
                                    <td className="py-1 text-steel-400">{idx + 1}</td>
                                    <td className="font-medium text-ink">{item.item_name}</td>
                                    <td className="text-right font-semibold">{item.quantity}</td>
                                    <td className="pl-1 text-steel-500">{item.unit || '-'}</td>
                                    <td className="text-right">{baht(item.estimated_price)}</td>
                                    <td className="text-right font-semibold">{baht((item.quantity || 0) * (item.estimated_price || 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB 2: รายการใบขอซื้อทั้งหมด (PR) */}
          {activeTab === 'pr' && (
            <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-steel-100 pb-2.5">
                <span className="text-xs font-semibold text-steel-600">รายการใบขอซื้อ ({filteredPrs.length})</span>
                {canCreate && (
                  <Link to="/purchasing/pr/new" className="btn-primary !py-1 text-xs">
                    + สร้างใบขอซื้อใหม่
                  </Link>
                )}
              </div>
              <table className="w-full text-left text-xs min-w-[1000px] divide-y divide-steel-200">
                <thead className="bg-steel-50/80 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3.5 w-32">เลขที่ PR</th>
                    <th className="py-3 px-3.5 min-w-[180px]">โครงการ</th>
                    <th className="py-3 px-3 w-28">วันที่ขอ</th>
                    <th className="py-3 px-3 w-24 text-right">จำนวนรายการ</th>
                    <th className="py-3 px-3 w-28 text-center">สถานะ</th>
                    <th className="py-3 px-3.5 min-w-[160px]">ใบสั่งซื้อที่เกี่ยวข้อง</th>
                    <th className="py-3 px-3.5 w-44 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 bg-white">
                  {filteredPrs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-steel-400">ไม่พบใบขอซื้อ</td>
                    </tr>
                  ) : (
                    filteredPrs.map((r) => {
                      const linkedPos = poByPrId[r.id] || []
                      return (
                        <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-sky-700 whitespace-nowrap">
                            <Link to={`/purchasing/pr/${r.id}`} className="hover:underline flex items-center gap-1">
                              <span>📋</span>
                              <span>{r.pr_no}</span>
                            </Link>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-steel-900">{r.projects?.project_code}</div>
                            <div className="text-xs text-steel-500 truncate max-w-[220px]">{r.projects?.project_name}</div>
                          </td>
                          <td className="py-3 px-3 text-steel-600 whitespace-nowrap">{r.request_date}</td>
                          <td className="py-3 px-3 text-right font-bold text-steel-900">{r.purchase_requisition_items?.length || 0}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap"><Badge map={PR_STATUS} status={r.status} /></td>
                          <td className="py-3 px-3.5">
                            {linkedPos.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {linkedPos.map((p) => (
                                  <Link key={p.id} to={`/purchasing/po/${p.id}`} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100">
                                    {p.po_no}
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-steel-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                              {r.status === 'pending' && canCreate && (
                                <Link
                                  to={`/purchasing/po/new?pr=${r.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                                >
                                  <span>⚡</span>
                                  <span>ออก PO</span>
                                </Link>
                              )}
                              <Link
                                to={`/purchasing/pr/${r.id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-steel-700 border border-steel-300 hover:bg-steel-50 hover:text-ink transition shadow-xs"
                              >
                                <span>รายละเอียด</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: รายการใบสั่งซื้อทั้งหมด (PO) */}
          {activeTab === 'po' && (
            <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-steel-700">มุมมอง:</span>
                  <button
                    onClick={() => setDocViewMode('business')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      docViewMode === 'business' ? 'bg-sky-700 text-white shadow-sm' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                    }`}
                  >
                    📁 เอกสารธุรกิจ
                  </button>
                  <button
                    onClick={() => setDocViewMode('accounting')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      docViewMode === 'accounting' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                    }`}
                  >
                    ⚖️ เอกสารบัญชี (AP / GL)
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-steel-600">รายการใบสั่งซื้อ ({filteredPos.length})</span>
                  {canCreate && (
                    <Link to="/purchasing/po/new" className="btn-primary !py-1 text-xs">
                      + สร้างใบสั่งซื้อ
                    </Link>
                  )}
                </div>
              </div>
              <table className="w-full text-left text-xs min-w-[1100px] divide-y divide-steel-200">
                <thead className="bg-steel-50/80 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3.5 w-32">เลขที่ PO</th>
                    <th className="py-3 px-3 w-28">อ้างอิง PR</th>
                    <th className="py-3 px-3.5 min-w-[170px]">ผู้ขาย / ร้านค้า</th>
                    <th className="py-3 px-3.5 min-w-[170px]">โครงการ</th>
                    <th className="py-3 px-3 w-28">วันที่สั่ง</th>
                    <th className="py-3 px-3.5 w-32 text-right">ยอดรวม (บาท)</th>
                    <th className="py-3 px-3 w-32 text-center">สถานะธุรกิจ</th>
                    <th className="py-3 px-3 w-36 text-center">สถานะบัญชี (GL)</th>
                    <th className="py-3 px-3.5 w-60 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 bg-white">
                  {filteredPos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-steel-400">
                        ไม่พบใบสั่งซื้อตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredPos.map((r) => {
                      const isCancelled = r.status === 'cancelled'
                      const isCompleted = r.status === 'completed'

                      return (
                        <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-emerald-700 whitespace-nowrap">
                            <Link to={`/purchasing/po/${r.id}`} className="hover:underline flex items-center gap-1">
                              <span>📄</span>
                              <span>{r.po_no}</span>
                            </Link>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {r.pr?.pr_no ? (
                              <Link to={`/purchasing/pr/${r.pr_id}`} className="font-semibold text-sky-700 hover:underline">
                                {r.pr.pr_no}
                              </Link>
                            ) : (
                              <span className="text-steel-400 text-xs">สั่งตรง</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-semibold text-steel-900">
                            <div className="truncate max-w-[200px]" title={r.vendors?.vendor_name}>
                              {r.vendors?.vendor_name || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-steel-700">
                            <div className="truncate max-w-[200px]" title={`${r.projects?.project_code || ''} ${r.projects?.project_name || ''}`}>
                              <span className="font-semibold text-steel-900">{r.projects?.project_code}</span>{' '}
                              <span className="text-steel-600">{r.projects?.project_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-steel-600 whitespace-nowrap text-xs">
                            {r.order_date}
                          </td>
                          <td className="py-3 px-3.5 text-right font-black text-steel-900 whitespace-nowrap">
                            {baht(r.total_amount)}
                          </td>

                          {/* Badge 1: Business Status */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <Badge map={PO_STATUS} status={r.status} />
                          </td>

                          {/* Badge 2: Accounting Status */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs">
                                <span>❌</span> ยกเลิก
                              </span>
                            ) : isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                                <span>✅</span> อนุมัติแล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                                <span>⏳</span> รอดำเนินการ
                              </span>
                            )}
                          </td>

                          {/* Actions Column: Neat, well-spaced action pills */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentTargetPo(r)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800 border border-sky-300 hover:bg-sky-100 transition shadow-xs"
                                  title="บันทึกจ่ายชำระเงิน (PAY)"
                                >
                                  <span>💸</span>
                                  <span>จ่ายชำระ</span>
                                </button>
                              )}
                              {['open', 'partial'].includes(r.status) && canReceive && (
                                <Link
                                  to={`/purchasing/po/${r.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                                  title="ตรวจรับสินค้าเข้าสโตร์"
                                >
                                  <span>📦</span>
                                  <span>รับของ</span>
                                </Link>
                              )}
                              <Link
                                to={`/purchasing/po/${r.id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-steel-700 border border-steel-300 hover:bg-steel-50 hover:text-steel-900 transition shadow-xs"
                                title="ดูรายละเอียดใบสั่งซื้อ"
                              >
                                <span>รายละเอียด</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ติดตามการรับสินค้าเข้าสโตร์ (Goods Receipt Track) */}
          {activeTab === 'receipts' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 shadow-xs">
                <div className="font-bold flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <span>ส่วนติดตามและตรวจรับสินค้าเข้าสโตร์ (Goods Receipts)</span>
                </div>
                <div className="mt-1 text-xs text-emerald-800">
                  แสดงรายการใบสั่งซื้อที่อยู่ระหว่างรอสินค้าส่งมอบเข้าสโตร์หลัก สามารถคลิก <b>"ตรวจรับสินค้า"</b> เพื่อบันทึกยอดรับเข้าสต็อกอัตโนมัติ
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
                <table className="w-full text-left text-xs min-w-[1000px] divide-y divide-steel-200">
                  <thead className="bg-steel-50/80 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5 w-32">เลขที่ PO</th>
                      <th className="py-3 px-3.5 min-w-[180px]">ร้านค้า</th>
                      <th className="py-3 px-3.5 min-w-[180px]">โครงการ</th>
                      <th className="py-3 px-3 w-28">วันที่สั่งซื้อ</th>
                      <th className="py-3 px-3 w-32 text-center">สถานะส่งมอบ</th>
                      <th className="py-3 px-3.5 w-32 text-right">ยอดสั่งซื้อ (บาท)</th>
                      <th className="py-3 px-3.5 w-40 text-right">การรับของ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100 bg-white">
                    {pendingReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-steel-400">
                          ✨ ไม่มีใบสั่งซื้อค้างส่งมอบ สินค้าทั้งหมดได้รับครบถ้วนแล้ว
                        </td>
                      </tr>
                    ) : (
                      pendingReceipts.map((r) => (
                        <tr key={r.id} className="hover:bg-steel-50/70 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-emerald-700 whitespace-nowrap">
                            <Link to={`/purchasing/po/${r.id}`} className="hover:underline flex items-center gap-1">
                              <span>📄</span>
                              <span>{r.po_no}</span>
                            </Link>
                            {r.pr?.pr_no && <div className="text-[11px] text-steel-500 font-normal">จาก {r.pr.pr_no}</div>}
                          </td>
                          <td className="py-3 px-3.5 font-semibold text-steel-900">
                            <div className="truncate max-w-[200px]" title={r.vendors?.vendor_name}>
                              {r.vendors?.vendor_name || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-steel-700">
                            <div className="truncate max-w-[200px]" title={`${r.projects?.project_code || ''} ${r.projects?.project_name || ''}`}>
                              <span className="font-semibold text-steel-900">{r.projects?.project_code}</span>{' '}
                              <span className="text-steel-600">{r.projects?.project_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-steel-600 whitespace-nowrap">{r.order_date}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap"><Badge map={PO_STATUS} status={r.status} /></td>
                          <td className="py-3 px-3.5 text-right font-black text-steel-900 whitespace-nowrap">{baht(r.total_amount)}</td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            {canReceive ? (
                              <Link
                                to={`/purchasing/po/${r.id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                              >
                                <span>📥</span>
                                <span>ตรวจรับสินค้า</span>
                              </Link>
                            ) : (
                              <span className="text-xs text-steel-400">รอสโตร์ตรวจรับ</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal จ่ายชำระเงิน (PAY) */}
      {paymentTargetPo && (
        <PaymentActionModal
          isOpen={true}
          type="disburse"
          docType="PO"
          docId={paymentTargetPo.id}
          docNo={paymentTargetPo.po_no}
          vendorId={paymentTargetPo.vendor_id}
          contactName={paymentTargetPo.vendors?.vendor_name}
          totalAmount={paymentTargetPo.net_amount || paymentTargetPo.total_amount}
          alreadyPaid={paymentTargetPo.deposit_paid_amount || 0}
          depositAmount={paymentTargetPo.deposit_amount || 0}
          remainingAmount={paymentTargetPo.remaining_amount || 0}
          hasDeposit={paymentTargetPo.deposit_type === 'deposit'}
          paymentStatus={paymentTargetPo.payment_status || 'รอชำระเงิน'}
          requestedChannel={paymentTargetPo.payment_channel_requested || 'transfer'}
          projectId={paymentTargetPo.project_id}
          projectName={paymentTargetPo.projects?.project_name}
          onClose={() => setPaymentTargetPo(null)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}
    </div>
  )
}

