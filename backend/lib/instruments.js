import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from './csv.js';
import { SNAPSHOT_DIR, ensureDirs, localDay } from './paths.js';

const SCRIPT_MASTER_URL = 'https://api.mstock.trade/openapi/typea/instruments/scriptmaster';
const SNAPSHOT_RE = /^instruments-(\d{4}-\d{2}-\d{2})\.csv$/;

/** The scriptmaster's own primary key — stable per contract. */
const KEY = 'instrument_token';

/**
 * Fields compared for the "changed" list. Deliberately not every column:
 * last_price moves every day and would mark the whole file as changed.
 * These are the ones that actually break an algo when they shift.
 */
const WATCHED_FIELDS = ['tradingsymbol', 'name', 'expiry', 'strike', 'tick_size', 'lot_size', 'instrument_type', 'segment', 'exchange'];

const snapshotPath = (day) => path.join(SNAPSHOT_DIR, `instruments-${day}.csv`);

/** Download the full scriptmaster CSV as text. */
export const fetchScriptMaster = async (apiKey, accessToken) => {
  const response = await fetch(SCRIPT_MASTER_URL, {
    headers: { Authorization: `token ${apiKey}:${accessToken}`, 'X-Mirae-Version': '1', Tag: 'typea' },
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.text();
  if (body.trimStart().startsWith('{')) {
    throw new Error(JSON.parse(body).message || 'Instrument master request was rejected.');
  }
  if (!response.ok) throw new Error(`Instrument master request failed (${response.status}).`);
  return body;
};

export const listSnapshots = async () => {
  ensureDirs();
  const files = await fs.readdir(SNAPSHOT_DIR);
  const days = [];
  for (const file of files) {
    const match = file.match(SNAPSHOT_RE);
    if (!match) continue;
    const { size } = await fs.stat(path.join(SNAPSHOT_DIR, file));
    days.push({ day: match[1], bytes: size });
  }
  return days.sort((left, right) => right.day.localeCompare(left.day));
};

export const readSnapshot = async (day) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid snapshot date: ${day}`);
  return fs.readFile(snapshotPath(day), 'utf8');
};

/**
 * Save today's scriptmaster once per day. Called after a successful login and
 * deliberately cheap to repeat: if today's file already exists it does nothing,
 * so logging in five times still downloads once.
 */
export const captureSnapshot = async (apiKey, accessToken) => {
  ensureDirs();
  const day = localDay();
  const file = snapshotPath(day);
  try {
    await fs.access(file);
    return { day, saved: false, reason: 'already captured today' };
  } catch {
    const csv = await fetchScriptMaster(apiKey, accessToken);
    // Write to a temp name first so a crash mid-download can never leave a
    // half-written file that later looks like a complete snapshot.
    const temp = `${file}.partial`;
    await fs.writeFile(temp, csv, 'utf8');
    await fs.rename(temp, file);
    return { day, saved: true, rows: csv.trim().split(/\r?\n/).length - 1 };
  }
};

const indexByKey = (records) => {
  const map = new Map();
  for (const record of records) {
    const key = record[KEY];
    if (key) map.set(key, record);
  }
  return map;
};

/**
 * Compare two scriptmaster CSVs.
 *   added   — in the new file, not the old
 *   deleted — in the old file, not the new
 *   changed — in both, but a watched field differs (e.g. lot_size 75 -> 50)
 */
export const diffInstruments = (oldCsv, newCsv) => {
  const oldRows = parseCsv(oldCsv);
  const newRows = parseCsv(newCsv);
  const oldIndex = indexByKey(oldRows);
  const newIndex = indexByKey(newRows);

  const added = [];
  const changed = [];
  for (const [key, record] of newIndex) {
    const previous = oldIndex.get(key);
    if (!previous) { added.push(record); continue; }
    const differences = WATCHED_FIELDS.filter((field) => (previous[field] ?? '') !== (record[field] ?? ''));
    if (differences.length) {
      changed.push({
        ...record,
        changed_fields: differences.join(' | '),
        previous_values: differences.map((field) => `${field}=${previous[field] ?? ''}`).join(' | '),
        new_values: differences.map((field) => `${field}=${record[field] ?? ''}`).join(' | '),
      });
    }
  }

  const deleted = [];
  for (const [key, record] of oldIndex) {
    if (!newIndex.has(key)) deleted.push(record);
  }

  return {
    added,
    deleted,
    changed,
    summary: {
      oldRows: oldRows.length,
      newRows: newRows.length,
      added: added.length,
      deleted: deleted.length,
      changed: changed.length,
      key: KEY,
      watchedFields: WATCHED_FIELDS,
    },
  };
};
