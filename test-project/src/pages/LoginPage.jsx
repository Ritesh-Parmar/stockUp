import { Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import LoginView from '../components/LoginView'

/**
 * LoginPage — the public mStock sign-in page.
 *
 * - If the user is already authenticated, redirect straight to /dashboard.
 * - Reads ?redirect=<path> from the URL (sanitised to same-origin only).
 * - Passes onAuthSuccess to LoginView so the router can take over after OTP.
 */
export default function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // If already logged in, bounce to dashboard (or the intended redirect)
  if (isAuthenticated) {
    const raw = searchParams.get('redirect') ?? '/dashboard'
    // Sanitise: must be a relative same-origin path
    const safe = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
    return <Navigate to={safe} replace />
  }

  const handleAuthSuccess = (authData) => {
    login(authData)
    const raw = searchParams.get('redirect') ?? '/dashboard'
    const safe = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
    navigate(safe, { replace: true })
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      {/* Minimal top-bar for the login page */}
      <header className="h-14 border-b border-edge flex items-center gap-3 px-6 shrink-0">
        <div className="w-2 h-2 rounded-full bg-good animate-pulse" />
        <span className="text-sm font-mono font-semibold tracking-widest uppercase text-ink-2">
          Dashboard
        </span>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 py-10 overflow-y-auto">
        <div className="w-full max-w-3xl">
          <LoginView onAuthSuccess={handleAuthSuccess} />
        </div>
      </div>
    </div>
  )
}
