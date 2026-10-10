import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Activity, AlertCircle, ArrowLeft, CalendarClock, FileSpreadsheet, Play, Settings, ShoppingCart, Square } from 'lucide-react'
import { ACCENT_CLASSES, RISK_CLASSES, findAlgorithm } from '../lib/algorithms'
import { logEvent } from '../lib/activityLog'
import { useAuth } from '../context/auth'
import { fetchConfig, fetchMe, rupees } from '../lib/accountApi'
import { displayDate, displayStamp, expiryTone } from '../lib/dates'

/**
 * AlgoDetailPage — /dashboard/choose-algo/:algoId
 *
 * Home for the two controls that used to sit in the sidebar. They live here
 * because both only make sense once an algorithm is chosen: Configure edits
 * *this* strategy's sheet, and Start Algo runs *this* strategy.
 *
 * Start and Stop both go through the server, which owns run state. The page
 * never decides on its own that something is running.
 */
export default function AlgoDetailPage() {
  const { algoId } = useParams()
  const navigate = useNavigate()
  const { isRunningAlgo, startAlgo, stopAlgo } = useOutletContext()
  const { authData } = useAuth()
  const session = authData?.appSession
  const [error, setError] = useState('')
  const [access, setAccess] = useState(null)
  const [config, setConfig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const algorithm = findAlgorithm(algoId)

  useEffect(() => {
    if (!session || !algorithm) return undefined
    let cancelled = false
    Promise.all([fetchMe(session), fetchConfig(session, algorithm.id)])
      .then(([me, saved]) => {
        if (cancelled) return
        setAccess((me.algos ?? []).find((algo) => algo.id === algorithm.id) ?? null)
        setConfig(saved)
      })
      .catch(() => { if (!cancelled) setAccess(null) })
    return () => { cancelled = true }
  }, [session, algorithm, reloadKey])

  // An unknown id in the URL goes back to the picker rather than rendering blank.
  if (!algorithm) return <Navigate to="/dashboard/choose-algo" replace />

  const accent = ACCENT_CLASSES[algorithm.accent]
  const running = isRunningAlgo(algorithm.id)
  const state = access ? expiryTone(access.daysLeft) : null

  // Entitlement is decided by the server, not by this page. The picker greys
  // out locked strategies, but someone can always navigate straight here.
  const handleStart = async () => {
    setError('')
    setBusy(true)
    const result = await startAlgo(algorithm.id)
    setBusy(false)
    logEvent('algo.start', {
      target: `/dashboard/choose-algo/${algorithm.id}`,
      outcome: result.ok ? 'ok' : 'error',
      detail: { operation: algorithm.name, ...(result.ok ? {} : { errorMessage: result.message, reason: result.code }) },
    })
    if (!result.ok) {
      setError(result.message || 'Could not start this algorithm.')
      return
    }
    // Starting is only interesting if you can then see it work.
    navigate('/dashboard/live')
  }

  const handleStop = async () => {
    setError('')
    setBusy(true)
    const result = await stopAlgo(algorithm.id)
    setBusy(false)
    logEvent('algo.stop', { target: `/dashboard/choose-algo/${algorithm.id}`, outcome: result.ok ? 'ok' : 'error', detail: { operation: algorithm.name } })
    if (!result.ok) setError(result.message || 'Could not stop this algorithm.')
  }

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full max-w-4xl">
        <Link to="/dashboard/choose-algo" className="inline-flex items-center gap-2 text-ink-3 hover:text-ink-2 text-sm font-mono transition-colors mb-6">
          <ArrowLeft size={14} />
          All algorithms
        </Link>

        {error && (
          <div className="flex items-center gap-3 mb-5 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm">
            <AlertCircle size={17} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <Link to="/dashboard/plans" className="shrink-0 text-xs font-mono underline hover:text-ink">Buy access</Link>
          </div>
        )}

        <div className={`rounded-2xl border ${accent.border} ${accent.bg} p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className={`text-2xl font-bold ${accent.text}`}>{algorithm.name}</h2>
              <p className="text-ink-2 text-sm mt-1">{algorithm.tagline}</p>
            </div>
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-widest ${running ? 'border-warn/40 bg-warn/5 text-warn' : 'border-edge-strong bg-raised/50 text-ink-2'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-warn animate-pulse' : 'bg-ink-3'}`} />
              {running ? 'Algo trading is Running' : 'Idle'}
            </span>
          </div>

          <p className="text-ink-2 text-sm leading-relaxed mt-4">{algorithm.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-edge-strong/60">
            {[['Style', algorithm.style], ['Timeframe', algorithm.timeframe]].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">{label}</p>
                <p className="text-sm text-ink mt-0.5">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">Risk</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${RISK_CLASSES[algorithm.risk]}`}>
                {algorithm.risk}
              </span>
            </div>
          </div>
        </div>

        {/* Access to this one algorithm, with its own expiry date. */}
        {access && (
          <div className={`mt-5 rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 ${state.ring}`}>
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className={`${state.tone} shrink-0`} />
              <div>
                <p className={`text-sm font-semibold ${state.tone}`}>
                  {access.valid ? `Active · ${state.label}` : access.owned ? 'Expired' : 'Not bought'}
                </p>
                <p className="text-ink-2 text-xs mt-0.5">
                  {access.valid
                    ? `Valid till ${displayDate(access.validTill)}`
                    : `${rupees(access.pricePaise)} for 30 days`}
                </p>
              </div>
            </div>
            {!access.valid && (
              <Link
                to="/dashboard/plans"
                className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-ink transition-colors"
              >
                <ShoppingCart size={15} />
                {access.owned ? 'Renew' : 'Buy'} {algorithm.name}
              </Link>
            )}
          </div>
        )}

        {/* What this algorithm would trade with, if anything has been saved. */}
        <div className="mt-5 rounded-2xl border border-edge-strong bg-panel p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={18} className="text-ink-2 shrink-0" />
            <div>
              <p className="text-ink font-semibold text-sm">
                {config ? config.sourceFile || config.label || 'Saved configuration' : 'No configuration saved'}
              </p>
              <p className="text-ink-3 text-xs mt-0.5">
                {config
                  ? `${config.params?.rowData?.length ?? 0} rows · saved ${displayStamp(config.updatedAt)}`
                  : 'Upload a sheet in Configure. Starting without one runs on defaults.'}
              </p>
            </div>
          </div>
        </div>

        {running && (
          <Link
            to="/dashboard/live"
            className="mt-5 flex items-center gap-4 rounded-2xl border border-good/50 bg-good/10 p-5 transition-all duration-200 hover:border-good hover:bg-good/20"
          >
            <div className="w-11 h-11 rounded-xl bg-good/15 flex items-center justify-center shrink-0">
              <Activity size={19} className="text-good animate-pulse" />
            </div>
            <div>
              <p className="text-good font-semibold text-sm">Watch it trade</p>
              <p className="text-ink-3 text-xs mt-0.5">Live chart, positions and every decision it makes</p>
            </div>
          </Link>
        )}

        {/* The two controls that moved out of the sidebar. */}
        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          <button
            onClick={() => navigate(`/dashboard/choose-algo/${algorithm.id}/configure`)}
            className="flex items-center gap-4 rounded-2xl border border-edge-strong bg-panel p-5 text-left transition-all duration-200 hover:border-edge-hover hover:bg-raised/70"
          >
            <div className="w-11 h-11 rounded-xl bg-raised flex items-center justify-center shrink-0">
              <Settings size={19} className="text-ink" />
            </div>
            <div>
              <p className="text-ink font-semibold text-sm">Configure</p>
              <p className="text-ink-3 text-xs mt-0.5">Upload and edit this strategy&apos;s sheet</p>
            </div>
          </button>

          {running ? (
            <button
              onClick={handleStop}
              disabled={busy}
              className="flex items-center gap-4 rounded-2xl border border-bad/50 bg-bad/10 p-5 text-left transition-all duration-200 hover:border-bad hover:bg-bad/20 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-bad/15 flex items-center justify-center shrink-0">
                <Square size={17} className="text-bad" />
              </div>
              <div>
                <p className="text-bad font-semibold text-sm">{busy ? 'Stopping…' : 'Stop Algo'}</p>
                <p className="text-ink-3 text-xs mt-0.5">Halt trading and place no new orders</p>
              </div>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={busy}
              className="flex items-center gap-4 rounded-2xl border border-good/50 bg-good/10 p-5 text-left transition-all duration-200 hover:border-good hover:bg-good/20 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-good/15 flex items-center justify-center shrink-0">
                <Play size={19} className="text-good" />
              </div>
              <div>
                <p className="text-good font-semibold text-sm">{busy ? 'Starting…' : 'Start Algo'}</p>
                <p className="text-ink-3 text-xs mt-0.5">Run {algorithm.name} and watch it trade live</p>
              </div>
            </button>
          )}
        </div>

        <p className="text-ink-3 text-xs font-mono mt-5">
          {algorithm.name} runs only while this tab stays open. Closing it, signing out or restarting the backend stops it.
          {!access && ' · '}
          {!access && (
            <button onClick={() => setReloadKey((key) => key + 1)} className="underline hover:text-ink-2">
              Reload access
            </button>
          )}
        </p>
      </div>
    </div>
  )
}
