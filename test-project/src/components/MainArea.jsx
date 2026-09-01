import FileUploadPrompt from './FileUploadPrompt'
import SpreadsheetView from './SpreadsheetView'
import StatusGraphView from './StatusGraphView'
import AmountView from './AmountView'
import LoginView from './LoginView'
export default function MainArea({
  isRunning,
  activeView,
  spreadsheet,
  amount,
  onUploadFile,
  onChangeFile,
  onCloseView,
  onCloseSpreadsheet,
  onUpdateSpreadsheet,
  onAmountChange,
}) {
  const showConfigurePrompt = activeView === 'configure' && !spreadsheet
  const showSpreadsheet = activeView === 'configure' && spreadsheet
  const showStatus = activeView === 'status'
  const showAmount = activeView === 'amount'
  const showMStockLogin = activeView === 'mstockLogin'
  const showMStockPreview = activeView === 'mstockPreview'

  const renderContent = () => {
    if (showConfigurePrompt) {
      return <FileUploadPrompt onFileSelected={onUploadFile} />
    }

    if (showSpreadsheet) {
      return (
        <SpreadsheetView
          spreadsheet={spreadsheet}
          onClose={onCloseSpreadsheet}
          onChangeFile={onChangeFile}
          onUpdate={onUpdateSpreadsheet}
        />
      )
    }

    if (showStatus) {
      return <StatusGraphView onClose={onCloseView} />
    }

    if (showAmount) {
      return (
        <AmountView
          amount={amount}
          onAmountChange={onAmountChange}
          onClose={onCloseView}
        />
      )
    }

    if (showMStockLogin) {
      return <LoginView />
    }

    if (showMStockPreview) {
      return <LoginView demoMode />
    }

    // Default idle state
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
              isRunning ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]' : 'bg-slate-700'
            }`}
          />
        </div>

        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            {isRunning ? 'Machine is running' : 'Awaiting input'}
          </p>
          <p className="text-slate-400 text-xs font-mono mt-1">
            Content will appear here
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex-1 h-full bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden relative">
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

      <div className="relative flex flex-col h-full w-full p-4 min-h-0">
        {renderContent()}
      </div>
    </main>
  )
}
