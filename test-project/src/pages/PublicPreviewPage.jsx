import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import LoginView from '../components/LoginView'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'

/**
 * PublicPreviewPage — /preview
 * Renders the mStock demo UI in demoMode with NO authentication required.
 * This is a public page for UI testing / demonstration purposes.
 */
export default function PublicPreviewPage() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-slate-800 flex items-center gap-4 px-6 shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <Link
          to="/login"
          className="text-sm font-mono font-semibold tracking-widest uppercase text-slate-300 hover:text-emerald-400 transition-colors"
        >
          Dashboard
        </Link>

        <span className="text-slate-700 text-xs font-mono ml-1">/ preview</span>

        <div className="flex-1" />

        {/* Back + theme toggle */}
        <Link
          to="/login"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all duration-200 text-xs font-mono"
        >
          <ArrowLeft size={13} />
          Back to login
        </Link>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all duration-200 text-xs font-mono"
          title="Toggle theme"
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      {/* Demo UI */}
      <div className="flex-1 overflow-hidden">
        <LoginView demoMode />
      </div>
    </div>
  )
}
