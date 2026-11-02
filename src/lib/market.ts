export type Market = 'cn' | 'us'
export type MarketPhase = 'pre' | 'open' | 'break' | 'closed'

export interface MarketStatus {
  market: Market
  phase: MarketPhase
  label: string
  isLive: boolean
  isEarlyClose?: boolean
}

interface ZonedParts {
  year: number
  month: number
  day: number
  weekday: string
  hour: number
  minute: number
  second: number
}

const CHINA_TIME_ZONE = 'Asia/Shanghai'
const US_TIME_ZONE = 'America/New_York'
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string) {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values: Record<string, string> = {}
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = part.value
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function minutesOfDay(parts: ZonedParts) {
  return parts.hour * 60 + parts.minute
}

function isWeekend(parts: ZonedParts) {
  return parts.weekday === 'Sat' || parts.weekday === 'Sun'
}

interface LocalDate {
  year: number
  month: number
  day: number
}

interface UsMarketCalendar {
  holidays: Set<string>
  earlyCloses: Set<string>
}

const usCalendarCache = new Map<number, UsMarketCalendar>()

function localDate(year: number, month: number, day: number): LocalDate {
  return { year, month, day }
}

function dateKey(date: LocalDate) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return localDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

function weekdayOf(date: LocalDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

function observedHoliday(date: LocalDate): LocalDate {
  const weekday = weekdayOf(date)
  if (weekday === 6) return addDays(date, -1)
  if (weekday === 0) return addDays(date, 1)
  return date
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): LocalDate {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return localDate(year, month, 1 + offset + (occurrence - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): LocalDate {
  const last = new Date(Date.UTC(year, month, 0))
  const offset = (last.getUTCDay() - weekday + 7) % 7
  return localDate(year, month, last.getUTCDate() - offset)
}

function easterSunday(year: number): LocalDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return localDate(year, month, day)
}

function usCalendar(year: number): UsMarketCalendar {
  const cached = usCalendarCache.get(year)
  if (cached) return cached

  const holidays = new Set<string>()
  const earlyCloses = new Set<string>()
  const addHoliday = (date: LocalDate) => holidays.add(dateKey(date))
  const addEarlyClose = (date: LocalDate) => {
    const weekday = weekdayOf(date)
    if (weekday === 0 || weekday === 6) return
    if (holidays.has(dateKey(date))) return
    earlyCloses.add(dateKey(date))
  }

  addHoliday(observedHoliday(localDate(year, 1, 1)))
  addHoliday(nthWeekday(year, 1, 1, 3))
  addHoliday(nthWeekday(year, 2, 1, 3))
  addHoliday(addDays(easterSunday(year), -2))
  addHoliday(lastWeekday(year, 5, 1))
  if (year >= 2021) addHoliday(observedHoliday(localDate(year, 6, 19)))
  addHoliday(observedHoliday(localDate(year, 7, 4)))
  addHoliday(nthWeekday(year, 9, 1, 1))
  addHoliday(nthWeekday(year, 11, 4, 4))
  addHoliday(observedHoliday(localDate(year, 12, 25)))

  addEarlyClose(addDays(nthWeekday(year, 11, 4, 4), 1))
  addEarlyClose(localDate(year, 7, 3))
  addEarlyClose(localDate(year, 12, 24))

  const calendar = { holidays, earlyCloses }
  usCalendarCache.set(year, calendar)
  return calendar
}

function isUsHoliday(date: LocalDate) {
  return (
    usCalendar(date.year).holidays.has(dateKey(date)) ||
    usCalendar(date.year + 1).holidays.has(dateKey(date))
  )
}

function isUsEarlyClose(date: LocalDate) {
  return usCalendar(date.year).earlyCloses.has(dateKey(date))
}

export function chinaMarketStatus(now: Date): MarketStatus {
  const parts = zonedParts(now, CHINA_TIME_ZONE)
  if (isWeekend(parts)) {
    return { market: 'cn', phase: 'closed', label: '周末休市', isLive: false }
  }

  const minutes = minutesOfDay(parts)
  if (minutes >= 9 * 60 + 15 && minutes < 9 * 60 + 30) {
    return { market: 'cn', phase: 'pre', label: '集合竞价', isLive: true }
  }
  if (minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30) {
    return { market: 'cn', phase: 'open', label: '交易中', isLive: true }
  }
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) {
    return { market: 'cn', phase: 'break', label: '午间休市', isLive: false }
  }
  if (minutes >= 13 * 60 && minutes < 15 * 60) {
    return { market: 'cn', phase: 'open', label: '交易中', isLive: true }
  }

  return { market: 'cn', phase: 'closed', label: '已收盘', isLive: false }
}

export function usMarketStatus(now: Date): MarketStatus {
  const parts = zonedParts(now, US_TIME_ZONE)
  if (isWeekend(parts)) {
    return { market: 'us', phase: 'closed', label: '周末休市', isLive: false }
  }

  const date = localDate(parts.year, parts.month, parts.day)
  if (isUsHoliday(date)) {
    return { market: 'us', phase: 'closed', label: '节假日休市', isLive: false }
  }

  const earlyClose = isUsEarlyClose(date)
  const minutes = minutesOfDay(parts)
  const closeMinutes = earlyClose ? 13 * 60 : 16 * 60
  if (minutes >= 9 * 60 + 30 && minutes < closeMinutes) {
    return {
      market: 'us',
      phase: 'open',
      label: '交易中',
      isLive: true,
      isEarlyClose: earlyClose,
    }
  }
  if (earlyClose && minutes >= closeMinutes && minutes < 16 * 60) {
    return {
      market: 'us',
      phase: 'closed',
      label: '提前收盘',
      isLive: false,
      isEarlyClose: true,
    }
  }

  return {
    market: 'us',
    phase: 'closed',
    label: '已收盘',
    isLive: false,
    isEarlyClose: earlyClose,
  }
}

export function marketStatus(market: Market, now: Date) {
  return market === 'cn' ? chinaMarketStatus(now) : usMarketStatus(now)
}

export function autoMarket(now: Date): Market {
  const parts = zonedParts(now, CHINA_TIME_ZONE)
  const minutes = minutesOfDay(parts)
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 5 ? 'cn' : 'us'
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  const guessParts = zonedParts(new Date(utcGuess), timeZone)
  const zonedAsUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second,
  )
  return new Date(utcGuess - (zonedAsUtc - utcGuess))
}

export function nextMarketOpen(market: Market, now: Date): Date {
  const timeZone = market === 'cn' ? CHINA_TIME_ZONE : US_TIME_ZONE
  const openMinutes = market === 'cn' ? 9 * 60 + 15 : 9 * 60 + 30
  const today = zonedParts(now, timeZone)

  for (let dayOffset = 0; dayOffset < 20; dayOffset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset))
    const weekday = date.getUTCDay()
    if (weekday === 0 || weekday === 6) continue

    const local = localDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    )
    if (market === 'us' && isUsHoliday(local)) continue

    const candidate = zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      Math.floor(openMinutes / 60),
      openMinutes % 60,
      timeZone,
    )
    if (candidate.getTime() > now.getTime()) return candidate
  }

  throw new Error(`Unable to find the next ${market} market open`)
}

export function formatCountdown(target: Date, now: Date) {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}

export function formatBeijingTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: CHINA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
