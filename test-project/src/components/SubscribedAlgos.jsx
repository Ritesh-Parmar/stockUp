import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Lock, Sparkles } from 'lucide-react'
import { useAuth } from '../context/auth'
import { fetchMe } from '../lib/accountApi'
import { displayDate, expiryTone } from '../lib/dates'
import { ACCENT_CLASSES, findAlgorithm } from '../lib/algorithms'

/**
 * SubscribedAlgos — the strip at the top of the dashboard showing which
 * strategies the signed-in user can run, and for how much longer.
 *
 * One expiry per algorithm, not one shared plan expiry: each is bought on its
 * own and runs out on its own date. `daysLeft` and `valid` come from the server
 * so the browser clock cannot disagree with the entitlement the server enforces
 * — and so this component never reads the clock during render.
 */
export default function SubscribedAlgos() {
  const { authData } = useAuth()
  const session = authData?.appSession
  const [algos, setAlgos] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchMe(session)
      .then((data) => { if (!cancelled) setAlgos(data.algos ?? []) })
      .catch(() => { if (!cancelled) setAlgos([]) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [session])

  // Say nothing until the answer is known, rather than flashing "none".
  if (!loaded) return null

  const active = algos.filter((algo) => algo.valid)

  if (!active.length) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge-strong bg-panel p-5">
        <div className="flex items-center gap-3">
          <Lock size={18} className="text-ink-3 shrink-0" />
          <div>
            <p className="text-ink font-semibold text-sm">No algorithms active</p>
            <p className="text-ink-3 text-xs mt-0.5">
              Buy an algorithm to unlock it for 30 days. Each one is bought separately.
            </p>
          </div>
        </div>
        <Link to="/dashboard/plans" className="rounded-xl bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-ink transition-colors">
          Browse algorithms
        </Link>
      </div>
    )
  }

  // The strip's colour follows whichever algorithm expires soonest — that is
  // the one the user needs to know about.
  const soonest = active.reduce((a, b) => (a.daysLeft <= b.daysLeft ? a : b))
  const overall = expiryTone(soonest.daysLeft)

  return (
    <div className={`mb-6 rounded-2xl border p-5 ${overall.ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className={`${overall.tone} shrink-0`} />
          <div>
            <p className="text-ink font-semibold text-sm">Your algorithms</p>
            <p className="text-ink-2 text-xs mt-0.5">
              {active.length} active · each with its own expiry
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className={`text-sm font-semibold ${overall.tone}`}>
            {findAlgorithm(soonest.id)?.name ?? soonest.id} · {overall.label}
          </p>
          <p className="text-ink-2 text-xs mt-0.5 flex items-center gap-1.5 justify-end">
            <CalendarClock size={12} />
            Next to expire {displayDate(soonest.validTill)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {active.map((algo) => {
          const algorithm = findAlgorithm(algo.id)
          const accent = ACCENT_CLASSES[algorithm?.accent] ?? ACCENT_CLASSES.emerald
          const state = expiryTone(algo.daysLeft)
          return (
            <Link
              key={algo.id}
              to={`/dashboard/choose-algo/${algo.id}`}
              className={`group flex flex-col gap-0.5 rounded-xl border px-3 py-2 transition-all duration-200 ${accent.border} ${accent.bg} ${accent.hover}`}
            >
              <span className="flex items-baseline gap-2">
                <span className={`text-sm font-semibold ${accent.text}`}>{algorithm?.name ?? algo.id}</span>
                <span className="text-[10px] font-mono text-ink-3">{algorithm?.style ?? algo.style}</span>
              </span>
              <span className={`text-[10px] font-mono ${state.tone}`}>
                till {displayDate(algo.validTill)} · {state.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
