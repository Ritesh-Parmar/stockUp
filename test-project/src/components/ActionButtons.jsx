import { Settings, Activity, DollarSign, Play } from 'lucide-react'

const actions = (onConfigure, onInspectStatus, onAmount) => [
  {
    label: 'Start Algo',
    icon: Play,
    description: 'Algorithm controls coming soon',
    onClick: () => {},
  },
  {
    label: 'Configure',
    icon: Settings,
    description: 'System settings',
    onClick: onConfigure,
  },
  {
    label: 'Inspect Status',
    icon: Activity,
    description: 'Live diagnostics',
    onClick: onInspectStatus,
  },
  {
    label: 'Amount',
    icon: DollarSign,
    description: 'Usage & metrics',
    onClick: onAmount,
  },
]

export default function ActionButtons({ onConfigure, onInspectStatus, onAmount }) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-3xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-100">
      <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
        Control
      </p>

      {actions(onConfigure, onInspectStatus, onAmount).map(({ label, icon: Icon, onClick }) => (
                <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={label}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-all duration-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center transition-colors duration-200">
            <Icon size={16} className="text-slate-700 dark:text-slate-200" />
          </div>
          <p className="text-sm font-semibold leading-none text-center">{label}</p>
        </button>
      ))}
    </div>
  )
}
