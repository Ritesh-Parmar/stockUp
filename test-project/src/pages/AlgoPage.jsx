import { Link } from 'react-router-dom'
import { Play, Zap } from 'lucide-react'

/**
 * AlgoPage — /dashboard/algo
 * Placeholder for the algorithm controls feature (coming soon).
 */
export default function AlgoPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 m-auto text-center">
      {/* Icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl border-2 border-indigo-400/40 bg-indigo-500/5 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.15)]">
          <Play size={32} className="text-indigo-400 ml-1" />
        </div>
        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-slate-950">
          <Zap size={11} className="text-white" />
        </span>
      </div>

      {/* Heading */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Algorithm Controls</h2>
        <p className="text-slate-400 text-sm mt-2 max-w-xs">
          This feature is under development. Full algo-trading controls will be available here soon.
        </p>
      </div>

      {/* Status badge */}
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-400/30 bg-amber-400/5 text-amber-300 text-xs font-mono uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Coming Soon
      </span>

      <Link
        to="/dashboard"
        className="text-slate-500 hover:text-slate-300 text-sm font-mono transition-colors"
      >
        ← Back to dashboard
      </Link>
    </div>
  )
}
