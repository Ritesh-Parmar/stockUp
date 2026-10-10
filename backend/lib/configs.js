import { openDb } from './db.js';
import { findAlgo } from './algoCatalogue.js';
import { isoStamp } from './dates.js';

/**
 * Per-user, per-algorithm configuration — the spreadsheet the Configure page
 * uploads and edits.
 *
 * One active config per user per algorithm. Saving again replaces it rather
 * than piling up rows: the page has no concept of several named configs, and a
 * run needs one unambiguous answer to "what am I trading with".
 *
 * `params` holds the sheet as JSON text. SQLite has no JSON column type, so it
 * is stored as TEXT and parsed on the way out. A row whose text will not parse
 * is treated as absent rather than thrown: a corrupt config should mean "no
 * config saved yet", not a broken page.
 */

const MAX_PARAMS_BYTES = 2_000_000;

const parseParams = (row) => {
  if (!row) return null;
  let params = {};
  try {
    params = JSON.parse(row.params);
  } catch {
    console.error(`[config] row ${row.id} holds unparseable params; treating as empty`);
  }
  return {
    id: row.id,
    algoId: row.algo_id,
    label: row.label,
    sourceFile: row.source_file,
    params,
    updatedAt: row.updated_at,
  };
};

export const configFor = (userId, algoId) =>
  parseParams(openDb().prepare(`
    SELECT * FROM algo_config
    WHERE user_id = ? AND algo_id = ? AND is_active = 1
    ORDER BY id DESC LIMIT 1
  `).get(userId, algoId));

export const configsFor = (userId) =>
  openDb().prepare('SELECT * FROM algo_config WHERE user_id = ? AND is_active = 1 ORDER BY algo_id')
    .all(userId).map(parseParams);

/** Replace this user's config for one algorithm. Returns the saved config. */
export const saveConfig = ({ userId, algoId, label, params, sourceFile }) => {
  if (!findAlgo(algoId)) throw new Error(`Unknown algorithm: ${algoId}`);

  const text = JSON.stringify(params ?? {});
  // A runaway sheet should be refused here, not silently stored and then fail
  // to load. The upload route's body limit is the first line of defence.
  if (text.length > MAX_PARAMS_BYTES) {
    throw new Error('That configuration is too large to save. Trim the sheet and try again.');
  }

  const db = openDb();
  const now = isoStamp();
  const existing = db.prepare('SELECT id FROM algo_config WHERE user_id = ? AND algo_id = ? AND is_active = 1')
    .get(userId, algoId);

  if (existing) {
    db.prepare(`
      UPDATE algo_config SET label = ?, params = ?, source_file = ?, updated_at = ?
      WHERE id = ?
    `).run(label ?? null, text, sourceFile ?? null, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO algo_config (user_id, algo_id, label, params, source_file, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, algoId, label ?? null, text, sourceFile ?? null, now, now);
  }

  return configFor(userId, algoId);
};

/**
 * Retire a config instead of deleting it: algo_run rows reference config_id, so
 * a hard delete would strip past runs of what they were run with.
 */
export const clearConfig = (userId, algoId) => {
  const result = openDb()
    .prepare('UPDATE algo_config SET is_active = 0, updated_at = ? WHERE user_id = ? AND algo_id = ? AND is_active = 1')
    .run(isoStamp(), userId, algoId);
  return result.changes;
};
