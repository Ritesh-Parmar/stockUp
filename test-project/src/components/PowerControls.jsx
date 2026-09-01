export default function PowerControls({ isRunning, onStart, onStop }) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-100">
      <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
        Power
      </p>

      {/* START */}
      <button
        onClick={onStart}
        disabled={isRunning}
        className={`
          relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase
          transition-all duration-300 border
          ${isRunning
            ? 'bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-500'
            : 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400 hover:bg-emerald-400/20 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-95'
          }
        `}
      >
        <span className="flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-slate-600' : 'bg-emerald-400'}`} />
          Start
        </span>
      </button>

      {/* STOP */}
      <button
        onClick={onStop}
        disabled={!isRunning}
        className={`
          relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase
          transition-all duration-300 border
          ${!isRunning
            ? 'bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-500'
            : 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] active:scale-95'
          }
        `}
      >
        <span className="flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${!isRunning ? 'bg-slate-600' : 'bg-red-400'}`} />
          Stop
        </span>
      </button>

      {/* Status indicator */}
      <div className={`mt-1 text-center text-sm font-mono tracking-widest uppercase transition-colors duration-300 ${isRunning ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
        {isRunning ? '● Running' : '○ Idle'}
      </div>
    </div>
  )
}