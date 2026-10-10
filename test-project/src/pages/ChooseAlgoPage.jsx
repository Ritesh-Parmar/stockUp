import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Activity, ChevronRight, ListChecks, Lock } from 'lucide-react'
import { ACCENT_CLASSES, ALGORITHMS, RISK_CLASSES } from '../lib/algorithms'
import { useAuth } from '../context/auth'
import { fetchMe, rupees } from '../lib/accountApi'
import { displayDate, expiryTone } from '../lib/dates'

/**
 * ChooseAlgoPage — /dashboard/choose-algo
 *
 * The strategy picker the sidebar's "Choose Algo" button leads to. Configure and
 * Start Algo used to sit in the sidebar with nothing to act on; they now live on
 * the selected algorithm's page, one level down, so they always refer to
 * something specific.
 *
 * Each card shows its own validity date, because access is per algorithm — one
 * can be active while the next expired last week.
 */
export default function ChooseAlgoPage() {
  const { isRunningAlgo } = useOutletContext()
  const { authData } = useAuth()
  const session = authData?.appSession
  // null while loading, so cards are not flashed as locked before the answer.
  const [access, setAccess] = useState(null)

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchMe(session)
      .then((me) => {
        if (cancelled) return
        // Keyed by id so each card is a plain lookup rather than a scan.
        setAccess(Object.fromEntries((me.algos ?? []).map((algo) => [algo.id, algo])))
      })
      .catch(() => { if (!cancelled) setAccess({}) })
    return () => { cancelled = true }
  }, [session])

  const anyRunning = ALGORITHMS.some((algorithm) => isRunningAlgo(algorithm.id))

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-ink flex items-center gap-3">
              <ListChecks size={24} className="text-good" />
              Choose an Algo
            </h2>
            <p className="text-ink-2 text-sm mt-1">
              Pick a strategy to configure and run. Each one trades differently — check the style and risk before starting.
            </p>
          </div>
          {anyRunning && (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-warn/40 bg-warn/5 text-warn text-xs font-mono uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
              Algo trading is Running
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ALGORITHMS.map((algorithm) => {
            const accent = ACCENT_CLASSES[algorithm.accent]
            const entry = access?.[algorithm.id]
            // Unknown access (still loading) is treated as open: the server
            // refuses an unentitled start anyway, so an optimistic card cannot
            // actually let anyone trade something they have not bought.
            const open = access === null || Boolean(entry?.valid)
            const running = isRunningAlgo(algorithm.id)
            const state = entry ? expiryTone(entry.daysLeft) : null

            return (
              <Link
                key={algorithm.id}
                to={open ? `/dashboard/choose-algo/${algorithm.id}` : '/dashboard/plans'}
                className={`group flex flex-col rounded-2xl border p-5 transition-all duration-200 ${
                  open ? `${accent.border} ${accent.bg} ${accent.hover}` : 'border-edge bg-panel/40 hover:border-edge-hover'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-lg font-bold ${open ? accent.text : 'text-ink-3'}`}>{algorithm.name}</p>
                    <p className={`text-sm mt-0.5 ${open ? 'text-ink-2' : 'text-ink-3'}`}>{algorithm.tagline}</p>
                  </div>
                  {open
                    ? <ChevronRight size={18} className="text-ink-3 group-hover:text-ink-2 transition-colors shrink-0 mt-1" />
                    : <Lock size={15} className="text-ink-3 shrink-0 mt-1" />}
                </div>

                <p className={`text-xs leading-relaxed mt-3 flex-1 ${open ? 'text-ink-2' : 'text-ink-3'}`}>{algorithm.description}</p>

                {/* Access line: the one fact that differs per algorithm. */}
                {entry && (
                  <p className={`text-[10px] font-mono mt-3 ${state.tone}`}>
                    {entry.valid
                      ? `Valid till ${displayDate(entry.validTill)} · ${state.label}`
                      : entry.owned
                        ? `Expired ${displayDate(entry.validTill)} — tap to renew for ${rupees(entry.pricePaise)}`
                        : `Not bought — tap to buy for ${rupees(entry.pricePaise)} / 30 days`}
                  </p>
                )}

                {running && (
                  <p className="text-[10px] font-mono text-warn mt-1.5 flex items-center gap-1.5">
                    <Activity size={11} className="animate-pulse" />
                    Running now
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <span className="px-2 py-0.5 rounded-full border border-edge-strong bg-panel/60 text-[10px] font-mono text-ink-2">
                    {algorithm.style}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${RISK_CLASSES[algorithm.risk]}`}>
                    {algorithm.risk} risk
                  </span>
                </div>
                <p className="text-[10px] font-mono text-ink-3 mt-2">{algorithm.timeframe}</p>
              </Link>
            )
          })}
        </div>

        <p className="text-ink-3 text-xs font-mono mt-6">
          Each algorithm is bought on its own and stays valid for 30 days. An algorithm only runs while this browser tab is open.
        </p>
      </div>
    </div>
  )
}
