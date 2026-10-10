import { openDb } from './db.js';
import { isoStamp } from './dates.js';
import { entitledAlgos } from './accounts.js';
import { credentialsFor, forgetCredentials } from './tokenVault.js';

/**
 * Algorithm runs, bound to a browser session.
 *
 * The rule: an algorithm only runs while the user's session is open. That is
 * enforced in two directions, because either alone leaks runs —
 *
 *   - logging out, or a session expiring, stops that session's runs
 *   - a run whose browser stopped heartbeating is swept after STALE_AFTER_MS,
 *     which catches a closed laptop, a killed tab, a dropped network
 *
 * Without the sweeper a crashed browser would leave an algorithm trading with
 * nobody watching, which is the exact situation the session rule exists to
 * prevent.
 */

/** Browser heartbeat cadence is 30s; three misses is a dead session. */
export const STALE_AFTER_MS = 100000;

/** Runs currently believed to be live for a user. */
export const activeRuns = (userId) =>
  openDb().prepare("SELECT * FROM algo_run WHERE user_id = ? AND status = 'running' ORDER BY started_at DESC").all(userId);

export const activeRunFor = (userId, algoId) =>
  openDb().prepare("SELECT * FROM algo_run WHERE user_id = ? AND algo_id = ? AND status = 'running'").get(userId, algoId);

/**
 * Start an algorithm.
 *
 * Entitlement is re-checked here rather than trusted from the caller — this is
 * the gate, and the UI's locked cards are only presentation.
 */
export const startRun = ({ userId, algoId, sessionToken, configId = null, capitalPaise = 0 }) => {
  if (!entitledAlgos(userId).includes(algoId)) {
    const error = new Error('Your access to this algorithm is not active.');
    error.code = 'NOT_ENTITLED';
    throw error;
  }
  if (activeRunFor(userId, algoId)) {
    const error = new Error('That algorithm is already running.');
    error.code = 'ALREADY_RUNNING';
    throw error;
  }
  // The engine cannot place an order without the broker credentials this
  // session armed. Refusing here beats starting a run that silently no-ops.
  if (!credentialsFor(sessionToken)) {
    const error = new Error('This session cannot trade. Sign in again to re-arm it.');
    error.code = 'NO_CREDENTIALS';
    throw error;
  }

  const now = isoStamp();
  const result = openDb().prepare(`
    INSERT INTO algo_run (user_id, algo_id, config_id, session_token, status, started_at, last_heartbeat, capital_paise)
    VALUES (?, ?, ?, ?, 'running', ?, ?, ?)
  `).run(userId, algoId, configId, sessionToken, now, now, Math.round(capitalPaise));
  return openDb().prepare('SELECT * FROM algo_run WHERE id = ?').get(result.lastInsertRowid);
};

const stop = (where, params, reason) => {
  const now = isoStamp();
  const result = openDb().prepare(`
    UPDATE algo_run SET status = 'stopped', stopped_at = ?, stop_reason = ?
    WHERE status = 'running' AND ${where}
  `).run(now, reason, ...params);
  return result.changes;
};

/** The user pressed Stop. */
export const stopRun = (userId, algoId) => stop('user_id = ? AND algo_id = ?', [userId, algoId], 'user');

/** Logout, or a session that expired — everything that session was running. */
export const stopRunsForSession = (sessionToken, reason = 'session_closed') => {
  forgetCredentials(sessionToken);
  const stopped = stop('session_token = ?', [sessionToken], reason);
  if (stopped) console.log(`[runs] stopped ${stopped} run(s) — ${reason}`);
  return stopped;
};

/** Admin or support intervention. */
export const stopAllRunsForUser = (userId, reason = 'admin') => stop('user_id = ?', [userId], reason);

/**
 * The browser says it is still there. Touches the run and its session together,
 * so one call keeps both alive.
 */
export const heartbeat = (userId, sessionToken) => {
  const now = isoStamp();
  const db = openDb();
  db.prepare('UPDATE app_session SET last_seen_at = ? WHERE token = ?').run(now, sessionToken);
  const result = db.prepare(`
    UPDATE algo_run SET last_heartbeat = ?
    WHERE status = 'running' AND user_id = ? AND session_token = ?
  `).run(now, userId, sessionToken);
  return result.changes;
};

/**
 * Stop runs whose browser has gone quiet, whose session expired, or whose
 * access lapsed mid-run. Called on a timer by the server.
 *
 * Returns what it stopped, so the caller can log it rather than this guessing
 * at a log format.
 */
export const sweepStaleRuns = (now = Date.now()) => {
  const db = openDb();
  const stopped = [];

  for (const run of db.prepare("SELECT * FROM algo_run WHERE status = 'running'").all()) {
    const session = run.session_token
      ? db.prepare('SELECT * FROM app_session WHERE token = ?').get(run.session_token)
      : null;

    let reason = null;
    if (!session || session.ended_at) reason = 'session_closed';
    else if (Number(session.expires_at) < now) reason = 'session_expired';
    else if (now - new Date(run.last_heartbeat).getTime() > STALE_AFTER_MS) reason = 'heartbeat_lost';
    else if (!entitledAlgos(run.user_id).includes(run.algo_id)) reason = 'expired';
    else if (!credentialsFor(run.session_token)) reason = 'credentials_lost';

    if (!reason) continue;
    db.prepare("UPDATE algo_run SET status = 'stopped', stopped_at = ?, stop_reason = ? WHERE id = ?")
      .run(isoStamp(new Date(now)), reason, run.id);
    stopped.push({ runId: run.id, userId: run.user_id, algoId: run.algo_id, reason });
  }
  return stopped;
};

/**
 * Called once at startup.
 *
 * Broker credentials live only in process memory, so a restart leaves every
 * previously-running algorithm unable to trade. Rather than let those rows sit
 * claiming to be live, they are closed out honestly as server_restart.
 */
export const stopRunsOnBoot = () => {
  const result = openDb().prepare(`
    UPDATE algo_run SET status = 'stopped', stopped_at = ?, stop_reason = 'server_restart'
    WHERE status = 'running'
  `).run(isoStamp());
  if (result.changes) {
    console.log(`[runs] stopped ${result.changes} run(s) left over from the previous process — credentials do not survive a restart`);
  }
  return result.changes;
};

/** Run history for a user, newest first. */
/**
 * Every run id currently marked running, across all users.
 *
 * The engine map is keyed by run id, and this is what it reconciles against so
 * an engine cannot outlive the run that owns it. Deliberately not scoped to a
 * user: the sweeper is a process-wide janitor.
 */
export const activeRunIds = () =>
  openDb().prepare("SELECT id FROM algo_run WHERE status = 'running'").all().map((row) => row.id);

export const runHistory = (userId, limit = 50) =>
  openDb().prepare('SELECT * FROM algo_run WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
