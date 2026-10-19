// A person's other Google calendars, read for the day, week and month views
// once they asked for that: which calendars they have, which they chose to
// see, and those calendars' events over the days on screen. Nothing here
// writes to Google (src/calendar/events.ts changes events), and nothing read
// is kept. Only the choice of calendars is stored (calendars_shown); names,
// colours and events are asked of Google each time the views ask, and the
// browser keeps them a short while (src/lib/queries.ts).
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '@/db/client'
import { fromGoogle } from '@/lib/calendar-events'
import { addDays } from '@/lib/dates'
import { env } from '@/server/env'
import {
  GoogleError,
  editsCalendars,
  readingApi,
  readsCalendars,
} from './google'
import { readerToken } from './run'
import type { CalendarEventView, ShownCalendar } from '@/lib/calendar-events'
import type { LocalDate } from '@/lib/dates'
import type { ListedCalendar, ReadEvent, ReadingApi } from './google'

/** How many calendars one person can show: each is a request per screen. */
export const MAX_SHOWN = 12
/** Pages of 250 read from one calendar for one screen, at most. */
const MAX_PAGES = 4
const FALLBACK_COLOR = '#9e9e9e'
/** Why Google refuses a calendar the person can no longer read. */
const UNREADABLE = ['forbidden', 'insufficientPermissions']

/**
 * The person's link and a way to read, or null while they cannot; `edits`
 * says whether Google also lets the app change their events.
 */
export async function reader(person: string): Promise<{
  api: ReadingApi
  todosCalendar: string | null
  edits: boolean
} | null> {
  if (!env.calendar.enabled) return null
  const link = await getDb()
    .select()
    .from(schema.calendarLinks)
    .where(eq(schema.calendarLinks.person, person))
    .get()
  if (!link || link.problem || !readsCalendars(link.scopes.split(' '))) {
    return null
  }
  return {
    api: readingApi(readerToken(link)),
    todosCalendar: link.calendarId,
    edits: editsCalendars(link.scopes.split(' ')),
  }
}

async function shownIds(person: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: schema.calendarsShown.calendarId })
    .from(schema.calendarsShown)
    .where(eq(schema.calendarsShown.person, person))
  return new Set(rows.map((row) => row.id))
}

/**
 * The shown ids still among the person's calendars. Ones Google no longer
 * lists are forgotten: the picker cannot offer them to switch off, and they
 * would otherwise count against MAX_SHOWN.
 */
async function shownAmong(
  person: string,
  calendars: Array<{ id: string }>,
): Promise<Set<string>> {
  const listed = new Set(calendars.map((calendar) => calendar.id))
  const shown = [...(await shownIds(person))]
  const stale = shown.filter((id) => !listed.has(id))
  if (stale.length > 0) {
    await getDb()
      .delete(schema.calendarsShown)
      .where(
        and(
          eq(schema.calendarsShown.person, person),
          inArray(schema.calendarsShown.calendarId, stale),
        ),
      )
  }
  return new Set(shown.filter((id) => listed.has(id)))
}

/** A calendar as the picker names it. The Todos calendar is not one. */
function named(listed: ListedCalendar): Omit<ShownCalendar, 'shown'> {
  return {
    id: listed.id,
    name: listed.summaryOverride || listed.summary || listed.id,
    color: listed.backgroundColor ?? FALLBACK_COLOR,
    primary: listed.primary === true,
    writable: listed.accessRole === 'owner' || listed.accessRole === 'writer',
  }
}

/** The person's calendars but the Todos one, named. */
export async function others(
  api: ReadingApi,
  todosCalendar: string | null,
): Promise<Array<Omit<ShownCalendar, 'shown'>>> {
  return (await api.listCalendars())
    .filter((listed) => listed.id !== todosCalendar)
    .map(named)
}

/** Every calendar the person can show, theirs first, then by name. */
export async function listCalendars(
  person: string,
): Promise<Array<ShownCalendar>> {
  const read = await reader(person)
  if (!read) return []
  const calendars = await others(read.api, read.todosCalendar)
  const shown = await shownAmong(person, calendars)
  return calendars
    .map((calendar) => ({ ...calendar, shown: shown.has(calendar.id) }))
    .sort(
      (a, b) =>
        Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name),
    )
}

/** Shows a calendar in the views, or stops showing it. */
export async function showCalendar(
  person: string,
  calendarId: string,
  shown: boolean,
): Promise<void> {
  const db = getDb()
  if (!shown) {
    await db
      .delete(schema.calendarsShown)
      .where(
        and(
          eq(schema.calendarsShown.person, person),
          eq(schema.calendarsShown.calendarId, calendarId),
        ),
      )
    return
  }
  if (!(await reader(person))) {
    throw new Error('this person cannot read their calendars')
  }
  if ((await shownIds(person)).size >= MAX_SHOWN) {
    throw new Error(`at most ${MAX_SHOWN} calendars can be shown`)
  }
  await db
    .insert(schema.calendarsShown)
    .values({ person, calendarId })
    .onConflictDoNothing()
}

/**
 * The events of the person's shown calendars that touch the household days
 * from `from` to `to`. Google is asked a day wider each side, in UTC, which
 * covers the household's day in any zone; the views place each event by
 * its household day. A calendar Google no longer lets the person read is
 * left out, and the rest still show. A calendar Google refuses only for now,
 * as for too many requests, fails the whole read.
 */
export async function eventsBetween(
  person: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Array<CalendarEventView>> {
  const read = await reader(person)
  if (!read) return []
  if ((await shownIds(person)).size === 0) return []
  const listed = await others(read.api, read.todosCalendar)
  const shown = await shownAmong(person, listed)
  const calendars = listed.filter((calendar) => shown.has(calendar.id))
  const window = {
    timeMin: `${addDays(from, -1)}T00:00:00Z`,
    timeMax: `${addDays(to, 2)}T00:00:00Z`,
    timeZone: env.timeZone,
  }
  const lists = await Promise.all(
    calendars.map(async (calendar) => {
      const events: Array<ReadEvent> = []
      let pageToken: string | null = null
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const reply = await read.api.listWindow(calendar.id, {
            ...window,
            pageToken,
          })
          events.push(...reply.items)
          pageToken = reply.nextPageToken ?? null
          if (!pageToken) break
        }
      } catch (error) {
        if (
          error instanceof GoogleError &&
          (error.status === 404 ||
            (error.status === 403 && UNREADABLE.includes(error.reason)))
        ) {
          console.warn(`[calendar] cannot read a shown calendar: ${error}`)
          return []
        }
        throw error
      }
      return events
        .map((event) => fromGoogle(event, calendar, env.timeZone))
        .filter((event) => event !== null)
    }),
  )
  return lists.flat()
}
