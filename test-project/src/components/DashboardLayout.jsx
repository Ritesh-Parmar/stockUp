import { useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/theme'
import { useAuth } from '../context/auth'
import { useMachine } from '../hooks/useMachine'
import { flushNow, logEvent } from '../lib/activityLog'
import MarketTicker from './MarketTicker'
import {
  Sun, Moon, LogIn, LogOut, Activity, Radio,
  DollarSign, LayoutDashboard, GitCompare, ScrollText, CreditCard,
} from 'lucide-react'

// ─────────────────────────────────────────────
// TopBar (inline — no longer needs a callback)
// ─────────────────────────────────────────────
function TopBar() {
  const { isDark, toggleTheme } = useTheme()
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logEvent('logout', { target: '/login' })
    // Send it while the session token still exists — logout() clears the
    // storage the logger reads, so a queued event would never be sent.
    void flushNow()
    // Clearing sessionStorage alone would leave the backend session open
    // and its runs trading until the sweeper noticed. logout() ends both.
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="h-14 border-b border-edge bg-panel text-ink flex items-center gap-6 px-6 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-good animate-pulse" />
        {/* Was a hidden link to a login-free preview, needed back when there
            was no way to see the signed-in UI without an OTP. The demo account
            (123/123/123) replaces it. */}
        <span className="text-sm font-mono font-semibold tracking-widest uppercase text-ink-2">
          Dashboard
        </span>
      </div>

      <MarketTicker />

      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-bad/50 text-bad hover:border-bad hover:bg-bad/10 transition-all duration-200 text-xs font-mono"
            title="Logout"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-edge-strong text-ink-3 hover:border-edge-hover hover:text-ink transition-all duration-200 text-xs font-mono"
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
  // `end` so this only lights up on the index route, not on every /dashboard/* child.
  { to: '/dashboard',           label: 'Dashboard',       icon: LayoutDashboard, description: 'Account overview', end: true },
  // Start Algo and Configure deliberately absent: they live under
  // /dashboard/choose-algo/:algoId, once an algorithm has been selected.
  { to: '/dashboard/live',      label: 'Live Trading',    icon: Radio, description: 'Watch the algo trade' },
  { to: '/dashboard/status',    label: 'Inspect Status',  icon: Activity, description: 'Live diagnostics' },
  { to: '/dashboard/amount',    label: 'Amount',          icon: DollarSign, description: 'Usage & metrics' },
  { to: '/dashboard/instruments', label: 'Compare Instruments', icon: GitCompare, description: 'Added / deleted / changed' },
  { to: '/dashboard/activity',  label: 'Activity Log',    icon: ScrollText, description: 'What happened, by day' },
  { to: '/dashboard/plans',     label: 'Buy Algorithms',  icon: CreditCard, description: 'Access & payment history' },
]

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
function Sidebar({ isRunning, onStop }) {
  return (
    <aside className="w-60 shrink-0 h-full border-r border-edge bg-raised text-ink flex flex-col gap-4 p-4 overflow-y-auto">

      {/* Login button */}
      <NavLink
        to="/login"
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-brand/50 bg-brand/10 text-brand hover:bg-brand/20 transition-all duration-200"
      >
        <LogIn size={17} />
        <span className="text-sm font-semibold">Login</span>
      </NavLink>

      {/* Power controls */}
      <div className="flex flex-col gap-3 p-4 rounded-xl border border-edge bg-panel text-ink">
        <p className="text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
          Algo
        </p>
        {/* Navigates to the algo picker rather than starting anything itself. */}
        <NavLink
          to="/dashboard/choose-algo"
          className="relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase transition-all duration-300 border bg-good/10 border-good/50 text-good hover:bg-good/20 hover:border-good hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-95"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-good" />
            Choose Algo
          </span>
        </NavLink>

        <button
          onClick={() => { void onStop() }}
          disabled={!isRunning}
          className={`relative w-full py-3 rounded-lg font-mono text-sm font-bold tracking-widest uppercase transition-all duration-300 border ${
            !isRunning
              ? 'bg-raised/80 border-edge text-ink-3 cursor-not-allowed-strong-3'
              : 'bg-bad/10 border-bad/50 text-bad hover:bg-bad/20 hover:border-bad hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] active:scale-95'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${!isRunning ? 'bg-ink-3' : 'bg-bad'}`} />
            Stop Algo
          </span>
        </button>

        <div className={`mt-1 text-center text-sm font-mono tracking-widest uppercase transition-colors duration-300 ${isRunning ? 'text-good' : 'text-ink-2'}`}>
          {isRunning ? '● Algo trading is Running' : '○ Idle'}
        </div>
      </div>

      {/* Nav actions */}
      <div className="flex flex-col gap-3 p-5 rounded-3xl border border-edge bg-panel text-ink">
        <p className="text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
          Control
        </p>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${
                isActive
                  ? 'border-brand/60 bg-brand/10 text-brand'
                  : 'border-edge-strong bg-raised text-ink hover:border-edge-hover hover:bg-raised'
              }`
            }
          >
            <div className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center transition-colors duration-200">
              <Icon size={16} className="text-ink-2" />
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
  const machine = useMachine()
  const { isRunning, stopAll } = machine
  const { pathname } = useLocation()

  // Second of the two logging doors: every route change passes through here,
  // so one effect covers page tracking for the whole app.
  useEffect(() => {
    logEvent('page.view', { target: pathname, detail: { path: pathname } })
  }, [pathname])

  return (
    <div className="flex flex-col h-screen bg-page text-ink overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isRunning={isRunning} onStop={stopAll} />

        {/* Main content area */}
        <main className="flex-1 h-full bg-page text-ink flex items-center justify-center overflow-hidden relative">
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
            {/* The whole machine goes down the outlet: pages need to know
                which algorithm is running, not just whether any is. */}
            <Outlet context={machine} />
          </div>
        </main>
      </div>
    </div>
  )
}
