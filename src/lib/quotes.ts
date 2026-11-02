import { invoke } from '@tauri-apps/api/core'
import type { Market } from './market'

export interface Quote {
  symbol: string
  name: string
  code: string
  market: Market
  price: number
  previousClose: number
  open: number
  high: number
  low: number
  change: number
  changePercent: number
  quoteTime: string
}

export interface IntradayPoint {
  time: string
  price: number
}

export interface Intraday {
  symbol: string
  previousClose: number
  points: IntradayPoint[]
}

export interface SectorInfo {
  code: string
  name: string
}

export type Watchlists = Record<Market, string[]>

export interface NormalizedSymbol {
  symbol: string
  market: Market
}

export const DEFAULT_WATCHLISTS: Watchlists = {
  cn: ['sh000001', 'sz399001', 'sh000300', 'sz399006'],
  us: ['usIXIC', 'usINX', 'usDJI', 'usAAPL'],
}

export const MAX_WATCHLIST = 20
export const WATCHLIST_STORAGE_KEY = 'stock-widget.watchlists.v1'
export const MAX_SECTOR_WATCHLIST = 12
export const SECTOR_STORAGE_KEY = 'stock-widget.sectors.v1'

const DEMO_SECTORS: Array<{ symbol: string; name: string; code: string; percent: number }> = [
  { symbol: 'bkBK1036', name: '半导体', code: 'BK1036', percent: 3.12 },
  { symbol: 'bkBK0896', name: '白酒', code: 'BK0896', percent: 2.87 },
  { symbol: 'bkBK0493', name: '新能源', code: 'BK0493', percent: 2.61 },
  { symbol: 'bkBK0882', name: '猪肉概念', code: 'BK0882', percent: 2.24 },
  { symbol: 'bkBK0475', name: '银行Ⅱ', code: 'BK0475', percent: 1.96 },
  { symbol: 'bkBK1283', name: '银行', code: 'BK1283', percent: 1.42 },
  { symbol: 'bkBK0478', name: '有色金属', code: 'BK0478', percent: 1.73 },
  { symbol: 'bkBK0428', name: '电力', code: 'BK0428', percent: 1.48 },
  { symbol: 'bkBK0459', name: '元件', code: 'BK0459', percent: 1.21 },
]

const demoQuotes: Record<string, Omit<Quote, 'symbol' | 'market'>> = {
  sh000001: {
    name: '上证指数',
    code: '000001',
    price: 3611.1,
    previousClose: 3599.02,
    open: 3614.31,
    high: 3625.14,
    low: 3594.77,
    change: 12.08,
    changePercent: 0.34,
    quoteTime: '2026-11-02 10:46:09',
  },
  sz399001: {
    name: '深证成指',
    code: '399001',
    price: 10914,
    previousClose: 10833.78,
    open: 10897.5,
    high: 10993.84,
    low: 10813.16,
    change: 80.22,
    changePercent: 0.74,
    quoteTime: '2026-11-02 10:46:06',
  },
  sh000300: {
    name: '沪深300',
    code: '000300',
    price: 4532.18,
    previousClose: 4516.42,
    open: 4521.2,
    high: 4544.86,
    low: 4509.35,
    change: 15.76,
    changePercent: 0.35,
    quoteTime: '2026-11-02 10:46:09',
  },
  sz399006: {
    name: '创业板指',
    code: '399006',
    price: 2418.72,
    previousClose: 2432.51,
    open: 2436.08,
    high: 2441.12,
    low: 2402.44,
    change: -13.79,
    changePercent: -0.57,
    quoteTime: '2026-11-02 10:46:06',
  },
  usIXIC: {
    name: '纳斯达克',
    code: 'IXIC',
    price: 25437,
    previousClose: 26184.72,
    open: 25592.49,
    high: 25673,
    low: 25177.33,
    change: -747.72,
    changePercent: -2.86,
    quoteTime: '2026-10-30 17:15:59',
  },
  usINX: {
    name: '标普500',
    code: 'INX',
    price: 7580.07,
    previousClose: 7720.39,
    open: 7631.07,
    high: 7637.48,
    low: 7527.56,
    change: -140.32,
    changePercent: -1.82,
    quoteTime: '2026-10-30 16:47:43',
  },
  usDJI: {
    name: '道琼斯',
    code: 'DJI',
    price: 51770.31,
    previousClose: 52342.56,
    open: 52383.9,
    high: 52383.9,
    low: 51563.76,
    change: -572.25,
    changePercent: -1.09,
    quoteTime: '2026-10-30 16:47:53',
  },
  usAAPL: {
    name: '苹果',
    code: 'AAPL',
    price: 344.63,
    previousClose: 348.91,
    open: 346.72,
    high: 349.19,
    low: 334.35,
    change: -4.28,
    changePercent: -1.23,
    quoteTime: '2026-10-30 16:00:02',
  },
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function cloneDefaults(): Watchlists {
  return {
    cn: [...DEFAULT_WATCHLISTS.cn],
    us: [...DEFAULT_WATCHLISTS.us],
  }
}

function symbolSeed(symbol: string) {
  let hash = 0
  for (const character of symbol) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

function demoQuote(symbol: string): Quote {
  const market: Market = symbol.toLowerCase().startsWith('us') ? 'us' : 'cn'
  const known = demoQuotes[symbol]
  if (known) return { ...known, symbol, market }

  const seed = symbolSeed(symbol)
  const base = market === 'cn' ? 8 + (seed % 9000) / 100 : 20 + (seed % 30000) / 100
  const percent = ((seed % 501) - 250) / 100
  const previousClose = Number(base.toFixed(2))
  const price = Number((previousClose * (1 + percent / 100)).toFixed(2))
  const open = Number((previousClose * (1 + (((seed >> 4) % 101) - 50) / 5000)).toFixed(2))
  const high = Number((Math.max(price, open) * 1.008).toFixed(2))
  const low = Number((Math.min(price, open) * 0.992).toFixed(2))

  return {
    symbol,
    name: quoteCode(symbol),
    code: quoteCode(symbol),
    market,
    price,
    previousClose,
    open,
    high,
    low,
    change: Number((price - previousClose).toFixed(2)),
    changePercent: Number(percent.toFixed(2)),
    quoteTime: '2026-11-02 10:46:09',
  }
}

function demoSectorQuote(symbol: string): Quote | null {
  const sector = DEMO_SECTORS.find((item) => item.symbol === symbol)
  if (!sector) return null

  const base = demoQuote(symbol)
  const previousClose = base.previousClose
  const price = Number((previousClose * (1 + sector.percent / 100)).toFixed(2))
  const open = Number((previousClose * 1.003).toFixed(2))
  const high = Number((Math.max(price, open) * 1.006).toFixed(2))
  const low = Number((Math.min(price, open) * 0.994).toFixed(2))

  return {
    symbol,
    name: sector.name,
    code: sector.code,
    market: 'cn',
    price,
    previousClose,
    open,
    high,
    low,
    change: Number((price - previousClose).toFixed(2)),
    changePercent: sector.percent,
    quoteTime: '--',
  }
}

function demoSectorQuoteByCode(code: string): Quote {
  const sector = DEMO_SECTORS.find((item) => item.code === code)
  if (sector) {
    return demoSectorQuote(sector.symbol) as Quote
  }

  const symbol = `bk${code}`
  return {
    ...demoQuote(symbol),
    name: code,
    code,
  }
}

function demoIntraday(symbol: string): Intraday {
  const quote = demoSectorQuote(symbol) ?? demoQuote(symbol)
  const seed = symbolSeed(symbol)
  const count = 92
  const drift = quote.price - quote.previousClose
  const amplitude = Math.max((quote.high - quote.low) * 0.14, quote.previousClose * 0.0012)
  const points = Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1)
    const wave =
      Math.sin(progress * Math.PI * 4 + (seed % 17) / 4) * amplitude * (1 - progress * 0.35) +
      Math.sin(progress * Math.PI * 11 + (seed % 7)) * amplitude * 0.22 * (1 - progress)
    const price =
      index === count - 1
        ? quote.price
        : quote.previousClose + drift * progress + wave
    return {
      time: `${9 + Math.floor((30 + Math.floor(progress * 390)) / 60)}:${String(
        (30 + Math.floor(progress * 390)) % 60,
      ).padStart(2, '0')}`,
      price: Number(price.toFixed(2)),
    }
  })

  return {
    symbol,
    previousClose: quote.previousClose,
    points,
  }
}

export function normalizeSymbolInput(raw: string): NormalizedSymbol | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null

  const prefixed = /^(sh|sz|bj)(\d{6})$/.exec(value)
  if (prefixed) {
    return {
      symbol: `${prefixed[1]}${prefixed[2]}`,
      market: 'cn',
    }
  }

  if (/^\d{6}$/.test(value)) {
    const first = value[0]
    if (first === '6' || first === '5' || first === '9') {
      return { symbol: `sh${value}`, market: 'cn' }
    }
    if (first === '0' || first === '1' || first === '2' || first === '3') {
      return { symbol: `sz${value}`, market: 'cn' }
    }
    if (first === '4' || first === '8') {
      return { symbol: `bj${value}`, market: 'cn' }
    }
    return null
  }

  if (/^(sh|sz|bj)\d/.test(value)) return null

  if (/^us[a-z0-9.-]{1,12}$/.test(value)) {
    return {
      symbol: `us${value.slice(2).toUpperCase()}`,
      market: 'us',
    }
  }

  if (/^[a-z][a-z0-9.-]{0,11}$/.test(value)) {
    return {
      symbol: `us${value.toUpperCase()}`,
      market: 'us',
    }
  }

  return null
}

function sanitizeWatchlist(value: unknown, market: Market): string[] {
  if (!Array.isArray(value)) return []

  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = normalizeSymbolInput(item)
    if (!normalized || normalized.market !== market) continue
    if (!result.includes(normalized.symbol)) result.push(normalized.symbol)
    if (result.length >= MAX_WATCHLIST) break
  }
  return result
}

export function loadWatchlists(): Watchlists {
  const fallback = cloneDefaults()
  if (typeof window === 'undefined') return fallback

  try {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY)
    if (!stored) return fallback

    const parsed = JSON.parse(stored) as Partial<Record<Market, unknown>>
    const cn = sanitizeWatchlist(parsed.cn, 'cn')
    const us = sanitizeWatchlist(parsed.us, 'us')
    return {
      cn: cn.length > 0 ? cn : fallback.cn,
      us: us.length > 0 ? us : fallback.us,
    }
  } catch {
    return fallback
  }
}

export function saveWatchlists(watchlists: Watchlists) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlists))
  } catch {
    // A failed write should not block the widget from updating its in-memory list.
  }
}

export function normalizeSectorCode(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  if (!value) return null

  const body = value.startsWith('BK') ? value.slice(2) : value
  if (!/^[A-Z0-9]{3,8}$/.test(body)) return null
  return `BK${body}`
}

export function loadSectorWatchlist(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(SECTOR_STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored) as unknown
    if (!Array.isArray(parsed)) return []

    const result: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const code = normalizeSectorCode(item)
      if (!code || result.includes(code)) continue
      result.push(code)
      if (result.length >= MAX_SECTOR_WATCHLIST) break
    }
    return result
  } catch {
    return []
  }
}

export function saveSectorWatchlist(codes: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SECTOR_STORAGE_KEY, JSON.stringify(codes))
  } catch {
    // A failed write should not block the widget from updating its in-memory list.
  }
}

export async function loadQuotes(symbols: string[]): Promise<Quote[]> {
  if (isTauriRuntime()) {
    return invoke<Quote[]>('get_quotes', { symbols })
  }
  return symbols.map(demoQuote)
}

export async function loadIntraday(symbol: string): Promise<Intraday> {
  if (isTauriRuntime()) {
    return invoke<Intraday>('get_intraday', { symbol })
  }
  return demoIntraday(symbol)
}

export async function loadSectors(custom: string[] = []): Promise<Quote[]> {
  if (isTauriRuntime()) {
    return invoke<Quote[]>('get_sectors', { custom })
  }

  const customCodes = custom
    .map(normalizeSectorCode)
    .filter((code): code is string => code !== null)
  const customQuotes = customCodes.map(demoSectorQuoteByCode)
  const leaderboard = DEMO_SECTORS.filter((item) => !customCodes.includes(item.code))
    .map((item) => demoSectorQuote(item.symbol))
    .filter((quote): quote is Quote => quote !== null)
    .sort((left, right) => right.changePercent - left.changePercent)

  return [...customQuotes, ...leaderboard]
}

export async function searchSectors(query: string): Promise<SectorInfo[]> {
  if (isTauriRuntime()) {
    return invoke<SectorInfo[]>('search_sectors', { query })
  }

  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches = DEMO_SECTORS.map(({ code, name }) => ({ code, name })).filter((item) => {
    const name = item.name.toLowerCase()
    const code = item.code.toLowerCase()
    return name.includes(needle) || code.includes(needle)
  })

  return matches
    .sort((left, right) => {
      const rank = (item: SectorInfo) => {
        const name = item.name.toLowerCase()
        const code = item.code.toLowerCase()
        if (name === needle || code === needle) return 0
        if (name.startsWith(needle) || code.startsWith(needle)) return 1
        return 2
      }
      return rank(left) - rank(right) || left.name.length - right.name.length
    })
    .slice(0, 8)
}

export function quoteCode(symbol: string) {
  return symbol.replace(/^(sh|sz|bj|us|bk)/i, '').toUpperCase()
}
