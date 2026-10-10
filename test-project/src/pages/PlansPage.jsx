import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, BadgeCheck, CalendarClock, Loader2, ShoppingCart } from 'lucide-react'
import { useAuth } from '../context/auth'
import {
  confirmMockPurchase, fetchAlgorithms, fetchMe, reportPurchaseFailed,
  rupees, startCheckout, verifyPurchase,
} from '../lib/accountApi'
import { openCheckout } from '../lib/razorpay'
import InfoButton from '../components/InfoButton'
import { ACCENT_CLASSES, RISK_CLASSES, findAlgorithm } from '../lib/algorithms'
import { displayDate, displayStamp, expiryTone } from '../lib/dates'
import { logEvent } from '../lib/activityLog'

/**
 * PlansPage — /dashboard/plans
 *
 * Buying access, one algorithm at a time. There are no bundles: each algorithm
 * carries its own 30-day expiry, and a bundle would need a single shared one,
 * which is exactly what the database was redesigned away from.
 *
 * Nothing here grants anything. Checkout records an intent; access is granted
 * only when the payment provider's signed webhook reaches the backend.
 */
export default function PlansPage() {
  const { authData } = useAuth()
  const session = authData?.appSession
  const [catalogue, setCatalogue] = useState(null)
  const [me, setMe] = useState(null)
  const [busyAlgo, setBusyAlgo] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAlgorithms(), session ? fetchMe(session) : Promise.resolve(null)])
      .then(([catalogueData, meData]) => {
        if (cancelled) return
        setCatalogue(catalogueData)
        setMe(meData)
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the algorithm list.') })
    return () => { cancelled = true }
  }, [session, reloadKey])

  const buy = async (algoId) => {
    setBusyAlgo(algoId)
    setError('')
    setNotice('')
    try {
      const order = await startCheckout(session, algoId)
      const name = findAlgorithm(algoId)?.name ?? algoId

      if (order.checkout?.kind === 'mock') {
        // No hosted checkout exists for the mock provider, so this stands in
        // for the webhook.
        const result = await confirmMockPurchase(session, order.orderId)
        setNotice(`${name} is active till ${displayDate(result.validTill)}.`)
      } else {
        // Razorpay: open the hosted window and wait for it to settle. Nothing
        // this page learns is trusted — the signed payload goes to the backend,
        // which recomputes the HMAC before granting anything.
        const outcome = await openCheckout(order.checkout)

        if (outcome.status === 'dismissed') {
          await reportPurchaseFailed(session, order.orderId, 'dismissed by user').catch(() => {})
          setNotice('Payment window closed — nothing was charged.')
          logEvent('purchase', { target: '/dashboard/plans', outcome: 'error', detail: { operation: algoId, reason: 'dismissed' } })
          return
        }
        if (outcome.status === 'failed') {
          await reportPurchaseFailed(session, order.orderId, outcome.reason).catch(() => {})
          setError(outcome.reason)
          logEvent('purchase', { target: '/dashboard/plans', outcome: 'error', detail: { operation: algoId, errorMessage: outcome.reason } })
          return
        }

        const result = await verifyPurchase(session, outcome.payload)
        setNotice(
          result.alreadyProcessed
            // The webhook beat the browser back. Not an error — the same
            // payment, granted once.
            ? `${name} is already active till ${displayDate(result.validTill)}.`
            : `Payment verified. ${name} is active till ${displayDate(result.validTill)}.`,
        )
      }

      logEvent('purchase', { target: '/dashboard/plans', outcome: 'ok', detail: { operation: algoId } })
      setReloadKey((current) => current + 1)
    } catch (err) {
      setError(err.message || 'Checkout failed.')
      logEvent('purchase', { target: '/dashboard/plans', outcome: 'error', detail: { operation: algoId, errorMessage: err.message } })
    } finally {
      setBusyAlgo('')
    }
  }

  const algos = me?.algos ?? catalogue?.algorithms?.map((algorithm) => ({
    id: algorithm.id, name: algorithm.name, style: algorithm.style,
    pricePaise: algorithm.price_paise, owned: false, valid: false, validTill: null, daysLeft: null,
  })) ?? []

  const validityDays = catalogue?.validityDays ?? 30
  const activeCount = algos.filter((algo) => algo.valid).length

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-ink">Algorithms &amp; access</h2>
            <p className="text-ink-2 text-sm mt-1">
              Each algorithm is bought on its own and stays valid for {validityDays} days from the day you buy it.
              Buying one again extends it rather than restarting the clock.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* A chip for the payment mode, since "is this going to charge me?"
                should never need a click to answer. */}
            {catalogue?.provider === 'mock' && (
              <span className="rounded-full border border-warn/40 bg-warn/5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-warn">
                SIMULATED
              </span>
            )}
            {catalogue?.provider === 'razorpay' && catalogue?.payments?.ready && !catalogue?.payments?.live && (
              <span className="rounded-full border border-info/40 bg-info/5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-info">
                TEST MODE
              </span>
            )}

            <InfoButton title="About buying and payment" label="About buying and payment">
              {catalogue?.provider === 'mock' && (
                <>
                  <p>
                    <strong className="text-ink">No payment gateway is connected.</strong> Buying here is
                    simulated and charges nothing.
                  </p>
                  <p className="text-ink-2">
                    Set <code className="font-mono text-ink">PAYMENT_PROVIDER=razorpay</code> in{' '}
                    <code className="font-mono text-ink">backend/.env</code> to use the real checkout.
                  </p>
                </>
              )}

              {catalogue?.provider === 'razorpay' && catalogue?.payments?.ready && !catalogue?.payments?.live && (
                <>
                  <p>
                    <strong className="text-ink">Razorpay test mode</strong> — the real checkout window,
                    but no real money.
                  </p>
                  <p>
                    Use a <strong className="text-ink">domestic</strong> test card:{' '}
                    <code className="font-mono text-info">4100 2800 0000 1007</code> (Visa) or{' '}
                    <code className="font-mono text-info">5555 5100 0008 1006</code> (Mastercard).
                    Any future expiry, any CVV. On the mock bank page that follows, any OTP of 4–10
                    digits succeeds.
                  </p>
                  <p className="text-ink-2">
                    An international card such as 4111 1111 1111 1111 is refused — test accounts have
                    international payments disabled.
                  </p>
                  {!catalogue?.payments?.webhookReady && (
                    <p className="text-ink-2">
                      No webhook is configured, which is expected on localhost: Razorpay cannot reach
                      127.0.0.1. Access is granted by the signed checkout callback instead.
                    </p>
                  )}
                </>
              )}

              <p className="text-ink-2">
                Each algorithm is granted for {validityDays} days by a payment the server verifies with
                an HMAC signature — never by the browser claiming it worked.
              </p>
            </InfoButton>
          </div>
        </div>

        {error && (
          <div className="flex gap-3 mb-6 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm">
            <AlertCircle size={17} className="shrink-0" />{error}
          </div>
        )}

        {notice && (
          <div className="flex gap-3 mb-6 p-4 bg-good/10 border border-good/30 rounded-xl text-good text-sm">
            <BadgeCheck size={17} className="shrink-0" />{notice}
          </div>
        )}

        {/* Only WARNINGS stay on the page. The explanatory text lives behind the
            "i" in the header, but a missing key or live keys must not need a
            click to be noticed. */}
        {catalogue?.provider === 'razorpay' && !catalogue?.payments?.ready && (
          <div className="flex gap-3 mb-6 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm">
            <AlertCircle size={17} className="shrink-0" />
            <span>
              Razorpay is selected but its keys are missing, so buying will fail.
              The backend log on startup says which environment variables are not set.
            </span>
          </div>
        )}

        {catalogue?.payments?.live && (
          <div className="flex gap-3 mb-6 p-4 bg-bad/10 border border-bad/40 rounded-xl text-bad text-sm">
            <AlertCircle size={17} className="shrink-0" />
            <span><strong>Live keys are active.</strong> Buying here charges a real card.</span>
          </div>
        )}

        {activeCount > 0 && (
          <p className="text-ink-2 text-xs font-mono mb-6">
            {activeCount} of {algos.length} algorithms active ·{' '}
            <Link to="/dashboard/choose-algo" className="underline hover:text-ink">go run one</Link>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {algos.map((algo) => {
            const algorithm = findAlgorithm(algo.id)
            const accent = ACCENT_CLASSES[algorithm?.accent] ?? ACCENT_CLASSES.emerald
            const state = expiryTone(algo.daysLeft)
            const busy = busyAlgo === algo.id

            return (
              <div
                key={algo.id}
                className={`flex flex-col rounded-2xl border p-5 ${algo.valid ? `${accent.border} ${accent.bg}` : 'border-edge-strong bg-panel'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-lg font-bold ${algo.valid ? accent.text : 'text-ink'}`}>{algorithm?.name ?? algo.name}</p>
                    <p className="text-ink-2 text-xs mt-0.5">{algorithm?.tagline ?? algo.style}</p>
                  </div>
                  {algo.valid && <BadgeCheck size={18} className="text-good shrink-0 mt-1" />}
                </div>

                <p className="text-ink-3 text-xs mt-3 flex-1 leading-relaxed">{algorithm?.description}</p>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <span className="px-2 py-0.5 rounded-full border border-edge-strong bg-panel/60 text-[10px] font-mono text-ink-2">
                    {algorithm?.style ?? algo.style}
                  </span>
                  {algorithm && (
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${RISK_CLASSES[algorithm.risk]}`}>
                      {algorithm.risk} risk
                    </span>
                  )}
                </div>

                <p className="mt-4 text-2xl font-bold text-ink tabular-nums">
                  {rupees(algo.pricePaise)}
                  <span className="text-ink-3 text-sm font-normal"> / {validityDays} days</span>
                </p>

                {/* The access line — the whole point of the per-algorithm model. */}
                <p className={`text-xs font-mono mt-2 flex items-center gap-1.5 ${state.tone}`}>
                  <CalendarClock size={12} className="shrink-0" />
                  {algo.valid
                    ? `Valid till ${displayDate(algo.validTill)} · ${state.label}`
                    : algo.owned
                      ? `Expired ${displayDate(algo.validTill)}`
                      : 'Never bought'}
                </p>

                <button
                  onClick={() => buy(algo.id)}
                  disabled={busy || !session}
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand/90 py-2.5 px-5 text-sm font-semibold text-ink transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
                  {busy ? 'Processing…' : algo.valid ? `Extend ${validityDays} days` : algo.owned ? 'Renew' : 'Buy'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Receipts. GST invoicing is schema-only for now, so this is the record. */}
        {me?.payments?.length > 0 && (
          <section className="mt-10">
            <h3 className="text-sm font-semibold text-ink">Payment history</h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-edge-strong">
              <table className="w-full text-xs">
                <thead className="bg-panel/80 text-ink-2 font-mono uppercase tracking-wider">
                  <tr>
                    {['Date', 'Algorithm', 'Amount', 'Status', 'Valid till', 'Order'].map((heading) => (
                      <th key={heading} className="text-left px-4 py-2.5 font-medium whitespace-nowrap">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {me.payments.map((payment) => (
                    <tr key={payment.id} className="text-ink-2">
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-ink-2">{displayStamp(payment.created_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{findAlgorithm(payment.algo_id)?.name ?? payment.algo_id}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{rupees(payment.amount_paise)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`font-mono text-[10px] uppercase ${
                          payment.status === 'paid' ? 'text-good' : payment.status === 'failed' ? 'text-bad' : 'text-warn'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-ink-2">{displayDate(payment.validity_granted_to)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-ink-3">{payment.razorpay_order_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
