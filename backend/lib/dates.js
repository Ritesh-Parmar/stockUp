/**
 * Dates in the database are ISO: sortable, comparable, unambiguous.
 *
 *   validity dates   YYYY-MM-DD                      e.g. 2026-11-07
 *   timestamps       YYYY-MM-DDTHH:MM:SS+05:30       e.g. 2026-10-08T14:32:05+05:30
 *   "not owned"      NOT_OWNED below
 *
 * Why ISO and not DD-MM-YYYY: these columns get compared in SQL. ISO text
 * compares correctly as text, so `WHERE algo_arjuna >= '2026-10-08'` is both
 * right and indexable. Day-first text does not — '02-01-2027' < '30-12-2026'
 * is true as a string and false in reality.
 *
 * Display formatting (DD-MM-YYYY for Indian users) belongs in the front end,
 * where it is a presentation concern, not a storage one.
 *
 * The '000000' sentinel is kept deliberately: it sorts BEFORE every real date,
 * so a `>= today` comparison excludes unowned algorithms for free.
 */

export const NOT_OWNED = '000000';

const pad = (value) => String(value).padStart(2, '0');

/** Date -> "YYYY-MM-DD" in local time (never toISOString, which is UTC). */
export const isoDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Date -> "YYYY-MM-DDTHH:MM:SS+05:30", local wall clock with its real offset. */
export const isoStamp = (date = new Date()) => {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${isoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
};

/** "YYYY-MM-DD" -> Date, or null for the sentinel and anything unparseable. */
export const parseIsoDate = (value) => {
  if (!value || value === NOT_OWNED) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Still valid today? A date of today counts as valid — 30 days bought should
 * last through the whole 30th day.
 *
 * Note this is also expressible in SQL now (`algo_x >= date('now','localtime')`),
 * which is the point of the ISO switch. This helper exists for the cases where
 * the value is already in hand.
 */
export const isStillValid = (value, now = new Date()) => {
  const expiry = parseIsoDate(value);
  return expiry !== null && midnight(expiry) >= midnight(now);
};

/** Whole calendar days until expiry. Negative once lapsed, null if not owned. */
export const daysLeft = (value, now = new Date()) => {
  const expiry = parseIsoDate(value);
  if (expiry === null) return null;
  return Math.round((midnight(expiry) - midnight(now)) / 86400000);
};

/** "YYYY-MM-DD" that is `days` from `from` — what a purchase writes. */
export const validityFrom = (days, from = new Date()) => {
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + days);
  return isoDate(expiry);
};
