import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AmountView from '../components/AmountView'
import { useAuth } from '../context/auth'
import { availableBalance, postApi } from '../lib/mstockApi'
import { fetchMe, saveCapital } from '../lib/accountApi'

/**
 * AmountPage — /dashboard/amount
 *
 * How much of the account a run is allowed to trade with.
 *
 * Seeded from the signed-in account's AVAILABLE_BALANCE (the same figure the
 * Fund summary panel shows) but kept editable: the balance is a starting point,
 * not a hard cap. A previously saved amount wins over the balance, or every
 * visit would silently reset the user's choice.
 *
 * The value is stored on the server as `users.capital_paise`, because a run
 * needs it and runs happen on the backend. Money is INTEGER PAISE everywhere —
 * the rupee figure from mStock is converted on the way in, never stored as a
 * float.
 */

const SAVE_DEBOUNCE_MS = 800
const toPaise = (rupees) => Math.round(Number(rupees) * 100)
const toRupees = (paise) => paise / 100

export default function AmountPage() {
  const navigate = useNavigate()
  const { authData } = useAuth()
  const session = authData?.appSession
  const [amount, setAmount] = useState(0)
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const saveTimer = useRef(null)
  // Bumping this re-runs the effect; that is what Refresh does.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      postApi('/portfolio/funds', { access_token: authData?.accessToken, api_key: authData?.apiKey }),
      session ? fetchMe(session).catch(() => null) : Promise.resolve(null),
    ])
      .then(([funds, me]) => {
        if (cancelled) return
        const value = availableBalance(funds.data)
        const saved = me?.user?.capitalPaise ?? 0
        if (value !== null) setBalance(value)
        // A saved amount is the user's decision; the balance is only a default.
        if (saved > 0) setAmount(toRupees(saved))
        else if (value !== null) setAmount(value)
        else setError('The fund summary did not include an available balance.')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your available balance.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // Navigating away mid-request must not write into an unmounted component.
    return () => { cancelled = true }
  }, [authData, session, reloadKey])

  // A pending save must not fire after the page is gone.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Typing fires per keystroke, so the write is debounced rather than sent
  // on every digit.
  const handleAmountChange = (next) => {
    setAmount(next)
    if (!session) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(() => {
      saveCapital(session, toPaise(next))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, SAVE_DEBOUNCE_MS)
  }

  const handleRefresh = () => {
    setLoading(true)
    setError('')
    setReloadKey((current) => current + 1)
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <AmountView
        amount={amount}
        balance={balance}
        loading={loading}
        error={error}
        onAmountChange={handleAmountChange}
        onRefresh={handleRefresh}
        onClose={() => navigate('/dashboard')}
      />
      <p className="shrink-0 px-4 py-1.5 text-center text-[10px] font-mono text-ink-3">
        {saveState === 'saving' && 'Saving…'}
        {saveState === 'saved' && 'Saved — this is the capital a run will use.'}
        {saveState === 'error' && <span className="text-bad">Could not save this amount to the server.</span>}
        {saveState === 'idle' && 'Changes save automatically.'}
      </p>
    </div>
  )
}
