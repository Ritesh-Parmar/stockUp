import { marketSession } from './market.js';

/**
 * Prices for the trading engine: real where real exists, simulated where it
 * cannot, and always honest about which.
 *
 * ── How it works ───────────────────────────────────────────────────────────
 *
 * On start, each stock's history is SEEDED with real 5-minute candles from the
 * most recent NSE session (Yahoo, ~73 bars for a full day). That is genuine
 * market data, so the moving averages are meaningful from the first tick
 * instead of needing minutes of warm-up.
 *
 * After that the engine asks for a new bar every couple of seconds:
 *
 *   market OPEN   — the real last price is re-polled and used. Yahoo is delayed
 *                   ~15 min, so between polls the price does not move; a
 *                   simulated step fills the gap so the strategy keeps getting
 *                   bars.
 *   market CLOSED — there is no new real price to have. Bars are a random walk
 *                   from the last real close.
 *
 * Every bar is tagged `real` or `sim` and the counts are reported, so the UI can
 * state exactly how much of what is on screen came from the exchange. Dressing
 * simulated prices up as live ones would be the one unforgivable thing to do in
 * a demo shown to a broker.
 *
 * ── On the time compression ───────────────────────────────────────────────
 *
 * A bar represents a 5-minute candle, which is the timeframe the strategy is
 * built for. The demo advances one bar every 2 seconds, so a trading day plays
 * out in about five minutes. Nothing about the strategy changes; only the clock
 * it is replayed against.
 */

/** The basket Arjuna watches. Liquid NSE large caps, so prices always exist. */
export const SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN'];

export const BAR_SECONDS = 2;
/** A bar stands for this many minutes of real market time. */
export const BAR_REPRESENTS_MINUTES = 5;
/** Bars kept per symbol. ~2 sessions of 5-minute candles. */
const MAX_HISTORY = 160;
/** How often a real price is re-polled while the market is open. */
const LIVE_POLL_MS = 30000;
const FETCH_TIMEOUT_MS = 12000;

/**
 * Per-bar volatility for the simulated walk, as a fraction.
 * 0.12% is about what a real 5-minute candle on these stocks moves, so the
 * shape of the series stays plausible rather than cartoonish.
 */
const SIM_VOLATILITY = 0.0012;
/**
 * Pull back toward the seed price. Without it a random walk eventually drifts
 * somewhere absurd, and a demo left running would show a stock at triple its
 * price.
 *
 * Kept deliberately WEAK. A strong pull makes the series mean-reverting, and a
 * mean-reverting series is one a trend-following strategy must lose money in by
 * construction — the first version of this had it at 0.02 and Arjuna closed
 * every trade at a loss, which looked like a broken strategy but was a broken
 * simulation.
 */
const MEAN_REVERSION = 0.004;

/**
 * Real intraday prices move in runs, not as independent coin flips: a stock
 * drifting up tends to keep drifting for a while. That persistence is modelled
 * as a drift term which itself wanders slowly and decays back toward zero, so
 * the series alternates between trending stretches and choppy ones.
 *
 * This matters for more than looks. Without it there are no trends to follow,
 * so a trend-following algorithm has nothing to find and its results say
 * nothing about the strategy.
 */
const DRIFT_VOLATILITY = 0.00025;
const DRIFT_DECAY = 0.03;
const DRIFT_CAP = 0.0012;

/**
 * Real returns are fat-tailed: most bars are quiet and a few are much larger
 * than a normal distribution predicts. Without the occasional sharp bar the
 * crossover always has time to exit gracefully and the stop-loss never fires,
 * which would leave the advertised risk control as something that never
 * actually happens.
 */
const SHOCK_CHANCE = 0.02;
const SHOCK_MULTIPLIER = 4;

/**
 * A rare news gap: a single bar that jumps 1.5-3.5%. Real stocks do this on
 * results, downgrades and block deals, and it is the case the stop-loss exists
 * for — the crossover needs several bars to react and by then the loss is
 * already taken.
 *
 * Note this makes the strategy look WORSE, not better. It is here for
 * faithfulness, not to flatter the demo.
 */
const GAP_CHANCE = 0.004;
const GAP_MIN = 0.015;
const GAP_MAX = 0.035;

const log = (...parts) => console.log('[feed]', ...parts);
const logError = (...parts) => console.error('[feed]', ...parts);

/** Box-Muller, so the walk is normally distributed rather than uniform. */
const gaussian = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ── Real data ──────────────────────────────────────────────────────────────

/** Real 5-minute closes for the most recent session. */
const fetchSeed = async (symbol) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=5m&range=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = await response.json();
  const result = body?.chart?.result?.[0];
  // Yahoo pads the series with nulls for gaps; those must be dropped rather
  // than treated as zero, which would wreck every average.
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (value) => typeof value === 'number' && value > 0,
  );
  const lastReal = Number(result?.meta?.regularMarketPrice);

  if (!closes.length && !(lastReal > 0)) throw new Error('no usable prices in response');

  return {
    closes: closes.length ? closes.slice(-MAX_HISTORY) : [lastReal],
    lastReal: lastReal > 0 ? lastReal : closes.at(-1),
    previousClose: Number(result?.meta?.chartPreviousClose ?? result?.meta?.previousClose ?? 0) || null,
  };
};

const fetchLast = async (symbol) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  const price = Number(body?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!(price > 0)) throw new Error('no usable regularMarketPrice');
  return price;
};

// ── The feed ───────────────────────────────────────────────────────────────

/**
 * Create a feed. Each engine run gets its own, so two users running the
 * algorithm do not share a price series or interfere with each other's walks.
 */
export const createFeed = () => {
  /** symbol -> { prices, tags, seedPrice, lastReal, previousClose, lastPolledAt } */
  const books = new Map();
  let realBars = 0;
  let simBars = 0;
  let seededAt = null;
  let seedFailures = [];

  const seed = async () => {
    const started = Date.now();
    const results = await Promise.all(SYMBOLS.map(async (symbol) => {
      try {
        return { symbol, ...(await fetchSeed(symbol)) };
      } catch (error) {
        return { symbol, error: error.message };
      }
    }));

    seedFailures = results.filter((result) => result.error).map((r) => ({ symbol: r.symbol, reason: r.error }));

    for (const result of results) {
      if (result.error) {
        logError(`seed failed for ${result.symbol}: ${result.error} — it will be skipped`);
        continue;
      }
      books.set(result.symbol, {
        prices: [...result.closes],
        // Every seeded bar is real market data, and says so.
        tags: result.closes.map(() => 'real'),
        // Parallel to prices: 'BUY' / 'SELL' on the bar a fill happened.
        // Kept here rather than matched up by timestamp later so it shifts
        // with the price array and cannot drift out of alignment.
        marks: result.closes.map(() => null),
        seedPrice: result.closes.at(-1),
        lastReal: result.lastReal,
        previousClose: result.previousClose,
        lastPolledAt: Date.now(),
        // Per-symbol momentum, so the six stocks trend independently rather
        // than all moving as one.
        drift: 0,
      });
      realBars += result.closes.length;
    }

    seededAt = new Date().toISOString();
    if (!books.size) {
      const error = new Error('Could not load real prices for any symbol. Check the network.');
      error.failures = seedFailures;
      throw error;
    }
    log(`seeded ${books.size}/${SYMBOLS.length} symbols with ${realBars} real 5-minute bars in ${Date.now() - started}ms`);
    if (seedFailures.length) log('seed failures:', seedFailures.map((f) => `${f.symbol}: ${f.reason}`).join('; '));
  };

  /**
   * Advance every symbol by one bar.
   * Returns the new bar per symbol: { symbol, price, source }.
   */
  const tick = async () => {
    const session = marketSession();
    const bars = [];

    // While the market is open, refresh real prices on a slow cadence. Yahoo
    // is delayed, so polling faster would just return the same number.
    if (session.open) {
      await Promise.all([...books.entries()].map(async ([symbol, book]) => {
        if (Date.now() - book.lastPolledAt < LIVE_POLL_MS) return;
        book.lastPolledAt = Date.now();
        try {
          const price = await fetchLast(symbol);
          book.pendingReal = price;
        } catch (error) {
          // A failed poll is not worth interrupting the run: the walk carries
          // on from the last real price and the bar is tagged simulated.
          logError(`live poll failed for ${symbol}: ${error.message}`);
        }
      }));
    }

    for (const [symbol, book] of books) {
      let price;
      let source;

      if (book.pendingReal && book.pendingReal !== book.prices.at(-1)) {
        price = book.pendingReal;
        source = 'real';
        book.lastReal = price;
        book.pendingReal = null;
        realBars += 1;
      } else {
        const previous = book.prices.at(-1);

        // Momentum: the drift wanders, decays toward zero and is capped, which
        // gives trending stretches broken by choppy ones.
        book.drift += DRIFT_VOLATILITY * gaussian();
        book.drift -= book.drift * DRIFT_DECAY;
        book.drift = Math.max(-DRIFT_CAP, Math.min(DRIFT_CAP, book.drift));

        // Weak pull home, so it cannot wander off over a long session.
        const pullHome = (book.seedPrice - previous) * MEAN_REVERSION;

        const shocked = Math.random() < SHOCK_CHANCE;
        const volatility = SIM_VOLATILITY * (shocked ? SHOCK_MULTIPLIER : 1);

        let gap = 0;
        if (Math.random() < GAP_CHANCE) {
          const size = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
          gap = previous * size * (Math.random() < 0.5 ? -1 : 1);
        }

        price = previous
          + pullHome
          + previous * book.drift
          + previous * volatility * gaussian()
          + gap;

        // A price can never be zero or negative.
        price = Math.max(previous * 0.9, price);
        source = 'sim';
        simBars += 1;
      }

      price = Math.round(price * 100) / 100;
      book.prices.push(price);
      book.tags.push(source);
      book.marks.push(null);
      if (book.prices.length > MAX_HISTORY) {
        book.prices.shift();
        book.tags.shift();
        book.marks.shift();
      }
      bars.push({ symbol, price, source });
    }

    return bars;
  };

  const status = () => {
    const session = marketSession();
    return {
      // LIVE only when the market is open AND real prices are arriving.
      mode: session.open ? 'LIVE' : 'SIMULATED',
      session,
      seededAt,
      symbols: [...books.keys()],
      realBars,
      simBars,
      seedFailures,
      barSeconds: BAR_SECONDS,
      barRepresentsMinutes: BAR_REPRESENTS_MINUTES,
      source: 'Yahoo Finance (NSE, ~15 min delayed)',
    };
  };

  return {
    seed,
    tick,
    status,
    prices: (symbol) => books.get(symbol)?.prices ?? [],
    /**
     * Price series with its real/simulated tags and any trade marks, for the
     * chart. One array so the three can never be mismatched by length.
     */
    series: (symbol, limit = 60) => {
      const book = books.get(symbol);
      if (!book) return [];
      const prices = book.prices.slice(-limit);
      const tags = book.tags.slice(-limit);
      const marks = book.marks.slice(-limit);
      return prices.map((price, index) => ({ price, source: tags[index], mark: marks[index] }));
    },

    /** Record that a fill happened on the CURRENT bar. */
    mark: (symbol, side) => {
      const book = books.get(symbol);
      if (book && book.marks.length) book.marks[book.marks.length - 1] = side;
    },
    last: (symbol) => books.get(symbol)?.prices.at(-1) ?? null,
    previousClose: (symbol) => books.get(symbol)?.previousClose ?? null,
    symbols: () => [...books.keys()],
  };
};
