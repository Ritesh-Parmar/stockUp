/**
 * Dates for display.
 *
 * The backend stores and compares dates as ISO `YYYY-MM-DD`, because that is
 * what sorts and indexes correctly in SQL. Showing them as DD-MM-YYYY is purely
 * a front-end concern, which is why the conversion lives here and nowhere else.
 *
 * `'000000'` is the backend's sentinel for an algorithm that was never bought.
 */

export const NOT_OWNED = '000000'

/**
 * `2026-11-18` → `18-11-2026`.
 *
 * Parsed by splitting the string, NOT with `new Date()`. `new Date('2026-11-18')`
 * is read as midnight UTC, which in IST is 05:30 the same day — harmless here,
 * but the same habit is what shifted every candle by 30 minutes elsewhere in
 * this app. Read the fields literally and there is nothing to get wrong.
 */
export const displayDate = (value) => {
  if (!value || value === NOT_OWNED) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!match) return '—'
  const [, year, month, day] = match
  return `${day}-${month}-${year}`
}

/** `2026-10-08T18:59:51+05:30` → `08-10-2026, 18:59`. */
export const displayStamp = (value) => {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value))
  if (!match) return displayDate(value)
  const [, year, month, day, hour, minute] = match
  return `${day}-${month}-${year}, ${hour}:${minute}`
}

/**
 * How "soon" an expiry is, for colouring. `daysLeft` comes from the server so
 * the browser clock cannot disagree with the entitlement the server enforces.
 */
export const expiryTone = (daysLeft) => {
  if (daysLeft === null || daysLeft === undefined) return { tone: 'text-slate-500', ring: 'border-slate-700 bg-slate-900', label: 'Not bought' }
  if (daysLeft < 0) return { tone: 'text-rose-400', ring: 'border-rose-500/40 bg-rose-500/5', label: 'Expired' }
  if (daysLeft === 0) return { tone: 'text-rose-400', ring: 'border-rose-500/40 bg-rose-500/5', label: 'Expires today' }
  if (daysLeft <= 7) return { tone: 'text-amber-400', ring: 'border-amber-500/40 bg-amber-500/5', label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` }
  return { tone: 'text-emerald-400', ring: 'border-emerald-500/30 bg-emerald-500/5', label: `${daysLeft} days left` }
}
