/**
 * The algorithms this platform sells — the server-side source of truth.
 *
 * This list drives THREE things, so it is the only place to edit when the
 * line-up changes:
 *   1. one `algo_<id>` column per algorithm on the `users` table
 *   2. what a user is allowed to run
 *   3. the price shown at checkout
 *
 * Add an entry and the column appears on next start. Remove an entry and the
 * column is dropped — see syncAlgoColumns() in schema.js, and note that
 * dropping discards every user's validity date for that algorithm.
 *
 * Keep the ids in step with test-project/src/lib/algorithms.js, which holds the
 * descriptive copy for the same list.
 */

/** Every purchase currently grants 30 days. */
export const VALIDITY_DAYS = 30;

/**
 * Arjuna only, for now.
 *
 * The other five were names with no strategy behind them. Selling a thing that
 * does nothing is worse than selling one thing that works, so they were
 * removed until each has a real implementation. Re-adding one is this list plus
 * a strategy module — the column, the entitlement and the checkout price all
 * follow automatically.
 */
export const ALGORITHMS = [
  { id: 'arjuna', name: 'Arjuna', style: 'Trend following', price_paise: 69900 },
];

export const ALGO_IDS = ALGORITHMS.map((algorithm) => algorithm.id);

/**
 * Column name for an algorithm. The `algo_` prefix is deliberate: the schema
 * sync drops unknown `algo_*` columns automatically, and without a prefix a
 * typo in this list could drop `email` or `phone` instead.
 */
export const algoColumn = (id) => `algo_${id}`;

export const ALGO_COLUMNS = ALGO_IDS.map(algoColumn);

export const findAlgo = (id) => ALGORITHMS.find((algorithm) => algorithm.id === id) ?? null;
