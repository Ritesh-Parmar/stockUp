/**
 * Sample mStock payloads used by the public dashboard preview (/dashboard/preview).
 *
 * Every object here mirrors the real response shape documented at
 * https://tradingapi.mstock.com/docs/v1/typeA/ — including the quirks:
 *   - fund summary values arrive as strings
 *   - net positions are wrapped in { net, day } and `day` may be null
 *   - candle timestamps carry a one-part "+05" offset
 *   - loserGainer reports a boolean `status`, not "success"
 *   - the instrument master resolves to a bare array, with no { status, data } wrapper
 * Keep it that way so the preview exercises the same formatting code as the live app.
 */

export const demoSession = {
  status: 'success',
  data: {
    user_type: 'individual',
    user_name: 'Captain Candlestick',
    broker: 'MIRAE',
    exchanges: ['NSE', 'NFO', 'CDS'],
    products: ['CNC', 'NRML', 'MIS'],
    order_types: ['MARKET', 'LIMIT'],
    user_id: '538',
    api_key: 'dashboard-preview-key',
    access_token: 'dashboard-preview-token',
    login_time: '2026-08-26 09:12:04',
  },
}

// A handful of genuine scriptmaster rows, including one whose name contains a
// comma — the exact case the SDK's naive CSV split used to corrupt.
const INSTRUMENT_SEED = [
  { instrument_token: '1', exchange_token: '1', tradingsymbol: 'GOLDSTAR', name: 'GOLDSTAR POWER LIMITED', last_price: '', expiry: '', strike: '', tick_size: '0.05', lot_size: '1', instrument_type: 'SM', segment: 'SM', exchange: 'NSE' },
  { instrument_token: '22', exchange_token: '22', tradingsymbol: 'ACC-EQ', name: 'ACC LIMITED', last_price: '1302.1', expiry: '', strike: '', tick_size: '0.05', lot_size: '1', instrument_type: 'EQ', segment: 'EQ', exchange: 'NSE' },
  { instrument_token: '1660', exchange_token: '1660', tradingsymbol: 'ITC-EQ', name: 'ITC LIMITED', last_price: '267.7', expiry: '', strike: '', tick_size: '0.05', lot_size: '1', instrument_type: 'EQ', segment: 'EQ', exchange: 'NSE' },
  { instrument_token: '4451', exchange_token: '4451', tradingsymbol: 'LICI-EQ', name: 'LIFE INSURANCE CORP OF INDIA, THE', last_price: '414.25', expiry: '', strike: '', tick_size: '0.05', lot_size: '1', instrument_type: 'EQ', segment: 'EQ', exchange: 'NSE' },
  { instrument_token: '500410', exchange_token: '500410', tradingsymbol: 'ACC-A', name: 'ACC LIMITED', last_price: '1303.45', expiry: '', strike: '', tick_size: '0.05', lot_size: '1', instrument_type: 'A', segment: 'EQ', exchange: 'BSE' },
  { instrument_token: '57346', exchange_token: '57346', tradingsymbol: 'NIFTY2672124150CE', name: 'NIFTY', last_price: '99.2', expiry: '2026-07-21', strike: '24150', tick_size: '0.05', lot_size: '75', instrument_type: 'CE', segment: 'NFO-OPT', exchange: 'NFO' },
]

/**
 * The live scriptmaster is roughly 100,000 rows, and the preview has to be honest
 * about that or the "too large to display" path never shows up while testing.
 * Pad the real seed rows out to a realistic size with derived option contracts.
 */
function buildInstruments() {
  const instruments = [...INSTRUMENT_SEED]
  const strikes = [23000, 23500, 24000, 24150, 24500, 25000, 25500, 26000]
  const expiries = ['2026-09-24', '2026-10-29', '2026-11-26', '2026-12-31']
  const underlyings = [['NIFTY', 'NFO', 75], ['BANKNIFTY', 'NFO', 35], ['FINNIFTY', 'NFO', 65], ['SENSEX', 'BFO', 20]]
  let token = 60000
  for (const [underlying, exchange, lot] of underlyings) {
    for (const expiry of expiries) {
      for (const strike of strikes) {
        for (const type of ['CE', 'PE']) {
          for (let variant = 0; variant < 8; variant += 1) {
            token += 1
            instruments.push({
              instrument_token: String(token),
              exchange_token: String(token),
              tradingsymbol: `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${strike + variant * 50}${type}`,
              name: underlying,
              last_price: (50 + ((token * 7) % 4000) / 10).toFixed(2),
              expiry,
              strike: String(strike + variant * 50),
              tick_size: '0.05',
              lot_size: String(lot),
              instrument_type: type,
              segment: `${exchange}-OPT`,
              exchange,
            })
          }
        }
      }
    }
  }
  return instruments
}

const DEMO_RESPONSES = {
  'Fund summary': { status: 'success', data: [{ AVAILABLE_BALANCE: '1016.11', AMOUNT_UTILIZED: '36239.24', LIMIT_SOD: '38880.11', MTM_COMBINED: '-1470.76', REALISED_PROFITS: '-154', PEAK_MARGIN: '17768.47', CLEAR_BALANCE: '862.11', COLLATERALS: '74668', LIMIT_TYPE: 'CAPITAL', SEG: 'A' }] },
  'Net positions': { status: 'success', data: { net: [{ tradingsymbol: 'DCBBANK', exchange: 'NSE', instrument_token: 8938, product: 'MIS', quantity: 38, overnight_quantity: 0, average_price: 185.69, close_price: 185.69, last_price: 188.25, value: 7056.22, pnl: 0, m2m: 97.28, unrealised: 0, realised: 0 }, { tradingsymbol: 'ITC', exchange: 'NSE', instrument_token: 1660, product: 'MIS', quantity: 231, overnight_quantity: 0, average_price: 275.21, close_price: 273.95, last_price: 267.7, value: 79143.05, pnl: -174, m2m: -1559.25, unrealised: 0, realised: -174 }, { tradingsymbol: 'INFY', exchange: 'BSE', instrument_token: 500209, product: 'CNC', quantity: 2, overnight_quantity: 2, average_price: 1164.3, close_price: 1164.3, last_price: 1140.9, value: 2328.6, pnl: 0, m2m: -46.8, unrealised: 0, realised: 0 }], day: [{ tradingsymbol: 'ITC', exchange: 'NSE', instrument_token: 1660, product: 'MIS', quantity: 231, overnight_quantity: 0, average_price: 275.21, close_price: 273.95, last_price: 267.7, value: 79143.05, pnl: -174, m2m: -1559.25, unrealised: 0, realised: -174 }] } },
  Holdings: { status: 'success', data: [{ tradingsymbol: 'DCBBANK', exchange: 'NSE', instrument_token: 8938, isin: 'INE503A01015', product: 'CNC', price: 184.92, quantity: 6, t1_quantity: 0, average_price: 184.92, last_price: 188.83, close_price: 181.81, pnl: 23.46, day_change: 7.02, day_change_percentage: 3.86 }, { tradingsymbol: 'ITC', exchange: 'NSE', instrument_token: 1660, isin: 'INE154A01025', product: 'CNC', price: 276.38, quantity: 3, t1_quantity: 2, average_price: 276.38, last_price: 267.7, close_price: 267.05, pnl: -26.04, day_change: 0.65, day_change_percentage: 0.24 }, { tradingsymbol: 'LICI', exchange: 'NSE', instrument_token: 4451, isin: 'INE0J1Y01017', product: 'CNC', price: 0, quantity: 2, t1_quantity: 0, average_price: 0, last_price: 414.25, close_price: 413.1, pnl: 828.5, day_change: 1.15, day_change_percentage: 0.28 }] },
  'Last traded prices': { status: 'success', data: { 'NSE:ACC-EQ': { instrument_token: 22, last_price: 1302.1 }, 'BSE:ACC-A': { instrument_token: 500410, last_price: 1303.45 } } },
  'OHLC data': { status: 'success', data: { 'NSE:ITC-EQ': { instrument_token: 1660, last_price: 267.75, ohlc: { open: 268.2, high: 268.55, low: 266.75, close: 267.05 } }, 'NSE:ACC-EQ': { instrument_token: 22, last_price: 1302.1, ohlc: { open: 1390, high: 1393.2, low: 1370.2, close: 1383.2 } } } },
  'Historical candle data': { status: 'success', data: { candles: [['2026-08-03T09:15:00+05', 284.45, 292.5, 283, 287, 45392755], ['2026-08-04T09:15:00+05', 286.05, 289, 284.7, 289, 12689243], ['2026-08-05T09:15:00+05', 288.25, 288.5, 285.05, 286.95, 11771241], ['2026-08-06T09:15:00+05', 285.45, 286.35, 283.8, 285.9, 12447629], ['2026-08-07T09:15:00+05', 285, 285.9, 284.5, 286.1, 6128841]] } },
  'Top gainers': { status: true, data: [{ exchange: 'NSE', segment: 'E', security_id: 5258, ltp: 733.15, volume: 6211517, per_change: 6.33, change: 43.65, symbol_name: 'INDUSIND BANK LIMITED', symbol: 'INDUSINDBK', display_name: 'INDUSIND BANK LIMITED', isin: 'INE095A01012', series: 'EQ', lot_size: 1 }, { exchange: 'NSE', segment: 'E', security_id: 1660, ltp: 267.7, volume: 18422100, per_change: 2.11, change: 5.53, symbol_name: 'ITC LIMITED', symbol: 'ITC', display_name: 'ITC LIMITED', isin: 'INE154A01025', series: 'EQ', lot_size: 1 }] },
  'Top losers': { status: true, data: [{ exchange: 'NSE', segment: 'E', security_id: 500209, ltp: 1140.9, volume: 9330422, per_change: -3.42, change: -40.35, symbol_name: 'INFOSYS LIMITED', symbol: 'INFY', display_name: 'INFOSYS LIMITED', isin: 'INE009A01021', series: 'EQ', lot_size: 1 }, { exchange: 'NSE', segment: 'E', security_id: 4451, ltp: 414.25, volume: 1204533, per_change: -1.08, change: -4.52, symbol_name: 'LIFE INSURANCE CORP OF INDIA', symbol: 'LICI', display_name: 'LIFE INSURANCE CORP OF INDIA', isin: 'INE0J1Y01017', series: 'EQ', lot_size: 1 }] },
  'Instrument master': buildInstruments(),
  'Order book': { status: 'success', data: [{ placed_by: 'MA68XXXXX', order_id: '1151240930103', exchange_order_id: '0', parent_order_id: null, status: 'Rejected', status_message: 'RMS:1151240930103:NSE,EQUITY,1594,INFY', order_timestamp: '30-09-2024 15:45:46', exchange: 'NSE', tradingsymbol: 'INFY', order_type: 'LIMIT', transaction_type: 'BUY', validity: 'DAY', product: 'INTRADAY', quantity: 10, price: 1250, trigger_price: 0, average_price: 0, filled_quantity: 0 }, { placed_by: 'MA68XXXXX', order_id: '1151240930104', exchange_order_id: '110023', parent_order_id: null, status: 'COMPLETE', status_message: null, order_timestamp: '30-09-2024 09:31:02', exchange: 'NSE', tradingsymbol: 'ITC', order_type: 'MARKET', transaction_type: 'BUY', validity: 'DAY', product: 'CNC', quantity: 3, price: 0, trigger_price: 0, average_price: 276.38, filled_quantity: 3 }] },
  'Trade book': { status: 'success', data: [{ ALGO_ID: '0', BUY_SELL: 'Sell', CLIENT_ID: 'MA68XXXXX', EXCHANGE: 'NSE', ORDER_NUMBER: '21612506101476', PRICE: 6.98, QUANTITY: 4, SYMBOL: 'IDEA', TRADE_NUMBER: '206465040', TRADE_VALUE: 27.92 }, { ALGO_ID: '0', BUY_SELL: 'Buy', CLIENT_ID: 'MA68XXXXX', EXCHANGE: 'NSE', ORDER_NUMBER: '21612506101477', PRICE: 276.38, QUANTITY: 3, SYMBOL: 'ITC', TRADE_NUMBER: '206465041', TRADE_VALUE: 829.14 }] },
}

export const demoResponse = (title) =>
  DEMO_RESPONSES[title] ?? { status: 'success', data: { message: 'This demo response is waiting for its real API shape.' } }
