import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { ALGORITHMS, VALIDITY_DAYS, algoColumn, findAlgo } from './algoCatalogue.js';
import { NOT_OWNED, daysLeft, isStillValid, isoStamp, parseIsoDate, validityFrom } from './dates.js';
import { forgetCredentials } from './tokenVault.js';

/**
 * Users, sessions, and per-algorithm access.
 *
 * Access lives as one `algo_<id>` column per algorithm on `users`, holding the
 * YYYY-MM-DD date it is valid until, or '000000' when never bought or lapsed.
 *
 * ISO means these columns compare correctly in SQL and are indexed, so
 * "everyone whose Arjuna expires this week" is a range scan. The '000000'
 * sentinel sorts before every real date, so `>= today` excludes unowned
 * algorithms without a special case.
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// ── Users ───────────────────────────────────────────────────────────────────

/** Called after a verified login: creates on first sight, updates after that. */
export const upsertUser = ({ brokerUserId, fullName, email, phone, isDemo = false, broker = 'MIRAE' }) => {
  const db = openDb();
  const now = isoStamp();
  const id = String(brokerUserId || '').trim();
  if (!id) throw new Error('The broker did not return a user id.');

  db.prepare(`
    INSERT INTO users (broker, broker_user_id, full_name, email, phone, is_demo,
                       created_at, updated_at, last_login_at, login_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (broker, broker_user_id) DO UPDATE SET
      full_name     = COALESCE(excluded.full_name, users.full_name),
      email         = COALESCE(excluded.email, users.email),
      phone         = COALESCE(excluded.phone, users.phone),
      updated_at    = excluded.updated_at,
      last_login_at = excluded.last_login_at,
      login_count   = users.login_count + 1
  `).run(broker, id, fullName ?? null, email ?? null, phone ?? null, isDemo ? 1 : 0, now, now, now);

  return getUserByBrokerId(broker, id);
};

export const getUserByBrokerId = (broker, brokerUserId) =>
  openDb().prepare('SELECT * FROM users WHERE broker = ? AND broker_user_id = ?').get(broker, brokerUserId);

export const getUser = (userId) => openDb().prepare('SELECT * FROM users WHERE id = ?').get(userId);

export const listUsers = () =>
  openDb().prepare('SELECT * FROM users ORDER BY id').all();

/** Editable profile fields only — never role, status or validity columns. */
export const updateProfile = (userId, { fullName, email, phone, capitalPaise }) => {
  openDb().prepare(`
    UPDATE users SET
      full_name     = COALESCE(?, full_name),
      email         = COALESCE(?, email),
      phone         = COALESCE(?, phone),
      capital_paise = COALESCE(?, capital_paise),
      updated_at    = ?
    WHERE id = ?
  `).run(fullName ?? null, email ?? null, phone ?? null,
         Number.isFinite(capitalPaise) ? Math.round(capitalPaise) : null, isoStamp(), userId);
  return getUser(userId);
};

// ── Per-algorithm access ────────────────────────────────────────────────────

/**
 * Every algorithm with its validity for this user.
 * `valid` is computed in JS; the stored string cannot be compared in SQL.
 */
export const algoAccess = (userId) => {
  const user = getUser(userId);
  if (!user) return [];
  return ALGORITHMS.map((algorithm) => {
    const validTill = user[algoColumn(algorithm.id)] ?? NOT_OWNED;
    return {
      id: algorithm.id,
      name: algorithm.name,
      style: algorithm.style,
      pricePaise: algorithm.price_paise,
      validTill,                                   // "DD-MM-YYYY" or "000000"
      owned: validTill !== NOT_OWNED,
      valid: isStillValid(validTill),
      daysLeft: daysLeft(validTill),
    };
  });
};

/** Ids the user may actually run right now. */
export const entitledAlgos = (userId) =>
  algoAccess(userId).filter((algorithm) => algorithm.valid).map((algorithm) => algorithm.id);

export const isEntitled = (userId, algoId) => entitledAlgos(userId).includes(algoId);

/**
 * Grant or extend access to one algorithm. Call ONLY after a payment provider
 * confirms — never from a browser callback.
 *
 * Renewing before expiry extends from the existing date rather than from today,
 * so paying early never costs the user days.
 */
export const grantAlgo = (userId, algoId, days = VALIDITY_DAYS) => {
  if (!findAlgo(algoId)) throw new Error(`Unknown algorithm: ${algoId}`);
  const db = openDb();
  const column = algoColumn(algoId);
  const current = getUser(userId)?.[column] ?? NOT_OWNED;

  const base = isStillValid(current) ? (parseIsoDate(current) ?? new Date()) : new Date();

  const until = validityFrom(days, base);
  db.prepare(`UPDATE users SET ${column} = ?, updated_at = ? WHERE id = ?`).run(until, isoStamp(), userId);
  return until;
};

/** Revoke immediately — refunds, chargebacks, abuse. */
export const revokeAlgo = (userId, algoId) => {
  if (!findAlgo(algoId)) throw new Error(`Unknown algorithm: ${algoId}`);
  openDb().prepare(`UPDATE users SET ${algoColumn(algoId)} = ?, updated_at = ? WHERE id = ?`)
    .run(NOT_OWNED, isoStamp(), userId);
};

// ── Sessions ────────────────────────────────────────────────────────────────

export const createSession = (userId, { ip, userAgent } = {}) => {
  const token = randomBytes(32).toString('hex');
  const now = isoStamp();
  openDb().prepare(`
    INSERT INTO app_session (token, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, userId, now, now, Date.now() + SESSION_TTL_MS, ip ?? null, userAgent ?? null);
  return token;
};

export const userForSession = (token) => {
  if (!token) return null;
  const db = openDb();
  const row = db.prepare(`
    SELECT u.*, s.expires_at AS session_expires_at, s.ended_at AS session_ended_at
    FROM app_session s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (row.session_ended_at || Number(row.session_expires_at) < Date.now()) {
    // Mark rather than delete: algo_run rows reference this token, and the
    // sweeper needs to see that the session is gone to stop them.
    db.prepare('UPDATE app_session SET ended_at = COALESCE(ended_at, ?) WHERE token = ?').run(isoStamp(), token);
    return null;
  }
  return row;
};

/**
 * End a session. Marks `ended_at` instead of deleting, so the run sweeper can
 * tell that the session closed and stop whatever it was running.
 */
export const endSession = (token) => {
  if (!token) return;
  // Credentials go first: a half-closed session that can still trade is worse
  // than one that cannot.
  forgetCredentials(token);
  openDb().prepare('UPDATE app_session SET ended_at = ? WHERE token = ? AND ended_at IS NULL')
    .run(isoStamp(), token);
};

/** Sessions still considered open. Used by the sweeper and by admin views. */
export const openSessions = () =>
  openDb().prepare('SELECT * FROM app_session WHERE ended_at IS NULL AND expires_at > ?').all(Date.now());

/** Express middleware: attaches req.user, or 401s. Suspended accounts are refused. */
export const requireUser = (req, res, next) => {
  const user = userForSession(req.get('X-App-Session') || req.body?.app_session || '');
  if (!user) return res.status(401).json({ success: false, error: 'Your session has expired. Sign in again.' });
  if (user.status !== 'active') return res.status(403).json({ success: false, error: 'This account is suspended.' });
  req.user = user;
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access required.' });
  next();
};
