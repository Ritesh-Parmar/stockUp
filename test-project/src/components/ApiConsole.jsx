import { useState } from 'react'
import { AlertCircle, BarChart3, CheckCircle2, Eye, LogOut, Wallet } from 'lucide-react'
import ApiResponseView from './ApiResponseView'
import { demoResponse } from './demoData'

const API_BASE_URL = 'http://localhost:5000/api'
// position_type must be lowercase 'day' | 'overnight' — the API rejects 'DAY'.
const blankConversion = { tradingsymbol: '', exchange: 'NSE', transaction_type: 'BUY', position_type: 'day', quantity: '1', old_product: 'CNC', new_product: 'MIS' }
const blankGainersLosers = { Exchange: '1', SecurityIdCode: '13', segment: '1', TypeFlag: 'G' }
const EXCHANGES = ['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX']
const INTERVALS = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day']
// Tokens returned by /verify are never worth printing on screen.
const SECRET_SESSION_FIELDS = ['access_token', 'refresh_token', 'enctoken', 'public_token', 'api_key']

const PORTFOLIO_ACTIONS = [
  ['funds', 'Fund summary'],
  ['positions', 'Net positions'],
  ['holdings', 'Holdings'],
  ['orders', 'Order book'],
  ['trades', 'Trade book'],
]

// <input type="datetime-local"> gives "2026-08-03T09:15"; the API wants "2026-08-03 09:15:00".
const toApiDateTime = (value) => {
  if (!value) return ''
  const [date, time = '00:00'] = value.split('T')
  return `${date} ${time.length === 5 ? `${time}:00` : time}`
}

const redactSession = (session) => {
  if (!session || typeof session !== 'object') return session
  if (Array.isArray(session)) return session.map(redactSession)
  return Object.fromEntries(Object.entries(session).map(([key, value]) => [
    key,
    SECRET_SESSION_FIELDS.includes(key) ? '••• hidden •••' : redactSession(value),
  ]))
}

/**
 * ApiConsole — every authenticated mStock call the app can make.
 *
 * Used twice, from the same code, so the preview never drifts from the real page:
 *   - HomePage (/dashboard)          real tokens from AuthContext
 *   - PreviewPage (/dashboard/preview)  demoMode, stale sample data, no network
 */
export default function ApiConsole({ demoMode = false, accessToken = '', apiKey = '', session = null, onSignOut }) {
  const [panel, setPanel] = useState('portfolio')
  const [marketAction, setMarketAction] = useState('ltp')
  const [symbols, setSymbols] = useState('NSE:ACC-EQ')
  const [historical, setHistorical] = useState({ exchange: 'NSE', instrument_token: '', interval: 'day', from: '', to: '' })
  const [conversion, setConversion] = useState(blankConversion)
  const [gainersLosers, setGainersLosers] = useState(blankGainersLosers)
  const [result, setResult] = useState(null)
  const [resultTitle, setResultTitle] = useState('')
  // What was *asked for*. Historical candles come back with no instrument identity,
  // so the request parameters are what label the results table.
  const [resultMeta, setResultMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async (path, body, title, meta = null) => {
    setLoading(true); setError('')
    try {
      if (demoMode) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        setResult(demoResponse(title)); setResultTitle(title); setResultMeta(meta)
        return
      }
      if (!accessToken || !apiKey) throw new Error('This session has no access token. Sign in again.')
      const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: accessToken, api_key: apiKey, ...body }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Request failed')
      setResult(data.data); setResultTitle(title); setResultMeta(meta)
    }
    catch (err) { setError(err.message || 'The request could not be completed.') }
    finally { setLoading(false) }
  }

  const marketSymbols = symbols.split(/[\n,]+/).map((symbol) => symbol.trim()).filter(Boolean)
  const setObjectValue = (setter, field) => (event) => setter((current) => ({ ...current, [field]: event.target.value }))
  const buttonClass = 'rounded-xl px-3 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white'

  const renderPortfolio = () => <div className="space-y-4"><div className="flex flex-col gap-3">{PORTFOLIO_ACTIONS.map(([operation, label]) => <button key={operation} className={buttonClass} disabled={loading} onClick={() => run(`/portfolio/${operation}`, {}, label)}>{label}</button>)}</div><details className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-4"><summary className="cursor-pointer text-amber-300 font-medium text-sm">Convert position (changes an existing position)</summary><p className="text-slate-400 text-xs mt-2 mb-3">This is an action, not a data request. Check every value before submitting.</p><div className="grid sm:grid-cols-2 gap-3">{Object.entries(conversion).map(([field, value]) => <label key={field} className="flex flex-col gap-1 text-xs text-slate-400">{field.replaceAll('_', ' ')}<input value={value} onChange={setObjectValue(setConversion, field)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" /></label>)}</div><button className="mt-3 rounded-xl px-3 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white" disabled={loading} onClick={() => { if (window.confirm('Convert this position using the values shown?')) run('/portfolio/convert', { position: conversion }, 'Position conversion result') }}>Convert position</button></details></div>

  const renderMarketFields = () => {
    if (marketAction === 'instruments') return <p className="text-slate-400 text-sm">Downloads the complete instrument master (roughly 100,000 rows). Use the filter on the results to find a symbol.</p>
    if (marketAction === 'ltp' || marketAction === 'ohlc') return <><label className="block text-sm text-slate-300 mb-2">Symbols, one per line or comma-separated</label><textarea value={symbols} onChange={(event) => setSymbols(event.target.value)} rows="3" placeholder="NSE:ACC-EQ" className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-mono" /></>
    if (marketAction === 'historical') return <div className="grid sm:grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">Exchange<select value={historical.exchange} onChange={setObjectValue(setHistorical, 'exchange')} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">{EXCHANGES.map((exchange) => <option key={exchange} value={exchange}>{exchange}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">Instrument token<input value={historical.instrument_token} onChange={setObjectValue(setHistorical, 'instrument_token')} inputMode="numeric" placeholder="1660" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">Interval<select value={historical.interval} onChange={setObjectValue(setHistorical, 'interval')} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">{INTERVALS.map((interval) => <option key={interval} value={interval}>{interval}</option>)}</select></label>
      <div />
      <label className="flex flex-col gap-1 text-xs text-slate-400">From<input value={historical.from} type="datetime-local" onChange={setObjectValue(setHistorical, 'from')} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">To<input value={historical.to} type="datetime-local" onChange={setObjectValue(setHistorical, 'to')} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" /></label>
    </div>
    return <div className="grid sm:grid-cols-2 gap-3">{Object.entries(gainersLosers).map(([field, value]) => <label key={field} className="flex flex-col gap-1 text-xs text-slate-400">{field}<input value={value} onChange={setObjectValue(setGainersLosers, field)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" /></label>)}</div>
  }

  const runMarket = () => {
    const bodies = { instruments: {}, ltp: { symbols: marketSymbols }, ohlc: { symbols: marketSymbols }, historical: { ...historical, from: toApiDateTime(historical.from), to: toApiDateTime(historical.to) }, 'gainers-losers': { gainersLosers } }
    const titles = { instruments: 'Instrument master', ltp: 'Last traded prices', ohlc: 'OHLC data', historical: 'Historical candle data', 'gainers-losers': gainersLosers.TypeFlag === 'G' ? 'Top gainers' : 'Top losers' }
    // The candle response has no instrument identity of its own — carry the request over.
    const meta = marketAction === 'historical'
      ? { exchange: historical.exchange, instrument_token: historical.instrument_token || (demoMode ? '1660' : ''), interval: historical.interval }
      : null
    run(`/market/${marketAction}`, bodies[marketAction], titles[marketAction], meta)
  }

  return <div className="space-y-5">
    {demoMode
      ? <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl"><Eye className="text-amber-400 shrink-0" size={18} /><div><p className="text-amber-300 font-semibold text-sm">Preview mode — stale sample data</p><p className="text-slate-400 text-xs">No network calls are made. Every panel here behaves exactly like the signed-in dashboard.</p></div></div>
      : <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl"><CheckCircle2 className="text-emerald-400 shrink-0" size={18} /><div className="flex-1"><p className="text-emerald-300 font-semibold text-sm">Signed in to mStock</p><p className="text-slate-400 text-xs">Choose Portfolio or Market data to make authenticated API calls.</p></div>{onSignOut && <button onClick={onSignOut} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-colors text-xs font-mono"><LogOut size={13} />Sign out</button>}</div>}

    {error && <div className="flex gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}

    {session && <details className="bg-slate-900 border border-slate-700 rounded-2xl p-5"><summary className="cursor-pointer text-sm text-slate-300">Show authenticated login JSON</summary><p className="mt-2 text-xs text-slate-500">Access, refresh, public and enc tokens are hidden.</p><pre className="mt-3 text-xs text-slate-300 overflow-x-auto">{JSON.stringify(redactSession(session), null, 2)}</pre></details>}

    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
      <section className="bg-slate-900 border border-slate-700 rounded-2xl p-5 h-fit">
        <div className="flex gap-5 mb-5 border-b border-slate-700">
          <button onClick={() => setPanel('portfolio')} className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${panel === 'portfolio' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Wallet size={16} />Portfolio</button>
          <button onClick={() => setPanel('market')} className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${panel === 'market' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><BarChart3 size={16} />Market data</button>
        </div>
        {panel === 'portfolio' ? renderPortfolio() : <div className="space-y-4">
          <select value={marketAction} onChange={(event) => setMarketAction(event.target.value)} className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white">
            <option value="ltp">Last traded price (LTP)</option>
            <option value="ohlc">OHLC</option>
            <option value="historical">Historical candles</option>
            <option value="gainers-losers">Top gainers / losers</option>
            <option value="instruments">Instrument master</option>
          </select>
          {renderMarketFields()}
          <button className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 px-5 rounded-xl" disabled={loading} onClick={runMarket}>{loading ? 'Loading...' : 'Get data'}</button>
        </div>}
      </section>
      <section className="bg-slate-900 border border-slate-700 rounded-2xl p-5 min-h-80 min-w-0">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-4">{resultTitle || 'API response'}</p>
        {result ? <ApiResponseView title={resultTitle} response={result} meta={resultMeta} /> : <p className="text-slate-500 text-sm">Use a button to load data here.</p>}
      </section>
    </div>
  </div>
}
