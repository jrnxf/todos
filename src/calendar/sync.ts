// Keeping the list and each connected person's Todos calendar in step, both
// ways. One pass reads what changed in every calendar since the last pass
// (Google's sync token), applies it to the list, then writes every to-do
// whose event no longer says what the to-do does.
//
// - A change on one side is a change because it differs from the content
//   last written to both (`calendar_events.hash`). When both sides changed
//   since then, the later change wins: the to-do's `updated_at` against the
//   event's `updated`.
// - The app's own writes come back from Google on the next read. Each event
//   row holds the etag Google gave the app's last write or read of it, so
//   those are known and skipped, and nothing bounces back and forth.
// - One pass at a time for the whole household, held by a lease in `meta`.
//   A request for a pass while one runs is left as a flag the running pass
//   picks up, or the next minute's cron does.
//
// Nothing here reads the environment or the request: src/calendar/run.ts
// wires it to D1 and Google, and sync.test.ts to a fake Google and SQLite.
import { and, eq, isNull, lt } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { BudgetSpent, GoogleError, RevokedError } from './google'
import {
  ITEM_PROPERTY,
  belongsInCalendar,
  contentFromEvent,
  contentHash,
  contentOf,
  eventBody,
} from './mapping'
import { hashToken, matchesHash, randomToken } from './seal'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { CalendarEvent, CalendarLink, Todo } from '@/db/schema'
import type { CalendarApi } from './google'
import type { GoogleEvent } from './mapping'

export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>

export interface SyncDeps {
  db: Db
  /** The Calendar API as the person a link belongs to. */
  apiFor: (link: CalendarLink) => CalendarApi
  timeZone: string
  appUrl: string
  /** The household's people ids. A link for anyone else is left alone. */
  people: Array<string>
  now: () => Date
}

export const CALENDAR_NAME = 'Todos'

const LEASE = 'calendar_sync_lease'
const WANTED = 'calendar_sync_wanted'
const LEASE_MS = 2 * 60_000
/** Passes one holder of the lease runs while more is asked of it. */
const ROUNDS = 3
/** How long Google is asked to keep a push channel open. */
const CHANNEL_TTL_SECONDS = 7 * 24 * 60 * 60
/** A channel this close to its end is replaced. */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000

const { calendarEvents, calendarLinks, items, meta } = schema

/**
 * Runs passes until nobody wants another, unless a pass is already running,
 * in which case that one is asked to go again. 'idle' when nobody has a
 * calendar connected.
 */
export async function runSync(
  deps: SyncDeps,
): Promise<'ran' | 'busy' | 'idle'> {
  const { db } = deps
  if ((await activeLinks(deps)).length === 0) return 'idle'
  await setMeta(db, WANTED, '1')
  const lease = await claimLease(deps)
  if (!lease) return 'busy'
  try {
    for (let round = 0; round < ROUNDS; round++) {
      if ((await getMeta(db, WANTED)) !== '1') break
      await setMeta(db, WANTED, '0')
      if (!(await syncHousehold(deps))) {
        // Out of requests: the next minute's cron carries on.
        await setMeta(db, WANTED, '1')
        break
      }
    }
  } finally {
    await db.delete(meta).where(and(eq(meta.key, LEASE), eq(meta.value, lease)))
  }
  return 'ran'
}

/** Whether a pass was asked for and not yet run. */
export async function syncWanted(db: Db): Promise<boolean> {
  return (await getMeta(db, WANTED)) === '1'
}

/**
 * One pass over every connected calendar: read all of them, then write all
 * of them, so a change read from one calendar reaches the others in the same
 * pass. False when it ran out of requests before the end.
 */
export async function syncHousehold(deps: SyncDeps): Promise<boolean> {
  const failed = new Set<string>()
  try {
    for (const link of await activeLinks(deps)) {
      await guarded(deps, link, failed, () => pull(deps, link))
    }
    for (const link of await activeLinks(deps)) {
      if (failed.has(link.person) || !link.calendarId) continue
      await guarded(deps, link, failed, () => push(deps, link))
    }
  } catch (error) {
    if (error instanceof BudgetSpent) return false
    throw error
  }
  const at = deps.now().toISOString()
  for (const link of await activeLinks(deps)) {
    if (failed.has(link.person)) continue
    await deps.db
      .update(calendarLinks)
      .set({ lastSyncedAt: at })
      .where(eq(calendarLinks.person, link.person))
  }
  return true
}

/**
 * Runs one link's part of a pass. A link Google has shut is marked so and
 * left until its person connects again; any other failure is logged and
 * tried again next pass, without holding up anyone else's calendar.
 */
async function guarded(
  deps: SyncDeps,
  link: CalendarLink,
  failed: Set<string>,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work()
  } catch (error) {
    if (error instanceof BudgetSpent) throw error
    failed.add(link.person)
    if (error instanceof RevokedError) {
      await setProblem(deps.db, link.person, 'revoked')
    } else if (error instanceof GoogleError && error.status === 404) {
      // Only the calendar itself answers 404 here; a missing event is
      // handled where it is met.
      await setProblem(deps.db, link.person, 'calendar_gone')
    } else {
      console.error(`[calendar] sync for ${link.person} failed:`, error)
    }
  }
}

/** Reads what changed in a person's calendar and applies it to the list. */
async function pull(deps: SyncDeps, link: CalendarLink): Promise<void> {
  const api = deps.apiFor(link)
  const calendarId = await ensureCalendar(deps, link, api)
  let syncToken = link.syncToken
  let pageToken: string | null = null
  const seen = new Set<string>()
  for (;;) {
    let page
    try {
      page = await api.listEvents(calendarId, { syncToken, pageToken })
    } catch (error) {
      // Google forgot the token: read the whole calendar again.
      if (error instanceof GoogleError && error.status === 410 && syncToken) {
        syncToken = null
        pageToken = null
        seen.clear()
        continue
      }
      throw error
    }
    for (const event of page.items) {
      seen.add(event.id)
      await applyEvent(deps, link.person, event)
    }
    if (page.nextPageToken) {
      pageToken = page.nextPageToken
      continue
    }
    if (syncToken === null) await forgetMissing(deps.db, link.person, seen)
    link.syncToken = page.nextSyncToken ?? null
    await deps.db
      .update(calendarLinks)
      .set({ syncToken: link.syncToken })
      .where(eq(calendarLinks.person, link.person))
    return
  }
}

/** The person's Todos calendar, made on the first pass after connecting. */
async function ensureCalendar(
  deps: SyncDeps,
  link: CalendarLink,
  api: CalendarApi,
): Promise<string> {
  if (link.calendarId) return link.calendarId
  const made = await api.insertCalendar({
    summary: CALENDAR_NAME,
    description: `To-dos with a deadline, kept in step with ${deps.appUrl}. An event made here becomes a to-do there.`,
    timeZone: deps.timeZone,
  })
  link.calendarId = made.id
  link.syncToken = null
  await deps.db
    .update(calendarLinks)
    .set({ calendarId: made.id, syncToken: null })
    .where(eq(calendarLinks.person, link.person))
  return made.id
}

/**
 * After reading a whole calendar: an event the app made that is not there at
 * all any more has its record dropped, and the next write makes it again.
 * Read whole only when Google forgot its place, so nothing is assumed
 * deleted that may not have been.
 */
async function forgetMissing(
  db: Db,
  person: string,
  seen: Set<string>,
): Promise<void> {
  const known = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.person, person))
  for (const row of known) {
    if (!seen.has(row.eventId)) await dropEvent(db, row)
  }
}

/** Applies one event read from a person's calendar to the list. */
async function applyEvent(
  deps: SyncDeps,
  person: string,
  event: GoogleEvent,
): Promise<void> {
  const { db } = deps
  // A repeating event is many to-dos at once, which the list cannot hold.
  if (event.recurringEventId) return
  const row = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.person, person),
        eq(calendarEvents.eventId, event.id),
      ),
    )
    .get()

  if (!row) return adopt(deps, person, event)
  // The app's own write, or a version already read.
  if (row.etag === event.etag) return

  const item = await db
    .select()
    .from(items)
    .where(eq(items.id, row.itemId))
    .get()
  if (!item) return dropEvent(db, row)

  const itemHash = belongsInCalendar(item, true, deps.now())
    ? await contentHash(contentOf(item))
    : null
  const changedHere = itemHash !== row.hash
  const hereIsLater = changedHere && later(item.updatedAt, event.updated)

  if (event.status === 'cancelled') {
    // Gone from the calendar. The record goes either way: if the to-do
    // stays, the next write makes it a new event.
    await dropEvent(db, row)
    if (itemHash === null || hereIsLater) return
    await db
      .update(items)
      .set({
        deletedAt: deps.now().toISOString(),
        updatedAt: stamp(event, deps),
      })
      .where(eq(items.id, item.id))
    return
  }

  const content = event.recurrence
    ? null
    : contentFromEvent(event, deps.timeZone)
  if (!content) {
    // Turned into something the list cannot hold: the to-do wins.
    await keepEtag(db, row, event.etag)
    return
  }
  const eventHash = await contentHash(content)
  if (eventHash === itemHash || hereIsLater) {
    // Same content either way, or the to-do changed last and the next write
    // overwrites the event. Either way, this version has been read.
    await db
      .update(calendarEvents)
      .set({
        etag: event.etag,
        ...(eventHash === itemHash ? { hash: eventHash } : {}),
      })
      .where(
        and(
          eq(calendarEvents.person, person),
          eq(calendarEvents.itemId, item.id),
        ),
      )
    return
  }

  await db
    .update(items)
    .set({
      title: content.title,
      notes: content.notes,
      dueDate: content.dueDate,
      dueTime: content.dueTime,
      ...doneChange(item, content.done, person, event, deps),
      deletedAt: null,
      updatedAt: stamp(event, deps),
    })
    .where(eq(items.id, item.id))
  await db
    .update(calendarEvents)
    .set({ etag: event.etag, hash: eventHash })
    .where(
      and(
        eq(calendarEvents.person, person),
        eq(calendarEvents.itemId, item.id),
      ),
    )
}

/**
 * An event the app has no record of: made in the Todos calendar by hand, so
 * it becomes a to-do. One the app made itself and lost its record of (it
 * names its to-do) is taken back instead of copied.
 */
async function adopt(
  deps: SyncDeps,
  person: string,
  event: GoogleEvent,
): Promise<void> {
  const { db } = deps
  if (event.status === 'cancelled' || event.recurrence) return
  const content = contentFromEvent(event, deps.timeZone)
  if (!content) return
  const hash = await contentHash(content)

  const named = Number(event.extendedProperties?.private?.[ITEM_PROPERTY])
  if (Number.isInteger(named)) {
    const item = await db.select().from(items).where(eq(items.id, named)).get()
    const taken = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.person, person),
          eq(calendarEvents.itemId, named),
        ),
      )
      .get()
    // A second event for a to-do that has one is a stray copy of the app's
    // own, not a new to-do.
    if (item && taken) return
    if (item) {
      // Recorded with the to-do's own content, so the event's differences
      // are applied the usual way.
      const itemHash = belongsInCalendar(item, true, deps.now())
        ? await contentHash(contentOf(item))
        : ''
      await db.insert(calendarEvents).values({
        person,
        itemId: named,
        eventId: event.id,
        etag: '',
        hash: itemHash,
      })
      return applyEvent(deps, person, event)
    }
  }

  const at = stamp(event, deps)
  const [created] = await db
    .insert(items)
    .values({
      title: content.title,
      notes: content.notes,
      dueDate: content.dueDate,
      dueTime: content.dueTime,
      doneAt: content.done ? at : null,
      doneBy: content.done ? person : null,
      createdAt: deps.now().toISOString(),
      createdBy: person,
      updatedAt: at,
    })
    .returning({ id: items.id })
  await db.insert(calendarEvents).values({
    person,
    itemId: created.id,
    eventId: event.id,
    etag: event.etag,
    hash,
  })
}

/** Writes every to-do whose event is missing, out of date, or no longer wanted. */
async function push(deps: SyncDeps, link: CalendarLink): Promise<void> {
  const { db } = deps
  const calendarId = link.calendarId
  if (!calendarId) return
  const api = deps.apiFor(link)
  const now = deps.now()
  const all = await db.select().from(items)
  const rows = new Map(
    (
      await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.person, link.person))
    ).map((row) => [row.itemId, row]),
  )
  // What is still to do first, soonest first, so a pass that runs out of
  // requests has done what matters.
  all.sort(
    (a, b) =>
      Number(a.doneAt !== null) - Number(b.doneAt !== null) ||
      (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
  )

  for (const item of all) {
    const row = rows.get(item.id)
    if (!belongsInCalendar(item, row !== undefined, now)) {
      if (row) {
        await quietly(api.deleteEvent(calendarId, row.eventId))
        await dropEvent(db, row)
      }
      continue
    }
    const content = contentOf(item)
    const hash = await contentHash(content)
    if (row?.hash === hash) continue
    const body = eventBody(item.id, content, deps)

    let written: GoogleEvent | null = null
    if (row) {
      try {
        written = await api.patchEvent(calendarId, row.eventId, body)
      } catch (error) {
        if (!isGone(error)) throw error
        await dropEvent(db, row)
      }
    }
    written ??= await api.insertEvent(calendarId, body)
    await db
      .insert(calendarEvents)
      .values({
        person: link.person,
        itemId: item.id,
        eventId: written.id,
        etag: written.etag,
        hash,
      })
      .onConflictDoUpdate({
        target: [calendarEvents.person, calendarEvents.itemId],
        set: { eventId: written.id, etag: written.etag, hash },
      })
  }
}

/**
 * Opens a push channel for every calendar that has none, or whose channel
 * ends within a day, and closes the one it replaces. `address` is where
 * Google calls; it has to be https.
 */
export async function renewChannels(
  deps: SyncDeps,
  address: string,
): Promise<void> {
  const { db } = deps
  const now = deps.now().getTime()
  for (const link of await activeLinks(deps)) {
    if (!link.calendarId) continue
    if (
      link.channelExpiresAt &&
      link.channelExpiresAt - now > RENEW_BEFORE_MS
    ) {
      continue
    }
    try {
      const api = deps.apiFor(link)
      const id = crypto.randomUUID()
      const token = randomToken()
      const opened = await api.watchEvents(link.calendarId, {
        id,
        token,
        address,
        ttlSeconds: CHANNEL_TTL_SECONDS,
      })
      await db
        .update(calendarLinks)
        .set({
          channelId: id,
          channelResourceId: opened.resourceId,
          channelTokenHash: await hashToken(token),
          channelExpiresAt: opened.expiresAt,
        })
        .where(eq(calendarLinks.person, link.person))
      if (link.channelId && link.channelResourceId) {
        await quietly(api.stopChannel(link.channelId, link.channelResourceId))
      }
    } catch (error) {
      if (error instanceof RevokedError) {
        await setProblem(db, link.person, 'revoked')
      } else {
        console.error(`[calendar] channel for ${link.person} failed:`, error)
      }
    }
  }
}

/**
 * Who a push from Google is about, once it proves it is from the channel
 * the app opened: the channel is known, the resource is the one watched,
 * and the token is the one the app gave it. Null for anything else.
 */
export async function verifyPush(
  db: Db,
  headers: Headers,
): Promise<{ person: string; state: string } | null> {
  const channelId = headers.get('X-Goog-Channel-ID')
  const token = headers.get('X-Goog-Channel-Token')
  const resourceId = headers.get('X-Goog-Resource-ID')
  const state = headers.get('X-Goog-Resource-State') ?? ''
  if (!channelId || !token || !resourceId) return null
  const link = await db
    .select()
    .from(calendarLinks)
    .where(eq(calendarLinks.channelId, channelId))
    .get()
  if (!link?.channelTokenHash || link.channelResourceId !== resourceId) {
    return null
  }
  if (!(await matchesHash(token, link.channelTokenHash))) return null
  return { person: link.person, state }
}

/**
 * Takes a person's calendar away: closes the channel, deletes the Todos
 * calendar from their Google account, withdraws the app's access, and
 * forgets all of it. The to-dos stay, those made in the calendar included.
 * Each step at Google is tried once; a failure there does not keep the
 * link, so a person whose access is already gone can still disconnect.
 */
export async function disconnect(
  deps: SyncDeps,
  person: string,
  withdraw: (link: CalendarLink) => Promise<void>,
): Promise<void> {
  const { db } = deps
  const link = await db
    .select()
    .from(calendarLinks)
    .where(eq(calendarLinks.person, person))
    .get()
  if (!link) return
  const api = deps.apiFor(link)
  if (link.channelId && link.channelResourceId) {
    await quietly(api.stopChannel(link.channelId, link.channelResourceId))
  }
  if (link.calendarId) await quietly(api.deleteCalendar(link.calendarId))
  await quietly(withdraw(link))
  await db.delete(calendarEvents).where(eq(calendarEvents.person, person))
  await db.delete(calendarLinks).where(eq(calendarLinks.person, person))
}

async function activeLinks(deps: SyncDeps): Promise<Array<CalendarLink>> {
  const links = await deps.db
    .select()
    .from(calendarLinks)
    .where(isNull(calendarLinks.problem))
  return links.filter((link) => deps.people.includes(link.person))
}

async function setProblem(
  db: Db,
  person: string,
  problem: NonNullable<CalendarLink['problem']>,
): Promise<void> {
  await db
    .update(calendarLinks)
    .set({ problem })
    .where(eq(calendarLinks.person, person))
}

async function dropEvent(db: Db, row: CalendarEvent): Promise<void> {
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.person, row.person),
        eq(calendarEvents.itemId, row.itemId),
      ),
    )
}

async function keepEtag(
  db: Db,
  row: CalendarEvent,
  etag: string,
): Promise<void> {
  await db
    .update(calendarEvents)
    .set({ etag })
    .where(
      and(
        eq(calendarEvents.person, row.person),
        eq(calendarEvents.itemId, row.itemId),
      ),
    )
}

function doneChange(
  item: Todo,
  done: boolean,
  person: string,
  event: GoogleEvent,
  deps: SyncDeps,
): Partial<Todo> {
  if (done === (item.doneAt !== null)) return {}
  return done
    ? { doneAt: stamp(event, deps), doneBy: person }
    : { doneAt: null, doneBy: null }
}

/** When an event changed, as the app stores instants. */
function stamp(event: GoogleEvent, deps: SyncDeps): string {
  const at = event.updated ? Date.parse(event.updated) : Number.NaN
  return new Date(Number.isNaN(at) ? deps.now() : at).toISOString()
}

/** Whether the to-do's last change came after the event's. A tie goes to the event. */
function later(
  itemUpdatedAt: string,
  eventUpdated: string | undefined,
): boolean {
  if (!eventUpdated) return true
  return Date.parse(itemUpdatedAt) > Date.parse(eventUpdated)
}

function isGone(error: unknown): boolean {
  return (
    error instanceof GoogleError &&
    (error.status === 404 || error.status === 410)
  )
}

/** For a call whose failure changes nothing: an event already gone, a channel already closed. */
async function quietly(call: Promise<void>): Promise<void> {
  try {
    await call
  } catch (error) {
    if (error instanceof BudgetSpent) throw error
    // Already gone, or Google no longer lets the app ask: nothing to undo.
    if (!isGone(error) && !(error instanceof RevokedError)) {
      console.error('[calendar]', error)
    }
  }
}

async function getMeta(db: Db, key: string): Promise<string | null> {
  const row = await db.select().from(meta).where(eq(meta.key, key)).get()
  return row?.value ?? null
}

async function setMeta(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } })
}

/**
 * Takes the lease if nobody holds it, or the holder's time ran out. Its
 * value is when it ends, then something only this holder knows, so the
 * holder releases its own lease and never one taken over after it expired.
 */
async function claimLease(deps: SyncDeps): Promise<string | null> {
  const now = deps.now()
  const lease = `${new Date(now.getTime() + LEASE_MS).toISOString()} ${randomToken(8)}`
  const taken = await deps.db
    .insert(meta)
    .values({ key: LEASE, value: lease })
    .onConflictDoUpdate({
      target: meta.key,
      set: { value: lease },
      setWhere: lt(meta.value, now.toISOString()),
    })
    .returning({ value: meta.value })
  return taken.length > 0 ? lease : null
}
