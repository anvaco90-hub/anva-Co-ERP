import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Building2, User, Search, Plus, MoreVertical, Eye, Edit3, Trash2,
  Printer, CheckCircle2, XCircle, FileText, Package, RefreshCw, Filter, Phone, Mail
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { baht } from '../../lib/projects'
import ContactFormModal from './ContactFormModal'
import ContactDetailModal from './ContactDetailModal'
import EnvelopePrintModal from '../../components/reports/EnvelopePrintModal'
import Pagination from '../../components/Pagination'

export default function ContactsPage() {
  const [params, setSearchParams] = useSearchParams()
  const initialRole = params.get('role') || 'all' // 'all' | 'customer' | 'vendor' | 'both'

  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState(initialRole)
  const [entityFilter, setEntityFilter] = useState('all') // 'all' | 'corporate' | 'individual'
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

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredContacts.slice(start, start + pageSize)
  }, [filteredContacts, currentPage, pageSize])

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
      {/* 1. Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <h1 className="text-xl sm:text-2xl font-black text-steel-900 tracking-tight">
              ทะเบียนคู่ค้า & ผู้ติดต่อ (Contacts Hub)
            </h1>
          </div>
          <p className="text-xs text-steel-500 mt-0.5">
            สถาปัตยกรรมรวมศูนย์ (Multi-Role) บันทึกและเรียกดูประวัติลูกค้าจากใบเสนอราคา และผู้จำหน่ายจากใบสั่งซื้อ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="rounded-xl border border-steel-200 bg-white p-2 text-steel-600 hover:bg-steel-50 transition shadow-2xs cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-800 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ เพิ่มคู่ค้า / ผู้ติดต่อใหม่</span>
          </button>
        </div>
      </div>

      {/* 2. Sleek Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => {
            setRoleFilter('all')
            setSearchParams({})
          }}
          className={`rounded-2xl border p-3.5 transition cursor-pointer ${
            roleFilter === 'all'
              ? 'bg-steel-900 text-white border-steel-900 shadow-md ring-2 ring-steel-700/20'
              : 'bg-white text-steel-800 border-steel-200 hover:border-steel-300 shadow-2xs'
          }`}
        >
          <div className={`text-[11px] font-bold uppercase tracking-wider ${roleFilter === 'all' ? 'text-steel-300' : 'text-steel-500'}`}>
            👥 คู่ค้าทั้งหมด
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black">{totalCount}</span>
            <span className={`text-xs ${roleFilter === 'all' ? 'text-steel-300' : 'text-steel-400'}`}>ราย</span>
          </div>
        </div>

        <div
          onClick={() => {
            setRoleFilter('customer')
            setSearchParams({ role: 'customer' })
          }}
          className={`rounded-2xl border p-3.5 transition cursor-pointer ${
            roleFilter === 'customer'
              ? 'bg-sky-700 text-white border-sky-800 shadow-md ring-2 ring-sky-500/20'
              : 'bg-white text-steel-800 border-steel-200 hover:border-sky-300 shadow-2xs'
          }`}
        >
          <div className={`text-[11px] font-bold uppercase tracking-wider ${roleFilter === 'customer' ? 'text-sky-200' : 'text-sky-700'}`}>
            🏢 ลูกค้า (Customers)
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black">{customerCount}</span>
            <span className={`text-xs ${roleFilter === 'customer' ? 'text-sky-200' : 'text-steel-400'}`}>ราย</span>
          </div>
        </div>

        <div
          onClick={() => {
            setRoleFilter('vendor')
            setSearchParams({ role: 'vendor' })
          }}
          className={`rounded-2xl border p-3.5 transition cursor-pointer ${
            roleFilter === 'vendor'
              ? 'bg-emerald-700 text-white border-emerald-800 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white text-steel-800 border-steel-200 hover:border-emerald-300 shadow-2xs'
          }`}
        >
          <div className={`text-[11px] font-bold uppercase tracking-wider ${roleFilter === 'vendor' ? 'text-emerald-200' : 'text-emerald-700'}`}>
            🏪 ผู้จำหน่าย / ร้านค้า (Vendors)
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black">{vendorCount}</span>
            <span className={`text-xs ${roleFilter === 'vendor' ? 'text-emerald-200' : 'text-steel-400'}`}>ราย</span>
          </div>
        </div>

        <div
          onClick={() => {
            setRoleFilter('both')
            setSearchParams({ role: 'both' })
          }}
          className={`rounded-2xl border p-3.5 transition cursor-pointer ${
            roleFilter === 'both'
              ? 'bg-purple-700 text-white border-purple-800 shadow-md ring-2 ring-purple-500/20'
              : 'bg-white text-steel-800 border-steel-200 hover:border-purple-300 shadow-2xs'
          }`}
        >
          <div className={`text-[11px] font-bold uppercase tracking-wider ${roleFilter === 'both' ? 'text-purple-200' : 'text-purple-700'}`}>
            🔄 ทั้งสองบทบาท (Dual Roles)
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black">{bothCount}</span>
            <span className={`text-xs ${roleFilter === 'both' ? 'text-purple-200' : 'text-steel-400'}`}>ราย</span>
          </div>
        </div>
      </div>

      {/* 3. Streamlined Single-Row Toolbar */}
      <div className="rounded-2xl border border-steel-200 bg-white p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* ค้นหา */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-steel-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อบริษัท, รหัส, เลขผู้เสียภาษี 13 หลัก, ผู้ติดต่อ, โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-steel-200 bg-steel-50/50 pl-8 pr-3 py-1.5 text-xs text-steel-900 focus:outline-none focus:border-sky-600 focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-xs text-steel-400 hover:text-steel-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* ตัวกรองบทบาท & ประเภท */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Entity Type Filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-xl border border-steel-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-steel-700 focus:outline-none"
          >
            <option value="all">ทุกประเภทกฎหมาย</option>
            <option value="corporate">🏢 นิติบุคคล (Corporate)</option>
            <option value="individual">👤 บุคคลธรรมดา (Individual)</option>
          </select>

          {/* Toggle Inactive */}
          <label className="flex items-center gap-1.5 cursor-pointer font-medium text-steel-600 bg-steel-50 px-2.5 py-1.5 rounded-xl border border-steel-200">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded text-sky-600 focus:ring-sky-500 h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-[11px]">แสดงที่ระงับ ({contacts.filter(c => c.is_active === false).length})</span>
          </label>
        </div>
      </div>

      {/* 4. Table: Contact List */}
      <div className="overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-steel-200 min-w-[900px]">
            <thead className="bg-steel-50/90 text-steel-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5 w-32">รหัส / ประเภท</th>
                <th className="py-3 px-3.5 min-w-[240px]">ชื่อคู่ค้า / บริษัท / ร้านค้า</th>
                <th className="py-3 px-3.5 w-36">เลขผู้เสียภาษี / สาขา</th>
                <th className="py-3 px-3.5 min-w-[180px]">ผู้ติดต่อ & เบอร์โทร</th>
                <th className="py-3 px-3 w-32 text-center">บทบาทในระบบ</th>
                <th className="py-3 px-3 w-28 text-center">สถานะ</th>
                <th className="py-3 px-3.5 w-24 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-steel-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-sky-600 mb-2" />
                    <p className="text-xs font-semibold">กำลังโหลดข้อมูลทะเบียนคู่ค้า...</p>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-steel-400">
                    <Building2 className="mx-auto h-8 w-8 text-steel-300 mb-2" />
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
                paginatedContacts.map((c) => {
                  const isMenuOpen = actionMenuId === c.id
                  const bName = c.business_name || c.company_name || 'ไม่ระบุชื่อ'
                  const branchText = c.branch_type === 'head_office' || c.branch_code === '00000'
                    ? 'สำนักงานใหญ่'
                    : `สาขา ${c.branch_code || '00001'}`

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-steel-50/70 transition-colors ${
                        c.is_active === false ? 'opacity-60 bg-steel-50/40' : ''
                      }`}
                    >
                      {/* 1. รหัส / ประเภท */}
                      <td className="py-3 px-3.5 align-top whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-sky-700">
                          {c.contact_code || '-'}
                        </div>
                        <div className="text-[10px] text-steel-500 mt-0.5 flex items-center gap-1">
                          {c.entity_type === 'individual' ? (
                            <span className="text-amber-700 bg-amber-50 px-1 rounded">👤 บุคคลธรรมดา</span>
                          ) : (
                            <span className="text-sky-800 bg-sky-50 px-1 rounded">🏢 นิติบุคคล</span>
                          )}
                        </div>
                      </td>

                      {/* 2. ชื่อคู่ค้า / บริษัท */}
                      <td className="py-3 px-3.5 align-top">
                        <div
                          onClick={() => setSelectedContactForDetail(c)}
                          className="font-bold text-steel-900 hover:text-sky-700 hover:underline cursor-pointer truncate max-w-sm text-sm"
                          title={bName}
                        >
                          {bName}
                        </div>
                        <div className="text-[11px] text-steel-500 truncate max-w-sm mt-0.5">
                          {c.registered_address || c.address || 'ไม่ระบุที่อยู่'}
                        </div>
                      </td>

                      {/* 3. เลขผู้เสียภาษี / สาขา */}
                      <td className="py-3 px-3.5 align-top whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-steel-800">
                          {c.tax_id || '-'}
                        </div>
                        <div className="text-[11px] text-steel-500 mt-0.5">
                          {branchText}
                        </div>
                      </td>

                      {/* 4. ผู้ติดต่อ & เบอร์โทร */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="font-semibold text-steel-800 truncate max-w-[180px]">
                          {c.contact_person_name || c.contact_person || '-'}
                        </div>
                        <div className="text-[11px] text-steel-500 mt-0.5 flex items-center gap-2">
                          {(c.office_phone || c.phone || c.contact_person_mobile) && (
                            <span className="flex items-center gap-0.5">
                              <Phone className="h-3 w-3 text-steel-400" />
                              <span>{c.office_phone || c.contact_person_mobile || c.phone}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. บทบาทคู่ค้า (Badges) */}
                      <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {c.is_customer && (
                            <span className="inline-block rounded-full bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 text-[10px] font-bold">
                              🏢 ลูกค้า
                            </span>
                          )}
                          {c.is_vendor && (
                            <span className="inline-block rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                              🏪 ผู้จำหน่าย
                            </span>
                          )}
                          {!c.is_customer && !c.is_vendor && (
                            <span className="text-steel-400 text-[10px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* 6. สถานะ */}
                      <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                        {c.is_active !== false ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            <span>ใช้งาน</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                            <span>ระงับ</span>
                          </span>
                        )}
                      </td>

                      {/* 7. การจัดการ (Action Popover) */}
                      <td className="py-3 px-3.5 align-top text-right whitespace-nowrap relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActionMenuId(isMenuOpen ? null : c.id)
                          }}
                          className="rounded-lg p-1 text-steel-500 hover:bg-steel-100 transition cursor-pointer"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {/* Action Popover Menu */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-3 top-8 z-50 w-52 rounded-xl border border-steel-200 bg-white p-1.5 shadow-xl text-xs space-y-0.5 text-left animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForDetail(c)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-steel-50 text-steel-800 transition cursor-pointer font-medium"
                            >
                              <Eye className="h-3.5 w-3.5 text-sky-600" />
                              <span>ดูข้อมูล & ประวัติธุรกรรม</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForEdit(c)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-steel-50 text-steel-800 transition cursor-pointer font-medium"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                              <span>แก้ไขข้อมูลคู่ค้า</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActionMenuId(null)
                                setSelectedContactForEnvelope(c)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-steel-50 text-steel-800 transition cursor-pointer font-medium"
                            >
                              <Printer className="h-3.5 w-3.5 text-emerald-600" />
                              <span>พิมพ์จ่าหน้าซองจดหมาย</span>
                            </button>

                            <div className="border-t border-steel-100 my-1"></div>

                            <button
                              type="button"
                              onClick={() => handleToggleActive(c)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition cursor-pointer font-medium ${
                                c.is_active !== false
                                  ? 'hover:bg-rose-50 text-rose-700'
                                  : 'hover:bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {c.is_active !== false ? (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                  <span>ระงับการใช้งาน (Soft Delete)</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
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
        <div className="rounded-2xl border border-steel-200 bg-white px-5 py-3 shadow-xs">
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

