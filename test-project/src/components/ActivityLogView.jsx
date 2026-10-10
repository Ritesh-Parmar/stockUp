import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Loader2, ShieldCheck } from 'lucide-react'

const OUTCOME_CLASS = (outcome) => {
  if (outcome === 'error') return 'text-bad'
  if (outcome === 'ok') return 'text-good'
  return 'text-ink-2'
}

const TYPE_CLASS = (type) => {
  if (type.startsWith('login.success')) return 'text-good'
  if (type.startsWith('login.fail')) return 'text-bad'
  if (type === 'logout') return 'text-warn'
  if (type.startsWith('page.')) return 'text-ink-2'
  return 'text-brand'
}

const timeOf = (ts) => String(ts).slice(11, 19)

/** Group a day's events into the sessions they belong to, in first-seen order. */
const groupBySession = (events) => {
  const sessions = new Map()
  for (const event of events) {
    if (!sessions.has(event.session_id)) sessions.set(event.session_id, [])
    sessions.get(event.session_id).push(event)
  }
  return [...sessions.entries()]
}

/**
 * ActivityLogView — read the local activity log, one day at a time.
 * Shared by the real page and the preview so both stay identical.
 */
export default function ActivityLogView({ days = [], events = [], selectedDay = '', loading = false, error = '', onSelectDay }) {
  const [onlyErrors, setOnlyErrors] = useState(false)

  const sessions = useMemo(() => {
    const filtered = onlyErrors ? events.filter((event) => event.outcome === 'error') : events
    return groupBySession(filtered)
  }, [events, onlyErrors])

  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-ink">Activity Log</h2>
      <p className="text-ink-2 text-sm mt-1">
        Everything this app did, by day and by session. Stored only on this computer.
      </p>
    </div>

    <div className="flex items-center gap-2 rounded-xl border border-good/25 bg-good/5 px-4 py-2.5 text-xs text-good">
      <ShieldCheck size={15} className="shrink-0" />
      Passwords, API keys, access tokens and OTPs are never recorded.
    </div>

    {error && <div className="flex gap-3 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(220px,0.6fr)_minmax(0,2.4fr)]">
      {/* Day picker */}
      <section className="bg-panel border border-edge-strong rounded-2xl p-4 h-fit">
        <div className="flex items-center gap-2 mb-3 text-ink-2">
          <CalendarDays size={15} className="text-brand" />
          <p className="text-sm font-semibold">Days</p>
        </div>
        {!days.length ? (
          <p className="text-ink-3 text-sm">Nothing logged yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {days.map((day) => (
              <button
                key={day.day}
                onClick={() => onSelectDay?.(day.day)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${selectedDay === day.day ? 'border-brand/60 bg-brand/10' : 'border-edge-strong bg-raised/50 hover:border-edge-hover'}`}
              >
                <p className="text-sm font-semibold text-ink">{day.day}</p>
                <p className="text-[11px] font-mono text-ink-3">
                  {day.events} events · {day.sessions} session{day.sessions === 1 ? '' : 's'} · {day.logins} login{day.logins === 1 ? '' : 's'}
                  {day.errors > 0 && <span className="text-bad"> · {day.errors} error{day.errors === 1 ? '' : 's'}</span>}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="bg-panel border border-edge-strong rounded-2xl p-5 min-h-80 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-xs font-mono uppercase tracking-widest text-ink-3">
            {selectedDay ? `${selectedDay} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'Pick a day'}
          </p>
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input type="checkbox" checked={onlyErrors} onChange={(event) => setOnlyErrors(event.target.checked)} className="accent-rose-500" />
            Errors only
          </label>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-ink-3 text-sm"><Loader2 size={15} className="animate-spin" />Loading…</div>
        ) : !selectedDay ? (
          <p className="text-ink-3 text-sm">Choose a day on the left to see what happened.</p>
        ) : !sessions.length ? (
          <p className="text-ink-3 text-sm">{onlyErrors ? 'No errors that day.' : 'No activity recorded for that day.'}</p>
        ) : (
          <div className="space-y-5">
            {sessions.map(([sessionId, sessionEvents], index) => (
              <div key={sessionId}>
                <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-2">
                  Session {index + 1} · {timeOf(sessionEvents[0].ts)}–{timeOf(sessionEvents[sessionEvents.length - 1].ts)} · {sessionEvents.length} events
                </p>
                <div className="table-scroll overflow-x-auto rounded-lg border border-edge">
                  <table className="w-full min-w-[640px] text-xs">
                    <tbody>
                      {sessionEvents.map((event) => (
                        <tr key={event.id} className="border-b border-edge/70 last:border-0">
                          <td className="px-3 py-2 font-mono text-ink-3 whitespace-nowrap w-20">{timeOf(event.ts)}</td>
                          <td className={`px-3 py-2 font-medium whitespace-nowrap ${TYPE_CLASS(event.type)}`}>{event.type}</td>
                          <td className="px-3 py-2 text-ink-2 truncate max-w-[220px]" title={event.target}>{event.target || '—'}</td>
                          <td className={`px-3 py-2 font-medium ${OUTCOME_CLASS(event.outcome)}`}>{event.outcome || ''}</td>
                          <td className="px-3 py-2 text-ink-3 font-mono whitespace-nowrap">{event.duration_ms == null ? '' : `${event.duration_ms} ms`}</td>
                          <td className="px-3 py-2 text-ink-3 truncate max-w-[260px]" title={event.detail || ''}>{event.detail || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  </div>
}
