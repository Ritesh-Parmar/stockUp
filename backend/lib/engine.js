import { createFeed, BAR_SECONDS, BAR_REPRESENTS_MINUTES } from './priceFeed.js';
import { PARAMS, REASON_TEXT, decide, positionSize, sma, warmupBars } from './strategy.js';
import {
  fill, markToMarket, openPositions, ordersForRun, resetPositions,
  runSummary, toRupees, tradesForRun,
} from './paperBroker.js';
import { getUser } from './accounts.js';
import { isoStamp } from './dates.js';

/**
 * The trading engine: one loop per active run.
 *
 * Every BAR_SECONDS it asks the feed for a new bar, hands each symbol's history
 * to the strategy, and executes whatever the strategy decides through the paper
 * broker. Nothing here talks to mStock — see paperBroker.js for where the live
 * seam would go.
 *
 * ── Why engines are keyed by run id ───────────────────────────────────────
 *
 * A run already represents "this user, this algorithm, this browser session"
 * and is stopped by logout, session expiry, a lost heartbeat or a restart. The
 * engine simply follows it: start a run, an engine appears; stop the run, the
 * engine is torn down. That means the existing three stop mechanisms govern the
 * engine too, with no extra bookkeeping to get out of step.
 *
 * ── Why state lives in memory ─────────────────────────────────────────────
 *
 * The price series and decision log are per-run and worthless after it ends,
 * so they stay in memory alongside the credential vault. What MUST survive —
 * orders, trades, positions — is written to SQLite as it happens. A restart
 * therefore loses the chart but never a fill, which is the right side to fail
 * on.
 */

/** runId -> engine */
const engines = new Map();
/** How many decisions to keep for the activity feed. */
const DECISION_LOG = 60;

const log = (...parts) => console.log('[engine]', ...parts);
const logError = (...parts) => console.error('[engine]', ...parts);

const startEngine = async ({ run, user }) => {
  const feed = createFeed();
  const state = {
    runId: run.id,
    userId: user.id,
    algoId: run.algo_id,
    startedAt: run.started_at,
    // Capital the user allotted on the Amount page. A sensible default rather
    // than zero, or the engine would compute a position size of 0 and do
    // nothing with no explanation.
    capitalRupees: user.capital_paise > 0 ? toRupees(user.capital_paise) : 100000,
    capitalWasDefaulted: !(user.capital_paise > 0),
    bars: 0,
    decisions: [],
    lastTickAt: null,
    lastError: null,
    timer: null,
    stopping: false,
    feed,
  };

  // A fresh run starts flat, so the P&L on screen belongs to THIS run rather
  // than carrying over yesterday's open positions.
  resetPositions(user.id, run.algo_id);

  await feed.seed();
  const status = feed.status();
  log(`run ${run.id} (user ${user.id}) seeded ${status.symbols.length} symbols, `
    + `${status.realBars} real bars, mode ${status.mode}, capital Rs ${state.capitalRupees}`);

  const tick = async () => {
    if (state.stopping) return;
    try {
      await feed.tick();
      state.bars += 1;
      state.lastTickAt = isoStamp();

      const held = new Map(
        openPositions(user.id, run.algo_id).map((position) => [position.tradingsymbol, position]),
      );

      // Mark open positions at the new prices before deciding, so stop-loss and
      // take-profit are judged against the price the strategy is looking at.
      const prices = Object.fromEntries(feed.symbols().map((symbol) => [symbol, feed.last(symbol)]));
      markToMarket({ userId: user.id, algoId: run.algo_id, prices });

      for (const symbol of feed.symbols()) {
        const history = feed.prices(symbol);
        const position = held.get(symbol);
        const verdict = decide(
          history,
          position ? { quantity: position.quantity, averagePrice: toRupees(position.average_paise) } : null,
        );

        if (verdict.action === 'BUY') {
          // Cap concurrent holdings. Checked here rather than in the strategy
          // because it is a portfolio rule, not a view on this one stock.
          if (held.size >= PARAMS.maxPositions) {
            record(state, symbol, { ...verdict, action: 'HOLD', reason: 'max_positions' });
            continue;
          }
          const quantity = positionSize(state.capitalRupees, verdict.price);
          if (quantity < 1) {
            record(state, symbol, { ...verdict, action: 'HOLD', reason: 'insufficient_capital' });
            continue;
          }
          fill({
            userId: user.id, algoId: run.algo_id, runId: run.id,
            symbol, side: 'BUY', quantity, price: verdict.price, reason: verdict.reason,
          });
          held.set(symbol, { quantity, average_paise: 0, tradingsymbol: symbol });
          feed.mark(symbol, 'BUY');
          record(state, symbol, { ...verdict, quantity, executed: true });
          log(`run ${run.id} BUY ${quantity} ${symbol} @ ${verdict.price} (${verdict.reason})`);
          continue;
        }

        if (verdict.action === 'SELL' && position) {
          fill({
            userId: user.id, algoId: run.algo_id, runId: run.id,
            symbol, side: 'SELL', quantity: position.quantity, price: verdict.price, reason: verdict.reason,
          });
          held.delete(symbol);
          feed.mark(symbol, 'SELL');
          record(state, symbol, { ...verdict, quantity: position.quantity, executed: true });
          log(`run ${run.id} SELL ${position.quantity} ${symbol} @ ${verdict.price} (${verdict.reason})`);
          continue;
        }

        record(state, symbol, verdict);
      }

      state.lastError = null;
    } catch (error) {
      // One bad tick must not kill the run: log it, surface it to the UI, and
      // try again on the next bar.
      state.lastError = error.message;
      logError(`run ${run.id} tick failed: ${error.message}`);
    }
  };

  // Tick once immediately so the UI has something the moment it opens, then
  // settle into the interval.
  await tick();
  state.timer = setInterval(tick, BAR_SECONDS * 1000);

  engines.set(run.id, state);
  return state;
};

/** Keep only executed trades and the most recent decisions. */
const record = (state, symbol, verdict) => {
  state.decisions.unshift({
    at: isoStamp(),
    bar: state.bars,
    symbol,
    action: verdict.action,
    reason: verdict.reason,
    text: REASON_TEXT[verdict.reason] ?? verdict.reason,
    price: verdict.price,
    fast: verdict.fast,
    slow: verdict.slow,
    quantity: verdict.quantity ?? null,
    executed: Boolean(verdict.executed),
    changePercent: verdict.changePercent ?? null,
  });
  if (state.decisions.length > DECISION_LOG) state.decisions.length = DECISION_LOG;
};

/**
 * Start an engine for a run, if one is not already running.
 * Seeding hits the network, so this is async — the caller decides whether to
 * wait for it.
 */
export const ensureEngine = async ({ run, userId }) => {
  if (engines.has(run.id)) return engines.get(run.id);
  const user = getUser(userId);
  if (!user) throw new Error(`no such user: ${userId}`);
  return startEngine({ run, user });
};

export const stopEngine = (runId) => {
  const state = engines.get(runId);
  if (!state) return false;
  state.stopping = true;
  clearInterval(state.timer);
  engines.delete(runId);
  log(`run ${runId} engine stopped after ${state.bars} bars`);
  return true;
};

/** Tear down any engine whose run is no longer active. */
export const reconcileEngines = (activeRunIds) => {
  const active = new Set(activeRunIds);
  const stopped = [];
  for (const runId of engines.keys()) {
    if (!active.has(runId)) {
      stopEngine(runId);
      stopped.push(runId);
    }
  }
  return stopped;
};

export const engineFor = (runId) => engines.get(runId) ?? null;
export const engineCount = () => engines.size;

/**
 * Everything the live dashboard needs, in one object.
 * Assembled here rather than in the route so the shape stays next to the state
 * that produces it.
 */
export const engineSnapshot = (runId, { historyBars = 60 } = {}) => {
  const state = engines.get(runId);
  if (!state) return null;

  const { feed } = state;
  const positions = new Map(
    openPositions(state.userId, state.algoId).map((position) => [position.tradingsymbol, position]),
  );

  const symbols = feed.symbols().map((symbol) => {
    const history = feed.prices(symbol);
    const position = positions.get(symbol);
    const last = feed.last(symbol);
    const previousClose = feed.previousClose(symbol);

    return {
      symbol,
      last,
      previousClose,
      dayChangePercent: previousClose ? ((last - previousClose) / previousClose) * 100 : null,
      fast: sma(history, PARAMS.fastPeriod),
      slow: sma(history, PARAMS.slowPeriod),
      // The chart needs the series with its real/simulated tags.
      series: feed.series(symbol, historyBars),
      fastSeries: smaSeries(history, PARAMS.fastPeriod, historyBars),
      slowSeries: smaSeries(history, PARAMS.slowPeriod, historyBars),
      position: position
        ? {
          quantity: position.quantity,
          averagePaise: position.average_paise,
          lastPricePaise: position.last_price_paise,
          unrealisedPaise: position.unrealised_pnl_paise,
          realisedPaise: position.realised_pnl_paise,
          changePercent: position.average_paise
            ? ((position.last_price_paise - position.average_paise) / position.average_paise) * 100
            : 0,
        }
        : null,
    };
  });

  return {
    run: {
      id: state.runId,
      algoId: state.algoId,
      startedAt: state.startedAt,
      bars: state.bars,
      lastTickAt: state.lastTickAt,
      lastError: state.lastError,
    },
    capital: {
      rupees: state.capitalRupees,
      wasDefaulted: state.capitalWasDefaulted,
      perPosition: state.capitalRupees / PARAMS.maxPositions,
    },
    feed: feed.status(),
    strategy: {
      name: 'Moving average crossover',
      params: PARAMS,
      warmupBars: warmupBars(),
      barSeconds: BAR_SECONDS,
      barRepresentsMinutes: BAR_REPRESENTS_MINUTES,
    },
    symbols,
    decisions: state.decisions,
    trades: tradesForRun(state.runId, 50),
    orders: ordersForRun(state.runId, 50),
    summary: runSummary(state.userId, state.algoId, state.runId),
  };
};

/**
 * Rolling SMA aligned with the price series the chart draws, so point N of the
 * average lines up with point N of the price. Leading points are null, which is
 * honest — there is no average before there is enough history.
 */
const smaSeries = (history, period, limit) => {
  const out = [];
  for (let index = 0; index < history.length; index += 1) {
    out.push(index + 1 >= period ? sma(history.slice(0, index + 1), period) : null);
  }
  return out.slice(-limit);
};
