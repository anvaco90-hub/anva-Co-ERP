import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageStore, getCategoryPrefix, uploadItemImage, formatIntQty, toIntQty } from '../../lib/store'
import { fmtDateTime, formatDateTimeParts } from '../../lib/purchasing'
import { baht } from '../../lib/projects'
import { FieldError, fieldErrorClass } from '../../components/FieldError'
import Pagination from '../../components/Pagination'
import R2Image from '../../components/R2Image'
import TableSortFilter from '../../components/TableSortFilter'
import { discardFile } from '../../lib/files'
import {
  Package,
  Layers,
  Search,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  UploadCloud,
  Sun,
  ShieldCheck,
  Building2,
  Grid,
  List,
  ArrowLeft,
  Coins,
  ExternalLink,
} from 'lucide-react'

const NEW_ITEM = {
  item_name: '',
  unit: 'ชิ้น',
  category_id: '',
  qty_on_hand: '10',
  reorder_point: '5',
  avg_unit_cost: '',
  image_url: '',
}

const STOCK_SORT_OPTIONS = [
  { value: 'name_asc', label: 'ชื่อพัสดุ ก  ฮ (A  Z)' },
  { value: 'name_desc', label: 'ชื่อพัสดุ ฮ  ก (Z  A)' },
  { value: 'code_asc', label: 'รหัสพัสดุ (น้อย  มาก: 0  9)' },
  { value: 'code_desc', label: 'รหัสพัสดุ (มาก  น้อย: 9  0)' },
  { value: 'qty_desc', label: 'จำนวนคงเหลือ (มาก  น้อย)' },
  { value: 'qty_asc', label: 'จำนวนคงเหลือ (น้อย  มาก)' },
  { value: 'cost_desc', label: 'ต้นทุนเฉลี่ย (มาก  น้อย)' },
]

const isLow = (item) => {
  const q = Number(item.qty_on_hand || 0)
  const rop = Number(item.reorder_point || 0)
  return q > 0 && q <= rop
}

const isOut = (item) => Number(item.qty_on_hand || 0) <= 0

export default function ItemsMaster() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canManageStore(profile.role)

  const [items, setItems] = useState([])
  const [cats, setCats] = useState([])
  const [newItem, setNewItem] = useState(NEW_ITEM)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [newCat, setNewCat] = useState('')
  const [newCatPrefix, setNewCatPrefix] = useState('')
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingCatForm, setEditingCatForm] = useState({ name: '', code_prefix: '' })
  const [showAddCatModal, setShowAddCatModal] = useState(false)
  const [quickCatName, setQuickCatName] = useState('')
  const [quickCatPrefix, setQuickCatPrefix] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [success, setSuccess] = useState('')
  const [previewModalImg, setPreviewModalImg] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [onlyLow, setOnlyLow] = useState(false)
  const [onlyOut, setOnlyOut] = useState(false)

  // View Mode: 'table' (ตารางมาตรฐาน - ค่าเริ่มต้น) | 'grid' (การ์ดวิศวกรรม)
  const [viewMode, setViewMode] = useState('table')
  const [selectedCatFilter, setSelectedCatFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20) // 10 | 20 | 50 | 100

  // Edit Modal State (ข้อ 3: ไม่อนุญาตให้แก้ตรง ๆ ในตาราง ให้กดแก้ไขผ่าน Modal)
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editImageFile, setEditImageFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState(null)

  const fileInputRef = useRef(null)
  const editFileInputRef = useRef(null)

  const load = useCallback(() => {
    supabase
      .from('inventory_items')
      .select('*, item_categories(name)')
      .order('item_code')
      .order('item_name')
      .then(({ data, error: itErr }) => {
        if (itErr) setError(itErr.message)
        else setItems(data ?? [])
      })

    supabase
      .from('item_categories')
      .select('*')
      .order('sort_order')
      .then(({ data, error: catErr }) => {
        if (catErr) setError(catErr.message)
        else setCats(data ?? [])
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // คำนวณรหัสพัสดุถัดไปตามหมวดหมู่ (หาเลขสูงสุดจริง ไม่นับแค่จำนวนแถว เพื่อป้องกันรหัสชนกัน 409 Conflict)
  const selectedCategoryObj = cats.find((c) => c.id === newItem.category_id)
  const nextEstimatedCode = useMemo(() => {
    if (!selectedCategoryObj) return 'โปรดเลือกหมวดหมู่ก่อน'
    const prefix = selectedCategoryObj.code_prefix || 'MAT'
    const rx = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i')
    let maxNum = 0
    items.forEach((it) => {
      const code = it.item_code || ''
      const m = code.match(rx)
      if (m && m[1]) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n > maxNum) maxNum = n
      }
    })
    return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
  }, [selectedCategoryObj, items])

  // อัปโหลดรูปภาพวัสดุใหม่
  const handleImageSelect = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      return
    }
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  const clearNewImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // เพิ่มวัสดุใหม่
  async function addItem(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const newErrors = {}

    if (!newItem.item_name.trim()) {
      newErrors.item_name = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาระบุชื่อวัสดุ)'
    }
    if (!newItem.category_id) {
      newErrors.category_id = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (บังคับเลือกหมวดหมู่วัสดุ)'
    }
    if (!newItem.unit?.trim()) {
      newErrors.unit = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาระบุหน่วยนับ)'
    }
    const costVal = parseFloat(newItem.avg_unit_cost)
    if (newItem.avg_unit_cost === '' || newItem.avg_unit_cost === null || isNaN(costVal) || costVal <= 0) {
      newErrors.avg_unit_cost = 'ช่องนี้ยังไม่กรอก ช่องว่างนะ (บังคับใส่ราคา/ต้นทุนของรายการ ต้องมากกว่า 0 บาท)'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    let uploadedUrl = null

    try {
      if (imageFile) {
        setUploading(true)
        uploadedUrl = await uploadItemImage(imageFile)
        setUploading(false)
      }

      // ตรวจสอบเลขรหัสพัสดุสูงสุดจากฐานข้อมูลโดยตรง ป้องกันข้อผิดพลาด 409 Conflict จากการชนรหัสเดิม
      const prefix = selectedCategoryObj?.code_prefix || 'MAT'
      let itemCodeToUse = nextEstimatedCode

      try {
        const { data: dbItems } = await supabase
          .from('inventory_items')
          .select('item_code')
          .ilike('item_code', `${prefix}%`)
          .order('item_code', { ascending: false })
          .limit(30)

        if (dbItems && dbItems.length > 0) {
          const rx = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i')
          let dbMax = 0
          dbItems.forEach((it) => {
            const m = (it.item_code || '').match(rx)
            if (m && m[1]) {
              const n = parseInt(m[1], 10)
              if (!isNaN(n) && n > dbMax) dbMax = n
            }
          })
          if (dbMax >= 1) {
            itemCodeToUse = `${prefix}-${String(dbMax + 1).padStart(3, '0')}`
          }
        }
      } catch (checkErr) {
        console.warn('Check code max notice:', checkErr)
      }

      const initialQty = toIntQty(newItem.qty_on_hand)
      const cost = Number(newItem.avg_unit_cost) || 0

      // ทำการบันทึกแบบ Self-Healing Retry ในกรณีที่รหัสพัสดุชนกับข้อมูลเดิมในตาราง
      let finalCode = itemCodeToUse
      let insertSuccess = false
      let insertErr = null

      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await supabase.from('inventory_items').insert({
          item_code: finalCode,
          item_name: newItem.item_name.trim(),
          unit: newItem.unit.trim() || 'ชิ้น',
          category_id: newItem.category_id,
          qty_on_hand: initialQty,
          reorder_point: toIntQty(newItem.reorder_point),
          avg_unit_cost: cost,
          image_url: uploadedUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        if (!res.error) {
          insertSuccess = true
          break
        }

        insertErr = res.error
        // ถ้าเกิด code ชนกัน (unique constraint violation บน item_code 409)
        if (
          res.error.code === '23505' &&
          (res.error.message?.includes('item_code') || res.error.details?.includes('item_code'))
        ) {
          const m = finalCode.match(/(\d+)$/)
          if (m) {
            const nextVal = parseInt(m[1], 10) + 1
            finalCode = finalCode.replace(/\d+$/, String(nextVal).padStart(m[1].length, '0'))
            continue
          }
        }
        break
      }

      if (!insertSuccess && insertErr) throw insertErr

      setSuccess(
        `เพิ่มวัสดุ "${newItem.item_name}" เรียบร้อยแล้ว (รหัส: ${finalCode}, ยอดตั้งต้น: ${initialQty} ${newItem.unit}, ราคา: ${cost} บาท)`
      )
      setTimeout(() => setSuccess(''), 4000)
      setNewItem({
        item_name: '',
        unit: 'ชิ้น',
        category_id: newItem.category_id,
        qty_on_hand: '10',
        reorder_point: '5',
        avg_unit_cost: '',
        image_url: '',
      })
      clearNewImage()
      setErrors({})
      load()
    } catch (err) {
      if (
        err.message &&
        (err.message.includes('inventory_items_name_unique') ||
          (err.message.includes('duplicate key') && err.message.includes('item_name')))
      ) {
        setError(`ชื่อวัสดุ "${newItem.item_name}" มีอยู่ในระบบแล้ว (หากต้องการเพิ่มชื่อเดียวกันในต่างหมวดหมู่ กรุณาระบุชื่อเพิ่ม เช่น "(งานโซล่าร์)" หรือรันคำสั่งปลดล็อกชื่อซ้ำข้ามหมวดหมู่ใน Supabase)`)
      } else if (err.code === '23505') {
        setError(`ข้อมูลรหัสพัสดุหรือชื่อซ้ำกับรายการที่มีอยู่แล้วในระบบ กรุณาลองใหม่อีกครั้ง`)
      } else {
        setError(err.message || 'บันทึกวัสดุไม่สำเร็จ')
      }
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // เปิด Modal แก้ไขข้อมูลวัสดุ (ข้อ 3: CRUD ชัดเจน พร้อมบันทึก updated_at)
  const openEditModal = (item) => {
    setEditingItem(item)
    setEditForm({
      item_name: item.item_name || '',
      category_id: item.category_id || '',
      qty_on_hand: item.qty_on_hand ?? 0,
      unit: item.unit || 'ชิ้น',
      reorder_point: item.reorder_point ?? 0,
      avg_unit_cost: item.avg_unit_cost ?? 0,
      image_url: item.image_url || '',
    })
    setEditImageFile(null)
    setEditImagePreview(null)
  }

  // อัปเดตข้อมูลวัสดุผ่าน Modal
  async function handleSaveEditItem(e) {
    e.preventDefault()
    if (!editingItem) return
    setError('')

    if (!editForm.item_name?.trim()) {
      setError('กรุณาระบุชื่อวัสดุ')
      return
    }

    const editCost = Number(editForm.avg_unit_cost)
    if (editForm.avg_unit_cost === '' || editForm.avg_unit_cost === null || isNaN(editCost) || editCost <= 0) {
      setError('กรุณาระบุราคา/ต้นทุนของรายการ (ต้องมากกว่า 0 บาท)')
      return
    }

    setSaving(true)
    try {
      let finalImageUrl = editForm.image_url
      if (editImageFile) {
        finalImageUrl = await uploadItemImage(editImageFile)
      }

      const newQty = Number(editForm.qty_on_hand) || 0
      const nowIso = new Date().toISOString()

      const { error: updErr } = await supabase
        .from('inventory_items')
        .update({
          item_name: editForm.item_name.trim(),
          category_id: editForm.category_id || null,
          qty_on_hand: toIntQty(newQty),
          unit: editForm.unit?.trim() || 'ชิ้น',
          reorder_point: toIntQty(editForm.reorder_point),
          avg_unit_cost: Number(editForm.avg_unit_cost) || 0,
          image_url: finalImageUrl || null,
          updated_at: nowIso,
        })
        .eq('id', editingItem.id)

      if (updErr) throw updErr

      // บันทึกสำเร็จแล้ว → ลบรูปเก่าบน R2 (ถ้ามีการเปลี่ยน/ลบรูป)
      discardFile(editingItem.image_url, finalImageUrl)

      setSuccess(
        `บันทึกการแก้ไข "${editForm.item_name}" เรียบร้อยแล้ว (อัปเดตล่าสุด: ${fmtDateTime(nowIso)})`
      )
      setTimeout(() => setSuccess(''), 4000)
      setEditingItem(null)
      load()
    } catch (err) {
      setError(err.message || 'บันทึกการแก้ไขไม่สำเร็จ')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // ลบวัสดุพร้อมเคลียร์ความสัมพันธ์ (Cascade Delete ปลอดภัย)
  async function handleDeleteItem(item) {
    if (!confirm(`คุณต้องการลบวัสดุ "${item.item_name}" (รหัส: ${item.item_code}) ออกจากระบบหรือไม่?\n\nระบบจะปลดล็อกความสัมพันธ์ในเอกสารและลบออกจากระบบอย่างปลอดภัย`)) {
      return
    }

    setSaving(true)
    setError('')

    try {
      // ลองใช้ RPC delete_inventory_item_cascade ก่อน
      const { error: rpcErr } = await supabase.rpc('delete_inventory_item_cascade', { p_item_id: item.id })

      if (rpcErr) {
        // หากไม่มี RPC ให้ลบความสัมพันธ์โดยตรง
        await supabase.from('purchase_order_items').update({ item_id: null }).eq('item_id', item.id)
        await supabase.from('quotation_items').update({ item_id: null }).eq('item_id', item.id)
        await supabase.from('stock_issue_items').delete().eq('item_id', item.id)
        await supabase.from('stock_adjustments').delete().eq('item_id', item.id)
        await supabase.from('stock_lots').delete().eq('item_id', item.id)
        await supabase.from('inventory_stock').delete().eq('item_id', item.id)

        const { error: delErr } = await supabase.from('inventory_items').delete().eq('id', item.id)
        if (delErr) throw delErr
      }

      // ลบวัสดุสำเร็จแล้ว → ลบรูปของวัสดุนี้บน R2 ด้วย
      discardFile(item.image_url)

      setSuccess(`ลบวัสดุ "${item.item_name}" ออกจากระบบเรียบร้อยแล้ว`)
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) {
      console.error('Delete item error:', err)
      setError(`ไม่สามารถลบวัสดุได้: ${err.message || 'เกิดข้อผิดพลาดในการลบ'}`)
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // ล้างข้อมูลจำลองสโตร์ทั้งหมด (Wipe All Mock Store Data)
  async function handleClearAllMockItems() {
    if (!confirm('ยืนยันลบข้อมูลวัสดุจำลองทั้งหมดในสโตร์หรือไม่?\n\nการกระทำนี้จะล้างรายการพัสดุจำลองและประวัติสต็อกทดสอบทั้งหมด เพื่อให้คลังสินค้าว่างเปล่า สะอาด 100% พร้อมสำหรับการป้อนข้อมูลจริงของบริษัท')) {
      return
    }

    setSaving(true)
    setError('')

    try {
      // ลองใช้ RPC clear_mock_store_data ก่อน
      const { error: rpcErr } = await supabase.rpc('clear_mock_store_data')

      if (rpcErr) {
        // หากไม่มี RPC ให้ล้างโดยตรง
        await supabase.from('purchase_order_items').update({ item_id: null }).not('item_id', 'is', null)
        await supabase.from('quotation_items').update({ item_id: null }).not('item_id', 'is', null)
        await supabase.from('stock_issue_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('stock_issues').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('stock_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('stock_lots').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('inventory_stock').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        const { error: delAllErr } = await supabase.from('inventory_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (delAllErr) throw delAllErr
      }

      setSuccess('ลบข้อมูลจำลองในสโตร์ทั้งหมดเรียบร้อยแล้ว คลังสินค้าสะอาด 100% พร้อมป้อนข้อมูลจริง!')
      setTimeout(() => setSuccess(''), 5000)
      load()
    } catch (err) {
      console.error('Clear mock data error:', err)
      setError(`ไม่สามารถล้างข้อมูลจำลองได้: ${err.message || 'เกิดข้อผิดพลาด'}`)
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // หมวดหมู่: เพิ่มใหม่ (Create)
  async function addCategory(e) {
    e.preventDefault()
    if (!newCat.trim()) return
    setError('')
    setSaving(true)
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0)
    const prefix = newCatPrefix.trim().toUpperCase() || getCategoryPrefix(newCat)

    const { error: insErr } = await supabase.from('item_categories').insert({
      name: newCat.trim(),
      code_prefix: prefix,
      sort_order: maxOrder + 1,
    })

    if (insErr) {
      setError(insErr.message.includes('unique') ? 'ชื่อหมวดหมู่หรือรหัสคำนำหน้านี้ซ้ำกับที่มีอยู่แล้ว' : insErr.message)
      setSaving(false)
      return
    }
    setSuccess(`เพิ่มหมวดหมู่ "${newCat.trim()}" (${prefix}) เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    setNewCat('')
    setNewCatPrefix('')
    setSaving(false)
    load()
  }

  // หมวดหมู่: เพิ่มใหม่อย่างรวดเร็วจากด้านบนพร้อมเลือกทันที (Quick Create & Auto-Select)
  async function handleQuickAddCategory(e) {
    e.preventDefault()
    if (!quickCatName.trim()) return
    setSaving(true)
    setError('')
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0)
    const prefix = quickCatPrefix.trim().toUpperCase() || getCategoryPrefix(quickCatName)

    const { data: newCatData, error: insErr } = await supabase
      .from('item_categories')
      .insert({
        name: quickCatName.trim(),
        code_prefix: prefix,
        sort_order: maxOrder + 1,
      })
      .select()
      .single()

    if (insErr) {
      setError(insErr.message.includes('unique') ? 'ชื่อหมวดหมู่หรือรหัสคำนำหน้านี้ซ้ำกับที่มีอยู่แล้ว' : insErr.message)
      setSaving(false)
      return
    }

    setSuccess(`เพิ่มหมวดหมู่ "${quickCatName.trim()}" (${prefix}) และเลือกให้อัตโนมัติแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    setQuickCatName('')
    setQuickCatPrefix('')
    setShowAddCatModal(false)
    setSaving(false)

    // เลือกหมวดหมู่นี้ในฟอร์มทันที
    if (newCatData?.id) {
      setNewItem((prev) => ({ ...prev, category_id: newCatData.id }))
      setErrors((prev) => ({ ...prev, category_id: '' }))
    }
    load()
  }

  // หมวดหมู่: เริ่มแก้ไข (Update)
  function startEditCategory(cat) {
    setEditingCatId(cat.id)
    setEditingCatForm({
      name: cat.name || '',
      code_prefix: cat.code_prefix || '',
      sort_order: cat.sort_order ?? 0,
    })
  }

  function cancelEditCategory() {
    setEditingCatId(null)
    setEditingCatForm({ name: '', code_prefix: '', sort_order: 0 })
  }

  // หมวดหมู่: บันทึกการแก้ไข (Update)
  async function handleUpdateCategory(e) {
    e.preventDefault()
    if (!editingCatId || !editingCatForm.name.trim()) return
    setSaving(true)
    setError('')

    const prefix = editingCatForm.code_prefix.trim().toUpperCase()

    const { error: updErr } = await supabase
      .from('item_categories')
      .update({
        name: editingCatForm.name.trim(),
        code_prefix: prefix,
        sort_order: Number(editingCatForm.sort_order || 0),
      })
      .eq('id', editingCatId)

    if (updErr) {
      setError(updErr.message.includes('unique') ? 'ชื่อหมวดหมู่หรือรหัสคำนำหน้านี้ซ้ำกับหมวดหมู่อื่น' : updErr.message)
      setSaving(false)
      return
    }

    setSuccess(`บันทึกการแก้ไขหมวดหมู่ "${editingCatForm.name}" เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    cancelEditCategory()
    setSaving(false)
    load()
  }

  // หมวดหมู่: ลบพร้อมตรวจสอบความปลอดภัย (Delete)
  async function handleDeleteCategory(cat) {
    const count = items.filter((i) => i.category_id === cat.id).length
    if (count > 0) {
      alert(`ไม่สามารถลบหมวดหมู่ "${cat.name}" ได้\n\nเนื่องจากมีรายการพัสดุใช้งานหมวดหมู่นี้อยู่ ${count} รายการ กรุณาย้ายหรือลบรายการพัสดุออกก่อน จึงจะลบหมวดหมู่ได้`)
      return
    }

    if (!confirm(`คุณต้องการลบหมวดหมู่ "${cat.name}" (รหัสคำนำหน้า: ${cat.code_prefix || '-'}) ออกจากระบบหรือไม่?`)) {
      return
    }

    setSaving(true)
    setError('')

    const { error: delErr } = await supabase
      .from('item_categories')
      .delete()
      .eq('id', cat.id)

    if (delErr) {
      setError(`ไม่สามารถลบหมวดหมู่ได้: ${delErr.message}`)
      setSaving(false)
      return
    }

    setSuccess(`ลบหมวดหมู่ "${cat.name}" เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(''), 3000)
    setSaving(false)
    load()
  }

  const lowCount = items.filter(isLow).length
  const outCount = items.filter(isOut).length

  const shownItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = items.filter((it) => {
      if (selectedCatFilter !== 'all' && it.category_id !== selectedCatFilter) return false
      if (onlyLow && !isLow(it)) return false
      if (onlyOut && !isOut(it)) return false
      if (!q) return true
      return `${it.item_code} ${it.item_name} ${it.unit || ''} ${it.item_categories?.name || ''}`
        .toLowerCase()
        .includes(q)
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'name_asc') return (a.item_name || '').localeCompare(b.item_name || '', 'th')
      if (sortBy === 'name_desc') return (b.item_name || '').localeCompare(a.item_name || '', 'th')
      if (sortBy === 'code_asc') return (a.item_code || '').localeCompare(b.item_code || '', undefined, { numeric: true })
      if (sortBy === 'code_desc') return (b.item_code || '').localeCompare(a.item_code || '', undefined, { numeric: true })
      if (sortBy === 'qty_desc') return Number(b.qty_on_hand || 0) - Number(a.qty_on_hand || 0)
      if (sortBy === 'qty_asc') return Number(a.qty_on_hand || 0) - Number(b.qty_on_hand || 0)
      if (sortBy === 'cost_desc') return Number(b.avg_unit_cost || 0) - Number(a.avg_unit_cost || 0)
      return 0
    })
  }, [items, selectedCatFilter, onlyLow, onlyOut, search, sortBy])

  // รีเซ็ตหน้ากลับไปหน้าที่ 1 เมื่อตัวกรองหรือคำค้นหาเปลี่ยน
  useEffect(() => {
    setCurrentPage(1)
  }, [search, selectedCatFilter, viewMode, sortBy, onlyLow, onlyOut])

  // คำนวณรายการเฉพาะหน้าปัจจุบัน
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return shownItems.slice(start, start + pageSize)
  }, [shownItems, currentPage, pageSize])

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-900 dark:text-slate-100">
      {/* 1. Header Banner: ANVA & Co Solar Engineering Brand */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-steel-900 to-slate-800 p-6 text-white shadow-md border border-steel-700">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-hivis text-steel-950 font-black px-2.5 py-0.5 text-xs uppercase tracking-wider">
                ANVA & CO. CATALOG
              </span>
              <span className="text-xs text-steel-300">
                ระบบจัดการทะเบียนพัสดุและหมวดหมู่วิศวกรรม
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              ทะเบียนวัสดุและหมวดหมู่อุปกรณ์ (Item Master & Catalog)
            </h1>
            <p className="text-xs sm:text-sm text-steel-300">
              กำหนดข้อมูลหลัก รหัสพัสดุ จุดเตือนสั่งซื้อ และจัดการรายการแบบปลอดภัย (CRUD) พร้อมบันทึกประวัติการอัปเดต
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => {
                document.getElementById('category-management')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="rounded-xl bg-steel-800 hover:bg-steel-700 text-steel-200 border border-steel-700 px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="เลื่อนไปจัดการหมวดหมู่ทั้งหมด"
            >
              <Layers className="h-4 w-4 text-hivis" />
              <span className="hidden sm:inline">จัดการหมวดหมู่</span> ({cats.length})
            </button>

            <Link
              to="/store/adjust"
              className="rounded-xl bg-hivis text-steel-950 hover:bg-amber-400 font-black px-3.5 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <span>ปรับปรุงสต็อก / รับคืน</span>
            </Link>
          </div>
        </div>
      </div>

      {/* แจ้งเตือนข้อผิดพลาด / สำเร็จ */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs sm:text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* 2. ฟอร์มเพิ่มวัสดุใหม่ (New Item Form - บังคับระบุหมวดหมู่) */}
      {canEdit && (
        <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-steel-100 dark:border-slate-800 pb-3 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-steel-900 dark:bg-amber-500 text-hivis dark:text-slate-950 font-bold">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-steel-900 dark:text-slate-100">เพิ่มรายการวัสดุใหม่เข้าระบบ</h2>
                <p className="text-xs text-steel-500 dark:text-slate-400">
                  บังคับระบุหมวดหมู่เพื่อสร้างรหัสพัสดุอัตโนมัติตามมาตรฐานวิศวกรรม
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={addItem} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* ชื่อวัสดุ */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-steel-700 mb-1">
                  ชื่อวัสดุ / อุปกรณ์วิศวกรรม *
                </label>
                <input
                  type="text"
                  placeholder="เช่น แผงโซลาร์เซลล์ Tier-1 550W Mono Half-cell"
                  className={fieldErrorClass(
                    errors.item_name,
                    'input w-full text-xs sm:text-sm font-semibold text-steel-900 placeholder:text-steel-400'
                  )}
                  value={newItem.item_name}
                  onChange={(e) => {
                    setNewItem({ ...newItem, item_name: e.target.value })
                    if (errors.item_name) setErrors((prev) => ({ ...prev, item_name: '' }))
                  }}
                />
                <FieldError error={errors.item_name} />
              </div>

              {/* หมวดหมู่ (บังคับ) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-steel-700">
                    หมวดหมู่วัสดุ (บังคับเลือก) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCatModal(true)}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer transition"
                    title="สร้างหมวดหมู่ใหม่ทันทีโดยไม่ต้องเลื่อนหน้าจอ"
                  >
                    <Plus className="h-3 w-3" />
                    <span>+ เพิ่มหมวดหมู่ใหม่</span>
                  </button>
                </div>
                <select
                  className={fieldErrorClass(
                    errors.category_id,
                    'input w-full text-xs sm:text-sm font-semibold text-steel-900 bg-white'
                  )}
                  value={newItem.category_id}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowAddCatModal(true)
                      return
                    }
                    setNewItem({ ...newItem, category_id: e.target.value })
                    if (errors.category_id) setErrors((prev) => ({ ...prev, category_id: '' }))
                  }}
                >
                  <option value="">-- คลิกเพื่อเลือกหมวดหมู่ --</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code_prefix})
                    </option>
                  ))}
                  <option value="__ADD_NEW__" className="font-bold text-amber-600 bg-amber-50">
                     + เพิ่มหมวดหมู่ใหม่...
                  </option>
                </select>
                <FieldError error={errors.category_id} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
              {/* รหัสพัสดุ (Auto Estimate) */}
              <div>
                <label className="block text-xs font-bold text-steel-700 mb-1">
                  รหัสพัสดุ (คำนวณอัตโนมัติ)
                </label>
                <input
                  type="text"
                  disabled
                  value={nextEstimatedCode}
                  className="input w-full text-xs font-mono font-bold bg-steel-100 text-steel-700 cursor-not-allowed"
                />
              </div>

              {/* จำนวนตั้งต้น */}
              <div>
                <label className="block text-xs font-bold text-steel-700 mb-1">
                  จำนวนคงเหลือตั้งต้น *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="10"
                  className="input w-full text-xs font-mono font-bold text-steel-900"
                  value={newItem.qty_on_hand}
                  onChange={(e) => setNewItem({ ...newItem, qty_on_hand: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                />
              </div>

              {/* หน่วยนับ */}
              <div>
                <label className="block text-xs font-bold text-steel-700 mb-1">
                  หน่วยนับ *
                </label>
                <input
                  type="text"
                  placeholder="เช่น แผง, ตัว, เมตร, ชุด"
                  className={fieldErrorClass(
                    errors.unit,
                    'input w-full text-xs text-steel-900'
                  )}
                  value={newItem.unit}
                  onChange={(e) => {
                    setNewItem({ ...newItem, unit: e.target.value })
                    if (errors.unit) setErrors((prev) => ({ ...prev, unit: '' }))
                  }}
                />
                <FieldError error={errors.unit} />
              </div>

              {/* ข้อ 1: ต้นทุนต่อหน่วย (บาท) - บังคับใส่ราคา */}
              <div>
                <label className="block text-xs font-bold text-steel-700 mb-1 flex items-center gap-1">
                  <Coins className="h-3 w-3 text-amber-600" />
                  <span>ต้นทุน/หน่วย (บาท) *</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="ระบุราคาต้นทุน เช่น 150.00"
                  className={fieldErrorClass(
                    errors.avg_unit_cost,
                    'input w-full text-xs font-mono font-bold text-steel-900 bg-amber-50/40 border-amber-300 focus:bg-white'
                  )}
                  value={newItem.avg_unit_cost}
                  onChange={(e) => {
                    setNewItem({ ...newItem, avg_unit_cost: e.target.value })
                    if (errors.avg_unit_cost) setErrors((prev) => ({ ...prev, avg_unit_cost: '' }))
                  }}
                />
                <FieldError error={errors.avg_unit_cost} />
              </div>

              {/* จุดเตือนสั่งซื้อ */}
              <div>
                <label className="block text-xs font-bold text-steel-700 mb-1">
                  จุดเตือนสั่งซื้อ (Reorder)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="5"
                  className="input w-full text-xs font-mono text-steel-900"
                  value={newItem.reorder_point}
                  onChange={(e) => setNewItem({ ...newItem, reorder_point: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                />
              </div>
            </div>

            {/* แสดงมูลค่าคงคลังตั้งต้น */}
            {Number(newItem.qty_on_hand) > 0 && Number(newItem.avg_unit_cost) > 0 && (
              <div className="rounded-lg bg-steel-50 border border-steel-200 px-3 py-1.5 text-xs flex items-center justify-between font-mono">
                <span className="text-steel-600">
                  คำนวณมูลค่าคงคลังเริ่มต้น ({newItem.qty_on_hand} {newItem.unit} × {baht(newItem.avg_unit_cost)} บาท):
                </span>
                <span className="font-bold text-steel-900">
                  {baht(Number(newItem.qty_on_hand) * Number(newItem.avg_unit_cost))} บาท
                </span>
              </div>
            )}

            {/* อัปโหลดรูปภาพ */}
            <div className="pt-2 border-t border-steel-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3.5 py-2 text-xs font-bold text-steel-700 transition flex items-center gap-2"
                >
                  <UploadCloud className="h-4 w-4 text-steel-500" />
                  <span>{imagePreview ? 'เปลี่ยนรูปภาพ' : 'แนบรูปภาพพัสดุ'}</span>
                </button>

                {imagePreview && (
                  <div className="flex items-center gap-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-9 w-9 rounded-lg border border-steel-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearNewImage}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      ลบรูป
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || uploading}
                className="rounded-xl bg-steel-900 hover:bg-steel-800 text-hivis font-black px-6 py-2.5 text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-2 self-end sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                <span>{saving ? 'กำลังบันทึก...' : 'บันทึกรายการวัสดุใหม่'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2.5 Category Filter Pills (เลือกตามหมวดหมู่ - สไตล์มาตรฐานเดียวกับหน้าสต็อก) */}
      <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-steel-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5 text-steel-900 dark:text-slate-100">
            <Layers className="h-4 w-4 text-steel-700 dark:text-amber-400" />
            <span>เลือกดูตามหมวดหมู่วัสดุและอุปกรณ์</span>
          </span>

          <div className="flex items-center gap-2">
            <span className="text-steel-400 dark:text-slate-300 font-normal hidden sm:inline">
              แสดง {shownItems.length} จาก {items.length} รายการ
            </span>
            {/* Dropdown เลือกหมวดหมู่ (สำหรับกรณีหมวดหมู่เยอะหรือค้นหาทาง Dropdown) */}
            <select
              value={selectedCatFilter}
              onChange={(e) => setSelectedCatFilter(e.target.value)}
              className="h-8 rounded-lg border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold text-steel-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              <option value="all"> หมวดหมู่ทั้งหมด ({items.length} รายการ)</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({items.filter((it) => it.category_id === c.id).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCatFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedCatFilter === 'all'
                ? 'bg-steel-900 dark:bg-amber-500 text-hivis dark:text-slate-950 font-black shadow-xs'
                : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>ทั้งหมด</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                selectedCatFilter === 'all'
                  ? 'bg-steel-800 dark:bg-amber-600 text-hivis dark:text-slate-950'
                  : 'bg-steel-200 dark:bg-slate-700 text-steel-800 dark:text-slate-200'
              }`}
            >
              {items.length}
            </span>
          </button>

          {cats.map((c) => {
            const count = items.filter((it) => it.category_id === c.id).length
            const isSelected = selectedCatFilter === c.id

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCatFilter(c.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-steel-900 dark:bg-amber-500 text-hivis dark:text-slate-950 font-black shadow-xs'
                    : 'bg-steel-100 dark:bg-slate-800 text-steel-700 dark:text-slate-200 hover:bg-steel-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{c.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected
                      ? 'bg-steel-800 dark:bg-amber-600 text-hivis dark:text-slate-950'
                      : 'bg-steel-200 dark:bg-slate-700 text-steel-800 dark:text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. แถบตัวกรองและค้นหามาตรฐาน (Filters, Sort, Status & View Toggle) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* ช่องค้นหา */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อวัสดุ, หมวดหมู่, หน่วยนับ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-4 text-xs sm:text-sm text-steel-900 dark:text-slate-100 placeholder:text-steel-400 dark:placeholder:text-slate-500 focus:border-steel-900 dark:focus:border-amber-500 focus:outline-none shadow-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600 dark:hover:text-slate-200"
              >
                
              </button>
            )}
          </div>

          {/* Standard Sort Filter Control */}
          <TableSortFilter
            value={sortBy}
            onChange={setSortBy}
            options={STOCK_SORT_OPTIONS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Status Filter: ใกล้หมด */}
          <button
            type="button"
            onClick={() => {
              setOnlyLow(!onlyLow)
              setOnlyOut(false)
            }}
            className={`h-10 rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              onlyLow
                ? 'bg-amber-500 text-slate-950 font-black border-amber-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-steel-700 dark:text-slate-200 border-steel-300 dark:border-slate-700 hover:bg-steel-50 dark:hover:bg-slate-800'
            }`}
          >
            <span></span>
            <span>ใกล้หมด ({lowCount})</span>
          </button>

          {/* Quick Status Filter: หมดสต็อก */}
          <button
            type="button"
            onClick={() => {
              setOnlyOut(!onlyOut)
              setOnlyLow(false)
            }}
            className={`h-10 rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              onlyOut
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-steel-700 dark:text-slate-200 border-steel-300 dark:border-slate-700 hover:bg-steel-50 dark:hover:bg-slate-800'
            }`}
          >
            <span></span>
            <span>หมดสต็อก ({outCount})</span>
          </button>

          {/* View Mode Toggle: Table vs Cards */}
          <div className="flex h-10 rounded-xl bg-steel-100 dark:bg-slate-800 p-1 text-xs font-bold border border-steel-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded-lg px-3 py-1 transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 font-bold shadow-xs'
                  : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>ตารางพัสดุ</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-lg px-3 py-1 transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-steel-900 dark:text-amber-400 font-bold shadow-xs'
                  : 'text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-slate-200'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>การ์ดวัสดุ</span>
            </button>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllMockItems}
              disabled={saving}
              className="h-10 rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
              title="ลบรายการจำลองทั้งหมดในสโตร์ เพื่อเตรียมป้อนข้อมูลจริง"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              <span>ล้างข้อมูลจำลอง</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. ตารางพัสดุวิศวกรรม (แสดงผลสวยงาม สมดุล ข้อความไม่ซ้อนกัน วันที่และเวลามาตรฐานระดับสากล) */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-steel-200 dark:border-slate-800 bg-steel-50/90 dark:bg-slate-800 text-left text-steel-600 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 pl-4 pr-3 whitespace-nowrap">รหัสพัสดุ</th>
                <th className="py-3.5 px-2 text-center whitespace-nowrap">รูปภาพ</th>
                <th className="py-3.5 px-3 whitespace-nowrap min-w-[200px]">ชื่อวัสดุ / อุปกรณ์</th>
                <th className="py-3.5 px-3 whitespace-nowrap">หมวดหมู่</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">คงเหลือในคลัง</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">หน่วย</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">จุดเตือน</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">ราคาเฉลี่ย</th>
                <th className="py-3.5 px-4 whitespace-nowrap">อัปเดตล่าสุด</th>
                <th className="py-3.5 pl-3 pr-4 text-center whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100 dark:divide-slate-800">
              {shownItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-steel-400 dark:text-slate-500 text-xs">
                    ไม่พบรายการวัสดุตรงตามเงื่อนไขค้นหา
                  </td>
                </tr>
              ) : (
                paginatedItems.map((it) => {
                  const isLow =
                    Number(it.reorder_point) > 0 &&
                    Number(it.qty_on_hand) <= Number(it.reorder_point) &&
                    Number(it.qty_on_hand) > 0
                  const isOut = Number(it.qty_on_hand) <= 0
                  const catObj = cats.find((c) => c.id === it.category_id)
                  const ts = it.updated_at || it.created_at
                  const { date, time } = formatDateTimeParts(ts)

                  return (
                    <tr key={it.id} className="hover:bg-steel-50/80 dark:hover:bg-slate-800/60 transition">
                      {/* 1. รหัส */}
                      <td className="py-3.5 pl-4 pr-3 font-mono font-bold text-steel-900 dark:text-amber-400 whitespace-nowrap">
                        {it.item_code}
                      </td>

                      {/* 2. รูปภาพ */}
                      <td className="py-3.5 px-2 text-center whitespace-nowrap">
                        {it.image_url ? (
                          <div className="flex justify-center">
                            <R2Image
                              fileKey={it.image_url}
                              alt={it.item_name}
                              className="h-10 w-10 rounded-xl border border-steel-200 dark:border-slate-700 object-cover shadow-xs cursor-pointer hover:opacity-80 transition"
                              onClick={() => setPreviewModalImg(it.image_url)}
                              title="คลิกเพื่อดูรูปใหญ่"
                            />
                          </div>
                        ) : (
                          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-steel-200 dark:border-slate-700 bg-steel-50 dark:bg-slate-800 text-[10px] text-steel-400 dark:text-slate-500 font-mono">
                            -
                          </div>
                        )}
                      </td>

                      {/* 3. ชื่อวัสดุ */}
                      <td className="py-3.5 px-3 font-bold text-steel-900 dark:text-slate-100 max-w-[280px]" title={it.item_name}>
                        <div className="line-clamp-2 leading-snug">{it.item_name}</div>
                      </td>

                      {/* 4. หมวดหมู่ */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="inline-block whitespace-nowrap rounded-lg bg-steel-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-steel-700 dark:text-slate-200 border border-steel-200 dark:border-slate-700">
                          {catObj?.name || it.item_categories?.name || '-'}
                        </span>
                      </td>

                      {/* 5. คงเหลือในคลัง */}
                      <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span
                            className={`font-bold text-sm ${
                              isOut
                                ? 'text-rose-600 dark:text-rose-400 font-black'
                                : isLow
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-steel-900 dark:text-slate-100'
                            }`}
                          >
                            {formatIntQty(it.qty_on_hand)}
                          </span>
                          {isOut ? (
                            <span className="rounded-md bg-rose-100 dark:bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                              หมด
                            </span>
                          ) : isLow ? (
                            <span className="rounded-md bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                              ใกล้หมด
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 6. หน่วยนับ */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap text-steel-600 dark:text-slate-400 text-xs font-medium">
                        {it.unit || '-'}
                      </td>

                      {/* 7. จุดเตือน */}
                      <td className="py-3.5 px-3 text-right font-mono text-xs text-steel-500 dark:text-slate-400 whitespace-nowrap">
                        {formatIntQty(it.reorder_point)}
                      </td>

                      {/* 8. ราคาเฉลี่ย */}
                      <td className="py-3.5 px-3 text-right font-mono text-xs font-semibold text-steel-800 dark:text-slate-200 whitespace-nowrap">
                        {baht(it.avg_unit_cost)} บ.
                      </td>

                      {/* 9. อัปเดตล่าสุด (จัดเลย์เอาต์ 2 บรรทัดมาตรฐาน ERP: วันที่ชัดเจน เวลาไม่เบียด) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {date === '-' ? (
                          <span className="text-steel-400 dark:text-slate-500 text-xs font-mono">-</span>
                        ) : (
                          <div className="flex flex-col text-xs leading-tight">
                            <span className="font-semibold text-steel-800 dark:text-slate-200">
                              {date}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-steel-500 dark:text-slate-400 font-mono mt-0.5">
                              <Clock className="h-3 w-3 text-steel-400 dark:text-slate-500 shrink-0" />
                              {time ? `${time} น.` : ''}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 10. การจัดการ (ปุ่มแก้ไข และปุ่มลบ สัดส่วนสมดุล) */}
                      <td className="py-3.5 pl-3 pr-4 text-center whitespace-nowrap">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* ปุ่มแก้ไข */}
                            <button
                              type="button"
                              onClick={() => openEditModal(it)}
                              className="rounded-lg bg-steel-100 dark:bg-slate-800 hover:bg-steel-200 dark:hover:bg-slate-700 text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700 px-2.5 py-1 text-xs font-bold transition flex items-center gap-1"
                              title="แก้ไขข้อมูลพัสดุ"
                            >
                              <Edit2 className="h-3 w-3 text-steel-600 dark:text-slate-300" />
                              <span>แก้ไข</span>
                            </button>

                            {/* ปุ่มลบ */}
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(it)}
                              className="rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 px-2.5 py-1 text-xs font-bold transition flex items-center gap-1"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                              <span>ลบ</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-steel-300 dark:text-slate-600 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* การ์ดวัสดุ (Engineering Grid View) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginatedItems.map((it) => {
            const isLow =
              Number(it.reorder_point) > 0 &&
              Number(it.qty_on_hand) <= Number(it.reorder_point) &&
              Number(it.qty_on_hand) > 0
            const isOut = Number(it.qty_on_hand) <= 0
            const catObj = cats.find((c) => c.id === it.category_id)

            return (
              <div
                key={it.id}
                className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between hover:border-steel-400 dark:hover:border-slate-700 hover:shadow-md transition space-y-3"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-steel-900 dark:text-amber-400 bg-steel-100 dark:bg-slate-800 border border-steel-200 dark:border-slate-700 px-2 py-0.5 rounded">
                      {it.item_code}
                    </span>
                    <span className="rounded-md bg-steel-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-steel-700 dark:text-slate-200 border border-steel-200 dark:border-slate-700">
                      {catObj?.name || '-'}
                    </span>
                  </div>

                  <div className="flex gap-3 items-center">
                    {it.image_url ? (
                      <R2Image
                        fileKey={it.image_url}
                        alt={it.item_name}
                        className="h-14 w-14 rounded-xl border border-steel-200 dark:border-slate-700 object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-steel-200 dark:border-slate-700 bg-steel-50 dark:bg-slate-800 text-steel-400 dark:text-slate-500 shrink-0 font-mono text-xs">
                        ไร้รูป
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-steel-900 dark:text-slate-100 truncate" title={it.item_name}>
                        {it.item_name}
                      </h4>
                      <p className="text-xs text-steel-500 dark:text-slate-400 mt-0.5">
                        ราคาเฉลี่ย: <span className="font-mono font-bold text-steel-800 dark:text-slate-200">{baht(it.avg_unit_cost)}</span> บ.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-steel-50 dark:bg-slate-800/80 p-2.5 flex items-center justify-between text-xs border border-steel-100 dark:border-slate-700">
                    <span className="text-steel-600 dark:text-slate-300 font-semibold">คงเหลือในคลัง:</span>
                    <span className="font-mono font-bold text-sm text-steel-900 dark:text-slate-100">
                      {formatIntQty(it.qty_on_hand)} <span className="text-xs font-normal text-steel-500 dark:text-slate-400">{it.unit}</span>
                    </span>
                  </div>

                  <div className="text-[10px] text-steel-400 dark:text-slate-500 flex items-center justify-between">
                    <span>อัปเดตล่าสุด:</span>
                    <span className="font-mono">
                      {it.updated_at ? fmtDateTime(it.updated_at) : '-'}
                    </span>
                  </div>
                </div>

                {/* CRUD Buttons */}
                {canEdit && (
                  <div className="pt-2 border-t border-steel-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(it)}
                      className="rounded-xl bg-steel-100 dark:bg-slate-800 hover:bg-steel-200 dark:hover:bg-slate-700 text-steel-800 dark:text-slate-200 border border-steel-200 dark:border-slate-700 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it)}
                      className="rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>ลบ</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 4.1 แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {shownItems.length > 0 && (
        <div className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-xs">
          <Pagination
            currentPage={currentPage}
            totalItems={shownItems.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
      )}

      {/* 5. จัดการหมวดหมู่วัสดุ (Category Management - Full CRUD) */}
      <div id="category-management" className="rounded-2xl border border-steel-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-steel-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-steel-700 dark:text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-steel-900 dark:text-slate-100">จัดการหมวดหมู่วัสดุ (Category Management)</h3>
              <p className="text-[11px] text-steel-500 dark:text-slate-400">
                เพิ่ม แก้ไข หรือลบหมวดหมู่สำหรับจัดกลุ่มพัสดุ พร้อมกำหนดคำนำหน้ารหัสอัตโนมัติ (Prefix)
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-steel-600 dark:text-slate-300 bg-steel-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-steel-200 dark:border-slate-700">
            ทั้งหมด {cats.length} หมวดหมู่
          </span>
        </div>

        {/* ฟอร์มเพิ่มหมวดหมู่ใหม่ (Create) */}
        {canEdit && (
          <form onSubmit={addCategory} className="rounded-xl bg-steel-50/80 dark:bg-slate-800/60 p-4 border border-steel-200 dark:border-slate-700 flex flex-wrap items-center gap-2.5">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold text-steel-700 mb-1">
                ชื่อหมวดหมู่ใหม่ *
              </label>
              <input
                type="text"
                required
                placeholder="เช่น แผงโซลาร์เซลล์, สายไฟ DC..."
                value={newCat}
                onChange={(e) => {
                  setNewCat(e.target.value)
                  if (!newCatPrefix) {
                    setNewCatPrefix(getCategoryPrefix(e.target.value))
                  }
                }}
                className="input text-xs w-full font-medium bg-white"
              />
            </div>

            <div className="w-36">
              <label className="block text-[11px] font-bold text-steel-700 mb-1">
                รหัสคำนำหน้า (Prefix) *
              </label>
              <input
                type="text"
                required
                placeholder="เช่น SOL, CAB"
                value={newCatPrefix}
                onChange={(e) => setNewCatPrefix(e.target.value.toUpperCase())}
                className="input text-xs w-full font-mono font-bold uppercase bg-white"
              />
            </div>

            <div className="self-end pt-5">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-steel-900 text-white hover:bg-steel-800 px-4 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>+ เพิ่มหมวดหมู่ใหม่</span>
              </button>
            </div>
          </form>
        )}

        {/* ตาราง/การ์ดแสดงรายการหมวดหมู่ (Read, Update, Delete) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cats.map((c) => {
            const count = items.filter((i) => i.category_id === c.id).length
            return (
              <div
                key={c.id}
                className="rounded-xl border border-steel-200 bg-white p-3.5 flex items-center justify-between text-xs hover:border-steel-300 hover:shadow-xs transition"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-steel-900 truncate">{c.name}</span>
                    <span className="font-mono text-[10px] font-bold text-steel-600 bg-steel-100 px-2 py-0.5 rounded border border-steel-200">
                      {c.code_prefix || '-'}
                    </span>
                  </div>
                  <div className="text-[11px] text-steel-500 mt-1 flex items-center gap-2 font-mono">
                    <span className={count > 0 ? 'text-steel-700 font-semibold' : 'text-steel-400'}>
                      {count} รายการ
                    </span>
                    {c.sort_order ? <span className="text-steel-400">· ลำดับ {c.sort_order}</span> : null}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditCategory(c)}
                      className="p-1.5 rounded-lg text-steel-600 hover:text-steel-900 hover:bg-steel-100 transition border border-steel-200"
                      title="แก้ไขหมวดหมู่"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c)}
                      className={`p-1.5 rounded-lg transition border ${
                        count > 0
                          ? 'text-steel-300 border-steel-100 cursor-not-allowed'
                          : 'text-rose-600 hover:text-rose-800 hover:bg-rose-50 border-rose-200 cursor-pointer'
                      }`}
                      title={count > 0 ? `ไม่สามารถลบได้เนื่องจากมีวัสดุใช้งานอยู่ ${count} รายการ` : 'ลบหมวดหมู่'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal แก้ไขหมวดหมู่ (Edit Category Modal) */}
      {editingCatId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-steel-200 dark:border-slate-800 p-4 bg-gradient-to-r from-slate-900 to-steel-900 text-white">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-hivis" />
                <span className="text-sm font-bold text-white">แก้ไขหมวดหมู่วัสดุ</span>
              </div>
              <button
                type="button"
                onClick={cancelEditCategory}
                className="rounded-full p-1 text-steel-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCategory} className="p-6 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ชื่อหมวดหมู่ *
                </label>
                <input
                  type="text"
                  required
                  className="input w-full font-semibold text-steel-900 dark:text-slate-100"
                  value={editingCatForm.name}
                  onChange={(e) => setEditingCatForm({ ...editingCatForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    รหัสคำนำหน้า (Prefix) *
                  </label>
                  <input
                    type="text"
                    required
                    className="input w-full font-mono font-bold uppercase text-steel-900 dark:text-slate-100"
                    value={editingCatForm.code_prefix}
                    onChange={(e) => setEditingCatForm({ ...editingCatForm, code_prefix: e.target.value.toUpperCase() })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    ลำดับการแสดงผล
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input w-full font-mono text-steel-900 dark:text-slate-100"
                    value={editingCatForm.sort_order}
                    onChange={(e) => setEditingCatForm({ ...editingCatForm, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-steel-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={cancelEditCategory}
                  className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-steel-700 dark:text-slate-300 hover:bg-steel-50 dark:hover:bg-slate-700 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold px-5 py-2 text-xs transition shadow-xs"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 6. Modal แก้ไขข้อมูลวัสดุ (Edit Item Modal - ข้อ 3: CRUD ชัดเจน)         */}
      {/* ---------------------------------------------------------------------- */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-steel-200 dark:border-slate-800 p-4 bg-gradient-to-r from-slate-900 to-steel-900 text-white">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-hivis" />
                <span className="text-sm font-bold text-white">
                  แก้ไขข้อมูลวัสดุ: {editingItem.item_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-full p-1 text-steel-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveEditItem} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ชื่อวัสดุ / อุปกรณ์ *
                </label>
                <input
                  type="text"
                  required
                  className="input w-full font-semibold text-steel-900 dark:text-slate-100"
                  value={editForm.item_name}
                  onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    หมวดหมู่
                  </label>
                  <select
                    className="input w-full font-medium text-steel-900 dark:text-slate-100"
                    value={editForm.category_id}
                    onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    หน่วยนับ
                  </label>
                  <input
                    type="text"
                    className="input w-full dark:text-slate-100"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    จำนวนคงเหลือ *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input w-full font-mono font-bold text-steel-900 dark:text-slate-100"
                    value={editForm.qty_on_hand}
                    onChange={(e) => setEditForm({ ...editForm, qty_on_hand: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    จุดเตือนสั่งซื้อ
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input w-full font-mono text-steel-900 dark:text-slate-100"
                    value={editForm.reorder_point}
                    onChange={(e) => setEditForm({ ...editForm, reorder_point: e.target.value === '' ? '' : String(parseInt(e.target.value, 10) || 0) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                    ราคาเฉลี่ย / ต้นทุน (บาท) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="ระบุราคาต้นทุน เช่น 150.00"
                    className="input w-full font-mono text-steel-900 bg-amber-50/20 border-amber-300 focus:bg-white"
                    value={editForm.avg_unit_cost}
                    onChange={(e) => setEditForm({ ...editForm, avg_unit_cost: e.target.value })}
                  />
                </div>
              </div>

              {/* เปลี่ยนรูปภาพ */}
              <div className="pt-2 border-t border-steel-100 space-y-2">
                <label className="block text-xs font-bold text-steel-700">รูปภาพพัสดุ</label>
                <div className="flex items-center gap-3">
                  {editImagePreview ? (
                    <img
                      src={editImagePreview}
                      alt="Edit Preview"
                      className="h-12 w-12 rounded-xl border border-steel-200 object-cover"
                    />
                  ) : editForm.image_url ? (
                    <R2Image
                      fileKey={editForm.image_url}
                      alt="Current"
                      className="h-12 w-12 rounded-xl border border-steel-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-steel-200 bg-steel-50 text-steel-400 font-mono text-xs">
                      ไร้รูป
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    ref={editFileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setEditImageFile(f)
                        setEditImagePreview(URL.createObjectURL(f))
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="rounded-xl border border-steel-300 bg-white hover:bg-steel-50 px-3 py-1.5 text-xs font-bold text-steel-700 transition"
                  >
                    อัปโหลดรูปใหม่
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-steel-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-steel-50 dark:hover:bg-slate-700 px-4 py-2 text-xs font-bold text-steel-700 dark:text-slate-300 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold px-5 py-2 text-xs transition shadow-sm disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข (อัปเดตทันที)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal เพิ่มหมวดหมู่ใหม่อย่างรวดเร็ว (Quick Add Category Modal - ไม่ต้องเลื่อนจอ) */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-steel-200 dark:border-slate-800 p-4 bg-gradient-to-r from-slate-900 to-steel-900 text-white">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-hivis" />
                <span className="text-sm font-bold text-white">เพิ่มหมวดหมู่วัสดุใหม่</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCatModal(false)
                  setQuickCatName('')
                  setQuickCatPrefix('')
                }}
                className="rounded-full p-1 text-steel-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddCategory} className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Layers className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  เพิ่มหมวดหมู่ใหม่ทันที เมื่อบันทึกแล้วระบบจะเลือกหมวดหมู่นี้ในฟอร์มให้อัตโนมัติ โดยไม่ต้องเลื่อนหน้าจอลงไปล่างสุด
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  ชื่อหมวดหมู่ใหม่ *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="เช่น อุปกรณ์งานเชื่อม, น็อตและสกรู..."
                  className="input w-full font-semibold text-steel-900 dark:text-slate-100"
                  value={quickCatName}
                  onChange={(e) => {
                    setQuickCatName(e.target.value)
                    if (!quickCatPrefix) {
                      setQuickCatPrefix(getCategoryPrefix(e.target.value))
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-steel-700 dark:text-slate-300 mb-1">
                  รหัสคำนำหน้า (Prefix ภาษาอังกฤษ) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น WLD, SCR, TOL"
                  className="input w-full font-mono font-bold uppercase text-steel-900 dark:text-slate-100"
                  value={quickCatPrefix}
                  onChange={(e) => setQuickCatPrefix(e.target.value.toUpperCase())}
                />
                <span className="text-[11px] text-steel-400 dark:text-slate-400 mt-1 block">
                  จะใช้เป็นตัวขึ้นต้นรหัสพัสดุอัตโนมัติ (เช่น {quickCatPrefix || 'XXX'}00001)
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-steel-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCatModal(false)
                    setQuickCatName('')
                    setQuickCatPrefix('')
                  }}
                  className="rounded-xl border border-steel-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-steel-700 dark:text-slate-300 hover:bg-steel-50 dark:hover:bg-slate-700 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold px-5 py-2 text-xs transition shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>{saving ? 'กำลังบันทึก...' : 'บันทึกและเลือกทันที'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal รูปใหญ่ */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-steel-200 dark:border-slate-800 p-2">
            <R2Image fileKey={previewModalImg} alt="Preview" className="max-h-[85vh] min-h-[200px] min-w-[200px] w-auto object-contain rounded-xl" />
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
