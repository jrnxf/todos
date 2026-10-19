// The account page's view of a person's Google Calendar, and the way to take
// it away. Connecting is not a server function: it is a trip to Google and
// back, through /api/calendar/connect. The same goes for letting the app
// read the person's other calendars; choosing which of those the views show,
// and reading their events, is here.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eventsBetween, listCalendars, showCalendar } from '@/calendar/read'
import { calendarStatus, disconnectCalendar } from '@/calendar/run'
import { diffDays } from '@/lib/dates'
import { SIGNED_OUT } from '@/lib/signed-out'
import type { CalendarStatus } from '@/calendar/run'
import type { CalendarEventView, ShownCalendar } from '@/lib/calendar-events'

function signedIn(context: { person: string | null }): string {
  if (!context.person) throw new Error(SIGNED_OUT)
  return context.person
}

export const getCalendar = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<CalendarStatus> =>
    calendarStatus(signedIn(context)),
)

export const removeCalendar = createServerFn({ method: 'POST' }).handler(
  async ({ context }): Promise<void> => {
    await disconnectCalendar(signedIn(context))
  },
)

/** The person's other calendars, each saying whether the views show it. */
export const getCalendars = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<Array<ShownCalendar>> =>
    listCalendars(signedIn(context)),
)

export const setCalendarShown = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1).max(1024), shown: z.boolean() }))
  .handler(async ({ data, context }): Promise<void> => {
    await showCalendar(signedIn(context), data.id, data.shown)
  })

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The shown calendars' events over a month's grid, six weeks at most. */
export const getCalendarEvents = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({ from: date, to: date })
      .refine(({ from, to }) => to >= from && diffDays(to, from) < 42),
  )
  .handler(async ({ data, context }): Promise<Array<CalendarEventView>> =>
    eventsBetween(signedIn(context), data.from, data.to),
  )
