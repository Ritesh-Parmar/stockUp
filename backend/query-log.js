/**
 * Read the activity log from the terminal. No dependencies, no sqlite3 install —
 * Node's built-in SQLite does the work.
 *
 *   node query-log.js                    days with counts
 *   node query-log.js 2026-08-27         everything that day, grouped by session
 *   node query-log.js 2026-08-27 errors  only the failures that day
 *   node query-log.js --sql "SELECT ..." any query you like (read-only)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DB_FILE } from './lib/paths.js';

if (!fs.existsSync(DB_FILE)) {
  console.log(`No log yet at ${DB_FILE}`);
  console.log('It is created the first time the backend starts.');
  process.exit(0);
}

const db = new DatabaseSync(DB_FILE, { readOnly: true });
const [first, second] = process.argv.slice(2);

const table = (rows) => {
  if (!rows.length) return console.log('(nothing)');
  console.table(rows);
};

if (first === '--sql') {
  const sql = process.argv.slice(3).join(' ');
  if (!/^\s*select/i.test(sql)) {
    console.error('Only SELECT queries are allowed here.');
    process.exit(1);
  }
  table(db.prepare(sql).all());
} else if (!first) {
  console.log(`Activity log: ${DB_FILE}\n`);
  table(db.prepare(`
    SELECT day,
           COUNT(*)                                                AS events,
           COUNT(DISTINCT session_id)                              AS sessions,
           SUM(CASE WHEN type = 'login.success' THEN 1 ELSE 0 END) AS logins,
           SUM(CASE WHEN type = 'login.failure' THEN 1 ELSE 0 END) AS failed_logins,
           SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END)      AS errors
    FROM event GROUP BY day ORDER BY day DESC
  `).all());
  console.log('\nFor one day:  node query-log.js YYYY-MM-DD');
} else {
  const onlyErrors = second === 'errors';
  const rows = db.prepare(`
    SELECT id, ts, session_id, type, target, outcome, duration_ms, detail
    FROM event WHERE day = ? ${onlyErrors ? "AND outcome = 'error'" : ''} ORDER BY id
  `).all(first);

  if (!rows.length) {
    console.log(`Nothing logged on ${first}.`);
  } else {
    let currentSession = null;
    for (const row of rows) {
      if (row.session_id !== currentSession) {
        currentSession = row.session_id;
        console.log(`\n── session ${currentSession} ──`);
      }
      const time = String(row.ts).slice(11, 19);
      const took = row.duration_ms == null ? '' : ` ${row.duration_ms}ms`;
      const outcome = row.outcome ? ` [${row.outcome}]` : '';
      console.log(`  ${time}  ${row.type.padEnd(20)} ${row.target ?? ''}${outcome}${took}`);
      if (row.detail) console.log(`${' '.repeat(32)}${row.detail}`);
    }
    console.log(`\n${rows.length} event(s) on ${first}.`);
  }
}

db.close();
