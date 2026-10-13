// "When" as the screens speak it: the shortcuts in the picker, the label on
// a pill, and reading a date out of a typed title.
import {
  addDays,
  formatDay,
  formatMonthDay,
  formatTime,
  formatWeekday,
  fromPickerDate,
  toPickerDate,
  weekday,
} from './dates'
import type { LocalDate, LocalTime } from './dates'

export interface When {
  dueDate: LocalDate | null
  dueTime: LocalTime | null
}

export interface DatePreset {
  date: LocalDate
  label: string
  /** The day it lands on, for the wide layout: "Mon", "Oct 19". */
  hint: string
}

/** The one-tap dates, soonest first, without two that mean the same day. */
export function datePresets(today: LocalDate): Array<DatePreset> {
  // The coming Saturday; from a Saturday, the one after.
  const saturday = addDays(today, ((6 - weekday(today) + 6) % 7) + 1)
  return [
    { date: today, label: 'Today' },
    { date: addDays(today, 1), label: 'Tomorrow' },
    { date: saturday, label: formatWeekday(saturday) },
    { date: addDays(today, 7), label: 'Next week' },
    { date: addDays(today, 14), label: 'In 2 weeks' },
  ]
    .filter(
      (preset, index, all) =>
        all.findIndex((other) => other.date === preset.date) === index,
    )
    .map((preset) => ({
      ...preset,
      // The day it means: a weekday for the near ones, a date for the rest,
      // and never the label over again.
      hint:
        addDays(today, 6) >= preset.date &&
        preset.label !== formatWeekday(preset.date)
          ? formatWeekday(preset.date)
          : formatMonthDay(preset.date),
    }))
}

export const QUICK_TIMES: Array<{ time: LocalTime; label: string }> = [
  { time: '09:00', label: 'Morning' },
  { time: '12:00', label: 'Noon' },
  { time: '17:00', label: '5 pm' },
  { time: '19:00', label: 'Evening' },
]

function dayWord(date: LocalDate, today: LocalDate): string | null {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return null
}

/** "Fri, Oct 16, 5:00 pm", "Today", "No date". */
export function whenLabel(when: When, today: LocalDate): string {
  if (!when.dueDate) return 'No date'
  const day = dayWord(when.dueDate, today) ?? formatDay(when.dueDate)
  return when.dueTime ? `${day}, ${formatTime(when.dueTime)}` : day
}

/** The same, short enough for a pill: "Oct 30", "Tomorrow, 5:00 pm". */
export function shortWhenLabel(when: When, today: LocalDate): string {
  if (!when.dueDate) return ''
  const day = dayWord(when.dueDate, today) ?? formatMonthDay(when.dueDate)
  return when.dueTime ? `${day}, ${formatTime(when.dueTime)}` : day
}

// ── Reading a date out of a title ───────────────────────────────────────────

/** The part of chrono-node this file uses, so the parser can be loaded lazily. */
export interface DateParser {
  parse: (
    text: string,
    reference: Date,
    options: { forwardDate: boolean },
  ) => Array<{
    index: number
    text: string
    start: {
      date: () => Date
      isCertain: (part: 'hour') => boolean
    }
  }>
}

export interface ParsedWhen extends When {
  dueDate: LocalDate
  /** The words that were read as the date, as typed. */
  phrase: string
  /** The title with those words taken out. */
  title: string
}

/**
 * "Dentist fri 5pm" becomes the title "Dentist", due Friday at 17:00. Only
 * the last date-like phrase counts, and never one that is the whole title:
 * a to-do called "Tomorrow" stays a to-do called "Tomorrow".
 */
export function parseWhen(
  parser: DateParser,
  text: string,
  today: LocalDate,
): ParsedWhen | null {
  // Noon, so "today" is the same calendar day in whatever zone this runs in.
  const reference = toPickerDate(today)
  reference.setHours(12)
  const found = parser.parse(text, reference, { forwardDate: true }).at(-1)
  if (!found) return null

  const before = text
    .slice(0, found.index)
    // "by fri", "due on fri": the linking word goes with the date.
    .replace(/\b(due|by|on|at|before|until)\s*$/i, '')
  const after = text.slice(found.index + found.text.length)
  const title = `${before} ${after}`
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:-]+$/, '')
    .trim()
  if (!title) return null

  const at = found.start.date()
  const hasTime = found.start.isCertain('hour')
  return {
    phrase: found.text,
    title,
    dueDate: fromPickerDate(at),
    dueTime: hasTime
      ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
      : null,
  }
}
