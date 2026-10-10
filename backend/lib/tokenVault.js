/**
 * Broker credentials for live runs — in process memory only.
 *
 * The trading engine places orders on a user's behalf while their session is
 * open, so it needs that user's mStock api key and access token server-side for
 * the life of the session. This holds them in a Map and nowhere else:
 *
 *   - never written to the database
 *   - never written to a file
 *   - never logged, not even truncated
 *   - gone on logout, on session expiry, and on server restart
 *
 * The restart case is deliberate rather than unfortunate. Losing the tokens
 * means losing the ability to trade, so startup stops every run that was live
 * — which matches the rule that an algorithm only runs while someone is
 * actually connected.
 *
 * Keyed by app session token, so a user signed in on two devices has two
 * independent entries and logging out of one does not disarm the other.
 */

const vault = new Map();

/** Store (or refresh) the credentials for a session. */
export const rememberCredentials = (sessionToken, { apiKey, accessToken }) => {
  if (!sessionToken || !apiKey || !accessToken) return false;
  vault.set(sessionToken, { apiKey, accessToken, storedAt: Date.now() });
  return true;
};

/**
 * Credentials for a session, or null.
 * Callers must treat a null as "cannot trade right now" rather than retrying.
 */
export const credentialsFor = (sessionToken) => vault.get(sessionToken) ?? null;

export const hasCredentials = (sessionToken) => vault.has(sessionToken);

/** Drop one session's credentials — logout, expiry, or a failed broker call. */
export const forgetCredentials = (sessionToken) => vault.delete(sessionToken);

/** Drop every session belonging to a user — suspension, admin action. */
export const forgetUser = (userId, sessionTokens) => {
  let dropped = 0;
  for (const token of sessionTokens) {
    if (vault.delete(token)) dropped += 1;
  }
  if (dropped) console.log(`[vault] dropped ${dropped} credential set(s) for user ${userId}`);
  return dropped;
};

/** Keep only sessions the database still considers open. */
export const pruneTo = (openTokens) => {
  const keep = new Set(openTokens);
  let dropped = 0;
  for (const token of [...vault.keys()]) {
    if (!keep.has(token)) {
      vault.delete(token);
      dropped += 1;
    }
  }
  return dropped;
};

/** Counts only — never the values. Safe to log or expose to an admin view. */
export const vaultStats = () => ({
  sessions: vault.size,
  oldestStoredAt: vault.size
    ? new Date(Math.min(...[...vault.values()].map((entry) => entry.storedAt))).toISOString()
    : null,
});
