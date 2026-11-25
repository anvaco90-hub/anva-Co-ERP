import { useEffect, useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import SearchableSelect from './SearchableSelect'
import { fetchUnifiedCustomers } from '../lib/contactsSync'

/**
 * Searchable customer selector backed by unified Contacts + Customers Master Data,
 * while still permitting free-text customer entry (`allowCustom`).
 */
export default function CustomerSelectField({
  value = '',
  onChange,
  placeholder = 'พิมพ์ค้นหาลูกค้าจากสมุดรายชื่อ หรือพิมพ์ชื่อบริษัทใหม่...',
  className = '',
}) {
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    let active = true
    fetchUnifiedCustomers()
      .then((list) => {
        if (active) setCustomers(list || [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(
    () =>
      customers.map((c) => ({
        value: c.customer_name || c.name,
        badge: c.customer_code || c.code || 'ลูกค้า',
        label: c.customer_name || c.name,
        subLabel: [
          c.tax_id ? `เลขภาษี: ${c.tax_id}` : '',
          c.phone ? `โทร: ${c.phone}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        keywords: `${c.customer_code || ''} ${c.customer_name || ''} ${c.tax_id || ''} ${c.phone || ''}`,
      })),
    [customers]
  )

  return (
    <SearchableSelect
      className={className}
      icon={Building2}
      options={options}
      value={value}
      allowCustom
      placeholder={placeholder}
      customPlaceholder="ใช้ชื่อลูกค้านี้โดยตรง"
      onChange={(val) => onChange?.(val)}
      onCustomChange={(val) => onChange?.(val)}
    />
  )
}
