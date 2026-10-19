// Events from a person's other Google calendars, as the day, week and month
// views show them: beside the to-dos and never one of them. The server turns
// what Google sends into household wall-clock time (`fromGoogle`); the views
// ask which fall on a day (`eventsOn`), and which of those run a whole day or
// more and so span the week as a bar (`weekBars`). Pure, and runs on both
// sides.
import { addDays, diffDays, formatTime, localNow } from './dates'
import type { ReadEvent } from '@/calendar/google'
import type { LocalDate, LocalTime } from './dates'

/** One of the person's Google calendars, for choosing which to show. */
export interface ShownCalendar {
  id: string
  name: string
  /** As the person sees it in Google Calendar, "#rrggbb". */
  color: string
  primary: boolean
  shown: boolean
  /** The person may change its events: they own it or it is shared to edit. */
  writable: boolean
}

/** An event from a shown calendar, in household time. */
export interface CalendarEventView {
  /**
   * Unique across calendars, as the same meeting can be in two of them:
   * `<calendarId> <eventId>`, which is also how the URL opens it.
   */
  key: string
  calendarId: string
  eventId: string
  /** The series a repeating event's day belongs to. */
  seriesId: string | null
  title: string
  color: string
  calendar: string
  /** Where Google Calendar shows it, when Google gave one. */
  link: string | null
  allDay: boolean
  startDate: LocalDate
  /** Null for an all-day event. */
  startTime: LocalTime | null
  /** Where it stops: the day after the last for an all-day event, as Google says. */
  endDate: LocalDate
  endTime: LocalTime | null
}

/** What an event with no title is called, as Google Calendar says it. */
export const NO_TITLE = '(No title)'

/** Neither a calendar's id nor an event's ever holds a space. */
export function eventKey(calendarId: string, eventId: string): string {
  return `${calendarId} ${eventId}`
}

export function parseEventKey(
  key: string,
): { calendarId: string; eventId: string } | null {
  const at = key.indexOf(' ')
  if (at <= 0 || at === key.length - 1) return null
  return { calendarId: key.slice(0, at), eventId: key.slice(at + 1) }
}

/**
 * An event as the views show it, or null for one that is not on: cancelled,
 * declined by the person, or with no start.
 */
export function fromGoogle(
  event: ReadEvent,
  calendar: { id: string; name: string; color: string },
  timeZone: string,
): CalendarEventView | null {
  if (event.status === 'cancelled') return null
  if (
    event.attendees?.some(
      (attendee) => attendee.self && attendee.responseStatus === 'declined',
    )
  ) {
    return null
  }
  const common = {
    key: eventKey(calendar.id, event.id),
    calendarId: calendar.id,
    eventId: event.id,
    seriesId: event.recurringEventId ?? null,
    title: event.summary?.trim() || NO_TITLE,
    color: calendar.color,
    calendar: calendar.name,
    link: event.htmlLink ?? null,
  }
  if (event.start?.date) {
    const startDate = event.start.date
    const endDate =
      event.end?.date && event.end.date > startDate
        ? event.end.date
        : addDays(startDate, 1)
    return {
      ...common,
      allDay: true,
      startDate,
      startTime: null,
      endDate,
      endTime: null,
    }
  }
  if (!event.start?.dateTime) return null
  const start = localNow(timeZone, new Date(event.start.dateTime))
  const endsAt = event.end?.dateTime
    ? localNow(timeZone, new Date(event.end.dateTime))
    : start
  const end = endsAt.stamp < start.stamp ? start : endsAt
  return {
    ...common,
    allDay: false,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  }
}

/** The last day an event covers. One that ends at midnight stops the day before. */
export function lastDay(event: CalendarEventView): LocalDate {
  if (event.allDay) return addDays(event.endDate, -1)
  if (event.endTime === '00:00' && event.endDate > event.startDate) {
    return addDays(event.endDate, -1)
  }
  return event.endDate
}

/** An event on one day, with what the day says about when. */
export interface DayEvent {
  event: CalendarEventView
  /**
   * "All day" (with "day 2 of 3" for one over several days), "9:00 am", or
   * "until 11:00 am" on the day a long one ends.
   */
  when: string
  /** Over the whole day: an all-day event, or the middle of a long one. */
  wholeDay: boolean
}

/** The events on `date`, the whole-day ones first, then by when they start. */
export function eventsOn(
  events: ReadonlyArray<CalendarEventView>,
  date: LocalDate,
): Array<DayEvent> {
  const on: Array<DayEvent & { sort: string }> = []
  for (const event of events) {
    if (date < event.startDate || date > lastDay(event)) continue
    if (event.allDay) {
      const days = diffDays(event.endDate, event.startDate)
      const when =
        days > 1
          ? `All day, day ${diffDays(date, event.startDate) + 1} of ${days}`
          : 'All day'
      on.push({ event, when, wholeDay: true, sort: '' })
    } else if (date === event.startDate) {
      const time = event.startTime as LocalTime
      on.push({ event, when: formatTime(time), wholeDay: false, sort: time })
    } else if (date === event.endDate) {
      const time = event.endTime as LocalTime
      on.push({
        event,
        when: `until ${formatTime(time)}`,
        wholeDay: false,
        sort: '00:00',
      })
    } else {
      on.push({ event, when: 'All day', wholeDay: true, sort: '' })
    }
  }
  return on
    .sort(
      (a, b) =>
        a.sort.localeCompare(b.sort) ||
        a.event.title.localeCompare(b.event.title),
    )
    .map(({ sort: _sort, ...rest }) => rest)
}

/**
 * When an event runs, in full for the day view: "9:00 am to 10:30 am", or
 * "From 10:00 pm" for one that carries on past midnight.
 */
export function eventSpan(on: DayEvent): string {
  const { event } = on
  if (on.wholeDay || !event.startTime || !event.endTime) return on.when
  if (on.when.startsWith('until')) return on.when
  if (event.endDate !== event.startDate && lastDay(event) !== event.startDate) {
    return `From ${formatTime(event.startTime)}`
  }
  if (event.endTime === event.startTime) return formatTime(event.startTime)
  return `${formatTime(event.startTime)} to ${formatTime(event.endTime)}`
}

const minutes = (time: LocalTime) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Whether an event spans its days as a bar: all day, or timed and running
 * 24 hours or more, as Google Calendar draws them. Anything shorter, even
 * across midnight, is a chip on each day it touches.
 */
export function isBar(event: CalendarEventView): boolean {
  if (event.allDay) return true
  const length =
    diffDays(event.endDate, event.startDate) * 1440 +
    minutes(event.endTime as LocalTime) -
    minutes(event.startTime as LocalTime)
  return length >= 1440
}

/** One week's piece of a bar: the days it covers there, and its lane. */
export interface BarPiece {
  event: CalendarEventView
  /** First and last column it covers, 0 for Sunday. */
  from: number
  to: number
  /** Its row among the week's bars, from the top. */
  lane: number
  /** It began in an earlier week, or carries on into a later one. */
  before: boolean
  after: boolean
}

/**
 * The bars across one week of seven days: a piece per event, from its first
 * to its last day in the week. Lanes are packed first-fit, the earliest
 * first and the longest of those first, so a lane is reused as soon as the
 * bar in it ends.
 */
export function weekBars(
  events: ReadonlyArray<CalendarEventView>,
  week: ReadonlyArray<LocalDate>,
): { pieces: Array<BarPiece>; lanes: number } {
  const [first, last] = [week[0], week[6]]
  const pieces = events
    .filter(
      (event) =>
        isBar(event) && event.startDate <= last && lastDay(event) >= first,
    )
    .map((event) => {
      const end = lastDay(event)
      return {
        event,
        from: diffDays(
          event.startDate < first ? first : event.startDate,
          first,
        ),
        to: diffDays(end > last ? last : end, first),
        lane: 0,
        before: event.startDate < first,
        after: end > last,
      }
    })
    .sort(
      (a, b) =>
        a.from - b.from ||
        b.to - b.from - (a.to - a.from) ||
        a.event.title.localeCompare(b.event.title) ||
        a.event.key.localeCompare(b.event.key),
    )
  const ends: Array<number> = []
  for (const piece of pieces) {
    let lane = ends.findIndex((end) => end < piece.from)
    if (lane === -1) lane = ends.push(-1) - 1
    ends[lane] = piece.to
    piece.lane = lane
  }
  return { pieces, lanes: ends.length }
}

/** How many of a week's bars cover a column on lanes from `shown` down. */
export function barsHidden(
  pieces: ReadonlyArray<BarPiece>,
  column: number,
  shown: number,
): number {
  return pieces.filter(
    (piece) =>
      piece.lane >= shown && piece.from <= column && piece.to >= column,
  ).length
}

/**
 * When an event runs, as the panel edits it: household wall-clock time,
 * the end the day after the last for an all-day event, as Google says.
 */
export interface EventWhen {
  allDay: boolean
  startDate: LocalDate
  startTime: LocalTime | null
  endDate: LocalDate
  endTime: LocalTime | null
}

/** Whether a when ends after it starts: a timed event may last no time. */
export function whenRuns(when: EventWhen): boolean {
  if (when.allDay) return when.endDate > when.startDate
  if (!when.startTime || !when.endTime) return false
  return (
    `${when.endDate}T${when.endTime}` >= `${when.startDate}T${when.startTime}`
  )
}

/** What a change to an event can touch. */
export interface EventChange {
  title?: string
  notes?: string
  place?: string
  when?: EventWhen
}

/** What the panel says when it drops a repeating event's unsaved pick. */
export const SERIES_PICK_DROPPED = 'Change to a repeating event not saved.'

/**
 * What becomes of a picked day or time once it settles: kept when it is a
 * whole value that differs from the saved one, and otherwise nothing. Left
 * behind as the panel closes, a repeating event's pick is dropped and said
 * so, since nothing is there to ask which days it is for.
 */
export function settlePick(
  pick: string | null,
  saved: string,
  { leaving, repeating }: { leaving: boolean; repeating: boolean },
): { keep: string } | { dropped: string } | null {
  if (!pick || pick === saved) return null
  if (leaving && repeating) return { dropped: SERIES_PICK_DROPPED }
  return { keep: pick }
}

/** Which days of a repeating event a change or a delete is for. */
export type SeriesScope = 'this' | 'following' | 'all'

/** An event opened in its panel: the view's fields, and the rest. */
export interface EventDetail extends CalendarEventView {
  notes: string
  place: string
  /** "Every Saturday", "Repeats", or null for an event that does not. */
  repeats: string | null
  /**
   * What the person may do with it here: change it, first allow the app to
   * change events (they gave reading only), or only look.
   */
  can: 'edit' | 'allow' | 'view'
  /**
   * Why it is look-only: the calendar is shared with them to view, they
   * were invited by someone else, or Google keeps it (a birthday).
   */
  why: 'calendar' | 'invited' | 'google' | null
}

/**
 * An event's description as words. Google Calendar writes HTML, so line
 * breaks become new lines and the rest of the markup goes.
 */
export function plainText(html: string): string {
  if (!/[<&]/.test(html)) return html
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
