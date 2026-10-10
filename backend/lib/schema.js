import { openDb } from './db.js';
import { ALGORITHMS, ALGO_COLUMNS, VALIDITY_DAYS, algoColumn } from './algoCatalogue.js';
import { NOT_OWNED, isoStamp } from './dates.js';

/**
 * The finalised schema.
 *
 * The product: people sign in with their mStock account, buy individual
 * algorithms, and the backend trades those algorithms on their behalf **while
 * their browser session is open**. Close the tab and the run stops.
 *
 * Three consequences shape the design:
 *
 *   1. Access is per-user-per-algorithm with its own expiry, so validity lives
 *      as one `algo_<id>` column on `users` rather than a subscriptions table.
 *   2. A run is bound to an app_session. No session, no run — which is why
 *      there is no long-lived broker-credential store.
 *   3. Money is always INTEGER PAISE. Never floats in a financial column.
 *
 * All dates and timestamps are ISO so they sort and compare correctly in SQL.
 */

// Superseded by this design; dropped on startup.
const OBSOLETE = [
  'user', 'user_legacy',
  'plan', 'plan_legacy',
  'subscription', 'subscription_legacy',
  'payment', 'payment_legacy',
];

const createTables = (db) => {
  db.exec(`
    -- ═══ Identity ═══════════════════════════════════════════════════════════

    -- Identity comes from mStock: broker_user_id is returned by a verified OTP
    -- login and cannot be obtained without owning that brokerage account, so
    -- there is no password of our own.
    CREATE TABLE IF NOT EXISTS users (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      broker           TEXT    NOT NULL DEFAULT 'MIRAE',
      broker_user_id   TEXT    NOT NULL,

      full_name        TEXT,
      email            TEXT,
      phone            TEXT,

      role             TEXT    NOT NULL DEFAULT 'user',     -- user | admin
      status           TEXT    NOT NULL DEFAULT 'active',   -- active | suspended
      is_demo          INTEGER NOT NULL DEFAULT 0,

      trading_enabled  INTEGER NOT NULL DEFAULT 0,          -- master kill switch
      capital_paise    INTEGER NOT NULL DEFAULT 0,          -- capital the user allots

      -- Billing identity, for the GST invoices to come.
      gstin            TEXT,
      billing_state    TEXT,                                -- place of supply

      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      last_login_at    TEXT,
      login_count      INTEGER NOT NULL DEFAULT 0,

      UNIQUE (broker, broker_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- One row per algorithm on offer. Mirrors algoCatalogue.js so prices and
    -- names can be joined, and so payments can reference a real row.
    CREATE TABLE IF NOT EXISTS algorithms (
      id            TEXT PRIMARY KEY,
      name          TEXT    NOT NULL,
      style         TEXT,
      price_paise   INTEGER NOT NULL,
      validity_days INTEGER NOT NULL DEFAULT ${VALIDITY_DAYS},
      active        INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    -- Our own opaque session token, separate from the broker's access token.
    -- last_seen_at is the heartbeat that keeps a running algorithm alive.
    CREATE TABLE IF NOT EXISTS app_session (
      token        TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TEXT    NOT NULL,
      last_seen_at TEXT,
      expires_at   INTEGER NOT NULL,                        -- epoch ms, cheap to compare
      ip           TEXT,
      user_agent   TEXT,
      ended_at     TEXT                                     -- set on logout
    );
    CREATE INDEX IF NOT EXISTS idx_session_user ON app_session(user_id);

    -- ═══ Running the algorithms ═════════════════════════════════════════════

    -- Per-user, per-algorithm parameters — what the Configure screen produces.
    -- JSON because each strategy takes a different shape; the engine validates
    -- it, not the database.
    CREATE TABLE IF NOT EXISTS algo_config (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id       TEXT    NOT NULL REFERENCES algorithms(id),
      label         TEXT,
      params        TEXT    NOT NULL DEFAULT '{}',
      source_file   TEXT,                                   -- uploaded sheet name
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_config_user ON algo_config(user_id, algo_id);

    -- A live (or finished) run of one algorithm for one user.
    --
    -- session_token is the whole point: a run belongs to a browser session, and
    -- when that session ends or stops heartbeating, the sweeper stops the run.
    -- ON DELETE SET NULL rather than CASCADE so finished runs survive as
    -- history after their session row is gone.
    CREATE TABLE IF NOT EXISTS algo_run (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id         TEXT    NOT NULL REFERENCES algorithms(id),
      config_id       INTEGER REFERENCES algo_config(id) ON DELETE SET NULL,
      session_token   TEXT    REFERENCES app_session(token) ON DELETE SET NULL,
      status          TEXT    NOT NULL,                     -- running | stopped | ended | errored
      started_at      TEXT    NOT NULL,
      last_heartbeat  TEXT    NOT NULL,
      stopped_at      TEXT,
      stop_reason     TEXT,                                 -- user | session_closed | expired | error | admin
      error_message   TEXT,
      capital_paise   INTEGER NOT NULL DEFAULT 0            -- capital committed to this run
    );
    CREATE INDEX IF NOT EXISTS idx_run_user   ON algo_run(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_run_status ON algo_run(status, last_heartbeat);

    -- Orders the engine placed. "order" is reserved in SQL, hence algo_order.
    CREATE TABLE IF NOT EXISTS algo_order (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id           TEXT    NOT NULL REFERENCES algorithms(id),
      run_id            INTEGER REFERENCES algo_run(id) ON DELETE SET NULL,

      broker_order_id   TEXT,                               -- null until accepted
      exchange          TEXT    NOT NULL,
      tradingsymbol     TEXT    NOT NULL,
      instrument_token  INTEGER,

      transaction_type  TEXT    NOT NULL,                   -- BUY | SELL
      product           TEXT    NOT NULL,                   -- CNC | MIS | NRML
      order_type        TEXT    NOT NULL,                   -- MARKET | LIMIT | SL | SL-M
      validity          TEXT    NOT NULL DEFAULT 'DAY',

      quantity          INTEGER NOT NULL,
      filled_quantity   INTEGER NOT NULL DEFAULT 0,
      price_paise       INTEGER,
      trigger_paise     INTEGER,
      average_paise     INTEGER,

      status            TEXT    NOT NULL,                   -- pending | open | complete | rejected | cancelled
      status_message    TEXT,
      placed_at         TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL,

      UNIQUE (broker_order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_order_user ON algo_order(user_id, placed_at);
    CREATE INDEX IF NOT EXISTS idx_order_run  ON algo_order(run_id);

    -- Executions. One order can fill across several trades.
    CREATE TABLE IF NOT EXISTS algo_trade (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        INTEGER REFERENCES algo_order(id) ON DELETE SET NULL,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id         TEXT    NOT NULL REFERENCES algorithms(id),
      run_id          INTEGER REFERENCES algo_run(id) ON DELETE SET NULL,
      broker_trade_id TEXT,
      exchange        TEXT    NOT NULL,
      tradingsymbol   TEXT    NOT NULL,
      side            TEXT    NOT NULL,                     -- BUY | SELL
      quantity        INTEGER NOT NULL,
      price_paise     INTEGER NOT NULL,
      value_paise     INTEGER NOT NULL,
      traded_at       TEXT    NOT NULL,
      UNIQUE (broker_trade_id)
    );
    CREATE INDEX IF NOT EXISTS idx_trade_user ON algo_trade(user_id, traded_at);

    -- What each algorithm currently holds for each user, one row per instrument.
    CREATE TABLE IF NOT EXISTS algo_position (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id              TEXT    NOT NULL REFERENCES algorithms(id),
      exchange             TEXT    NOT NULL,
      tradingsymbol        TEXT    NOT NULL,
      quantity             INTEGER NOT NULL DEFAULT 0,
      average_paise        INTEGER NOT NULL DEFAULT 0,
      last_price_paise     INTEGER NOT NULL DEFAULT 0,
      realised_pnl_paise   INTEGER NOT NULL DEFAULT 0,
      unrealised_pnl_paise INTEGER NOT NULL DEFAULT 0,
      opened_at            TEXT    NOT NULL,
      updated_at           TEXT    NOT NULL,
      UNIQUE (user_id, algo_id, exchange, tradingsymbol)
    );

    -- ═══ Money ══════════════════════════════════════════════════════════════

    -- Razorpay-shaped. order_id is created server-side before checkout;
    -- payment_id and signature arrive with the webhook.
    CREATE TABLE IF NOT EXISTS payments (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      algo_id              TEXT    NOT NULL REFERENCES algorithms(id),
      provider             TEXT    NOT NULL DEFAULT 'razorpay',
      razorpay_order_id    TEXT    NOT NULL,
      razorpay_payment_id  TEXT,
      razorpay_signature   TEXT,
      amount_paise         INTEGER NOT NULL,
      currency             TEXT    NOT NULL DEFAULT 'INR',
      status               TEXT    NOT NULL,                -- created | paid | failed | refunded
      method               TEXT,                            -- upi | card | netbanking
      failure_reason       TEXT,
      validity_granted_to  TEXT,                            -- YYYY-MM-DD written on success
      created_at           TEXT    NOT NULL,
      completed_at         TEXT,
      UNIQUE (provider, razorpay_order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

    -- Every webhook Razorpay sends, stored before it is acted on.
    --
    -- This is what makes fulfilment idempotent. Razorpay retries any non-2xx
    -- response, and without a UNIQUE event id a retry would grant a second
    -- 30 days for one payment.
    CREATE TABLE IF NOT EXISTS webhook_event (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      provider         TEXT    NOT NULL DEFAULT 'razorpay',
      event_id         TEXT    NOT NULL,                    -- x-razorpay-event-id
      event_type       TEXT,                                -- payment.captured, …
      signature_valid  INTEGER NOT NULL DEFAULT 0,
      payload          TEXT    NOT NULL,                    -- raw body, verbatim
      received_at      TEXT    NOT NULL,
      processed_at     TEXT,
      process_error    TEXT,
      UNIQUE (provider, event_id)
    );

    CREATE TABLE IF NOT EXISTS refund (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id          INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      razorpay_refund_id  TEXT,
      amount_paise        INTEGER NOT NULL,
      reason              TEXT,
      revoked_access      INTEGER NOT NULL DEFAULT 0,       -- was the algorithm taken back
      status              TEXT    NOT NULL,                 -- created | processed | failed
      created_at          TEXT    NOT NULL,
      completed_at        TEXT,
      UNIQUE (razorpay_refund_id)
    );

    -- GST invoices. Created now, deliberately unused: retrofitting gapless
    -- sequential invoice numbers onto existing payments is painful, so the
    -- shape is reserved while the logic comes later.
    CREATE TABLE IF NOT EXISTS invoice (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id          INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      invoice_number      TEXT    NOT NULL,                 -- gapless, sequential
      invoice_date        TEXT    NOT NULL,
      seller_gstin        TEXT,
      customer_gstin      TEXT,
      place_of_supply     TEXT,
      hsn_sac             TEXT,
      taxable_value_paise INTEGER NOT NULL DEFAULT 0,
      cgst_paise          INTEGER NOT NULL DEFAULT 0,
      sgst_paise          INTEGER NOT NULL DEFAULT 0,
      igst_paise          INTEGER NOT NULL DEFAULT 0,
      total_paise         INTEGER NOT NULL DEFAULT 0,
      status              TEXT    NOT NULL DEFAULT 'draft', -- draft | issued | cancelled
      pdf_path            TEXT,
      created_at          TEXT    NOT NULL,
      UNIQUE (invoice_number)
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_user ON invoice(user_id);

    -- ═══ Operations ═════════════════════════════════════════════════════════

    -- Activity log. user_id is nullable because pre-login events (a page view
    -- on /login) have no user yet.
    CREATE TABLE IF NOT EXISTS event (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      day         TEXT NOT NULL,                            -- local date, so IST days group right
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id  TEXT NOT NULL,
      type        TEXT NOT NULL,
      target      TEXT,
      outcome     TEXT,
      duration_ms INTEGER,
      detail      TEXT
    );

    -- Admin actions, kept apart from the event table: suspensions, refunds
    -- and manual grants need a trail that user activity cannot drown out.
    CREATE TABLE IF NOT EXISTS audit_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ts             TEXT    NOT NULL,
      actor_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action         TEXT    NOT NULL,                      -- user.suspend, algo.grant, payment.refund
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      detail         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_user_id, ts);

    -- Outbound messages: expiry reminders, failed payments, run stopped.
    CREATE TABLE IF NOT EXISTS notification (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel       TEXT    NOT NULL,                       -- email | sms | inapp
      type          TEXT    NOT NULL,                       -- algo.expiring, payment.failed
      subject       TEXT,
      body          TEXT,
      status        TEXT    NOT NULL DEFAULT 'queued',      -- queued | sent | failed
      scheduled_for TEXT,
      sent_at       TEXT,
      error         TEXT,
      created_at    TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notification_pending ON notification(status, scheduled_for);
  `);
};

/**
 * Columns added to tables that may already exist.
 *
 * CREATE TABLE IF NOT EXISTS silently does nothing to an existing table, so a
 * new column must be added explicitly — and any index over it must come after.
 * This has bitten twice already.
 */
const addMissingColumns = (db) => {
  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  const add = (table, column, definition) => {
    if (!columns(table).includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[schema] added column ${table}.${column}`);
    }
  };

  add('event', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  add('users', 'gstin', 'TEXT');
  add('users', 'billing_state', 'TEXT');

  // app_session gained several columns at once. Sessions are disposable — the
  // worst case is everyone signs in again — so an incomplete one is dropped and
  // rebuilt rather than patched column by column. algo_run.session_token is
  // ON DELETE SET NULL, so orphaned runs are then swept as session_closed,
  // which is exactly the right outcome.
  const sessionColumns = columns('app_session');
  const wanted = ['token', 'user_id', 'created_at', 'last_seen_at', 'expires_at', 'ip', 'user_agent', 'ended_at'];
  if (sessionColumns.length && wanted.some((column) => !sessionColumns.includes(column))) {
    console.log('[schema] rebuilding app_session for the current shape — existing sessions are invalidated');
    db.exec('DROP TABLE app_session');
    db.exec(`
      CREATE TABLE app_session (
        token        TEXT PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TEXT    NOT NULL,
        last_seen_at TEXT,
        expires_at   INTEGER NOT NULL,
        ip           TEXT,
        user_agent   TEXT,
        ended_at     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_session_user ON app_session(user_id);
    `);
  }
};

const createIndexes = (db) => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_event_day  ON event(day);
    CREATE INDEX IF NOT EXISTS idx_event_user ON event(user_id, day);
    CREATE INDEX IF NOT EXISTS idx_event_ts   ON event(ts);
  `);
};

/**
 * One `algo_<id>` column on `users` per algorithm, holding the YYYY-MM-DD date
 * it is valid until, or '000000' when never bought.
 *
 * Each gets an index, which is only worth having because the dates are ISO:
 * "who expires in the next three days" becomes a range scan.
 *
 * Adding an algorithm adds its column. Removing one DROPS the column and with
 * it every user's validity for it — intended, irreversible, logged loudly.
 * Only `algo_*` columns are ever dropped; the prefix means a typo in the
 * catalogue can cost an algorithm column, never `email` or `capital_paise`.
 */
export const syncAlgoColumns = (db) => {
  const existing = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);

  for (const algorithm of ALGORITHMS) {
    const column = algoColumn(algorithm.id);
    if (!existing.includes(column)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT '${NOT_OWNED}'`);
      console.log(`[schema] added column users.${column}`);
    }
    // Index outside the add branch: columns that predate this code would
    // otherwise never get one, and the expiry-sweep query would table-scan.
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_${column} ON users(${column})`);
  }

  for (const column of existing.filter((name) => name.startsWith('algo_') && !ALGO_COLUMNS.includes(name))) {
    console.warn(`[schema] DROPPING users.${column} — no longer in the catalogue; every user's validity for it is discarded`);
    db.exec(`DROP INDEX IF EXISTS idx_users_${column}`);
    db.exec(`ALTER TABLE users DROP COLUMN ${column}`);
  }
};

/** Keep the algorithms table in step with the catalogue. */
const syncCatalogue = (db) => {
  const insert = db.prepare(`
    INSERT INTO algorithms (id, name, style, price_paise, validity_days, sort_order, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, style = excluded.style,
      price_paise = excluded.price_paise, validity_days = excluded.validity_days,
      sort_order = excluded.sort_order, active = 1
  `);
  ALGORITHMS.forEach((algorithm, index) => {
    insert.run(algorithm.id, algorithm.name, algorithm.style, algorithm.price_paise, VALIDITY_DAYS, index);
  });

  // Pulled from the catalogue: deactivate rather than delete, since payment
  // and order rows still reference it.
  const known = ALGORITHMS.map((algorithm) => algorithm.id);
  db.prepare(`UPDATE algorithms SET active = 0 WHERE id NOT IN (${known.map(() => '?').join(',')})`).run(...known);
};

/**
 * Validity written by the earlier day-first design needs converting:
 * "19-10-2026" -> "2026-10-19". Matched by shape, so re-running is harmless.
 */
const convertDayFirstDates = (db) => {
  const dayFirstDate = /^(\d{2})-(\d{2})-(\d{4})$/;
  for (const row of db.prepare('SELECT * FROM users').all()) {
    for (const column of ALGO_COLUMNS) {
      const match = String(row[column] ?? '').match(dayFirstDate);
      if (!match) continue;
      const iso = `${match[3]}-${match[2]}-${match[1]}`;
      db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(iso, row.id);
      console.log(`[schema] user ${row.id} ${column}: ${row[column]} -> ${iso}`);
    }
    for (const field of ['created_at', 'updated_at', 'last_login_at']) {
      const match = String(row[field] ?? '').match(/^(\d{2})-(\d{2})-(\d{4})[ T](.+)$/);
      if (!match) continue;
      db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`)
        .run(`${match[3]}-${match[2]}-${match[1]}T${match[4]}`, row.id);
    }
  }
};

/** Fill anything the newly added columns need on existing rows. */
const backfill = (db) => {
  db.prepare('UPDATE app_session SET last_seen_at = created_at WHERE last_seen_at IS NULL').run();
  db.prepare('UPDATE users SET updated_at = COALESCE(created_at, ?) WHERE updated_at IS NULL').run(isoStamp());
};

/** Drop tables superseded by this design. */
const dropObsolete = (db) => {
  const present = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const name of OBSOLETE) {
    if (present.includes(name)) {
      db.exec(`DROP TABLE IF EXISTS ${name}`);
      console.log(`[schema] dropped obsolete table ${name}`);
    }
  }
};

/** Bring the live database up to the current schema. Safe to run every start. */
export const initSchema = () => {
  const db = openDb();
  createTables(db);
  addMissingColumns(db);
  createIndexes(db);
  syncAlgoColumns(db);
  syncCatalogue(db);
  convertDayFirstDates(db);
  backfill(db);
  dropObsolete(db);
  return db;
};
