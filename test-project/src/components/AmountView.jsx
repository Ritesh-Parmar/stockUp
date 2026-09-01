import { useState, useRef, useEffect } from 'react'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'

// Fractions of the available balance — more useful here than fixed rupee amounts,
// which mean nothing without knowing what is actually in the account.
const PRESETS = [0.25, 0.5, 0.75, 1]

export default function AmountView({
  amount,
  balance = null,
  loading = false,
  error = '',
  onAmountChange,
  onRefresh,
  onClose,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  const hasBalance = typeof balance === 'number'
  const edited = hasBalance && Number(amount) !== Number(balance)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const formatAmount = (num) => {
    return Number(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const handleStartEdit = () => {
    setEditValue(String(amount))
    setIsEditing(true)
  }

  const handleConfirm = () => {
    const parsed = parseFloat(editValue)
    if (!isNaN(parsed) && parsed >= 0) {
      onAmountChange(parsed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl shadow-slate-950/40">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-slate-100">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Finance</p>
          <h3 className="text-lg font-semibold text-slate-100">Amount</h3>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="Reload the balance from mStock"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:bg-slate-700 disabled:opacity-50"
            >
              <RotateCcw size={14} className={loading ? 'animate-spin' : undefined} />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500 hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* Amount display */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* Label */}
          <div className="text-center">
            <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500">
              {edited ? 'Amount' : 'Available Balance'}
            </p>
            <p className="mt-1.5 text-xs font-mono text-slate-600">
              {loading ? 'Loading from mStock…' : error ? 'Could not reach mStock' : 'From your mStock fund summary'}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={17} className="shrink-0" />
              <span>{error}</span>
              {onRefresh && (
                <button type="button" onClick={onRefresh} className="ml-2 shrink-0 rounded-lg border border-red-500/40 px-3 py-1 text-xs font-mono text-red-200 transition hover:bg-red-500/20">
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Amount card */}
          <div
            className="group relative rounded-3xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-12 py-10 shadow-2xl shadow-slate-950/60 cursor-pointer transition-all duration-300 hover:border-slate-600 hover:shadow-amber-900/10"
            onClick={() => !isEditing && !loading && handleStartEdit()}
            title="Click to edit"
          >
            {/* Decorative corner accents */}
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-amber-500/30 rounded-tl-lg" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-amber-500/30 rounded-tr-lg" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-amber-500/30 rounded-bl-lg" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-amber-500/30 rounded-br-lg" />

            {loading ? (
              <div className="flex items-center gap-3">
                <span className="text-5xl font-bold text-amber-400/40" style={{ fontFamily: 'system-ui' }}>₹</span>
                <Loader2 size={40} className="animate-spin text-slate-600" />
              </div>
            ) : isEditing ? (
              <div className="flex items-center gap-3">
                <span className="text-5xl font-bold text-amber-400" style={{ fontFamily: 'system-ui' }}>
                  ₹
                </span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleConfirm}
                  className="bg-transparent border-b-2 border-amber-500/60 text-5xl font-bold text-slate-100 outline-none w-64 tabular-nums tracking-tight caret-amber-400"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className="text-5xl font-bold text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                  style={{ fontFamily: 'system-ui' }}
                >
                  ₹
                </span>
                <span
                  className="text-5xl font-bold text-slate-100 tracking-tight"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatAmount(amount)}
                </span>
              </div>
            )}

            {/* Subtle edit hint */}
            {!isEditing && !loading && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  Click to edit
                </span>
              </div>
            )}
          </div>

          {/* Editing instructions */}
          {isEditing && (
            <p className="text-xs font-mono text-emerald-500/80 animate-pulse">
              Press Enter to confirm • Escape to cancel
            </p>
          )}

          {/* Quick amounts — fractions of the live balance */}
          {!isEditing && !loading && hasBalance && (
            <div className="flex items-center gap-2 mt-2">
              {PRESETS.map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  onClick={() => onAmountChange(Math.round(balance * fraction * 100) / 100)}
                  className="rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-mono text-slate-400 transition hover:border-amber-500/40 hover:text-amber-400 hover:bg-slate-800"
                  title={`₹${formatAmount(balance * fraction)}`}
                >
                  {fraction === 1 ? 'All' : `${fraction * 100}%`}
                </button>
              ))}
            </div>
          )}

          {/* Reset back to the untouched balance */}
          {!isEditing && !loading && edited && (
            <button
              type="button"
              onClick={() => onAmountChange(balance)}
              className="flex items-center gap-2 text-xs font-mono text-slate-500 transition hover:text-amber-400"
            >
              <RotateCcw size={12} />
              Reset to available balance (₹{formatAmount(balance)})
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-center px-2 text-xs font-mono text-slate-500">
        <span>Indian Rupees (INR)</span>
      </div>
    </div>
  )
}
