import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BookOpen, Plus, Search, Edit2, Lock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronRight, RefreshCw, Folder, FolderOpen, Tag
} from 'lucide-react'

export const ACCOUNT_CATEGORIES = [
  { id: 'Asset', name: '1. สินทรัพย์ (Assets)', codePrefix: '1', badgeCls: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'Liability', name: '2. หนี้สิน (Liabilities)', codePrefix: '2', badgeCls: 'bg-rose-100 text-rose-800 border-rose-300' },
  { id: 'Equity', name: '3. ส่วนของเจ้าของ / ทุน (Equity)', codePrefix: '3', badgeCls: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'Revenue', name: '4. รายได้ (Revenue)', codePrefix: '4', badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'Expense', name: '5. ค่าใช้จ่ายและต้นทุน (Expenses)', codePrefix: '5', badgeCls: 'bg-amber-100 text-amber-800 border-amber-300' },
]

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [modalAccount, setModalAccount] = useState(null) // null = closed, {} = new, { id: ... } = edit
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' })

  const loadData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('account_code', { ascending: true })

      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Error loading Chart of Accounts:', err)
      setToastMsg({ text: 'ไม่สามารถโหลดผังบัญชีได้', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const toggleCategory = (catId) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }))
  }

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts
    const q = searchQuery.toLowerCase()
    return accounts.filter((acc) =>
      (acc.account_code || '').toLowerCase().includes(q) ||
      (acc.account_name_th || '').toLowerCase().includes(q) ||
      (acc.account_name_en || '').toLowerCase().includes(q)
    )
  }, [accounts, searchQuery])

  // Group by category
  const groupedAccounts = useMemo(() => {
    const groups = {}
    ACCOUNT_CATEGORIES.forEach((cat) => {
      groups[cat.id] = []
    })
    filteredAccounts.forEach((acc) => {
      if (groups[acc.account_category]) {
        groups[acc.account_category].push(acc)
      } else {
        // Fallback matching by code
        const firstDigit = (acc.account_code || '')[0]
        const matched = ACCOUNT_CATEGORIES.find((c) => c.codePrefix === firstDigit)
        if (matched) groups[matched.id].push(acc)
      }
    })
    return groups
  }, [filteredAccounts])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-steel-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <BookOpen className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold text-ink">
              ผังบัญชี (Chart of Accounts Management)
            </h1>
          </div>
          <p className="text-xs text-steel-500 mt-1">
            จัดโครงสร้างบัญชี 5 หมวดมาตรฐานธุรกิจก่อสร้างและพัฒนาอสังหาริมทรัพย์ไทย เพื่อรองรับงบการเงิน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalAccount({})}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 shadow transition"
          >
            <Plus className="h-4 w-4" />
            เพิ่มผังบัญชีใหม่ (New Account)
          </button>
        </div>
      </div>

      {toastMsg.text && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{toastMsg.text}</span>
          <button onClick={() => setToastMsg({ text: '', type: '' })} className="text-xs"></button>
        </div>
      )}

      {/* Category Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {ACCOUNT_CATEGORIES.map((cat) => {
          const count = (groupedAccounts[cat.id] || []).length
          return (
            <div
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className="p-3 bg-white rounded-xl border border-steel-200 hover:border-sky-300 transition cursor-pointer shadow-sm"
            >
              <div className="text-[11px] text-steel-500 font-medium truncate">{cat.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-base font-bold text-ink font-mono">{count} บัญชี</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cat.badgeCls}`}>
                  หมวด {cat.codePrefix}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-steel-200 shadow-sm">
        <div className="relative min-w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-steel-400" />
          <input
            type="text"
            placeholder="ค้นหารหัสบัญชี เช่น 1110, ชื่อภาษาไทย หรือ English..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-steel-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 text-steel-500 hover:text-sky-700 rounded-lg border border-steel-200 hover:bg-steel-50 transition"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Grouped Accordions by Category */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-steel-400 bg-white rounded-xl border border-steel-200">
            กำลังโหลดผังบัญชี...
          </div>
        ) : (
          ACCOUNT_CATEGORIES.map((cat) => {
            const list = groupedAccounts[cat.id] || []
            const isCollapsed = collapsedCategories[cat.id]

            return (
              <div
                key={cat.id}
                className="rounded-xl border border-steel-200 bg-white shadow-sm overflow-hidden transition"
              >
                {/* Category Accordion Header */}
                <div
                  onClick={() => toggleCategory(cat.id)}
                  className="p-3.5 bg-steel-50/80 hover:bg-steel-100/60 border-b border-steel-200 flex items-center justify-between cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-steel-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-steel-500" />
                    )}
                    <span className="font-bold text-ink text-xs sm:text-sm">{cat.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.badgeCls}`}>
                      {list.length} บัญชี
                    </span>
                  </div>

                  <span className="text-[11px] text-steel-500">
                    {isCollapsed ? 'คลิกเพื่อขยาย' : 'คลิกเพื่อย่อ'}
                  </span>
                </div>

                {/* Account Rows Table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="table-auto w-full text-left text-xs text-steel-600">
                      <thead className="bg-steel-50/80 text-steel-700 border-b border-steel-200 font-bold text-[11px]">
                        <tr>
                          <th className="w-28 px-4 py-2.5 whitespace-nowrap">รหัสบัญชี</th>
                          <th className="px-4 py-2.5 min-w-[180px]">ชื่อบัญชีภาษาไทย</th>
                          <th className="px-4 py-2.5 min-w-[180px]">ชื่อภาษาอังกฤษ (English)</th>
                          <th className="px-4 py-2.5 text-center whitespace-nowrap">ประเภทระบบ</th>
                          <th className="px-4 py-2.5 text-center whitespace-nowrap">สถานะ</th>
                          <th className="px-4 py-2.5 text-center whitespace-nowrap">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {list.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="text-center py-6 text-steel-400">
                              ไม่พบรายการบัญชีในหมวดนี้
                            </td>
                          </tr>
                        ) : (
                          list.map((acc) => (
                            <tr key={acc.id} className="hover:bg-steel-50/50 transition">
                              <td className="px-4 py-2.5 font-mono font-bold text-sky-800 whitespace-nowrap">
                                {acc.account_code}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-ink min-w-[180px]">
                                {acc.account_name_th}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-steel-500 text-[11px] min-w-[180px]">
                                {acc.account_name_en || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                {acc.is_system_default ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-steel-100 text-steel-700 px-2.5 py-0.5 rounded-full">
                                    <Lock className="h-3 w-3 text-steel-500" /> ค่าเริ่มต้นระบบ
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-sky-700 font-medium">บัญชีทั่วไป</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                {acc.is_active ? (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                                    ใช้งานปกติ
                                  </span>
                                ) : (
                                  <span className="bg-steel-100 text-steel-500 text-[10px] px-2.5 py-0.5 rounded-full font-medium">
                                    ปิดการใช้งาน
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  onClick={() => setModalAccount(acc)}
                                  className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold text-[11px] px-2 py-1 rounded hover:bg-sky-50 transition cursor-pointer"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  <span>แก้ไข</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Account Add/Edit Modal */}
      {modalAccount && (
        <AccountFormModal
          account={modalAccount}
          onClose={() => setModalAccount(null)}
          onSuccess={() => {
            setModalAccount(null)
            loadData()
            setToastMsg({ text: 'บันทึกข้อมูลผังบัญชีเรียบร้อยแล้ว', type: 'success' })
          }}
        />
      )}
    </div>
  )
}

/**
 * Modal to Add or Edit Chart of Account
 */
function AccountFormModal({ account, onClose, onSuccess }) {
  const isEdit = Boolean(account && account.id)

  const [accountCode, setAccountCode] = useState(account?.account_code || '')
  const [accountNameTh, setAccountNameTh] = useState(account?.account_name_th || '')
  const [accountNameEn, setAccountNameEn] = useState(account?.account_name_en || '')
  const [accountCategory, setAccountCategory] = useState(account?.account_category || 'Expense')
  const [isActive, setIsActive] = useState(account?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!accountCode.trim()) return setError('กรุณาระบุรหัสบัญชี')
    if (!accountNameTh.trim()) return setError('กรุณาระบุชื่อบัญชีภาษาไทย')

    setSaving(true)
    try {
      const payload = {
        account_code: accountCode.trim(),
        account_name_th: accountNameTh.trim(),
        account_name_en: accountNameEn.trim() || null,
        account_category: accountCategory,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }

      if (isEdit) {
        const { error: updErr } = await supabase
          .from('chart_of_accounts')
          .update(payload)
          .eq('id', account.id)

        if (updErr) throw updErr
      } else {
        payload.is_system_default = false
        const { error: insErr } = await supabase.from('chart_of_accounts').insert(payload)
        if (insErr) throw insErr
      }

      onSuccess()
    } catch (err) {
      console.error('Error saving account:', err)
      setError(err.message || 'บันทึกผังบัญชีไม่สำเร็จ (รหัสบัญชีอาจซ้ำ)')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-steel-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-steel-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-ink text-base">
                {isEdit ? 'แก้ไขผังบัญชี (Edit Account)' : 'เพิ่มผังบัญชีใหม่ (New Account)'}
              </h3>
              <p className="text-xs text-steel-500">
                {isEdit ? `รหัสบัญชี: ${account.account_code}` : 'กำหนดรหัสและชื่อบัญชีตามหมวดมาตรฐาน'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 text-sm"></button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-steel-700 block mb-1">หมวดหมู่บัญชี (Category) *</label>
            <select
              value={accountCategory}
              onChange={(e) => setAccountCategory(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500 bg-white font-semibold"
            >
              {ACCOUNT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-steel-700 block mb-1">รหัสบัญชี (Account Code) *</label>
            <input
              type="text"
              required
              placeholder="เช่น 5140-02"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg font-mono font-bold text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="font-bold text-steel-700 block mb-1">ชื่อบัญชีภาษาไทย *</label>
            <input
              type="text"
              required
              placeholder="เช่น ต้นทุนค่าเช่าเครื่องกำเนิดไฟฟ้าโครงการ"
              value={accountNameTh}
              onChange={(e) => setAccountNameTh(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="font-bold text-steel-700 block mb-1">ชื่อบัญชีภาษาอังกฤษ (English Name)</label>
            <input
              type="text"
              placeholder="e.g. Generator Rental Cost"
              value={accountNameEn}
              onChange={(e) => setAccountNameEn(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-ink focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-steel-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-steel-300 text-sky-600 focus:ring-sky-500"
              />
              <span>เปิดใช้งานบัญชีนี้ (Active Account)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-steel-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-steel-300 text-steel-600 rounded-lg hover:bg-steel-50 font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : ' บันทึกผังบัญชี'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

