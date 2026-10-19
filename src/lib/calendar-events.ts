// Events from a person's other Google calendars, as the day, week and month
// views show them: read-only, beside the to-dos and never one of them. The
// server turns what Google sends into household wall-clock time
// (`fromGoogle`); the views ask which fall on a day (`eventsOn`). Pure, and
// runs on both sides.
import { addDays, formatTime, localNow } from './dates'
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
}

/** An event from a shown calendar, in household time. */
export interface CalendarEventView {
  /** Unique across calendars: the same meeting can be in two of them. */
  key: string
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
const NO_TITLE = '(No title)'

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
    key: `${calendar.id} ${event.id}`,
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
function lastDay(event: CalendarEventView): LocalDate {
  if (event.allDay) return addDays(event.endDate, -1)
  if (event.endTime === '00:00' && event.endDate > event.startDate) {
    return addDays(event.endDate, -1)
  }
  return event.endDate
}

/** An event on one day, with what the day says about when. */
export interface DayEvent {
  event: CalendarEventView
  /** "All day", "9:00 am", or "until 11:00 am" on the day a long one ends. */
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
      on.push({ event, when: 'All day', wholeDay: true, sort: '' })
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
