// The sync, both ways, against a Google that lives in memory
// (./fake-google.ts) and the real migrations on SQLite (./test-db.ts).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { FakeGoogle } from './fake-google'
import { RevokedError } from './google'
import {
  CALENDAR_NAME,
  disconnect,
  renewChannels,
  runSync,
  syncHousehold,
  syncWanted,
  verifyPush,
} from './sync'
import { testDb } from './test-db'
import type { Todo } from '@/db/schema'
import type { CalendarApi } from './google'
import type { GoogleEvent } from './mapping'
import type { Db, SyncDeps } from './sync'

const TZ = 'America/Chicago'
const ADDRESS = 'https://todos.example/api/calendar/notify'

let clock: Date
let db: Db
let google: FakeGoogle
let deps: SyncDeps

/** Moves the clock on, so the next change on either side is later. */
const later = (minutes = 1) => {
  clock = new Date(clock.getTime() + minutes * 60_000)
}

beforeEach(() => {
  clock = new Date('2026-10-12T15:00:00.000Z')
  db = testDb()
  google = new FakeGoogle(() => clock)
  deps = {
    db,
    apiFor: (link) => google.apiFor(link.person),
    timeZone: TZ,
    appUrl: 'https://todos.example',
    people: ['alex', 'sam'],
    now: () => clock,
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function connect(person: string) {
  await db.insert(schema.calendarLinks).values({
    person,
    refreshToken: 'sealed',
    connectedAt: clock.toISOString(),
  })
}

async function addTodo(fields: Partial<Todo> & { title: string }) {
  const [made] = await db
    .insert(schema.items)
    .values({
      dueDate: '2026-10-15',
      createdAt: clock.toISOString(),
      updatedAt: clock.toISOString(),
      ...fields,
    })
    .returning()
  return made
}

/** A change in the app, as board.ts makes one. */
async function editTodo(id: number, patch: Partial<Todo>) {
  later()
  await db
    .update(schema.items)
    .set({ ...patch, updatedAt: clock.toISOString() })
    .where(eq(schema.items.id, id))
}

async function todo(id: number) {
  return (await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.id, id))
    .get())!
}

async function eventIdOf(person: string, itemId: number) {
  const rows = await db.select().from(schema.calendarEvents)
  return rows.find((r) => r.person === person && r.itemId === itemId)!.eventId
}

function calendarOf(person: string) {
  const calendar = google.calendarOf(person)
  if (!calendar) throw new Error(`${person} has no calendar`)
  return calendar
}

/** A pass with nothing to do reads each calendar once and writes nothing. */
async function expectQuiet() {
  google.calls.length = 0
  await syncHousehold(deps)
  expect(google.writes()).toEqual([])
}

describe('connecting', () => {
  it('makes a Todos calendar and puts every to-do with a deadline in it', async () => {
    await connect('alex')
    const dated = await addTodo({ title: 'Renew passports' })
    const timed = await addTodo({ title: 'Dentist', dueTime: '16:30' })
    await addTodo({ title: 'Someday', dueDate: null })
    await addTodo({ title: 'Gone', deletedAt: clock.toISOString() })
    await addTodo({ title: 'Long done', doneAt: '2026-08-01T00:00:00.000Z' })

    expect(await syncHousehold(deps)).toBe(true)

    const calendar = calendarOf('alex')
    expect(calendar.summary).toBe(CALENDAR_NAME)
    expect(calendar.timeZone).toBe(TZ)
    const events = google.visible(calendar.id)
    expect(events.map((e) => e.summary).sort()).toEqual([
      'Dentist',
      'Renew passports',
    ])
    expect(events.find((e) => e.summary === 'Dentist')!.start).toEqual({
      dateTime: '2026-10-15T16:30:00',
      timeZone: TZ,
    })
    expect(
      events.find((e) => e.summary === 'Renew passports')!.extendedProperties,
    ).toEqual({ private: { todosItem: String(dated.id) } })
    expect(timed.id).not.toBe(dated.id)

    const [link] = await db.select().from(schema.calendarLinks)
    expect(link.calendarId).toBe(calendar.id)
    expect(link.syncToken).not.toBeNull()
    expect(link.lastSyncedAt).toBe(clock.toISOString())
  })

  it('leaves alone a link whose person is no longer in the household', async () => {
    await connect('alex')
    await addTodo({ title: 'Renew passports' })
    deps.people = ['sam']
    expect(await runSync(deps)).toBe('idle')
    expect(google.calls).toEqual([])
  })
})

describe('a change in the app', () => {
  it('reaches the calendar: rename, reschedule, finish, delete', async () => {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    const calendar = calendarOf('alex')
    const eventId = await eventIdOf('alex', item.id)
    const event = () => calendar.events.get(eventId)!

    await editTodo(item.id, { title: 'Renew both passports' })
    await syncHousehold(deps)
    expect(event().summary).toBe('Renew both passports')

    await editTodo(item.id, { dueDate: '2026-10-20', dueTime: '09:00' })
    await syncHousehold(deps)
    expect(event().start).toEqual({
      dateTime: '2026-10-20T09:00:00',
      timeZone: TZ,
    })

    await editTodo(item.id, { doneAt: clock.toISOString(), doneBy: 'alex' })
    await syncHousehold(deps)
    expect(event().summary).toBe('✓ Renew both passports')

    await editTodo(item.id, { deletedAt: clock.toISOString() })
    await syncHousehold(deps)
    expect(event().status).toBe('cancelled')
    expect(await db.select().from(schema.calendarEvents)).toEqual([])
  })

  it('takes the event away when the to-do loses its deadline, and back when it gets one', async () => {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    await editTodo(item.id, { dueDate: null })
    await syncHousehold(deps)
    expect(google.visible(calendarOf('alex').id)).toEqual([])
    await editTodo(item.id, { dueDate: '2026-11-01' })
    await syncHousehold(deps)
    expect(google.visible(calendarOf('alex').id)).toMatchObject([
      { summary: 'Renew passports', start: { date: '2026-11-01' } },
    ])
  })

  it('writes nothing for a change no calendar shows', async () => {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    await editTodo(item.id, { assignee: 'sam', mustNotMiss: true })
    await expectQuiet()
  })
})

describe('echoes', () => {
  it("knows the app's own writes when they come back, and changes nothing", async () => {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    await editTodo(item.id, { title: 'Renew both passports' })
    await syncHousehold(deps)
    const before = await todo(item.id)

    // The next pass reads back the event the last one wrote.
    later()
    google.calls.length = 0
    await syncHousehold(deps)
    expect(google.calls).toEqual(['alex listEvents'])
    expect(await todo(item.id)).toEqual(before)
  })

  it('does not write back a change read from the calendar it came from', async () => {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    const calendar = calendarOf('alex')

    later()
    google
      .asPerson(calendar.id)
      .edit(await eventIdOf('alex', item.id), { summary: 'Passports' })
    google.calls.length = 0
    await syncHousehold(deps)
    expect((await todo(item.id)).title).toBe('Passports')
    expect(google.writes()).toEqual([])
    await expectQuiet()
  })
})

describe('a change in Google Calendar', () => {
  beforeEach(async () => {
    await connect('alex')
    await connect('sam')
  })

  it('reaches the list and the other calendar, and nothing else of the to-do', async () => {
    const item = await addTodo({
      title: 'Renew passports',
      tagId: null,
      assignee: 'sam',
      mustNotMiss: true,
    })
    await syncHousehold(deps)
    const alex = calendarOf('alex')

    later()
    google.asPerson(alex.id).edit(await eventIdOf('alex', item.id), {
      summary: '✓ Renew passports today',
      description: 'Took the <b>photos</b>',
      start: { dateTime: '2026-10-16T13:00:00-05:00' },
      end: { dateTime: '2026-10-16T14:00:00-05:00' },
    })
    await syncHousehold(deps)

    const changed = await todo(item.id)
    expect(changed).toMatchObject({
      title: 'Renew passports today',
      notes: 'Took the photos',
      dueDate: '2026-10-16',
      dueTime: '13:00',
      doneBy: 'alex',
      doneAt: clock.toISOString(),
      updatedAt: clock.toISOString(),
      assignee: 'sam',
      mustNotMiss: true,
    })
    const samEvent = calendarOf('sam').events.get(
      await eventIdOf('sam', item.id),
    )!
    expect(samEvent.summary).toBe('✓ Renew passports today')
    expect(samEvent.start).toEqual({
      dateTime: '2026-10-16T13:00:00',
      timeZone: TZ,
    })
    await expectQuiet()
  })

  it('deletes the to-do when its event is deleted, everywhere', async () => {
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    const samEventId = await eventIdOf('sam', item.id)

    later()
    google
      .asPerson(calendarOf('alex').id)
      .delete(await eventIdOf('alex', item.id))
    await syncHousehold(deps)

    expect((await todo(item.id)).deletedAt).toBe(clock.toISOString())
    expect(calendarOf('sam').events.get(samEventId)!.status).toBe('cancelled')
    expect(await db.select().from(schema.calendarEvents)).toEqual([])
    await expectQuiet()
  })

  it('makes a to-do of an event made in the Todos calendar', async () => {
    await syncHousehold(deps)
    const alex = calendarOf('alex')
    later()
    google.asPerson(alex.id).create({
      summary: 'Call the plumber',
      start: { date: '2026-10-18' },
      end: { date: '2026-10-19' },
    })
    // Untouched by the sync: events that repeat.
    google.asPerson(alex.id).create({
      summary: 'Bins',
      start: { date: '2026-10-18' },
      recurrence: ['RRULE:FREQ=WEEKLY'],
    })
    await syncHousehold(deps)

    const items = await db.select().from(schema.items)
    expect(items).toMatchObject([
      {
        title: 'Call the plumber',
        dueDate: '2026-10-18',
        dueTime: null,
        assignee: null,
        createdBy: 'alex',
      },
    ])
    expect(google.visible(calendarOf('sam').id)).toMatchObject([
      { summary: 'Call the plumber', start: { date: '2026-10-18' } },
    ])
    // Alex's own event is the to-do's; no copy is written next to it.
    expect(
      google
        .visible(alex.id)
        .map((e) => e.summary)
        .sort(),
    ).toEqual(['Bins', 'Call the plumber'])
    await expectQuiet()
  })

  it('takes back its own event when it lost its record of it', async () => {
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    await db.delete(schema.calendarEvents)
    await db
      .update(schema.calendarLinks)
      .set({ syncToken: null })
      .where(eq(schema.calendarLinks.person, 'alex'))

    await syncHousehold(deps)
    expect(await db.select().from(schema.items)).toHaveLength(1)
    // Sam's event was not read again, so a fresh one stands in for it.
    expect(google.visible(calendarOf('alex').id)).toHaveLength(1)
    expect(await eventIdOf('alex', item.id)).toBeDefined()
  })
})

describe('what an event cannot say word for word', () => {
  beforeEach(() => connect('alex'))

  async function editEvent(itemId: number, body: Partial<GoogleEvent>) {
    later()
    google
      .asPerson(calendarOf('alex').id)
      .edit(await eventIdOf('alex', itemId), body)
  }

  it('keeps a title that starts like a done mark when the event moves', async () => {
    const item = await addTodo({ title: '[x] list' })
    const packing = await addTodo({ title: '✅ Packing' })
    await syncHousehold(deps)

    await editEvent(item.id, {
      start: { date: '2026-10-16' },
      end: { date: '2026-10-17' },
    })
    // Nothing the list shows: a colour, a reminder.
    await editEvent(packing.id, {})
    await syncHousehold(deps)

    expect(await todo(item.id)).toMatchObject({
      title: '[x] list',
      doneAt: null,
      dueDate: '2026-10-16',
    })
    expect(await todo(packing.id)).toMatchObject({
      title: '✅ Packing',
      doneAt: null,
      dueDate: '2026-10-15',
    })
    await expectQuiet()
  })

  it('keeps notes that look like a tag when the event changes', async () => {
    const item = await addTodo({
      title: 'Read',
      notes: 'see <https://example.com>',
    })
    await syncHousehold(deps)

    await editEvent(item.id, {})
    await syncHousehold(deps)
    await editEvent(item.id, { summary: 'Read it' })
    await syncHousehold(deps)

    expect(await todo(item.id)).toMatchObject({
      title: 'Read it',
      notes: 'see <https://example.com>',
    })
    await expectQuiet()
  })

  it('keeps them when it takes back its own event', async () => {
    const item = await addTodo({
      title: '[x] list',
      notes: 'see <https://example.com>',
    })
    await syncHousehold(deps)
    await db.delete(schema.calendarEvents)
    await db
      .update(schema.calendarLinks)
      .set({ syncToken: null })
      .where(eq(schema.calendarLinks.person, 'alex'))

    await syncHousehold(deps)
    expect(await todo(item.id)).toMatchObject({
      title: '[x] list',
      notes: 'see <https://example.com>',
      doneAt: null,
    })
  })
})

describe('when both sides changed', () => {
  async function setUp() {
    await connect('alex')
    const item = await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    return {
      item,
      edit: async (summary: string) => {
        later()
        google
          .asPerson(calendarOf('alex').id)
          .edit(await eventIdOf('alex', item.id), { summary })
      },
      event: async () =>
        calendarOf('alex').events.get(await eventIdOf('alex', item.id))!,
    }
  }

  it('keeps the calendar change when it came last', async () => {
    const { item, edit, event } = await setUp()
    await editTodo(item.id, { title: 'In the app' })
    await edit('In the calendar')
    await syncHousehold(deps)
    expect((await todo(item.id)).title).toBe('In the calendar')
    expect((await event()).summary).toBe('In the calendar')
    await expectQuiet()
  })

  it('keeps the app change when it came last', async () => {
    const { item, edit, event } = await setUp()
    await edit('In the calendar')
    await editTodo(item.id, { title: 'In the app' })
    await syncHousehold(deps)
    expect((await todo(item.id)).title).toBe('In the app')
    expect((await event()).summary).toBe('In the app')
    await expectQuiet()
  })

  it('keeps a to-do changed after its event was deleted', async () => {
    const { item } = await setUp()
    later()
    google
      .asPerson(calendarOf('alex').id)
      .delete(await eventIdOf('alex', item.id))
    await editTodo(item.id, { title: 'Still wanted' })
    await syncHousehold(deps)
    expect((await todo(item.id)).deletedAt).toBeNull()
    expect(google.visible(calendarOf('alex').id)).toMatchObject([
      { summary: 'Still wanted' },
    ])
  })

  it('brings back a to-do deleted in the app when its event changed later', async () => {
    const { item, edit } = await setUp()
    await editTodo(item.id, { deletedAt: clock.toISOString() })
    await edit('Not done with this')
    await syncHousehold(deps)
    expect(await todo(item.id)).toMatchObject({
      deletedAt: null,
      title: 'Not done with this',
    })
  })
})

describe('incremental sync', () => {
  it('asks only for what changed since the last pass, page by page', async () => {
    await connect('alex')
    for (let i = 1; i <= 5; i++) await addTodo({ title: `To-do ${i}` })
    await syncHousehold(deps)
    // Reads back the five events it wrote, and is then up to date.
    await syncHousehold(deps)
    const calendar = calendarOf('alex')
    google.pageSize = 2

    later()
    const [first, second] = google.visible(calendar.id)
    google.asPerson(calendar.id).edit(first.id, { summary: 'Changed 1' })
    google.asPerson(calendar.id).edit(second.id, { summary: 'Changed 2' })
    google.asPerson(calendar.id).create({
      summary: 'New one',
      start: { date: '2026-10-20' },
    })
    google.calls.length = 0
    await syncHousehold(deps)

    // Three changes, two to a page: two pages, and nothing written back.
    expect(google.calls).toEqual(['alex listEvents', 'alex listEvents'])
    const titles = (await db.select().from(schema.items)).map((i) => i.title)
    expect(titles).toEqual(
      expect.arrayContaining(['Changed 1', 'Changed 2', 'New one']),
    )
    expect(titles).toHaveLength(6)
  })

  it('reads the whole calendar again when Google forgets its place, without copies', async () => {
    await connect('alex')
    await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    const [link] = await db.select().from(schema.calendarLinks)
    google.forgotten.add(link.syncToken!)
    later()
    google.asPerson(calendarOf('alex').id).create({
      summary: 'Call the plumber',
      start: { date: '2026-10-18' },
    })

    expect(await syncHousehold(deps)).toBe(true)
    const titles = (await db.select().from(schema.items)).map((i) => i.title)
    expect(titles.sort()).toEqual(['Call the plumber', 'Renew passports'])
    expect(google.visible(calendarOf('alex').id)).toHaveLength(2)
    await expectQuiet()
  })
})

describe('passes', () => {
  it('carries on where a pass that ran out of requests stopped', async () => {
    await connect('alex')
    for (let i = 1; i <= 6; i++) await addTodo({ title: `To-do ${i}` })
    google.budget = 4
    expect(await runSync(deps)).toBe('ran')
    expect(await syncWanted(db)).toBe(true)
    expect(google.visible(calendarOf('alex').id).length).toBeLessThan(6)

    google.budget = Number.POSITIVE_INFINITY
    expect(await runSync(deps)).toBe('ran')
    expect(await syncWanted(db)).toBe(false)
    expect(google.visible(calendarOf('alex').id)).toHaveLength(6)
    await expectQuiet()
  })

  it('runs one pass at a time, and leaves a request for the one running', async () => {
    await connect('alex')
    await addTodo({ title: 'Renew passports' })
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const slow: SyncDeps = {
      ...deps,
      apiFor: (link) => {
        const api = google.apiFor(link.person)
        return {
          ...api,
          listEvents: async (...args) => {
            await held
            return api.listEvents(...args)
          },
        } satisfies CalendarApi
      },
    }
    const first = runSync(slow)
    await vi.waitFor(async () =>
      expect(
        await db
          .select()
          .from(schema.meta)
          .where(eq(schema.meta.key, 'calendar_sync_lease'))
          .get(),
      ).toBeDefined(),
    )
    expect(await runSync(deps)).toBe('busy')
    expect(await syncWanted(db)).toBe(true)
    release()
    expect(await first).toBe('ran')
    // The running pass saw the request and went round again.
    expect(await syncWanted(db)).toBe(false)
    expect(google.visible(calendarOf('alex').id)).toHaveLength(1)
  })

  it('stops a pass whose lease was taken over, without copies of events', async () => {
    await connect('alex')
    const gone = await addTodo({ title: 'Cancelled', dueDate: '2026-10-14' })
    await syncHousehold(deps)
    await editTodo(gone.id, { deletedAt: clock.toISOString() })
    await addTodo({ title: 'Renew passports' })

    // The first pass stalls on a request until its lease has run out, and
    // another pass takes over and does the work meanwhile.
    let stalled = false
    const slow: SyncDeps = {
      ...deps,
      apiFor: (link) => {
        const api = google.apiFor(link.person)
        return {
          ...api,
          deleteEvent: async (...args) => {
            if (!stalled) {
              stalled = true
              later(3)
              expect(await runSync(deps)).toBe('ran')
            }
            return api.deleteEvent(...args)
          },
        } satisfies CalendarApi
      },
    }
    expect(await runSync(slow)).toBe('ran')

    expect(stalled).toBe(true)
    expect(google.visible(calendarOf('alex').id).map((e) => e.summary)).toEqual(
      ['Renew passports'],
    )
    await expectQuiet()
  })

  it('takes over a lease whose holder is long gone', async () => {
    await connect('alex')
    await db.insert(schema.meta).values({
      key: 'calendar_sync_lease',
      value: '2026-10-12T14:00:00.000Z stale',
    })
    expect(await runSync(deps)).toBe('ran')
  })
})

describe('when Google shuts a calendar', () => {
  it('marks a link whose access was withdrawn, and still syncs the others', async () => {
    await connect('alex')
    await connect('sam')
    await addTodo({ title: 'Renew passports' })
    deps.apiFor = (link) =>
      link.person === 'alex'
        ? {
            ...google.apiFor('alex'),
            insertCalendar: () => Promise.reject(new RevokedError()),
          }
        : google.apiFor(link.person)
    await syncHousehold(deps)
    const links = await db.select().from(schema.calendarLinks)
    expect(links.find((l) => l.person === 'alex')!.problem).toBe('revoked')
    expect(links.find((l) => l.person === 'sam')!.problem).toBeNull()
    expect(google.visible(calendarOf('sam').id)).toHaveLength(1)
  })

  it('marks a link whose Todos calendar was deleted', async () => {
    await connect('alex')
    await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    google.calendars.delete(calendarOf('alex').id)
    await syncHousehold(deps)
    const [link] = await db.select().from(schema.calendarLinks)
    expect(link.problem).toBe('calendar_gone')
    expect((await db.select().from(schema.items))[0].deletedAt).toBeNull()
  })
})

describe('push channels', () => {
  async function opened() {
    await connect('alex')
    await syncHousehold(deps)
    await renewChannels(deps, ADDRESS)
    const [channel] = google.channels.values()
    return channel
  }
  const headers = (fields: Record<string, string>) => new Headers(fields)

  it('opens one per calendar, at the given address', async () => {
    const channel = await opened()
    expect(channel).toMatchObject({
      address: ADDRESS,
      calendarId: calendarOf('alex').id,
      ttlSeconds: 7 * 24 * 60 * 60,
    })
    const [link] = await db.select().from(schema.calendarLinks)
    expect(link.channelId).toBe(channel.id)
    // Only a hash of the token is kept.
    expect(link.channelTokenHash).not.toContain(channel.token)
  })

  it('accepts a push only from the channel it opened', async () => {
    const channel = await opened()
    const good = {
      'X-Goog-Channel-ID': channel.id,
      'X-Goog-Channel-Token': channel.token,
      'X-Goog-Resource-ID': channel.resourceId,
      'X-Goog-Resource-State': 'exists',
    }
    expect(await verifyPush(db, headers(good))).toEqual({
      person: 'alex',
      state: 'exists',
    })
    for (const bad of [
      { 'X-Goog-Channel-Token': `${channel.token}x` },
      { 'X-Goog-Channel-Token': '' },
      { 'X-Goog-Resource-ID': 'resource-of-something-else' },
      { 'X-Goog-Channel-ID': crypto.randomUUID() },
    ]) {
      expect(await verifyPush(db, headers({ ...good, ...bad }))).toBeNull()
    }
    const { ['X-Goog-Channel-Token']: _, ...tokenless } = good
    expect(await verifyPush(db, headers(tokenless))).toBeNull()
  })

  it('replaces a channel near its end, and closes the old one', async () => {
    const old = await opened()
    clock = new Date(clock.getTime() + 2 * 86_400_000)
    await renewChannels(deps, ADDRESS)
    expect(google.channels.size).toBe(1)

    clock = new Date(clock.getTime() + 4.5 * 86_400_000)
    await renewChannels(deps, ADDRESS)
    expect(google.channels.size).toBe(2)
    expect(google.channels.get(old.id)!.stopped).toBe(true)
    const [link] = await db.select().from(schema.calendarLinks)
    expect(link.channelId).not.toBe(old.id)
    const fresh = google.channels.get(link.channelId!)!
    expect(
      await verifyPush(
        db,
        headers({
          'X-Goog-Channel-ID': old.id,
          'X-Goog-Channel-Token': old.token,
          'X-Goog-Resource-ID': old.resourceId,
        }),
      ),
    ).toBeNull()
    expect(fresh.stopped).toBe(false)
  })
})

describe('disconnecting', () => {
  it('closes the channel, deletes the calendar, withdraws access, and keeps the to-dos', async () => {
    await connect('alex')
    await connect('sam')
    await addTodo({ title: 'Renew passports' })
    await syncHousehold(deps)
    await renewChannels(deps, ADDRESS)
    const alexCalendar = calendarOf('alex').id
    const withdraw = vi.fn(async () => {})

    await disconnect(deps, 'alex', withdraw)

    expect(withdraw).toHaveBeenCalledOnce()
    expect(google.calendars.has(alexCalendar)).toBe(false)
    const alexChannel = [...google.channels.values()].find(
      (c) => c.calendarId === alexCalendar,
    )!
    expect(alexChannel.stopped).toBe(true)
    const links = await db.select().from(schema.calendarLinks)
    expect(links.map((l) => l.person)).toEqual(['sam'])
    const rows = await db.select().from(schema.calendarEvents)
    expect(rows.map((r) => r.person)).toEqual(['sam'])
    expect(await db.select().from(schema.items)).toHaveLength(1)
  })

  it('forgets the link even when Google no longer answers for it', async () => {
    await connect('alex')
    await syncHousehold(deps)
    deps.apiFor = () => ({
      ...google.apiFor('alex'),
      deleteCalendar: () => Promise.reject(new RevokedError()),
    })
    await disconnect(deps, 'alex', () => Promise.reject(new Error('offline')))
    expect(await db.select().from(schema.calendarLinks)).toEqual([])
  })
})
