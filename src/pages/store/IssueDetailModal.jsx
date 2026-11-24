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
  Info,
  Warehouse,
  FolderGit2
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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-steel-200 dark:border-slate-800 overflow-hidden text-steel-800 dark:text-slate-100">
        
        {/* 1. Header ระดับบริหาร สไตล์โมดัลมาตรฐาน (#0f172a เหมือนศูนย์งานขาย & ทะเบียนคู่ค้า) */}
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

              <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{record.dateTimeStr}</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>ผู้ทำรายการ: <strong className="text-slate-200">{record.userName}</strong></span>
                </span>
                {record.projectName && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-sky-300 font-medium">
                      <FolderGit2 className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span>โครงการ: <strong>[{record.projectCode}] {record.projectName}</strong></span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              title="พิมพ์เอกสารใบเบิก-คืนพัสดุ (A4 Voucher)"
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

        {/* 2. Quick Metrics Bar (แถบสรุปตัวเลข 4 ช่อง สมดุล อ่านง่าย ไม่ตัดคำ) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-steel-200 dark:border-slate-800 bg-steel-50/70 dark:bg-slate-800/60 p-3.5 text-xs gap-3">
          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">ประเภทรายการ</div>
            <div className="font-bold text-sm text-steel-900 dark:text-slate-100 mt-0.5">
              {isIssue ? 'เบิกไปใช้งาน' : isReturn ? 'รับคืนเข้าสโตร์' : 'ปรับยอดสต็อก'}
            </div>
          </div>

          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">คลังจัดเก็บ / สโตร์</div>
            <div className="font-bold text-sm text-steel-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
              <Warehouse className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>สโตร์หลัก (Main)</span>
            </div>
          </div>

          <div className="px-3 border-r border-steel-200 dark:border-slate-700">
            <div className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">จำนวนพัสดุในเอกสาร</div>
            <div className="font-bold text-sm text-sky-700 dark:text-sky-400 font-mono mt-0.5">
              {record.items.length} รายการ
            </div>
          </div>

          <div className="px-3">
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
        </div>

        {/* 3. เนื้อหาหลักในโมดัล (Scrollable Body) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          {/* การ์ดโครงการและปลายทาง (Project & Destination Card) - แถบกว้างเต็มพื้นที่ เห็นชื่อโครงการครบ 100% ไม่ถูกตัดคำ */}
          <div className="rounded-2xl border border-sky-200/80 dark:border-sky-900/60 bg-gradient-to-r from-sky-50/70 via-slate-50/40 to-blue-50/40 dark:from-slate-800/90 dark:via-slate-800/60 dark:to-sky-950/20 p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-400/20 shrink-0 mt-0.5">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider flex items-center gap-2 flex-wrap">
                    <span>โครงการในระบบ (Project Assignment)</span>
                    {record.projectCode && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300 font-bold border border-sky-300/50 dark:border-sky-700/50">
                        {record.projectCode}
                      </span>
                    )}
                  </div>
                  <div className="text-base sm:text-lg font-black text-steel-900 dark:text-white mt-1 break-words leading-snug">
                    {record.projectName ? (
                      <span className="text-steel-900 dark:text-slate-100">
                        [{record.projectCode}] {record.projectName}
                      </span>
                    ) : (
                      <span className="text-steel-500 dark:text-slate-400 font-medium text-sm">
                        ไม่ได้ผูกกับโครงการ (การเบิก/คืนใช้งานทั่วไปในองค์กร)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ป้ายกำกับปลายทางด้านขวา */}
              <div className="flex flex-wrap items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-steel-200 dark:border-slate-700/60">
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">วัตถุประสงค์ปลายทาง:</span>
                  <div className="font-semibold text-steel-800 dark:text-slate-200">
                    {record.targetType === 'office' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold">
                        <Building2 className="h-3.5 w-3.5" /> ออฟฟิศส่วนกลาง
                      </span>
                    ) : record.targetType === 'site' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-bold">
                        <MapPin className="h-3.5 w-3.5" /> หน้างานโครงการ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                        <Briefcase className="h-3.5 w-3.5" /> งานโครงการวิศวกรรม
                      </span>
                    )}
                  </div>
                </div>

                {record.targetLocation && (
                  <div className="flex flex-col gap-1 text-xs pl-3 border-l border-steel-200 dark:border-slate-700">
                    <span className="text-[11px] text-steel-500 dark:text-slate-400 font-medium">สถานที่ส่งมอบ/แผนก:</span>
                    <div className="font-semibold text-steel-800 dark:text-slate-200 px-2.5 py-1 rounded-lg bg-steel-100 dark:bg-slate-800 text-xs">
                      {record.targetLocation}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* รายละเอียดและหมายเหตุการเบิก-คืน (Voucher Notes Card) */}
          <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-steel-100 dark:border-slate-800 pb-2.5 text-xs font-bold text-steel-900 dark:text-slate-100 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>รายละเอียดและหมายเหตุ (Voucher Notes & Audit Trail)</span>
              </div>
              <span className="text-[11px] text-steel-400 font-normal normal-case">
                บันทึกเมื่อ: <strong className="font-mono text-steel-700 dark:text-slate-200">{record.dateTimeStr}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-steel-400 dark:text-slate-400">ผู้ทำรายการ (Staff):</span>
                <div className="font-bold text-steel-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-sky-500" />
                  <span>{record.userName}</span>
                </div>
              </div>

              <div>
                <span className="text-steel-400 dark:text-slate-400">คลังพัสดุ:</span>
                <div className="font-bold text-steel-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5 text-amber-500" />
                  <span>สโตร์หลัก (Main Store)</span>
                </div>
              </div>

              <div>
                <span className="text-steel-400 dark:text-slate-400">การบันทึกสถานะ:</span>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>บันทึกสต็อกและประวัติเรียบร้อย</span>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-steel-500 dark:text-slate-400 text-xs font-medium">หมายเหตุ / วัตถุประสงค์การเบิก-คืน:</span>
              <div className="mt-1.5 p-3 rounded-xl border border-steel-200 dark:border-slate-700/80 bg-steel-50/80 dark:bg-slate-800/80 text-steel-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-line font-medium min-h-[50px]">
                {record.notes || record.reason || 'ไม่มีระบุหมายเหตุเพิ่มเติม'}
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

      {/* 5. ส่วนเอกสารพิมพ์มาตรฐาน A4 (Printable A4 Report) - ดึงพิมพ์ผ่าน printElement ทันที ไม่เป็นหน้าขาว */}
      <div className="hidden">
        <div
          id="printable-report"
          className="mx-auto max-w-[210mm] bg-white p-8 text-black font-sans leading-relaxed text-xs"
        >
          {/* หัวบริษัทและชื่อเอกสาร */}
          <div className="flex justify-between items-start border-b-2 border-black pb-4">
            <div>
              <h1 className="text-base font-bold">บริษัท แอนวา คอนสตรัคชั่น แอนด์ เอ็นจิเนียริ่ง จำกัด</h1>
              <p className="text-xs text-neutral-600">ANVA CONSTRUCTION & ENGINEERING CO., LTD.</p>
              <p className="text-[11px] text-neutral-500 mt-1">บริการออกแบบ ติดตั้ง และบำรุงรักษาระบบโซล่าเซลล์และงานวิศวกรรมครบวงจร</p>
              <p className="text-[11px] text-neutral-500">เลขประจำตัวผู้เสียภาษีอากร: 0105562000000 · สำนักงานใหญ่</p>
            </div>
            <div className="text-right">
              <div className="rounded border-2 border-black bg-neutral-100 px-4 py-2 inline-block text-center">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  {isIssue ? 'ใบเบิกพัสดุ' : isReturn ? 'ใบรับคืนพัสดุเข้าสโตร์' : 'ใบปรับยอดสต็อก'}
                </h2>
                <p className="text-[10px] font-bold">
                  {isIssue ? 'MATERIAL REQUISITION SLIP' : isReturn ? 'MATERIAL RETURN SLIP' : 'STOCK ADJUSTMENT SLIP'}
                </p>
              </div>
              <div className="mt-2 text-xs space-y-0.5">
                <div>เลขที่เอกสาร: <b className="font-mono text-sm">{record.code}</b></div>
                <div>วันที่ทำรายการ: <b>{record.dateTimeStr}</b></div>
                <div>คลังสินค้า: <b>สโตร์หลัก (Main Store)</b></div>
              </div>
            </div>
          </div>

          {/* ข้อมูลโครงการ ปลายทาง และผู้ทำรายการ */}
          <div className="my-4 grid grid-cols-2 gap-4 rounded border border-neutral-300 p-3.5 text-xs">
            <div className="space-y-1.5">
              <span className="font-bold text-neutral-700 underline">ข้อมูลโครงการ / ปลายทางใช้งาน:</span>
              <div>
                โครงการ: <b>{record.projectName ? `[${record.projectCode}] ${record.projectName}` : 'ทั่วไป / ไม่ระบุโครงการ'}</b>
              </div>
              <div>
                ปลายทาง: <b>{record.targetType === 'office' ? 'ออฟฟิศส่วนกลาง' : record.targetType === 'site' ? 'หน้างานโครงการ' : 'งานโครงการวิศวกรรม'}</b>
              </div>
              {record.targetLocation && (
                <div>สถานที่ส่งมอบ / แผนก: <b>{record.targetLocation}</b></div>
              )}
            </div>

            <div className="space-y-1.5 border-l border-neutral-200 pl-4">
              <span className="font-bold text-neutral-700 underline">ข้อมูลการออกเอกสาร &amp; หมายเหตุ:</span>
              <div>เจ้าหน้าที่ผู้ทำรายการ: <b>{record.userName}</b></div>
              <div>ประเภทรายการ: <b>{isIssue ? 'เบิกของไปใช้งาน' : isReturn ? 'รับคืนของเข้าคลัง' : 'ปรับยอดสต็อก'}</b></div>
              <div className="mt-1">
                <span className="text-neutral-500">หมายเหตุ / วัตถุประสงค์:</span>
                <div className="font-medium text-neutral-800 bg-neutral-50 p-1.5 rounded border border-neutral-200 mt-0.5 leading-relaxed">
                  {record.notes || record.reason || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* ตารางรายการพัสดุ A4 */}
          <table className="w-full border-collapse text-xs my-4 border border-black">
            <thead>
              <tr className="bg-neutral-100 border-b border-black text-center font-bold">
                <th className="border-r border-black p-2 w-10">ลำดับ</th>
                <th className="border-r border-black p-2 w-28">รหัสพัสดุ</th>
                <th className="border-r border-black p-2 text-left">รายการพัสดุ / รายละเอียด</th>
                <th className="border-r border-black p-2 w-20 text-right">จำนวน</th>
                <th className="border-r border-black p-2 w-16">หน่วย</th>
                <th className="border-r border-black p-2 w-24 text-right">ต้นทุน/หน่วย</th>
                <th className="p-2 w-28 text-right">มูลค่ารวม (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((it, idx) => (
                <tr key={it.id || idx} className="border-b border-neutral-300">
                  <td className="border-r border-black p-2 text-center font-mono">{idx + 1}</td>
                  <td className="border-r border-black p-2 font-mono font-bold">{it.code || '-'}</td>
                  <td className="border-r border-black p-2 font-medium">{it.name}</td>
                  <td className="border-r border-black p-2 text-right font-mono font-bold">{formatIntQty(it.quantity)}</td>
                  <td className="border-r border-black p-2 text-center">{it.unit || 'ชิ้น'}</td>
                  <td className="border-r border-black p-2 text-right font-mono">{baht(it.unitCost)}</td>
                  <td className="p-2 text-right font-mono font-bold">{baht(it.totalCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold bg-neutral-50">
                <td colSpan={5} className="border-r border-black p-2 text-right">
                  มูลค่ารวมทั้งสิ้น (Grand Total):
                </td>
                <td colSpan={2} className="p-2 text-right font-mono text-sm font-black">
                  {baht(record.totalAmount)} บาท
                </td>
              </tr>
            </tfoot>
          </table>

          {/* สมการสต็อกถ้าเป็นคืนของ */}
          {(isReturn || isAdjust) && record.qtyBefore !== undefined && (
            <div className="rounded border border-neutral-300 p-2.5 my-3 bg-neutral-50 text-[11px] flex justify-between items-center font-mono">
              <span><b>สมการสต็อกคงเหลือ:</b> ยอดก่อนทำรายการ: {formatIntQty(record.qtyBefore)} {record.items[0]?.unit}</span>
              <span>{isReturn ? `+ รับคืน: ${formatIntQty(record.diffQty)}` : `- ปรับลด: ${formatIntQty(record.diffQty)}`} {record.items[0]?.unit}</span>
              <span>= <b>ยอดคงเหลือสุทธิ: {formatIntQty(record.qtyAfter)} {record.items[0]?.unit}</b></span>
            </div>
          )}

          {/* ช่องลงนาม 4 ฝ่าย มาตรฐานเอกสารองค์กร */}
          <div className="grid grid-cols-4 gap-3 mt-12 pt-4 border-t border-neutral-300 text-center text-[11px]">
            <div className="space-y-10">
              <div>ลงชื่อ.......................................................</div>
              <div>
                <div>( {record.userName || '...................................................'} )</div>
                <div className="text-neutral-500 font-bold mt-0.5">{isIssue ? 'ผู้ขอเบิกพัสดุ' : 'ผู้ส่งคืนพัสดุ'}</div>
                <div className="text-[10px] text-neutral-400">วันที่ ...../...../.........</div>
              </div>
            </div>

            <div className="space-y-10">
              <div>ลงชื่อ.......................................................</div>
              <div>
                <div>( ................................................... )</div>
                <div className="text-neutral-500 font-bold mt-0.5">ผู้จ่ายพัสดุ / เจ้าหน้าที่สโตร์</div>
                <div className="text-[10px] text-neutral-400">วันที่ ...../...../.........</div>
              </div>
            </div>

            <div className="space-y-10">
              <div>ลงชื่อ.......................................................</div>
              <div>
                <div>( ................................................... )</div>
                <div className="text-neutral-500 font-bold mt-0.5">ผู้รับพัสดุ / ผู้ตรวจรับ</div>
                <div className="text-[10px] text-neutral-400">วันที่ ...../...../.........</div>
              </div>
            </div>

            <div className="space-y-10">
              <div>ลงชื่อ.......................................................</div>
              <div>
                <div>( ................................................... )</div>
                <div className="text-neutral-500 font-bold mt-0.5">ผู้จัดการโครงการ / ผู้อนุมัติ</div>
                <div className="text-[10px] text-neutral-400">วันที่ ...../...../.........</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
