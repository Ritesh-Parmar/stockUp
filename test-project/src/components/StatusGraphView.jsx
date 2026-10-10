import { useEffect, useRef, useState } from 'react'

const CHART_COLORS = [
  { bar: '#f59e0b', glow: 'rgba(245,158,11,0.25)' },
  { bar: '#3b82f6', glow: 'rgba(59,130,246,0.25)' },
  { bar: '#10b981', glow: 'rgba(16,185,129,0.25)' },
  { bar: '#a855f7', glow: 'rgba(168,85,247,0.25)' },
  { bar: '#ef4444', glow: 'rgba(239,68,68,0.25)' },
  { bar: '#06b6d4', glow: 'rgba(6,182,212,0.25)' },
  { bar: '#ec4899', glow: 'rgba(236,72,153,0.25)' },
]

function generateData() {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return labels.map((label) => ({
    label,
    value: Math.floor(Math.random() * 80) + 20,
  }))
}

export default function StatusGraphView({ onClose }) {
  const [data, setData] = useState(generateData)
  const [animatedHeights, setAnimatedHeights] = useState(data.map(() => 0))
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const canvasRef = useRef(null)

  const maxValue = Math.max(...data.map((d) => d.value), 1)

  // Grow the bars from zero. The initial zeroes come from useState above, and a
  // refresh re-zeroes them in handleRefresh — so the effect only has to schedule
  // the grow, keeping setState inside the timer callback rather than running it
  // synchronously on every render pass.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedHeights(data.map((d) => (d.value / maxValue) * 100))
    }, 50)
    return () => clearTimeout(timer)
  }, [data, maxValue])

  const handleRefresh = () => {
    const next = generateData()
    setData(next)
    setAnimatedHeights(next.map(() => 0))
  }

  // Draw the line chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const padX = 40
    const padY = 30
    const w = rect.width - padX * 2
    const h = rect.height - padY * 2

    // Grid lines
    ctx.strokeStyle = 'rgba(148,163,184,0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padY + (h / 4) * i
      ctx.beginPath()
      ctx.moveTo(padX, y)
      ctx.lineTo(padX + w, y)
      ctx.stroke()
    }

    if (data.length < 2) return

    const points = data.map((d, i) => ({
      x: padX + (w / (data.length - 1)) * i,
      y: padY + h - (d.value / maxValue) * h,
    }))

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padY, 0, padY + h)
    gradient.addColorStop(0, 'rgba(59,130,246,0.15)')
    gradient.addColorStop(1, 'rgba(59,130,246,0)')
    ctx.beginPath()
    ctx.moveTo(points[0].x, padY + h)
    points.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.lineTo(points[points.length - 1].x, padY + h)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    // Line
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      const cpx1 = (points[i - 1].x + points[i].x) / 2
      const cpy1 = points[i - 1].y
      const cpx2 = (points[i - 1].x + points[i].x) / 2
      const cpy2 = points[i].y
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, points[i].x, points[i].y)
    }
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Dots
    points.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#1e293b'
      ctx.fill()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // Labels
    ctx.fillStyle = '#64748b'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    data.forEach((d, i) => {
      ctx.fillText(d.label, points[i].x, padY + h + 18)
    })
  }, [data, maxValue])

  return (
    <div className="flex h-full flex-col rounded-3xl border border-edge-strong bg-panel/90 p-4 shadow-xl shadow-shade/20">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3 text-ink">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-ink-3">Diagnostics</p>
          <h3 className="text-lg font-semibold text-ink">System Status</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-xl border border-info/50 bg-info/20 px-4 py-2 text-sm font-medium text-info transition hover:border-info hover:bg-info/30"
          >
            Refresh Data
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-edge-strong bg-raised px-4 py-2 text-sm text-ink transition hover:border-edge-hover hover:bg-raised"
          >
            Close
          </button>
        </div>
      </div>

      {/* Charts grid */}
      <div className="flex-1 min-h-0 grid grid-rows-2 gap-4 overflow-auto">
        {/* Bar Chart */}
        <div className="rounded-2xl border border-edge bg-page p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block h-2 w-2 rounded-full bg-warn animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-ink-2">
              Weekly Activity — Bar Chart
            </span>
          </div>

          <div className="flex-1 flex items-end gap-3 px-2 min-h-0">
            {data.map((d, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length]
              return (
                <div
                  key={d.label}
                  className="flex-1 flex flex-col items-center gap-2"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  <span
                    className="text-xs font-mono tabular-nums transition-opacity duration-200"
                    style={{
                      color: color.bar,
                      opacity: hoveredIndex === i ? 1 : 0,
                    }}
                  >
                    {d.value}
                  </span>

                  {/* Bar */}
                  <div className="w-full flex justify-center" style={{ height: '80%' }}>
                    <div className="relative w-full max-w-[44px] flex items-end h-full">
                      <div
                        className="w-full rounded-t-lg transition-all duration-700 ease-out"
                        style={{
                          height: `${animatedHeights[i]}%`,
                          background: `linear-gradient(to top, ${color.bar}, ${color.bar}cc)`,
                          boxShadow:
                            hoveredIndex === i
                              ? `0 0 20px ${color.glow}, 0 0 40px ${color.glow}`
                              : 'none',
                          transform: hoveredIndex === i ? 'scaleX(1.08)' : 'scaleX(1)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Label */}
                  <span className="text-[10px] font-mono uppercase tracking-wider text-ink-3">
                    {d.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Line Chart */}
        <div className="rounded-2xl border border-edge bg-page p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block h-2 w-2 rounded-full bg-info animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-ink-2">
              Weekly Trend — Line Chart
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between px-2 text-xs font-mono text-ink-3">
        <span>7 data points • Updated just now</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-good" />
          All systems nominal
        </span>
      </div>
    </div>
  )
}
