import dotenv from 'dotenv';
import { activeProvider, checkProviderConfig } from './lib/payments.js';
import { ALGORITHMS } from './lib/algoCatalogue.js';

dotenv.config();

/**
 * Does the configured payment provider actually work?
 *
 *   cd backend && npm run check-payments
 *
 * Creates one real TEST order against Razorpay and throws it away. Nothing is
 * charged and no access is granted — an order is only an intent to pay.
 *
 * Prints no secret. The key ID is shown masked, enough to tell test from live
 * and to spot a copy-paste mistake, not enough to be worth leaking.
 */

const mask = (value) => {
  if (!value) return '(not set)';
  return value.length <= 12 ? `${value.slice(0, 4)}…` : `${value.slice(0, 12)}…${value.slice(-2)}`;
};

const config = checkProviderConfig();

console.log(`provider:    ${config.name}`);

if (!config.ok) {
  console.error(`\nNOT USABLE — ${config.missing ? `missing ${config.missing.join(', ')}` : config.reason}`);
  console.error('Add it to backend/.env (see backend/.env.example) and run this again.');
  process.exit(1);
}

if (config.name === 'mock') {
  console.log('\nThe mock provider needs no keys. Purchases are simulated and charge nothing.');
  console.log('Set PAYMENT_PROVIDER=razorpay in backend/.env to use real Razorpay Checkout.');
  process.exit(0);
}

console.log(`key id:      ${mask(process.env.RAZORPAY_KEY_ID)}`);
console.log(`key secret:  ${process.env.RAZORPAY_KEY_SECRET ? 'set (not shown)' : '(not set)'}`);
console.log(`mode:        ${config.live ? 'LIVE — these keys charge real cards' : 'test — nothing is charged'}`);
console.log(`webhook:     ${config.webhookReady ? 'secret set' : 'not configured (expected on localhost)'}`);

const algorithm = ALGORITHMS[0];
console.log(`\nCreating a throwaway test order for ${algorithm.name} (₹${algorithm.price_paise / 100})…`);

try {
  const order = await activeProvider().createOrder({
    algorithm,
    // Stand-in buyer. createOrder only reads these for Checkout's prefill.
    user: { id: 0, full_name: 'Key check', email: '', phone: '' },
  });
  console.log(`\nOK — Razorpay accepted it: ${order.orderId} for ${order.amountPaise} paise ${order.currency}`);
  console.log('Your keys work. Nothing was charged and no order was saved to the database.');
  if (config.live) console.log('\nThese are LIVE keys. Switch to test keys unless you meant that.');
} catch (error) {
  console.error(`\nFAILED — ${error.message}`);
  if (/Authentication failed/i.test(error.message)) {
    console.error('That is Razorpay rejecting the key pair. Check for a stray space, a swapped');
    console.error('ID and secret, or a secret from a different (regenerated) key pair.');
  }
  process.exit(1);
}
