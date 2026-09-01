import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BarChart3, DollarSign } from 'lucide-react'
import { demoResponse, demoSession } from '../components/demoData'
import { availableBalance } from '../lib/mstockApi'
import ApiConsole from '../components/ApiConsole'
import AmountView from '../components/AmountView'

const DEMO_BALANCE = availableBalance(demoResponse('Fund summary')) ?? 0

const TABS = [
  ['console', 'API console', BarChart3],
  ['amount', 'Amount', DollarSign],
]

/**
 * PreviewPage — /dashboard/preview
 *
 * The deliberately non-obvious "Dashboard" link in the top bar points here. It
 * bypasses login entirely and renders the signed-in UI against stale sample
 * data, so the post-login interface can be checked without an OTP device.
 *
 * Every tab renders the SAME component the real protected page renders, just
 * fed demo data — so a change to the live page shows up here automatically.
 * When you add a screen behind login, add a tab for it here too.
 */
export default function PreviewPage() {
  const { isRunning } = useOutletContext()
  const [tab, setTab] = useState('console')
  const [amount, setAmount] = useState(DEMO_BALANCE)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950 p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Home <span className="text-slate-600 text-base font-mono font-normal">/ preview</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Signed in as {demoSession.data.user_name}. (Sample data — nothing here is live.)
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-widest ${isRunning ? 'border-amber-400/40 bg-amber-400/5 text-amber-300' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
          {isRunning ? 'Machine running' : 'Machine idle'}
        </span>
      </div>

      {/* Which signed-in screen to preview */}
      <div className="mb-6 flex gap-5 border-b border-slate-800 shrink-0">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${tab === key ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'console'
          ? <ApiConsole demoMode session={demoSession} />
          : <AmountView
              amount={amount}
              balance={DEMO_BALANCE}
              onAmountChange={setAmount}
              onClose={() => setTab('console')}
            />}
      </div>
    </div>
  )
}
