import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AmountView from '../components/AmountView'
import { useAuth } from '../context/AuthContext'
import { availableBalance, postApi } from '../lib/mstockApi'

/**
 * AmountPage — /dashboard/amount
 *
 * Seeds the amount from the signed-in account's AVAILABLE_BALANCE (the same
 * figure the Fund summary panel shows) instead of starting at zero. The value
 * stays editable — the balance is the starting point, not a hard cap.
 */
export default function AmountPage() {
  const navigate = useNavigate()
  const { authData } = useAuth()
  const [amount, setAmount] = useState(0)
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bumping this re-runs the effect; that is what Refresh does.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    postApi('/portfolio/funds', { access_token: authData?.accessToken, api_key: authData?.apiKey })
      .then(({ data }) => {
        const value = availableBalance(data)
        if (cancelled) return
        if (value === null) {
          setError('The fund summary did not include an available balance.')
          return
        }
        setBalance(value)
        setAmount(value)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your available balance.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // Navigating away mid-request must not write into an unmounted component.
    return () => { cancelled = true }
  }, [authData, reloadKey])

  const handleRefresh = () => {
    setLoading(true)
    setError('')
    setReloadKey((current) => current + 1)
  }

  return (
    <AmountView
      amount={amount}
      balance={balance}
      loading={loading}
      error={error}
      onAmountChange={setAmount}
      onRefresh={handleRefresh}
      onClose={() => navigate('/dashboard')}
    />
  )
}
