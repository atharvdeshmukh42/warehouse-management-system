import { useEffect, useRef, useState } from 'react'
import { compactMoney, money, shortDate } from './api.js'

// Width of an element, kept up to date when the window resizes
function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return width
}

// A clean gap between axis ticks: 1, 2, 2.5 or 5 times a power of ten
function niceStep(value) {
  const power = Math.pow(10, Math.floor(Math.log10(value)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power
  }
  return value
}

// Daily values over time, with a crosshair and tooltip on hover.
// data: [{ day: '2026-10-21', value: 1234, orders: 5 }]
export function AreaChart({ data, height = 240 }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState(null)

  const pad = { top: 12, right: 12, bottom: 28, left: 52 }
  const plotWidth = Math.max(width - pad.left - pad.right, 1)
  const plotHeight = height - pad.top - pad.bottom
  const highest = Math.max(...data.map((d) => d.value), 1)
  const step = niceStep(highest / 4)
  const max = Math.ceil(highest / step) * step

  const x = (i) => pad.left + (i / Math.max(data.length - 1, 1)) * plotWidth
  const y = (value) => pad.top + plotHeight - (value / max) * plotHeight
  const bottom = pad.top + plotHeight

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ')
  const area = `${line} L${x(data.length - 1)},${bottom} L${x(0)},${bottom} Z`
  const ticks = []
  for (let tick = 0; tick <= max; tick += step) ticks.push(tick)
  const labelEvery = Math.ceil(data.length / 6)

  // Snap the pointer to the nearest day
  const onMove = (e) => {
    const left = e.currentTarget.getBoundingClientRect().left
    const i = Math.round(((e.clientX - left - pad.left) / plotWidth) * (data.length - 1))
    setHover(Math.min(Math.max(i, 0), data.length - 1))
  }

  const point = hover === null ? null : data[hover]
  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 80), width - 80)

  return (
    <div className="chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Order value per day">
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis" x={pad.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
                {compactMoney(tick)}
              </text>
            </g>
          ))}
          {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) && (
            <text key={d.day} className="chart-axis" x={x(i)} y={height - 8} textAnchor="middle">
              {shortDate(d.day)}
            </text>
          ))}

          <path className="chart-area" d={area} />
          <path className="chart-line" d={line} />

          {point && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={bottom} />}
          {point && <circle className="chart-dot" cx={x(hover)} cy={y(point.value)} r="4.5" />}
          {!point && (
            <circle className="chart-dot" cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="4.5" />
          )}
        </svg>
      )}

      {point && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: y(point.value) }}>
          <div className="chart-tooltip-date">
            {new Date(point.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <div className="chart-tooltip-value">{money(point.value)}</div>
          <div className="chart-tooltip-sub">{point.orders} orders</div>
        </div>
      )}
    </div>
  )
}

// Horizontal bars with the value at the tip.
// rows: [{ key, label, sub, value, display }]
export function BarList({ rows }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <div className="bar-row" key={row.key} title={`${row.label}: ${row.display}`}>
          <div className="bar-meta">
            <span className="bar-label">
              <span className="strong">{row.label}</span>
              {row.sub && <span className="muted"> · {row.sub}</span>}
            </span>
            <span className="bar-value">{row.display}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: (row.value / max) * 100 + '%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
