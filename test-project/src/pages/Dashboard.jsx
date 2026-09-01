import { useState } from 'react'
import * as XLSX from 'xlsx'
import Sidebar from '../components/Sidebar'
import MainArea from '../components/MainArea'
import TopBar from '../components/TopBar'
import { useMachine } from '../hooks/useMachine'

export default function Dashboard() {
  const { isRunning, handleStart, handleStop } = useMachine()
  // activeView: null | 'configure' | 'status' | 'amount'
  const [activeView, setActiveView] = useState(null)
  const [spreadsheet, setSpreadsheet] = useState(null)
  const [amount, setAmount] = useState(0)

  const handleCloseView = () => {
    setActiveView(null);
  };

  const handleMStockLogin = () => {
    setActiveView((prev) => (prev === 'mstockLogin' ? null : 'mstockLogin'))
  }

  const handleDashboardPreview = () => {
    setActiveView('mstockPreview')
  }

  // ... (rest unchanged)


  const parseSpreadsheetFile = async (file) => {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

    if (!rawRows || rawRows.length === 0) {
      return null
    }

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

    return {
      fileName: file.name,
      columnDefs,
      rowData,
    }
  }

  const handleUploadFile = async (file) => {
    const parsed = await parseSpreadsheetFile(file)
    if (!parsed) {
      return
    }

    setSpreadsheet(parsed)
    setActiveView('configure')
  }

  const handleCloseSpreadsheet = () => {
    setActiveView(null)
  }

  const handleChangeFile = () => {
    setSpreadsheet(null)
  }

  const handleUpdateSpreadsheet = (newRowData) => {
    setSpreadsheet((prev) => (prev ? { ...prev, rowData: newRowData } : prev))
  }

  const handleAmountChange = (newAmount) => {
    setAmount(newAmount)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white overflow-hidden">
      <TopBar onDashboardPreview={handleDashboardPreview} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isRunning={isRunning}
          onStart={handleStart}
          onStop={handleStop}
          onConfigure={() => setActiveView((prev) => (prev === 'configure' ? null : 'configure'))}
          onInspectStatus={() => setActiveView((prev) => (prev === 'status' ? null : 'status'))}
          onAmount={() => setActiveView((prev) => (prev === 'amount' ? null : 'amount'))}
          onMStockLogin={handleMStockLogin}
        />
        <MainArea
          isRunning={isRunning}
          activeView={activeView}
          spreadsheet={spreadsheet}
          amount={amount}
          onUploadFile={handleUploadFile}
          onChangeFile={handleChangeFile}
          onCloseView={handleCloseView}
          onCloseSpreadsheet={handleCloseSpreadsheet}
          onUpdateSpreadsheet={handleUpdateSpreadsheet}
          onAmountChange={handleAmountChange}
        />
      </div>
    </div>
  )
}
