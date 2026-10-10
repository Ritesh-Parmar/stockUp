/**
 * Demo account — sign in with 123 / 123 / 123.
 *
 * Exists because the real mStock login needs an OTP the user cannot receive, so
 * the signed-in app would otherwise be untestable. Signing in with the demo
 * credentials walks the *real* login flow (OTP screen included) and lands on the
 * *real* pages — only the payloads that would have come from mStock are
 * synthesised here.
 *
 * The gate lives in the backend on purpose: the front end sends exactly the same
 * requests either way, so the demo UI cannot drift from the real one.
 *
 * Anything that does NOT need mStock credentials stays genuinely real for a demo
 * session — the activity log records real events, and the ticker serves real
 * Yahoo prices. Only broker-account data is invented.
 */

const DEMO_VALUE = '123';
export const DEMO_ACCESS_TOKEN = 'demo-session-token-do-not-use-for-real-calls';

export const isDemoCredentials = ({ username, password, apiKey }) =>
  username?.trim() === DEMO_VALUE && password === DEMO_VALUE && apiKey?.trim() === DEMO_VALUE;

export const isDemoApiKey = (apiKey) => apiKey?.trim() === DEMO_VALUE;
export const isDemoSession = (accessToken) => accessToken === DEMO_ACCESS_TOKEN;

export const demoSession = () => ({
  status: 'success',
  data: {
    user_type: 'individual',
    email: 'demo@example.com',
    user_name: 'Demo Account',
    user_shortname: 'Demo',
    broker: 'MIRAE',
    exchanges: ['NSE', 'NFO', 'BSE', 'BFO', 'CDS'],
    products: ['CNC', 'NRML', 'MIS'],
    order_types: ['MARKET', 'LIMIT', 'SL', 'SL-M'],
    avatar_url: '',
    user_id: 'DEMO123',
    api_key: DEMO_VALUE,
    access_token: DEMO_ACCESS_TOKEN,
    public_token: 'demo-public-token',
    login_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
    meta: { demat_consent: 'physical' },
  },
});

// Deterministic pseudo-random, so the same request gives the same numbers twice
// and the screen doesn't jitter between refreshes.
const seeded = (seed) => {
  let state = [...String(seed)].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const round = (value, places = 2) => Number(value.toFixed(places));

// ── Portfolio ──────────────────────────────────────────────────────────────

export const demoFundSummary = () => ({
  status: 'success',
  data: [{
    ADDITIONAL_MARGIN: '0.0',
    ADHOC_LIMIT: '0.0',
    AMOUNT_UTILIZED: '48216.35',
    AVAILABLE_BALANCE: '126483.65',
    BANK_HOLDING: '0.0',
    CLEAR_BALANCE: '118900.00',
    COLLATERALS: '55800.00',
    LIMIT_SOD: '174700.00',
    LIMIT_TYPE: 'CAPITAL',
    MF_COLLATERAL: '0.0',
    MTF_AVAILABLE_BALANCE: '126483.65',
    MTF_COLLATERAL: '0.0',
    MTF_UTILIZE: '0.0',
    MTM_COMBINED: '2841.20',
    OFS_UTILIZED: '0.0',
    OPT_BUY_PRIMIUM_UTILIZE: '0.0',
    PAY_OUT_AMT: '0.0',
    PEAK_MARGIN: '52310.80',
    PHYSICAL_MARGIN: '0.0',
    REALISED_PROFITS: '1264.50',
    RECEIVABLES: '0',
    SEG: 'A',
    SUM_OF_ALL: '174700.00',
    UNCLEAR_BALANCE: '0',
  }],
});

const HOLDING_ROWS = [
  ['RELIANCE', 'NSE', 2885, 'INE002A01018', 12, 0, 1358.4, 1412.6, 1394.25],
  ['TCS', 'NSE', 11536, 'INE467B01029', 5, 0, 3142.0, 3086.4, 3109.1],
  ['HDFCBANK', 'NSE', 1333, 'INE040A01034', 20, 5, 1602.75, 1663.25, 1654.15],
  ['INFY', 'NSE', 1594, 'INE009A01021', 15, 0, 1188.9, 1140.9, 1181.25],
  ['ITC', 'NSE', 1660, 'INE154A01025', 120, 0, 261.4, 267.7, 262.17],
  ['SBIN', 'NSE', 3045, 'INE062A01020', 40, 0, 798.3, 812.7, 807.8],
  ['LT', 'NSE', 11483, 'INE018A01030', 6, 0, 3498.2, 3542.8, 3515.2],
  ['AXISBANK', 'NSE', 5900, 'INE238A01034', 25, 0, 1090.6, 1071.45, 1074.7],
];

export const demoHoldings = () => ({
  status: 'success',
  data: HOLDING_ROWS.map(([tradingsymbol, exchange, token, isin, qty, t1, avg, last, close]) => ({
    tradingsymbol,
    exchange,
    instrument_token: token,
    isin,
    product: 'CNC',
    price: avg,
    quantity: qty,
    used_quantity: 0,
    t1_quantity: t1,
    realised_quantity: qty,
    authorised_quantity: 0,
    authorised_date: null,
    opening_quantity: qty,
    collateral_quantity: 0,
    collateral_type: null,
    discrepancy: false,
    average_price: avg,
    last_price: last,
    close_price: close,
    pnl: round((last - avg) * (qty + t1)),
    day_change: round(last - close),
    day_change_percentage: round(((last - close) / close) * 100),
  })),
});

const POSITION_ROWS = [
  ['ITC', 'NSE', 1660, 'MIS', 300, 0, 264.8, 267.7, 262.17],
  ['SBIN', 'NSE', 3045, 'MIS', 100, 0, 810.2, 812.7, 807.8],
  ['BHARTIARTL', 'NSE', 10604, 'MIS', -50, 0, 1655.0, 1642.3, 1650.45],
  ['RELIANCE', 'NSE', 2885, 'CNC', 12, 12, 1358.4, 1412.6, 1394.25],
];

const position = ([tradingsymbol, exchange, token, product, qty, overnight, avg, last, close]) => ({
  tradingsymbol,
  exchange,
  instrument_token: token,
  product,
  quantity: qty,
  overnight_quantity: overnight,
  multiplier: 1,
  average_price: avg,
  close_price: close,
  last_price: last,
  value: round(avg * Math.abs(qty)),
  pnl: round((last - avg) * qty),
  m2m: round((last - close) * qty),
  unrealised: round((last - avg) * qty),
  realised: 0,
  buy_quantity: qty > 0 ? Math.abs(qty) : 0,
  buy_price: qty > 0 ? avg : 0,
  buy_value: qty > 0 ? round(avg * Math.abs(qty)) : 0,
  buy_m2m: 0,
  sell_quantity: qty < 0 ? Math.abs(qty) : 0,
  sell_price: qty < 0 ? avg : 0,
  sell_value: qty < 0 ? round(avg * Math.abs(qty)) : 0,
  sell_m2m: 0,
  day_buy_quantity: product === 'MIS' && qty > 0 ? Math.abs(qty) : 0,
  day_buy_price: product === 'MIS' && qty > 0 ? avg : 0,
  day_buy_value: product === 'MIS' && qty > 0 ? round(avg * Math.abs(qty)) : 0,
  day_sell_quantity: product === 'MIS' && qty < 0 ? Math.abs(qty) : 0,
  day_sell_price: product === 'MIS' && qty < 0 ? avg : 0,
  day_sell_value: product === 'MIS' && qty < 0 ? round(avg * Math.abs(qty)) : 0,
});

export const demoPositions = () => ({
  status: 'success',
  data: {
    net: POSITION_ROWS.map(position),
    day: POSITION_ROWS.filter((row) => row[3] === 'MIS').map(position),
  },
});

const today = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
};

export const demoOrderBook = () => ({
  status: 'success',
  data: [
    { placed_by: 'DEMO123', order_id: '1151260919001', exchange_order_id: '1300000012345', parent_order_id: null, status: 'COMPLETE', status_message: null, order_timestamp: `${today()} 09:16:04`, exchange: 'NSE', tradingsymbol: 'ITC', order_type: 'MARKET', transaction_type: 'BUY', validity: 'DAY', product: 'MIS', quantity: 300, price: 0, trigger_price: 0, average_price: 264.8, filled_quantity: 300 },
    { placed_by: 'DEMO123', order_id: '1151260919002', exchange_order_id: '1300000012346', parent_order_id: null, status: 'COMPLETE', status_message: null, order_timestamp: `${today()} 09:21:37`, exchange: 'NSE', tradingsymbol: 'SBIN', order_type: 'LIMIT', transaction_type: 'BUY', validity: 'DAY', product: 'MIS', quantity: 100, price: 810.2, trigger_price: 0, average_price: 810.2, filled_quantity: 100 },
    { placed_by: 'DEMO123', order_id: '1151260919003', exchange_order_id: '1300000012390', parent_order_id: null, status: 'COMPLETE', status_message: null, order_timestamp: `${today()} 10:04:12`, exchange: 'NSE', tradingsymbol: 'BHARTIARTL', order_type: 'LIMIT', transaction_type: 'SELL', validity: 'DAY', product: 'MIS', quantity: 50, price: 1655, trigger_price: 0, average_price: 1655, filled_quantity: 50 },
    { placed_by: 'DEMO123', order_id: '1151260919004', exchange_order_id: '0', parent_order_id: null, status: 'OPEN', status_message: null, order_timestamp: `${today()} 11:32:51`, exchange: 'NSE', tradingsymbol: 'INFY', order_type: 'LIMIT', transaction_type: 'BUY', validity: 'DAY', product: 'CNC', quantity: 10, price: 1120, trigger_price: 0, average_price: 0, filled_quantity: 0 },
    { placed_by: 'DEMO123', order_id: '1151260919005', exchange_order_id: '0', parent_order_id: null, status: 'Rejected', status_message: 'RMS:Margin shortfall for CNC order in TCS', order_timestamp: `${today()} 12:08:19`, exchange: 'NSE', tradingsymbol: 'TCS', order_type: 'LIMIT', transaction_type: 'BUY', validity: 'DAY', product: 'CNC', quantity: 25, price: 3080, trigger_price: 0, average_price: 0, filled_quantity: 0 },
    { placed_by: 'DEMO123', order_id: '1151260919006', exchange_order_id: '0', parent_order_id: null, status: 'CANCELLED', status_message: null, order_timestamp: `${today()} 13:45:02`, exchange: 'NSE', tradingsymbol: 'AXISBANK', order_type: 'SL', transaction_type: 'SELL', validity: 'DAY', product: 'MIS', quantity: 25, price: 1060, trigger_price: 1065, average_price: 0, filled_quantity: 0 },
  ],
});

export const demoTradeBook = () => ({
  status: 'success',
  data: [
    { ALGO_ID: '0', BUY_SELL: 'Buy', CLIENT_ID: 'DEMO123', EXCHANGE: 'NSE', ORDER_NUMBER: '1151260919001', PRICE: 264.8, QUANTITY: 300, SYMBOL: 'ITC', TRADE_NUMBER: '206500101', TRADE_VALUE: 79440 },
    { ALGO_ID: '0', BUY_SELL: 'Buy', CLIENT_ID: 'DEMO123', EXCHANGE: 'NSE', ORDER_NUMBER: '1151260919002', PRICE: 810.2, QUANTITY: 100, SYMBOL: 'SBIN', TRADE_NUMBER: '206500102', TRADE_VALUE: 81020 },
    { ALGO_ID: '0', BUY_SELL: 'Sell', CLIENT_ID: 'DEMO123', EXCHANGE: 'NSE', ORDER_NUMBER: '1151260919003', PRICE: 1655, QUANTITY: 50, SYMBOL: 'BHARTIARTL', TRADE_NUMBER: '206500140', TRADE_VALUE: 82750 },
  ],
});

export const demoConvertPosition = () => ({
  status: 'success',
  message: 'Demo account — position conversion accepted (nothing was actually changed).',
});

// ── Market data ────────────────────────────────────────────────────────────

// Base prices for symbols the demo knows; anything else gets a stable price
// derived from its name, so any symbol the user types still returns something.
const BASE_PRICES = {
  RELIANCE: 1412.6, TCS: 3086.4, HDFCBANK: 1663.25, INFY: 1140.9, ICICIBANK: 1298.05,
  SBIN: 812.7, BHARTIARTL: 1642.3, ITC: 267.7, LT: 3542.8, AXISBANK: 1071.45,
  KOTAKBANK: 1784.9, HINDUNILVR: 2402.15, ACC: 1302.1, WIPRO: 254.3, MARUTI: 11248.6,
};

const bareSymbol = (symbol) => String(symbol).split(':').pop().replace(/-(EQ|A)$/, '');

const basePrice = (symbol) => {
  const name = bareSymbol(symbol);
  if (BASE_PRICES[name]) return BASE_PRICES[name];
  const random = seeded(name);
  return round(80 + random() * 2400);
};

const tokenFor = (symbol) => {
  const random = seeded(`token-${bareSymbol(symbol)}`);
  return Math.floor(random() * 90000) + 1000;
};

export const demoLtp = (symbols = []) => ({
  status: 'success',
  data: Object.fromEntries(symbols.map((symbol) => [symbol, {
    instrument_token: tokenFor(symbol),
    last_price: basePrice(symbol),
  }])),
});

export const demoOhlc = (symbols = []) => ({
  status: 'success',
  data: Object.fromEntries(symbols.map((symbol) => {
    const last = basePrice(symbol);
    const random = seeded(`ohlc-${bareSymbol(symbol)}`);
    const close = round(last * (0.985 + random() * 0.03));
    const open = round(close * (0.995 + random() * 0.01));
    return [symbol, {
      instrument_token: tokenFor(symbol),
      last_price: last,
      ohlc: {
        open,
        high: round(Math.max(open, last) * (1 + random() * 0.008)),
        low: round(Math.min(open, last) * (1 - random() * 0.008)),
        close,
      },
    }];
  })),
});

const INTERVAL_MINUTES = {
  minute: 1, '3minute': 3, '5minute': 5, '10minute': 10,
  '15minute': 15, '30minute': 30, '60minute': 60, day: 1440,
};

/**
 * Candles for the requested window, as a random walk around the symbol's base
 * price. Timestamps carry the same truncated "+05" offset the live API sends,
 * so the demo exercises the real parsing path.
 */
export const demoCandles = (instrumentToken, interval, from, to) => {
  const stepMinutes = INTERVAL_MINUTES[interval] ?? 1440;
  const start = new Date(String(from).replace(' ', 'T'));
  const end = new Date(String(to).replace(' ', 'T'));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { status: 'success', data: { candles: [] } };
  }

  const random = seeded(`candles-${instrumentToken}-${interval}-${from}`);
  let price = 80 + (Number(instrumentToken) % 2400);
  const candles = [];
  const pad = (value) => String(value).padStart(2, '0');

  for (let time = new Date(start); time <= end && candles.length < 500; time.setMinutes(time.getMinutes() + stepMinutes)) {
    // Skip weekends — the real exchange has no candles then.
    if (time.getDay() === 0 || time.getDay() === 6) continue;
    const open = round(price);
    const drift = (random() - 0.48) * open * 0.02;
    const close = round(open + drift);
    const high = round(Math.max(open, close) * (1 + random() * 0.006));
    const low = round(Math.min(open, close) * (1 - random() * 0.006));
    const volume = Math.floor(200000 + random() * 8000000);
    const stamp = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}T${pad(time.getHours())}:${pad(time.getMinutes())}:00+05`;
    candles.push([stamp, open, high, low, close, volume]);
    price = close;
  }
  return { status: 'success', data: { candles } };
};

const MOVERS = [
  ['INDUSINDBK', 'INDUSIND BANK LIMITED', 5258, 733.15, 6.33],
  ['ADANIENT', 'ADANI ENTERPRISES LTD', 25, 2418.6, 4.82],
  ['TATASTEEL', 'TATA STEEL LIMITED', 3499, 164.85, 3.94],
  ['ITC', 'ITC LTD', 1660, 267.7, 2.11],
  ['SBIN', 'STATE BANK OF INDIA', 3045, 812.7, 1.52],
  ['INFY', 'INFOSYS LIMITED', 1594, 1140.9, -3.42],
  ['TCS', 'TATA CONSULTANCY SERV LT', 11536, 3086.4, -2.18],
  ['WIPRO', 'WIPRO LIMITED', 3787, 254.3, -1.76],
  ['BHARTIARTL', 'BHARTI AIRTEL LIMITED', 10604, 1642.3, -0.49],
  ['AXISBANK', 'AXIS BANK LIMITED', 5900, 1071.45, -0.3],
];

export const demoLoserGainer = (params = {}) => {
  const wantGainers = String(params.TypeFlag ?? 'G').toUpperCase() === 'G';
  const rows = MOVERS.filter(([, , , , change]) => (wantGainers ? change > 0 : change < 0))
    .sort((left, right) => (wantGainers ? right[4] - left[4] : left[4] - right[4]));
  return {
    status: true,
    data: rows.map(([symbol, name, id, ltp, perChange]) => ({
      exchange: 'NSE',
      segment: 'E',
      security_id: id,
      ltp,
      Pclose: round(ltp / (1 + perChange / 100)),
      Open: round(ltp / (1 + perChange / 100)),
      TickSize: 0.05,
      Multiplier: 1,
      per_month_change: 0,
      month_change: 0,
      volume: Math.floor(500000 + Math.abs(perChange) * 2000000),
      per_change: perChange,
      change: round(ltp - ltp / (1 + perChange / 100)),
      symbol_name: name,
      isin: '',
      instrument: 'EQUITY',
      series: 'EQ',
      lot_size: 1,
      expiry_date: '01-01-0001 00:00:00',
      strike_price: '',
      option_type: '',
      display_name: name,
      symbol,
      exchange_inst_name: 'EQ',
      Message: '0',
    })),
  };
};

// ── Instrument master ──────────────────────────────────────────────────────

const instrument = (token, tradingsymbol, name, extra = {}) => ({
  instrument_token: String(token),
  exchange_token: String(token),
  tradingsymbol,
  name,
  last_price: '',
  expiry: '',
  strike: '',
  tick_size: '0.05',
  lot_size: '1',
  instrument_type: 'EQ',
  segment: 'EQ',
  exchange: 'NSE',
  ...extra,
});

/**
 * A scriptmaster of realistic shape and size. `variant` lets two "days" differ:
 * day two lists new option strikes, drops expired ones, and changes a lot size —
 * so Compare Instruments has genuine added / deleted / changed rows to show.
 */
export const demoInstruments = (variant = 0) => {
  const rows = Object.entries(BASE_PRICES).map(([symbol, price], index) =>
    instrument(1000 + index, symbol, `${symbol} LIMITED`, { last_price: String(price) }));

  // One name with a comma, the case that breaks naive CSV splitting.
  rows.push(instrument(4451, 'LICI', 'LIFE INSURANCE CORP OF INDIA, THE', { last_price: '414.25' }));

  if (variant === 1) {
    rows.push(instrument(9001, 'NEWLISTING', 'NEWLY LISTED VENTURES LTD', { last_price: '88.4' }));
  } else {
    rows.push(instrument(9002, 'DELISTEDCO', 'DELISTED HOLDINGS LIMITED', { last_price: '12.1' }));
  }

  const expiries = variant === 1
    ? ['2026-10-29', '2026-11-26', '2026-12-31']
    : ['2026-09-24', '2026-10-29', '2026-11-26'];
  const underlyings = [['NIFTY', 'NFO', 75], ['BANKNIFTY', 'NFO', 35], ['FINNIFTY', 'NFO', 65], ['SENSEX', 'BFO', 20]];

  // The token must be derived from the CONTRACT, not a running counter —
  // otherwise the same token means a September contract one day and an October
  // one the next, and every option shows up as "changed" instead of an expired
  // contract being deleted and a new one added, which is what really happens.
  const contractToken = (underlying, expiry, strike, type) => {
    const random = seeded(`${underlying}|${expiry}|${strike}|${type}`);
    return 100000 + Math.floor(random() * 800000);
  };

  for (const [underlying, exchange, lot] of underlyings) {
    for (const expiry of expiries) {
      for (let step = 0; step < 60; step += 1) {
        const strike = 23000 + step * 100;
        for (const type of ['CE', 'PE']) {
          const token = contractToken(underlying, expiry, strike, type);
          // One surviving contract's lot size changes between the two days.
          const lotSize = variant === 1 && underlying === 'NIFTY' && strike === 24000 && type === 'CE' ? 50 : lot;
          rows.push(instrument(token, `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${strike}${type}`, underlying, {
            expiry,
            strike: String(strike),
            lot_size: String(lotSize),
            instrument_type: type,
            segment: `${exchange}-OPT`,
            exchange,
            last_price: String(round(20 + ((token * 13) % 5000) / 10)),
          }));
        }
      }
    }
  }
  return rows;
};

/** Two dated snapshots so the Compare Instruments dropdowns have something to pick. */
export const demoSnapshotDays = () => {
  const day = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  return [day(0), day(1)];
};
