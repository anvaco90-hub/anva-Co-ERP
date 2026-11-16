import { useEffect, useState } from 'react'
import { getItemProjectUsageHistory } from '../lib/purchasingHistory'
import { baht } from '../lib/projects'

export default function ItemProjectUsageModal({ item, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ byProject: [], totalPurchased: 0, totalIssued: 0 })

  useEffect(() => {
    if (!item) return
    setLoading(true)
    getItemProjectUsageHistory(item.item_name, item.id)
      .then((res) => setData(res))
      .finally(() => setLoading(false))
  }, [item])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* หัวข้อ Modal */}
        <div className="flex items-start justify-between border-b border-steel-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h3 className="text-lg font-bold text-ink">ประวัติการใช้วัสดุในโครงการต่างๆ</h3>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-steel-500">
              <span className="font-semibold text-sky-700 font-mono">[{item.item_code || 'ITM'}]</span>
              <span className="font-bold text-ink text-sm">{item.item_name}</span>
              {item.unit && <span>({item.unit})</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-steel-400 hover:bg-steel-100 hover:text-steel-600"
          >
            ✕
          </button>
        </div>

        {/* เนื้อหา */}
        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-steel-500">กำลังดึงข้อมูลประวัติการใช้...</div>
          ) : (
            <>
              {/* การ์ดสรุปยอด */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-steel-200 bg-steel-50 p-3 text-center">
                  <div className="text-xs text-steel-500">ใช้ในโครงการ</div>
                  <div className="mt-1 text-xl font-bold text-ink">{data.byProject.length} โครงการ</div>
                </div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-center">
                  <div className="text-xs text-sky-700">ยอดสั่งซื้อรวม</div>
                  <div className="mt-1 text-xl font-bold text-sky-900">
                    {data.totalPurchased} <span className="text-xs font-normal">{item.unit || ''}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="text-xs text-emerald-700">ยอดเบิกใช้จริง</div>
                  <div className="mt-1 text-xl font-bold text-emerald-900">
                    {data.totalIssued} <span className="text-xs font-normal">{item.unit || ''}</span>
                  </div>
                </div>
              </div>

              {/* ตารางแยกตามโครงการ */}
              {data.byProject.length === 0 ? (
                <div className="rounded-lg border border-dashed border-steel-200 p-6 text-center text-xs text-steel-400">
                  ยังไม่พบประวัติการสั่งซื้อหรือเบิกใช้วัสดุนี้ในโครงการใดๆ
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-steel-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-steel-100 text-steel-600">
                      <tr>
                        <th className="py-2.5 px-3">โครงการ</th>
                        <th className="text-right px-3">ยอดสั่งซื้อ (PO)</th>
                        <th className="text-right px-3">เบิกไปใช้ (Issue)</th>
                        <th className="px-3">วันที่ใช้งานล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {data.byProject.map((p) => (
                        <tr key={p.projectId} className="hover:bg-steel-50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-ink">{p.projectCode}</div>
                            <div className="text-steel-500">{p.projectName || '-'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-sky-700">
                            {p.totalPurchased > 0 ? `${p.totalPurchased} ${item.unit || ''}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                            {p.totalIssued > 0 ? `${p.totalIssued} ${item.unit || ''}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-steel-500">
                            {p.lastDate || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* ปุ่มปิด */}
        <div className="mt-5 flex justify-end border-t border-steel-100 pt-3">
          <button className="btn-primary !py-1.5 text-xs" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  )
}

