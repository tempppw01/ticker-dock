import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  DEFAULT_WATCHLISTS,
  SECTOR_STORAGE_KEY,
  WATCHLIST_STORAGE_KEY,
} from './lib/quotes'
import { VIEW_STORAGE_KEY } from './lib/view'

const windowMock = vi.hoisted(() => ({
  setSize: vi.fn(async (_size: { width: number; height: number }) => undefined),
  setAlwaysOnTop: vi.fn(async () => undefined),
  minimize: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
}))

const marketQuotes = vi.hoisted(() => ({
  cn: [
    {
      symbol: 'sh000001',
      name: '上证指数',
      code: '000001',
      market: 'cn',
      price: 3614.17,
      previousClose: 3599.02,
      open: 3614.31,
      high: 3625.14,
      low: 3594.77,
      change: 15.15,
      changePercent: 0.42,
      quoteTime: '2026-11-02 11:04:00',
    },
  ],
  us: [
    {
      symbol: 'usIXIC',
      name: '纳斯达克',
      code: 'IXIC',
      market: 'us',
      price: 25437,
      previousClose: 26184.72,
      open: 25592.49,
      high: 25673,
      low: 25177.33,
      change: -747.72,
      changePercent: -2.86,
      quoteTime: '2026-10-30 17:15:59',
    },
  ],
}))

vi.mock('./lib/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/quotes')>()
  return {
    ...actual,
    loadQuotes: vi.fn(async (symbols: string[]) =>
      symbols.some((symbol) => symbol.startsWith('us')) ? marketQuotes.us : marketQuotes.cn,
    ),
  }
})

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowMock,
}))

describe('App', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T02:30:00Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('collapses to a compact pill that keeps the name, trend and change', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收起为小胶囊' }))

    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe('compact')
    expect(screen.getByRole('button', { name: '展开完整视图' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '自动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    expect(screen.getByText('+0.42%')).toBeInTheDocument()

    const size = windowMock.setSize.mock.calls.at(-1)?.[0]
    expect(size).toMatchObject({ width: 244, height: 52 })
  })

  it('restores the compact pill and expands back to the full view', async () => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, 'compact')
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开完整视图' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开完整视图' }))

    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe('full')
    expect(screen.getByRole('tab', { name: '自动' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开完整视图' })).not.toBeInTheDocument()
  })

  it('starts with A shares during the A-share session and can switch to US stocks', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '自动' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('A股 交易中 · 5秒刷新')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '美股' }))

    expect(await screen.findByText('纳斯达克')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '美股' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/-2\.86%/)).toBeInTheDocument()
  })

  it('adds and removes a watchlist symbol and persists the change', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加自选' }))
    fireEvent.change(screen.getByRole('textbox', { name: '股票代码' }), {
      target: { value: '600519' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '')).toEqual({
      cn: [...DEFAULT_WATCHLISTS.cn, 'sh600519'],
      us: DEFAULT_WATCHLISTS.us,
    })

    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 600519' }))

    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '')).toEqual({
      cn: [...DEFAULT_WATCHLISTS.cn, 'sh600519'],
      us: DEFAULT_WATCHLISTS.us,
    })

    fireEvent.click(screen.getByRole('button', { name: '确认移除 600519' }))

    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '')).toEqual({
      cn: DEFAULT_WATCHLISTS.cn,
      us: DEFAULT_WATCHLISTS.us,
    })
  })

  it('keeps a stock when removal is cancelled', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 上证指数' }))
    fireEvent.click(screen.getByRole('button', { name: '取消移除 上证指数' }))

    expect(screen.getByRole('button', { name: '移除 上证指数' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认移除 上证指数' })).not.toBeInTheDocument()
  })

  it('lists every sector and switches to the selected one', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '板块' }))

    expect(await screen.findByText('半导体')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '列表' }))

    expect(screen.getByRole('list', { name: '板块列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看 白酒' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看 白酒' }))

    expect(screen.queryByRole('list', { name: '板块列表' })).not.toBeInTheDocument()
    expect(screen.getByText('白酒')).toBeInTheDocument()
  })

  it('shows A-share sectors in the sector tab', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '板块' }))

    expect(await screen.findByText('半导体')).toBeInTheDocument()
    expect(screen.getByText('板块 交易中 · 5秒刷新')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '板块' })).toHaveAttribute('aria-selected', 'true')
  })

  it('searches and adds a bank sector to the watchlist', async () => {
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '板块' }))
    expect(await screen.findByText('半导体')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加板块' }))
    fireEvent.change(screen.getByRole('textbox', { name: '板块名称或代码' }), {
      target: { value: '银行' },
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: '添加 银行' }))

    expect(JSON.parse(window.localStorage.getItem(SECTOR_STORAGE_KEY) ?? '')).toEqual([
      'BK1283',
    ])
    expect(await screen.findByText('银行')).toBeInTheDocument()
  })

  it('removes a watched sector only after confirmation', async () => {
    window.localStorage.setItem(SECTOR_STORAGE_KEY, JSON.stringify(['BK1283']))
    render(<App />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '板块' }))
    expect(await screen.findByText('银行')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 银行' }))

    expect(JSON.parse(window.localStorage.getItem(SECTOR_STORAGE_KEY) ?? '')).toEqual([
      'BK1283',
    ])

    fireEvent.click(screen.getByRole('button', { name: '确认移除 银行' }))

    expect(JSON.parse(window.localStorage.getItem(SECTOR_STORAGE_KEY) ?? '')).toEqual([])
  })
})
