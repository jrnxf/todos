// One event from a person's other Google calendars, opened in its panel:
// read in full, changed, moved to another of their calendars, or deleted.
// Nothing is kept; each call goes to Google as the person, and only where
// Google Calendar would let them: a calendar they own or may edit, an event
// that is theirs or lets guests change it, and only once they let the app
// change events (EVENTS_SCOPE). A repeating event's change or delete is for
// that day, that day and the ones after it, or the whole series; "this and
// following" ends the series before that day and, for a change, starts a
// new series there, as Google Calendar does.
import {
  fromGoogle,
  eventKey,
  plainText,
  whenRuns,
} from '@/lib/calendar-events'
import { addDays, diffDays } from '@/lib/dates'
import {
  continueSeries,
  countsDays,
  describeRepeat,
  endSeries,
  restyleUntil,
  untilBefore,
} from '@/lib/repeats'
import { env } from '@/server/env'
import { GoogleError } from './google'
import { others, reader } from './read'
import type { FullEvent, ReadingApi } from './google'
import type {
  CalendarEventView,
  EventChange,
  EventDetail,
  EventWhen,
  SeriesScope,
} from '@/lib/calendar-events'
import type { LocalDate } from '@/lib/dates'

/** Kinds of event Google Calendar lets a person change. */
const CHANGEABLE = [undefined, 'default', 'outOfOffice', 'focusTime']

/** A change Google Calendar would not let the person make either. */
export class EventRefused extends Error {}

type Calendar = Awaited<ReturnType<typeof others>>[number]

interface Opened {
  api: ReadingApi
  edits: boolean
  calendar: Calendar
  calendars: Array<Calendar>
}

/** The person's way to Google, and the calendar the event is in. */
async function open(person: string, calendarId: string): Promise<Opened> {
  const read = await reader(person)
  if (!read) throw new EventRefused('Your calendars are not connected.')
  const calendars = await others(read.api, read.todosCalendar)
  const calendar = calendars.find((one) => one.id === calendarId)
  if (!calendar) throw new EventRefused('That calendar is not one of yours.')
  return { api: read.api, edits: read.edits, calendar, calendars }
}

function view(event: FullEvent, calendar: Calendar): CalendarEventView | null {
  return fromGoogle(event, calendar, env.timeZone)
}

/** Why an event can only be looked at, or null when it can be changed. */
function lookOnly(event: FullEvent, calendar: Calendar): EventDetail['why'] {
  if (!calendar.writable) return 'calendar'
  if (!CHANGEABLE.includes(event.eventType)) return 'google'
  if (event.organizer?.self === false && !event.guestsCanModify) {
    return 'invited'
  }
  return null
}

/**
 * One event in full, for its panel, or null when it is not on: deleted,
 * cancelled, or declined by the person.
 */
export async function openEvent(
  person: string,
  calendarId: string,
  eventId: string,
): Promise<EventDetail | null> {
  const { api, edits, calendar } = await open(person, calendarId)
  const event = await gone(api.getEvent(calendarId, eventId))
  const shown = event && view(event, calendar)
  if (!event || !shown) return null
  // How it repeats is said by the series, not the day.
  const series = event.recurringEventId
    ? await gone(api.getEvent(calendarId, event.recurringEventId))
    : null
  const why = lookOnly(event, calendar)
  return {
    ...shown,
    notes: plainText(event.description ?? ''),
    place: event.location ?? '',
    repeats: event.recurringEventId
      ? (describeRepeat(series?.recurrence) ?? 'Repeats')
      : null,
    can: why ? 'view' : edits ? 'edit' : 'allow',
    why,
  }
}

/** A read that answers null for an event Google no longer has. */
async function gone<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read
  } catch (error) {
    if (
      error instanceof GoogleError &&
      (error.status === 404 || error.status === 410)
    ) {
      return null
    }
    throw error
  }
}

/** The person may change this event, or a refusal saying why not. */
async function changeable(
  person: string,
  calendarId: string,
  eventId: string,
): Promise<Opened & { event: FullEvent; current: CalendarEventView }> {
  const opened = await open(person, calendarId)
  if (!opened.edits) {
    throw new EventRefused('Allow the app to change your calendars first.')
  }
  const event = await gone(opened.api.getEvent(calendarId, eventId))
  const current = event && view(event, opened.calendar)
  if (!event || !current) throw new EventRefused('That event is gone.')
  if (lookOnly(event, opened.calendar)) {
    throw new EventRefused('This event can only be looked at here.')
  }
  return { ...opened, event, current }
}

const timeOf = (date: LocalDate, time: string | null) =>
  time ? { dateTime: `${date}T${time}:00`, timeZone: env.timeZone } : { date }

/**
 * A when as Google writes it. A patch also clears the other kind of time,
 * so an all-day event can turn timed and back.
 */
function googleWhen(when: EventWhen, patch: boolean): Record<string, unknown> {
  const clear = patch ? { date: null, dateTime: null, timeZone: null } : {}
  return {
    start: {
      ...clear,
      ...timeOf(when.startDate, when.allDay ? null : when.startTime),
    },
    end: {
      ...clear,
      ...timeOf(when.endDate, when.allDay ? null : when.endTime),
    },
  }
}

function textBody(change: EventChange): Record<string, unknown> {
  return {
    ...(change.title !== undefined ? { summary: change.title.trim() } : {}),
    ...(change.notes !== undefined ? { description: change.notes } : {}),
    ...(change.place !== undefined ? { location: change.place.trim() } : {}),
  }
}

const whenOf = (event: CalendarEventView): EventWhen => ({
  allDay: event.allDay,
  startDate: event.startDate,
  startTime: event.startTime,
  endDate: event.endDate,
  endTime: event.endTime,
})

/**
 * Where the series moves when one of its days moves from `was` to `now`:
 * its start by the same days, at the new time, and every day as long as the
 * new one.
 */
function shiftSeries(
  series: EventWhen,
  was: EventWhen,
  now: EventWhen,
): EventWhen {
  const startDate = addDays(
    series.startDate,
    diffDays(now.startDate, was.startDate),
  )
  return {
    allDay: now.allDay,
    startDate,
    startTime: now.startTime,
    endDate: addDays(startDate, diffDays(now.endDate, now.startDate)),
    endTime: now.endTime,
  }
}

/** Whether a series' day is its first: "following" from it is all of it. */
function isFirst(series: FullEvent, day: FullEvent): boolean {
  const planned = day.originalStartTime
  if (!planned || !series.start) return true
  if (planned.date) return planned.date === series.start.date
  return (
    new Date(planned.dateTime as string).getTime() ===
    new Date(series.start.dateTime as string).getTime()
  )
}

/** How many of a series' days come before one of them. */
async function daysBefore(
  api: ReadingApi,
  calendarId: string,
  seriesId: string,
  day: FullEvent,
): Promise<number> {
  const planned = day.originalStartTime ?? {}
  const at = planned.date ?? new Date(planned.dateTime as string).getTime()
  let count = 0
  let pageToken: string | null = null
  do {
    const page = await api.listInstances(calendarId, seriesId, {
      timeZone: env.timeZone,
      pageToken,
    })
    for (const one of page.items) {
      const start = one.originalStartTime ?? one.start ?? {}
      const when = start.date ?? new Date(start.dateTime as string).getTime()
      if (when < at) count++
    }
    pageToken = page.nextPageToken ?? null
  } while (pageToken)
  return count
}

/** The key of a series' day that starts on `date`, once Google has it. */
async function dayOn(
  api: ReadingApi,
  calendar: Calendar,
  seriesId: string,
  date: LocalDate,
): Promise<string | null> {
  const page = await api.listInstances(calendar.id, seriesId, {
    timeMin: `${addDays(date, -1)}T00:00:00Z`,
    timeMax: `${addDays(date, 2)}T00:00:00Z`,
    timeZone: env.timeZone,
    pageToken: null,
  })
  const day = page.items.find(
    (one) =>
      one.status !== 'cancelled' && view(one, calendar)?.startDate === date,
  )
  return day ? eventKey(calendar.id, day.id) : null
}

/** Fields a new series carries over from the one it splits from. */
const CARRIED = [
  'summary',
  'description',
  'location',
  'colorId',
  'transparency',
  'visibility',
  'reminders',
  'attendees',
  'guestsCanModify',
  'guestsCanInviteOthers',
  'guestsCanSeeOtherGuests',
] as const

/**
 * Changes an event, or for a repeating one, the days `scope` says. Answers
 * the key the changed day has now: a day of a new series, or of a series
 * that moved, has a new one.
 */
export async function changeEvent(
  person: string,
  calendarId: string,
  eventId: string,
  scope: SeriesScope,
  change: EventChange,
): Promise<{ key: string }> {
  if (change.when && !whenRuns(change.when)) {
    throw new EventRefused('It ends before it starts.')
  }
  const { api, calendar, event, current } = await changeable(
    person,
    calendarId,
    eventId,
  )
  const text = textBody(change)
  const seriesId = event.recurringEventId
  if (!seriesId || scope === 'this') {
    await api.patchEvent(calendarId, eventId, {
      ...text,
      ...(change.when ? googleWhen(change.when, true) : {}),
    })
    return { key: eventKey(calendarId, eventId) }
  }

  const series = await api.getEvent(calendarId, seriesId, true)
  const seriesView = view(series, calendar)
  const now = change.when ?? whenOf(current)
  if (scope === 'all' || isFirst(series, event)) {
    let recurrence = series.recurrence ?? []
    if (change.when && change.when.allDay !== current.allDay) {
      recurrence = restyleUntil(recurrence, change.when.allDay)
    }
    await api.patchEvent(calendarId, seriesId, {
      ...text,
      ...(change.when && seriesView
        ? {
            ...googleWhen(
              shiftSeries(whenOf(seriesView), whenOf(current), now),
              true,
            ),
            recurrence,
          }
        : {}),
    })
    return {
      key: change.when
        ? ((await dayOn(api, calendar, seriesId, now.startDate)) ??
          eventKey(calendarId, eventId))
        : eventKey(calendarId, eventId),
    }
  }

  // This day and the ones after it: the series ends the day before, and a
  // new one, changed, starts here. Ended first, so a failure leaves at
  // worst a series a little short rather than two series on the same days.
  const recurrence = series.recurrence ?? []
  const done = countsDays(recurrence)
    ? await daysBefore(api, calendarId, seriesId, event)
    : 0
  await api.patchEvent(calendarId, seriesId, {
    recurrence: endSeries(
      recurrence,
      untilBefore(event.originalStartTime ?? {}),
    ),
  })
  const carried = Object.fromEntries(
    CARRIED.filter((field) => series[field] !== undefined).map((field) => [
      field,
      series[field],
    ]),
  )
  let rest: FullEvent
  try {
    rest = await api.insertEvent(calendarId, {
      ...carried,
      ...text,
      ...googleWhen(now, false),
      recurrence: restyleUntil(continueSeries(recurrence, done), now.allDay),
    })
  } catch (error) {
    await api
      .patchEvent(calendarId, seriesId, { recurrence })
      .catch(() => undefined)
    throw error
  }
  return {
    key:
      (await dayOn(api, calendar, rest.id, now.startDate)) ??
      eventKey(calendarId, rest.id),
  }
}

/**
 * Moves an event to another of the person's calendars they may change. A
 * repeating event moves as a whole series, as Google keeps it.
 */
export async function moveEvent(
  person: string,
  calendarId: string,
  eventId: string,
  to: string,
): Promise<{ key: string }> {
  const { api, calendars, event } = await changeable(
    person,
    calendarId,
    eventId,
  )
  const destination = calendars.find((one) => one.id === to)
  if (!destination?.writable) {
    throw new EventRefused('That calendar cannot take events.')
  }
  if (to === calendarId) return { key: eventKey(calendarId, eventId) }
  await api.moveEvent(calendarId, event.recurringEventId ?? eventId, to)
  return { key: eventKey(to, eventId) }
}

/** Deletes an event, or for a repeating one, the days `scope` says. */
export async function deleteEvent(
  person: string,
  calendarId: string,
  eventId: string,
  scope: SeriesScope,
): Promise<void> {
  const { api, event } = await changeable(person, calendarId, eventId)
  const seriesId = event.recurringEventId
  if (!seriesId || scope === 'this') {
    await api.deleteEvent(calendarId, eventId)
    return
  }
  const series = await api.getEvent(calendarId, seriesId)
  if (scope === 'all' || isFirst(series, event)) {
    await api.deleteEvent(calendarId, seriesId)
    return
  }
  await api.patchEvent(calendarId, seriesId, {
    recurrence: endSeries(
      series.recurrence ?? [],
      untilBefore(event.originalStartTime ?? {}),
    ),
  })
}
