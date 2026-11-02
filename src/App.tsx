import { Fragment, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Check,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import { QuoteRow } from './components/QuoteRow'
import { Sparkline } from './components/Sparkline'
import {
  autoMarket,
  formatBeijingTime,
  formatCountdown,
  marketStatus,
  nextMarketOpen,
  type Market,
  type MarketStatus,
} from './lib/market'
import {
  loadIntraday,
  loadQuotes,
  loadSectorWatchlist,
  loadSectors,
  loadWatchlists,
  MAX_SECTOR_WATCHLIST,
  MAX_WATCHLIST,
  normalizeSectorCode,
  normalizeSymbolInput,
  quoteCode,
  saveSectorWatchlist,
  saveWatchlists,
  searchSectors,
  type Intraday,
  type Quote,
  type SectorInfo,
  type Watchlists,
} from './lib/quotes'
import { loadViewMode, saveViewMode, VIEW_SIZES, type ViewMode } from './lib/view'

type MarketMode = 'auto' | Market | 'sector'

const MODE_LABELS: Array<{ value: MarketMode; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'cn', label: 'A股' },
  { value: 'sector', label: '板块' },
  { value: 'us', label: '美股' },
]

function windowAction(action: () => Promise<void>) {
  void action().catch(() => undefined)
}

function handleCompactDragStart(event: MouseEvent<HTMLDivElement>) {
  if (event.button !== 0) return

  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, textarea, select')) {
    return
  }

  event.preventDefault()
  windowAction(() => getCurrentWindow().startDragging())
}

function stepIndex(current: number, length: number, step: number) {
  if (length <= 1) return 0
  return (Math.min(current, length - 1) + step + length) % length
}

function statusTitle(
  status: MarketStatus,
  now: Date,
  sector = false,
  sectorWatchCount = 0,
) {
  const market = sector ? 'A股板块' : status.market === 'cn' ? 'A股' : '美股'
  const scope = sector
    ? sectorWatchCount > 0
      ? '，自选板块与涨幅榜'
      : '，行业与概念涨幅榜'
    : ''
  if (status.isLive) {
    const earlyClose = status.isEarlyClose ? '（半日市，13:00 收盘）' : ''
    return `${market}${status.label}${earlyClose}${scope}，每 5 秒自动刷新`
  }

  const nextOpen = nextMarketOpen(status.market, now)
  return `${market}${status.label}${scope}，${formatBeijingTime(
    nextOpen,
  )} 开盘，还有 ${formatCountdown(nextOpen, now)}，休市每 60 秒刷新`
}

function App() {
  const [mode, setMode] = useState<MarketMode>('auto')
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode())
  const [watchlists, setWatchlists] = useState<Watchlists>(() => loadWatchlists())
  const [indexes, setIndexes] = useState<Record<Market, number>>({ cn: 0, us: 0 })
  const [now, setNow] = useState(() => new Date())
  const [snapshot, setSnapshot] = useState<{
    market: Market
    symbolsKey: string
    items: Quote[]
    updatedAt: Date
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ market: Market; message: string } | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [intradayCache, setIntradayCache] = useState<Record<string, Intraday>>({})
  const [sectorItems, setSectorItems] = useState<Quote[]>([])
  const [sectorIndex, setSectorIndex] = useState(0)
  const [sectorLoading, setSectorLoading] = useState(true)
  const [sectorError, setSectorError] = useState<string | null>(null)
  const [sectorWatchlist, setSectorWatchlist] = useState<string[]>(() => loadSectorWatchlist())
  const [sectorSearchResults, setSectorSearchResults] = useState<SectorInfo[]>([])
  const [sectorSearching, setSectorSearching] = useState(false)
  const [sectorSearchError, setSectorSearchError] = useState<string | null>(null)
  const [sectorSearchDone, setSectorSearchDone] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  const isSector = mode === 'sector'
  const compact = viewMode === 'compact'
  const activeMarket: Market =
    mode === 'auto' ? autoMarket(now) : mode === 'sector' ? 'cn' : mode
  const status = marketStatus(activeMarket, now)
  const isLive = status.isLive
  const symbols = watchlists[activeMarket]
  const symbolsKey = symbols.join(',')
  const sectorWatchlistKey = sectorWatchlist.join(',')
  const stockQuotes =
    snapshot?.market === activeMarket && snapshot.symbolsKey === symbolsKey ? snapshot.items : []
  const quotes = isSector ? sectorItems : stockQuotes
  const totalCount = isSector ? sectorItems.length : symbols.length
  const maxIndex = Math.max(0, totalCount - 1)
  const index = isSector
    ? Math.min(sectorIndex, maxIndex)
    : Math.min(indexes[activeMarket], maxIndex)
  const activeQuote = quotes[index] ?? null
  const activeSymbol = activeQuote?.symbol ?? null
  const activeIntraday = activeSymbol ? (intradayCache[activeSymbol] ?? null) : null
  const activeError = isSector
    ? sectorError
    : error?.market === activeMarket
      ? error.message
      : null
  const showSkeleton = isSector
    ? sectorItems.length === 0 && sectorLoading
    : quotes.length === 0 &&
      (loading ||
        snapshot?.market !== activeMarket ||
        snapshot.symbolsKey !== symbolsKey)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const { width, height } = VIEW_SIZES[viewMode]
    windowAction(() => getCurrentWindow().setSize(new LogicalSize(width, height)))
  }, [viewMode])

  useEffect(() => {
    if (isSector) return

    let cancelled = false
    let timer: number | undefined

    const run = async () => {
      setLoading(true)
      let failed = false

      try {
        const data = await loadQuotes(symbols)
        if (cancelled) return
        setSnapshot({
          market: activeMarket,
          symbolsKey,
          items: data,
          updatedAt: new Date(),
        })
        setError(null)
      } catch (reason) {
        if (cancelled) return
        failed = true
        setError({
          market: activeMarket,
          message: reason instanceof Error ? reason.message : String(reason),
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
          const delay = failed ? 15_000 : isLive ? 5_000 : 60_000
          timer = window.setTimeout(run, delay)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [activeMarket, symbols, symbolsKey, isLive, isSector, refreshToken])

  useEffect(() => {
    if (!isSector) return

    let cancelled = false
    let timer: number | undefined

    const run = async () => {
      setSectorLoading(true)
      let failed = false

      try {
        const data = await loadSectors(sectorWatchlist)
        if (cancelled) return
        setSectorItems(data)
        setSectorError(null)
      } catch (reason) {
        if (cancelled) return
        failed = true
        setSectorError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (!cancelled) {
          setSectorLoading(false)
          const delay = failed ? 15_000 : isLive ? 5_000 : 60_000
          timer = window.setTimeout(run, delay)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [isSector, isLive, refreshToken, sectorWatchlist, sectorWatchlistKey])

  useEffect(() => {
    if (!activeSymbol) return

    let cancelled = false
    let timer: number | undefined

    const run = async () => {
      try {
        const data = await loadIntraday(activeSymbol)
        if (cancelled) return
        setIntradayCache((current) => ({ ...current, [activeSymbol]: data }))
      } catch {
        // The range indicator remains available when minute data cannot be loaded.
      }
    }

    void run()
    timer = window.setInterval(run, isLive ? 30_000 : 120_000)
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [activeSymbol, isLive])

  useEffect(() => {
    if (isSector || symbols.length <= 1 || addOpen || manageOpen || hovered) return

    const timer = window.setTimeout(() => {
      setIndexes((current) => ({
        ...current,
        [activeMarket]: stepIndex(current[activeMarket], symbols.length, 1),
      }))
    }, 7_000)
    return () => window.clearTimeout(timer)
  }, [activeMarket, symbols.length, index, addOpen, manageOpen, hovered, isSector])

  useEffect(() => {
    if (!isSector || sectorItems.length <= 1 || addOpen || manageOpen || hovered) return

    const timer = window.setTimeout(() => {
      setSectorIndex((current) => stepIndex(current, sectorItems.length, 1))
    }, 7_000)
    return () => window.clearTimeout(timer)
  }, [isSector, sectorItems.length, index, addOpen, manageOpen, hovered])

  useEffect(() => {
    if (!addOpen) return
    const timer = window.setTimeout(() => addInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [addOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (manageOpen) {
        if (event.key === 'Escape') {
          if (pendingRemove) {
            setPendingRemove(null)
          } else {
            setManageOpen(false)
          }
        }
        return
      }

      if (addOpen) {
        if (event.key === 'Escape') {
          setAddOpen(false)
          setDraft('')
          setAddError(null)
        }
        return
      }

      if (event.key === 'ArrowLeft') {
        if (isSector) {
          setSectorIndex((current) => stepIndex(current, sectorItems.length, -1))
        } else {
          setIndexes((current) => ({
            ...current,
            [activeMarket]: stepIndex(current[activeMarket], symbols.length, -1),
          }))
        }
      }
      if (event.key === 'ArrowRight') {
        if (isSector) {
          setSectorIndex((current) => stepIndex(current, sectorItems.length, 1))
        } else {
          setIndexes((current) => ({
            ...current,
            [activeMarket]: stepIndex(current[activeMarket], symbols.length, 1),
          }))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeMarket,
    addOpen,
    isSector,
    manageOpen,
    pendingRemove,
    sectorItems.length,
    symbols.length,
  ])

  const rotate = (step: number) => {
    if (isSector) {
      setSectorIndex((current) => stepIndex(current, sectorItems.length, step))
      return
    }

    setIndexes((current) => {
      const next = stepIndex(current[activeMarket], symbols.length, step)
      return { ...current, [activeMarket]: next }
    })
  }

  const togglePinned = () => {
    const next = !pinned
    setPinned(next)
    windowAction(() => getCurrentWindow().setAlwaysOnTop(next))
  }

  const resetSectorSearch = () => {
    setSectorSearchResults([])
    setSectorSearching(false)
    setSectorSearchError(null)
    setSectorSearchDone(false)
  }

  const closeAdd = () => {
    setAddOpen(false)
    setDraft('')
    setAddError(null)
    resetSectorSearch()
  }

  const toggleManage = () => {
    closeAdd()
    setPendingRemove(null)
    setManageOpen((current) => !current)
  }

  const openAdd = () => {
    if (addOpen) {
      closeAdd()
      return
    }
    setManageOpen(false)
    setPendingRemove(null)
    setDraft('')
    setAddError(null)
    resetSectorSearch()
    setAddOpen(true)
  }

  const changeMode = (next: MarketMode) => {
    setMode(next)
    closeAdd()
    setManageOpen(false)
    setPendingRemove(null)
  }

  const changeView = (next: ViewMode) => {
    if (next === viewMode) return
    setViewMode(next)
    saveViewMode(next)
    closeAdd()
    setManageOpen(false)
    setPendingRemove(null)
  }

  const submitSymbol = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeSymbolInput(draft)
    if (!normalized) {
      setAddError('代码无效')
      return
    }

    const list = watchlists[normalized.market]
    if (list.includes(normalized.symbol)) {
      setAddError('已在自选')
      return
    }
    if (list.length >= MAX_WATCHLIST) {
      setAddError(`最多 ${MAX_WATCHLIST} 只`)
      return
    }

    const nextWatchlists = {
      ...watchlists,
      [normalized.market]: [...list, normalized.symbol],
    }
    setWatchlists(nextWatchlists)
    saveWatchlists(nextWatchlists)
    setIndexes((current) => ({ ...current, [normalized.market]: list.length }))
    if (normalized.market !== activeMarket) setMode(normalized.market)
    closeAdd()
  }

  const submitSectorSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = draft.trim()
    if (!query) {
      setSectorSearchError('请输入板块名称或代码')
      return
    }

    setSectorSearching(true)
    setSectorSearchError(null)
    setSectorSearchDone(false)
    try {
      const results = await searchSectors(query)
      setSectorSearchResults(results)
      setSectorSearchDone(true)
    } catch (reason) {
      setSectorSearchResults([])
      setSectorSearchError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSectorSearching(false)
    }
  }

  const addSector = (rawCode: string) => {
    const code = normalizeSectorCode(rawCode)
    if (!code || sectorWatchlist.includes(code)) return
    if (sectorWatchlist.length >= MAX_SECTOR_WATCHLIST) {
      setSectorSearchError(`最多 ${MAX_SECTOR_WATCHLIST} 个板块`)
      return
    }

    const next = [code, ...sectorWatchlist]
    setSectorWatchlist(next)
    saveSectorWatchlist(next)
    setSectorIndex(0)
    closeAdd()
  }

  const removeSector = (code: string) => {
    const next = sectorWatchlist.filter((item) => item !== code)
    setSectorWatchlist(next)
    saveSectorWatchlist(next)
    setSectorIndex((current) => Math.max(0, current - 1))
    setPendingRemove(null)
  }

  const removeSymbol = (targetSymbol: string) => {
    if (symbols.length <= 1) {
      return
    }

    const targetIndex = symbols.indexOf(targetSymbol)
    const nextList = symbols.filter((symbol) => symbol !== targetSymbol)
    const nextWatchlists = { ...watchlists, [activeMarket]: nextList }
    setWatchlists(nextWatchlists)
    saveWatchlists(nextWatchlists)
    setIndexes((current) => {
      const currentIndex = current[activeMarket]
      const shifted = targetIndex >= 0 && targetIndex < currentIndex ? currentIndex - 1 : currentIndex
      return {
        ...current,
        [activeMarket]: Math.min(Math.max(0, shifted), nextList.length - 1),
      }
    })
    setPendingRemove(null)
  }

  const selectSymbol = (targetIndex: number) => {
    setIndexes((current) => ({ ...current, [activeMarket]: targetIndex }))
    setManageOpen(false)
    setPendingRemove(null)
  }

  const selectSector = (targetIndex: number) => {
    setSectorIndex(targetIndex)
    setManageOpen(false)
  }

  const addStatus = addError ?? '输入代码后回车'
  const sectorAddStatus =
    sectorSearchError ?? (sectorSearching ? '搜索中…' : '输入板块名或代码后回车')
  const sectorWatchCount = sectorItems.filter((quote) =>
    sectorWatchlist.includes(quote.code),
  ).length
  const statusLabel =
    status.isEarlyClose && isLive ? `${status.label} · 半日市` : status.label
  const headerStatus = manageOpen
    ? isSector
      ? `板块 ${sectorItems.length} 个 · 自选 ${sectorWatchlist.length}`
      : `自选 ${symbols.length} 只`
    : addOpen
      ? isSector
        ? sectorAddStatus
        : addStatus
      : activeError
        ? '连接失败 · 15秒重试'
        : `${isSector ? '板块' : activeMarket === 'cn' ? 'A股' : '美股'} ${statusLabel} · ${
            isLive ? '5秒刷新' : '60秒刷新'
          }`
  const headerTitle = manageOpen
    ? isSector
      ? '列表：点击板块切换，点垃圾桶移除自选，点 + 加入自选，按 Esc 退出'
      : '列表：点击股票切换，点垃圾桶移除，按 Esc 退出'
    : addOpen
      ? isSector
        ? '搜索板块名称或代码，例如 银行、券商、BK1283'
        : '输入 6 位 A 股代码或美股代码，例如 600519、AAPL'
      : activeError
        ? activeError
        : statusTitle(status, now, isSector, sectorWatchCount)
  const quoteBySymbol = new Map(stockQuotes.map((quote) => [quote.symbol, quote]))
  const compactDirection = !activeQuote
    ? 'flat'
    : activeQuote.changePercent > 0
      ? 'up'
      : activeQuote.changePercent < 0
        ? 'down'
        : 'flat'
  const compactChange = activeQuote
    ? `${activeQuote.changePercent > 0 ? '+' : ''}${activeQuote.changePercent.toFixed(2)}%`
    : '--'
  const compactName = activeQuote?.name ?? (isSector ? '板块' : '行情')
  const compactTrend = Boolean(activeIntraday && activeIntraday.points.length > 1)

  return (
    <div className="app-frame">
      <section
        className={`widget ${addOpen ? 'editing' : ''} ${compact ? 'compact' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {compact ? (
          <div className="compact-row" onMouseDown={handleCompactDragStart}>
            <span className="compact-name" title={compactName}>
              {compactName}
            </span>
            <span className="compact-trend">
              {compactTrend && activeIntraday ? (
                <Sparkline
                  points={activeIntraday.points}
                  previousClose={activeIntraday.previousClose}
                  compact
                />
              ) : null}
            </span>
            <span
              className={`compact-change ${compactDirection}`}
              title={headerTitle}
            >
              {compactChange}
            </span>
            <button
              type="button"
              className="icon-button compact-action"
              title="展开完整视图"
              aria-label="展开完整视图"
              onClick={() => changeView('full')}
            >
              <Maximize2 size={12} />
            </button>
          </div>
        ) : (
          <>
        <header className="widget-header" data-tauri-drag-region>
          <div className="header-left" data-tauri-drag-region>
            <div className="mode-tabs" role="tablist" aria-label="市场选择">
              {MODE_LABELS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={mode === item.value}
                  className={`mode-tab ${mode === item.value ? 'active' : ''}`}
                  onClick={() => changeMode(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span
              className={`status-dot ${isLive && !addOpen ? 'live' : ''}`}
              aria-hidden="true"
            />
            <span
              className={`status-text ${
                addError || sectorSearchError || activeError ? 'error' : ''
              }`}
              title={headerTitle}
            >
              {headerStatus}
            </span>
          </div>

          <div className="window-actions">
            <button
              type="button"
              className="icon-button"
              title="收起为小胶囊"
              aria-label="收起为小胶囊"
              onClick={() => changeView('compact')}
            >
              <Minimize2 size={13} />
            </button>
            <button
              type="button"
              className={`icon-button ${manageOpen ? 'active' : ''}`}
              title={manageOpen ? '退出列表' : '列表'}
              aria-label={manageOpen ? '退出列表' : '列表'}
              onClick={toggleManage}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              className={`icon-button ${addOpen ? 'active' : ''}`}
              title={addOpen ? '取消添加' : isSector ? '添加板块' : '添加自选'}
              aria-label={addOpen ? '取消添加' : isSector ? '添加板块' : '添加自选'}
              onClick={openAdd}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              title={pinned ? '取消置顶' : '窗口置顶'}
              aria-label={pinned ? '取消置顶' : '窗口置顶'}
              onClick={togglePinned}
            >
              {pinned ? <Pin size={13} /> : <PinOff size={13} />}
            </button>
            <button
              type="button"
              className="icon-button"
              title="最小化"
              aria-label="最小化"
              onClick={() => windowAction(() => getCurrentWindow().minimize())}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="icon-button close"
              title="关闭"
              aria-label="关闭"
              onClick={() => windowAction(() => getCurrentWindow().close())}
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <main className="quote-area" aria-live="polite">
          {manageOpen ? (
            <div className="manage-panel">
              <div
                className="manage-scroll"
                role="list"
                aria-label={isSector ? '板块列表' : '自选列表'}
              >
                {isSector
                  ? sectorItems.map((quote, itemIndex) => {
                      const watched = sectorWatchlist.includes(quote.code)
                      const direction =
                        quote.changePercent > 0
                          ? 'up'
                          : quote.changePercent < 0
                            ? 'down'
                            : 'flat'
                      const showDivider =
                        itemIndex === sectorWatchCount &&
                        sectorWatchCount > 0 &&
                        sectorWatchCount < sectorItems.length

                      if (pendingRemove === quote.code) {
                        return (
                          <Fragment key={quote.symbol}>
                            {showDivider && (
                              <div className="manage-divider" role="separator">
                                涨幅榜
                              </div>
                            )}
                            <div
                              className="manage-row confirming"
                              role="listitem"
                            >
                              <span className="manage-confirm-text">
                                移除 {quote.name}？
                              </span>
                              <button
                                type="button"
                                className="manage-cancel"
                                aria-label={`取消移除 ${quote.name}`}
                                onClick={() => setPendingRemove(null)}
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                className="manage-danger"
                                aria-label={`确认移除 ${quote.name}`}
                                onClick={() => removeSector(quote.code)}
                              >
                                移除
                              </button>
                            </div>
                          </Fragment>
                        )
                      }

                      return (
                        <Fragment key={quote.symbol}>
                          {showDivider && (
                            <div className="manage-divider" role="separator">
                              涨幅榜
                            </div>
                          )}
                          <div
                            className={`manage-row ${
                              itemIndex === index ? 'current' : ''
                            }`}
                            role="listitem"
                          >
                            <button
                              type="button"
                              className="manage-main"
                              aria-label={`查看 ${quote.name}`}
                              onClick={() => selectSector(itemIndex)}
                            >
                              <span className="manage-name">{quote.name}</span>
                              <span className="manage-code">{quote.code}</span>
                              {watched && <span className="manage-tag">自选</span>}
                            </button>
                            <span className="manage-price">
                              {quote.price.toFixed(2)}
                            </span>
                            <span className={`manage-change ${direction}`}>
                              {quote.changePercent > 0 ? '+' : ''}
                              {quote.changePercent.toFixed(2)}%
                            </span>
                            {watched ? (
                              <button
                                type="button"
                                className="manage-remove"
                                title={`移除 ${quote.name}`}
                                aria-label={`移除 ${quote.name}`}
                                onClick={() => setPendingRemove(quote.code)}
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="manage-add"
                                title={`加入自选 ${quote.name}`}
                                aria-label={`加入自选 ${quote.name}`}
                                onClick={() => addSector(quote.code)}
                              >
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
                        </Fragment>
                      )
                    })
                  : symbols.map((symbol, itemIndex) => {
                      const quote = quoteBySymbol.get(symbol)
                      const name = quote?.name ?? quoteCode(symbol)
                      const direction = !quote
                        ? 'flat'
                        : quote.changePercent > 0
                          ? 'up'
                          : quote.changePercent < 0
                            ? 'down'
                            : 'flat'

                      if (pendingRemove === symbol) {
                        return (
                          <div className="manage-row confirming" role="listitem" key={symbol}>
                            <span className="manage-confirm-text">移除 {name}？</span>
                            <button
                              type="button"
                              className="manage-cancel"
                              aria-label={`取消移除 ${name}`}
                              onClick={() => setPendingRemove(null)}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="manage-danger"
                              aria-label={`确认移除 ${name}`}
                              onClick={() => removeSymbol(symbol)}
                            >
                              移除
                            </button>
                          </div>
                        )
                      }

                      return (
                        <div
                          className={`manage-row ${itemIndex === index ? 'current' : ''}`}
                          role="listitem"
                          key={symbol}
                        >
                          <button
                            type="button"
                            className="manage-main"
                            aria-label={`查看 ${name}`}
                            onClick={() => selectSymbol(itemIndex)}
                          >
                            <span className="manage-name">{name}</span>
                            <span className="manage-code">{quoteCode(symbol)}</span>
                          </button>
                          <span className="manage-price">
                            {quote ? quote.price.toFixed(2) : '--'}
                          </span>
                          <span className={`manage-change ${direction}`}>
                            {quote
                              ? `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`
                              : '--'}
                          </span>
                          <button
                            type="button"
                            className="manage-remove"
                            title={symbols.length <= 1 ? '至少保留一只' : `移除 ${name}`}
                            aria-label={`移除 ${name}`}
                            disabled={symbols.length <= 1}
                            onClick={() => setPendingRemove(symbol)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
              </div>
            </div>
          ) : addOpen && isSector ? (
            <div className="sector-search">
              <form className="add-row sector-search-row" onSubmit={submitSectorSearch}>
                <button
                  type="button"
                  className="icon-button add-cancel"
                  title="取消"
                  aria-label="关闭板块搜索"
                  onClick={closeAdd}
                >
                  <X size={13} />
                </button>
                <input
                  ref={addInputRef}
                  className={`add-input ${sectorSearchError ? 'invalid' : ''}`}
                  value={draft}
                  placeholder="银行 / BK1283"
                  aria-label="板块名称或代码"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setSectorSearchError(null)
                    setSectorSearchResults([])
                    setSectorSearchDone(false)
                  }}
                />
                <button type="submit" className="add-submit">
                  搜索
                </button>
              </form>
              <div className="sector-results" role="list" aria-label="板块搜索结果">
                {sectorSearching ? (
                  <div className="sector-hint">搜索中…</div>
                ) : sectorSearchError ? (
                  <div className="sector-hint error">{sectorSearchError}</div>
                ) : sectorSearchResults.length === 0 ? (
                  <div className="sector-hint">
                    {sectorSearchDone ? '未找到板块' : '输入名称或代码，例如 银行'}
                  </div>
                ) : (
                  sectorSearchResults.map((item) => {
                    const added = sectorWatchlist.includes(item.code)
                    return (
                      <div className="sector-result" role="listitem" key={item.code}>
                        <button
                          type="button"
                          className="manage-main"
                          aria-label={item.name}
                          disabled={added}
                          onClick={() => addSector(item.code)}
                        >
                          <span className="manage-name">{item.name}</span>
                          <span className="manage-code">{item.code}</span>
                        </button>
                        <button
                          type="button"
                          className={added ? 'manage-added' : 'manage-add'}
                          title={added ? '已在自选' : `加入自选 ${item.name}`}
                          aria-label={added ? `${item.name} 已在自选` : `添加 ${item.name}`}
                          disabled={added}
                          onClick={() => addSector(item.code)}
                        >
                          {added ? <Check size={12} /> : <Plus size={12} />}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : addOpen ? (
            <form className="add-row" onSubmit={submitSymbol}>
              <button
                type="button"
                className="icon-button add-cancel"
                title="取消"
                aria-label="取消添加"
                onClick={closeAdd}
              >
                <X size={13} />
              </button>
              <input
                ref={addInputRef}
                className={`add-input ${addError ? 'invalid' : ''}`}
                value={draft}
                placeholder="600519 / AAPL"
                aria-label="股票代码"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setAddError(null)
                }}
              />
              <button type="submit" className="add-submit">
                添加
              </button>
            </form>
          ) : activeQuote ? (
            <QuoteRow
              quote={activeQuote}
              intraday={activeIntraday}
              index={index}
              total={totalCount}
              onPrevious={() => rotate(-1)}
              onNext={() => rotate(1)}
            />
          ) : showSkeleton ? (
            <div className="quote-loading">
              <span className="skeleton skeleton-name" />
              <span className="skeleton skeleton-price" />
              <span className="skeleton skeleton-chart" />
            </div>
          ) : (
            <div className="empty-state">
              <span>无法获取行情</span>
              <button type="button" onClick={() => setRefreshToken((value) => value + 1)}>
                重试
              </button>
            </div>
          )}
        </main>
          </>
        )}
      </section>
    </div>
  )
}

export default App
