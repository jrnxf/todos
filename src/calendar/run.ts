// The calendar sync wired to the Worker: D1, the settings, Google over
// HTTP, and work that carries on after the reply has gone. Three things set
// a pass going:
//
// - a change in the app (src/server/board.ts), straight after it is saved;
// - Google, calling /api/calendar/notify when a Todos calendar changes;
// - the cron (src/server.ts): every quarter of an hour a pass runs whatever
//   happened, as a backstop for a missed push, and the push channels are
//   renewed before they run out. In the minutes between, it finishes a pass
//   that ran out of requests or was asked for while another ran.
import { waitUntil } from 'cloudflare:workers'
import { count, eq } from 'drizzle-orm'
import { getDb, schema } from '@/db/client'
import { env } from '@/server/env'
import {
  BudgetSpent,
  RevokedError,
  calendarApi,
  editsCalendars,
  readsCalendars,
  refreshAccess,
  revoke,
} from './google'
import { CALLBACK_PATH, PUSH_PATH } from './paths'
import { seal, unseal } from './seal'
import { disconnect, renewChannels, runSync, syncWanted } from './sync'
import type { CalendarLink } from '@/db/schema'
import type { Fetch, Grant, OAuthClient } from './google'
import type { Db, SyncDeps } from './sync'

/**
 * Requests one pass may make of Google. Well inside a Worker's own limit on
 * outgoing requests, with room for the alerts that share a cron run. A
 * pass that needs more (the first one after connecting, for a long list)
 * stops, and the next minute's cron carries on.
 */
const REQUESTS_PER_PASS = 40
/** Minutes between backstop passes and channel checks. */
const BACKSTOP_MINUTES = 15

export function oauthClient(): OAuthClient {
  return {
    clientId: env.auth.google.clientId,
    clientSecret: env.auth.google.clientSecret,
    redirectUri: env.appUrl + CALLBACK_PATH,
  }
}

function deps(): SyncDeps {
  const db = getDb()
  let left = REQUESTS_PER_PASS
  const budgeted: Fetch = async (input, init) => {
    if (left <= 0) throw new BudgetSpent()
    left--
    return fetch(input, init)
  }
  const tokens = new Map<string, () => Promise<string>>()
  return {
    db,
    apiFor: (link) => {
      let token = tokens.get(link.person)
      if (!token) {
        token = accessToken(db, link, budgeted)
        tokens.set(link.person, token)
      }
      return calendarApi(token, budgeted)
    },
    timeZone: env.timeZone,
    appUrl: env.appUrl,
    people: env.people.map((person) => person.id),
    now: () => new Date(),
  }
}

/**
 * A person's access token: the one kept from last time while it has a
 * minute left, or a fresh one, which is sealed and kept in turn.
 */
function accessToken(
  db: Db,
  link: CalendarLink,
  fetcher: Fetch,
): () => Promise<string> {
  const key = env.calendar.tokenKey
  let current: { token: string; expiresAt: number } | null = null
  return async () => {
    const usable = (expiresAt: number | null) =>
      expiresAt !== null && expiresAt - 60_000 > Date.now()
    if (current && usable(current.expiresAt)) return current.token
    if (!current && link.accessToken && usable(link.accessTokenExpiresAt)) {
      current = {
        token: await opened(link.accessToken, link.person),
        expiresAt: link.accessTokenExpiresAt!,
      }
      return current.token
    }
    const fresh = await refreshAccess(
      oauthClient(),
      await opened(link.refreshToken, link.person),
      fetcher,
    )
    current = { token: fresh.accessToken, expiresAt: fresh.expiresAt }
    await db
      .update(schema.calendarLinks)
      .set({
        accessToken: await seal(key, fresh.accessToken, link.person),
        accessTokenExpiresAt: fresh.expiresAt,
      })
      .where(eq(schema.calendarLinks.person, link.person))
    return current.token
  }
}

/**
 * A person's access token for reading their other calendars
 * (src/calendar/read.ts): the same one the sync uses, outside its budget.
 */
export function readerToken(link: CalendarLink): () => Promise<string> {
  return accessToken(getDb(), link, fetch)
}

/**
 * A sealed token, opened. One sealed under another CALENDAR_TOKEN_KEY can
 * never be opened again, which leaves the person as cut off as if they had
 * withdrawn access: they connect again.
 */
async function opened(sealed: string, person: string): Promise<string> {
  try {
    return await unseal(env.calendar.tokenKey, sealed, person)
  } catch {
    throw new RevokedError()
  }
}

function pushAddress(): string | null {
  // Google only calls https addresses, so a dev server on a laptop has no
  // channel and relies on its own changes and the backstop.
  return env.appUrl.startsWith('https://') ? env.appUrl + PUSH_PATH : null
}

async function pass(): Promise<void> {
  try {
    await runSync(deps())
  } catch (error) {
    console.error('[calendar] pass failed:', error)
  }
}

async function channels(): Promise<void> {
  const address = pushAddress()
  if (!address) return
  try {
    await renewChannels(deps(), address)
  } catch (error) {
    console.error('[calendar] channel renewal failed:', error)
  }
}

/** Starts a pass that carries on after the reply. Nothing when nobody can connect. */
export function requestCalendarSync(): void {
  if (!env.calendar.enabled) return
  waitUntil(pass())
}

/** The cron's share of the calendar work, once a minute. */
export async function calendarTick(instant: Date): Promise<void> {
  if (!env.calendar.enabled) return
  if (instant.getUTCMinutes() % BACKSTOP_MINUTES === 0) {
    await channels()
    await pass()
  } else if (await syncWanted(getDb())) {
    await pass()
  }
}

/**
 * Keeps what Google granted a person, then fills their calendar and opens
 * its channel after the reply. Connecting again after a problem keeps the
 * calendar the app already made, unless that is what went missing.
 */
export async function connectCalendar(
  person: string,
  grant: Grant,
): Promise<void> {
  const db = getDb()
  const key = env.calendar.tokenKey
  const tokens = {
    refreshToken: await seal(key, grant.refreshToken, person),
    accessToken: await seal(key, grant.accessToken, person),
    accessTokenExpiresAt: grant.expiresAt,
    scopes: grant.scopes.join(' '),
    problem: null,
  }
  const existing = await db
    .select()
    .from(schema.calendarLinks)
    .where(eq(schema.calendarLinks.person, person))
    .get()
  if (existing?.problem === 'calendar_gone') {
    await db
      .delete(schema.calendarEvents)
      .where(eq(schema.calendarEvents.person, person))
  }
  const fresh = !existing || existing.problem === 'calendar_gone'
  await db
    .insert(schema.calendarLinks)
    .values({ person, ...tokens, connectedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schema.calendarLinks.person,
      set: {
        ...tokens,
        ...(fresh
          ? {
              calendarId: null,
              syncToken: null,
              channelId: null,
              channelResourceId: null,
              channelTokenHash: null,
              channelExpiresAt: null,
              lastSyncedAt: null,
            }
          : {}),
      },
    })
  waitUntil(pass().then(channels))
}

/** See `disconnect` in sync.ts: the to-dos stay, the calendar goes. */
export async function disconnectCalendar(person: string): Promise<void> {
  await disconnect(deps(), person, async (link) =>
    revoke(await opened(link.refreshToken, link.person)),
  )
}

export interface CalendarStatus {
  /** Whether this server lets anyone connect a calendar. */
  available: boolean
  connected: boolean
  /** Why it stopped, when it did: the person has to connect again. */
  problem: CalendarLink['problem']
  /** UTC instant of the last complete pass, null before the first. */
  lastSyncedAt: string | null
  /** Whether Google lets the app read the person's other calendars. */
  reads: boolean
  /** Whether it also lets the app change and delete their events. */
  edits: boolean
  /** How many of those the person chose to see in the views. */
  showing: number
}

export async function calendarStatus(person: string): Promise<CalendarStatus> {
  const db = getDb()
  const [link, shown] = await Promise.all([
    db
      .select()
      .from(schema.calendarLinks)
      .where(eq(schema.calendarLinks.person, person))
      .get(),
    db
      .select({ n: count() })
      .from(schema.calendarsShown)
      .where(eq(schema.calendarsShown.person, person))
      .get(),
  ])
  return {
    available: env.calendar.enabled,
    connected: link !== undefined,
    problem: link?.problem ?? null,
    lastSyncedAt: link?.lastSyncedAt ?? null,
    reads: link !== undefined && readsCalendars(link.scopes.split(' ')),
    edits: link !== undefined && editsCalendars(link.scopes.split(' ')),
    showing: shown?.n ?? 0,
  }
}
