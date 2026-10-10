import { API_BASE_URL } from './mstockApi'

/**
 * Activity logging client.
 *
 * Events are queued and flushed in small batches so logging never blocks the
 * UI, and a failed flush is swallowed — the log must never be able to break the
 * app it is watching.
 *
 * NOTHING SECRET GOES IN HERE. No password, api key, access token or OTP, ever.
 * The backend also filters by allowlist, so this is the first of two gates.
 */

const FLUSH_DELAY = 1500
const MAX_BATCH = 50
// Cap on events held while nobody is signed in. Enough to carry the login page
// and the sign-in itself across to the first authenticated flush; past that,
// the oldest are dropped so a tab left on /login cannot grow without bound.
const MAX_PENDING = 200
// How long to wait before re-checking for a session, once there is nothing to
// attribute events to.
const PENDING_RETRY_DELAY = 5000

/**
 * The app session token, read from storage at flush time.
 *
 * `/api/log` is authenticated now — events are attributed to the signed-in user
 * rather than to a browser session id, because with more than one user a
 * session id alone cannot say who acted. This module is a singleton created
 * before React mounts, so it cannot use the auth context and reads the same
 * sessionStorage key AuthProvider writes.
 */
const APP_SESSION_KEY = 'mstock_session'
const readAppSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(APP_SESSION_KEY) ?? 'null')?.appSession ?? null
  } catch {
    return null
  }
}

// One id per browser tab, matching how the auth session is scoped.
const readSessionId = () => {
  try {
    const existing = sessionStorage.getItem('mstock_log_session')
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem('mstock_log_session', created)
    return created
  } catch {
    return 'no-storage'
  }
}

const sessionId = readSessionId()
let queue = []
let timer = null

const flush = async () => {
  timer = null
  if (!queue.length) return

  const session = readAppSession()
  if (!session) {
    // Nothing to attribute these to yet. Hold them — the sign-in itself is
    // worth keeping — and send them on the first flush after login. Without
    // this they would be posted unauthenticated, rejected, and lost.
    if (queue.length > MAX_PENDING) queue = queue.slice(-MAX_PENDING)
    // Check back slowly rather than every 1.5s: a tab parked on the login page
    // would otherwise spin a timer forever for nothing.
    schedule(PENDING_RETRY_DELAY)
    return
  }

  const batch = queue.slice(0, MAX_BATCH)
  queue = queue.slice(MAX_BATCH)
  try {
    await fetch(`${API_BASE_URL}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Session': session },
      body: JSON.stringify({ sessionId, events: batch }),
      keepalive: true,
    })
  } catch {
    // Backend down or offline — drop the batch rather than grow forever.
  }
  if (queue.length) schedule()
}

const schedule = (delay = FLUSH_DELAY) => {
  if (timer) return
  timer = setTimeout(flush, delay)
}

/**
 * Send what is queued right now.
 *
 * Needed before signing out: logout clears the session token this module reads,
 * so the 'logout' event itself would sit in the queue with nothing to
 * authenticate it. Call this first and it goes out while the session is still
 * valid.
 */
export const flushNow = () => {
  if (timer) { clearTimeout(timer); timer = null }
  return flush()
}

/**
 * Record one meaningful action.
 * @param {string} type    e.g. 'login.success', 'api.call', 'page.view'
 * @param {object} [fields] { target, outcome, durationMs, detail }
 */
export const logEvent = (type, fields = {}) => {
  queue.push({
    type,
    ts: new Date().toISOString(),
    target: fields.target,
    outcome: fields.outcome,
    durationMs: fields.durationMs,
    detail: fields.detail,
  })
  schedule()
}

// Don't lose the tail of a session when the tab closes.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush() })
}

export const currentLogSession = sessionId
