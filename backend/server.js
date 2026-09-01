import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MConnect } from '@mstock-mirae-asset/nodetradingapi-typea';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
// Future fallback: restore these lines to use the API key stored in backend/.env.
// const envApiKey = process.env.MSTOCK_API_KEY;
// if (!envApiKey) throw new Error('MSTOCK_API_KEY is missing from backend/.env.');

app.use(cors());
app.use(express.json());

const createClient = (apiKey) => new MConnect({ api_key: apiKey });
const errorMessage = (error, fallback) => error.response?.data?.message || error.message || fallback;
const requestApiKey = (req, res) => {
  const apiKey = req.body.api_key?.trim();
  if (!apiKey) {
    res.status(400).json({ success: false, error: 'API key is required.' });
    return null;
  }
  return apiKey;
};

// Step 1: validate credentials and send an OTP.
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const apiKey = requestApiKey(req, res);
  if (!apiKey) return;
  if (!username?.trim() || !password) return res.status(400).json({ success: false, error: 'Username and password are required.' });
  try {
    const response = await createClient(apiKey).login({ username: username.trim(), password });
    res.json({ success: true, message: 'OTP sent. Enter it to complete sign-in.', data: response });
  } catch (error) {
    console.error('[login]', errorMessage(error, 'Login failed'));
    res.status(401).json({ success: false, error: errorMessage(error, 'Login failed') });
  }
});

// Step 2: exchange the user-entered OTP for an authenticated session.
app.post('/api/verify', async (req, res) => {
  const { otp } = req.body;
  const apiKey = requestApiKey(req, res);
  if (!apiKey) return;
  if (!String(otp || '').trim()) return res.status(400).json({ success: false, error: 'OTP is required.' });
  try {
    const session = await createClient(apiKey).generateSession({ api_key: apiKey, request_token: String(otp).trim(), checksum: 'W' });
    const accessToken = session.data?.access_token || session.access_token;
    if (!accessToken) throw new Error('mStock did not return an access token.');
    res.json({ success: true, access_token: accessToken, session });
  } catch (error) {
    console.error('[verify]', errorMessage(error, 'OTP verification failed'));
    res.status(401).json({ success: false, error: errorMessage(error, 'OTP verification failed') });
  }
});

const authenticatedClient = (accessToken, apiKey, res) => {
  if (!accessToken) {
    res.status(400).json({ success: false, error: 'Access token is required.' });
    return null;
  }
  if (!apiKey) {
    res.status(400).json({ success: false, error: 'API key is required.' });
    return null;
  }
  const client = createClient(apiKey);
  client.setAccessToken(accessToken);
  return client;
};

const SCRIPT_MASTER_URL = 'https://api.mstock.trade/openapi/typea/instruments/scriptmaster';

// RFC 4180 field splitting: honours quoted fields (and doubled "" escapes) so a
// company name containing a comma cannot shift the rest of the row.
const parseCsvLine = (line) => {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') value += char;
      else if (line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
};

// The SDK's getInstruments() parses the scriptmaster with a plain line.split(','),
// which corrupts every row whose name contains a comma ("LIFE INSURANCE CORP OF
// INDIA, THE" and friends). Fetch the CSV ourselves and parse it properly.
const fetchInstruments = async (apiKey, accessToken) => {
  const response = await fetch(SCRIPT_MASTER_URL, {
    headers: { Authorization: `token ${apiKey}:${accessToken}`, 'X-Mirae-Version': '1', Tag: 'typea' },
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.text();
  if (body.trimStart().startsWith('{')) {
    const parsed = JSON.parse(body);
    throw new Error(parsed.message || 'Instrument master request was rejected.');
  }
  if (!response.ok) throw new Error(`Instrument master request failed (${response.status}).`);

  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
};

const respondWithApiData = async (res, action, fallback) => {
  try {
    res.json({ success: true, data: await action() });
  } catch (error) {
    console.error('[api]', errorMessage(error, fallback));
    res.status(502).json({ success: false, error: errorMessage(error, fallback) });
  }
};

app.post('/api/portfolio/:operation', async (req, res) => {
  const client = authenticatedClient(req.body.access_token, req.body.api_key?.trim(), res);
  if (!client) return;

  // Read-only by design: order placement/modification/cancellation is deliberately
  // not exposed here — those move real money and need an explicit decision first.
  const operations = {
    funds: () => client.getFundSummary(),
    positions: () => client.getNetPositions(),
    holdings: () => client.getHoldings(),
    orders: () => client.getOrderBook(),
    trades: () => client.getTradeBook(),
    convert: () => client.convertPosition(req.body.position),
  };
  const operation = operations[req.params.operation];
  if (!operation) return res.status(404).json({ success: false, error: 'Unknown portfolio operation.' });
  if (req.params.operation === 'convert') {
    const required = ['tradingsymbol', 'exchange', 'transaction_type', 'position_type', 'quantity', 'old_product', 'new_product'];
    const missing = required.filter((field) => !req.body.position?.[field]);
    if (missing.length) return res.status(400).json({ success: false, error: `Missing conversion fields: ${missing.join(', ')}` });
  }
  await respondWithApiData(res, operation, 'Portfolio request failed');
});

app.post('/api/market/:operation', async (req, res) => {
  const accessToken = req.body.access_token;
  const apiKey = req.body.api_key?.trim();
  const client = authenticatedClient(accessToken, apiKey, res);
  if (!client) return;
  const { symbols, exchange, instrument_token: instrumentToken, interval, from, to, gainersLosers } = req.body;

  const operations = {
    instruments: () => fetchInstruments(apiKey, accessToken),
    ohlc: () => client.getOHLC(symbols),
    ltp: () => client.getLTP(symbols),
    historical: () => client.getHistoricalCandleData(exchange, instrumentToken, interval, from, to),
    'gainers-losers': () => client.loserGainer(gainersLosers),
  };
  const operation = operations[req.params.operation];
  if (!operation) return res.status(404).json({ success: false, error: 'Unknown market-data operation.' });
  if (['ohlc', 'ltp'].includes(req.params.operation) && (!Array.isArray(symbols) || !symbols.length)) return res.status(400).json({ success: false, error: 'Enter at least one exchange:symbol value.' });
  if (req.params.operation === 'historical' && (!exchange || !instrumentToken || !interval || !from || !to)) return res.status(400).json({ success: false, error: 'Exchange, instrument token, interval, from, and to are required.' });
  if (req.params.operation === 'gainers-losers' && !gainersLosers) return res.status(400).json({ success: false, error: 'Gainers/losers parameters are required.' });
  await respondWithApiData(res, operation, 'Market-data request failed');
});

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log('OTP login: POST /api/login -> POST /api/verify');
});
