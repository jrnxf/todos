// Reading a person's other calendars, against the app's own migrations in
// SQLite and a stand-in for Google's two read-only calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import {
  CALENDAR_SCOPE,
  EVENTS_READ_SCOPE,
  LIST_SCOPE,
  READ_SCOPES,
} from './google'
import { testDb } from './test-db'
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

const { eventsBetween, listCalendars, showCalendar, MAX_SHOWN } =
  await import('./read')

const TODOS = 'todos-cal@group.calendar.google.com'

const CALENDARS = [
  {
    id: 'kids@group.calendar.google.com',
    summary: 'Kids',
    backgroundColor: '#f6bf26',
    accessRole: 'reader',
  },
  { id: TODOS, summary: 'Todos', backgroundColor: '#16a765' },
  {
    id: 'alex@example.com',
    summary: 'alex@example.com',
    summaryOverride: 'Alex',
    backgroundColor: '#7986cb',
    primary: true,
    accessRole: 'owner',
  },
  {
    id: 'gone@group.calendar.google.com',
    summary: 'Gone',
    accessRole: 'writer',
  },
]

/** What Google is asked, and what it answers. */
let asked: Array<URL>
function google(
  events: Record<string, Array<unknown> | number | [number, string]>,
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    asked.push(url)
    if (url.pathname.endsWith('/users/me/calendarList')) {
      return Response.json({ items: CALENDARS })
    }
    const id = decodeURIComponent(url.pathname.split('/')[4])
    const reply = events[id] ?? []
    if (!Array.isArray(reply) || typeof reply[0] === 'number') {
      const [status, reason] = Array.isArray(reply)
        ? (reply as [number, string])
        : [reply, 'notFound']
      return Response.json(
        { error: { message: reason, errors: [{ reason }] } },
        { status },
      )
    }
    return Response.json({ items: reply })
  })
}

async function link(
  db: Db,
  scopes: Array<string>,
  problem: 'revoked' | null = null,
) {
  await db.insert(schema.calendarLinks).values({
    person: 'alex',
    refreshToken: 'sealed',
    calendarId: TODOS,
    scopes: scopes.join(' '),
    problem,
    connectedAt: '2026-10-01T00:00:00.000Z',
  })
}

beforeEach(() => {
  state.db = testDb()
  asked = []
})
afterEach(() => vi.unstubAllGlobals())

const db = () => state.db!

describe('choosing calendars to show', () => {
  it("lists the person's calendars without the Todos one, theirs first", async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    await db().insert(schema.calendarsShown).values({
      person: 'alex',
      calendarId: 'kids@group.calendar.google.com',
    })
    vi.stubGlobal('fetch', google({}))
    expect(await listCalendars('alex')).toEqual([
      {
        id: 'alex@example.com',
        name: 'Alex',
        color: '#7986cb',
        primary: true,
        writable: true,
        shown: false,
      },
      {
        id: 'gone@group.calendar.google.com',
        name: 'Gone',
        color: '#9e9e9e',
        primary: false,
        writable: true,
        shown: false,
      },
      {
        id: 'kids@group.calendar.google.com',
        name: 'Kids',
        color: '#f6bf26',
        primary: false,
        writable: false,
        shown: true,
      },
    ])
    expect(asked[0].searchParams.get('minAccessRole')).toBe('reader')
  })

  it('still reads for a person who gave reading alone, before editing', async () => {
    await link(db(), [CALENDAR_SCOPE, LIST_SCOPE, EVENTS_READ_SCOPE])
    vi.stubGlobal('fetch', google({}))
    expect(await listCalendars('alex')).toHaveLength(3)
  })

  it('asks Google nothing for a link that was never let read', async () => {
    await link(db(), [CALENDAR_SCOPE])
    vi.stubGlobal('fetch', google({}))
    expect(await listCalendars('alex')).toEqual([])
    await expect(
      showCalendar('alex', 'alex@example.com', true),
    ).rejects.toThrow()
    expect(asked).toEqual([])
  })

  it('remembers a choice once, and forgets it', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    await showCalendar('alex', 'alex@example.com', true)
    await showCalendar('alex', 'alex@example.com', true)
    expect(await db().select().from(schema.calendarsShown)).toHaveLength(1)
    await showCalendar('alex', 'alex@example.com', false)
    expect(await db().select().from(schema.calendarsShown)).toHaveLength(0)
  })

  it(`shows ${MAX_SHOWN} calendars at most`, async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    for (let n = 0; n < MAX_SHOWN; n++) {
      await showCalendar('alex', `cal-${n}`, true)
    }
    await expect(showCalendar('alex', 'one-more', true)).rejects.toThrow()
  })

  it('forgets shown calendars Google no longer lists', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    for (let n = 0; n < MAX_SHOWN - 1; n++) {
      await db()
        .insert(schema.calendarsShown)
        .values({ person: 'alex', calendarId: `unsubscribed-${n}` })
    }
    await showCalendar('alex', 'kids@group.calendar.google.com', true)
    vi.stubGlobal('fetch', google({}))
    const listed = await listCalendars('alex')
    expect(listed.filter((calendar) => calendar.shown)).toMatchObject([
      { id: 'kids@group.calendar.google.com' },
    ])
    expect(await db().select().from(schema.calendarsShown)).toEqual([
      { person: 'alex', calendarId: 'kids@group.calendar.google.com' },
    ])
    await showCalendar('alex', 'alex@example.com', true)
    await showCalendar('alex', 'gone@group.calendar.google.com', true)
  })
})

describe("reading the shown calendars' events", () => {
  it('asks Google nothing until a calendar is shown', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    vi.stubGlobal('fetch', google({}))
    expect(await eventsBetween('alex', '2026-09-27', '2026-11-07')).toEqual([])
    expect(asked).toEqual([])
  })

  it('reads only the shown calendars, over a day more each side', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    for (const id of [
      'alex@example.com',
      'gone@group.calendar.google.com',
      TODOS,
    ]) {
      await db()
        .insert(schema.calendarsShown)
        .values({ person: 'alex', calendarId: id })
    }
    vi.stubGlobal(
      'fetch',
      google({
        'alex@example.com': [
          {
            id: 'a',
            summary: 'Dentist',
            start: { dateTime: '2026-10-20T14:00:00Z' },
            end: { dateTime: '2026-10-20T15:00:00Z' },
          },
          { id: 'b', status: 'cancelled', start: { date: '2026-10-21' } },
        ],
        'gone@group.calendar.google.com': 404,
      }),
    )
    const events = await eventsBetween('alex', '2026-09-27', '2026-11-07')
    expect(events).toMatchObject([
      {
        key: 'alex@example.com a',
        title: 'Dentist',
        calendar: 'Alex',
        startTime: '09:00',
      },
    ])
    const reads = asked.filter((url) => url.pathname.endsWith('/events'))
    // The Todos calendar is the to-dos themselves, and is never read here.
    expect(
      reads.map((url) => decodeURIComponent(url.pathname.split('/')[4])),
    ).toEqual(['alex@example.com', 'gone@group.calendar.google.com'])
    expect(Object.fromEntries(reads[0].searchParams)).toMatchObject({
      timeMin: '2026-09-26T00:00:00Z',
      timeMax: '2026-11-09T00:00:00Z',
      singleEvents: 'true',
      timeZone: 'America/Chicago',
    })
    expect(reads[0].searchParams.get('fields')).not.toMatch(
      /description|location/,
    )
  })

  it('fails the read while Google limits requests', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES])
    for (const id of ['alex@example.com', 'kids@group.calendar.google.com']) {
      await db()
        .insert(schema.calendarsShown)
        .values({ person: 'alex', calendarId: id })
    }
    vi.stubGlobal(
      'fetch',
      google({
        'alex@example.com': [403, 'rateLimitExceeded'],
        'kids@group.calendar.google.com': [403, 'forbidden'],
      }),
    )
    await expect(
      eventsBetween('alex', '2026-09-27', '2026-11-07'),
    ).rejects.toThrow(/rateLimitExceeded/)
    vi.stubGlobal(
      'fetch',
      google({
        'alex@example.com': [],
        'kids@group.calendar.google.com': [403, 'forbidden'],
      }),
    )
    expect(await eventsBetween('alex', '2026-09-27', '2026-11-07')).toEqual([])
  })

  it('shows nothing while the link has a problem', async () => {
    await link(db(), [CALENDAR_SCOPE, ...READ_SCOPES], 'revoked')
    await db()
      .insert(schema.calendarsShown)
      .values({ person: 'alex', calendarId: 'alex@example.com' })
    vi.stubGlobal('fetch', google({}))
    expect(await eventsBetween('alex', '2026-09-27', '2026-11-07')).toEqual([])
    expect(asked).toEqual([])
  })
})
