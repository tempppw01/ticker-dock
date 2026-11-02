import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WATCHLISTS,
  loadSectors,
  loadWatchlists,
  normalizeSymbolInput,
  saveWatchlists,
  WATCHLIST_STORAGE_KEY,
} from './quotes'

describe('normalizeSymbolInput', () => {
  it('accepts A-share and US stock codes', () => {
    expect(normalizeSymbolInput('600519')).toEqual({ symbol: 'sh600519', market: 'cn' })
    expect(normalizeSymbolInput('000001')).toEqual({ symbol: 'sz000001', market: 'cn' })
    expect(normalizeSymbolInput('300750')).toEqual({ symbol: 'sz300750', market: 'cn' })
    expect(normalizeSymbolInput('430047')).toEqual({ symbol: 'bj430047', market: 'cn' })
    expect(normalizeSymbolInput('AAPL')).toEqual({ symbol: 'usAAPL', market: 'us' })
    expect(normalizeSymbolInput('usIXIC')).toEqual({ symbol: 'usIXIC', market: 'us' })
  })

  it('rejects malformed codes', () => {
    expect(normalizeSymbolInput('')).toBeNull()
    expect(normalizeSymbolInput('123')).toBeNull()
    expect(normalizeSymbolInput('sh12345')).toBeNull()
    expect(normalizeSymbolInput('贵州茅台')).toBeNull()
  })
})

describe('watchlist persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('falls back to the default list when storage is empty', () => {
    expect(loadWatchlists()).toEqual(DEFAULT_WATCHLISTS)
  })

  it('sanitizes stored symbols and preserves custom lists', () => {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify({
        cn: ['600519', 'sz000001', 'usAAPL', 'bad'],
        us: ['AAPL', 'usAAPL', 'TSLA'],
      }),
    )

    expect(loadWatchlists()).toEqual({
      cn: ['sh600519', 'sz000001'],
      us: ['usAAPL', 'usTSLA'],
    })
  })

  it('writes custom lists back to local storage', () => {
    const watchlists = { cn: ['sh600519'], us: ['usAAPL', 'usTSLA'] }
    saveWatchlists(watchlists)

    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '')).toEqual(watchlists)
  })
})

describe('loadSectors', () => {
  it('returns demo sectors sorted by change percent', async () => {
    const sectors = await loadSectors()

    expect(sectors.length).toBeGreaterThan(0)
    expect(sectors[0].name).toBe('半导体')
    expect(sectors.every((quote) => quote.symbol.startsWith('bk'))).toBe(true)
    expect(sectors.every((quote) => quote.price > 0 && quote.name.length > 0)).toBe(true)
    expect(sectors[0].changePercent).toBeGreaterThanOrEqual(sectors[1].changePercent)
  })
})
