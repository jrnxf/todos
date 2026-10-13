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
      isCertain: (part: 'hour' | 'day' | 'weekday' | 'month') => boolean
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

// "by fri", "due on fri": the linking word goes with the date.
const LINK = /\b(due|by|on|at|in|before|until)\s*$/i
// A month and nothing else. It is as often a name ("March of the Penguins",
// "the August statement") as a deadline, so it needs a linking word.
const MONTH_ALONE =
  /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?(\s+of)?$/i
// A length of time and nothing else is an amount ("2 weeks of recycling"),
// not a deadline. "in 2 weeks" and "2 weeks from now" are not matched.
const SPAN_ALONE =
  /^(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|few|couple(\s+of)?)\s+(days?|weeks?|months?|years?)$/i
// "on the 1st", "by the 15th": a day of the month, which the parser does not
// read. Only after a linking word and at the end of a phrase, so "on the 2nd
// floor" is left alone.
const DAY_OF_MONTH =
  /\b(?:due|by|on|before|until)\s+the\s+(\d{1,2})(?:st|nd|rd|th)(?=\s*$|\s*[,;.!]|\s+at\b|\s+\d)/i

/** The next date, today included, that is day `day` of its month. */
function nextDayOfMonth(today: LocalDate, day: number): LocalDate | null {
  if (day < 1 || day > 31) return null
  let [year, month] = today.split('-').map(Number)
  for (let tries = 0; tries < 12; tries++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // A day the month does not have rolls over and no longer matches.
    const real = fromPickerDate(toPickerDate(date)) === date
    if (real && date >= today) return date
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return null
}

/** `text` without the given stretches, tidied into a title. */
function without(text: string, cuts: Array<[number, number]>): string {
  let title = ''
  let from = 0
  for (const [start, end] of [...cuts].sort((a, b) => a[0] - b[0])) {
    title += `${text.slice(from, start).replace(LINK, '')} `
    from = Math.max(from, end)
  }
  return (title + text.slice(from))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:.!])/g, '$1')
    .replace(/[\s,;:-]+$/, '')
    .trim()
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
  const found = parser
    .parse(text, reference, { forwardDate: true })
    .filter((one) => {
      if (SPAN_ALONE.test(one.text)) return false
      if (!MONTH_ALONE.test(one.text)) return true
      return LINK.test(text.slice(0, one.index))
    })
    .at(-1)

  const at = found?.start.date()
  const hasTime = found?.start.isCertain('hour') ?? false
  const timeOnly =
    hasTime &&
    !found?.start.isCertain('day') &&
    !found?.start.isCertain('weekday') &&
    !found?.start.isCertain('month')
  const dueTime =
    at && hasTime
      ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
      : null

  // "on the 1st at 9am": the day of the month, with the parser's time if
  // that is all the parser found.
  const dayOfMonth = !found || timeOnly ? DAY_OF_MONTH.exec(text) : null
  const onDay = dayOfMonth && nextDayOfMonth(today, Number(dayOfMonth[1]))
  if (dayOfMonth && onDay) {
    const cuts: Array<[number, number]> = [
      [dayOfMonth.index, dayOfMonth.index + dayOfMonth[0].length],
    ]
    if (found) cuts.push([found.index, found.index + found.text.length])
    const title = without(text, cuts)
    if (!title) return null
    const end = Math.max(...cuts.map((cut) => cut[1]))
    return {
      phrase: text.slice(dayOfMonth.index, end).trim(),
      title,
      dueDate: onDay,
      dueTime,
    }
  }

  if (!found || !at) return null
  const title = without(text, [[found.index, found.index + found.text.length]])
  if (!title) return null
  return { phrase: found.text, title, dueDate: fromPickerDate(at), dueTime }
}
