import { openDb } from './db.js';
import { VALIDITY_DAYS, findAlgo } from './algoCatalogue.js';
import { grantAlgo } from './accounts.js';
import { isoStamp } from './dates.js';

/**
 * Buying an algorithm.
 *
 * One algorithm at a time, 30 days each — there are no bundles, because access
 * is per-algorithm with its own expiry and a bundle would need a shared one.
 *
 * The flow is deliberately two-phase:
 *
 *   1. createOrder()  writes a `payments` row as 'created' and returns what the
 *                     browser needs to open checkout. Grants nothing.
 *   2. fulfilOrder()  grants the 30 days. Called ONLY from a verified provider
 *                     webhook, never from a browser callback — a browser
 *                     "payment succeeded" message is trivially forged.
 *
 * Idempotency lives in two places: `payments.razorpay_order_id` is UNIQUE, and
 * fulfilOrder refuses to act twice on the same order. Razorpay retries any
 * non-2xx reply, so without both a retry would hand out a second 30 days.
 */

export const paymentsFor = (userId) =>
  openDb().prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);

export const paymentByOrderId = (orderId) =>
  openDb().prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);

/** Phase 1. Records the intent; grants nothing. */
export const createOrder = ({ userId, algoId, provider, orderId }) => {
  const algorithm = findAlgo(algoId);
  if (!algorithm) throw new Error(`Unknown algorithm: ${algoId}`);

  openDb().prepare(`
    INSERT INTO payments (user_id, algo_id, provider, razorpay_order_id, amount_paise, currency, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'INR', 'created', ?)
  `).run(userId, algoId, provider, orderId, algorithm.price_paise, isoStamp());

  return paymentByOrderId(orderId);
};

/**
 * Phase 2. Marks the payment paid and extends the algorithm's validity.
 *
 * Returns { granted, validTill, alreadyProcessed } so a retried webhook can be
 * answered 200 without granting twice — answering non-2xx would only make
 * Razorpay retry again.
 */
export const fulfilOrder = ({ orderId, paymentId, signature, method }) => {
  const db = openDb();
  const payment = paymentByOrderId(orderId);
  if (!payment) throw new Error(`No such order: ${orderId}`);

  if (payment.status === 'paid') {
    return { granted: false, alreadyProcessed: true, validTill: payment.validity_granted_to, payment };
  }

  const days = findAlgo(payment.algo_id) ? VALIDITY_DAYS : 0;
  if (!days) throw new Error(`Algorithm no longer sold: ${payment.algo_id}`);

  const validTill = grantAlgo(payment.user_id, payment.algo_id, days);
  db.prepare(`
    UPDATE payments SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ?,
      method = ?, validity_granted_to = ?, completed_at = ?
    WHERE id = ?
  `).run(paymentId ?? null, signature ?? null, method ?? null, validTill, isoStamp(), payment.id);

  console.log(`[purchase] user ${payment.user_id} -> ${payment.algo_id} valid till ${validTill}`);
  return { granted: true, alreadyProcessed: false, validTill, payment: paymentByOrderId(orderId) };
};

export const failOrder = (orderId, reason) => {
  openDb().prepare("UPDATE payments SET status = 'failed', failure_reason = ?, completed_at = ? WHERE razorpay_order_id = ? AND status = 'created'")
    .run(String(reason ?? '').slice(0, 300), isoStamp(), orderId);
};

/**
 * Store a webhook before acting on it.
 * The UNIQUE (provider, event_id) constraint is what makes replay safe:
 * `fresh: false` means this exact delivery has been seen already.
 */
export const recordWebhook = ({ provider, eventId, eventType, signatureValid, payload }) => {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO webhook_event (provider, event_id, event_type, signature_valid, payload, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(provider, eventId, eventType ?? null, signatureValid ? 1 : 0, payload, isoStamp());
    return { fresh: true };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { fresh: false };
    throw error;
  }
};

export const markWebhookProcessed = (provider, eventId, error = null) => {
  openDb().prepare('UPDATE webhook_event SET processed_at = ?, process_error = ? WHERE provider = ? AND event_id = ?')
    .run(isoStamp(), error ? String(error).slice(0, 500) : null, provider, eventId);
};
