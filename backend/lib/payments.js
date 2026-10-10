import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Payment providers, behind one interface.
 *
 * `mock` stays the default so the app runs with no account and no keys.
 * `PAYMENT_PROVIDER=razorpay` switches to the real thing with no caller changes.
 *
 * The rule that matters: **access is granted only by an HMAC-verified message**,
 * never by the browser saying "it worked". There are two such messages, and
 * both are signed with a secret the browser does not have:
 *
 *   1. the webhook      — HMAC-SHA256 over the raw body, webhook secret
 *   2. the checkout callback — HMAC-SHA256 over `order_id|payment_id`, key secret
 *
 * Both funnel into the same idempotent fulfilOrder(), so whichever arrives
 * first grants the 30 days and the other is a no-op. That redundancy is not
 * belt-and-braces here, it is necessary: a webhook cannot reach 127.0.0.1, so
 * on this machine the callback is the only path that will ever fire. Once the
 * backend is deployed somewhere public the webhook becomes the reliable one,
 * because it still arrives if the customer closes the tab mid-payment.
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Constant-time compare that cannot throw on a length mismatch.
 *
 * timingSafeEqual requires equal lengths, so a short or malformed signature
 * would throw instead of returning false — and an exception on a bad signature
 * is a 500 where a 400 belongs.
 */
const signaturesMatch = (expected, received) => {
  const a = Buffer.from(String(expected), 'utf8');
  const b = Buffer.from(String(received ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const mock = {
  name: 'mock',

  configured: () => ({ ok: true }),

  async createOrder({ algorithm }) {
    return {
      provider: 'mock',
      orderId: `order_mock_${randomUUID().replaceAll('-', '').slice(0, 14)}`,
      amountPaise: algorithm.price_paise,
      currency: 'INR',
      // No hosted checkout exists, so the browser confirms against
      // /api/purchase/mock-confirm, which stands in for the webhook.
      checkout: { kind: 'mock' },
    };
  },

  /** Nothing external signs this, so there is nothing to verify. */
  verifyWebhook(rawBody) {
    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const parsed = JSON.parse(payload);
    return {
      valid: true,
      eventId: parsed.event_id ?? `mock_${randomUUID()}`,
      eventType: parsed.event ?? 'payment.captured',
      orderId: parsed.order_id,
      paymentId: parsed.payment_id ?? null,
      method: parsed.method ?? 'mock',
      payload,
    };
  },

  verifyPaymentSignature() {
    return { valid: false, reason: 'the mock provider has no checkout callback; use /api/purchase/mock-confirm' };
  },
};

/**
 * Razorpay — INR-native, and Razorpay Subscriptions handles the UPI AutoPay /
 * card e-mandate lifecycle that RBI rules require for recurring charges. Access
 * here is a one-off 30-day purchase, so plain Orders are enough; subscriptions
 * would only matter if this became auto-renewing.
 */
const razorpay = {
  name: 'razorpay',

  /**
   * Checked at startup rather than at the first purchase, so a misconfigured
   * deployment fails immediately instead of when a customer tries to pay.
   */
  configured() {
    // Only the key pair is required. The WEBHOOK secret is deliberately
    // optional: a webhook cannot reach 127.0.0.1, so on a local machine there
    // is nothing for it to verify and demanding it would block a setup that
    // otherwise works end to end. It becomes required once this is hosted.
    const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
      .filter((name) => !process.env[name]);
    if (missing.length) return { ok: false, missing };
    if (!process.env.RAZORPAY_KEY_ID.startsWith('rzp_')) {
      return { ok: false, reason: 'RAZORPAY_KEY_ID should look like rzp_test_… or rzp_live_…' };
    }
    return {
      ok: true,
      live: process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_'),
      webhookReady: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    };
  },

  /**
   * POST /v1/orders with HTTP Basic auth.
   *
   * `amount` is in paise, which is why money is stored as INTEGER PAISE
   * throughout — the stored figure goes straight out with no float rounding.
   * `receipt` is our own reference, max 40 characters and unique.
   */
  async createOrder({ algorithm, user }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured on the server.');

    // Unique per attempt: Razorpay rejects a duplicate receipt, and a user may
    // legitimately retry after abandoning a checkout.
    const receipt = `a-${algorithm.id}-u${user.id}-${Date.now().toString(36)}`.slice(0, 40);

    let response;
    try {
      response = await fetch(`${RAZORPAY_API}/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: algorithm.price_paise,
          currency: 'INR',
          receipt,
          // Notes come back on the webhook, which makes a payment traceable to
          // a user and an algorithm even if our own row were somehow lost.
          notes: { algo_id: algorithm.id, user_id: String(user.id) },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout or DNS failure must not surface as a bare "fetch failed".
      throw new Error(`Could not reach Razorpay: ${error.message}`);
    }

    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }

    if (!response.ok) {
      // Razorpay's own message is the useful part ("amount must be at least 100").
      const detail = body?.error?.description || `HTTP ${response.status}`;
      throw new Error(`Razorpay rejected the order: ${detail}`);
    }
    if (!body?.id) throw new Error('Razorpay returned no order id.');

    return {
      provider: 'razorpay',
      orderId: body.id,
      amountPaise: body.amount,
      currency: body.currency,
      // Everything the browser needs to open Checkout. The key ID is public by
      // design; the key SECRET never leaves this process.
      checkout: {
        kind: 'razorpay',
        keyId,
        orderId: body.id,
        amount: body.amount,
        currency: body.currency,
        name: 'mStock Algo Trading',
        description: `${algorithm.name} · 30 days`,
        prefill: { name: user.full_name ?? '', email: user.email ?? '', contact: user.phone ?? '' },
        notes: { algo_id: algorithm.id },
        theme: { color: '#4f46e5' },
      },
    };
  },

  /**
   * Razorpay signs webhooks with HMAC-SHA256 over the RAW body using the
   * webhook secret. Verify against the raw bytes — re-serialising the parsed
   * JSON changes whitespace and the signature stops matching.
   */
  verifyWebhook(rawBody, headers = {}) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = headers['x-razorpay-signature'];
    if (!secret) return { valid: false, reason: 'RAZORPAY_WEBHOOK_SECRET is not set' };
    if (!signature) return { valid: false, reason: 'missing x-razorpay-signature header' };

    const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (!signaturesMatch(expected, signature)) return { valid: false, reason: 'signature mismatch' };

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return { valid: false, reason: 'body is not JSON' }; }

    // `payment.*` events carry payload.payment.entity; `order.paid` carries
    // payload.order.entity as well, and its payment entity is the nested one.
    // Read both so the order id is found either way.
    const payment = parsed.payload?.payment?.entity ?? {};
    const order = parsed.payload?.order?.entity ?? {};
    const entity = {
      order_id: payment.order_id ?? order.id,
      id: payment.id ?? null,
      method: payment.method ?? null,
    };

    return {
      valid: true,
      // Unique per event, which is what makes replay detection work. Razorpay
      // retries deliveries, so without it a retry would grant a second 30 days.
      eventId: headers['x-razorpay-event-id'] ?? `rzp_${createHmac('sha256', secret).update(raw).digest('hex').slice(0, 32)}`,
      eventType: parsed.event,
      orderId: entity.order_id,
      paymentId: entity.id,
      method: entity.method,
      payload: raw,
    };
  },

  /**
   * The browser's success callback, verified server-side.
   *
   * Razorpay hands the browser razorpay_order_id / razorpay_payment_id /
   * razorpay_signature, where the signature is HMAC-SHA256 of
   * `order_id|payment_id` keyed with the KEY secret (not the webhook secret).
   * Only Razorpay can produce it, so a forged "I paid" call fails here.
   *
   * `storedOrderId` is passed in deliberately: the docs say to verify against
   * the order id held on the server, not the one the browser echoes back, so
   * the caller looks the row up first and the browser cannot steer which order
   * gets credited.
   */
  verifyPaymentSignature({ storedOrderId, paymentId, signature }) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return { valid: false, reason: 'RAZORPAY_KEY_SECRET is not set' };
    if (!storedOrderId || !paymentId || !signature) {
      return { valid: false, reason: 'order id, payment id and signature are all required' };
    }

    const expected = createHmac('sha256', secret)
      .update(`${storedOrderId}|${paymentId}`)
      .digest('hex');
    if (!signaturesMatch(expected, signature)) return { valid: false, reason: 'signature mismatch' };

    return { valid: true, orderId: storedOrderId, paymentId };
  },
};

const PROVIDERS = { mock, razorpay };

export const activeProvider = () => {
  const name = process.env.PAYMENT_PROVIDER || 'mock';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown PAYMENT_PROVIDER: ${name}`);
  return provider;
};

export const providerName = () => activeProvider().name;

/**
 * Shout at startup if the chosen provider cannot work. Returns the check so the
 * caller can decide whether a bad config is fatal — it is for a live key, and a
 * warning for test keys, because half-configured test credentials are a normal
 * state to be in while setting this up.
 */
export const checkProviderConfig = () => {
  const provider = activeProvider();
  return { name: provider.name, ...provider.configured() };
};
