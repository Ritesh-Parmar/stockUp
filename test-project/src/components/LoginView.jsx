import { useState } from 'react'
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react'
import { logEvent } from '../lib/activityLog'
// Imported rather than redeclared: this file had its own copy of the URL, so
// changing the backend address in one place silently left the login screen
// pointing somewhere else.
import { API_BASE_URL } from '../lib/mstockApi'

/**
 * LoginView — the two-step mStock sign-in only.
 *
 * Step 1 posts username/password/api_key to /api/login, which triggers the OTP.
 * Step 2 posts the OTP to /api/verify and hands the resulting tokens to
 * onAuthSuccess. Everything you can *do* once signed in lives in <ApiConsole>,
 * so those tokens have to be lifted into AuthContext here rather than kept in
 * this component — it unmounts the moment the router navigates away.
 */
export default function LoginView({ onAuthSuccess }) {
  const [step, setStep] = useState('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const request = async (path, body) => {
    const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error || 'Request failed')
    return data
  }

  const handleSendOtp = async () => {
    setLoading(true); setError('')
    // Only the username is logged, never the password or API key.
    logEvent('login.attempt', { target: '/login', detail: { username } })
    try {
      await request('/login', { username, password, api_key: apiKey })
      logEvent('login.otp_sent', { target: '/login', outcome: 'ok', detail: { username } })
      setStep('otp')
    }
    catch (err) {
      logEvent('login.failure', { target: '/login', outcome: 'error', detail: { username, reason: 'credentials', errorMessage: err.message } })
      setError(err.message || 'Unable to send OTP. Is the backend running?')
    }
    finally { setLoading(false) }
  }

  const handleVerifyOtp = async () => {
    setLoading(true); setError('')
    try {
      const data = await request('/verify', { otp, api_key: apiKey })
      logEvent('login.success', { target: '/dashboard', outcome: 'ok', detail: { username } })
      if (onAuthSuccess) onAuthSuccess({ accessToken: data.access_token, apiKey, session: data.session, appSession: data.app_session })
    }
    catch (err) {
      logEvent('login.failure', { target: '/login', outcome: 'error', detail: { username, reason: 'otp', errorMessage: err.message } })
      setError(err.message || 'Unable to verify OTP. Please try again.')
    }
    finally { setLoading(false) }
  }

  const reset = () => { setStep('credentials'); setUsername(''); setPassword(''); setApiKey(''); setOtp(''); setError('') }

  return <div className="flex h-full w-full overflow-y-auto bg-page p-8"><div className="max-w-none w-full mx-auto">
    <div className="mb-8"><h2 className="text-2xl font-bold text-ink">Login</h2><p className="text-ink-2 text-sm mt-1">Sign in with your account credentials and one-time password.</p></div>
    {error && <div className="flex gap-3 mb-6 p-4 bg-bad/10 border border-bad/30 rounded-xl text-bad text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}

    {step === 'credentials' && <div className="bg-panel border border-edge-strong rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3"><KeyRound className="text-brand" /><div><p className="text-ink font-semibold">Account credentials</p><p className="text-ink-2 text-xs">Your details are used only for this sign-in and are not stored.</p></div></div>
      <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" className="w-full px-4 py-3 bg-raised border border-edge-strong rounded-xl text-ink" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="current-password" className="w-full px-4 py-3 bg-raised border border-edge-strong rounded-xl text-ink" />
      <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="mStock API key" type="password" autoComplete="off" className="w-full px-4 py-3 bg-raised border border-edge-strong rounded-xl text-ink" />
      <button onClick={handleSendOtp} disabled={loading || !username.trim() || !password || !apiKey.trim()} className="flex items-center gap-2 bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink font-semibold text-sm py-2.5 px-5 rounded-xl">{loading && <Loader2 size={15} className="animate-spin" />}{loading ? 'Sending OTP...' : 'Send OTP'}</button>

      {/* Demo account shortcut — fills 123/123/123. The label was deliberately
          emptied, so this is an unlabelled click target under the Send OTP
          button rather than a visible hint. */}
      <button
        type="button"
        onClick={() => { setUsername('123'); setPassword('123'); setApiKey('123') }}
        className="flex items-center gap-2 text-xs font-mono text-ink-3 hover:text-info transition-colors"
      >
        
      </button>
    </div>}

    {step === 'otp' && <div className="bg-panel border border-edge-strong rounded-2xl p-6">
      <p className="text-ink font-semibold">Enter the OTP</p>
      <p className="text-ink-2 text-xs mt-1 mb-5">Enter the code sent to your registered mStock contact method.</p>
      <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="One-time password" inputMode="numeric" maxLength={8} className="w-full mb-4 px-4 py-3 bg-raised border border-edge-strong rounded-xl text-ink font-mono text-lg tracking-widest" />
      <div className="flex gap-3">
        <button onClick={handleVerifyOtp} disabled={loading || !otp.trim()} className="flex items-center gap-2 bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink font-semibold text-sm py-2.5 px-5 rounded-xl">{loading && <Loader2 size={15} className="animate-spin" />}{loading ? 'Verifying...' : 'Verify OTP'}</button>
        <button onClick={reset} className="text-ink-2 hover:text-ink text-sm px-4">Start over</button>
      </div>
    </div>}
  </div></div>
}
