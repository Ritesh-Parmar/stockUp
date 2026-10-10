import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MConnect } from '@mstock-mirae-asset/nodetradingapi-typea';
import { captureSnapshot, diffInstruments, fetchScriptMaster, listSnapshots, readSnapshot } from './lib/instruments.js';
import { parseCsv, toCsv } from './lib/csv.js';
import { eventsForDay, listDays, recordEvents } from './lib/activityLog.js';
import { DATA_DIR } from './lib/paths.js';
import { getTickerQuotes } from './lib/ticker.js';
import {
  algoAccess, createSession, endSession, entitledAlgos, getUser, requireUser,
  updateProfile, upsertUser,
} from './lib/accounts.js';
import { ALGORITHMS, VALIDITY_DAYS, findAlgo } from './lib/algoCatalogue.js';
import { initSchema } from './lib/schema.js';
import { ensureEngine, engineSnapshot, reconcileEngines, stopEngine } from './lib/engine.js';
import { clearConfig, configFor, configsFor, saveConfig } from './lib/configs.js';
import {
  createOrder, failOrder, fulfilOrder, markWebhookProcessed, paymentByOrderId,
  paymentsFor, recordWebhook,
} from './lib/purchases.js';
import { activeProvider, checkProviderConfig, providerName } from './lib/payments.js';
import {
  activeRunIds, activeRuns, heartbeat, runHistory, startRun, stopRun,
  stopRunsForSession, stopRunsOnBoot, sweepStaleRuns,
} from './lib/runs.js';
import { forgetCredentials, rememberCredentials, vaultStats } from './lib/tokenVault.js';
import {
  DEMO_ACCESS_TOKEN, demoCandles, demoConvertPosition, demoFundSummary, demoHoldings,
  demoInstruments, demoLoserGainer, demoLtp, demoOhlc, demoOrderBook, demoPositions,
  demoSession, demoSnapshotDays, demoTradeBook, isDemoApiKey, isDemoCredentials, isDemoSession,
} from './lib/demoAccount.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
// Future fallback: restore these lines to use the API key stored in backend/.env.
// const envApiKey = process.env.MSTOCK_API_KEY;
// if (!envApiKey) throw new Error('MSTOCK_API_KEY is missing from backend/.env.');

app.use(cors());

// Two scriptmasters are ~23 MB of JSON — far over express.json()'s 100 kB
// default. This MUST be registered before the global parser below: the first
// json() middleware to see the request is the one that enforces the limit, so
// putting it on the route itself was too late and every upload died with a 413.
app.use('/api/instruments/compare', express.json({ limit: '64mb' }));
app.use('/api/algo/config', express.json({ limit: '8mb' }));
// The webhook signature covers the exact bytes Razorpay sent, so this route
// must keep the body unparsed. Registering it here is NOT cosmetic: the global
// express.json() below matches application/json, which is what Razorpay sends,
// and whichever parser runs first consumes the stream. Put this after it and
// express.raw() hands the route an empty buffer, the HMAC is computed over the
// wrong bytes, and every genuine webhook is rejected as a forgery.
app.use('/api/purchase/webhook', express.raw({ type: '*/*' }));
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

  // Demo account (123/123/123): walk the same two-step flow without touching mStock.
  if (isDemoCredentials({ username, password, apiKey })) {
    console.log('[demo] login accepted — OTP step is cosmetic, any code will verify');
    return res.json({ success: true, message: 'OTP sent. Enter it to complete sign-in.', data: { status: 'success', demo: true } });
  }

  try {
    const response = await createClient(apiKey).login({ username: username.trim(), password });
    // mStock reports bad credentials as HTTP 200 with status:"error" in the body,
    // so the SDK does not throw. Without this check a wrong password advanced the
    // user to the OTP screen as though it had worked.
    if (response?.status === 'error') {
      const message = response.message || 'Login failed.';
      console.error('[login] rejected by mStock:', message);
      return res.status(401).json({ success: false, error: message });
    }
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

  // Demo account: any OTP is accepted, so the screen behaves normally.
  if (isDemoApiKey(apiKey)) {
    const session = demoSession();
    const user = upsertUser({
      brokerUserId: session.data.user_id,
      fullName: session.data.user_name,
      email: session.data.email,
      isDemo: true,
    });
    const appSession = createSession(user.id, { ip: req.ip, userAgent: req.get('User-Agent') });
    // Armed with the demo token so the run flow behaves identically; nothing
    // real is ever sent to mStock with it.
    rememberCredentials(appSession, { apiKey, accessToken: DEMO_ACCESS_TOKEN });
    console.log('[demo] session issued for user', user.id);
    return res.json({ success: true, access_token: DEMO_ACCESS_TOKEN, session, app_session: appSession });
  }

  try {
    const session = await createClient(apiKey).generateSession({ api_key: apiKey, request_token: String(otp).trim(), checksum: 'W' });
    const accessToken = session.data?.access_token || session.access_token;
    if (!accessToken) throw new Error('mStock did not return an access token.');

    // The broker's user_id is our identity anchor — you cannot obtain it
    // without owning the account. No password system of our own, and no broker
    // credential is stored: the app issues its own opaque session token.
    const user = upsertUser({
      brokerUserId: session.data?.user_id,
      fullName: session.data?.user_name,
      email: session.data?.email,
    });
    const appSession = createSession(user.id, { ip: req.ip, userAgent: req.get('User-Agent') });

    // Hand the broker credentials to the in-memory vault so the engine can
    // trade for the life of this session. Memory only — never written anywhere.
    rememberCredentials(appSession, { apiKey, accessToken });

    res.json({ success: true, access_token: accessToken, session, app_session: appSession });

    // Capture today's instrument master in the background. Deliberately AFTER
    // res.json and never awaited: an 8 MB download must not delay sign-in, and
    // a failure here must never turn a successful login into an error.
    captureSnapshot(apiKey, accessToken)
      .then((result) => console.log('[snapshot]', result.saved ? `saved ${result.day} (${result.rows} rows)` : `${result.day} ${result.reason}`))
      .catch((snapshotError) => console.error('[snapshot] failed:', snapshotError.message));
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

// The scriptmaster download and its RFC 4180 parser now live in ./lib, shared
// with the daily snapshot capture.
const fetchInstruments = async (apiKey, accessToken) => parseCsv(await fetchScriptMaster(apiKey, accessToken));

const respondWithApiData = async (res, action, fallback) => {
  try {
    res.json({ success: true, data: await action() });
  } catch (error) {
    console.error('[api]', errorMessage(error, fallback));
    res.status(502).json({ success: false, error: errorMessage(error, fallback) });
  }
};

app.post('/api/portfolio/:operation', async (req, res) => {
  // Demo session: same routes, same shapes, invented numbers.
  if (isDemoSession(req.body.access_token)) {
    const demo = {
      funds: demoFundSummary, positions: demoPositions, holdings: demoHoldings,
      orders: demoOrderBook, trades: demoTradeBook, convert: demoConvertPosition,
    }[req.params.operation];
    if (!demo) return res.status(404).json({ success: false, error: 'Unknown portfolio operation.' });
    return res.json({ success: true, data: demo() });
  }

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
  const { symbols, exchange, instrument_token: instrumentToken, interval, from, to, gainersLosers } = req.body;

  if (isDemoSession(accessToken)) {
    const demo = {
      instruments: () => demoInstruments(1),
      ohlc: () => demoOhlc(symbols),
      ltp: () => demoLtp(symbols),
      historical: () => demoCandles(instrumentToken, interval, from, to),
      'gainers-losers': () => demoLoserGainer(gainersLosers),
    }[req.params.operation];
    if (!demo) return res.status(404).json({ success: false, error: 'Unknown market-data operation.' });
    return res.json({ success: true, data: demo() });
  }

  const client = authenticatedClient(accessToken, apiKey, res);
  if (!client) return;

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

// ── Top-bar market ticker ──────────────────────────────────────────────────
// Its own route rather than reusing /api/market/ohlc so the symbol list lives
// server-side and the response stays small — the browser polls this on a timer.
// Auth is OPTIONAL here. With a session it serves real-time mStock prices;
// without one it falls back to delayed Yahoo quotes, so the bar works before
// sign-in too. Never 401s — an empty top bar is worse than delayed prices.
app.post('/api/market-ticker', async (req, res) => {
  const accessToken = req.body.access_token;
  const apiKey = req.body.api_key?.trim();

  // Demo session: these prices need no mStock credentials, so they stay REAL —
  // only the source label changes, since calling delayed quotes "live" on a
  // trading screen would be worse than saying plainly that this is a demo.
  if (isDemoSession(accessToken)) {
    try {
      const feed = await getTickerQuotes(null);
      return res.json({ success: true, data: { ...feed, source: 'demo' } });
    } catch (error) {
      console.error('[ticker] demo feed failed:', error.message);
      return res.status(502).json({ success: false, error: error.message, failures: error.failures ?? [] });
    }
  }

  let client = null;
  if (accessToken && apiKey) {
    client = createClient(apiKey);
    client.setAccessToken(accessToken);
  }
  try {
    res.json({ success: true, data: await getTickerQuotes(client) });
  } catch (error) {
    // getTickerQuotes only throws when BOTH sources are exhausted. Everything it
    // knows about why is on error.failures — return it so the browser console
    // shows the same detail as the backend log.
    console.error('[ticker] request failed:', errorMessage(error, 'Ticker request failed'));
    res.status(502).json({
      success: false,
      error: errorMessage(error, 'Ticker request failed'),
      failures: error.failures ?? [],
    });
  }
});

// ── Instrument master snapshots ────────────────────────────────────────────

// The session token arrives as a header rather than a query param so a real
// access token never ends up in a URL (and therefore never in an access log).
const sessionToken = (req) => req.get('X-Session-Token') || req.body?.access_token || '';

app.get('/api/instruments/snapshots', async (req, res) => {
  if (isDemoSession(sessionToken(req))) {
    // Two made-up days so the compare dropdowns have something to pick.
    return res.json({ success: true, data: demoSnapshotDays().map((day) => ({ day, bytes: 11500000 })) });
  }
  try {
    res.json({ success: true, data: await listSnapshots() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/instruments/compare', async (req, res) => {
  const { from, to, oldCsv, newCsv } = req.body ?? {};

  // Demo session: diff two generated scriptmasters that differ on purpose, so
  // the added / deleted / changed lists are all non-empty.
  if (isDemoSession(sessionToken(req)) && !oldCsv && !newCsv) {
    const result = diffInstruments(toCsv(demoInstruments(0)), toCsv(demoInstruments(1)));
    const [newest, previous] = demoSnapshotDays();
    return res.json({ success: true, data: { ...result, from: from ?? previous, to: to ?? newest } });
  }

  try {
    // Either compare two stored snapshot dates, or two CSVs pasted up from the
    // browser for files that were never captured here.
    const left = oldCsv ?? (from ? await readSnapshot(from) : null);
    const right = newCsv ?? (to ? await readSnapshot(to) : null);
    if (!left || !right) {
      return res.status(400).json({ success: false, error: 'Provide two snapshot dates, or upload two CSV files.' });
    }
    const result = diffInstruments(left, right);
    res.json({ success: true, data: { ...result, from: from ?? 'uploaded', to: to ?? 'uploaded' } });
  } catch (error) {
    console.error('[compare]', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Catalogue, account, purchases ─────────────────────────────────

// What is for sale. No auth: the price list is public.
app.get('/api/algorithms', (_req, res) => {
  const payments = checkProviderConfig();
  res.json({
    success: true,
    data: {
      algorithms: ALGORITHMS,
      validityDays: VALIDITY_DAYS,
      provider: payments.name,
      // Enough for the page to warn honestly — simulated, test keys, or real
      // money. No secret is exposed: `live` is derived from the key ID prefix,
      // and the key ID is public by design.
      payments: {
        ready: payments.ok,
        live: Boolean(payments.live),
        webhookReady: Boolean(payments.webhookReady),
      },
    },
  });
});

/** Who am I, what do I own, what is running. The front end's one read. */
app.get('/api/me', requireUser, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        name: req.user.full_name,
        email: req.user.email,
        phone: req.user.phone,
        brokerUserId: req.user.broker_user_id,
        role: req.user.role,
        isDemo: Boolean(req.user.is_demo),
        tradingEnabled: Boolean(req.user.trading_enabled),
        capitalPaise: req.user.capital_paise,
      },
      // Every algorithm with its own validity date — there are no bundles.
      algos: algoAccess(req.user.id),
      entitledAlgos: entitledAlgos(req.user.id),
      runs: activeRuns(req.user.id),
      payments: paymentsFor(req.user.id),
      validityDays: VALIDITY_DAYS,
    },
  });
});

app.patch('/api/me', requireUser, (req, res) => {
  const { full_name: fullName, email, phone, capital_paise: capitalPaise } = req.body ?? {};
  const user = updateProfile(req.user.id, { fullName, email, phone, capitalPaise });
  res.json({ success: true, data: { capitalPaise: user.capital_paise } });
});

/**
 * Start a purchase. Records the intent and hands back what the browser needs.
 * Grants nothing — only a verified webhook grants.
 */
app.post('/api/purchase/checkout', requireUser, async (req, res) => {
  const algorithm = findAlgo(req.body?.algo_id);
  if (!algorithm) return res.status(400).json({ success: false, error: 'Unknown algorithm.' });
  try {
    const order = await activeProvider().createOrder({ algorithm, user: req.user });
    createOrder({
      userId: req.user.id, algoId: algorithm.id,
      provider: order.provider, orderId: order.orderId,
    });
    console.log(`[purchase] checkout started: user ${req.user.id}, ${algorithm.id}, ${order.orderId}`);
    res.json({ success: true, data: { ...order, algoId: algorithm.id } });
  } catch (error) {
    console.error('[purchase] checkout failed:', error.message);
    res.status(502).json({ success: false, error: error.message });
  }
});

/**
 * The provider's webhook — the ONE place access is granted.
 *
 * express.raw because the signature covers the exact bytes: parsing and
 * re-serialising the JSON changes whitespace and the HMAC stops matching.
 */
/**
 * The only event types that grant access. An allowlist, not "anything that is
 * not a failure": Razorpay sends a dozen event types, and `payment.authorized`
 * in particular means the money is held but NOT captured.
 *
 * `order.paid` is included because it is the authoritative "this order is
 * settled" event; fulfilOrder is idempotent, so receiving both it and
 * payment.captured grants once.
 */
const GRANTING_EVENTS = new Set(['payment.captured', 'order.paid']);

app.post('/api/purchase/webhook', (req, res) => {
  const provider = activeProvider();
  const result = provider.verifyWebhook(req.body, req.headers);
  if (!result.valid) {
    console.error('[purchase] webhook REJECTED:', result.reason);
    return res.status(400).json({ success: false, error: 'Invalid webhook signature.' });
  }

  const seen = recordWebhook({
    provider: provider.name,
    eventId: result.eventId,
    eventType: result.eventType,
    signatureValid: true,
    payload: result.payload,
  });
  // A replay is answered 200. Anything else and the provider retries forever.
  if (!seen.fresh) {
    console.log('[purchase] webhook replay ignored:', result.eventId);
    return res.json({ success: true, data: { replay: true } });
  }

  try {
    if (GRANTING_EVENTS.has(result.eventType)) {
      fulfilOrder({
        orderId: result.orderId,
        paymentId: result.paymentId,
        signature: req.get('x-razorpay-signature'),
        method: result.method,
      });
    } else if (result.eventType === 'payment.failed') {
      failOrder(result.orderId, 'reported failed by provider');
    } else {
      // Recorded above but acted on by nobody — `payment.authorized` is the
      // one that matters: the money is held, not captured, and granting on it
      // would hand out access for a payment that can still fall through.
      console.log(`[purchase] webhook ${result.eventType} recorded, no action taken`);
    }
    markWebhookProcessed(provider.name, result.eventId);
    res.json({ success: true });
  } catch (error) {
    console.error('[purchase] webhook processing failed:', error.message);
    markWebhookProcessed(provider.name, result.eventId, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * The browser's checkout callback, verified server-side.
 *
 * Razorpay hands the browser order id / payment id / signature, where the
 * signature is an HMAC only Razorpay can produce. Verifying it here is what
 * separates this from trusting the browser: a forged "I paid" POST fails the
 * HMAC and grants nothing.
 *
 * This exists alongside the webhook because a webhook cannot reach
 * 127.0.0.1 — on this machine it is the only path that will ever fire. Both go
 * through the same idempotent fulfilOrder(), so whichever lands first grants
 * and the other is a no-op.
 */
app.post('/api/purchase/verify', requireUser, (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body ?? {};
  const payment = orderId ? paymentByOrderId(orderId) : null;
  if (!payment) return res.status(400).json({ success: false, error: 'Unknown order.' });
  // Crediting somebody else's order would be a free algorithm.
  if (payment.user_id !== req.user.id) {
    console.error(`[purchase] user ${req.user.id} tried to verify order ${orderId} owned by user ${payment.user_id}`);
    return res.status(403).json({ success: false, error: 'That order belongs to another account.' });
  }

  // Signed against the order id from OUR row, not the one the browser echoed,
  // so the browser cannot steer which order gets credited.
  const result = activeProvider().verifyPaymentSignature({
    storedOrderId: payment.razorpay_order_id,
    paymentId,
    signature,
  });
  if (!result.valid) {
    console.error(`[purchase] callback signature REJECTED for ${orderId}: ${result.reason}`);
    failOrder(orderId, `signature rejected: ${result.reason}`);
    return res.status(400).json({ success: false, error: 'That payment could not be verified.' });
  }

  try {
    const granted = fulfilOrder({ orderId: payment.razorpay_order_id, paymentId, signature, method: 'checkout' });
    console.log(`[purchase] callback verified: user ${req.user.id}, ${payment.algo_id}, ${orderId}`);
    res.json({ success: true, data: { ...granted, algos: algoAccess(req.user.id) } });
  } catch (error) {
    console.error('[purchase] callback fulfilment failed:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Checkout reported a failed payment, or the customer dismissed it. Records the
 * outcome so the order does not sit as 'created' forever.
 *
 * Only ever moves 'created' -> 'failed', so this cannot undo a real payment: if
 * a webhook later says the money moved, fulfilOrder still grants.
 */
app.post('/api/purchase/failed', requireUser, (req, res) => {
  const { order_id: orderId, reason } = req.body ?? {};
  const payment = orderId ? paymentByOrderId(orderId) : null;
  if (!payment || payment.user_id !== req.user.id) {
    return res.status(400).json({ success: false, error: 'Unknown order.' });
  }
  failOrder(orderId, reason ?? 'reported failed by checkout');
  console.log(`[purchase] order ${orderId} marked failed: ${reason ?? 'no reason given'}`);
  res.json({ success: true });
});

/**
 * Stands in for the webhook while the mock provider is active. A separate route
 * on purpose: deleting it cannot leave a real deployment with an open way to
 * grant access, and it refuses to run once a real provider is configured.
 */
app.post('/api/purchase/mock-confirm', requireUser, (req, res) => {
  if (providerName() !== 'mock') {
    return res.status(403).json({ success: false, error: 'Mock confirmation is disabled when a real payment provider is active.' });
  }
  const orderId = req.body?.order_id;
  const payment = orderId ? paymentByOrderId(orderId) : null;
  if (!payment) return res.status(400).json({ success: false, error: 'Unknown order.' });
  // Confirming somebody else's order would be a free algorithm.
  if (payment.user_id !== req.user.id) {
    return res.status(403).json({ success: false, error: 'That order belongs to another account.' });
  }

  try {
    const result = fulfilOrder({ orderId, paymentId: `pay_mock_${Date.now()}`, method: 'mock' });
    res.json({ success: true, data: { ...result, algos: algoAccess(req.user.id) } });
  } catch (error) {
    console.error('[purchase] mock confirm failed:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Running algorithms ───────────────────────────────────────────

const sessionTokenOf = (req) => req.get('X-App-Session') || req.body?.app_session || '';

app.get('/api/runs', requireUser, (req, res) => {
  res.json({
    success: true,
    data: { active: activeRuns(req.user.id), history: runHistory(req.user.id, 25) },
  });
});

/**
 * Server-side gate for running an algorithm. The UI also greys out locked
 * strategies, but that is presentation — this is the control.
 */
app.post('/api/algo/start', requireUser, async (req, res) => {
  try {
    const saved = configFor(req.user.id, req.body?.algo_id);
    const run = startRun({
      userId: req.user.id,
      algoId: req.body?.algo_id,
      sessionToken: sessionTokenOf(req),
      // Recorded so a past run still says what it was run with, even after
      // the config is edited or retired.
      configId: saved?.id ?? null,
      capitalPaise: req.user.capital_paise,
    });
    console.log(`[algo] user ${req.user.id} started ${run.algo_id} (run ${run.id})`);

    // Awaited on purpose: seeding pulls real 5-minute candles, and answering
    // before that finishes would hand the UI a run with no prices and make a
    // working engine look broken for its first few seconds.
    try {
      await ensureEngine({ run, userId: req.user.id });
    } catch (error) {
      // The run exists but has no prices, so it cannot trade. Stop it rather
      // than leave a run that looks live and does nothing.
      console.error(`[algo] engine failed to start for run ${run.id}: ${error.message}`);
      stopRun(req.user.id, run.algo_id);
      return res.status(502).json({
        success: false,
        code: 'FEED_UNAVAILABLE',
        error: `Could not load market prices, so the algorithm was not started. ${error.message}`,
      });
    }

    res.json({ success: true, data: { run, active: activeRuns(req.user.id) } });
  } catch (error) {
    // 409 for "already running", 403 for everything else — the front end
    // shows a different message for each.
    const status = error.code === 'ALREADY_RUNNING' ? 409 : 403;
    console.warn(`[algo] start refused for user ${req.user.id}: ${error.code ?? 'ERROR'} ${error.message}`);
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.post('/api/algo/stop', requireUser, (req, res) => {
  // Capture the run ids before stopping, since afterwards they are no longer
  // active and there would be nothing left to match the engine against.
  const running = activeRuns(req.user.id).filter((run) => run.algo_id === req.body?.algo_id);
  const stopped = stopRun(req.user.id, req.body?.algo_id);
  for (const run of running) stopEngine(run.id);
  console.log(`[algo] user ${req.user.id} stopped ${req.body?.algo_id} (${stopped} run(s))`);
  res.json({ success: true, data: { stopped, active: activeRuns(req.user.id) } });
});

/**
 * Everything the live trading view needs, in one call.
 *
 * One endpoint rather than several because the figures must agree with each
 * other: a chart from one request and a P&L from another can disagree by a bar,
 * and on a screen shown to a broker that reads as a bug.
 */
app.get('/api/algo/live', requireUser, (req, res) => {
  const runs = activeRuns(req.user.id);
  if (!runs.length) {
    return res.json({ success: true, data: { running: false, reason: 'No algorithm is running.' } });
  }

  const run = runs[0];
  const snapshot = engineSnapshot(run.id, { historyBars: Number(req.query.bars) || 60 });

  if (!snapshot) {
    // The run is in the database but this process has no engine for it — a
    // backend restart does exactly this. Say so plainly instead of returning
    // an empty chart.
    return res.json({
      success: true,
      data: {
        running: false,
        reason: 'The backend restarted, so this run has no engine. Stop and start the algorithm again.',
        staleRun: { id: run.id, algoId: run.algo_id, startedAt: run.started_at },
      },
    });
  }

  res.json({ success: true, data: { running: true, ...snapshot } });
});

// ── Per-algorithm configuration ───────────────────────────────────

app.get('/api/algo/config', requireUser, (req, res) => {
  res.json({ success: true, data: configsFor(req.user.id) });
});

app.get('/api/algo/config/:algoId', requireUser, (req, res) => {
  res.json({ success: true, data: configFor(req.user.id, req.params.algoId) });
});

app.post('/api/algo/config', requireUser, (req, res) => {
  const { algo_id: algoId, label, params, source_file: sourceFile } = req.body ?? {};
  try {
    const saved = saveConfig({ userId: req.user.id, algoId, label, params, sourceFile });
    console.log(`[config] user ${req.user.id} saved ${algoId} (${saved.sourceFile ?? 'no file'})`);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('[config] save failed:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/algo/config/:algoId', requireUser, (req, res) => {
  res.json({ success: true, data: { cleared: clearConfig(req.user.id, req.params.algoId) } });
});

/**
 * The browser saying it is still open. Keeps the session and its runs alive;
 * without it the sweeper stops them, which is the whole point.
 */
app.post('/api/heartbeat', requireUser, (req, res) => {
  const kept = heartbeat(req.user.id, sessionTokenOf(req));
  res.json({ success: true, data: { runsKeptAlive: kept, active: activeRuns(req.user.id) } });
});

app.post('/api/logout', (req, res) => {
  const token = req.get('X-App-Session') || req.body?.app_session;
  // Stop runs before ending the session. A half-closed session that can still
  // trade is worse than one that cannot trade at all.
  if (token) {
    stopRunsForSession(token, 'session_closed');
    forgetCredentials(token);
  }
  endSession(token);
  res.json({ success: true });
});

// ── Activity log ───────────────────────────────────────────────────────────
app.post('/api/log', requireUser, (req, res) => {
  const { events, sessionId } = req.body ?? {};
  if (!Array.isArray(events)) return res.status(400).json({ success: false, error: 'events must be an array.' });
  try {
    // Attributed to the authenticated user, never to whatever the body claims.
    res.json({ success: true, written: recordEvents(events, sessionId, req.user.id) });
  } catch (error) {
    console.error('[log]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admins see every user's activity; everybody else sees only their own.
const logScope = (user) => (user.role === 'admin' ? null : user.id);

app.get('/api/log/days', requireUser, (req, res) => {
  try {
    res.json({ success: true, data: listDays(logScope(req.user)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/log/day/:day', requireUser, (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day)) {
    return res.status(400).json({ success: false, error: 'Expected a YYYY-MM-DD date.' });
  }
  try {
    res.json({ success: true, data: eventsForDay(req.params.day, logScope(req.user)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Express's default error page is HTML, which makes the browser's
// response.json() blow up with "Unexpected token '<'" and hides the real cause.
// Every failure from here answers in the same JSON envelope as everything else.
app.use((error, _req, res, _next) => {
  console.error('[error]', error.message);
  const status = error.status || error.statusCode || 500;
  const message = error.type === 'entity.too.large'
    ? 'Those files are too large to upload. Compare saved snapshot dates instead.'
    : error.message || 'Unexpected server error.';
  res.status(status).json({ success: false, error: message });
});

initSchema();

// Broker credentials live in memory only, so nothing from a previous process
// can still trade. Close out runs left 'running' rather than let them lie.
stopRunsOnBoot();

// Stop runs whose browser went quiet, whose session expired, or whose access
// lapsed. 30s is well inside the ~100s staleness window.
setInterval(() => {
  for (const stopped of sweepStaleRuns()) {
    console.log(`[runs] stopped run ${stopped.runId} (user ${stopped.userId}, ${stopped.algoId}) — ${stopped.reason}`);
  }
  // An engine outliving its run would keep paper-trading for a browser that
  // has gone. The sweeper owns run lifetime, so engines follow it rather than
  // tracking staleness a second time and risking the two disagreeing.
  const orphaned = reconcileEngines(activeRunIds());
  if (orphaned.length) console.log(`[engine] tore down ${orphaned.length} orphaned engine(s)`);
}, 30000).unref();

// Bound to loopback: this server has filesystem access and holds the activity
// database, so it must not be reachable from the network.
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log('OTP login: POST /api/login -> POST /api/verify');
  console.log(`Data directory: ${DATA_DIR}`);
  const payments = checkProviderConfig();
  if (payments.ok) {
    console.log(`Payment provider: ${payments.name}${payments.live ? ' (LIVE KEYS — real money)' : ''}`);
    if (payments.name === 'razorpay' && !payments.webhookReady) {
      // Expected on localhost, so this is information rather than a problem.
      console.log('  Webhook not configured — fine on localhost, where Razorpay cannot reach 127.0.0.1.');
      console.log('  Purchases are granted by the signed checkout callback instead (/api/purchase/verify).');
    }
  } else {
    // Loud but not fatal: half-set test credentials are a normal state while
    // setting this up, and the rest of the app still works.
    console.error(`Payment provider: ${payments.name} is NOT USABLE — `
      + (payments.missing ? `missing ${payments.missing.join(', ')}` : payments.reason));
    console.error('  Purchases will fail until that is fixed. PAYMENT_PROVIDER=mock to go back to the simulated flow.');
  }
  console.log(`Algorithms: ${ALGORITHMS.length}, ${VALIDITY_DAYS} days each`);
});

/**
 * Why the server exited.
 *
 * Without this, a port clash prints a bare stack trace and the process ends —
 * which from the terminal looks like "it starts and then stops immediately"
 * with no cause given. That has now wasted time twice, so the common case
 * explains itself and says what to do about it.
 */
server.on('error', (error) => {
  // The startup banner has usually already printed by the time this fires:
  // Express's listen callback runs before the bind error surfaces here, so the
  // terminal claims "Backend running at ..." for a server that is about to
  // die. Say so first, or the two messages simply contradict each other.
  console.error('\n================================================================');
  console.error(' IGNORE THE LINES ABOVE — this server did NOT start.');
  console.error('================================================================');

  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} is already in use.`);
    console.error('Something else is already serving the backend — most likely an older');
    console.error('copy of it still running in another terminal or in the background.\n');
    console.error('Find it and stop it:');
    console.error(`  netstat -ano | findstr "LISTENING" | findstr ":${port}"`);
    console.error('  taskkill /F /PID <the pid from the last column>\n');
    console.error('If the backend already works at that address, you do not need a second one.');
  } else if (error.code === 'EACCES') {
    console.error(`\nNot allowed to bind port ${port}. Try a different one: PORT=5001 node server.js`);
  } else {
    console.error('\nThe server failed to start:', error.message);
  }
  process.exit(1);
});
