import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Building2, User, Search, Plus, MoreVertical, Eye, Edit3, Trash2,
  Printer, CheckCircle2, XCircle, FileText, Package, RefreshCw, Filter, Phone, Mail, Users, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import ContactFormModal from './ContactFormModal'
import ContactDetailModal from './ContactDetailModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import Pagination from '../../components/Pagination'
import TableSortFilter from '../../components/TableSortFilter'

export default function ContactsPage() {
  const [params, setSearchParams] = useSearchParams()
  const initialRole = params.get('role') || 'all' // 'all' | 'customer' | 'vendor' | 'both'

  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [roleFilter, setRoleFilter] = useState(initialRole)
  const [entityFilter, setEntityFilter] = useState('all') // 'all' | 'corporate' | 'individual'

  const CONTACTS_SORT_OPTIONS = [
    { value: 'name_asc', label: 'ชื่อคู่ค้า/บริษัท ก  ฮ (A  Z)' },
    { value: 'name_desc', label: 'ชื่อคู่ค้า/บริษัท ฮ  ก (Z  A)' },
    { value: 'code_asc', label: 'รหัสคู่ค้า (น้อย  มาก: 0  9)' },
    { value: 'code_desc', label: 'รหัสคู่ค้า (มาก  น้อย: 9  0)' },
    { value: 'date_desc', label: ' เพิ่มล่าสุด (ใหม่  เก่า)' },
    { value: 'date_asc', label: ' เพิ่มก่อนหน้า (เก่า  ใหม่)' },
  ]
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 10 | 15 | 30 | 50

  // Modals
  const [selectedContactForDetail, setSelectedContactForDetail] = useState(null)
  const [selectedContactForEdit, setSelectedContactForEdit] = useState(null)
  const [selectedContactForEnvelope, setSelectedContactForEnvelope] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [actionMenuId, setActionMenuId] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      // 1. ดึงข้อมูลจากตาราง contacts
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('business_name', { ascending: true })

      if (error) {
        // Fallback: หาก contacts ยังไม่มีหรือยังไม่รัน migration ให้ดึงจาก customers และ vendors
        console.warn('Could not query contacts, falling back to customers & vendors:', error)
        const [cRes, vRes] = await Promise.all([
          supabase.from('customers').select('*'),
          supabase.from('vendors').select('*'),
        ])
        const merged = []
        ;(cRes.data || []).forEach((c) => {
          merged.push({
            id: c.id,
            contact_code: c.customer_code,
            business_name: c.customer_name,
            company_name: c.customer_name,
            tax_id: c.tax_id,
            branch_type: 'head_office',
            branch_code: '00000',
            registered_address: c.address,
            office_phone: c.phone,
            phone: c.phone,
            contact_person_name: c.contact_person,
            is_customer: true,
            is_vendor: false,
            entity_type: 'corporate',
            is_active: true,
          })
        })
        ;(vRes.data || []).forEach((v) => {
          const found = merged.find((m) => m.tax_id && m.tax_id === v.tax_id)
          if (found) {
            found.is_vendor = true
          } else {
            merged.push({
              id: v.id,
              contact_code: v.vendor_code,
              business_name: v.vendor_name,
              company_name: v.vendor_name,
              tax_id: v.tax_id,
              branch_type: 'head_office',
              branch_code: '00000',
              registered_address: v.address,
              office_phone: v.phone,
              phone: v.phone,
              contact_person_name: v.contact_person,
              is_customer: false,
              is_vendor: true,
              entity_type: 'corporate',
              is_active: true,
            })
          }
        })
        setContacts(merged)
      } else {
        setContacts(data || [])
      }
    } catch (err) {
      console.error('Error loading contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // อัปเดต roleFilter ตาม query string ถ้ามี
  useEffect(() => {
    const r = params.get('role')
    if (r) setRoleFilter(r)
  }, [params])

  // ปิด Action Menu เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside() {
      setActionMenuId(null)
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  // สถิติ KPIs
  const totalCount = contacts.length
  const customerCount = contacts.filter((c) => c.is_customer).length
  const vendorCount = contacts.filter((c) => c.is_vendor).length
  const bothCount = contacts.filter((c) => c.is_customer && c.is_vendor).length

  // กรองข้อมูล
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // ตัวกรองสถานะการใช้งาน (Soft delete)
      if (!showInactive && c.is_active === false) return false

      // ตัวกรองบทบาท
      if (roleFilter === 'customer' && !c.is_customer) return false
      if (roleFilter === 'vendor' && !c.is_vendor) return false
      if (roleFilter === 'both' && (!c.is_customer || !c.is_vendor)) return false

      // ตัวกรองประเภทนิติบุคคล / บุคคลธรรมดา
      if (entityFilter !== 'all' && c.entity_type !== entityFilter) return false

      // ตัวกรองคำค้นหา (Search query)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const bName = String(c.business_name || c.company_name || '').toLowerCase()
        const code = String(c.contact_code || '').toLowerCase()
        const tax = String(c.tax_id || '').toLowerCase()
        const person = String(c.contact_person_name || c.contact_person || '').toLowerCase()
        const phone = String(c.office_phone || c.phone || c.contact_person_mobile || '').toLowerCase()
        const addr = String(c.registered_address || c.address || '').toLowerCase()
        return bName.includes(q) || code.includes(q) || tax.includes(q) || person.includes(q) || phone.includes(q) || addr.includes(q)
      }

      return true
    })
  }, [contacts, showInactive, roleFilter, entityFilter, search])

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองหรือคำค้นหาเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [roleFilter, entityFilter, showInactive, search])

  // จัดเรียงรายการผู้ติดต่อตามมาตรฐาน (A-Z / รหัส / วันที่)
  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => {
      if (sortBy === 'name_asc') {
        const nameA = a.business_name || a.company_name || ''
        const nameB = b.business_name || b.company_name || ''
        return nameA.localeCompare(nameB, 'th')
      }
      if (sortBy === 'name_desc') {
        const nameA = a.business_name || a.company_name || ''
        const nameB = b.business_name || b.company_name || ''
        return nameB.localeCompare(nameA, 'th')
      }
      if (sortBy === 'code_asc') return (a.contact_code || '').localeCompare(b.contact_code || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.contact_code || '').localeCompare(a.contact_code || '', undefined, { numeric: true })
      if (sortBy === 'date_asc') return (a.created_at || '').localeCompare(b.created_at || '')
      // date_desc
      return (b.created_at || '').localeCompare(a.created_at || '')
    })
  }, [filteredContacts, sortBy])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedContacts.slice(start, start + pageSize)
  }, [sortedContacts, currentPage, pageSize])

  // ฟังก์ชัน Soft Delete (ระงับการใช้งาน)
  const handleToggleActive = async (contactToToggle) => {
    const nextState = contactToToggle.is_active === false ? true : false
    const actionText = nextState ? 'เปิดใช้งานคู่ค้ารายนี้อีกครั้ง?' : 'ระงับ/ปิดการใช้งานคู่ค้ารายนี้? (ประวัติธุรกรรมเดิมจะไม่ถูกลบ)'
    if (!confirm(actionText)) return

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ is_active: nextState })
        .eq('id', contactToToggle.id)

      if (error) throw error

      setContacts((prev) =>
        prev.map((c) => (c.id === contactToToggle.id ? { ...c, is_active: nextState } : c))
      )
      setActionMenuId(null)
    } catch (err) {
      alert('ไม่สามารถเปลี่ยนสถานะได้: ' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Invisible backdrop to close action menu on outside click */}
      {actionMenuId && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => setActionMenuId(null)}
        />
      )}

      {/* 1. Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            ทะเบียนคู่ค้า &amp; ผู้ติดต่อ (Contacts Hub)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            สถาปัตยกรรมรวมศูนย์ (Multi-Role) บันทึกและเรียกดูประวัติลูกค้าจากใบเสนอราคา และผู้จำหน่ายจากใบสั่งซื้อ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-600 dark:text-sky-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>เพิ่มคู่ค้า / ผู้ติดต่อใหม่</span>
          </button>
        </div>
      </div>

      {/* 2. Sleek Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setRoleFilter('all')
            setSearchParams({})
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            roleFilter === 'all'
              ? 'border-slate-800 dark:border-emerald-400 bg-white dark:bg-slate-900 ring-2 ring-slate-800/15 dark:ring-emerald-400/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            คู่ค้าทั้งหมด
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">{totalCount}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">ราย</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter('customer')
            setSearchParams({ role: 'customer' })
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            roleFilter === 'customer'
              ? 'border-sky-600 dark:border-sky-400 bg-white dark:bg-slate-900 ring-2 ring-sky-500/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-sky-300 dark:hover:border-sky-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-sky-700 dark:text-sky-400">
            ลูกค้า (Customers)
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-400 tabular-nums">{customerCount}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">ราย</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter('vendor')
            setSearchParams({ role: 'vendor' })
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            roleFilter === 'vendor'
              ? 'border-emerald-600 dark:border-emerald-400 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            ผู้จำหน่าย / ร้านค้า (Vendors)
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{vendorCount}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">ราย</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter('both')
            setSearchParams({ role: 'both' })
          }}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            roleFilter === 'both'
              ? 'border-purple-600 dark:border-purple-400 bg-white dark:bg-slate-900 ring-2 ring-purple-500/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-purple-300 dark:hover:border-purple-700 shadow-2xs'
          }`}
        >
          <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">
            ทั้งสองบทบาท (Dual Roles)
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-purple-700 dark:text-purple-400 tabular-nums">{bothCount}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">ราย</span>
          </div>
        </button>
      </div>

      {/* 3. Streamlined Single-Row Toolbar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* ค้นหา */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อบริษัท, รหัส, เลขผู้เสียภาษี 13 หลัก, ผู้ติดต่อ, โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-8 pr-8 py-1.5 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="ล้างคำค้นหา"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ตัวกรองบทบาท & ประเภท & เรียงลำดับ */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Standard Sort Filter Control */}
          <TableSortFilter
            value={sortBy}
            onChange={setSortBy}
            options={CONTACTS_SORT_OPTIONS}
          />

          {/* Entity Type Filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">ทุกประเภทกฎหมาย</option>
            <option value="corporate">นิติบุคคล (Corporate)</option>
            <option value="individual">บุคคลธรรมดา (Individual)</option>
          </select>

          {/* Toggle Inactive */}
          <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-[11px]">แสดงที่ระงับ ({contacts.filter(c => c.is_active === false).length})</span>
          </label>
        </div>
      </div>

      {/* 4. Table: Contact List (จัดระเบียบตารางทางการแบบ Modern ERP 4 คอลัมน์หลัก แสดงจบในหน้าเดียว ไม่ต้องเลื่อน >> <<) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3.5 text-center w-40 border-r border-slate-200/70 dark:border-slate-700/60 whitespace-nowrap">รหัส & บทบาท & สถานะ</th>
                <th className="py-3 px-4 border-r border-slate-200/70 dark:border-slate-700/60">ชื่อคู่ค้า / บริษัท & ข้อมูลภาษี</th>
                <th className="py-3 px-4 text-left w-56 border-r border-slate-200/70 dark:border-slate-700/60">ผู้ติดต่อ & เบอร์โทร</th>
                <th className="py-3 px-3 text-center w-24 whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-sky-600 mb-2" />
                    <p className="text-xs font-semibold">กำลังโหลดข้อมูลทะเบียนคู่ค้า...</p>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <Building2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-xs font-semibold">ไม่พบข้อมูลคู่ค้าที่ค้นหา</p>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(true)}
                      className="mt-3 inline-flex items-center gap-1 rounded-xl bg-sky-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-sky-800 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>เพิ่มคู่ค้าใหม่</span>
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((c, rowIdx) => {
                  const isMenuOpen = actionMenuId === c.id
                  const bName = c.business_name || c.company_name || 'ไม่ระบุชื่อ'
                  const branchText = c.branch_type === 'head_office' || c.branch_code === '00000'
                    ? 'สำนักงานใหญ่'
                    : `สาขา ${c.branch_code || '00001'}`

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors border-b border-slate-200 dark:border-slate-800 [&>td]:align-middle ${
                        rowIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/70 dark:bg-slate-800/40'
                      } ${
                        c.is_active === false ? 'opacity-60 bg-slate-50/40' : ''
                      } hover:!bg-amber-50/70 dark:hover:!bg-slate-750`}
                    >
                      {/* 1. รหัส & บทบาท & สถานะ (2 บรรทัดกึ่งกลาง กะทัดรัด) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400">
                            {c.contact_code || '-'}
                          </span>
                          {c.is_active !== false ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400" title="สถานะ: ใช้งาน">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400" title="สถานะ: ระงับ">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-center gap-1 flex-wrap">
                          {c.is_customer && (
                            <span className="rounded bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-1.5 py-0.2 font-bold">
                              ลูกค้า
                            </span>
                          )}
                          {c.is_vendor && (
                            <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 font-bold">
                              ผู้จำหน่าย
                            </span>
                          )}
                          <span className="text-slate-400">
                            {c.entity_type === 'individual' ? 'บุคคล' : 'นิติบุคคล'}
                          </span>
                        </div>
                      </td>

                      {/* 2. ชื่อคู่ค้า / บริษัท & ข้อมูลภาษี (คอลัมน์หลัก อ่านง่าย ชัดเจน 100%) */}
                      <td className="py-3 px-4 border-r border-slate-200/60 dark:border-slate-800/60">
                        <div
                          onClick={() => setSelectedContactForDetail(c)}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:text-sky-700 dark:hover:text-sky-400 hover:underline cursor-pointer text-sm leading-snug line-clamp-1"
                          title={bName}
                        >
                          {bName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>
                            เลขภาษี: <b className="font-mono text-slate-700 dark:text-slate-300">{c.tax_id || '-'}</b>
                          </span>
                          <span>·</span>
                          <span className="font-medium">{branchText}</span>
                          {(c.registered_address || c.address) && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[260px] text-slate-400" title={c.registered_address || c.address}>
                                {c.registered_address || c.address}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 3. ผู้ติดต่อ & เบอร์โทร (2 บรรทัด สะอาดตา) */}
                      <td className="py-3 px-4 border-r border-slate-200/60 dark:border-slate-800/60">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 text-xs" title={c.contact_person_name || c.contact_person || '-'}>
                          {c.contact_person_name || c.contact_person || 'ไม่ระบุผู้ติดต่อ'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {(c.office_phone || c.phone || c.contact_person_mobile) ? (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{c.office_phone || c.contact_person_mobile || c.phone}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* 4. การจัดการ (ตัดคำว่า 'ดู' ออกตามคำสั่งผู้ใช้ เหลือเฉพาะไอคอนกะทัดรัด) */}
                      <td className={`py-3 px-3 text-center whitespace-nowrap relative ${isMenuOpen ? 'z-40' : 'z-10'}`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedContactForDetail(c)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition border border-slate-200 dark:border-slate-700 hover:border-sky-300 cursor-pointer shadow-2xs"
                            title="ดูข้อมูลคู่ค้า & ประวัติธุรกรรม"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActionMenuId(isMenuOpen ? null : c.id)
                            }}
                            className={`inline-flex items-center justify-center h-7 w-7 rounded-lg transition cursor-pointer border ${
                              isMenuOpen
                                ? 'bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 ring-2 ring-sky-400/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
                            }`}
                            title="เมนูเพิ่มเติม"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Action Popover Menu */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1.5 z-50 min-w-[230px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-2xl text-xs space-y-1 text-left ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForDetail(c)
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:text-sky-950 dark:hover:text-sky-200 text-slate-700 dark:text-slate-200 transition cursor-pointer font-medium whitespace-nowrap leading-normal"
                            >
                              <Eye className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>ดูข้อมูล &amp; ประวัติธุรกรรม</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForEdit(c)
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/60 hover:text-amber-950 dark:hover:text-amber-200 text-slate-700 dark:text-slate-200 transition cursor-pointer font-medium whitespace-nowrap leading-normal"
                            >
                              <Edit3 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>แก้ไขข้อมูลคู่ค้า</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForEnvelope(c)
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-950 dark:hover:text-emerald-200 text-slate-700 dark:text-slate-200 transition cursor-pointer font-medium whitespace-nowrap leading-normal"
                            >
                              <Printer className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>พิมพ์จ่าหน้าซองจดหมาย</span>
                            </button>

                            <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                            <button
                              type="button"
                              onClick={() => handleToggleActive(c)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition cursor-pointer font-medium whitespace-nowrap leading-normal ${
                                c.is_active !== false
                                  ? 'hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                  : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {c.is_active !== false ? (
                                <>
                                  <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                                  <span>ระงับการใช้งาน (Soft Delete)</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  <span>เปิดใช้งานอีกครั้ง</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {!loading && filteredContacts.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-2xs">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredContacts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[10, 15, 30, 50]}
          />
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <ContactFormModal
          initialRole={roleFilter === 'customer' ? 'customer' : roleFilter === 'vendor' ? 'vendor' : 'both'}
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
        />
      )}

      {selectedContactForEdit && (
        <ContactFormModal
          contact={selectedContactForEdit}
          onClose={() => setSelectedContactForEdit(null)}
          onSaved={loadData}
        />
      )}

      {selectedContactForDetail && (
        <ContactDetailModal
          contact={selectedContactForDetail}
          onClose={() => setSelectedContactForDetail(null)}
          onEdit={(c) => setSelectedContactForEdit(c)}
        />
      )}

      {selectedContactForEnvelope && (
        <EnvelopePrintModal
          contact={selectedContactForEnvelope}
          onClose={() => setSelectedContactForEnvelope(null)}
        />
      )}
    </div>
  )
}

