// A repeating event's rule, as Google keeps it on the series: RFC 5545
// lines such as "RRULE:FREQ=WEEKLY;BYDAY=SA". Said in words for the event's
// panel, and rewritten when a change or a delete is for "this and following
// events", which ends the series before that day and starts a new one there.
// Pure, and runs on both sides.
import { addDays } from './dates'
import type { LocalDate } from './dates'

const DAYS: Record<string, string> = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
}
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR']

function rule(recurrence: ReadonlyArray<string>): Map<string, string> | null {
  const line = recurrence.find((one) => one.startsWith('RRULE:'))
  if (!line) return null
  return new Map(
    line
      .slice('RRULE:'.length)
      .split(';')
      .map((part) => part.split('=') as [string, string]),
  )
}

function writeRule(
  recurrence: ReadonlyArray<string>,
  change: (parts: Map<string, string>) => void,
): Array<string> {
  return recurrence.map((line) => {
    if (!line.startsWith('RRULE:')) return line
    const parts = rule([line]) as Map<string, string>
    change(parts)
    return `RRULE:${[...parts].map(([key, value]) => `${key}=${value}`).join(';')}`
  })
}

/** "Monday", "Tuesday and Thursday", "Monday, Wednesday and Friday" */
function list(names: Array<string>): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * How often a series repeats, in words: "Every Saturday", "Every weekday",
 * "Every 2 weeks on Monday", "Every month". "Repeats" for a rule too
 * particular to say briefly, and null for no rule at all.
 */
export function describeRepeat(
  recurrence: ReadonlyArray<string> | undefined,
): string | null {
  const parts = recurrence ? rule(recurrence) : null
  if (!parts) return null
  const every = Number(parts.get('INTERVAL') ?? 1)
  const unit = (one: string) => (every === 1 ? one : `${every} ${one}s`)
  const plain = ['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'WKST']
  const byDay = parts.get('BYDAY')?.split(',') ?? []
  const extra = [...parts.keys()].filter(
    (key) =>
      !plain.includes(key) &&
      !(key === 'BYDAY' && parts.get('FREQ') === 'WEEKLY'),
  )
  if (extra.length > 0 || byDay.some((day) => !(day in DAYS))) {
    return 'Repeats'
  }
  switch (parts.get('FREQ')) {
    case 'DAILY':
      return `Every ${unit('day')}`
    case 'WEEKLY': {
      if (byDay.length === 0) return `Every ${unit('week')}`
      const sorted = Object.keys(DAYS).filter((day) => byDay.includes(day))
      if (
        every === 1 &&
        sorted.length === WEEKDAYS.length &&
        WEEKDAYS.every((day) => sorted.includes(day))
      ) {
        return 'Every weekday'
      }
      const names = list(sorted.map((day) => DAYS[day]))
      return every === 1 ? `Every ${names}` : `Every ${every} weeks on ${names}`
    }
    case 'MONTHLY':
      return `Every ${unit('month')}`
    case 'YEARLY':
      return `Every ${unit('year')}`
    default:
      return 'Repeats'
  }
}

/** An RFC 5545 UNTIL: a date for an all-day series, else a UTC instant. */
export type Until =
  | { date: LocalDate }
  | {
      /** A UTC instant, as `Date.toISOString` writes it. */
      instant: string
    }

function untilValue(until: Until): string {
  if ('date' in until) return until.date.replaceAll('-', '')
  return `${until.instant.slice(0, 19).replace(/[-:]/g, '')}Z`
}

/**
 * Where a series must stop so that it ends just before one of its days:
 * the day before for an all-day series, a second before for a timed one.
 * `originalStart` is that day's own start as Google first planned it.
 */
export function untilBefore(originalStart: {
  date?: LocalDate
  dateTime?: string
}): Until {
  if (originalStart.date) return { date: addDays(originalStart.date, -1) }
  const instant = new Date(
    new Date(originalStart.dateTime as string).getTime() - 1000,
  )
  return { instant: instant.toISOString() }
}

/** The series' rule ending at `until`, however it ended before. */
export function endSeries(
  recurrence: ReadonlyArray<string>,
  until: Until,
): Array<string> {
  return writeRule(recurrence, (parts) => {
    parts.delete('COUNT')
    parts.set('UNTIL', untilValue(until))
  })
}

/**
 * The rule for a series that carries on from one that ran `done` days: one
 * that ended after so many days has that many fewer left; otherwise it is
 * the same.
 */
export function continueSeries(
  recurrence: ReadonlyArray<string>,
  done: number,
): Array<string> {
  return writeRule(recurrence, (parts) => {
    const count = parts.get('COUNT')
    if (count) parts.set('COUNT', String(Math.max(1, Number(count) - done)))
  })
}

/** Whether the series ends after a number of days. */
export function countsDays(recurrence: ReadonlyArray<string>): boolean {
  return rule(recurrence)?.has('COUNT') ?? false
}

/**
 * The rule as a series that is now all day, or now timed, must write its
 * UNTIL: a date for the one, an instant for the other. The last day stays
 * the last day.
 */
export function restyleUntil(
  recurrence: ReadonlyArray<string>,
  allDay: boolean,
): Array<string> {
  return writeRule(recurrence, (parts) => {
    const until = parts.get('UNTIL')
    if (!until) return
    const day = until.slice(0, 8)
    parts.set('UNTIL', allDay ? day : `${day}T235959Z`)
  })
}
