import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../lib/mstockApi'
import { useAuth } from '../context/auth'
import { FALLBACK_QUOTES } from './fallbackQuotes'

const REFRESH_MS = 30000

const price = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SOURCE_LABEL = {
  mstock: { text: 'LIVE', title: 'Real-time prices from your mStock session', className: 'border-good/40 bg-good/10 text-good' },
  yahoo: { text: 'DELAYED', title: 'Yahoo Finance — typically ~15 minutes delayed. Sign in for real-time mStock prices.', className: 'border-warn/40 bg-warn/10 text-warn' },
  demo: { text: 'DEMO', title: 'Demo account. These are real NSE prices from Yahoo Finance (~15 min delayed) — only your account data is simulated.', className: 'border-info/40 bg-info/10 text-info' },
  stale: { text: 'STALE', title: 'The last refresh failed — these are the previous prices. Check the backend log for [ticker] lines.', className: 'border-bad/40 bg-bad/10 text-bad' },
  sample: { text: 'SAMPLE', title: 'Placeholder prices — the market feed could not be reached', className: 'border-edge-strong/40 bg-page0/10 text-ink-2' },
}

function Quote({ quote }) {
  const up = quote.change > 0
  const down = quote.change < 0
  const tone = up ? 'text-good' : down ? 'text-bad' : 'text-ink-3'
  return (
    <span className="inline-flex items-baseline gap-1.5 px-4 whitespace-nowrap">
      <span className="font-semibold text-ink-2">{quote.symbol}</span>
      <span className="text-ink-2 tabular-nums">{price.format(quote.last)}</span>
      <span className={`${tone} tabular-nums`}>
        {up ? '▲' : down ? '▼' : '•'} {price.format(Math.abs(quote.change))} ({quote.changePercent > 0 ? '+' : ''}{price.format(quote.changePercent)}%)
      </span>
    </span>
  )
}

/**
 * MarketTicker — the scrolling quote strip in the top bar.
 *
 * Polls whether or not you are signed in: the backend serves real-time mStock
 * prices when it has a session and delayed Yahoo prices when it does not, so
 * the bar shows genuine market data either way. The badge says which, because
 * delayed prices dressed up as live would be worse than no prices at all.
 *
 * Polling deliberately does NOT go through postApi — every 30 seconds would
 * otherwise bury the activity log in ticker noise.
 */
export default function MarketTicker() {
  const { authData } = useAuth()
  const [feed, setFeed] = useState(null)
  const [status, setStatus] = useState(null)

  const accessToken = authData?.accessToken
  const apiKey = authData?.apiKey

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`${API_BASE_URL}/market-ticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sent when present; the backend treats them as optional.
        body: JSON.stringify({ access_token: accessToken, api_key: apiKey }),
      })
        .then(async (response) => ({ status: response.status, payload: await response.json().catch(() => null) }))
        .then(({ status, payload }) => {
          if (cancelled) return
          if (!payload?.success) {
            // Quiet in the UI, loud in the console — the backend log carries the
            // per-symbol detail, this mirrors it for whoever has devtools open.
            const reason = payload?.error || `HTTP ${status}`
            console.error('[ticker] refresh failed:', reason, payload?.failures ?? '')
            setStatus({ ok: false, reason, at: Date.now() })
            return
          }
          const quotes = payload.data?.quotes ?? []
          if (!quotes.length) {
            console.warn('[ticker] refresh returned no quotes', payload.data?.failures ?? '')
            setStatus({ ok: false, reason: 'no quotes returned', at: Date.now() })
            return
          }
          // Partial failures still render — say so rather than hiding it.
          if (payload.data.failures?.length) {
            console.warn('[ticker] partial refresh:', payload.data.failures)
          }
          setFeed({ quotes, source: payload.data.source, fetchedAt: payload.data.fetchedAt })
          setStatus({ ok: true, at: Date.now() })
        })
        .catch((error) => {
          if (cancelled) return
          console.error('[ticker] refresh failed:', error.message, '— is the backend running?')
          setStatus({ ok: false, reason: error.message, at: Date.now() })
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [accessToken, apiKey])

  const quotes = feed?.quotes ?? FALLBACK_QUOTES
  // A failed refresh keeps the last good prices on screen but stops calling them
  // current — the badge flips to STALE and carries the reason in its tooltip.
  const stale = Boolean(status && !status.ok && feed)
  const base = stale ? SOURCE_LABEL.stale : (SOURCE_LABEL[feed?.source] ?? SOURCE_LABEL.sample)
  const badge = stale ? { ...base, title: `${base.title}\n\nLast error: ${status.reason}` } : base
  if (!quotes.length) return null

  return (
    <div className="ticker-viewport flex-1 flex items-center gap-3 overflow-hidden" aria-label="Market prices">
      <span
        title={badge.title}
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-widest ${badge.className}`}
      >
        {badge.text}
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="ticker-track text-xs font-mono">
          {/* Rendered twice so the loop is seamless — the animation shifts by
              exactly half the track width. */}
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex shrink-0" aria-hidden={copy === 1}>
              {quotes.map((item) => <Quote key={`${copy}-${item.symbol}`} quote={item} />)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
