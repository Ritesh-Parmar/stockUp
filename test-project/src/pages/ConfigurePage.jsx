import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import FileUploadPrompt from '../components/FileUploadPrompt'
import SpreadsheetView from '../components/SpreadsheetView'

/**
 * ConfigurePage — /dashboard/configure
 * Handles file upload and the spreadsheet editor.
 * "Close" navigates back to /dashboard.
 */
export default function ConfigurePage() {
  const navigate = useNavigate()
  const [spreadsheet, setSpreadsheet] = useState(null)

  const parseSpreadsheetFile = async (file) => {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

    if (!rawRows || rawRows.length === 0) return null

    const headerRow = rawRows[0].map((value, index) => String(value || `Column ${index + 1}`))
    const columnDefs = headerRow.map((header, index) => ({
      field: `col${index}`,
      headerName: header,
      editable: true,
      minWidth: 120,
      flex: 1,
    }))

    const rowData = rawRows.slice(1).map((row, rowIndex) => {
      const item = {}
      columnDefs.forEach((column, columnIndex) => {
        item[column.field] = row[columnIndex] ?? ''
      })
      item._id = rowIndex + 1
      return item
    })

    return { fileName: file.name, columnDefs, rowData }
  }

  const handleUploadFile = async (file) => {
    const parsed = await parseSpreadsheetFile(file)
    if (parsed) setSpreadsheet(parsed)
  }

  const handleUpdateSpreadsheet = (newRowData) => {
    setSpreadsheet((prev) => (prev ? { ...prev, rowData: newRowData } : prev))
  }

  if (spreadsheet) {
    return (
      <SpreadsheetView
        spreadsheet={spreadsheet}
        onClose={() => navigate('/dashboard')}
        onChangeFile={() => setSpreadsheet(null)}
        onUpdate={handleUpdateSpreadsheet}
      />
    )
  }

  return <FileUploadPrompt onFileSelected={handleUploadFile} />
}
