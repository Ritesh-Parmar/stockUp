import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { downloadCsv, stampedName } from '../lib/csvFile'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

const asNumber = (value) => Number(value ?? 0)
const money = (value) => currency.format(asNumber(value))
const quantity = (value) => number.format(asNumber(value))
const blank = (value) => value === null || value === undefined || value === ''
const moneyOrDash = (value) => (blank(value) ? '—' : money(value))
const signedClass = (value) => asNumber(value) < 0 ? 'text-bad' : asNumber(value) > 0 ? 'text-good' : 'text-ink-2'
const signedMoney = (value) => `${asNumber(value) > 0 ? '+' : ''}${money(value)}`
const signedNumber = (value) => `${asNumber(value) > 0 ? '+' : ''}${quantity(value)}`
const label = (key) => key.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * mStock candle timestamps look like "2026-08-03T09:15:00+05".
 *
 * That offset is TRUNCATED — India is +05:30, not +05:00 — so handing the string
 * to `new Date()` and formatting it in the viewer's timezone slides every candle
 * by 30 minutes. These are exchange wall-clock times, and that is what a trader
 * wants to read, so parse the fields literally and never convert.
 */
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/
const readTimestamp = (value) => {
  const match = typeof value === 'string' ? value.match(TIMESTAMP) : null
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  // Built in UTC purely to derive the weekday — no timezone shift can occur.
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()]
  return {
    date: `${day} ${MONTHS[Number(month) - 1] ?? month} ${year}`,
    time: hour ? `${hour}:${minute}` : null,
    weekday,
  }
}

// 45392755 -> "4.54 Cr". Indian market volumes are unreadable in full.
const compact = (value) => {
  const count = asNumber(value)
  const magnitude = Math.abs(count)
  if (magnitude >= 1e7) return `${number.format(count / 1e7)} Cr`
  if (magnitude >= 1e5) return `${number.format(count / 1e5)} L`
  if (magnitude >= 1e3) return `${number.format(count / 1e3)} K`
  return number.format(count)
}

// getInstruments() resolves to a bare array (the SDK parses the CSV itself), while every
// other endpoint resolves to { status, data }. Accept either shape.
const rows = (response) => Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : null

/**
 * ScrollableTable — horizontal scroll container for the wide result tables.
 *
 * `overflow-auto` alone technically scrolls, but on Windows the scrollbar is an
 * overlay that stays hidden until you already scroll, so columns off the right
 * edge look like missing data rather than hidden data. This adds an edge fade
 * and a "more →" hint that appear only while there is genuinely more to see,
 * plus an always-visible slim scrollbar via .table-scroll in index.css.
 */
function ScrollableTable({ children, capHeight = false }) {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const update = () => {
      const slack = node.scrollWidth - node.clientWidth
      setEdges({
        left: node.scrollLeft > 1,
        right: slack > 1 && node.scrollLeft < slack - 1,
      })
    }
    node.addEventListener('scroll', update, { passive: true })
    // Fires once on observe, which covers the initial measurement — so no
    // synchronous setState in the effect body.
    const observer = new ResizeObserver(update)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    return () => {
      node.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return <div className="relative">
    <div ref={ref} className={`table-scroll overflow-x-auto overflow-y-auto ${capHeight ? 'max-h-[32rem]' : ''}`}>
      {children}
    </div>
    {edges.left && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-slate-900 to-transparent" />}
    {edges.right && <>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-900 to-transparent" />
      <span className="pointer-events-none absolute right-1 top-1 rounded-full bg-raised/95 border border-edge-strong px-2 py-0.5 text-[10px] font-mono text-ink-2 shadow">
        more →
      </span>
    </>}
  </div>
}

function RawJson({ response }) {
  return <pre className="text-xs text-ink-2 overflow-auto max-h-[32rem] leading-relaxed">{JSON.stringify(response, null, 2)}</pre>
}

function EmptyState() {
  return <p className="text-ink-3 text-sm">No data was returned for this request.</p>
}

// How many records the API actually sent, shown above every list so a short
// table can be told apart from a truncated one at a glance.
function RecordCount({ label, count }) {
  return <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-2">{label} · {quantity(count)} from API</p>
}

function FundSummary({ response }) {
  const fund = response?.data?.[0]
  if (!fund) return <EmptyState />
  const highlights = [
    ['Available balance', fund.AVAILABLE_BALANCE],
    ['Amount utilized', fund.AMOUNT_UTILIZED],
    ['Limit at start of day', fund.LIMIT_SOD],
    ['Mark to market', fund.MTM_COMBINED],
    ['Realised profits', fund.REALISED_PROFITS],
    ['Peak margin', fund.PEAK_MARGIN],
  ]
  return <div className="space-y-4"><div className="grid grid-cols-2 xl:grid-cols-3 gap-3">{highlights.map(([name, value]) => <div key={name} className="rounded-xl bg-raised/80 border border-edge-strong p-3"><p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">{name}</p><p className={`mt-1 text-base font-semibold ${name.includes('market') || name.includes('profits') ? signedClass(value) : 'text-ink'}`}>{money(value)}</p></div>)}</div><details className="rounded-xl border border-edge-strong p-3"><summary className="cursor-pointer text-sm text-ink-2">Show all fund details</summary><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">{Object.entries(fund).map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-edge pb-1"><span className="text-ink-3">{label(key)}</span><span className="text-ink text-right">{blank(value) ? '—' : value}</span></div>)}</div></details></div>
}

const POSITION_HEADS = ['Symbol', 'Product', 'Qty', 'Average', 'LTP', 'Value', 'P&L', 'M2M']

function PositionTable({ positions }) {
  return <ScrollableTable><table className="w-full min-w-[680px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong"><tr>{POSITION_HEADS.map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{positions.map((position, index) => <tr key={`${position.exchange}-${position.tradingsymbol}-${position.product}-${index}`} className="border-b border-edge/80"><td className="px-2 py-3"><p className="font-semibold text-ink">{position.tradingsymbol}</p><p className="text-ink-3">{position.exchange}</p></td><td className="px-2 py-3 text-ink-2">{blank(position.product) ? '—' : position.product}</td><td className={`px-2 py-3 ${signedClass(position.quantity)}`}>{quantity(position.quantity)}</td><td className="px-2 py-3 text-ink-2">{money(position.average_price)}</td><td className="px-2 py-3 text-ink-2">{money(position.last_price)}</td><td className="px-2 py-3 text-ink-2">{money(position.value)}</td><td className={`px-2 py-3 font-medium ${signedClass(position.pnl)}`}>{signedMoney(position.pnl)}</td><td className={`px-2 py-3 font-medium ${signedClass(position.m2m)}`}>{signedMoney(position.m2m)}</td></tr>)}</tbody></table></ScrollableTable>
}

// The API returns { data: { net: [...], day: [...] | null } } — "day" was previously dropped.
function Positions({ response }) {
  const net = response?.data?.net
  const day = response?.data?.day
  if (!Array.isArray(net) && !Array.isArray(day)) return <EmptyState />
  return <div className="space-y-5">
    <div><p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-2">Net positions{Array.isArray(net) ? ` · ${net.length}` : ''}</p>{Array.isArray(net) && net.length ? <PositionTable positions={net} /> : <p className="text-ink-3 text-sm">No net positions.</p>}</div>
    <div><p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-2">Day positions{Array.isArray(day) ? ` · ${day.length}` : ''}</p>{Array.isArray(day) && day.length ? <PositionTable positions={day} /> : <p className="text-ink-3 text-sm">No day positions returned.</p>}</div>
  </div>
}

// Holdings carry both settled `quantity` and unsettled `t1_quantity`; value uses the total.
function Holdings({ response }) {
  const holdings = rows(response)
  if (!holdings) return <EmptyState />
  if (!holdings.length) return <p className="text-ink-3 text-sm">No holdings returned. This endpoint covers settled delivery (CNC) stock only — intraday and today&apos;s buys show under Net positions.</p>
  return <div><RecordCount label="Holdings" count={holdings.length} /><ScrollableTable><table className="w-full min-w-[720px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong"><tr>{['Symbol', 'Qty', 'Average', 'LTP', 'Value', 'P&L', 'Day change'].map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{holdings.map((holding, index) => {
    const total = asNumber(holding.quantity) + asNumber(holding.t1_quantity)
    return <tr key={`${holding.exchange}-${holding.tradingsymbol}-${index}`} className="border-b border-edge/80"><td className="px-2 py-3"><p className="font-semibold text-ink">{holding.tradingsymbol}</p><p className="text-ink-3">{[holding.exchange, holding.product].filter(Boolean).join(' · ') || '—'}</p></td><td className="px-2 py-3 text-ink-2">{quantity(total)}{asNumber(holding.t1_quantity) > 0 && <span className="ml-1 text-[10px] text-warn" title="Includes unsettled T1 quantity">T1 {quantity(holding.t1_quantity)}</span>}</td><td className="px-2 py-3 text-ink-2">{money(holding.average_price ?? holding.price)}</td><td className="px-2 py-3 text-ink-2">{money(holding.last_price)}</td><td className="px-2 py-3 text-ink-2">{money(asNumber(holding.last_price) * total)}</td><td className={`px-2 py-3 font-medium ${signedClass(holding.pnl)}`}>{signedMoney(holding.pnl)}</td><td className={`px-2 py-3 font-medium ${signedClass(holding.day_change)}`}>{signedNumber(holding.day_change)} ({signedNumber(holding.day_change_percentage)}%)</td></tr>
  })}</tbody></table></ScrollableTable></div>
}

function Ltp({ response }) {
  const quotes = response?.data
  if (!quotes || Array.isArray(quotes)) return <EmptyState />
  return <div className="grid sm:grid-cols-2 gap-3">{Object.entries(quotes).map(([symbol, quote]) => <div key={symbol} className="rounded-xl bg-raised/80 border border-edge-strong p-4"><p className="text-xs font-mono text-ink-2">{symbol}</p><p className="mt-2 text-2xl font-semibold text-ink">{money(quote.last_price)}</p><p className="mt-1 text-xs text-ink-3">Instrument token: {quote.instrument_token}</p></div>)}</div>
}

function Ohlc({ response }) {
  const quotes = response?.data
  if (!quotes || Array.isArray(quotes)) return <EmptyState />
  return <div className="space-y-3">{Object.entries(quotes).map(([symbol, quote]) => {
    const change = asNumber(quote.last_price) - asNumber(quote.ohlc?.close)
    const percent = asNumber(quote.ohlc?.close) ? (change / asNumber(quote.ohlc.close)) * 100 : 0
    return <div key={symbol} className="rounded-xl bg-raised/80 border border-edge-strong p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-ink">{symbol}</p><p className="text-xs text-ink-3">Token: {quote.instrument_token}</p></div><div className="text-right"><p className="text-xl font-semibold text-ink">{money(quote.last_price)}</p><p className={`text-xs font-medium ${signedClass(change)}`}>{signedMoney(change)} ({signedNumber(percent)}%)</p></div></div><div className="grid grid-cols-4 gap-2 mt-4">{['open', 'high', 'low', 'close'].map((key) => <div key={key}><p className="text-[10px] uppercase text-ink-3">{key}</p><p className="text-sm text-ink">{moneyOrDash(quote.ohlc?.[key])}</p></div>)}</div></div>
  })}</div>
}

// Candles are positional arrays: [timestamp, open, high, low, close, volume].
// The response itself carries no instrument identity, so `meta` (what was asked
// for) is threaded down from the request to label the table.
function Candles({ response, meta }) {
  const candles = response?.data?.candles
  const [newestFirst, setNewestFirst] = useState(true)

  if (!Array.isArray(candles)) return <EmptyState />
  if (!candles.length) return <p className="text-ink-3 text-sm">No candles in that range. Markets are closed on weekends and holidays.</p>

  const parsed = candles.map(([timestamp, open, high, low, close, volume]) => ({
    stamp: readTimestamp(timestamp), raw: timestamp, open, high, low, close, volume,
  }))
  // Daily candles all share one timestamp-of-day, so the time is noise; intraday needs it.
  const showTime = meta?.interval !== 'day' && new Set(parsed.map((candle) => candle.stamp?.time)).size > 1
  const ordered = newestFirst ? [...parsed].reverse() : parsed
  const first = parsed[0]
  const last = parsed[parsed.length - 1]
  const move = asNumber(last.close) - asNumber(first.open)
  const movePercent = asNumber(first.open) ? (move / asNumber(first.open)) * 100 : 0

  const facts = [
    ['Instrument token', meta?.instrument_token || '—'],
    ['Exchange', meta?.exchange || '—'],
    ['Interval', meta?.interval || '—'],
    ['Candles', quantity(parsed.length)],
  ]

  return <div className="space-y-4">
    <div className="rounded-xl bg-raised/60 border border-edge-strong p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          {facts.map(([name, value]) => <div key={name}><p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">{name}</p><p className="mt-0.5 text-sm font-semibold text-ink">{value}</p></div>)}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">Range move</p>
          <p className={`mt-0.5 text-sm font-semibold ${signedClass(move)}`}>{signedMoney(move)} ({signedNumber(movePercent)}%)</p>
        </div>
      </div>
      <p className="mt-3 pt-3 border-t border-edge-strong text-xs text-ink-2">
        {first.stamp?.date ?? String(first.raw)}{showTime && first.stamp?.time ? ` ${first.stamp.time}` : ''}
        {' → '}
        {last.stamp?.date ?? String(last.raw)}{showTime && last.stamp?.time ? ` ${last.stamp.time}` : ''}
        <span className="text-ink-3"> · exchange time</span>
      </p>
    </div>

    <div className="flex justify-end">
      <button onClick={() => setNewestFirst((current) => !current)} className="text-xs font-mono text-ink-2 hover:text-ink transition-colors">
        {newestFirst ? '↓ Newest first' : '↑ Oldest first'}
      </button>
    </div>

    <ScrollableTable capHeight><table className="w-full min-w-[680px] text-xs"><thead className="text-ink-3 border-b border-edge-strong sticky top-0 bg-panel"><tr><th className="px-2 py-2 font-medium text-left">Date</th>{['Open', 'High', 'Low', 'Close', 'Change', 'Volume'].map((head) => <th key={head} className="px-2 py-2 font-medium text-right">{head}</th>)}</tr></thead><tbody>{ordered.map((candle, index) => {
      const change = asNumber(candle.close) - asNumber(candle.open)
      const percent = asNumber(candle.open) ? (change / asNumber(candle.open)) * 100 : 0
      return <tr key={`${candle.raw}-${index}`} className="border-b border-edge/80">
        <td className="px-2 py-2.5 whitespace-nowrap"><p className="text-ink">{candle.stamp?.date ?? String(candle.raw)}</p><p className="text-ink-3">{showTime ? candle.stamp?.time : candle.stamp?.weekday}</p></td>
        <td className="px-2 py-2.5 text-ink-2 text-right tabular-nums">{money(candle.open)}</td>
        <td className="px-2 py-2.5 text-good text-right tabular-nums">{money(candle.high)}</td>
        <td className="px-2 py-2.5 text-bad text-right tabular-nums">{money(candle.low)}</td>
        <td className="px-2 py-2.5 text-ink font-medium text-right tabular-nums">{money(candle.close)}</td>
        <td className={`px-2 py-2.5 font-medium text-right tabular-nums ${signedClass(change)}`}>{signedMoney(change)}<span className="block text-[10px] font-normal">{signedNumber(percent)}%</span></td>
        <td className="px-2 py-2.5 text-ink-2 text-right tabular-nums" title={quantity(candle.volume)}>{compact(candle.volume)}</td>
      </tr>
    })}</tbody></table></ScrollableTable>
  </div>
}

// loserGainer responds with { status: true, data: [...] } — note the boolean status.
function GainersLosers({ response }) {
  const movers = rows(response)
  if (!movers) return <EmptyState />
  if (!movers.length) return <EmptyState />
  return <ScrollableTable><table className="w-full min-w-[720px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong"><tr>{['Symbol', 'LTP', 'Change', '% Change', 'Volume', 'Segment'].map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{movers.map((mover, index) => <tr key={`${mover.security_id ?? mover.symbol}-${index}`} className="border-b border-edge/80"><td className="px-2 py-3"><p className="font-semibold text-ink">{mover.symbol || mover.display_name}</p><p className="text-ink-3 truncate max-w-[220px]" title={mover.symbol_name}>{mover.symbol_name}</p></td><td className="px-2 py-3 text-ink-2">{money(mover.ltp)}</td><td className={`px-2 py-3 font-medium ${signedClass(mover.change)}`}>{signedMoney(mover.change)}</td><td className={`px-2 py-3 font-medium ${signedClass(mover.per_change)}`}>{signedNumber(mover.per_change)}%</td><td className="px-2 py-3 text-ink-2">{quantity(mover.volume)}</td><td className="px-2 py-3 text-ink-3">{[mover.exchange, mover.series].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></ScrollableTable>
}

const ORDER_STATUS_CLASS = (status) => {
  const value = String(status ?? '').toUpperCase()
  if (value.includes('REJECT') || value.includes('CANCEL')) return 'text-bad'
  if (value.includes('COMPLETE')) return 'text-good'
  return 'text-warn'
}

function OrderBook({ response }) {
  const orders = rows(response)
  if (!orders) return <EmptyState />
  if (!orders.length) return <p className="text-ink-3 text-sm">No orders placed today.</p>
  return <ScrollableTable><table className="w-full min-w-[760px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong"><tr>{['Symbol', 'Side', 'Status', 'Qty', 'Price', 'Average', 'Placed at'].map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{orders.map((order, index) => <tr key={`${order.order_id ?? index}-${index}`} className="border-b border-edge/80"><td className="px-2 py-3"><p className="font-semibold text-ink">{order.tradingsymbol}</p><p className="text-ink-3">{[order.exchange, order.product].filter(Boolean).join(' · ')}</p></td><td className={`px-2 py-3 font-medium ${String(order.transaction_type).toUpperCase() === 'SELL' ? 'text-bad' : 'text-good'}`}>{order.transaction_type}<span className="block text-ink-3 font-normal">{order.order_type}</span></td><td className={`px-2 py-3 font-medium ${ORDER_STATUS_CLASS(order.status)}`}>{order.status}{order.status_message && <span className="block text-ink-3 font-normal truncate max-w-[200px]" title={order.status_message}>{order.status_message}</span>}</td><td className="px-2 py-3 text-ink-2">{quantity(order.filled_quantity)} / {quantity(order.quantity)}</td><td className="px-2 py-3 text-ink-2">{asNumber(order.price) ? money(order.price) : 'Market'}</td><td className="px-2 py-3 text-ink-2">{moneyOrDash(order.average_price)}</td><td className="px-2 py-3 text-ink-2 whitespace-nowrap">{blank(order.order_timestamp) ? '—' : order.order_timestamp}</td></tr>)}</tbody></table></ScrollableTable>
}

// The trade book comes back SHOUTING in a different key style to every other endpoint.
function TradeBook({ response }) {
  const trades = rows(response)
  if (!trades) return <EmptyState />
  if (!trades.length) return <p className="text-ink-3 text-sm">No trades executed today.</p>
  return <ScrollableTable><table className="w-full min-w-[680px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong"><tr>{['Symbol', 'Side', 'Qty', 'Price', 'Value', 'Order no.', 'Trade no.'].map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{trades.map((trade, index) => <tr key={`${trade.TRADE_NUMBER ?? index}-${index}`} className="border-b border-edge/80"><td className="px-2 py-3"><p className="font-semibold text-ink">{trade.SYMBOL}</p><p className="text-ink-3">{trade.EXCHANGE}</p></td><td className={`px-2 py-3 font-medium ${String(trade.BUY_SELL).toUpperCase() === 'SELL' ? 'text-bad' : 'text-good'}`}>{trade.BUY_SELL}</td><td className="px-2 py-3 text-ink-2">{quantity(trade.QUANTITY)}</td><td className="px-2 py-3 text-ink-2">{money(trade.PRICE)}</td><td className="px-2 py-3 text-ink-2">{money(trade.TRADE_VALUE)}</td><td className="px-2 py-3 text-ink-2 font-mono">{trade.ORDER_NUMBER}</td><td className="px-2 py-3 text-ink-2 font-mono">{trade.TRADE_NUMBER}</td></tr>)}</tbody></table></ScrollableTable>
}

const INSTRUMENT_PAGE = 100
// Past this many rows the browser is the wrong place to read the data — offer a file instead.
const LARGE_RESULT = 2000


function DownloadButton({ items, filename, children }) {
  return <button onClick={() => downloadCsv(items, filename)} disabled={!items.length} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink whitespace-nowrap">
    <Download size={15} />{children}
  </button>
}

const INSTRUMENT_HEADS = ['Symbol', 'Token', 'Last price', 'Type', 'Expiry', 'Strike', 'Lot', 'Tick']

function InstrumentTable({ items }) {
  return <ScrollableTable capHeight><table className="w-full min-w-[720px] text-xs"><thead className="text-left text-ink-3 border-b border-edge-strong sticky top-0 bg-panel"><tr>{INSTRUMENT_HEADS.map((head) => <th key={head} className="px-2 py-2 font-medium">{head}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={`${item.instrument_token ?? index}-${index}`} className="border-b border-edge/80"><td className="px-2 py-2.5"><p className="font-semibold text-ink">{item.tradingsymbol}</p><p className="text-ink-3 truncate max-w-[240px]" title={item.name}>{item.name}</p></td><td className="px-2 py-2.5 text-ink-2 font-mono">{item.instrument_token}</td><td className="px-2 py-2.5 text-ink-2">{moneyOrDash(item.last_price)}</td><td className="px-2 py-2.5 text-ink-2">{[item.exchange, item.instrument_type].filter(Boolean).join(' · ') || '—'}</td><td className="px-2 py-2.5 text-ink-2">{blank(item.expiry) ? '—' : item.expiry}</td><td className="px-2 py-2.5 text-ink-2">{blank(item.strike) ? '—' : item.strike}</td><td className="px-2 py-2.5 text-ink-2">{blank(item.lot_size) ? '—' : item.lot_size}</td><td className="px-2 py-2.5 text-ink-2">{blank(item.tick_size) ? '—' : item.tick_size}</td></tr>)}</tbody></table></ScrollableTable>
}

/**
 * The instrument master is roughly 100,000 rows. Rendering that is pointless and
 * slow, so above LARGE_RESULT the table is replaced by a summary plus a CSV
 * download. The filter still works — narrow the set below the threshold and the
 * table comes back, so you can look up a token without leaving the page.
 * Smaller results (or a small filtered subset) render normally.
 */
function Instruments({ response }) {
  const instruments = rows(response)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(INSTRUMENT_PAGE)

  const matches = useMemo(() => {
    if (!instruments) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return instruments
    return instruments.filter((item) => `${item.tradingsymbol ?? ''} ${item.name ?? ''}`.toLowerCase().includes(needle))
  }, [instruments, query])

  const breakdown = useMemo(() => {
    if (!instruments) return []
    const counts = new Map()
    for (const item of instruments) counts.set(item.exchange || '—', (counts.get(item.exchange || '—') ?? 0) + 1)
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8)
  }, [instruments])

  if (!instruments) return <EmptyState />
  if (!instruments.length) return <p className="text-ink-3 text-sm">The instrument master came back empty.</p>

  const filtering = query.trim().length > 0
  const tooLarge = matches.length > LARGE_RESULT

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <input value={query} onChange={(event) => { setQuery(event.target.value); setShown(INSTRUMENT_PAGE) }} placeholder="Filter by symbol or name" className="flex-1 min-w-[200px] px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" />
      <p className="text-xs text-ink-3 font-mono">{filtering ? `${quantity(matches.length)} of ${quantity(instruments.length)}` : `${quantity(instruments.length)} instruments`}</p>
      <DownloadButton items={matches} filename={stampedName(filtering ? 'instruments-filtered' : 'instrument-master')}>
        {filtering ? `Download ${quantity(matches.length)} matches` : 'Download CSV'}
      </DownloadButton>
    </div>

    {tooLarge
      ? <div className="rounded-xl bg-raised/60 border border-edge-strong p-5 space-y-4">
          <div>
            <p className="text-ink font-semibold text-sm">{quantity(matches.length)} rows — too many to show here</p>
            <p className="text-ink-2 text-xs mt-1">Download the CSV to open it in Excel, or type in the filter above to narrow it below {quantity(LARGE_RESULT)} rows and the table will appear.</p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-2">By exchange</p>
            <div className="flex flex-wrap gap-2">{breakdown.map(([exchange, count]) => <span key={exchange} className="px-3 py-1 rounded-full bg-panel border border-edge-strong text-xs"><span className="text-ink-2 font-medium">{exchange}</span> <span className="text-ink-3 font-mono">{quantity(count)}</span></span>)}</div>
          </div>
        </div>
      : <>
          {!matches.length
            ? <p className="text-ink-3 text-sm">No instrument matches that filter.</p>
            : <InstrumentTable items={matches.slice(0, shown)} />}
          {matches.length > shown && <button onClick={() => setShown((current) => current + INSTRUMENT_PAGE)} className="rounded-xl px-3 py-2 text-sm font-medium bg-raised hover:bg-raised text-ink">Show {quantity(Math.min(INSTRUMENT_PAGE, matches.length - shown))} more</button>}
        </>}
  </div>
}

// Stringifying the ~100k-row instrument master would lock the tab, so the raw
// toggle is only offered for payloads small enough to serialise cheaply.
const RAW_ROW_LIMIT = 500

function FormattedResponse({ title, response, meta }) {
  if (title === 'Fund summary') return <FundSummary response={response} />
  if (title === 'Net positions') return <Positions response={response} />
  if (title === 'Holdings') return <Holdings response={response} />
  if (title === 'Last traded prices') return <Ltp response={response} />
  if (title === 'OHLC data') return <Ohlc response={response} />
  if (title === 'Historical candle data') return <Candles response={response} meta={meta} />
  if (title === 'Order book') return <OrderBook response={response} />
  if (title === 'Trade book') return <TradeBook response={response} />
  if (title === 'Top gainers' || title === 'Top losers') return <GainersLosers response={response} />
  if (title === 'Instrument master') return <Instruments response={response} />
  return null
}

const KNOWN_TITLES = [
  'Fund summary', 'Net positions', 'Holdings', 'Last traded prices', 'OHLC data',
  'Historical candle data', 'Order book', 'Trade book', 'Top gainers', 'Top losers', 'Instrument master',
]

export default function ApiResponseView({ title, response, meta }) {
  // Unrecognised responses have no formatter, so raw JSON is all there is.
  if (!KNOWN_TITLES.includes(title)) return <RawJson response={response} />

  const rowCount = rows(response)?.length ?? 0
  const canShowRaw = rowCount <= RAW_ROW_LIMIT

  return <div className="space-y-4">
    <FormattedResponse title={title} response={response} meta={meta} />
    {canShowRaw && (
      <details className="rounded-xl border border-edge p-3">
        <summary className="cursor-pointer text-xs font-mono text-ink-3 hover:text-ink-2">
          Show raw API response
        </summary>
        <p className="mt-2 mb-3 text-xs text-ink-3">Exactly what mStock returned, before any formatting. Compare the row count here against the table above.</p>
        <RawJson response={response} />
      </details>
    )}
  </div>
}
