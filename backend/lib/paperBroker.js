import { openDb } from './db.js';
import { isoStamp } from './dates.js';

/**
 * Paper broker — executes the strategy's decisions WITHOUT touching mStock.
 *
 * ── What is real and what is not ───────────────────────────────────────────
 *
 * Real: the order row, the trade row, the position with its average price, the
 * realised and unrealised P&L arithmetic, and the fact that every one of those
 * lands in the same `algo_order` / `algo_trade` / `algo_position` tables a live
 * engine would use. The prices come from the exchange via the feed.
 *
 * Not real: nothing is sent to the broker, so no money moves and no shares
 * change hands. `broker_order_id` and `broker_trade_id` stay NULL — that is the
 * marker of a paper fill, and it is also why a real order can never be confused
 * with one of these. SQLite allows many NULLs in a UNIQUE column, so the
 * constraints on those columns still hold for real orders later.
 *
 * Swapping this for live trading means replacing `fill()` with a call to
 * mStock's placeOrder and letting the order book set the status. Everything
 * around it already works, which is the point of putting the seam here.
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * Every stored figure is INTEGER PAISE. Rupees appear only at the edges, and
 * conversion goes through these two helpers so no float ever reaches a column.
 */

export const toPaise = (rupees) => Math.round(rupees * 100);
export const toRupees = (paise) => paise / 100;

const EXCHANGE = 'NSE';
/** CNC = delivery, which is what a long-only cash strategy would really use. */
const PRODUCT = 'CNC';

/**
 * A market order filled immediately at the given price.
 *
 * A live market order suffers slippage and brokerage; both are deliberately
 * left out rather than guessed at, because an invented 0.03% would look like a
 * real cost model while being fiction. The UI says P&L is gross.
 */
export const fill = ({ userId, algoId, runId, symbol, side, quantity, price, reason }) => {
  if (!(quantity > 0)) throw new Error('quantity must be positive');
  if (!(price > 0)) throw new Error('price must be positive');

  const db = openDb();
  const now = isoStamp();
  const pricePaise = toPaise(price);

  const order = db.prepare(`
    INSERT INTO algo_order (user_id, algo_id, run_id, broker_order_id, exchange, tradingsymbol,
      transaction_type, product, order_type, validity, quantity, filled_quantity,
      price_paise, average_paise, status, status_message, placed_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'MARKET', 'DAY', ?, ?, ?, ?, 'complete', ?, ?, ?)
  `).run(
    userId, algoId, runId, EXCHANGE, symbol,
    side, PRODUCT, quantity, quantity,
    pricePaise, pricePaise, `paper fill: ${reason}`, now, now,
  );

  db.prepare(`
    INSERT INTO algo_trade (order_id, user_id, algo_id, run_id, broker_trade_id,
      exchange, tradingsymbol, side, quantity, price_paise, value_paise, traded_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.lastInsertRowid, userId, algoId, runId,
    EXCHANGE, symbol, side, quantity, pricePaise, pricePaise * quantity, now,
  );

  const position = side === 'BUY'
    ? applyBuy({ userId, algoId, symbol, quantity, pricePaise, now })
    : applySell({ userId, algoId, symbol, quantity, pricePaise, now });

  return { orderId: order.lastInsertRowid, position };
};

const getPosition = (userId, algoId, symbol) =>
  openDb().prepare(`
    SELECT * FROM algo_position
    WHERE user_id = ? AND algo_id = ? AND exchange = ? AND tradingsymbol = ?
  `).get(userId, algoId, EXCHANGE, symbol);

/**
 * Buying adds to a position and recomputes the weighted average entry price.
 *
 * The average has to be weighted by quantity: buying 10 at 100 then 90 at 200
 * averages 190, not 150. Getting that wrong would misstate every P&L figure
 * downstream, and it is the classic bug in a first position tracker.
 */
const applyBuy = ({ userId, algoId, symbol, quantity, pricePaise, now }) => {
  const db = openDb();
  const existing = getPosition(userId, algoId, symbol);

  if (!existing) {
    db.prepare(`
      INSERT INTO algo_position (user_id, algo_id, exchange, tradingsymbol, quantity,
        average_paise, last_price_paise, realised_pnl_paise, unrealised_pnl_paise, opened_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(userId, algoId, EXCHANGE, symbol, quantity, pricePaise, pricePaise, now, now);
    return getPosition(userId, algoId, symbol);
  }

  const totalQuantity = existing.quantity + quantity;
  const totalCost = existing.average_paise * existing.quantity + pricePaise * quantity;
  const average = Math.round(totalCost / totalQuantity);

  db.prepare(`
    UPDATE algo_position SET quantity = ?, average_paise = ?, last_price_paise = ?, updated_at = ?
    WHERE id = ?
  `).run(totalQuantity, average, pricePaise, now, existing.id);

  return getPosition(userId, algoId, symbol);
};

/**
 * Selling realises profit on the shares sold and leaves the average untouched
 * for whatever remains — selling does not change what the rest cost.
 */
const applySell = ({ userId, algoId, symbol, quantity, pricePaise, now }) => {
  const db = openDb();
  const existing = getPosition(userId, algoId, symbol);
  if (!existing || existing.quantity < quantity) {
    // The engine only sells what it holds, so this means its view and the
    // database disagree — worth refusing loudly rather than writing nonsense.
    throw new Error(`cannot sell ${quantity} ${symbol}: holding ${existing?.quantity ?? 0}`);
  }

  const realised = (pricePaise - existing.average_paise) * quantity;
  const remaining = existing.quantity - quantity;

  db.prepare(`
    UPDATE algo_position SET quantity = ?, last_price_paise = ?,
      realised_pnl_paise = realised_pnl_paise + ?,
      unrealised_pnl_paise = ?, updated_at = ?
    WHERE id = ?
  `).run(remaining, pricePaise, realised, 0, now, existing.id);

  return { ...getPosition(userId, algoId, symbol), realisedThisTrade: realised };
};

/** Re-price open positions at the latest market price. */
export const markToMarket = ({ userId, algoId, prices }) => {
  const db = openDb();
  const now = isoStamp();
  for (const [symbol, price] of Object.entries(prices)) {
    const pricePaise = toPaise(price);
    db.prepare(`
      UPDATE algo_position
      SET last_price_paise = ?,
          unrealised_pnl_paise = (? - average_paise) * quantity,
          updated_at = ?
      WHERE user_id = ? AND algo_id = ? AND exchange = ? AND tradingsymbol = ? AND quantity > 0
    `).run(pricePaise, pricePaise, now, userId, algoId, EXCHANGE, symbol);
  }
};

export const openPositions = (userId, algoId) =>
  openDb().prepare(`
    SELECT * FROM algo_position
    WHERE user_id = ? AND algo_id = ? AND quantity > 0
    ORDER BY tradingsymbol
  `).all(userId, algoId);

export const allPositions = (userId, algoId) =>
  openDb().prepare('SELECT * FROM algo_position WHERE user_id = ? AND algo_id = ? ORDER BY tradingsymbol')
    .all(userId, algoId);

export const tradesForRun = (runId, limit = 100) =>
  openDb().prepare('SELECT * FROM algo_trade WHERE run_id = ? ORDER BY id DESC LIMIT ?').all(runId, limit);

export const ordersForRun = (runId, limit = 100) =>
  openDb().prepare('SELECT * FROM algo_order WHERE run_id = ? ORDER BY id DESC LIMIT ?').all(runId, limit);

/**
 * Win and loss counts, by replaying the run's trades in order.
 *
 * Derived rather than stored. The alternative was matching the exit reason in
 * `algo_order.status_message`, which is fragile text matching and wrong anyway:
 * a `trend_exit` can be either a profit or a loss. Replaying the actual fills
 * against a running weighted average gives the true outcome of every sell.
 *
 * Only SELLs are counted. A buy has no outcome yet, so counting it would halve
 * the win rate for no reason.
 */
const countOutcomes = (runId) => {
  const trades = openDb()
    .prepare('SELECT side, tradingsymbol, quantity, price_paise FROM algo_trade WHERE run_id = ? ORDER BY id')
    .all(runId);

  /** symbol -> { quantity, averagePaise } */
  const held = new Map();
  let wins = 0;
  let losses = 0;

  for (const trade of trades) {
    const current = held.get(trade.tradingsymbol) ?? { quantity: 0, averagePaise: 0 };

    if (trade.side === 'BUY') {
      const total = current.quantity + trade.quantity;
      const cost = current.averagePaise * current.quantity + trade.price_paise * trade.quantity;
      held.set(trade.tradingsymbol, { quantity: total, averagePaise: Math.round(cost / total) });
      continue;
    }

    // A sell with nothing recorded as held cannot be scored; skip rather than
    // invent an outcome.
    if (current.quantity <= 0) continue;
    const realised = (trade.price_paise - current.averagePaise) * trade.quantity;
    if (realised > 0) wins += 1;
    else if (realised < 0) losses += 1;
    // Exactly flat counts as neither.
    held.set(trade.tradingsymbol, { ...current, quantity: current.quantity - trade.quantity });
  }

  return { wins, losses };
};

/** Round-trip performance for a run. */
export const runSummary = (userId, algoId, runId) => {
  const db = openDb();

  const trades = db.prepare('SELECT side, quantity, price_paise, value_paise FROM algo_trade WHERE run_id = ?').all(runId);
  const buys = trades.filter((trade) => trade.side === 'BUY');
  const sells = trades.filter((trade) => trade.side === 'SELL');

  const positions = allPositions(userId, algoId);
  const realised = positions.reduce((total, position) => total + position.realised_pnl_paise, 0);
  const unrealised = positions.reduce((total, position) => total + position.unrealised_pnl_paise, 0);
  const deployed = positions
    .filter((position) => position.quantity > 0)
    .reduce((total, position) => total + position.average_paise * position.quantity, 0);

  const { wins, losses } = countOutcomes(runId);

  return {
    orders: trades.length,
    buys: buys.length,
    sells: sells.length,
    realisedPaise: realised,
    unrealisedPaise: unrealised,
    totalPnlPaise: realised + unrealised,
    deployedPaise: deployed,
    openPositions: positions.filter((position) => position.quantity > 0).length,
    wins,
    losses,
  };
};

/**
 * Clear a previous paper run's positions so a fresh start begins flat.
 * Orders and trades are kept — they are the history worth showing.
 */
export const resetPositions = (userId, algoId) =>
  openDb().prepare('DELETE FROM algo_position WHERE user_id = ? AND algo_id = ?').run(userId, algoId).changes;
