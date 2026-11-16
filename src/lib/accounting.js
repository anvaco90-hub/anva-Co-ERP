/**
 * Accounting Helpers and Formatters for anva-Co-ERP
 * Supporting FlowAccount styling, Thai tax standards, and double-entry bookkeeping
 */

export const formatBaht = (n, showSymbol = true) => {
  const num = Number(n || 0)
  const formatted = num.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return showSymbol ? `฿${formatted}` : formatted
}

export const formatThaiDate = (dateStr, showBuddhistYear = true) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = String(d.getDate()).padStart(2, '0')
    const monthNames = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ]
    const month = monthNames[d.getMonth()]
    const year = showBuddhistYear ? d.getFullYear() + 543 : d.getFullYear()
    return `${day} ${month} ${year}`
  } catch {
    return dateStr
  }
}

export const formatShortDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return dateStr
  }
}

/**
 * Aging calculation based on reference date and asOfDate
 * @param {string|Date} targetDate - The due date or document date
 * @param {string|Date} asOfDate - Cutoff date
 * @returns {object} { diffDays, bucket, isOverdue }
 */
export const calculateAging = (targetDate, asOfDate = new Date()) => {
  if (!targetDate) return { diffDays: 0, bucket: 'current', isOverdue: false }

  const asOf = new Date(asOfDate)
  asOf.setHours(0, 0, 0, 0)

  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)

  const diffMs = asOf.getTime() - target.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  let bucket = 'current'
  if (diffDays <= 0) {
    bucket = 'current' // ยังไม่ครบกำหนด
  } else if (diffDays <= 30) {
    bucket = '1-30'
  } else if (diffDays <= 60) {
    bucket = '31-60'
  } else if (diffDays <= 90) {
    bucket = '61-90'
  } else {
    bucket = 'over90'
  }

  return {
    diffDays,
    bucket,
    isOverdue: diffDays > 0,
  }
}

/**
 * Universal UTF-8 with BOM CSV Exporter for Thai Excel Compatibility
 */
export const exportToCSV = (filename, headers, rows) => {
  const processRow = (row) => {
    let finalVal = ''
    for (let j = 0; j < row.length; j++) {
      let innerValue = row[j] === null || row[j] === undefined ? '' : row[j].toString()
      if (row[j] instanceof Date) {
        innerValue = row[j].toLocaleString()
      }
      let result = innerValue.replace(/"/g, '""')
      if (result.search(/("|,|\n)/g) >= 0) {
        result = `"${result}"`
      }
      if (j > 0) finalVal += ','
      finalVal += result
    }
    return `${finalVal}\n`
  }

  let csvFile = '\uFEFF' // UTF-8 BOM
  csvFile += processRow(headers)

  for (let i = 0; i < rows.length; i++) {
    csvFile += processRow(rows[i])
  }

  const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

/**
 * Generate Revenue Department (RD Prep) format file for WHT
 */
export const exportRDPrepWHT = (filename, records, formType = 'PND53') => {
  // RD Prep standard format: TaxID|Branch|Name|Address|Date|IncomeType|Rate|BaseAmount|TaxAmount|Condition
  let content = '\uFEFF'
  records.forEach((rec, idx) => {
    const seq = idx + 1
    const taxId = (rec.tax_id || '0000000000000').replace(/[^0-9]/g, '')
    const branch = rec.branch_code || '00000'
    const name = (rec.vendor_name || rec.contact_name || '').replace(/\|/g, '')
    const dateStr = rec.document_date ? rec.document_date.replace(/-/g, '') : ''
    const rate = Number(rec.wht_rate || 3).toFixed(2)
    const base = Number(rec.base_amount || 0).toFixed(2)
    const tax = Number(rec.wht_amount || 0).toFixed(2)
    const incomeType = 'ค่าบริการ/จ้างทำของ'

    content += `${seq}|${taxId}|${branch}|${name}||${dateStr}|${incomeType}|${rate}|${base}|${tax}|1\r\n`
  })

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
  const link = document.createElement('a')
  link.setAttribute('href', URL.createObjectURL(blob))
  link.setAttribute('download', `${filename}_${formType}.txt`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

