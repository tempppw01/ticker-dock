import { describe, expect, it } from 'vitest'
import {
  autoMarket,
  chinaMarketStatus,
  formatCountdown,
  nextMarketOpen,
  usMarketStatus,
} from './market'

describe('chinaMarketStatus', () => {
  it('reports the pre-open auction', () => {
    const status = chinaMarketStatus(new Date('2026-11-02T01:20:00Z'))
    expect(status.phase).toBe('pre')
    expect(status.isLive).toBe(true)
  })

  it('reports the morning and afternoon sessions', () => {
    expect(chinaMarketStatus(new Date('2026-11-02T02:30:00Z')).phase).toBe('open')
    expect(chinaMarketStatus(new Date('2026-11-02T05:30:00Z')).phase).toBe('open')
  })

  it('reports the lunch break and the close', () => {
    expect(chinaMarketStatus(new Date('2026-11-02T04:00:00Z')).phase).toBe('break')
    expect(chinaMarketStatus(new Date('2026-11-02T07:05:00Z')).phase).toBe('closed')
  })

  it('stays closed on weekends', () => {
    const status = chinaMarketStatus(new Date('2026-11-07T02:30:00Z'))
    expect(status.phase).toBe('closed')
    expect(status.isLive).toBe(false)
  })
})

describe('usMarketStatus', () => {
  it('handles eastern standard time', () => {
    expect(usMarketStatus(new Date('2026-11-02T14:29:00Z')).phase).toBe('closed')
    expect(usMarketStatus(new Date('2026-11-02T14:30:00Z')).phase).toBe('open')
    expect(usMarketStatus(new Date('2026-11-02T21:00:00Z')).phase).toBe('closed')
  })

  it('handles eastern daylight time', () => {
    expect(usMarketStatus(new Date('2026-07-01T13:30:00Z')).phase).toBe('open')
    expect(usMarketStatus(new Date('2026-07-01T13:29:00Z')).phase).toBe('closed')
  })

  it('closes on US federal market holidays', () => {
    const holidays = [
      '2026-01-19T15:00:00Z',
      '2026-02-16T15:00:00Z',
      '2026-04-03T14:00:00Z',
      '2026-05-25T14:00:00Z',
      '2026-06-19T14:00:00Z',
      '2026-07-03T15:00:00Z',
      '2026-09-07T14:00:00Z',
      '2026-11-26T15:00:00Z',
      '2026-12-25T15:00:00Z',
    ]

    for (const holiday of holidays) {
      const status = usMarketStatus(new Date(holiday))
      expect(status.phase, holiday).toBe('closed')
      expect(status.label, holiday).toBe('节假日休市')
      expect(status.isLive, holiday).toBe(false)
    }
  })

  it('handles early closes on the day after Thanksgiving', () => {
    const beforeClose = usMarketStatus(new Date('2026-11-27T17:00:00Z'))
    expect(beforeClose.phase).toBe('open')
    expect(beforeClose.isLive).toBe(true)
    expect(beforeClose.isEarlyClose).toBe(true)

    const afterClose = usMarketStatus(new Date('2026-11-27T18:00:00Z'))
    expect(afterClose.phase).toBe('closed')
    expect(afterClose.label).toBe('提前收盘')
    expect(afterClose.isLive).toBe(false)
  })

  it('handles early closes on Christmas Eve', () => {
    expect(usMarketStatus(new Date('2026-12-24T17:00:00Z')).phase).toBe('open')
    expect(usMarketStatus(new Date('2026-12-24T18:00:00Z')).label).toBe('提前收盘')
  })

  it('keeps a normal session open after 13:00 eastern time', () => {
    const status = usMarketStatus(new Date('2026-11-02T18:05:00Z'))
    expect(status.phase).toBe('open')
    expect(status.isEarlyClose).toBe(false)
  })
})

describe('autoMarket', () => {
  it('follows the Beijing A-share window', () => {
    expect(autoMarket(new Date('2026-11-02T01:20:00Z'))).toBe('cn')
    expect(autoMarket(new Date('2026-11-02T07:04:00Z'))).toBe('cn')
    expect(autoMarket(new Date('2026-11-02T07:05:00Z'))).toBe('us')
    expect(autoMarket(new Date('2026-11-02T08:00:00Z'))).toBe('us')
  })
})

describe('nextMarketOpen', () => {
  it('skips the weekend for A shares', () => {
    const open = nextMarketOpen('cn', new Date('2026-11-06T08:00:00Z'))
    expect(open.toISOString()).toBe('2026-11-09T01:15:00.000Z')
  })

  it('finds the same-day US open before the bell', () => {
    const open = nextMarketOpen('us', new Date('2026-11-02T12:00:00Z'))
    expect(open.toISOString()).toBe('2026-11-02T14:30:00.000Z')
  })

  it('moves to the next weekday after the US close', () => {
    const open = nextMarketOpen('us', new Date('2026-11-02T22:00:00Z'))
    expect(open.toISOString()).toBe('2026-11-03T14:30:00.000Z')
  })

  it('uses standard time after the fall DST transition', () => {
    const open = nextMarketOpen('us', new Date('2026-10-30T21:00:00Z'))
    expect(open.toISOString()).toBe('2026-11-02T14:30:00.000Z')
  })

  it('uses daylight time after the spring DST transition', () => {
    const open = nextMarketOpen('us', new Date('2026-03-07T00:00:00Z'))
    expect(open.toISOString()).toBe('2026-03-09T13:30:00.000Z')
  })

  it('skips Thanksgiving for US stocks', () => {
    const open = nextMarketOpen('us', new Date('2026-11-26T15:00:00Z'))
    expect(open.toISOString()).toBe('2026-11-27T14:30:00.000Z')
  })

  it('skips the observed Independence Day holiday', () => {
    const open = nextMarketOpen('us', new Date('2026-07-02T21:00:00Z'))
    expect(open.toISOString()).toBe('2026-07-06T13:30:00.000Z')
  })

  it('skips Good Friday', () => {
    const open = nextMarketOpen('us', new Date('2026-04-02T21:00:00Z'))
    expect(open.toISOString()).toBe('2026-04-06T13:30:00.000Z')
  })

  it('skips the Christmas holiday and weekend after an early close', () => {
    const open = nextMarketOpen('us', new Date('2026-12-24T18:30:00Z'))
    expect(open.toISOString()).toBe('2026-12-28T14:30:00.000Z')
  })

  it('observes New Year when January 1 falls on a Saturday', () => {
    const open = nextMarketOpen('us', new Date('2027-12-31T15:00:00Z'))
    expect(open.toISOString()).toBe('2028-01-03T14:30:00.000Z')
  })
})

describe('formatCountdown', () => {
  it('formats long and short spans', () => {
    expect(
      formatCountdown(new Date('2026-11-09T01:15:00Z'), new Date('2026-11-06T08:00:00Z')),
    ).toBe('2天17小时')
    expect(
      formatCountdown(new Date('2026-11-02T14:30:00Z'), new Date('2026-11-02T14:29:45Z')),
    ).toBe('15秒')
  })
})
