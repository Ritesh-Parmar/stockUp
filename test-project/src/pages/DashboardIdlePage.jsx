import { useOutletContext } from 'react-router-dom'

/**
 * DashboardIdlePage — the default view at /dashboard.
 * Shows the animated status orb while idle or running.
 */
export default function DashboardIdlePage() {
  const { isRunning } = useOutletContext()

  return (
    <div className="relative text-center flex flex-col items-center gap-4 m-auto">
      <div
        className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center transition-all duration-500 ${
          isRunning
            ? 'border-amber-400/60 bg-amber-400/5 shadow-[0_0_40px_rgba(251,191,36,0.1)]'
            : 'border-slate-700 bg-slate-800/50'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full transition-all duration-500 ${
            isRunning
              ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]'
              : 'bg-slate-700'
          }`}
        />
      </div>

      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
          {isRunning ? 'Machine is running' : 'Awaiting input'}
        </p>
        <p className="text-slate-400 text-xs font-mono mt-1">
          {isRunning
            ? 'Select an action from the sidebar to continue.'
            : 'Use the sidebar controls to get started.'}
        </p>
      </div>
    </div>
  )
}
