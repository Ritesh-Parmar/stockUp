/**
 * Placeholder quotes for the top-bar ticker, shown only when neither market
 * source can be reached — the bar renders these under a SAMPLE badge rather
 * than sitting empty. Symbols match the live feed (see backend/lib/ticker.js).
 */
export const FALLBACK_QUOTES = [
  { symbol: 'RELIANCE', last: 1412.6, change: 18.35, changePercent: 1.32 },
  { symbol: 'TCS', last: 3086.4, change: -22.7, changePercent: -0.73 },
  { symbol: 'HDFCBANK', last: 1663.25, change: 9.1, changePercent: 0.55 },
  { symbol: 'INFY', last: 1140.9, change: -40.35, changePercent: -3.42 },
  { symbol: 'ICICIBANK', last: 1298.05, change: 6.45, changePercent: 0.5 },
  { symbol: 'SBIN', last: 812.7, change: 4.9, changePercent: 0.61 },
  { symbol: 'BHARTIARTL', last: 1642.3, change: -8.15, changePercent: -0.49 },
  { symbol: 'ITC', last: 267.7, change: 5.53, changePercent: 2.11 },
  { symbol: 'LT', last: 3542.8, change: 27.6, changePercent: 0.79 },
  { symbol: 'AXISBANK', last: 1071.45, change: -3.25, changePercent: -0.3 },
]
