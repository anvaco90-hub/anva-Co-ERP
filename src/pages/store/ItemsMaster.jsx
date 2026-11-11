import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageStore } from '../../lib/store'
import { fmtDateTime } from '../../lib/purchasing'

const NEW_ITEM = { item_name: '', unit: '', category_id: '', reorder_point: '' }

// จัดการข้อมูลหลักวัสดุ: ชื่อ/หน่วย/หมวด/จุดแจ้งเตือนใกล้หมด + จัดการหมวด
export default function ItemsMaster() {
  const { profile } = useAuth()
  const canEdit = canManageStore(profile.role)
  const [items, setItems] = useState([])
  const [cats, setCats] = useState([])
  const [edits, setEdits] = useState({})
  const [newItem, setNewItem] = useState(NEW_ITEM)
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    supabase.from('inventory_items')
      .select('id, item_code, item_name, unit, category_id, reorder_point, qty_on_hand, created_at, updated_at, creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
      .order('item_name').then(({ data }) => setItems(data ?? []))
    supabase.from('item_categories').select('id, name, sort_order').order('sort_order').then(({ data }) => setCats(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  const val = (it, k) => edits[it.id]?.[k] ?? it[k] ?? ''
  const setEdit = (id, k, v) => setEdits({ ...edits, [id]: { ...edits[id], [k]: v } })

  async function save(it) {
    setError('')
    const { error } = await supabase.from('inventory_items').update({
      item_name: String(val(it, 'item_name')).trim(), unit: String(val(it, 'unit')).trim() || null,
      category_id: val(it, 'category_id') || null, reorder_point: Number(val(it, 'reorder_point')) || 0,
    }).eq('id', it.id)
    if (error) return setError('บันทึกไม่สำเร็จ (ตรวจสอบสิทธิ์/ชื่อวัสดุ)')
    const { [it.id]: _drop, ...rest } = edits
    setEdits(rest); load()
  }

  async function addItem() {
    setError('')
    const { error } = await supabase.from('inventory_items').insert({
      item_name: newItem.item_name.trim(), unit: newItem.unit.trim() || null,
      category_id: newItem.category_id || null, reorder_point: Number(newItem.reorder_point) || 0,
    })
    if (error) return setError('เพิ่มวัสดุไม่สำเร็จ')
    setNewItem(NEW_ITEM); load()
  }

  async function addCat() {
    setError('')
    const { error } = await supabase.from('item_categories').insert({ name: newCat.trim(), sort_order: cats.length + 1 })
    if (error) return setError(error.code === '23505' ? 'มีหมวดนี้แล้ว' : 'เพิ่มหมวดไม่สำเร็จ')
    setNewCat(''); load()
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {canEdit && (
        <div className="grid gap-2 rounded-lg bg-white p-4 md:grid-cols-[1fr_6rem_12rem_8rem_auto]">
          <input className="input" placeholder="ชื่อวัสดุใหม่ *" value={newItem.item_name} onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })} />
          <input className="input" placeholder="หน่วย" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />
          <select className="input" value={newItem.category_id} onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}>
            <option value="">-- หมวด --</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" type="number" min="0" placeholder="เตือนเมื่อ ≤" value={newItem.reorder_point} onChange={(e) => setNewItem({ ...newItem, reorder_point: e.target.value })} />
          <button className="btn-primary" onClick={addItem} disabled={!newItem.item_name.trim()}>+ เพิ่ม</button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg bg-white p-4">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-steel-500">
            <th className="py-2">รหัส</th><th>ชื่อวัสดุ</th><th>หมวด</th><th>หน่วย</th><th>เตือนเมื่อ ≤</th><th className="text-right">คงเหลือ</th><th>บันทึกล่าสุด</th><th />
          </tr></thead>
          <tbody>{items.map((it) => (
            <tr key={it.id} className="border-b last:border-0 align-top">
              <td className="py-2 text-xs text-steel-500">{it.item_code}</td>
              <td>{canEdit ? <input className="input" value={val(it, 'item_name')} onChange={(e) => setEdit(it.id, 'item_name', e.target.value)} /> : it.item_name}</td>
              <td>{canEdit ? (
                <select className="input" value={val(it, 'category_id')} onChange={(e) => setEdit(it.id, 'category_id', e.target.value)}>
                  <option value="">-</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>) : cats.find((c) => c.id === it.category_id)?.name ?? '-'}</td>
              <td>{canEdit ? <input className="input w-20" value={val(it, 'unit')} onChange={(e) => setEdit(it.id, 'unit', e.target.value)} /> : it.unit}</td>
              <td>{canEdit ? <input className="input w-24" type="number" min="0" value={val(it, 'reorder_point')} onChange={(e) => setEdit(it.id, 'reorder_point', e.target.value)} /> : it.reorder_point}</td>
              <td className="text-right">{it.qty_on_hand}</td>
              <td className="text-xs text-steel-500">
                {it.updated_at ? `แก้โดย ${it.updater?.full_name ?? '-'} ${fmtDateTime(it.updated_at)}` : `เพิ่มโดย ${it.creator?.full_name ?? '-'} ${fmtDateTime(it.created_at)}`}
              </td>
              <td>{canEdit && edits[it.id] && <button className="btn-primary !py-1" onClick={() => save(it)}>บันทึก</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {items.length === 0 && <p className="py-3 text-steel-500">ยังไม่มีวัสดุ</p>}
      </div>

      <div className="mt-6 max-w-md rounded-lg bg-white p-4 text-sm">
        <h3 className="font-semibold">หมวดวัสดุ</h3>
        <ul className="mt-2 flex flex-wrap gap-2">{cats.map((c) => <li key={c.id} className="rounded-full bg-steel-100 px-3 py-1">{c.name}</li>)}</ul>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="ชื่อหมวดใหม่" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn-primary" onClick={addCat} disabled={!newCat.trim()}>เพิ่ม</button>
          </div>
        )}
      </div>
    </div>
  )
}
