import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import FileUploadPrompt from '../components/FileUploadPrompt'
import SpreadsheetView from '../components/SpreadsheetView'
import { useAuth } from '../context/auth'
import { fetchConfig, saveConfigOnServer } from '../lib/accountApi'

/**
 * ConfigurePage — /dashboard/choose-algo/:algoId/configure
 *
 * File upload and the spreadsheet editor for the selected algorithm. "Close"
 * returns to that algorithm rather than all the way to the dashboard.
 *
 * The sheet is now saved on the server, per user per algorithm, so a run can be
 * told what to trade with and a refresh does not throw the work away. Edits are
 * saved on a short debounce rather than on every keystroke: the editor fires an
 * update per cell change, and one request each would be hundreds of writes.
 */

const SAVE_DEBOUNCE_MS = 1200

export default function ConfigurePage() {
  const navigate = useNavigate()
  const { algoId } = useParams()
  const { authData } = useAuth()
  const session = authData?.appSession
  const [spreadsheet, setSpreadsheet] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const saveTimer = useRef(null)
  const back = algoId ? `/dashboard/choose-algo/${algoId}` : '/dashboard'

  // Load whatever was saved last time, so Configure reopens where it left off.
  useEffect(() => {
    if (!session || !algoId) return undefined
    let cancelled = false
    fetchConfig(session, algoId)
      .then((saved) => {
        // Only a sheet with columns is restorable; anything else is treated as
        // nothing saved, and the upload prompt shows instead.
        if (!cancelled && saved?.params?.columnDefs?.length) setSpreadsheet(saved.params)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [session, algoId])

  // Any pending save must not fire after the page is gone.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const persist = (sheet) => {
    if (!session || !algoId) return
    setSaveState('saving')
    saveConfigOnServer(session, {
      algoId,
      label: sheet.fileName,
      sourceFile: sheet.fileName,
      params: sheet,
    })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'))
  }

  const queueSave = (sheet) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(sheet), SAVE_DEBOUNCE_MS)
  }

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
    if (!parsed) return
    setSpreadsheet(parsed)
    // A fresh upload is saved immediately — there is nothing to debounce yet.
    persist(parsed)
  }

  const handleUpdateSpreadsheet = (newRowData) => {
    setSpreadsheet((prev) => {
      if (!prev) return prev
      const next = { ...prev, rowData: newRowData }
      queueSave(next)
      return next
    })
  }

  if (spreadsheet) {
    return (
      <div className="flex flex-col h-full w-full min-h-0">
        <SpreadsheetView
          spreadsheet={spreadsheet}
          onClose={() => navigate(back)}
          onChangeFile={() => setSpreadsheet(null)}
          onUpdate={handleUpdateSpreadsheet}
        />
        <p className="shrink-0 px-4 py-1.5 text-[10px] font-mono text-ink-3">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && `Saved for ${algoId} — this is what Start Algo will use.`}
          {saveState === 'error' && <span className="text-bad">Could not save this configuration to the server.</span>}
          {saveState === 'idle' && 'Edits save automatically.'}
        </p>
      </div>
    )
  }

  return <FileUploadPrompt onFileSelected={handleUploadFile} />
}
