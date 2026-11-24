import { useState } from 'react'
import {
  X,
  Printer,
  ArrowUpFromLine,
  RotateCcw,
  TrendingDown,
  Calendar,
  Clock,
  Briefcase,
  Building2,
  MapPin,
  User,
  Package,
  FileText,
  CheckCircle2,
  DollarSign,
  Layers,
  Info
} from 'lucide-react'
import { baht } from '../../lib/projects'
import { formatIntQty } from '../../lib/store'
import { printElement } from '../../lib/printElement'

export default function IssueDetailModal({ record, onClose }) {
  if (!record) return null

  const isIssue = record.kind === 'issue'
  const isReturn = record.kind === 'return'
  const isAdjust = record.kind === 'adjust'

  const handlePrint = () => {
    const docTitle = `${isIssue ? 'ใบเบิกพัสดุ' : isReturn ? 'ใบรับคืนพัสดุ' : 'ใบปรับยอดพัสดุ'}-${record.code}`
    printElement('printable-report', docTitle)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-steel-200 dark:border-slate-800 overflow-hidden text-steel-800 dark:text-slate-100">
        
        {/* 1. Header ระดับบริหาร สไตล์โมดัลมาตรฐาน (#0f172a เหมือนทะเบียนคู่ค้า) */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-[#0f172a] px-5 sm:px-6 py-4 text-white gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                isIssue
                  ? 'bg-amber-500/20 text-amber-400 border-amber-400/30'
                  : isReturn
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-400/30'
              }`}
            >
              {isIssue ? (
                <ArrowUpFromLine className="h-5 w-5" />
              ) : isReturn ? (
                <RotateCcw className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-mono text-lg sm:text-xl font-black text-white tracking-tight">
                  {record.code}
                </h3>
                {isIssue ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/30">
                    <ArrowUpFromLine className="h-3 w-3" />
                    <span>เบิกของ (Material Requisition)</span>
                  </span>
                ) : isReturn ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-400/30">
                    <RotateCcw className="h-3 w-3" />
                    <span>คืนของเข้าสโตร์ (Material Return)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/25 px-2.5 py-0.5 text-xs font-bold text-rose-300 border border-rose-400/30">
                    <TrendingDown className="h-3 w-3" />
                    <span>ตัดชำรุด/ปรับยอด (Stock Adjustment)</span>
                  </span>
                )}
                <span className="rounded bg-sky-500/15 border border-sky-400/25 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                  STORE VOUCHER
                </span>
              </div>

              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{record.dateTimeStr}</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>ผู้ทำรายการ: <strong className="text-slate-200">{record.userName}</strong></span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              title="พิมพ์เอกสารใบเบิก-คืนพัสดุ"
            >
              <Printer className="h-3.5 w-3.5 text-amber-400" />
              <span>พิมพ์เอกสาร</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              title="ปิดหน้าต่าง (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2. Quick Metrics Bar (แถบสรุปตัวเลข 4 ช่อง เหมือนในรูปโมดัลคู่ค้า) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-steel-200 dark:border-slate-800 bg-steel-50/70 dark:bg-slate-800/60 p-3.5 text-xs gap-3">
          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">ประเภทรายการ</div>
            <div className="font-bold text-sm text-steel-900 dark:text-slate-100 mt-0.5">
              {isIssue ? 'เบิกไปใช้งาน' : isReturn ? 'รับคืนเข้าสโตร์' : 'ปรับยอดสต็อก'}
            </div>
          </div>

          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">จำนวนพัสดุในเอกสาร</div>
            <div className="font-bold text-sm text-sky-700 dark:text-sky-400 font-mono mt-0.5">
              {record.items.length} รายการ
            </div>
          </div>

          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">มูลค่ารวมทั้งสิ้น</div>
            <div
              className={`font-black text-sm font-mono mt-0.5 ${
                isReturn
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : isIssue
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {baht(record.totalAmount)} บ.
            </div>
          </div>

          <div className="px-3">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">ปลายทาง / โครงการ</div>
            <div className="font-bold text-xs text-steel-800 dark:text-slate-200 truncate mt-0.5" title={record.projectName || record.targetType}>
              {record.projectName ? (
                <span>[{record.projectCode}] {record.projectName}</span>
              ) : record.targetType === 'office' ? (
                <span>ออฟฟิศส่วนกลาง</span>
              ) : (
                <span>ของกลางบริษัท</span>
              )}
            </div>
          </div>
        </div>

        {/* 3. เนื้อหาหลักในโมดัล (Scrollable Body) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* ข้อมูล 2 การ์ด (ปลายทาง & ข้อมูลการออกเอกสาร) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* การ์ดซ้าย: ข้อมูลโครงการและปลายทาง */}
            <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-steel-100 dark:border-slate-800 pb-2 text-xs font-bold text-steel-900 dark:text-slate-100 uppercase tracking-wider">
                <Briefcase className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>ข้อมูลโครงการและปลายทาง (Destination)</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-steel-400 dark:text-slate-400">โครงการในระบบ:</span>
                  <div className="font-bold text-steel-900 dark:text-white mt-0.5">
                    {record.projectName ? (
                      <span className="text-sky-700 dark:text-sky-400">
                        [{record.projectCode}] {record.projectName}
                      </span>
                    ) : (
                      <span className="text-steel-500 dark:text-slate-400">ไม่ได้ผูกกับโครงการ (เบิกใช้งานทั่วไป)</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-steel-400 dark:text-slate-400">วัตถุประสงค์ปลายทาง:</span>
                    <div className="font-semibold text-steel-800 dark:text-slate-200 mt-0.5">
                      {record.targetType === 'office' ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                          <Building2 className="h-3 w-3" /> ออฟฟิศส่วนกลาง
                        </span>
                      ) : record.targetType === 'site' ? (
                        <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-bold">
                          <MapPin className="h-3 w-3" /> หน้างานโครงการ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <Briefcase className="h-3 w-3" /> งานโครงการวิศวกรรม
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-steel-400 dark:text-slate-400">สถานที่ส่งมอบ/แผนก:</span>
                    <div className="font-medium text-steel-800 dark:text-slate-200 mt-0.5">
                      {record.targetLocation || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* การ์ดขวา: ผู้ทำรายการและหมายเหตุ */}
            <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-steel-100 dark:border-slate-800 pb-2 text-xs font-bold text-steel-900 dark:text-slate-100 uppercase tracking-wider">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>รายละเอียดและหมายเหตุ (Voucher Notes)</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-steel-400 dark:text-slate-400">ผู้ทำรายการ (Staff):</span>
                    <div className="font-bold text-steel-900 dark:text-slate-100 mt-0.5 flex items-center gap-1">
                      <User className="h-3 w-3 text-steel-400" />
                      <span>{record.userName}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-steel-400 dark:text-slate-400">วันที่ทำรายการ:</span>
                    <div className="font-mono font-semibold text-steel-800 dark:text-slate-200 mt-0.5">
                      {record.dateTimeStr}
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <span className="text-steel-400 dark:text-slate-400">หมายเหตุ / วัตถุประสงค์การเบิก-คืน:</span>
                  <div className="mt-1 p-2.5 rounded-xl border border-steel-200 dark:border-slate-700 bg-steel-50/70 dark:bg-slate-800/80 text-steel-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-line font-medium min-h-[44px]">
                    {record.notes || record.reason || 'ไม่มีระบุหมายเหตุเพิ่มเติม'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ตารางรายการพัสดุ (Itemized Materials Table) */}
          <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden space-y-0">
            <div className="bg-steel-50/90 dark:bg-slate-800/90 px-4 py-3 border-b border-steel-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h4 className="text-xs font-bold text-steel-900 dark:text-white uppercase tracking-wider">
                  รายการพัสดุที่{isIssue ? 'เบิก' : isReturn ? 'คืนเข้าสโตร์' : 'ปรับยอด'} ({record.items.length} รายการ)
                </h4>
              </div>
              <span className="text-[11px] font-mono text-steel-500 dark:text-slate-400">
                เอกสาร: <b>{record.code}</b>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-steel-200 dark:divide-slate-800">
                <thead className="bg-steel-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-steel-700 dark:text-slate-300 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-32 font-mono">รหัสพัสดุ</th>
                    <th className="py-2.5 px-3">ชื่อรายการพัสดุ</th>
                    <th className="py-2.5 px-3 text-right w-24">จำนวน</th>
                    <th className="py-2.5 px-3 text-center w-20">หน่วย</th>
                    <th className="py-2.5 px-3 text-right w-28">ต้นทุน/หน่วย</th>
                    <th className="py-2.5 pl-3 pr-4 text-right w-36">มูลค่ารวม (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
                  {record.items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-steel-50/50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-2.5 pl-4 pr-2 text-center font-mono text-steel-400 text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-steel-700 dark:text-amber-400 whitespace-nowrap">
                        {it.code || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-steel-900 dark:text-slate-100">
                        {it.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-steel-900 dark:text-white">
                        {formatIntQty(it.quantity)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-steel-600 dark:text-slate-400">
                        {it.unit || 'ชิ้น'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-steel-600 dark:text-slate-400">
                        {baht(it.unitCost)}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right font-mono font-bold text-steel-900 dark:text-white">
                        {baht(it.totalCost)} บ.
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-steel-50 dark:bg-slate-800/80 font-bold border-t border-steel-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={5} className="py-3 pl-4 text-right text-steel-700 dark:text-slate-300">
                      มูลค่ารวมทั้งสิ้น (Grand Total):
                    </td>
                    <td colSpan={2} className="py-3 pl-3 pr-4 text-right font-mono text-base font-black text-sky-800 dark:text-sky-400">
                      {baht(record.totalAmount)} บาท
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* สมการสต็อกสำหรับกรณีคืนของหรือปรับยอด */}
            {(isReturn || isAdjust) && record.qtyBefore !== undefined && (
              <div className="border-t border-steel-200 dark:border-slate-800 bg-steel-50/60 dark:bg-slate-800/60 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-steel-700 dark:text-slate-300">
                  สมการเปลี่ยนแปลงจำนวนสต็อกคงเหลือ:
                </span>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="rounded bg-white dark:bg-slate-700 px-2.5 py-1 border border-steel-200 dark:border-slate-600 font-semibold">
                    ยอดก่อนทำรายการ: <b>{formatIntQty(record.qtyBefore)}</b> {record.items[0]?.unit}
                  </span>
                  <span className="font-bold text-steel-400">
                    {isReturn ? '+' : '-'}
                  </span>
                  <span
                    className={`rounded px-2.5 py-1 font-bold ${
                      isReturn
                        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                    }`}
                  >
                    {isReturn ? `รับคืน: +${formatIntQty(record.diffQty)}` : `ปรับลด: -${formatIntQty(record.diffQty)}`}{' '}
                    {record.items[0]?.unit}
                  </span>
                  <span className="font-bold text-steel-400">=</span>
                  <span className="rounded bg-steel-900 text-white dark:bg-white dark:text-slate-900 px-2.5 py-1 font-black">
                    ยอดสต็อกคงเหลือสุทธิ: {formatIntQty(record.qtyAfter)} {record.items[0]?.unit}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Footer */}
        <div className="flex items-center justify-between border-t border-steel-200 dark:border-slate-800 bg-steel-50 dark:bg-slate-900 px-6 py-3.5 text-xs">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            <span>สถานะ: ตัดยอดสต็อกและบันทึกประวัติสมบูรณ์ (Completed)</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-100 dark:hover:bg-slate-700 px-4 py-2 font-bold text-steel-800 dark:text-slate-200 transition cursor-pointer shadow-2xs"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  )
}
