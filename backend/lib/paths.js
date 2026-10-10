import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the app keeps everything it writes to disk: daily instrument snapshots
 * and the activity-log database. Override with DATA_DIR in backend/.env.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(here, '..', 'data');

export const SNAPSHOT_DIR = path.join(DATA_DIR, 'instruments');
export const DB_FILE = path.join(DATA_DIR, 'activity.db');

export const ensureDirs = () => {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
};

/**
 * Local (IST, or whatever the machine is set to) calendar date as YYYY-MM-DD.
 *
 * Deliberately NOT toISOString().slice(0,10) — that is UTC, and India is +05:30,
 * so anything before 05:30 local would be filed under the previous day.
 */
export const localDay = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Local wall-clock timestamp with offset, e.g. 2026-08-27T14:03:11+05:30. */
export const localTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
};
