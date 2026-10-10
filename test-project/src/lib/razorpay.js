/**
 * Razorpay Checkout, loaded on demand.
 *
 * The script is NOT in index.html on purpose: it is a third-party script on
 * every page load for a feature most visits never touch, and this app is
 * otherwise entirely local. It loads the first time someone actually buys
 * something.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let loader = null

/**
 * Resolves once window.Razorpay exists. The promise is cached, so several
 * clicks do not inject several copies of the script.
 */
export const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loader) return loader

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay)
      else reject(new Error('Razorpay Checkout loaded but did not register itself.'))
    }
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this is usually a blocked request or a dropped connection.
      loader = null
      reject(new Error('Could not load Razorpay Checkout. Check the connection or any ad blocker.'))
    }
    document.head.appendChild(script)
  })

  return loader
}

/**
 * Opens Checkout and settles once the payment is decided.
 *
 * Resolves with:
 *   { status: 'paid',      payload }  the three fields the backend must verify
 *   { status: 'dismissed' }           the customer closed the window
 *   { status: 'failed',    reason }   Checkout reported a failure
 *
 * It deliberately never resolves to "success" on its own authority: the payload
 * carries a signature only Razorpay can produce, and the caller sends it to the
 * backend to be verified there. Nothing is unlocked by this file.
 */
export const openCheckout = async (checkout) => {
  const Razorpay = await loadCheckout()

  return new Promise((resolve) => {
    // Checkout can fire both `handler` and `ondismiss` in some flows, and a
    // second resolve would be ignored silently — guard it so the first real
    // outcome is the one reported.
    let settled = false
    const settle = (value) => { if (!settled) { settled = true; resolve(value) } }

    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      notes: checkout.notes,
      theme: checkout.theme,
      handler: (response) => settle({ status: 'paid', payload: response }),
      modal: { ondismiss: () => settle({ status: 'dismissed' }) },
    })

    instance.on('payment.failed', (response) => {
      settle({ status: 'failed', reason: response?.error?.description || 'The payment failed.' })
    })

    instance.open()
  })
}
