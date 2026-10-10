/** Build and hand the browser a CSV file. Shared by the instrument views. */

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const toCsv = (items) => {
  const headers = Object.keys(items[0] ?? {})
  return [headers.join(','), ...items.map((item) => headers.map((header) => csvCell(item[header])).join(','))].join('\r\n')
}

// Leading BOM so Excel opens UTF-8 symbol names correctly instead of mojibake.
export const downloadCsv = (items, filename) => {
  if (!items?.length) return
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(items)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const stampedName = (name) => `${name}-${new Date().toISOString().slice(0, 10)}.csv`
