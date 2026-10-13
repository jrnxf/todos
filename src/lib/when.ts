// "When" as the screens speak it: the shortcuts in the picker, the label on
// a pill, and reading a date out of a typed title.
import {
  addDays,
  diffDays,
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
      isCertain: (
        part: 'hour' | 'meridiem' | 'day' | 'weekday' | 'month',
      ) => boolean
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

// "by fri", "due on fri", "booked for fri": the linking word goes with the
// date.
const LINK = /\b(due|by|on|at|in|for|before|until)\s*$/i
// The linking words that say a deadline. "for" does not: "tickets for
// August: Osage County".
const DUE = /\b(due|by|on|at|in|before|until)\s*$/i
// A month and nothing else. It is as often a name ("March of the Penguins",
// "the August statement") as a deadline, so it needs one of those.
const MONTH_ALONE =
  /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?(\s+of)?$/i
// A length of time and nothing else is an amount ("2 weeks of recycling"),
// or says how far ahead of something ("remind me 5 days before"): not a
// deadline. "in 2 weeks" and "2 weeks from now" are not matched.
const SPAN_ALONE =
  /^(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|few|couple(\s+of)?)\s+(days?|weeks?|months?|years?)(\s+(before|earlier|ahead|early|prior))?$/i
// A part of the day and nothing else names no day: "date night", "the
// morning routine". "tonight" and "this evening" do.
const PART_OF_DAY = /^(the\s+)?(night|morning|afternoon|evening)s?$/i
// "on the 1st", "by the 15th", "the 5th": a day of the month, which the
// parser does not read. Only at the end of a phrase, so "on the 2nd floor"
// is left alone.
const DAY_OF_MONTH =
  /\b(?:(?:due|by|on|for|before|until)\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)(?=\s*$|\s*[,;.!]|\s+at\b|\s+\d)/i
// "the first of the month", "the 15th of next month": a day of a month that
// is not named. The parser reads only "the month" there, as a month from now.
const ORDINAL: Partial<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  fifteenth: 15,
  twentieth: 20,
  thirtieth: 30,
}
const OF_MONTH = new RegExp(
  String.raw`\b(?:(?:due|by|on|for|before|until)\s+)?(?:the\s+)?(?:(\d{1,2})(?:st|nd|rd|th)|(${Object.keys(ORDINAL).join('|')}))\s+of\s+(the|this|next)\s+month\b`,
  'i',
)
// A part of the day in front of a date. The parser runs the two together
// and loses the date: "Parent teacher night 10/22", "date night saturday".
const PART_THEN = /^(?:the\s+)?(?:night|morning|afternoon|evening)s?\s+(?=\S)/i
// "next week" names no day; it is read as the week's Monday.
const NEXT_WEEK = /\bnext\s+week\b/i
// A weekday said as the one this week, which on that weekday is today.
const THIS_ONE = /\b(this|today|tonight)\b/i
// An hour said with "am", "pm" or a word for it: nothing to work out.
const HALF_SAID = /\d\s*[ap]\.?m\b|\b(noon|midnight|midday)\b/i
// What makes a bare hour the evening's, or the morning's: "dinner at 7" is
// 19:00 and "breakfast at 7" is 07:00.
const EVENING =
  /\b(dinner|supper|tonight|evening|night|drinks|happy hour|movie|concert|bedtime|sunset)\b/i
const MORNING =
  /\b(breakfast|brunch|morning|sunrise|before (school|work)|school bus)\b/i

// The day words people mistype most, and the shorthand the parser does not
// know. Each is read as the word it stands for; the title keeps what was
// typed.
const RESPELL: Partial<Record<string, string>> = {}
for (const [word, typed] of Object.entries({
  monday: 'munday mondya mondy moday',
  tuesday: 'tuseday teusday tuesdy tusday tueday tuesay',
  wednesday:
    'wensday wendsday wednsday wedensday wenesday wednessday wedsday wednesay wendesday wedneday',
  thursday: 'thrusday thurday thursdy thusday thurdsay thursay thirsday',
  friday: 'firday fridya frieday fryday frday',
  saturday: 'saterday satruday saturdy satuday saturady sataurday satday',
  sunday: 'sunady sundy suday',
  tomorrow:
    'tommorow tommorrow tomorow tomorro tomarrow tommorro tomrrow tomorrw tmrw tmrrw tmw tmr tomm 2morrow 2moro',
  tonight: 'tonite tonigth tongiht tonigt 2nite',
  today: 'tody todya 2day',
  january: 'januray janurary januarry',
  february: 'febuary feburary febrary februrary',
  september: 'septmber setember septemeber',
  october: 'ocotber octobor ocober',
  november: 'novemeber novmber novembr',
  december: 'decemeber decmber decembr',
}))
  for (const one of typed.split(' ')) RESPELL[one] = word

// Shorthand the parser does not read as typed: "@ 2" is "at 2", and "day
// after tomorrow" wants its "the".
const SHORTHAND =
  /(?<=^|\s)@(?=\s*\d)|(?<!\bthe\s+)\bday\s+after\s+tomorrow\b|[\p{L}\d]+/giu

/**
 * `text` with the mistyped day words and the shorthand spelled out, and
 * where each character of it sits in what was typed.
 */
function respelled(text: string): { text: string; typedAt: Array<number> } {
  let spelled = ''
  const typedAt: Array<number> = []
  let from = 0
  const copy = (to: number) => {
    for (let at = from; at < to; at++) typedAt.push(at)
    spelled += text.slice(from, to)
    from = to
  }
  for (const found of text.matchAll(SHORTHAND)) {
    const typed = found[0].toLowerCase()
    const end = found.index + typed.length
    let word = RESPELL[typed]
    if (typed === '@') word = /\d/.test(text[end] ?? '') ? 'at ' : 'at'
    else if (typed.startsWith('day ')) word = 'the day after tomorrow'
    if (!word) continue
    copy(found.index)
    from = end
    // The word's first letter is where the typed one starts; the rest of it
    // is where the typed one ends.
    typedAt.push(found.index, ...Array<number>(word.length - 1).fill(from))
    spelled += word
  }
  copy(text.length)
  typedAt.push(text.length)
  return { text: spelled, typedAt }
}

type Found = ReturnType<DateParser['parse']>[number]
const saysDay = (one: Found) =>
  one.start.isCertain('day') ||
  one.start.isCertain('weekday') ||
  one.start.isCertain('month')

/**
 * What the parser finds in `text`, put right where it reads two things as
 * one or one thing as two.
 */
function datesIn(
  parser: DateParser,
  text: string,
  reference: Date,
  today: LocalDate,
): Array<Found> {
  const parse = (part: string) =>
    parser.parse(part, reference, { forwardDate: true })
  const dates: Array<Found> = []
  for (const one of parse(text).flatMap((found) => {
    const part = saysDay(found) ? null : PART_THEN.exec(found.text)
    if (!part) return [found]
    // The date after the part of the day, read on its own.
    const at = found.index + part[0].length
    return parse(text.slice(at)).map((later): Found => ({
      index: later.index + at,
      text: later.text,
      start: later.start,
    }))
  })) {
    const last = dates.at(-1)
    const between = last
      ? text.slice(last.index + last.text.length, one.index)
      : ''
    // "a week from today", "2 weeks from friday": the length of time counts
    // from the day after it, not from now.
    if (last && SPAN_ALONE.test(last.text) && /^\s+from\s+$/i.test(between)) {
      const date = one.start.date()
      date.setDate(
        date.getDate() + diffDays(fromPickerDate(last.start.date()), today),
      )
      dates[dates.length - 1] = {
        index: last.index,
        text: text.slice(last.index, one.index + one.text.length),
        start: {
          date: () => date,
          isCertain: (part) =>
            part === 'day' ||
            ((part === 'hour' || part === 'meridiem') &&
              one.start.isCertain(part)),
        },
      }
    } else dates.push(one)
  }
  return dates
}

/**
 * The hour a bare "at 7" means. People leave "pm" off the afternoon and the
 * evening far more than off the morning: 1 to 6 is the afternoon, 7 to 11
 * the morning, unless the to-do says which ("dinner at 7").
 */
function hourMeant(hour: number, text: string): number {
  if (hour < 1 || hour > 11) return hour
  if (MORNING.test(text)) return hour
  if (EVENING.test(text)) return hour + 12
  return hour <= 6 ? hour + 12 : hour
}

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

/** The first day of the month after `today`'s. */
function nextMonth(today: LocalDate): LocalDate {
  const [year, month] = today.split('-').map(Number)
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
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
  typed: string,
  today: LocalDate,
): ParsedWhen | null {
  const { text, typedAt } = respelled(typed)
  /** A stretch of `text`, as the stretch of what was typed. */
  const cut = (start: number, end: number): [number, number] => [
    typedAt[start],
    typedAt[end],
  ]
  // Noon, so "today" is the same calendar day in whatever zone this runs in.
  const reference = toPickerDate(today)
  reference.setHours(12)
  // A word in a run of capitalised ones is part of a name ("Friday Night
  // Lights"), unless the whole title is typed that way.
  const plainWords = /(?<=\S\s+)\p{Ll}/u.test(text)
  // A day of an unnamed month is read here, and hidden from the parser.
  const ofMonth = OF_MONTH.exec(text)
  const shown = ofMonth
    ? text.slice(0, ofMonth.index) +
      ' '.repeat(ofMonth[0].length) +
      text.slice(ofMonth.index + ofMonth[0].length)
    : text
  const last = datesIn(parser, shown, reference, today)
    .filter((one) => {
      const before = shown.slice(0, one.index)
      const after = shown.slice(one.index + one.text.length)
      if (SPAN_ALONE.test(one.text) || PART_OF_DAY.test(one.text)) return false
      // "Friday's field trip", "Tuesdays with Morrie": about the day, not due
      // on it.
      if (/^(['’]s\b|\p{L})/u.test(after)) return false
      // "the day before": not a day at all.
      if (fromPickerDate(one.start.date()) < today) return false
      if (
        plainWords &&
        before.trim() &&
        !DUE.test(before) &&
        /^\p{Lu}/u.test(one.text) &&
        /^\s+\p{Lu}/u.test(after)
      )
        return false
      if (!MONTH_ALONE.test(one.text)) return true
      return DUE.test(before)
    })
    .at(-1)
  // Beside a day of an unnamed month, only a time is the parser's to add.
  const found =
    ofMonth && last && (saysDay(last) || !last.start.isCertain('hour'))
      ? undefined
      : last

  const at = found?.start.date()
  const hasTime = found?.start.isCertain('hour') ?? false
  const hasDay = found ? saysDay(found) : false
  const timeOnly = hasTime && !hasDay
  let dueTime: LocalTime | null = null
  if (found && at && hasTime) {
    const said = found.start.isCertain('meridiem') || HALF_SAID.test(found.text)
    const hour = said ? at.getHours() : hourMeant(at.getHours(), text)
    dueTime = `${String(hour).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  }

  // "on the 1st at 9am": the day of the month, with the parser's time if
  // that is all the parser found.
  const dayOfMonth =
    ofMonth ?? (!found || timeOnly ? DAY_OF_MONTH.exec(text) : null)
  // In figures, or else in a word.
  const figures = dayOfMonth?.at(1)
  const day = figures
    ? Number(figures)
    : (ORDINAL[dayOfMonth?.at(2)?.toLowerCase() ?? ''] ?? 0)
  const onDay =
    dayOfMonth &&
    nextDayOfMonth(
      ofMonth?.[3].toLowerCase() === 'next' ? nextMonth(today) : today,
      day,
    )
  if (dayOfMonth && onDay) {
    const cuts = [
      cut(dayOfMonth.index, dayOfMonth.index + dayOfMonth[0].length),
    ]
    if (found) cuts.push(cut(found.index, found.index + found.text.length))
    const title = without(typed, cuts)
    if (!title) return null
    return {
      phrase: typed
        .slice(
          Math.min(...cuts.map((one) => one[0])),
          Math.max(...cuts.map((one) => one[1])),
        )
        .trim(),
      title,
      dueDate: onDay,
      dueTime,
    }
  }

  if (!found || !at) return null
  const [start, end] = cut(found.index, found.index + found.text.length)
  const title = without(typed, [[start, end]])
  if (!title) return null
  let dueDate = fromPickerDate(at)
  // A time and no day is today: the parser cannot know what time it is now.
  if (timeOnly) dueDate = today
  // "next week" is its Monday.
  else if (NEXT_WEEK.test(found.text) && !found.start.isCertain('weekday'))
    dueDate = addDays(today, (8 - weekday(today)) % 7 || 7)
  // A weekday typed on that same weekday is next week's.
  else if (
    dueDate === today &&
    found.start.isCertain('weekday') &&
    !found.start.isCertain('day') &&
    !THIS_ONE.test(found.text)
  )
    dueDate = addDays(today, 7)
  return { phrase: typed.slice(start, end), title, dueDate, dueTime }
}
