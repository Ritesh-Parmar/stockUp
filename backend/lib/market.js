/**
 * Is the NSE equity market open?
 *
 * Hours are 09:15–15:30 IST, Monday to Friday.
 *
 * The time is read through Intl with an explicit `Asia/Kolkata` zone rather
 * than from the server clock. It happens to run in IST today, but a deployed
 * box will almost certainly be UTC, and "it worked on my machine" is exactly
 * how the +05:30 candle bug got in. Read the IST wall-clock fields and compare
 * those.
 *
 * Trading HOLIDAYS are not handled: that needs the exchange calendar, which
 * changes yearly. On a holiday this reports "open" during market hours and the
 * feed simply finds no new prices, which it already reports honestly as
 * simulated. Worth wiring up a real calendar before anything trades for money.
 */

const OPEN_MINUTES = 9 * 60 + 15;   // 09:15
const CLOSE_MINUTES = 15 * 60 + 30; // 15:30

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKEND = new Set(['Sat', 'Sun']);

/** IST wall-clock parts, read literally. */
export const istNow = (at = new Date()) => {
  const parts = Object.fromEntries(
    IST.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
    clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
};

/**
 * @returns {{ open, reason, clock, weekday }}
 * `reason` is a short code the UI turns into a sentence.
 */
export const marketSession = (at = new Date()) => {
  const now = istNow(at);

  if (WEEKEND.has(now.weekday)) {
    return { open: false, reason: 'weekend', clock: now.clock, weekday: now.weekday };
  }
  if (now.minutesSinceMidnight < OPEN_MINUTES) {
    return { open: false, reason: 'pre_open', clock: now.clock, weekday: now.weekday };
  }
  if (now.minutesSinceMidnight >= CLOSE_MINUTES) {
    return { open: false, reason: 'closed_for_day', clock: now.clock, weekday: now.weekday };
  }
  return { open: true, reason: 'open', clock: now.clock, weekday: now.weekday };
};

export const SESSION_TEXT = {
  open: 'Market open — 09:15 to 15:30 IST',
  weekend: 'Weekend — NSE is shut',
  pre_open: 'Before 09:15 IST — market has not opened',
  closed_for_day: 'After 15:30 IST — market has closed',
};
