/**
 * The algorithms a user can pick from.
 *
 * Arjuna only. Five other names used to sit here with no strategy behind any of
 * them, which meant the store sold things that did nothing. They were removed
 * rather than left as decoration; see backend/lib/algoCatalogue.js, which is
 * the server-side source of truth and must stay in step with this file.
 *
 * This holds the descriptive copy. The price, the validity and what a user is
 * allowed to run all come from the backend.
 */
export const ALGORITHMS = [
  {
    id: 'arjuna',
    name: 'Arjuna',
    tagline: 'Moving-average crossover',
    description: 'Keeps a fast and a slow average of each stock. Buys when the fast one rises through the slow one, sells when it falls back through. A stop-loss and a take-profit limit each position.',
    style: 'Trend following',
    timeframe: 'Intraday · 5-minute bars',
    risk: 'Moderate',
    accent: 'emerald',
  },
]

export const findAlgorithm = (id) => ALGORITHMS.find((algorithm) => algorithm.id === id) ?? null

// Tailwind needs whole class names at build time, so the accent colours are
// written out rather than composed as `border-${accent}-400`.
export const ACCENT_CLASSES = {
  emerald: { border: 'border-emerald-400/50', bg: 'bg-emerald-400/5', text: 'text-emerald-400', hover: 'hover:border-emerald-400 hover:bg-emerald-400/10' },
  amber: { border: 'border-amber-400/50', bg: 'bg-amber-400/5', text: 'text-amber-400', hover: 'hover:border-amber-400 hover:bg-amber-400/10' },
  indigo: { border: 'border-indigo-400/50', bg: 'bg-indigo-400/5', text: 'text-indigo-400', hover: 'hover:border-indigo-400 hover:bg-indigo-400/10' },
  sky: { border: 'border-sky-400/50', bg: 'bg-sky-400/5', text: 'text-sky-400', hover: 'hover:border-sky-400 hover:bg-sky-400/10' },
  rose: { border: 'border-rose-400/50', bg: 'bg-rose-400/5', text: 'text-rose-400', hover: 'hover:border-rose-400 hover:bg-rose-400/10' },
  violet: { border: 'border-violet-400/50', bg: 'bg-violet-400/5', text: 'text-violet-400', hover: 'hover:border-violet-400 hover:bg-violet-400/10' },
}

export const RISK_CLASSES = {
  Low: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  Moderate: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  High: 'text-rose-400 border-rose-400/30 bg-rose-400/5',
}
