import { API_BASE_URL } from './mstockApi'

/**
 * Account, access, purchase and run calls — everything that is about *this*
 * app rather than about the broker.
 *
 * These carry the APP session token (issued by our backend at login), not the
 * mStock access token. The two are deliberately separate: the broker token is a
 * credential for calling mStock, while the app session says who you are here.
 * It travels in a header so it never lands in a URL or an access log.
 *
 * Replaces the old billing client. There are no plans or bundles any more —
 * access is bought one algorithm at a time, each with its own expiry date.
 */

const call = async (path, { method = 'GET', session, body } = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { 'X-App-Session': session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { success: false, error: `Server returned ${response.status}` } }
  if (!response.ok || !payload.success) {
    // The backend's code (NOT_ENTITLED, ALREADY_RUNNING, NO_CREDENTIALS) is
    // what callers branch on; the message is what they show.
    const error = new Error(payload.error || 'Request failed')
    error.code = payload.code
    error.status = response.status
    throw error
  }
  return payload.data
}

/** The catalogue and its prices. Public — no session needed. */
export const fetchAlgorithms = () => call('/algorithms')

/**
 * The one read the signed-in app needs: who you are, every algorithm with its
 * validity date, what is running, and your payment history.
 */
export const fetchMe = (session) => call('/me', { session })

export const saveCapital = (session, capitalPaise) =>
  call('/me', { method: 'PATCH', session, body: { capital_paise: capitalPaise } })

// ── Buying one algorithm ───────────────────────────────────────────────────

export const startCheckout = (session, algoId) =>
  call('/purchase/checkout', { method: 'POST', session, body: { algo_id: algoId } })

/**
 * Confirm a mock payment. Stands in for the provider webhook while the backend
 * runs the mock provider; with a real provider the grant comes from the webhook
 * and this route refuses to run.
 */
export const confirmMockPurchase = (session, orderId) =>
  call('/purchase/mock-confirm', { method: 'POST', session, body: { order_id: orderId } })

/**
 * Hand Razorpay's checkout callback to the backend to be verified.
 *
 * The three fields are passed through untouched: the signature covers
 * `order_id|payment_id`, and the backend recomputes it with the key secret.
 * This call is a request to verify, not an assertion that the payment worked.
 */
export const verifyPurchase = (session, payload) =>
  call('/purchase/verify', {
    method: 'POST',
    session,
    body: {
      razorpay_order_id: payload.razorpay_order_id,
      razorpay_payment_id: payload.razorpay_payment_id,
      razorpay_signature: payload.razorpay_signature,
    },
  })

/** Record that checkout failed or was dismissed, so the order is not left open. */
export const reportPurchaseFailed = (session, orderId, reason) =>
  call('/purchase/failed', { method: 'POST', session, body: { order_id: orderId, reason } })

// ── Running ────────────────────────────────────────────────────────────────

export const fetchRuns = (session) => call('/runs', { session })

/**
 * The live engine snapshot: chart series, positions, trades, decisions and P&L
 * in ONE call, so every number on screen comes from the same instant.
 */
export const fetchLive = (session, bars = 60) => call(`/algo/live?bars=${bars}`, { session })

/** Server-side entitlement check. The UI's locked state is only a courtesy. */
export const startAlgoOnServer = (session, algoId) =>
  call('/algo/start', { method: 'POST', session, body: { algo_id: algoId } })

export const stopAlgoOnServer = (session, algoId) =>
  call('/algo/stop', { method: 'POST', session, body: { algo_id: algoId } })

/**
 * Tell the backend this browser is still open. A run only lives while its
 * session keeps beating — go quiet and the sweeper stops it.
 */
export const sendHeartbeat = (session) => call('/heartbeat', { method: 'POST', session })

export const endServerSession = (session) => call('/logout', { method: 'POST', session })

// ── Configuration ──────────────────────────────────────────────────────────

export const fetchConfig = (session, algoId) => call(`/algo/config/${algoId}`, { session })

export const saveConfigOnServer = (session, { algoId, label, params, sourceFile }) =>
  call('/algo/config', {
    method: 'POST',
    session,
    body: { algo_id: algoId, label, params, source_file: sourceFile },
  })

// ── Activity log ───────────────────────────────────────────────────────────

/**
 * The log is read through THIS client, not `getApi`, because the log routes are
 * authenticated and scoped to the caller.
 *
 * `getApi` sends a header called `X-Session-Token`, which is the mStock ACCESS
 * token used by the instrument routes — a different credential for a different
 * purpose. Reading the log with it produced a 401 on every request and an empty
 * page, since `requireUser` looks for `X-App-Session`.
 */
export const fetchLogDays = (session) => call('/log/days', { session })

export const fetchLogDay = (session, day) => call(`/log/day/${day}`, { session })

export const rupees = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
