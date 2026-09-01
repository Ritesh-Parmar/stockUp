import PowerControls from './PowerControls'
import ActionButtons from './ActionButtons'
import { LogIn } from 'lucide-react'

export default function Sidebar({ isRunning, onStart, onStop, onConfigure, onInspectStatus, onAmount, onMStockLogin }) {
  return (
    <aside className="w-60 shrink-0 h-full border-r border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 flex flex-col gap-4 p-4 overflow-y-auto">
      <button
        type="button"
        onClick={onMStockLogin}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-indigo-400/50 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300 transition-all duration-200"
      >
        <LogIn size={17} />
        <span className="text-sm font-semibold">mStock Login</span>
      </button>
      <PowerControls isRunning={isRunning} onStart={onStart} onStop={onStop} />
      <ActionButtons onConfigure={onConfigure} onInspectStatus={onInspectStatus} onAmount={onAmount} />
    </aside>
  )
}
