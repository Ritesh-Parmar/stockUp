import { useState } from 'react'
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react'

const API_BASE_URL = 'http://localhost:5000/api'

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
    try { await request('/login', { username, password, api_key: apiKey }); setStep('otp') }
    catch (err) { setError(err.message || 'Unable to send OTP. Is the backend running?') }
    finally { setLoading(false) }
  }

  const handleVerifyOtp = async () => {
    setLoading(true); setError('')
    try {
      const data = await request('/verify', { otp, api_key: apiKey })
      if (onAuthSuccess) onAuthSuccess({ accessToken: data.access_token, apiKey, session: data.session })
    }
    catch (err) { setError(err.message || 'Unable to verify OTP. Please try again.') }
    finally { setLoading(false) }
  }

  const reset = () => { setStep('credentials'); setUsername(''); setPassword(''); setApiKey(''); setOtp(''); setError('') }

  return <div className="flex h-full w-full overflow-y-auto bg-slate-950 p-8"><div className="max-w-none w-full mx-auto">
    <div className="mb-8"><h2 className="text-2xl font-bold text-white">Login</h2><p className="text-slate-400 text-sm mt-1">Sign in with your account credentials and one-time password.</p></div>
    {error && <div className="flex gap-3 mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm"><AlertCircle size={17} className="shrink-0" />{error}</div>}

    {step === 'credentials' && <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3"><KeyRound className="text-indigo-400" /><div><p className="text-white font-semibold">Account credentials</p><p className="text-slate-400 text-xs">Your details are used only for this sign-in and are not stored.</p></div></div>
      <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="current-password" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white" />
      <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="mStock API key" type="password" autoComplete="off" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white" />
      <button onClick={handleSendOtp} disabled={loading || !username.trim() || !password || !apiKey.trim()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 px-5 rounded-xl">{loading && <Loader2 size={15} className="animate-spin" />}{loading ? 'Sending OTP...' : 'Send OTP'}</button>
    </div>}

    {step === 'otp' && <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
      <p className="text-white font-semibold">Enter the OTP</p>
      <p className="text-slate-400 text-xs mt-1 mb-5">Enter the code sent to your registered mStock contact method.</p>
      <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="One-time password" inputMode="numeric" maxLength={8} className="w-full mb-4 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-lg tracking-widest" />
      <div className="flex gap-3">
        <button onClick={handleVerifyOtp} disabled={loading || !otp.trim()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 px-5 rounded-xl">{loading && <Loader2 size={15} className="animate-spin" />}{loading ? 'Verifying...' : 'Verify OTP'}</button>
        <button onClick={reset} className="text-slate-400 hover:text-white text-sm px-4">Start over</button>
      </div>
    </div>}
  </div></div>
}
