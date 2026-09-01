import { useNavigate, useOutletContext } from 'react-router-dom'
import ApiConsole from '../components/ApiConsole'
import { useAuth } from '../context/AuthContext'

/**
 * HomePage — the default view at /dashboard, and where a real login now lands.
 *
 * It reads the tokens out of AuthContext (which survives the navigation away
 * from the login page) and hands them to <ApiConsole>, the same component the
 * public preview renders in demo mode.
 */
export default function HomePage() {
  const { authData, logout } = useAuth()
  const { isRunning } = useOutletContext()
  const navigate = useNavigate()

  const handleSignOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full w-full overflow-y-auto bg-slate-950 p-8">
      <div className="w-full">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Home</h2>
            <p className="text-slate-400 text-sm mt-1">
              {authData?.session?.data?.user_name
                ? `Signed in as ${authData.session.data.user_name}.`
                : 'Your mStock account data.'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-widest ${isRunning ? 'border-amber-400/40 bg-amber-400/5 text-amber-300' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
            {isRunning ? 'Machine running' : 'Machine idle'}
          </span>
        </div>

        <ApiConsole
          accessToken={authData?.accessToken ?? ''}
          apiKey={authData?.apiKey ?? ''}
          session={authData?.session ?? null}
          onSignOut={handleSignOut}
        />
      </div>
    </div>
  )
}
