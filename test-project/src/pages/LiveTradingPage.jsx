import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BookOpen,
  CircleDot, Gauge, Radio, Square, TrendingUp, Wallet,
} from 'lucide-react'
import { useAuth } from '../context/auth'
import { fetchLive, stopAlgoOnServer } from '../lib/accountApi'
import { displayStamp } from '../lib/dates'
import PriceChart from '../components/PriceChart'
import InfoButton from '../components/InfoButton'

/**
 * LiveTradingPage — /dashboard/live
 *
 * What the algorithm is doing, right now. Polls one endpoint every two seconds
 * (matching the engine's bar interval) so every figure on screen comes from the
 * same instant — a chart from one request beside a P&L from another can
 * disagree by a bar, and that reads as a bug.
 *
 * On refetch the previous render is held rather than replaced by a skeleton, so
 * there is no flash and no layout jump.
 */

const POLL_MS = 2000

const rupees = (paise) => {
  const value = paise / 100
  const sign = value < 0 ? '−' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const plainRupees = (value) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const pnlColour = (paise) => (paise > 0 ? 'text-good' : paise < 0 ? 'text-bad' : 'text-ink-2')

const FEED_BADGE = {
  LIVE: { tone: 'border-good/40 bg-good/5 text-good', label: 'LIVE PRICES' },
  SIMULATED: { tone: 'border-warn/40 bg-warn/5 text-warn', label: 'SIMULATED' },
}

const SESSION_TEXT = {
  open: 'Market open · 09:15–15:30 IST',
  weekend: 'Weekend — NSE is shut',
  pre_open: 'Before 09:15 IST',
  closed_for_day: 'After 15:30 IST',
}

export default function LiveTradingPage() {
  const { authData } = useAuth()
  const session = authData?.appSession
  const [live, setLive] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false

    const poll = () => {
      setRefreshing(true)
      fetchLive(session)
        // `live` is only ever REPLACED by a good response and never cleared on
        // failure, so a dropped poll holds the previous render instead of
        // blanking a working screen. That is also why there is no ref here:
        // state that is never cleared does the same job and stays readable
        // during render.
        .then((data) => {
          if (cancelled) return
          setLive(data)
          setError('')
        })
        .catch((err) => { if (!cancelled) setError(err.message) })
        .finally(() => {
          if (cancelled) return
          setRefreshing(false)
          setLoaded(true)
        })
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session])

  const stop = async () => {
    setStopping(true)
    await stopAlgoOnServer(session, 'arjuna').catch(() => {})
    setStopping(false)
  }

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-page">
        <p className="text-ink-3 text-sm font-mono">Loading the engine…</p>
      </div>
    )
  }

  const data = live

  if (!data?.running) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-page p-8">
        <div className="max-w-md text-center">
          <CircleDot size={32} className="mx-auto text-ink-3" />
          <h2 className="text-ink font-semibold mt-4">Nothing is running</h2>
          <p className="text-ink-2 text-sm mt-2">{data?.reason ?? 'Start Arjuna to watch it trade.'}</p>
          <Link
            to="/dashboard/choose-algo/arjuna"
            className="inline-block mt-5 rounded-xl bg-good hover:bg-good/90 px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors"
          >
            Go to Arjuna
          </Link>
        </div>
      </div>
    )
  }

  const { run, feed, strategy, symbols, decisions, trades, summary, capital } = data
  const badge = FEED_BADGE[feed.mode] ?? FEED_BADGE.SIMULATED
  const shown = focus && symbols.find((s) => s.symbol === focus) ? focus : symbols[0]?.symbol
  const chart = symbols.find((s) => s.symbol === shown)

  return (
    <div
      className="flex h-full w-full flex-col overflow-y-auto bg-page p-6 gap-5"
      // Held at slightly reduced opacity while refetching: no skeleton flash,
      // no layout jump, but the screen admits it is working.
      style={{ opacity: refreshing && error ? 0.6 : 1, transition: 'opacity 150ms' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center gap-3">
            <Activity size={24} className="text-good" />
            Arjuna is trading
          </h2>
          <p className="text-ink-2 text-sm mt-1">
            Moving-average crossover on {symbols.length} NSE stocks · bar {run.bars} ·
            started {displayStamp(run.startedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Two small chips stay visible. The full explanation moved behind
              the "i", but "nothing here is a real order" is not something a
              viewer should have to click to discover, so it keeps a marker. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-edge-strong bg-raised/60 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-ink-2">
            PAPER
          </span>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest ${badge.tone}`}>
            <Radio size={11} className={feed.mode === 'LIVE' ? 'animate-pulse' : undefined} />
            {badge.label}
          </span>

          <InfoButton title="How this screen works" label="How this screen works">
            <p>
              <strong className="text-ink">No real orders are placed.</strong> Every trade here is on
              paper — nothing is sent to mStock, no money moves and no shares change hands.
            </p>
            <p>
              <strong className="text-ink">Prices</strong> are seeded with{' '}
              <strong className="text-ink">{feed.realBars} real 5-minute candles</strong> from the
              exchange, then {feed.mode === 'LIVE'
                ? 'track live prices as they arrive.'
                : `simulated from the last real close — ${SESSION_TEXT[feed.session.reason] ?? 'market closed'}.`}
            </p>
            <p className="text-ink-2">
              Source: {feed.source}. One bar = {strategy.barRepresentsMinutes} minutes of market time,
              replayed every {strategy.barSeconds}s, so a trading day plays out in a few minutes.
            </p>
            <p className="text-ink-2">
              Profit and loss is gross: brokerage and slippage are not modelled, because an invented
              figure would look like a real cost model while being fiction.
            </p>
          </InfoButton>
          <button
            onClick={stop}
            disabled={stopping}
            className="inline-flex items-center gap-2 rounded-xl border border-bad/50 bg-bad/10 hover:bg-bad/20 px-4 py-2 text-sm font-semibold text-bad transition-colors disabled:opacity-50"
          >
            <Square size={14} />
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      </div>

      {run.lastError && (
        <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3.5 text-xs text-warn">
          <AlertCircle size={15} className="shrink-0" />
          <span>Last bar had a problem: {run.lastError}. The engine keeps going and will retry.</span>
        </div>
      )}

      {/* ── Stat tiles. The numbers ARE the chart for these. ───────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<TrendingUp size={15} />}
          label="Total profit / loss"
          value={rupees(summary.totalPnlPaise)}
          valueClass={pnlColour(summary.totalPnlPaise)}
          foot={`${rupees(summary.realisedPaise)} booked · ${rupees(summary.unrealisedPaise)} on open positions`}
        />
        <Tile
          icon={<Wallet size={15} />}
          label="Capital deployed"
          value={rupees(summary.deployedPaise)}
          foot={`of ${plainRupees(capital.rupees)} allotted${capital.wasDefaulted ? ' (default — set it on the Amount page)' : ''}`}
        />
        <Tile
          icon={<BookOpen size={15} />}
          label="Trades"
          value={String(summary.orders)}
          foot={`${summary.buys} bought · ${summary.sells} sold · ${summary.openPositions} still open`}
        />
        <Tile
          icon={<Gauge size={15} />}
          label="Closed trades won"
          value={summary.wins + summary.losses > 0
            ? `${Math.round((summary.wins / (summary.wins + summary.losses)) * 100)}%`
            : '—'}
          foot={summary.wins + summary.losses > 0
            ? `${summary.wins} won · ${summary.losses} lost`
            : 'No position has been closed yet'}
        />
      </div>

      {/* ── Chart + strategy ───────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-edge-strong bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-ink font-semibold text-sm">{chart?.symbol}</h3>
              <p className="text-ink-3 text-xs mt-0.5">
                {chart && `₹${chart.last?.toFixed(2)}`}
                {chart?.dayChangePercent !== null && chart?.dayChangePercent !== undefined && (
                  <span className={chart.dayChangePercent >= 0 ? 'text-good' : 'text-bad'}>
                    {' '}{chart.dayChangePercent >= 0 ? '+' : ''}{chart.dayChangePercent.toFixed(2)}% vs last close
                  </span>
                )}
              </p>
            </div>
            {/* One control row, above the chart it scopes. */}
            <div className="flex flex-wrap gap-1.5">
              {symbols.map((entry) => (
                <button
                  key={entry.symbol}
                  onClick={() => setFocus(entry.symbol)}
                  className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono transition-colors ${
                    entry.symbol === shown
                      ? 'border-edge-strong bg-raised text-ink'
                      : 'border-edge text-ink-2 hover:border-edge-hover hover:text-ink'
                  }`}
                >
                  {entry.symbol}
                  {entry.position && <span className="ml-1.5 text-good">●</span>}
                </button>
              ))}
            </div>
          </div>

          {chart && (
            <PriceChart
              series={chart.series}
              fastSeries={chart.fastSeries}
              slowSeries={chart.slowSeries}
              symbol={chart.symbol}
            />
          )}
        </div>

        <StrategyPanel strategy={strategy} chart={chart} />
      </div>

      {/* ── Tables: the chart's values are all reachable here too ──────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Positions symbols={symbols} />
        <TradeLog trades={trades} />
      </div>

      <DecisionLog decisions={decisions} />
    </div>
  )
}

function Tile({ icon, label, value, valueClass = 'text-ink', foot }) {
  return (
    <div className="rounded-2xl border border-edge-strong bg-panel p-4">
      <p className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-3">
        <span className="text-ink-2">{icon}</span>
        {label}
      </p>
      {/* Proportional figures on a display-size number; tabular-nums belongs in
          the tables, not here. */}
      <p className={`text-2xl font-bold mt-1.5 ${valueClass}`}>{value}</p>
      {foot && <p className="text-[11px] text-ink-3 mt-1 leading-snug">{foot}</p>}
    </div>
  )
}

/** What the algorithm is thinking about the stock on screen, in plain words. */
function StrategyPanel({ strategy, chart }) {
  const { params } = strategy
  const above = chart?.fast > chart?.slow

  return (
    <div className="rounded-2xl border border-edge-strong bg-panel p-5">
      <h3 className="text-ink font-semibold text-sm">How Arjuna decides</h3>
      <p className="text-ink-2 text-xs mt-1.5 leading-relaxed">
        It keeps two running averages of the price. The <strong className="text-[var(--chart-2)]">fast</strong> one
        ({params.fastPeriod} bars) reacts quickly; the <strong className="text-good">slow</strong> one
        ({params.slowPeriod} bars) is steady.
      </p>

      <ul className="mt-3 space-y-2 text-xs">
        <li className="flex gap-2 text-ink-2">
          <ArrowUpRight size={14} className="shrink-0 mt-0.5 text-good" />
          <span>Fast rises <strong>through</strong> slow → <strong className="text-good">buy</strong>, the trend is turning up</span>
        </li>
        <li className="flex gap-2 text-ink-2">
          <ArrowDownRight size={14} className="shrink-0 mt-0.5 text-bad" />
          <span>Fast falls <strong>back through</strong> slow → <strong className="text-bad">sell</strong>, the move is over</span>
        </li>
      </ul>

      <div className="mt-4 pt-4 border-t border-edge-strong/60 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">Safety rails while holding</p>
        <div className="flex justify-between text-xs text-ink-2">
          <span>Stop-loss</span><span className="text-bad tabular-nums">−{params.stopLossPercent}%</span>
        </div>
        <div className="flex justify-between text-xs text-ink-2">
          <span>Take-profit</span><span className="text-good tabular-nums">+{params.takeProfitPercent}%</span>
        </div>
        <div className="flex justify-between text-xs text-ink-2">
          <span>Most stocks at once</span><span className="tabular-nums">{params.maxPositions}</span>
        </div>
      </div>

      {chart && (
        <div className="mt-4 pt-4 border-t border-edge-strong/60">
          <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">{chart.symbol} right now</p>
          <p className="text-xs text-ink-2 mt-1.5 leading-relaxed">
            Fast <span className="text-[var(--chart-2)] tabular-nums">₹{chart.fast?.toFixed(2)}</span> is{' '}
            {above ? 'above' : 'below'} slow <span className="text-good tabular-nums">₹{chart.slow?.toFixed(2)}</span>,
            so the trend reads as <strong className={above ? 'text-good' : 'text-bad'}>{above ? 'up' : 'down'}</strong>.
            {chart.position
              ? ` Holding ${chart.position.quantity} shares, ${chart.position.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(chart.position.changePercent).toFixed(2)}%.`
              : ' Not holding it — waiting for a fresh upward crossover.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Positions({ symbols }) {
  const held = symbols.filter((entry) => entry.position)
  return (
    <div className="rounded-2xl border border-edge-strong bg-panel overflow-hidden">
      <h3 className="text-ink font-semibold text-sm px-5 pt-5 pb-3">
        Open positions
        <span className="text-ink-3 font-normal"> · {held.length}</span>
      </h3>
      {held.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-ink-3">
          Nothing held right now. Arjuna buys only on a fresh upward crossover.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-panel/80 text-ink-2 font-mono uppercase tracking-wider">
              <tr>
                {['Stock', 'Qty', 'Bought at', 'Now', 'P&L', '%'].map((heading) => (
                  <th key={heading} className="text-left px-5 py-2 font-medium whitespace-nowrap">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {held.map((entry) => (
                <tr key={entry.symbol} className="text-ink-2">
                  <td className="px-5 py-2.5 font-semibold text-ink whitespace-nowrap">{entry.symbol}</td>
                  <td className="px-5 py-2.5 tabular-nums">{entry.position.quantity}</td>
                  <td className="px-5 py-2.5 tabular-nums">{rupees(entry.position.averagePaise)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{rupees(entry.position.lastPricePaise)}</td>
                  <td className={`px-5 py-2.5 tabular-nums ${pnlColour(entry.position.unrealisedPaise)}`}>
                    {rupees(entry.position.unrealisedPaise)}
                  </td>
                  <td className={`px-5 py-2.5 tabular-nums ${pnlColour(entry.position.unrealisedPaise)}`}>
                    {entry.position.changePercent >= 0 ? '+' : ''}{entry.position.changePercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TradeLog({ trades }) {
  return (
    <div className="rounded-2xl border border-edge-strong bg-panel overflow-hidden">
      <h3 className="text-ink font-semibold text-sm px-5 pt-5 pb-3">
        Trades this run
        <span className="text-ink-3 font-normal"> · {trades.length}</span>
      </h3>
      {trades.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-ink-3">No trade yet — it fires on the next crossover.</p>
      ) : (
        <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-panel/80 text-ink-2 font-mono uppercase tracking-wider sticky top-0">
              <tr>
                {['Side', 'Stock', 'Qty', 'Price', 'Value', 'At'].map((heading) => (
                  <th key={heading} className="text-left px-5 py-2 font-medium whitespace-nowrap">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {trades.map((trade) => (
                <tr key={trade.id} className="text-ink-2">
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    {/* Icon + word, never colour alone. */}
                    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] ${trade.side === 'BUY' ? 'text-good' : 'text-bad'}`}>
                      {trade.side === 'BUY' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">{trade.tradingsymbol}</td>
                  <td className="px-5 py-2.5 tabular-nums">{trade.quantity}</td>
                  <td className="px-5 py-2.5 tabular-nums">{rupees(trade.price_paise)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{rupees(trade.value_paise)}</td>
                  <td className="px-5 py-2.5 font-mono text-ink-3 whitespace-nowrap">{displayStamp(trade.traded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * Why it did or did not act, bar by bar. This is the panel that answers a
 * broker asking "but what is it actually doing between trades?".
 */
function DecisionLog({ decisions }) {
  return (
    <div className="rounded-2xl border border-edge-strong bg-panel overflow-hidden">
      <h3 className="text-ink font-semibold text-sm px-5 pt-5 pb-1">Decision log</h3>
      <p className="px-5 pb-3 text-xs text-ink-3">
        Every bar, for every stock — including the times it chose to do nothing, and why.
      </p>
      <div className="max-h-[260px] overflow-y-auto border-t border-edge">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-edge/70">
            {decisions.map((decision, index) => (
              <tr key={`${decision.bar}-${decision.symbol}-${index}`} className={decision.executed ? 'bg-raised/40' : undefined}>
                <td className="px-5 py-2 font-mono text-ink-3 whitespace-nowrap w-16">#{decision.bar}</td>
                <td className="px-2 py-2 font-mono text-ink-2 whitespace-nowrap w-24">{decision.symbol}</td>
                <td className="px-2 py-2 whitespace-nowrap w-20">
                  <span className={`font-mono text-[10px] ${
                    decision.action === 'BUY' ? 'text-good'
                      : decision.action === 'SELL' ? 'text-bad' : 'text-ink-3'
                  }`}>
                    {decision.executed ? `${decision.action} ${decision.quantity}` : decision.action}
                  </span>
                </td>
                <td className="px-2 py-2 text-ink-2">{decision.text}</td>
                <td className="px-5 py-2 font-mono text-ink-3 tabular-nums text-right whitespace-nowrap">
                  ₹{decision.price?.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
