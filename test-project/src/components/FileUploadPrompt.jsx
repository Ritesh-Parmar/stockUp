export default function FileUploadPrompt({ onFileSelected }) {
  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      onFileSelected(selectedFile)
    }
    event.currentTarget.value = ''
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6 rounded-3xl border border-slate-700 bg-slate-900/80 p-10 text-center shadow-lg shadow-slate-950/30">
      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Upload spreadsheet</p>
      <h2 className="text-2xl font-semibold text-slate-100">Select a .xlsx file</h2>
      <p className="max-w-xl text-sm leading-6 text-slate-400">
        Upload an Excel workbook and edit it directly inside the main content area. The first row becomes column headers.
      </p>
      <label
        htmlFor="xlsx-upload"
        className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
      >
        Choose file
      </label>
      <input
        id="xlsx-upload"
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
