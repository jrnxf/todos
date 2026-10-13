// How the screens slice the household list. Pure: given the items and
// today's date, every view derives from here.
import { addDays, diffDays, formatDay, formatTime, weekday } from './dates'
import type { Todo } from '@/db/schema'
import type { LocalDate } from './dates'

export const HEADS_UP_CHOICES = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
]

/** A deadline this many days out or fewer is drawn as close. */
const SOON_DAYS = 3
/** "This week" on Up next: the next seven days after today. */
const WEEK_DAYS = 7

export function isOpen(item: Todo): boolean {
  return !item.doneAt
}

/**
 * Soonest deadline first; within a day, all-day before timed; undated last;
 * ties in the order they were added.
 */
export function byDue(a: Todo, b: Todo): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  const at = a.dueTime ?? ''
  const bt = b.dueTime ?? ''
  return at === bt ? a.id - b.id : at.localeCompare(bt)
}

export interface UpNext {
  overdue: Array<Todo>
  today: Array<Todo>
  week: Array<Todo>
  later: Array<Todo>
  undated: Array<Todo>
}

export function upNext(items: Array<Todo>, today: LocalDate): UpNext {
  const groups: UpNext = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    undated: [],
  }
  for (const item of items.filter(isOpen).sort(byDue)) {
    if (!item.dueDate) groups.undated.push(item)
    else {
      const days = diffDays(item.dueDate, today)
      if (days < 0) groups.overdue.push(item)
      else if (days === 0) groups.today.push(item)
      else if (days <= WEEK_DAYS) groups.week.push(item)
      else groups.later.push(item)
    }
  }
  return groups
}

export type DueTone = 'late' | 'soon' | 'plain'

export interface DueLabel {
  text: string
  tone: DueTone
  /** True when the deadline has a clock time. */
  timed: boolean
}

/** "Fri, Oct 9 · 3 days late", "Today, 5:00 pm", "Thu, Oct 15 · in 3 days". */
export function dueLabel(item: Todo, today: LocalDate): DueLabel | null {
  if (!item.dueDate) return null
  const days = diffDays(item.dueDate, today)
  const timed = Boolean(item.dueTime)
  const time = item.dueTime ? `, ${formatTime(item.dueTime)}` : ''
  const day = formatDay(item.dueDate)

  if (days < 0) {
    const late = `${-days} day${days === -1 ? '' : 's'} late`
    return { text: `${day} · ${late}`, tone: 'late', timed }
  }
  if (days === 0) return { text: `Today${time}`, tone: 'plain', timed }
  if (days <= SOON_DAYS) {
    const until = days === 1 ? 'tomorrow' : `in ${days} days`
    return { text: `${day}${time} · ${until}`, tone: 'soon', timed }
  }
  return { text: `${day}${time}`, tone: 'plain', timed }
}

/** "3 days, 1 day before", or "None". */
export function headsUpSummary(days: Array<number>): string {
  if (days.length === 0) return 'None'
  const labels = [...days]
    .sort((a, b) => b - a)
    .map(
      (n) =>
        HEADS_UP_CHOICES.find((choice) => choice.days === n)?.label ??
        `${n} days`,
    )
  return `${labels.join(', ')} before`
}

/** The Sunday that starts the week holding `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekday(date))
}

/** The seven dates of the week holding `date`, Sunday first. */
export function weekDays(date: LocalDate): Array<LocalDate> {
  const start = weekStart(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** First day of the month `offset` months away from the one holding `date`. */
export function monthStart(date: LocalDate, offset = 0): LocalDate {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10)
}
