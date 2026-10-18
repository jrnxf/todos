// The account page's view of a person's Google Calendar, and the way to take
// it away. Connecting is not a server function: it is a trip to Google and
// back, through /api/calendar/connect.
import { createServerFn } from '@tanstack/react-start'
import { calendarStatus, disconnectCalendar } from '@/calendar/run'
import { SIGNED_OUT } from '@/lib/signed-out'
import type { CalendarStatus } from '@/calendar/run'

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
