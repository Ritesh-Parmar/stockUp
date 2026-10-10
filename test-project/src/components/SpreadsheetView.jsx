import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

export default function SpreadsheetView({ spreadsheet, onClose, onChangeFile, onUpdate }) {
  const [rowData, setRowData] = useState(spreadsheet.rowData || [])
  const [sortConfig, setSortConfig] = useState({ field: null, direction: null })
  const [editingCell, setEditingCell] = useState(null) // { rowIndex, field }
  const [editValue, setEditValue] = useState('')
  const [selectedCell, setSelectedCell] = useState(null) // { rowIndex, field }
  const tableRef = useRef(null)
  const inputRef = useRef(null)

  // No prop->state sync effect here on purpose. ConfigurePage only renders this
  // component while `spreadsheet` is non-null and you must pass through the
  // upload prompt (spreadsheet === null) to load a different file, so it always
  // remounts and the useState initialiser above is enough. Syncing in an effect
  // also echoed every local edit straight back through onUpdate, costing an
  // extra render per keystroke.

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      // Move cursor to end
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [editingCell])

  const getColumnIndex = useCallback(
    (field) => spreadsheet.columnDefs.findIndex((col) => col.field === field),
    [spreadsheet.columnDefs]
  )

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const { rowIndex, field } = editingCell
    const updated = rowData.map((row, i) =>
      i === rowIndex ? { ...row, [field]: editValue } : row
    )
    setRowData(updated)
    onUpdate(updated)
    setEditingCell(null)
  }, [editingCell, editValue, rowData, onUpdate])

  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  const startEdit = useCallback(
    (rowIndex, field) => {
      const value = rowData[rowIndex]?.[field] ?? ''
      setEditingCell({ rowIndex, field })
      setEditValue(String(value))
    },
    [rowData]
  )

  const handleCellClick = useCallback(
    (rowIndex, field) => {
      setSelectedCell({ rowIndex, field })
      if (editingCell && (editingCell.rowIndex !== rowIndex || editingCell.field !== field)) {
        commitEdit()
      }
    },
    [editingCell, commitEdit]
  )

  const handleCellDoubleClick = useCallback(
    (rowIndex, field) => {
      startEdit(rowIndex, field)
    },
    [startEdit]
  )

  const navigateCell = useCallback(
    (rowIndex, field, direction) => {
      const cols = spreadsheet.columnDefs
      const colIdx = getColumnIndex(field)
      let newRow = rowIndex
      let newColIdx = colIdx

      switch (direction) {
        case 'right':
          if (colIdx < cols.length - 1) newColIdx = colIdx + 1
          break
        case 'left':
          if (colIdx > 0) newColIdx = colIdx - 1
          break
        case 'down':
          if (rowIndex < rowData.length - 1) newRow = rowIndex + 1
          break
        case 'up':
          if (rowIndex > 0) newRow = rowIndex - 1
          break
        default:
          break
      }

      const newField = cols[newColIdx].field
      setSelectedCell({ rowIndex: newRow, field: newField })
      return { rowIndex: newRow, field: newField }
    },
    [spreadsheet.columnDefs, rowData.length, getColumnIndex]
  )

  const handleKeyDown = useCallback(
    (e, rowIndex, field) => {
      if (editingCell) {
        // Editing mode keys
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          commitEdit()
          navigateCell(rowIndex, field, 'down')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          commitEdit()
          const next = navigateCell(rowIndex, field, e.shiftKey ? 'left' : 'right')
          startEdit(next.rowIndex, next.field)
        }
      } else {
        // Navigation mode keys
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          startEdit(rowIndex, field)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          navigateCell(rowIndex, field, e.shiftKey ? 'left' : 'right')
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          navigateCell(rowIndex, field, 'right')
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          navigateCell(rowIndex, field, 'left')
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          navigateCell(rowIndex, field, 'down')
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          navigateCell(rowIndex, field, 'up')
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const updated = rowData.map((row, i) =>
            i === rowIndex ? { ...row, [field]: '' } : row
          )
          setRowData(updated)
          onUpdate(updated)
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Start editing with typed character
          e.preventDefault()
          setEditingCell({ rowIndex, field })
          setEditValue(e.key)
        }
      }
    },
    [editingCell, commitEdit, cancelEdit, navigateCell, startEdit, rowData, onUpdate]
  )

  const handleSort = useCallback(
    (field) => {
      let direction = 'asc'
      if (sortConfig.field === field && sortConfig.direction === 'asc') {
        direction = 'desc'
      } else if (sortConfig.field === field && sortConfig.direction === 'desc') {
        direction = null
      }

      setSortConfig({ field, direction })

      if (!direction) {
        setRowData(spreadsheet.rowData || [])
        onUpdate(spreadsheet.rowData || [])
        return
      }

      const sorted = [...rowData].sort((a, b) => {
        const valA = a[field] ?? ''
        const valB = b[field] ?? ''
        const numA = Number(valA)
        const numB = Number(valB)
        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
          return direction === 'asc' ? numA - numB : numB - numA
        }
        return direction === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
      setRowData(sorted)
      onUpdate(sorted)
    },
    [sortConfig, rowData, spreadsheet.rowData, onUpdate]
  )

  const handleAddRow = useCallback(() => {
    const newRow = { _id: Date.now() }
    spreadsheet.columnDefs.forEach((col) => {
      newRow[col.field] = ''
    })
    const updated = [...rowData, newRow]
    setRowData(updated)
    onUpdate(updated)
  }, [rowData, spreadsheet.columnDefs, onUpdate])

  const handleDeleteRow = useCallback(
    (rowIndex) => {
      const updated = rowData.filter((_, i) => i !== rowIndex)
      setRowData(updated)
      onUpdate(updated)
      if (selectedCell && selectedCell.rowIndex === rowIndex) {
        setSelectedCell(null)
      }
      if (editingCell && editingCell.rowIndex === rowIndex) {
        setEditingCell(null)
      }
    },
    [rowData, onUpdate, selectedCell, editingCell]
  )

  const handleDownload = () => {
    const headerRow = spreadsheet.columnDefs.map((col) => col.headerName)
    const values = [
      headerRow,
      ...rowData.map((row) => spreadsheet.columnDefs.map((col) => row[col.field] ?? '')),
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(values)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    XLSX.writeFile(workbook, spreadsheet.fileName || 'spreadsheet.xlsx')
  }

  const getSortIcon = (field) => {
    if (sortConfig.field !== field) return '⇅'
    if (sortConfig.direction === 'asc') return '↑'
    if (sortConfig.direction === 'desc') return '↓'
    return '⇅'
  }

  const displayRows = rowData

  return (
    <div className="flex h-full flex-col rounded-3xl border border-edge-strong bg-panel/90 p-4 shadow-xl shadow-shade/20">
      {/* Header toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3 text-ink">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-ink-3">Spreadsheet</p>
          <h3 className="text-lg font-semibold text-ink">{spreadsheet.fileName}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAddRow}
            className="rounded-xl border border-good/50 bg-good/20 px-4 py-2 text-sm font-medium text-good transition hover:border-good hover:bg-good/30"
          >
            + Add Row
          </button>
          <button
            type="button"
            onClick={onChangeFile}
            className="rounded-xl border border-edge-strong bg-raised px-4 py-2 text-sm text-ink transition hover:border-edge-hover hover:bg-raised"
          >
            Change File
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-xl border border-edge-strong bg-warn px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-warn/90"
          >
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-edge-strong bg-raised px-4 py-2 text-sm text-ink transition hover:border-edge-hover hover:bg-raised"
          >
            Close
          </button>
        </div>
      </div>

      {/* Editable mode indicator */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="inline-block h-2 w-2 rounded-full bg-good animate-pulse" />
        <span className="text-xs font-mono text-good/80 tracking-wider uppercase">
          Edit Mode Active
        </span>
        <span className="text-xs text-ink-3 ml-2">
          Double-click or press Enter to edit • Tab to move • Escape to cancel
        </span>
      </div>

      {/* Spreadsheet table */}
      <div
        className="flex-1 min-h-0 overflow-auto rounded-2xl border border-edge bg-page"
        style={{ scrollbarColor: '#334155 #0f172a' }}
      >
        <table
          ref={tableRef}
          className="w-full border-collapse"
          style={{ minWidth: `${spreadsheet.columnDefs.length * 140 + 60}px` }}
        >
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="spreadsheet-row-num-header">#</th>
              {spreadsheet.columnDefs.map((col) => (
                <th
                  key={col.field}
                  className="spreadsheet-header-cell"
                  onClick={() => handleSort(col.field)}
                  title={`Sort by ${col.headerName}`}
                >
                  <span className="spreadsheet-header-text">{col.headerName}</span>
                  <span className="spreadsheet-sort-icon">{getSortIcon(col.field)}</span>
                </th>
              ))}
              <th className="spreadsheet-row-num-header" style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr
                key={row._id ?? rowIndex}
                className={`spreadsheet-row ${
                  selectedCell?.rowIndex === rowIndex ? 'spreadsheet-row-selected' : ''
                }`}
              >
                <td className="spreadsheet-row-num">{rowIndex + 1}</td>
                {spreadsheet.columnDefs.map((col) => {
                  const isEditing =
                    editingCell?.rowIndex === rowIndex && editingCell?.field === col.field
                  const isSelected =
                    selectedCell?.rowIndex === rowIndex && selectedCell?.field === col.field

                  return (
                    <td
                      key={col.field}
                      className={`spreadsheet-cell ${isSelected ? 'spreadsheet-cell-selected' : ''} ${
                        isEditing ? 'spreadsheet-cell-editing' : ''
                      }`}
                      onClick={() => handleCellClick(rowIndex, col.field)}
                      onDoubleClick={() => handleCellDoubleClick(rowIndex, col.field)}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, col.field)}
                      tabIndex={isSelected ? 0 : -1}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="spreadsheet-cell-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, col.field)}
                        />
                      ) : (
                        <span className="spreadsheet-cell-value">
                          {row[col.field] !== undefined && row[col.field] !== null
                            ? String(row[col.field])
                            : ''}
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="spreadsheet-delete-cell">
                  <button
                    type="button"
                    className="spreadsheet-delete-btn"
                    title="Delete row"
                    onClick={() => handleDeleteRow(rowIndex)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {displayRows.length === 0 && (
          <div className="flex items-center justify-center py-20 text-ink-3 text-sm font-mono">
            No data. Click "+ Add Row" to begin.
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="mt-2 flex items-center justify-between px-2 text-xs font-mono text-ink-3">
        <span>
          {rowData.length} row{rowData.length !== 1 ? 's' : ''} •{' '}
          {spreadsheet.columnDefs.length} column{spreadsheet.columnDefs.length !== 1 ? 's' : ''}
        </span>
        {selectedCell && (
          <span className="text-ink-2">
            Cell {String.fromCharCode(65 + getColumnIndex(selectedCell.field))}
            {selectedCell.rowIndex + 1}
          </span>
        )}
      </div>
    </div>
  )
}
