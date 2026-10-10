export default function FileUploadPrompt({ onFileSelected }) {
  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      onFileSelected(selectedFile)
    }
    event.currentTarget.value = ''
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6 rounded-3xl border border-edge-strong bg-panel/80 p-10 text-center shadow-lg shadow-shade/15">
      <p className="text-xs uppercase tracking-[0.35em] text-ink-3">Upload spreadsheet</p>
      <h2 className="text-2xl font-semibold text-ink">Select a .xlsx file</h2>
      <p className="max-w-xl text-sm leading-6 text-ink-2">
        Upload an Excel workbook and edit it directly inside the main content area. The first row becomes column headers.
      </p>
      <label
        htmlFor="xlsx-upload"
        className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-warn px-6 py-3 text-sm font-semibold text-on-accent transition hover:bg-warn/90"
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
