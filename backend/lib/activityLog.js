import { openDb } from './db.js';
import { isoDate, isoStamp } from './dates.js';

/**
 * Activity log.
 *
 * `day` is its own column holding the LOCAL calendar date. Querying by the
 * timestamp alone would use UTC, and since India is +05:30 anything logged
 * before 05:30 would be filed under the previous day.
 *
 * Every read is scoped to a user_id. With more than one user, events keyed only
 * by a browser session id cannot be attributed to a person — and returning all
 * of them to any caller leaked one user's activity to another.
 */
/**
 * Detail fields the log is allowed to keep. An ALLOWLIST, not a blocklist:
 * a secret added to the app later is excluded automatically instead of leaking
 * until someone remembers to ban it. Credentials must never appear here.
 */
const ALLOWED_DETAIL = new Set([
  'path', 'endpoint', 'method', 'status', 'title', 'symbolCount', 'rowCount',
  'interval', 'exchange', 'instrumentToken', 'operation', 'reason', 'errorMessage',
  'from', 'to', 'added', 'deleted', 'changed', 'day', 'username',
]);

/** Fields that must never be stored even if something tries. Belt and braces. */
const FORBIDDEN = /pass|secret|token|api[_-]?key|otp|checksum|auth/i;

const cleanDetail = (detail) => {
  if (!detail || typeof detail !== 'object') return null;
  const kept = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!ALLOWED_DETAIL.has(key)) continue;
    if (FORBIDDEN.test(key)) continue;
    if (value === null || value === undefined) continue;
    kept[key] = typeof value === 'object' ? JSON.stringify(value).slice(0, 500) : String(value).slice(0, 500);
  }
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
};

const SAFE_TEXT = (value, max = 200) =>
  value === null || value === undefined ? null : String(value).slice(0, max);

/** Insert a batch of events. Returns how many were written. */
export const recordEvents = (events, sessionId, userId = null) => {
  const database = openDb();
  const insert = database.prepare(`
    INSERT INTO event (ts, day, user_id, session_id, type, target, outcome, duration_ms, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let written = 0;
  const now = new Date();
  for (const event of events) {
    if (!event?.type) continue;
    // Trust the server clock for the date, not the browser's.
    const stamped = event.ts ? new Date(event.ts) : now;
    const when = Number.isNaN(stamped.getTime()) ? now : stamped;
    insert.run(
      isoStamp(when),
      isoDate(when),
      userId,
      SAFE_TEXT(event.sessionId || sessionId || 'unknown', 64),
      SAFE_TEXT(event.type, 64),
      SAFE_TEXT(event.target),
      SAFE_TEXT(event.outcome, 32),
      Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
      cleanDetail(event.detail),
    );
    written += 1;
  }
  return written;
};

/**
 * Days that have activity for ONE user, newest first.
 * Pass null as userId for an admin view across everybody.
 */
export const listDays = (userId) => {
  const scoped = userId !== null && userId !== undefined;
  return openDb().prepare(`
    SELECT day,
           COUNT(*)                                                AS events,
           COUNT(DISTINCT session_id)                              AS sessions,
           SUM(CASE WHEN type = 'login.success' THEN 1 ELSE 0 END) AS logins,
           SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END)      AS errors
    FROM event
    ${scoped ? 'WHERE user_id = ?' : ''}
    GROUP BY day ORDER BY day DESC
  `).all(...(scoped ? [userId] : []));
};

/** One day's events for ONE user, oldest first so a session reads in order. */
export const eventsForDay = (day, userId) => {
  const scoped = userId !== null && userId !== undefined;
  return openDb().prepare(`
    SELECT * FROM event WHERE day = ? ${scoped ? 'AND user_id = ?' : ''} ORDER BY id ASC
  `).all(...(scoped ? [day, userId] : [day]));
};
