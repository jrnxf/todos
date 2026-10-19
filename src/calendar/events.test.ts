// Opening, changing, moving and deleting an event from a person's other
// calendars, against the app's own migrations in SQLite and a stand-in for
// Google's Calendar API that keeps events in memory.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import {
  CALENDAR_SCOPE,
  EVENTS_READ_SCOPE,
  LIST_SCOPE,
  READ_SCOPES,
} from './google'
import { testDb } from './test-db'
import type { FullEvent } from './google'
import type { Db } from './sync'

const state = vi.hoisted((): { db?: Db } => ({}))
vi.mock('cloudflare:workers', () => ({
  env: {
    CALENDAR_TOKEN_KEY: 'k'.repeat(32),
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    HOUSEHOLD_TZ: 'America/Chicago',
  },
  waitUntil: () => {},
}))
vi.mock('@/db/client', async () => ({
  getDb: () => state.db,
  schema: await import('@/db/schema'),
}))
vi.mock('./run', () => ({ readerToken: () => async () => 'access' }))

const { changeEvent, deleteEvent, moveEvent, openEvent } =
  await import('./events')

const FAMILY = 'family@group.calendar.google.com'
const WORK = 'work@example.com'
const SCHOOL = 'school@group.calendar.google.com'

const CALENDARS = [
  {
    id: FAMILY,
    summary: 'Family',
    backgroundColor: '#16a765',
    accessRole: 'writer',
  },
  {
    id: WORK,
    summary: 'Work',
    backgroundColor: '#4986e7',
    accessRole: 'owner',
  },
  {
    id: SCHOOL,
    summary: 'School',
    backgroundColor: '#ffad46',
    accessRole: 'reader',
  },
]

/** Google, in memory: each calendar's events by id, and every call made. */
let store: Map<string, Map<string, FullEvent>>
let calls: Array<{
  method: string
  path: string
  body?: unknown
  query: URLSearchParams
}>
let next: number

const put = (calendarId: string, event: FullEvent) => {
  if (!store.has(calendarId)) store.set(calendarId, new Map())
  store.get(calendarId)!.set(event.id, event)
}

/** A patch as Google applies one: null clears a field, objects merge. */
function merge(into: Record<string, unknown>, patch: Record<string, unknown>) {
  const out = { ...into }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key]
    else if (typeof value === 'object' && !Array.isArray(value)) {
      out[key] = merge(
        (out[key] as Record<string, unknown> | undefined) ?? {},
        value as Record<string, unknown>,
      )
    } else out[key] = value
  }
  return out
}

const fail = (status: number, reason: string) =>
  Response.json(
    { error: { message: reason, errors: [{ reason }] } },
    { status },
  )

function google() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const path = decodeURIComponent(url.pathname.replace('/calendar/v3', ''))
    calls.push({ method, path, body, query: url.searchParams })
    if (path === '/users/me/calendarList') {
      return Response.json({ items: CALENDARS })
    }
    const [, , calendarId, , eventId, action] = path.split('/')
    const events = store.get(calendarId) ?? new Map<string, FullEvent>()
    if (!eventId) {
      const id = `new${next++}`
      const made = { id, ...body } as FullEvent
      put(calendarId, made)
      return Response.json(made)
    }
    if (action === 'instances') {
      return Response.json({
        items: [...events.values()].filter(
          (one) => one.recurringEventId === eventId,
        ),
      })
    }
    const event = events.get(eventId)
    if (!event) return fail(404, 'notFound')
    if (action === 'move') {
      events.delete(eventId)
      put(url.searchParams.get('destination')!, event)
      return Response.json(event)
    }
    if (method === 'DELETE') {
      events.delete(eventId)
      return new Response(null, { status: 204 })
    }
    if (method === 'PATCH') {
      const changed = merge(
        event as unknown as Record<string, unknown>,
        body,
      ) as unknown as FullEvent
      events.set(eventId, changed)
      return Response.json(changed)
    }
    return Response.json(event)
  })
}

async function link(scopes: Array<string>) {
  await state.db!.insert(schema.calendarLinks).values({
    person: 'alex',
    refreshToken: 'sealed',
    calendarId: 'todos@group.calendar.google.com',
    scopes: scopes.join(' '),
    connectedAt: '2026-10-01T00:00:00.000Z',
  })
}

const writes = () => calls.filter((call) => call.method !== 'GET')

const trip: FullEvent = {
  id: 'trip',
  summary: 'Lake Tahoe trip',
  description: 'Cabin door code <b>4417</b><br>Bring chains',
  location: 'South Lake Tahoe, CA',
  start: { date: '2026-10-09' },
  end: { date: '2026-10-13' },
  htmlLink: 'https://www.google.com/calendar/event?eid=trip',
  organizer: { self: true },
}

/** Soccer every Saturday at 9:00, ten times from Oct 3. */
const soccer: FullEvent = {
  id: 'soccer',
  summary: 'Soccer practice',
  start: { dateTime: '2026-10-03T09:00:00-05:00', timeZone: 'America/Chicago' },
  end: { dateTime: '2026-10-03T10:00:00-05:00', timeZone: 'America/Chicago' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=10'],
  attendees: [{ email: 'coach@example.com', responseStatus: 'accepted' }],
  organizer: { self: true },
}
const saturday = (date: string): FullEvent => ({
  id: `soccer_${date.replaceAll('-', '')}T140000Z`,
  summary: 'Soccer practice',
  recurringEventId: 'soccer',
  originalStartTime: { dateTime: `${date}T09:00:00-05:00` },
  start: { dateTime: `${date}T09:00:00-05:00` },
  end: { dateTime: `${date}T10:00:00-05:00` },
  organizer: { self: true },
})

beforeEach(() => {
  state.db = testDb()
  store = new Map()
  calls = []
  next = 1
  put(FAMILY, trip)
  put(FAMILY, soccer)
  for (const date of ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']) {
    put(FAMILY, saturday(date))
  }
  put(SCHOOL, {
    id: 'break',
    summary: 'Fall break',
    start: { date: '2026-09-28' },
    end: { date: '2026-10-03' },
  })
  vi.stubGlobal('fetch', google())
})

describe('opening an event', () => {
  it('reads it in full, its description as words', async () => {
    await link([CALENDAR_SCOPE, ...READ_SCOPES])
    expect(await openEvent('alex', FAMILY, 'trip')).toMatchObject({
      key: `${FAMILY} trip`,
      title: 'Lake Tahoe trip',
      calendar: 'Family',
      allDay: true,
      startDate: '2026-10-09',
      endDate: '2026-10-13',
      notes: 'Cabin door code 4417\nBring chains',
      place: 'South Lake Tahoe, CA',
      repeats: null,
      can: 'edit',
      why: null,
    })
    expect(writes()).toEqual([])
  })

  it("says how a repeating event repeats, from its series' rule", async () => {
    await link([CALENDAR_SCOPE, ...READ_SCOPES])
    expect(
      await openEvent('alex', FAMILY, saturday('2026-10-17').id),
    ).toMatchObject({ repeats: 'Every Saturday', seriesId: 'soccer' })
  })

  it('only shows what the person cannot change', async () => {
    await link([CALENDAR_SCOPE, ...READ_SCOPES])
    expect(await openEvent('alex', SCHOOL, 'break')).toMatchObject({
      can: 'view',
      why: 'calendar',
    })
    put(WORK, {
      id: 'invite',
      summary: 'Quarterly review',
      start: { date: '2026-10-20' },
      organizer: {},
    })
    expect(await openEvent('alex', WORK, 'invite')).toMatchObject({
      can: 'view',
      why: 'invited',
    })
    put(WORK, {
      id: 'potluck',
      summary: 'Potluck',
      start: { date: '2026-10-21' },
      organizer: {},
      guestsCanModify: true,
    })
    expect(await openEvent('alex', WORK, 'potluck')).toMatchObject({
      can: 'edit',
      why: null,
    })
    put(WORK, {
      id: 'birthday',
      summary: "Sam's birthday",
      start: { date: '2026-10-20' },
      eventType: 'birthday',
    })
    expect(await openEvent('alex', WORK, 'birthday')).toMatchObject({
      why: 'google',
    })
  })

  it('asks to be let edit when the person gave reading alone', async () => {
    await link([CALENDAR_SCOPE, LIST_SCOPE, EVENTS_READ_SCOPE])
    expect(await openEvent('alex', FAMILY, 'trip')).toMatchObject({
      can: 'allow',
    })
    await expect(
      changeEvent('alex', FAMILY, 'trip', 'this', { title: 'x' }),
    ).rejects.toThrow(/Allow/)
    expect(writes()).toEqual([])
  })

  it('answers null for an event that is gone', async () => {
    await link([CALENDAR_SCOPE, ...READ_SCOPES])
    expect(await openEvent('alex', FAMILY, 'nothing')).toBeNull()
  })

  it('opens nothing from a calendar that is not the person’s', async () => {
    await link([CALENDAR_SCOPE, ...READ_SCOPES])
    await expect(
      openEvent('alex', 'someone-else@example.com', 'trip'),
    ).rejects.toThrow()
  })
})

describe('changing an event', () => {
  beforeEach(() => link([CALENDAR_SCOPE, ...READ_SCOPES]))

  it('patches what changed, in household time', async () => {
    await changeEvent('alex', FAMILY, 'trip', 'this', {
      title: ' Tahoe ',
      when: {
        allDay: false,
        startDate: '2026-10-09',
        startTime: '09:00',
        endDate: '2026-10-12',
        endTime: '17:00',
      },
    })
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: `/calendars/${FAMILY}/events/trip`,
        body: {
          summary: 'Tahoe',
          start: {
            date: null,
            dateTime: '2026-10-09T09:00:00',
            timeZone: 'America/Chicago',
          },
          end: {
            date: null,
            dateTime: '2026-10-12T17:00:00',
            timeZone: 'America/Chicago',
          },
        },
      }),
    ])
    expect(store.get(FAMILY)!.get('trip')!.start).toEqual({
      dateTime: '2026-10-09T09:00:00',
      timeZone: 'America/Chicago',
    })
  })

  it('refuses an end before the start, and asks Google nothing', async () => {
    await expect(
      changeEvent('alex', FAMILY, 'trip', 'this', {
        when: {
          allDay: true,
          startDate: '2026-10-09',
          startTime: null,
          endDate: '2026-10-09',
          endTime: null,
        },
      }),
    ).rejects.toThrow(/ends before/)
    expect(calls).toEqual([])
  })

  it("refuses someone else's invitation, and asks Google nothing more", async () => {
    put(WORK, {
      id: 'invite',
      summary: 'Quarterly review',
      start: { date: '2026-10-20' },
      organizer: {},
    })
    await expect(deleteEvent('alex', WORK, 'invite', 'this')).rejects.toThrow(
      /looked at/,
    )
    expect(writes()).toEqual([])
  })

  it('refuses an event on a calendar shared to view', async () => {
    await expect(
      changeEvent('alex', SCHOOL, 'break', 'this', { title: 'x' }),
    ).rejects.toThrow()
    expect(writes()).toEqual([])
  })

  it('changes one day of a series as that day alone', async () => {
    const day = saturday('2026-10-17').id
    expect(
      await changeEvent('alex', FAMILY, day, 'this', { place: 'Field 2' }),
    ).toEqual({ key: `${FAMILY} ${day}` })
    expect(writes()).toMatchObject([
      { method: 'PATCH', path: `/calendars/${FAMILY}/events/${day}` },
    ])
  })

  it('changes the whole series, moved by as many days as the day was', async () => {
    const day = saturday('2026-10-17').id
    await changeEvent('alex', FAMILY, day, 'all', {
      title: 'Soccer',
      when: {
        allDay: false,
        startDate: '2026-10-18',
        startTime: '10:00',
        endDate: '2026-10-18',
        endTime: '11:30',
      },
    })
    expect(writes()).toMatchObject([
      {
        method: 'PATCH',
        path: `/calendars/${FAMILY}/events/soccer`,
        body: {
          summary: 'Soccer',
          start: { dateTime: '2026-10-04T10:00:00' },
          end: { dateTime: '2026-10-04T11:30:00' },
        },
      },
    ])
  })

  it('splits the series for this day and the ones after it', async () => {
    const day = saturday('2026-10-17').id
    await changeEvent('alex', FAMILY, day, 'following', { title: 'Soccer' })
    const [ended, started] = writes()
    expect(ended).toMatchObject({
      method: 'PATCH',
      path: `/calendars/${FAMILY}/events/soccer`,
      body: {
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261017T135959Z'],
      },
    })
    // Two Saturdays came before: eight are left of ten.
    expect(started).toMatchObject({
      method: 'POST',
      path: `/calendars/${FAMILY}/events`,
      body: {
        summary: 'Soccer',
        start: { dateTime: '2026-10-17T09:00:00' },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=8'],
        attendees: [{ email: 'coach@example.com', responseStatus: 'accepted' }],
      },
    })
  })

  it('puts the series back when the new one cannot be made', async () => {
    const real = google()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) =>
        init?.method === 'POST' ? fail(500, 'backendError') : real(input, init),
      ),
    )
    await expect(
      changeEvent('alex', FAMILY, saturday('2026-10-17').id, 'following', {
        title: 'Soccer',
      }),
    ).rejects.toThrow()
    expect(store.get(FAMILY)!.get('soccer')!.recurrence).toEqual(
      soccer.recurrence,
    )
  })

  it('changes the whole series when "following" starts at its first day', async () => {
    await changeEvent('alex', FAMILY, saturday('2026-10-03').id, 'following', {
      title: 'Soccer',
    })
    expect(writes()).toMatchObject([
      { method: 'PATCH', path: `/calendars/${FAMILY}/events/soccer` },
    ])
  })
})

describe('moving an event to another calendar', () => {
  beforeEach(() => link([CALENDAR_SCOPE, ...READ_SCOPES]))

  it('moves it, and a repeating one as its whole series', async () => {
    expect(await moveEvent('alex', FAMILY, 'trip', WORK)).toEqual({
      key: `${WORK} trip`,
    })
    const day = saturday('2026-10-17').id
    expect(await moveEvent('alex', FAMILY, day, WORK)).toEqual({
      key: `${WORK} ${day}`,
    })
    expect(writes().map((call) => call.path)).toEqual([
      `/calendars/${FAMILY}/events/trip/move`,
      `/calendars/${FAMILY}/events/soccer/move`,
    ])
  })

  it('moves nothing to a calendar shared to view', async () => {
    await expect(moveEvent('alex', FAMILY, 'trip', SCHOOL)).rejects.toThrow()
    expect(writes()).toEqual([])
  })
})

describe('deleting an event', () => {
  beforeEach(() => link([CALENDAR_SCOPE, ...READ_SCOPES]))

  it('deletes the event, a day of a series, or the series', async () => {
    await deleteEvent('alex', FAMILY, 'trip', 'this')
    await deleteEvent('alex', FAMILY, saturday('2026-10-10').id, 'this')
    await deleteEvent('alex', FAMILY, saturday('2026-10-17').id, 'all')
    expect(writes().map((call) => `${call.method} ${call.path}`)).toEqual([
      `DELETE /calendars/${FAMILY}/events/trip`,
      `DELETE /calendars/${FAMILY}/events/${saturday('2026-10-10').id}`,
      `DELETE /calendars/${FAMILY}/events/soccer`,
    ])
  })

  it('ends the series before a day, for that day and the ones after', async () => {
    await deleteEvent('alex', FAMILY, saturday('2026-10-17').id, 'following')
    expect(writes()).toMatchObject([
      {
        method: 'PATCH',
        path: `/calendars/${FAMILY}/events/soccer`,
        body: {
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261017T135959Z'],
        },
      },
    ])
  })

  it('deletes nothing on a calendar shared to view', async () => {
    await expect(deleteEvent('alex', SCHOOL, 'break', 'this')).rejects.toThrow()
    expect(writes()).toEqual([])
  })
})
