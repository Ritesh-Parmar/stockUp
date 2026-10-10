import { useEffect, useState } from 'react'
import ActivityLogView from '../components/ActivityLogView'
import { useAuth } from '../context/auth'
import { fetchLogDay, fetchLogDays } from '../lib/accountApi'

/**
 * ActivityLogPage — /dashboard/activity
 *
 * Reads the local SQLite activity log through the backend, one day at a time.
 *
 * Scoped to the signed-in user: the backend filters by `user_id` and this page
 * only ever shows what comes back, so one account cannot see another's
 * activity. The session token is what makes that work, which is why this uses
 * the authenticated client rather than `getApi` — `getApi` sends the mStock
 * access token under a different header name, and every request 401'd.
 */
export default function ActivityLogPage() {
  const { authData } = useAuth()
  const session = authData?.appSession
  const [days, setDays] = useState([])
  const [selectedDay, setSelectedDay] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchLogDays(session)
      .then((data) => {
        if (cancelled) return
        setDays(data)
        // Open on the most recent day — usually what you want to see.
        if (data.length) setSelectedDay(data[0].day)
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not read the activity log.') })
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (!selectedDay || !session) return undefined
    let cancelled = false
    fetchLogDay(session, selectedDay)
      .then((data) => { if (!cancelled) setEvents(data) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load that day.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [session, selectedDay])

  // Setting the spinner belongs with the click, not the effect — the effect
  // would be running setState synchronously on every render pass.
  const handleSelectDay = (day) => {
    setLoading(true)
    setError('')
    setEvents([])
    setSelectedDay(day)
  }

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full">
        <ActivityLogView
          days={days}
          events={events}
          selectedDay={selectedDay}
          loading={loading}
          error={error}
          onSelectDay={handleSelectDay}
        />
        <p className="text-ink-3 text-xs font-mono mt-4">
          This log shows your own activity only. Every entry is filtered by account on the server.
        </p>
      </div>
    </div>
  )
}
