/**
 * Arjuna — moving-average crossover, long only.
 *
 * ── What it does, in plain words ───────────────────────────────────────────
 *
 * Keep two running averages of a stock's price:
 *
 *   fast (5 bars)   reacts quickly to new prices
 *   slow (15 bars)  steady, smooths out the noise
 *
 * When the fast average rises THROUGH the slow one, recent prices are pulling
 * away from the longer trend — read as the start of an upward move, so BUY.
 * When it falls back THROUGH the slow one, that move is over, so SELL.
 *
 * Two safety rails apply while a position is held, and they are checked BEFORE
 * the crossover, because getting out of a loser matters more than being elegant
 * about it:
 *
 *   stop-loss    −1.5% from the entry price  → sell, cut the loss
 *   take-profit  +3.0% from the entry price  → sell, bank the gain
 *
 * ── Why it is built this way ───────────────────────────────────────────────
 *
 * Long only: buy then sell, never sell-then-buy. Short selling needs margin and
 * carries unlimited loss, which does not belong in a demo.
 *
 * The CROSSING is what matters, not which average is higher. "fast is above
 * slow" is true for as long as a trend lasts and would re-trigger a buy on
 * every single bar. A cross is the moment the relationship flips, so it fires
 * once. Detecting it needs the PREVIOUS bar's averages too, which is why this
 * wants slowPeriod + 1 bars before it will act.
 *
 * This module is deliberately pure: given a price history it returns a
 * decision, and it reads no clock, no database and no network. That is what
 * makes it testable against hand-built price series, which is how the rules
 * below are verified.
 */

/** Tunable in one place, and reported to the UI so the numbers on screen match. */
export const PARAMS = {
  fastPeriod: 5,
  slowPeriod: 15,
  stopLossPercent: 1.5,
  takeProfitPercent: 3,
  /** Never hold more than this many stocks at once — spreads the risk. */
  maxPositions: 4,
};

/**
 * Simple moving average of the LAST `period` values.
 * Returns null when there is not enough history, rather than averaging
 * whatever happens to be there and quietly producing a meaningless number.
 */
export const sma = (values, period) => {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const window = values.slice(-period);
  return window.reduce((total, value) => total + value, 0) / period;
};

/** How many bars are needed before any decision can be made. */
export const warmupBars = (params = PARAMS) => params.slowPeriod + 1;

/**
 * Decide what to do with ONE stock.
 *
 * @param {number[]} prices    oldest → newest, in rupees
 * @param {object|null} position  { quantity, averagePrice } if currently held
 * @returns {{ action, reason, fast, slow, fastPrev, slowPrev, changePercent }}
 *          action is 'BUY' | 'SELL' | 'HOLD'; `reason` is a short code the UI
 *          turns into a sentence, so the trade log can always say WHY.
 */
export const decide = (prices, position = null, params = PARAMS) => {
  const { fastPeriod, slowPeriod, stopLossPercent, takeProfitPercent } = params;

  const fast = sma(prices, fastPeriod);
  const slow = sma(prices, slowPeriod);

  // The previous bar's averages, for cross detection.
  const earlier = prices.slice(0, -1);
  const fastPrev = sma(earlier, fastPeriod);
  const slowPrev = sma(earlier, slowPeriod);

  const last = prices.at(-1) ?? null;
  const base = { fast, slow, fastPrev, slowPrev, price: last };

  if (fast === null || slow === null || fastPrev === null || slowPrev === null) {
    return {
      ...base,
      action: 'HOLD',
      reason: 'warming_up',
      barsNeeded: warmupBars(params) - prices.length,
    };
  }

  // ── Holding: the safety rails come first ────────────────────────────────
  if (position && position.quantity > 0) {
    const entry = position.averagePrice;
    const changePercent = entry ? ((last - entry) / entry) * 100 : 0;

    if (changePercent <= -stopLossPercent) {
      return { ...base, action: 'SELL', reason: 'stop_loss', changePercent };
    }
    if (changePercent >= takeProfitPercent) {
      return { ...base, action: 'SELL', reason: 'take_profit', changePercent };
    }
    // Trend over: the fast average has dropped back through the slow one.
    if (fastPrev >= slowPrev && fast < slow) {
      return { ...base, action: 'SELL', reason: 'trend_exit', changePercent };
    }
    return { ...base, action: 'HOLD', reason: 'riding_trend', changePercent };
  }

  // ── Flat: look for an entry ─────────────────────────────────────────────
  if (fastPrev <= slowPrev && fast > slow) {
    return { ...base, action: 'BUY', reason: 'golden_cross' };
  }

  return { ...base, action: 'HOLD', reason: fast > slow ? 'already_trending' : 'no_signal' };
};

/**
 * How many shares to buy.
 *
 * Each position is capped at an equal slice of the allotted capital, so one
 * stock cannot absorb everything. Whole shares only — NSE cash does not deal
 * in fractions — so this floors, and returns 0 when a single share costs more
 * than the slice, which the caller reports rather than silently skipping.
 */
export const positionSize = (capitalRupees, price, params = PARAMS) => {
  if (!(price > 0) || !(capitalRupees > 0)) return 0;
  const slice = capitalRupees / params.maxPositions;
  return Math.floor(slice / price);
};

/** Short sentences for the UI, keyed by the codes above. */
export const REASON_TEXT = {
  warming_up: 'Collecting enough price history to judge the trend',
  no_signal: 'Fast average still below the slow one — no entry',
  already_trending: 'Trend already underway; waiting for the next fresh crossover',
  golden_cross: 'Fast average crossed above the slow one — trend turning up',
  riding_trend: 'Holding while the trend lasts',
  trend_exit: 'Fast average fell back below the slow one — trend over',
  stop_loss: 'Price fell past the stop-loss — cutting the loss',
  take_profit: 'Hit the take-profit target — banking the gain',
  insufficient_capital: 'One share costs more than this position is allowed',
  max_positions: 'Already holding the maximum number of stocks',
  market_closed: 'Market closed — prices are simulated from the last real close',
};
