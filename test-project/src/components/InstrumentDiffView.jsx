import { useState } from 'react'
import { AlertCircle, ArrowRight, Download, FileUp, GitCompare, Loader2, MinusCircle, PencilLine, PlusCircle } from 'lucide-react'
import { downloadCsv, stampedName } from '../lib/csvFile'

const TABS = [
  ['added', 'Added', PlusCircle, 'text-good', 'border-good'],
  ['deleted', 'Deleted', MinusCircle, 'text-bad', 'border-bad'],
  ['changed', 'Changed', PencilLine, 'text-warn', 'border-warn'],
]

const PREVIEW_ROWS = 100

function SummaryCard({ label, count, Icon, tone }) {
  return <div className="rounded-xl bg-raised/70 border border-edge-strong p-4">
    <div className={`flex items-center gap-2 ${tone}`}>
      <Icon size={16} />
      <p className="text-[10px] font-mono uppercase tracking-wider">{label}</p>
    </div>
    <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{count.toLocaleString('en-IN')}</p>
  </div>
}

function ResultTable({ rows, showChanges }) {
  if (!rows.length) return <p className="text-ink-3 text-sm">Nothing in this list.</p>
  return <>
    <div className="table-scroll overflow-x-auto overflow-y-auto max-h-[26rem] rounded-lg border border-edge">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="text-left text-ink-3 border-b border-edge-strong sticky top-0 bg-panel">
          <tr>
            {['Symbol', 'Token', 'Type', 'Expiry', 'Lot'].map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}
            {showChanges && <th className="px-2 py-2 font-medium">What changed</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
            <tr key={`${row.instrument_token ?? index}-${index}`} className="border-b border-edge/80">
              <td className="px-2 py-2.5"><p className="font-semibold text-ink">{row.tradingsymbol}</p><p className="text-ink-3 truncate max-w-[220px]" title={row.name}>{row.name}</p></td>
              <td className="px-2 py-2.5 text-ink-2 font-mono">{row.instrument_token}</td>
              <td className="px-2 py-2.5 text-ink-2">{[row.exchange, row.instrument_type].filter(Boolean).join(' · ')}</td>
              <td className="px-2 py-2.5 text-ink-2">{row.expiry || '—'}</td>
              <td className="px-2 py-2.5 text-ink-2">{row.lot_size || '—'}</td>
              {showChanges && <td className="px-2 py-2.5"><p className="text-warn font-medium">{row.changed_fields}</p><p className="text-ink-3">{row.previous_values} → {row.new_values}</p></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {rows.length > PREVIEW_ROWS && (
      <p className="mt-2 text-xs text-ink-3">
        Showing the first {PREVIEW_ROWS} of {rows.length.toLocaleString('en-IN')}. Download the CSV for the full list.
      </p>
    )}
  </>
}

/**
 * InstrumentDiffView — compare two instrument-master snapshots.
 *
 * Shared by the real page and the preview, so the demo can't drift from the
 * live UI. The parent supplies snapshots, the compare function and any error.
 */
export default function InstrumentDiffView({
  snapshots = [],
  result = null,
  loading = false,
  error = '',
  onCompare,
  onCompareFiles,
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState('added')
  const [files, setFiles] = useState({ old: null, new: null })

  // Default to the two most recent snapshots — the usual comparison.
  const defaultTo = to || snapshots[0]?.day || ''
  const defaultFrom = from || snapshots[1]?.day || ''

  const rows = result?.[tab] ?? []
  const activeTab = TABS.find(([key]) => key === tab)

  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-ink">Compare Instruments</h2>
      <p className="text-ink-2 text-sm mt-1">
        See what the exchange added, removed or changed between two days of the instrument master.
      </p>
    </div>

    {error && <div className="flex gap-3 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}

    {/* Compare two captured days */}
    <section className="bg-panel border border-edge-strong rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-ink-2">
        <GitCompare size={16} className="text-brand" />
        <p className="font-semibold text-sm">Compare saved days</p>
      </div>
      {snapshots.length < 2 ? (
        <p className="text-ink-3 text-sm">
          {snapshots.length === 1
            ? 'Only one day captured so far. A snapshot is saved automatically each time you sign in — come back tomorrow, or upload two files below.'
            : 'No snapshots captured yet. One is saved automatically after each sign-in, or upload two files below.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-2">Old file
            <select value={defaultFrom} onChange={(event) => setFrom(event.target.value)} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink min-w-[160px]">
              {snapshots.map((snapshot) => <option key={snapshot.day} value={snapshot.day}>{snapshot.day}</option>)}
            </select>
          </label>
          <ArrowRight size={16} className="text-ink-3 mb-3" />
          <label className="flex flex-col gap-1 text-xs text-ink-2">New file
            <select value={defaultTo} onChange={(event) => setTo(event.target.value)} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink min-w-[160px]">
              {snapshots.map((snapshot) => <option key={snapshot.day} value={snapshot.day}>{snapshot.day}</option>)}
            </select>
          </label>
          <button
            onClick={() => onCompare?.(defaultFrom, defaultTo)}
            disabled={loading || !defaultFrom || !defaultTo || defaultFrom === defaultTo}
            className="flex items-center gap-2 bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink font-semibold text-sm py-2.5 px-5 rounded-xl"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
      )}
    </section>

    {/* Manual upload fallback */}
    <details className="bg-panel border border-edge-strong rounded-2xl p-5">
      <summary className="cursor-pointer text-sm text-ink-2 flex items-center gap-2">
        <FileUp size={15} className="text-ink-3" />
        Or upload two CSV files yourself
      </summary>
      <p className="text-ink-3 text-xs mt-2 mb-4">For files from another machine, or from before snapshots were being saved.</p>
      <div className="flex flex-wrap items-end gap-3">
        {['old', 'new'].map((slot) => (
          <label key={slot} className="flex flex-col gap-1 text-xs text-ink-2">
            {slot === 'old' ? 'Old CSV' : 'New CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFiles((current) => ({ ...current, [slot]: event.target.files?.[0] ?? null }))}
              className="text-xs text-ink-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-ink"
            />
          </label>
        ))}
        <button
          onClick={() => onCompareFiles?.(files.old, files.new)}
          disabled={loading || !files.old || !files.new}
          className="bg-raised hover:bg-raised disabled:opacity-50 text-ink font-semibold text-sm py-2.5 px-5 rounded-xl"
        >
          Compare files
        </button>
      </div>
    </details>

    {/* Results */}
    {result && (
      <section className="bg-panel border border-edge-strong rounded-2xl p-5 space-y-5">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-3">
            {result.from} → {result.to} · {result.summary.oldRows.toLocaleString('en-IN')} rows → {result.summary.newRows.toLocaleString('en-IN')} rows
          </p>
          <div className="grid grid-cols-3 gap-3">
            {TABS.map(([key, tabLabel, Icon, tone]) => (
              <SummaryCard key={key} label={tabLabel} count={result.summary[key]} Icon={Icon} tone={tone} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge-strong">
          <div className="flex gap-5">
            {TABS.map(([key, tabLabel, Icon, tone, border]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${tab === key ? `${border} ${tone}` : 'border-transparent text-ink-3 hover:text-ink-2'}`}
              >
                <Icon size={15} />{tabLabel}
                <span className="text-xs font-mono text-ink-3">{result.summary[key].toLocaleString('en-IN')}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => downloadCsv(rows, stampedName(`${tab}-master`))}
            disabled={!rows.length}
            className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink"
          >
            <Download size={15} />Download {activeTab?.[1].toLowerCase()} master
          </button>
        </div>

        <ResultTable rows={rows} showChanges={tab === 'changed'} />
      </section>
    )}
  </div>
}
