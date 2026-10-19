// Asking a person for their calendar: off to Google's consent screen, and
// back to /api/calendar/callback with a code. The state and the PKCE
// verifier ride in a short-lived cookie scoped to /api/calendar, so a reply
// is only taken from the browser that asked, and a code is only any use to
// the app that asked for it. The cookie also says what was asked for: the
// Todos calendar alone, or the person's other calendars to read and change
// as well, and, when the person was asked from an event they went to change,
// the page to bring them back to.
import {
  CALENDAR_SCOPE,
  READ_SCOPES,
  consentUrl,
  exchangeCode,
  pkceChallenge,
  revoke,
} from './google'
import { randomToken } from './seal'
import type { Fetch, Grant, OAuthClient } from './google'

const COOKIE = 'todos_calendar_consent'
const COOKIE_PATH = '/api/calendar'
const COOKIE_SECONDS = 10 * 60

/** Where the account page is told how it went: `?calendar=<outcome>`. */
export type Outcome =
  | 'connected'
  | 'denied'
  | 'failed'
  | 'unavailable'
  // Asked to read the other calendars: given, or not given while the
  // Todos calendar carries on.
  | 'reading'
  | 'reading-denied'

/**
 * What a trip to Google asks for: the Todos calendar only, or the person's
 * other calendars too, to read and change. The second is asked for only
 * when a person turns it on, or goes to change an event while they gave
 * reading alone, so nobody else is asked to give more than the sync needs.
 */
export type Want = 'sync' | 'read'

const SCOPES: Record<Want, Array<string>> = {
  sync: [CALENDAR_SCOPE],
  read: [CALENDAR_SCOPE, ...READ_SCOPES],
}

export function backToAccount(outcome: Outcome, extra?: HeadersInit): Response {
  return backTo(`/account?calendar=${outcome}`, extra)
}

/** Back to a page of the app. */
export function backTo(path: string, extra?: HeadersInit): Response {
  const headers = new Headers(extra)
  headers.set('Location', path)
  headers.set('Cache-Control', 'no-store')
  return new Response(null, { status: 302, headers })
}

/**
 * A page of this app to come back to: a path, never another site. Anything
 * else is dropped, and the person lands on the account page as usual.
 */
export function safeBack(path: string | null | undefined): string | null {
  if (!path || path.length > 1024) return null
  if (!path.startsWith('/') || path.startsWith('//')) return null
  if (/[\\\s]/.test(path)) return null
  return path
}

const encodeBack = (path: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(path)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function decodeBack(value: string | undefined): string | null {
  if (!value) return null
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return safeBack(
      new TextDecoder().decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    )
  } catch {
    return null
  }
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${COOKIE}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

/** Sends the browser to Google, remembering what it will have to bring back. */
export async function startConsent(
  client: OAuthClient,
  loginHint: string | null,
  want: Want = 'sync',
  back: string | null = null,
): Promise<Response> {
  const state = randomToken(16)
  const verifier = randomToken(32)
  const secure = client.redirectUri.startsWith('https://')
  return new Response(null, {
    status: 302,
    headers: {
      Location: consentUrl(client, {
        state,
        challenge: await pkceChallenge(verifier),
        loginHint,
        scopes: SCOPES[want],
      }),
      'Set-Cookie': cookie(
        [state, verifier, want, ...(back ? [encodeBack(back)] : [])].join('.'),
        COOKIE_SECONDS,
        secure,
      ),
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Reads Google's reply. The grant when the person said yes to the calendar,
 * from this browser, with what was asked for; otherwise the outcome to show
 * them. A grant without the calendar (Google lets a person untick it) is
 * handed straight back. One with the calendar but without the reading is
 * kept: the sync goes on, and the caller says the reading was not given.
 * Either way, `back` is the page the person asked from, when there was one.
 */
export async function finishConsent(
  request: Request,
  client: OAuthClient,
  fetcher: Fetch = fetch,
): Promise<
  | { grant: Grant; want: Want; back?: string }
  | { outcome: Outcome; back?: string }
> {
  const url = new URL(request.url)
  const remembered = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  const [state, verifier, asked, backed] = remembered?.split('.') ?? []
  const want: Want = asked === 'read' ? 'read' : 'sync'
  const back = decodeBack(backed)
  const from = back ? { back } : {}
  if (url.searchParams.get('error')) {
    return { outcome: want === 'read' ? 'reading-denied' : 'denied', ...from }
  }
  const code = url.searchParams.get('code')
  if (!state || !verifier || !code || url.searchParams.get('state') !== state) {
    return { outcome: 'failed' }
  }
  let grant: Grant
  try {
    grant = await exchangeCode(client, code, verifier, fetcher)
  } catch (error) {
    console.error('[calendar] consent failed:', error)
    return { outcome: 'failed' }
  }
  if (!grant.scopes.includes(CALENDAR_SCOPE)) {
    await revoke(grant.refreshToken, fetcher).catch(() => {})
    return { outcome: want === 'read' ? 'reading-denied' : 'denied', ...from }
  }
  return { grant, want, ...from }
}

/** The header that clears the cookie once the reply is read. */
export function forgetConsent(secure: boolean): HeadersInit {
  return { 'Set-Cookie': cookie('', 0, secure) }
}
