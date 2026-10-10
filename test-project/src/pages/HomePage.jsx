import { useOutletContext } from 'react-router-dom'
import ApiConsole from '../components/ApiConsole'
import SubscribedAlgos from '../components/SubscribedAlgos'
import { useAuth } from '../context/auth'

/**
 * HomePage — the default view at /dashboard, and where a real login now lands.
 *
 * It reads the tokens out of AuthContext (which survives the navigation away
 * from the login page) and hands them to <ApiConsole>, the same component the
 * public preview renders in demo mode.
 */
export default function HomePage() {
  const { authData } = useAuth()
  const { isRunning } = useOutletContext()

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-ink">Home</h2>
            <p className="text-ink-2 text-sm mt-1">
              {authData?.session?.data?.user_name
                ? `Signed in as ${authData.session.data.user_name}.`
                : 'Your mStock account data.'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-widest ${isRunning ? 'border-warn/40 bg-warn/5 text-warn' : 'border-edge-strong bg-raised/50 text-ink-2'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-warn animate-pulse' : 'bg-ink-3'}`} />
            {isRunning ? 'Algo trading is Running' : 'Idle'}
          </span>
        </div>

        <SubscribedAlgos />

        <ApiConsole
          accessToken={authData?.accessToken ?? ''}
          apiKey={authData?.apiKey ?? ''}
        />
      </div>
    </div>
  )
}
