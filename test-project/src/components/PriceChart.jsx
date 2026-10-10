import { useId, useMemo, useState } from 'react'

/**
 * Price with its two moving averages, and the trades the algorithm made.
 *
 * Hand-rolled SVG rather than a charting library: three lines, some markers and
 * a crosshair do not justify 200 kB of dependency, and this project already
 * writes its own CSV parser and payment client for the same reason.
 *
 * Colours are the validated three-slot categorical palette, stepped for a dark
 * surface and checked against the slate-900 panel this renders on (worst
 * all-pairs CVD ΔE 9.4, normal-vision 20.9, all three ≥3:1 contrast). Buy and
 * sell markers use the reserved status colours, and carry a SHAPE — triangle up
 * versus down — plus a label in the tooltip, so the meaning never rests on hue
 * alone. That matters here because the sell marker's red and the slow average's
 * aqua are the kind of pair a colourblind reader can lose.
 *
 * One y-axis: price and both averages are rupees, so they share a scale. A
 * second axis would be the single worst thing one could do to this chart.
 */

// Internal coordinate space. The SVG scales to its container, so these are
// aspect-ratio units, not pixels.
const WIDTH = 720
const PLOT_HEIGHT = 240
// Reserved below the plot for the x-axis labels, so they can never be clipped
// by the container's height.
const AXIS_BAND = 26
const PAD = { left: 52, right: 58, top: 14 }

/**
 * Colours come from CSS variables, not literals, so the chart follows the
 * theme like everything else. The light and dark steps are DIFFERENT hues
 * chosen for their own surface — a single palette dimmed for dark mode fails
 * the contrast and colourblind checks. Both sets are validated in index.css.
 *
 * SVG presentation attributes cannot take `var()`, so these are applied
 * through `style` rather than `stroke=`/`fill=`.
 */
const SERIES = {
  price: { color: 'var(--chart-1)', label: 'Price' },
  fast: { color: 'var(--chart-2)', label: 'Fast avg' },
  slow: { color: 'var(--chart-3)', label: 'Slow avg' },
}
const STATUS = { BUY: 'var(--status-buy)', SELL: 'var(--status-sell)' }
/** The panel colour, for the ring that lifts a marker off the lines. */
const SURFACE = 'var(--chart-surface)'
const GRID = 'var(--chart-grid)'
const AXIS = 'var(--chart-axis)'
const RULE = 'var(--chart-rule)'

const money = (value) => `₹${value.toFixed(2)}`

export default function PriceChart({ series = [], fastSeries = [], slowSeries = [], symbol }) {
  const clipId = useId()
  const [hover, setHover] = useState(null)

  const geometry = useMemo(() => {
    const prices = series.map((point) => point.price)
    const everything = [...prices, ...fastSeries, ...slowSeries].filter((value) => typeof value === 'number')
    if (!everything.length) return null

    const low = Math.min(...everything)
    const high = Math.max(...everything)
    // A flat series would give a zero range and divide by zero; give it a
    // nominal band so the line draws down the middle instead of vanishing.
    const span = high - low || Math.max(high * 0.002, 0.02)
    const top = high + span * 0.12
    const bottom = low - span * 0.12

    const plotWidth = WIDTH - PAD.left - PAD.right
    const x = (index) => PAD.left + (series.length <= 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth)
    const y = (value) => PAD.top + (1 - (value - bottom) / (top - bottom)) * (PLOT_HEIGHT - PAD.top)

    const path = (values) => {
      let out = ''
      let open = false
      values.forEach((value, index) => {
        if (typeof value !== 'number') { open = false; return }
        out += `${open ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)} `
        open = true
      })
      return out.trim()
    }

    // Where the real seeded candles end and simulated bars begin. Drawn as a
    // rule so nobody can mistake invented prices for exchange data.
    const firstSim = series.findIndex((point) => point.source === 'sim')

    return {
      x,
      y,
      bottom,
      top,
      pricePath: path(prices),
      fastPath: path(fastSeries),
      slowPath: path(slowSeries),
      ticks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => bottom + fraction * (top - bottom)),
      marks: series
        .map((point, index) => (point.mark ? { index, side: point.mark, price: point.price } : null))
        .filter(Boolean),
      simFrom: firstSim > 0 ? firstSim : null,
      plotWidth,
    }
  }, [series, fastSeries, slowSeries])

  if (!geometry) {
    return (
      <div className="h-[220px] flex items-center justify-center text-ink-3 text-xs font-mono">
        Waiting for prices…
      </div>
    )
  }

  // Nearest-point crosshair. The hit area is the whole plot, so there is no
  // pinpoint target to land on.
  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    const index = Math.round(((ratio * WIDTH) - PAD.left) / geometry.plotWidth * (series.length - 1))
    if (index >= 0 && index < series.length) setHover(index)
    else setHover(null)
  }

  const point = hover === null ? null : series[hover]
  const lastPrice = series.at(-1)?.price
  const lastFast = [...fastSeries].reverse().find((value) => typeof value === 'number')
  const lastSlow = [...slowSeries].reverse().find((value) => typeof value === 'number')

  return (
    <div>
      {/* Legend. Always present — three series means identity can never rest
          on colour memory alone. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-2">
        {Object.entries(SERIES).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-2">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-2">
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1 9,8 1,8" style={{ fill: STATUS.BUY }} /></svg>
          Bought
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-2">
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,9 1,2 9,2" style={{ fill: STATUS.SELL }} /></svg>
          Sold
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${PLOT_HEIGHT + AXIS_BAND}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label={`${symbol} price with fast and slow moving averages`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={0} width={geometry.plotWidth} height={PLOT_HEIGHT} />
          </clipPath>
        </defs>

        {/* Grid: solid hairlines one shade off the surface. Never dashed. */}
        {geometry.ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left} x2={WIDTH - PAD.right}
              y1={geometry.y(value)} y2={geometry.y(value)}
              strokeWidth="1" style={{ stroke: GRID }}
            />
            <text
              x={PAD.left - 8} y={geometry.y(value) + 3}
              textAnchor="end" fontSize="9"
              style={{ fontVariantNumeric: 'tabular-nums', fill: AXIS }}
            >
              {value.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Where exchange data stops and simulation starts. */}
        {geometry.simFrom !== null && (
          <g>
            <line
              x1={geometry.x(geometry.simFrom)} x2={geometry.x(geometry.simFrom)}
              y1={PAD.top} y2={PLOT_HEIGHT}
              strokeWidth="1" style={{ stroke: RULE }}
            />
            <text
              x={geometry.x(geometry.simFrom) + 4} y={PAD.top + 9}
              fontSize="8" fontFamily="monospace" style={{ fill: AXIS }}
            >
              simulated →
            </text>
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {/* Averages first so the price line sits on top of them. */}
          <path d={geometry.slowPath} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: SERIES.slow.color }} />
          <path d={geometry.fastPath} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: SERIES.fast.color }} />
          <path d={geometry.pricePath} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: SERIES.price.color }} />
        </g>

        {/* Trade markers: shape carries the meaning, colour reinforces it.
            The 2px surface ring lifts them off the lines underneath. */}
        {geometry.marks.map((mark) => {
          const cx = geometry.x(mark.index)
          const cy = geometry.y(mark.price)
          const up = mark.side === 'BUY'
          const offset = up ? 13 : -13
          return (
            <g key={`${mark.index}-${mark.side}`}>
              <polygon
                points={up
                  ? `${cx},${cy + offset - 9} ${cx + 5.5},${cy + offset} ${cx - 5.5},${cy + offset}`
                  : `${cx},${cy + offset + 9} ${cx - 5.5},${cy + offset} ${cx + 5.5},${cy + offset}`}
                strokeWidth="2"
                style={{ fill: STATUS[mark.side], stroke: SURFACE }}
              />
            </g>
          )
        })}

        {/* Direct labels on the right end — selectively, one per series, never
            a number on every point. */}
        {[[lastPrice, SERIES.price.color], [lastFast, SERIES.fast.color], [lastSlow, SERIES.slow.color]]
          .filter(([value]) => typeof value === 'number')
          .map(([value, color]) => (
            <text
              key={color}
              x={WIDTH - PAD.right + 6} y={geometry.y(value) + 3}
              fontSize="9" fontFamily="monospace"
              style={{ fontVariantNumeric: 'tabular-nums', fill: color }}
            >
              {value.toFixed(1)}
            </text>
          ))}

        {/* Crosshair */}
        {hover !== null && point && (
          <g>
            <line
              x1={geometry.x(hover)} x2={geometry.x(hover)}
              y1={PAD.top} y2={PLOT_HEIGHT}
              strokeWidth="1" style={{ stroke: AXIS }}
            />
            <circle
              cx={geometry.x(hover)} cy={geometry.y(point.price)} r="4" strokeWidth="2"
              style={{ fill: SERIES.price.color, stroke: SURFACE }}
            />
          </g>
        )}

        {/* x-axis band: oldest / newest, inside the reserved space. */}
        <text x={PAD.left} y={PLOT_HEIGHT + 16} fontSize="9" fontFamily="monospace" style={{ fill: AXIS }}>
          {series.length} bars ago
        </text>
        <text x={WIDTH - PAD.right} y={PLOT_HEIGHT + 16} fontSize="9" fontFamily="monospace" textAnchor="end" style={{ fill: AXIS }}>
          now
        </text>
      </svg>

      {/* Tooltip as text under the chart rather than a floating box: it cannot
          be clipped, and the values stay readable while the mouse moves. */}
      <div className="mt-1 h-4 text-[10px] font-mono text-ink-2">
        {point ? (
          <span className="flex flex-wrap gap-x-3">
            <span>bar {hover + 1}/{series.length}</span>
            <span style={{ color: SERIES.price.color }}>{money(point.price)}</span>
            {typeof fastSeries[hover] === 'number' && <span style={{ color: SERIES.fast.color }}>fast {money(fastSeries[hover])}</span>}
            {typeof slowSeries[hover] === 'number' && <span style={{ color: SERIES.slow.color }}>slow {money(slowSeries[hover])}</span>}
            <span className="text-ink-3">{point.source === 'real' ? 'real' : 'simulated'}</span>
            {point.mark && <span style={{ color: STATUS[point.mark] }}>{point.mark === 'BUY' ? '▲ bought here' : '▼ sold here'}</span>}
          </span>
        ) : (
          <span className="text-ink-3">Hover the chart to read any bar. Every value is also in the tables below.</span>
        )}
      </div>
    </div>
  )
}
