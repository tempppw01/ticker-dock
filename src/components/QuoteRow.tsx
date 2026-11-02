import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Intraday, Quote } from '../lib/quotes'
import { quoteCode } from '../lib/quotes'
import { Sparkline } from './Sparkline'

const priceFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function rangePosition(quote: Quote) {
  const range = quote.high - quote.low
  if (!Number.isFinite(range) || range <= 0) return 50
  return Math.min(100, Math.max(0, ((quote.price - quote.low) / range) * 100))
}

function quoteClock(quoteTime: string) {
  const match = / (\d{2}:\d{2})/.exec(quoteTime)
  return match?.[1] ?? ''
}

interface QuoteRowProps {
  quote: Quote
  intraday: Intraday | null
  index: number
  total: number
  onPrevious: () => void
  onNext: () => void
}

export function QuoteRow({
  quote,
  intraday,
  index,
  total,
  onPrevious,
  onNext,
}: QuoteRowProps) {
  const direction = quote.changePercent > 0 ? 'up' : quote.changePercent < 0 ? 'down' : 'flat'
  const sign = quote.changePercent > 0 ? '+' : ''
  const position = rangePosition(quote)
  const rangeStyle = { '--range-position': `${position}%` } as CSSProperties
  const clock = quoteClock(quote.quoteTime)
  const hasTrend = Boolean(intraday && intraday.points.length > 1)
  const isSector = quote.symbol.toLowerCase().startsWith('bk')
  const previousLabel = isSector ? '上一个板块' : '上一只股票'
  const nextLabel = isSector ? '下一个板块' : '下一只股票'

  return (
    <div
      className="quote-row"
      title={`${quote.name} · 最高 ${priceFormatter.format(quote.high)} · 最低 ${priceFormatter.format(
        quote.low,
      )} · ${isSector ? '板块行情' : quote.quoteTime}`}
    >
      <button
        type="button"
        className="nav-button"
        aria-label={previousLabel}
        title={isSector ? '上一个' : '上一只'}
        disabled={total <= 1}
        onClick={onPrevious}
      >
        <ChevronLeft size={14} />
      </button>

      <div className="quote-name" data-tauri-drag-region>
        <span data-tauri-drag-region>{quote.name}</span>
        <span className="quote-meta" data-tauri-drag-region>
          <span className="quote-code">{quoteCode(quote.symbol)}</span>
          <span>{index + 1}/{total}</span>
          {isSector ? <span>板块</span> : clock && <span>{clock}</span>}
        </span>
      </div>

      <div className="quote-value">
        <span className="quote-price">{priceFormatter.format(quote.price)}</span>
        <span className={`quote-change ${direction}`}>
          {sign}
          {quote.changePercent.toFixed(2)}%
          <span className="quote-amount">
            {sign}
            {priceFormatter.format(quote.change)}
          </span>
        </span>
      </div>

      <div className="trend-area">
        {hasTrend && intraday ? (
          <Sparkline points={intraday.points} previousClose={intraday.previousClose} />
        ) : (
          <div className="range-track" style={rangeStyle} aria-hidden="true">
            <span className="range-fill" />
            <span className="range-marker" />
          </div>
        )}
      </div>

      <button
        type="button"
        className="nav-button"
        aria-label={nextLabel}
        title={isSector ? '下一个' : '下一只'}
        disabled={total <= 1}
        onClick={onNext}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
