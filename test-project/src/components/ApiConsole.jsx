import { useState } from 'react'
import { AlertCircle, BarChart3, Wallet } from 'lucide-react'
import ApiResponseView from './ApiResponseView'
import { postApi } from '../lib/mstockApi'

// position_type must be lowercase 'day' | 'overnight' — the API rejects 'DAY'.
const blankConversion = { tradingsymbol: '', exchange: 'NSE', transaction_type: 'BUY', position_type: 'day', quantity: '1', old_product: 'CNC', new_product: 'MIS' }
const blankGainersLosers = { Exchange: '1', SecurityIdCode: '13', segment: '1', TypeFlag: 'G' }
const EXCHANGES = ['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX']
const INTERVALS = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day']

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

/**
 * ApiConsole — every authenticated mStock call the app can make.
 *
 * There is no demo branch here on purpose. Signing in with the demo account
 * (123/123/123) is handled entirely in the backend, so this component makes the
 * same requests for a demo session as for a real one.
 */
export default function ApiConsole({ accessToken = '', apiKey = '' }) {
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
      if (!accessToken || !apiKey) throw new Error('This session has no access token. Sign in again.')
      const data = await postApi(path, { access_token: accessToken, api_key: apiKey, ...body })
      setResult(data.data); setResultTitle(title); setResultMeta(meta)
    }
    catch (err) { setError(err.message || 'The request could not be completed.') }
    finally { setLoading(false) }
  }

  const marketSymbols = symbols.split(/[\n,]+/).map((symbol) => symbol.trim()).filter(Boolean)
  const setObjectValue = (setter, field) => (event) => setter((current) => ({ ...current, [field]: event.target.value }))
  const buttonClass = 'rounded-xl px-3 py-2 text-sm font-medium bg-raised hover:bg-raised disabled:opacity-50 text-ink'

  const renderPortfolio = () => <div className="space-y-4"><div className="flex flex-col gap-3">{PORTFOLIO_ACTIONS.map(([operation, label]) => <button key={operation} className={buttonClass} disabled={loading} onClick={() => run(`/portfolio/${operation}`, {}, label)}>{label}</button>)}</div><details className="bg-warn/5 border border-warn/25 rounded-xl p-4"><summary className="cursor-pointer text-warn font-medium text-sm">Convert position (changes an existing position)</summary><p className="text-ink-2 text-xs mt-2 mb-3">This is an action, not a data request. Check every value before submitting.</p><div className="grid sm:grid-cols-2 gap-3">{Object.entries(conversion).map(([field, value]) => <label key={field} className="flex flex-col gap-1 text-xs text-ink-2">{field.replaceAll('_', ' ')}<input value={value} onChange={setObjectValue(setConversion, field)} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" /></label>)}</div><button className="mt-3 rounded-xl px-3 py-2 text-sm font-medium bg-warn hover:bg-warn/90 disabled:opacity-50 text-ink" disabled={loading} onClick={() => { if (window.confirm('Convert this position using the values shown?')) run('/portfolio/convert', { position: conversion }, 'Position conversion result') }}>Convert position</button></details></div>

  const renderMarketFields = () => {
    if (marketAction === 'instruments') return <p className="text-ink-2 text-sm">Downloads the complete instrument master (roughly 100,000 rows). Use the filter on the results to find a symbol.</p>
    if (marketAction === 'ltp' || marketAction === 'ohlc') return <><label className="block text-sm text-ink-2 mb-2">Symbols, one per line or comma-separated</label><textarea value={symbols} onChange={(event) => setSymbols(event.target.value)} rows="3" placeholder="NSE:ACC-EQ" className="w-full p-3 bg-raised border border-edge-strong rounded-xl text-sm text-ink font-mono" /></>
    if (marketAction === 'historical') return <div className="grid sm:grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-2">Exchange<select value={historical.exchange} onChange={setObjectValue(setHistorical, 'exchange')} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink">{EXCHANGES.map((exchange) => <option key={exchange} value={exchange}>{exchange}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-ink-2">Instrument token<input value={historical.instrument_token} onChange={setObjectValue(setHistorical, 'instrument_token')} inputMode="numeric" placeholder="1660" className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" /></label>
      <label className="flex flex-col gap-1 text-xs text-ink-2">Interval<select value={historical.interval} onChange={setObjectValue(setHistorical, 'interval')} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink">{INTERVALS.map((interval) => <option key={interval} value={interval}>{interval}</option>)}</select></label>
      <div />
      <label className="flex flex-col gap-1 text-xs text-ink-2">From<input value={historical.from} type="datetime-local" onChange={setObjectValue(setHistorical, 'from')} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" /></label>
      <label className="flex flex-col gap-1 text-xs text-ink-2">To<input value={historical.to} type="datetime-local" onChange={setObjectValue(setHistorical, 'to')} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" /></label>
    </div>
    return <div className="grid sm:grid-cols-2 gap-3">{Object.entries(gainersLosers).map(([field, value]) => <label key={field} className="flex flex-col gap-1 text-xs text-ink-2">{field}<input value={value} onChange={setObjectValue(setGainersLosers, field)} className="px-3 py-2 bg-raised border border-edge-strong rounded-lg text-sm text-ink" /></label>)}</div>
  }

  const runMarket = () => {
    const bodies = { instruments: {}, ltp: { symbols: marketSymbols }, ohlc: { symbols: marketSymbols }, historical: { ...historical, from: toApiDateTime(historical.from), to: toApiDateTime(historical.to) }, 'gainers-losers': { gainersLosers } }
    const titles = { instruments: 'Instrument master', ltp: 'Last traded prices', ohlc: 'OHLC data', historical: 'Historical candle data', 'gainers-losers': gainersLosers.TypeFlag === 'G' ? 'Top gainers' : 'Top losers' }
    // The candle response has no instrument identity of its own — carry the request over.
    const meta = marketAction === 'historical'
      ? { exchange: historical.exchange, instrument_token: historical.instrument_token, interval: historical.interval }
      : null
    run(`/market/${marketAction}`, bodies[marketAction], titles[marketAction], meta)
  }

  return <div className="space-y-5">
    {error && <div className="flex gap-3 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}


    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
      <section className="bg-panel border border-edge-strong rounded-2xl p-5 h-fit">
        <div className="flex gap-5 mb-5 border-b border-edge-strong">
          <button onClick={() => setPanel('portfolio')} className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${panel === 'portfolio' ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink-2'}`}><Wallet size={16} />Portfolio</button>
          <button onClick={() => setPanel('market')} className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${panel === 'market' ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink-2'}`}><BarChart3 size={16} />Market data</button>
        </div>
        {panel === 'portfolio' ? renderPortfolio() : <div className="space-y-4">
          <select value={marketAction} onChange={(event) => setMarketAction(event.target.value)} className="w-full p-3 bg-raised border border-edge-strong rounded-xl text-sm text-ink">
            <option value="ltp">Last traded price (LTP)</option>
            <option value="ohlc">OHLC</option>
            <option value="historical">Historical candles</option>
            <option value="gainers-losers">Top gainers / losers</option>
            <option value="instruments">Instrument master</option>
          </select>
          {renderMarketFields()}
          <button className="bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink font-semibold text-sm py-2.5 px-5 rounded-xl" disabled={loading} onClick={runMarket}>{loading ? 'Loading...' : 'Get data'}</button>
        </div>}
      </section>
      <section className="bg-panel border border-edge-strong rounded-2xl p-5 min-h-80 min-w-0">
        <p className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-4">{resultTitle || 'API response'}</p>
        {result ? <ApiResponseView title={resultTitle} response={result} meta={resultMeta} /> : <p className="text-ink-3 text-sm">Use a button to load data here.</p>}
      </section>
    </div>
  </div>
}
