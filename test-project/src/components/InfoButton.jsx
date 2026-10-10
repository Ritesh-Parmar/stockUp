import { useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'

/**
 * An "i" button that reveals explanatory text on click.
 *
 * For context a viewer wants ONCE — how the demo works, which test card to use —
 * rather than on every glance. Standing banners for that push the actual content
 * down the page and get skipped after the first read.
 *
 * Deliberately click-to-toggle rather than hover: hover panels cannot be opened
 * on a touch screen and vanish the moment you move toward the thing you were
 * trying to read.
 *
 * WARNINGS DO NOT BELONG IN HERE. Anything the viewer must see without asking —
 * live payment keys are active, the price feed failed, a tick errored — stays a
 * visible banner. The split is: explanation hides, alarm does not.
 */
export default function InfoButton({ title = 'About this screen', children, label = 'Show information' }) {
  const [open, setOpen] = useState(false)
  const holder = useRef(null)

  // Escape to close, and a click anywhere outside. Both are attached only while
  // open, so there is no listener sitting on the document the rest of the time.
  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    const onClick = (event) => {
      if (holder.current && !holder.current.contains(event.target)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    // mousedown rather than click: a click that starts outside and ends inside
    // should still close, and this fires before any button inside reacts.
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={holder} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          open
            ? 'border-edge-strong bg-raised text-ink'
            : 'border-edge-strong bg-panel text-ink-2 hover:border-edge-hover hover:text-ink'
        }`}
      >
        <Info size={15} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          // Right-aligned so it opens inward from a top-right corner and cannot
          // run off the edge of the viewport.
          className="absolute right-0 top-10 z-30 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-edge-strong bg-panel p-4 shadow-2xl shadow-shade/30"
        >
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-ink font-semibold text-sm">{title}</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-ink-3 hover:text-ink transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-ink-2">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
