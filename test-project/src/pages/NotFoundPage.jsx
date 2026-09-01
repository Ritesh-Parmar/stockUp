import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

/**
 * NotFoundPage — catch-all 404 route.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 text-center px-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-3xl border-2 border-red-400/40 bg-red-500/5 flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.1)]">
        <AlertTriangle size={32} className="text-red-400" />
      </div>

      {/* Code */}
      <p className="text-8xl font-black text-slate-800 dark:text-slate-800 select-none">404</p>

      {/* Heading */}
      <div className="-mt-4">
        <h1 className="text-2xl font-bold text-white">Page not found</h1>
        <p className="text-slate-400 text-sm mt-2 max-w-sm">
          The path{' '}
          <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
            {pathname}
          </code>{' '}
          does not exist. Check the URL or head back.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          Go to Dashboard
        </Link>
        <Link
          to="/login"
          className="px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-semibold transition-colors"
        >
          Login
        </Link>
      </div>
    </div>
  )
}
