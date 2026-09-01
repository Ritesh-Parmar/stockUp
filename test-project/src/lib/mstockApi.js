export const API_BASE_URL = 'http://localhost:5000/api'

/**
 * POST to the local backend proxy and unwrap its { success, data } envelope.
 * Throws with the backend's own error text so callers can show it directly.
 */
export async function postApi(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
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
