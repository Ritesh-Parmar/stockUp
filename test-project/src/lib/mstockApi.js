/**
 * The backend, pinned to IPv4.
 *
 * Deliberately NOT `localhost`. On Windows `localhost` resolves to `::1` first,
 * and the backend binds to `127.0.0.1` only (loopback-only is a security
 * choice, see server.js). A browser that tries `::1` and does not fall back
 * gets a connection failure on every call, which looks exactly like the backend
 * being down. Using the literal IPv4 address removes the ambiguity.
 */
export const API_BASE_URL = 'http://127.0.0.1:5000/api'

/**
 * POST to the local backend proxy and unwrap its { success, data } envelope.
 * Throws with the backend's own error text so callers can show it directly.
 *
 * Every backend call in the app funnels through here, which makes it the one
 * place worth instrumenting: endpoint, duration and outcome get logged for
 * free, including for endpoints added later. Only `path` is recorded — the
 * body carries credentials and is never touched.
 */
export async function postApi(path, body) {
  const startedAt = performance.now()
  const finish = async (outcome, extra) => {
    const { logEvent } = await import('./activityLog')
    logEvent('api.call', {
      target: path,
      outcome,
      durationMs: performance.now() - startedAt,
      detail: { endpoint: path, ...extra },
    })
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    finish('error', { errorMessage: 'network unreachable' })
    throw error
  }

  const payload = await readEnvelope(response)
  if (!response.ok || !payload.success) {
    const message = payload.error || 'Request failed'
    finish('error', { status: response.status, errorMessage: message })
    throw new Error(message)
  }
  finish('ok', { status: response.status })
  return payload
}

/**
 * Read the { success, data } envelope, tolerating a body that isn't JSON.
 * Express serves its default error page as HTML, and calling response.json()
 * on that throws "Unexpected token '<'" — which hides the real failure behind a
 * parser error. Surface the status instead.
 */
async function readEnvelope(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, error: `Server returned ${response.status} ${response.statusText || ''}`.trim() }
  }
}

/**
 * GET a JSON endpoint on the backend, same envelope, same tolerance.
 * `token` goes in a header, never the URL, so a real access token cannot leak
 * into an access log. The backend uses it only to recognise a demo session.
 */
export async function getApi(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { 'X-Session-Token': token } : undefined,
  })
  const payload = await readEnvelope(response)
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Request failed')
  return payload
}

/**
 * Pull AVAILABLE_BALANCE out of a fund-summary response.
 * Every value in that payload arrives as a string, so it needs coercing.
 * Returns null when the field is absent rather than a misleading 0.
 */
export const availableBalance = (funds) => {
  const value = funds?.data?.[0]?.AVAILABLE_BALANCE
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
