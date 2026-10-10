/**
 * Market ticker feed for the top bar.
 *
 * Two sources, in order of preference:
 *
 *   1. mStock OHLC — real-time broker prices, but needs a signed-in session.
 *      OHLC rather than LTP because it carries the previous close, which is
 *      what makes change and change-% possible.
 *   2. Yahoo Finance — no key, no auth, HTTPS, but DELAYED (typically ~15 min
 *      for Indian markets). Used when signed out, and as a fallback if the
 *      mStock call fails, so the bar is never empty.
 *
 * Failures are deliberately non-fatal for the UI but never silent: every one is
 * logged with a `[ticker]` prefix and returned in `failures` so the point of
 * failure is visible in the backend log. Grep the log with:  [ticker]
 */

// mStock addresses quotes as EXCHANGE:TRADINGSYMBOL-INSTRUMENTTYPE. Verified
// against a real scriptmaster: token 22 is tradingsymbol ACC / type EQ on NSE,
// and the quote API calls it NSE:ACC-EQ. Yahoo uses SYMBOL.NS for NSE.
const SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN',
  'BHARTIARTL', 'ITC', 'LT', 'AXISBANK', 'KOTAKBANK', 'HINDUNILVR',
];

export const TICKER_SYMBOLS = SYMBOLS.map((symbol) => `NSE:${symbol}-EQ`);

const CACHE_MS = 15000;
const YAHOO_TIMEOUT_MS = 10000;
const caches = { mstock: { at: 0, quotes: [] }, yahoo: { at: 0, quotes: [] } };

const log = (...parts) => console.log('[ticker]', ...parts);
const logError = (...parts) => console.error('[ticker]', ...parts);

const quote = (symbol, last, previousClose) => {
  const change = previousClose ? last - previousClose : 0;
  return {
    symbol,
    last,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
  };
};

const fresh = (source) => Date.now() - caches[source].at < CACHE_MS && caches[source].quotes.length;

// ── mStock ─────────────────────────────────────────────────────────────────
const fromMStock = async (client) => {
  const startedAt = Date.now();
  const response = await client.getOHLC(TICKER_SYMBOLS);
  const entries = Object.entries(response?.data ?? {});

  if (!entries.length) {
    // A 200 with no data usually means the symbol format was rejected — worth
    // seeing the shape rather than just "0 quotes".
    logError(`mstock returned no quotes for ${TICKER_SYMBOLS.length} symbols in ${Date.now() - startedAt}ms.`,
      'response keys:', Object.keys(response ?? {}).join(',') || '(none)');
    return { quotes: [], failures: [{ scope: 'all', reason: 'empty data object in mStock response' }] };
  }

  const quotes = [];
  const failures = [];
  for (const [key, value] of entries) {
    const symbol = key.split(':').pop().replace(/-(EQ|A)$/, '');
    const last = Number(value?.last_price ?? 0);
    const previousClose = Number(value?.ohlc?.close ?? 0);
    if (!Number.isFinite(last) || last <= 0) {
      failures.push({ symbol, reason: `no usable last_price (got ${JSON.stringify(value?.last_price)})` });
      continue;
    }
    if (!previousClose) failures.push({ symbol, reason: 'missing ohlc.close — change shown as 0' });
    quotes.push(quote(symbol, last, previousClose));
  }

  const took = Date.now() - startedAt;
  if (failures.length) {
    log(`mstock partial: ${quotes.length}/${entries.length} usable in ${took}ms —`,
      failures.map((failure) => `${failure.symbol}: ${failure.reason}`).join('; '));
  } else {
    log(`mstock ok: ${quotes.length} quotes in ${took}ms`);
  }
  return { quotes, failures };
};

// ── Yahoo ──────────────────────────────────────────────────────────────────
// The batch endpoint (/v7/finance/quote) answers 401 without a session crumb,
// so each symbol is fetched on its own — 12 in parallel land in ~450ms.
const yahooSymbol = async (symbol) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`;
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return { symbol, reason: timedOut ? `timeout after ${YAHOO_TIMEOUT_MS}ms` : `network: ${error.message}` };
  }

  if (!response.ok) return { symbol, reason: `HTTP ${response.status} ${response.statusText || ''}`.trim() };

  let body;
  try {
    body = await response.json();
  } catch (error) {
    return { symbol, reason: `unparseable JSON: ${error.message}` };
  }

  const apiError = body?.chart?.error;
  if (apiError) return { symbol, reason: `yahoo error: ${apiError.code ?? ''} ${apiError.description ?? ''}`.trim() };

  const meta = body?.chart?.result?.[0]?.meta;
  if (!meta) return { symbol, reason: 'no meta in payload (shape changed?)' };

  const last = Number(meta.regularMarketPrice);
  if (!Number.isFinite(last) || last <= 0) {
    return { symbol, reason: `no usable regularMarketPrice (got ${JSON.stringify(meta.regularMarketPrice)})` };
  }
  return { quote: quote(symbol, last, Number(meta.chartPreviousClose ?? meta.previousClose ?? 0)) };
};

const fromYahoo = async () => {
  const startedAt = Date.now();
  const results = await Promise.all(SYMBOLS.map(yahooSymbol));
  const quotes = results.filter((result) => result.quote).map((result) => result.quote);
  const failures = results.filter((result) => !result.quote);
  const took = Date.now() - startedAt;

  const detail = failures.map((failure) => `${failure.symbol}: ${failure.reason}`).join('; ');
  if (!quotes.length) {
    logError(`yahoo FAILED: 0/${SYMBOLS.length} in ${took}ms — ${detail}`);
  } else if (failures.length) {
    log(`yahoo partial: ${quotes.length}/${SYMBOLS.length} in ${took}ms — ${detail}`);
  } else {
    log(`yahoo ok: ${quotes.length} quotes in ${took}ms`);
  }
  return { quotes, failures };
};

/**
 * @param {object|null} client authenticated MConnect, or null when signed out
 * @returns {{ quotes, source, delayed, cached, fetchedAt, failures }}
 */
export const getTickerQuotes = async (client) => {
  const failures = [];

  if (client) {
    if (fresh('mstock')) {
      return { quotes: caches.mstock.quotes, source: 'mstock', delayed: false, cached: true, fetchedAt: new Date(caches.mstock.at).toISOString(), failures: [] };
    }
    try {
      const result = await fromMStock(client);
      failures.push(...result.failures.map((failure) => ({ ...failure, source: 'mstock' })));
      if (result.quotes.length) {
        caches.mstock = { at: Date.now(), quotes: result.quotes };
        return { quotes: result.quotes, source: 'mstock', delayed: false, cached: false, fetchedAt: new Date().toISOString(), failures };
      }
      logError('mstock produced no usable quotes — falling back to yahoo');
    } catch (error) {
      // Expired token or a broker hiccup shouldn't blank the bar — drop to Yahoo,
      // but say exactly why in the log.
      logError('mstock FAILED, falling back to yahoo:', error.message);
      failures.push({ source: 'mstock', scope: 'all', reason: error.message });
    }
  }

  if (fresh('yahoo')) {
    return { quotes: caches.yahoo.quotes, source: 'yahoo', delayed: true, cached: true, fetchedAt: new Date(caches.yahoo.at).toISOString(), failures };
  }

  const result = await fromYahoo();
  failures.push(...result.failures.map((failure) => ({ ...failure, source: 'yahoo' })));
  if (!result.quotes.length) {
    logError(`ALL SOURCES FAILED — ${failures.length} failure(s) recorded. The bar will keep showing its last known prices.`);
    const error = new Error('No market data available from mStock or Yahoo.');
    error.failures = failures;
    throw error;
  }
  caches.yahoo = { at: Date.now(), quotes: result.quotes };
  return { quotes: result.quotes, source: 'yahoo', delayed: true, cached: false, fetchedAt: new Date().toISOString(), failures };
};
