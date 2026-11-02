import { useId } from 'react'
import type { IntradayPoint } from '../lib/quotes'

interface SparklineProps {
  points: IntradayPoint[]
  previousClose: number
  compact?: boolean
}

const SIZES = {
  full: { width: 108, height: 44 },
  compact: { width: 76, height: 30 },
}
const PADDING = 3

export function Sparkline({ points, previousClose, compact = false }: SparklineProps) {
  const { width: WIDTH, height: HEIGHT } = compact ? SIZES.compact : SIZES.full
  const gradientId = `trend-${useId().replace(/:/g, '')}`
  const values = [...points.map((point) => point.price), previousClose]
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const spread = maximum - minimum
  const padding = spread > 0 ? spread * 0.12 : Math.max(maximum * 0.001, 0.01)
  const floor = minimum - padding
  const ceiling = maximum + padding
  const usableHeight = HEIGHT - PADDING * 2
  const start = points[0]?.price ?? previousClose
  const end = points.at(-1)?.price ?? previousClose
  const color = end >= previousClose ? '#ff6677' : '#22c996'

  const yFor = (price: number) =>
    PADDING + ((ceiling - price) / (ceiling - floor || 1)) * usableHeight
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? WIDTH : (index / (points.length - 1)) * WIDTH
    return { x, y: yFor(point.price) }
  })
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`
  const baselineY = yFor(previousClose)
  const last = coordinates.at(-1)

  return (
    <svg
      className={`sparkline ${compact ? 'sparkline-compact' : ''}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="分时走势"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        className="sparkline-baseline"
        x1="0"
        x2={WIDTH}
        y1={baselineY}
        y2={baselineY}
      />
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        className="sparkline-line"
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last.x} cy={last.y} r="2" fill={color} className="sparkline-dot" />}
      <title>
        {`分时 ${start.toFixed(2)} - ${end.toFixed(2)}，昨收 ${previousClose.toFixed(2)}`}
      </title>
    </svg>
  )
}
