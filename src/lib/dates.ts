// Calendar dates and wall-clock stamps as plain strings.
//
// A deadline is a household-local calendar date ('2026-10-12'), never a UTC
// instant, so it cannot move when the clocks change. A stamp
// ('2026-10-12T19:00') is household wall-clock time; two stamps compare
// correctly as strings. Everything here is pure and runs on both sides.

export type LocalDate = string
export type LocalTime = string
export type Stamp = string

const DAY_MS = 86_400_000

function toUtc(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

/** Whole days from `b` to `a`: positive when `a` is later. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS)
}

/** 0 is Sunday. */
export function weekday(date: LocalDate): number {
  return new Date(toUtc(date)).getUTCDay()
}

export function toStamp(date: LocalDate, time: LocalTime): Stamp {
  return `${date}T${time}`
}

export function addMinutes(stamp: Stamp, minutes: number): Stamp {
  const [date, time] = stamp.split('T')
  const [h, m] = time.split(':').map(Number)
  const ms = toUtc(date) + (h * 60 + m + minutes) * 60_000
  return new Date(ms).toISOString().slice(0, 16)
}

/** The wall clock in `timeZone` at `instant`. */
export function localNow(
  timeZone: string,
  instant: Date = new Date(),
): { date: LocalDate; time: LocalTime; stamp: Stamp } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}`
  return { date, time, stamp: toStamp(date, time) }
}

/** A Date at local midnight for a calendar date, for date pickers. */
export function toPickerDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fromPickerDate(date: Date): LocalDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function format(date: LocalDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(toUtc(date)))
}

/** "Fri, Oct 9" */
export function formatDay(date: LocalDate): string {
  return format(date, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Monday, October 12" */
export function formatLongDay(date: LocalDate): string {
  return format(date, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "Thu" */
export function formatWeekday(date: LocalDate): string {
  return format(date, { weekday: 'short' })
}

/** "Oct 30" */
export function formatMonthDay(date: LocalDate): string {
  return format(date, { month: 'short', day: 'numeric' })
}

/** "5:00 pm" */
export function formatTime(time: LocalTime): string {
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** "Sep 28" from a stored UTC instant, in the viewer's own zone. */
export function formatInstantDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}
