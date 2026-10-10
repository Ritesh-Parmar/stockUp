import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/auth'
import { fetchRuns, sendHeartbeat, startAlgoOnServer, stopAlgoOnServer } from '../lib/accountApi'

/**
 * Which algorithms are running, according to the server.
 *
 * This used to be a local `useState(false)`, which meant the sidebar could say
 * "Running" while the backend had stopped everything (or the reverse after a
 * refresh). The server owns run state now; this hook mirrors it.
 *
 * It also sends the heartbeat. A run only lives while its browser session keeps
 * beating — miss roughly three beats and the backend's sweeper stops it. That
 * is the whole point of session-bound runs, so the beat belongs somewhere that
 * is mounted for as long as the dashboard is open, i.e. the layout.
 */

const HEARTBEAT_MS = 30000

export function useMachine() {
  const { authData } = useAuth()
  const session = authData?.appSession
  const [fetched, setFetched] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  // Signed out means nothing is running, derived rather than cleared in an
  // effect: a stale "Running" in the sidebar after logout would be a lie, and
  // deriving it cannot get out of step the way a cleanup can.
  //
  // Memoised because `[]` would be a new array every render, and stopAll and
  // runningAlgos both depend on it — without this they would be rebuilt on
  // every render and defeat their own memoisation.
  const runs = useMemo(() => (session ? fetched : []), [session, fetched])

  const apply = useCallback((active) => {
    setFetched(Array.isArray(active) ? active : [])
  }, [])

  // Initial read. setState happens in the promise callback, never in the effect
  // body — a synchronous setState in an effect is a lint error here, and for
  // good reason: it renders twice for nothing.
  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchRuns(session)
      .then((data) => { if (!cancelled) apply(data.active) })
      .catch(() => { if (!cancelled) apply([]) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [session, apply])

  // The beat. Its reply carries the current run list, so one call both keeps
  // the runs alive and tells us what is still running — including runs the
  // sweeper stopped while this tab sat idle.
  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    const beat = () => {
      sendHeartbeat(session)
        .then((data) => { if (!cancelled) apply(data.active) })
        .catch(() => {
          // A failed beat is not worth showing: either the backend is down, in
          // which case nothing is trading anyway, or the session has ended, and
          // the next guarded call will say so.
          if (!cancelled) apply([])
        })
    }
    const timer = setInterval(beat, HEARTBEAT_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session, apply])

  const start = useCallback(async (algoId) => {
    setError('')
    try {
      const data = await startAlgoOnServer(session, algoId)
      apply(data.active)
      return { ok: true }
    } catch (err) {
      setError(err.message)
      return { ok: false, message: err.message, code: err.code }
    }
  }, [session, apply])

  const stop = useCallback(async (algoId) => {
    setError('')
    try {
      const data = await stopAlgoOnServer(session, algoId)
      apply(data.active)
      return { ok: true }
    } catch (err) {
      setError(err.message)
      return { ok: false, message: err.message }
    }
  }, [session, apply])

  /** Stop everything this session is running — what the sidebar's button does. */
  const stopAll = useCallback(async () => {
    const results = await Promise.all(runs.map((run) => stop(run.algo_id)))
    return results.every((result) => result.ok)
  }, [runs, stop])

  const runningAlgos = useMemo(() => runs.map((run) => run.algo_id), [runs])

  return {
    runs,
    runningAlgos,
    isRunning: runs.length > 0,
    isRunningAlgo: (algoId) => runningAlgos.includes(algoId),
    loaded,
    error,
    startAlgo: start,
    stopAlgo: stop,
    stopAll,
  }
}
