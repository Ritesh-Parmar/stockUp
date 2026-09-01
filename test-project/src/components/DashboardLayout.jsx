import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useMachine } from '../hooks/useMachine'
import {
  Sun, Moon, LogIn, LogOut, Settings, Activity,
  DollarSign, Play,
} from 'lucide-react'

// ─────────────────────────────────────────────
// TopBar (inline — no longer needs a callback)
// ─────────────────────────────────────────────
function TopBar() {
  const { isDark, toggleTheme } = useTheme()
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="h-14 border-b border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 flex items-center gap-6 px-6 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <NavLink
          to="/dashboard/preview"
          className="text-sm font-mono font-semibold tracking-widest uppercase text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Open dashboard preview"
        >
          Dashboard
        </NavLink>
      </div>

      <div className="flex-1 overflow-hidden whitespace-nowrap" aria-label="Market update">
        <p className="trading-ticker inline-block text-xs font-mono text-emerald-600 dark:text-emerald-400">
          Markets reward discipline — monitor risk, follow your strategy, and trade with purpose.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-300 text-red-500 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:border-red-600 dark:hover:bg-red-950/30 transition-all duration-200 text-xs font-mono"
            title="Logout"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-400 dark:hover:text-slate-200 transition-all duration-200 text-xs font-mono"
          title="Toggle theme"
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────
// Sidebar nav items definition
// ─────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard/algo',      label: 'Start Algo',      icon: Play,     description: 'Algorithm controls' },
  { to: '/dashboard/configure', label: 'Configure',       icon: Settings, description: 'System settings' },
  { to: '/dashboard/status',    label: 'Inspect Status',  icon: Activity, description: 'Live diagnostics' },
  { to: '/dashboard/amount',    label: 'Amount',          icon: DollarSign, description: 'Usage & metrics' },
]

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
function Sidebar({ isRunning, onStart, onStop }) {
  return (
    <aside className="w-60 shrink-0 h-full border-r border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 flex flex-col gap-4 p-4 overflow-y-auto">

      {/* Login button */}
      <NavLink
        to="/login"
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-indigo-400/50 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300 transition-all duration-200"
      >
        <LogIn size={17} />
        <span className="text-sm font-semibold">Login</span>
      </NavLink>

      {/* Power controls */}
      <div className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-100">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
          Power
        </p>
        <button
          onClick={onStart}
          disabled={isRunning}
          className={`relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase transition-all duration-300 border ${
            isRunning
              ? 'bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-500'
              : 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400 hover:bg-emerald-400/20 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-95'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-slate-600' : 'bg-emerald-400'}`} />
            Start
          </span>
        </button>

        <button
          onClick={onStop}
          disabled={!isRunning}
          className={`relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase transition-all duration-300 border ${
            !isRunning
              ? 'bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-500'
              : 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] active:scale-95'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${!isRunning ? 'bg-slate-600' : 'bg-red-400'}`} />
            Stop
          </span>
        </button>

        <div className={`mt-1 text-center text-sm font-mono tracking-widest uppercase transition-colors duration-300 ${isRunning ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
          {isRunning ? '● Running' : '○ Idle'}
        </div>
      </div>

      {/* Nav actions */}
      <div className="flex flex-col gap-3 p-5 rounded-3xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-100">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
          Control
        </p>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${
                isActive
                  ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                  : 'border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800'
              }`
            }
          >
            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center transition-colors duration-200">
              <Icon size={16} className="text-slate-700 dark:text-slate-200" />
            </div>
            <p className="text-sm font-semibold leading-none">{label}</p>
          </NavLink>
        ))}
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────
// DashboardLayout — the persistent shell
// ─────────────────────────────────────────────
export default function DashboardLayout() {
  const { isRunning, handleStart, handleStop } = useMachine()

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

        {/* Main content area */}
        <main className="flex-1 h-full bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden relative">
          {/* Subtle dot-grid background */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(rgba(148,163,184,1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />
          {/* Outlet — each route renders here */}
          <div className="relative flex flex-col h-full w-full p-4 min-h-0">
            <Outlet context={{ isRunning }} />
          </div>
        </main>
      </div>
    </div>
  )
}
