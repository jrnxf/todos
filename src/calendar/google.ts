// Google, as the calendar sync sees it: asking a person for access to a
// calendar of the app's own, and the few Calendar API calls the sync makes.
// Nothing else in the app talks to Google's calendar but the two read-only
// calls that show a person's other calendars in the views (ReadingApi), and
// the sync only ever sees the CalendarApi interface, which the tests stand
// in for.
import type { EventTime, GoogleEvent } from './mapping'

/**
 * The narrowest scope that works: make calendars of the app's own, and read
 * and change the events in those, and in no other calendar. The primary
 * calendar and every other one stay out of reach.
 */
export const CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.app.created'

/**
 * Asked for only when a person chooses to see their other calendars next to
 * the to-dos: the list of their calendars, with the colour each has, and the
 * events in them, read-only. Together they read less than
 * `calendar.readonly`, which also reads each calendar's settings and
 * sharing, and neither can change anything.
 */
export const READ_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

/** Whether a grant's scopes let the app read the person's other calendars. */
export function readsCalendars(scopes: Array<string>): boolean {
  return READ_SCOPES.every((scope) => scopes.includes(scope))
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'

export type Fetch = typeof fetch

/** A Calendar API call that failed, with Google's status and reason. */
export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(`Google ${status} ${reason}: ${message}`)
  }
}

/** Access was withdrawn: the person removed it in their Google account. */
export class RevokedError extends Error {
  constructor() {
    super('Google no longer accepts this calendar connection')
  }
}

/**
 * A pass ran out of the requests it may make. Not a failure: the next pass
 * carries on where this one stopped.
 */
export class BudgetSpent extends Error {
  constructor() {
    super('calendar sync used its share of requests for this pass')
  }
}

export interface OAuthClient {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Where a person is sent to let the app make and keep its calendar, and,
 * when they asked to see their other calendars, read those too.
 */
export function consentUrl(
  client: OAuthClient,
  request: {
    state: string
    challenge: string
    loginHint: string | null
    scopes: Array<string>
  },
): string {
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: request.scopes.join(' '),
    // What the person already gave stays given: asking for the calendars
    // later adds to the calendar sync's access instead of replacing it, and
    // the grant that comes back says everything it covers.
    include_granted_scopes: 'true',
    // A refresh token, so the sync runs while nobody has the app open...
    access_type: 'offline',
    // ...which Google only hands out again when asked to show consent.
    prompt: 'consent',
    state: request.state,
    code_challenge: request.challenge,
    code_challenge_method: 'S256',
    ...(request.loginHint ? { login_hint: request.loginHint } : {}),
  }).toString()
  return url.toString()
}

/** The PKCE challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface Grant {
  refreshToken: string
  accessToken: string
  /** Unix milliseconds. */
  expiresAt: number
  scopes: Array<string>
}

interface TokenReply {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

async function tokenRequest(
  body: Record<string, string>,
  fetcher: Fetch,
): Promise<TokenReply & { status: number }> {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  })
  const reply = (await response.json().catch(() => ({}))) as TokenReply
  return { ...reply, status: response.status }
}

/** Trades the code Google sent back for the person's tokens. */
export async function exchangeCode(
  client: OAuthClient,
  code: string,
  verifier: string,
  fetcher: Fetch = fetch,
): Promise<Grant> {
  const reply = await tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
    },
    fetcher,
  )
  if (!reply.access_token || !reply.refresh_token) {
    throw new Error(`Google refused the code: ${reply.error ?? reply.status}`)
  }
  return {
    refreshToken: reply.refresh_token,
    accessToken: reply.access_token,
    expiresAt: Date.now() + (reply.expires_in ?? 3600) * 1000,
    scopes: (reply.scope ?? '').split(' ').filter(Boolean),
  }
}

/** A fresh access token. Throws RevokedError once access is withdrawn. */
export async function refreshAccess(
  client: Omit<OAuthClient, 'redirectUri'>,
  refreshToken: string,
  fetcher: Fetch = fetch,
): Promise<{ accessToken: string; expiresAt: number }> {
  const reply = await tokenRequest(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    },
    fetcher,
  )
  if (reply.error === 'invalid_grant') throw new RevokedError()
  if (!reply.access_token) {
    throw new Error(`Google refused a refresh: ${reply.error ?? reply.status}`)
  }
  return {
    accessToken: reply.access_token,
    expiresAt: Date.now() + (reply.expires_in ?? 3600) * 1000,
  }
}

/** Withdraws the app's access. A token that is already dead is fine. */
export async function revoke(
  token: string,
  fetcher: Fetch = fetch,
): Promise<void> {
  await fetcher(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  })
}

export interface EventPage {
  items: Array<GoogleEvent>
  nextPageToken?: string
  /** On the last page only: where the next incremental listing starts. */
  nextSyncToken?: string
}

export interface Channel {
  id: string
  token: string
  address: string
  ttlSeconds: number
}

/** The Calendar API calls the sync makes, for one person. */
export interface CalendarApi {
  insertCalendar: (body: {
    summary: string
    description: string
    timeZone: string
  }) => Promise<{ id: string }>
  deleteCalendar: (calendarId: string) => Promise<void>
  /**
   * With a sync token: what changed since it, deletions included. Throws a
   * GoogleError with status 410 when Google no longer knows the token.
   * Without one: every event, deleted ones included.
   */
  listEvents: (
    calendarId: string,
    page: { syncToken: string | null; pageToken: string | null },
  ) => Promise<EventPage>
  insertEvent: (
    calendarId: string,
    body: Record<string, unknown>,
  ) => Promise<GoogleEvent>
  patchEvent: (
    calendarId: string,
    eventId: string,
    body: Record<string, unknown>,
  ) => Promise<GoogleEvent>
  deleteEvent: (calendarId: string, eventId: string) => Promise<void>
  watchEvents: (
    calendarId: string,
    channel: Channel,
  ) => Promise<{ resourceId: string; expiresAt: number }>
  stopChannel: (channelId: string, resourceId: string) => Promise<void>
}

type Call = <T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
) => Promise<T>

/** One Calendar API request at a time, as the person whose token it is. */
function caller(accessToken: () => Promise<string>, fetcher: Fetch): Call {
  return async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(API + path)
    if (query) url.search = new URLSearchParams(query).toString()
    const response = await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 204) return undefined as T
    const reply = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> }
    }
    if (!response.ok) {
      throw new GoogleError(
        response.status,
        reply.error?.errors?.[0]?.reason ?? 'unknown',
        reply.error?.message ?? response.statusText,
      )
    }
    return reply as T
  }
}

const calendar = (id: string) => `/calendars/${encodeURIComponent(id)}`

/** The Calendar API over HTTP, as the person whose token it is. */
export function calendarApi(
  accessToken: () => Promise<string>,
  fetcher: Fetch = fetch,
): CalendarApi {
  const call = caller(accessToken, fetcher)

  return {
    insertCalendar: (body) => call('POST', '/calendars', body),
    deleteCalendar: (calendarId) => call('DELETE', calendar(calendarId)),
    listEvents: (calendarId, page) =>
      call('GET', `${calendar(calendarId)}/events`, undefined, {
        maxResults: '250',
        ...(page.syncToken
          ? { syncToken: page.syncToken }
          : { showDeleted: 'true' }),
        ...(page.pageToken ? { pageToken: page.pageToken } : {}),
      }),
    insertEvent: (calendarId, body) =>
      call('POST', `${calendar(calendarId)}/events`, body),
    patchEvent: (calendarId, eventId, body) =>
      call(
        'PATCH',
        `${calendar(calendarId)}/events/${encodeURIComponent(eventId)}`,
        body,
      ),
    deleteEvent: (calendarId, eventId) =>
      call(
        'DELETE',
        `${calendar(calendarId)}/events/${encodeURIComponent(eventId)}`,
      ),
    watchEvents: async (calendarId, channel) => {
      const reply = await call<{ resourceId: string; expiration: string }>(
        'POST',
        `${calendar(calendarId)}/events/watch`,
        {
          id: channel.id,
          type: 'web_hook',
          address: channel.address,
          token: channel.token,
          params: { ttl: String(channel.ttlSeconds) },
        },
      )
      return {
        resourceId: reply.resourceId,
        expiresAt: Number(reply.expiration),
      }
    },
    stopChannel: (channelId, resourceId) =>
      call('POST', '/channels/stop', { id: channelId, resourceId }),
  }
}

/** A calendar in the person's list, as much of it as the app reads. */
export interface ListedCalendar {
  id: string
  summary?: string
  /** The name the person gave it themselves, over its owner's. */
  summaryOverride?: string
  /** The colour the person sees it in, as "#rrggbb". */
  backgroundColor?: string
  primary?: boolean
}

/** An event as read from another calendar: only what the views show. */
export interface ReadEvent {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  start?: EventTime
  end?: EventTime
  htmlLink?: string
  /** Only the person's own answer, when they were invited. */
  attendees?: Array<{ self?: boolean; responseStatus?: string }>
}

/**
 * The two calls that read a person's other calendars, needing the
 * READ_SCOPES. Neither can change anything, and each asks Google for no
 * more fields than the views show: no descriptions, places or guests.
 */
export interface ReadingApi {
  /** Every calendar the person can read events in, one page of up to 250. */
  listCalendars: () => Promise<Array<ListedCalendar>>
  /** One page of a calendar's events between two instants, repeats unrolled. */
  listWindow: (
    calendarId: string,
    window: {
      timeMin: string
      timeMax: string
      timeZone: string
      pageToken: string | null
    },
  ) => Promise<{ items: Array<ReadEvent>; nextPageToken?: string }>
}

export function readingApi(
  accessToken: () => Promise<string>,
  fetcher: Fetch = fetch,
): ReadingApi {
  const call = caller(accessToken, fetcher)
  return {
    listCalendars: async () =>
      (
        await call<{ items?: Array<ListedCalendar> }>(
          'GET',
          '/users/me/calendarList',
          undefined,
          {
            maxResults: '250',
            // Free/busy-only calendars have no events to show.
            minAccessRole: 'reader',
            fields: 'items(id,summary,summaryOverride,backgroundColor,primary)',
          },
        )
      ).items ?? [],
    listWindow: (calendarId, window) =>
      call('GET', `${calendar(calendarId)}/events`, undefined, {
        timeMin: window.timeMin,
        timeMax: window.timeMax,
        timeZone: window.timeZone,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields:
          'items(id,status,summary,start,end,htmlLink,attendees(self,responseStatus)),nextPageToken',
        ...(window.pageToken ? { pageToken: window.pageToken } : {}),
      }),
  }
}
