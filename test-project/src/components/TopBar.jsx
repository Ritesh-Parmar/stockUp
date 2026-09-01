import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export default function TopBar({ onDashboardPreview }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="h-14 border-b border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 flex items-center gap-6 px-6 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <button
          type="button"
          onClick={onDashboardPreview}
          className="text-sm font-mono font-semibold tracking-widest uppercase text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Open dashboard preview"
        >
          Dashboard
        </button>
      </div>

      <div className="flex-1 overflow-hidden whitespace-nowrap" aria-label="Market update">
        <p className="trading-ticker inline-block text-xs font-mono text-emerald-600 dark:text-emerald-400">
          Markets reward discipline - monitor risk, follow your strategy, and trade with purpose.
        </p>
      </div>

      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-400 dark:hover:text-slate-200 transition-all duration-200 text-xs font-mono"
        title="Toggle theme"
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
        <span>{isDark ? 'Light' : 'Dark'}</span>
      </button>
    </header>
  )
}
