// Asking a person for their calendar: off to Google's consent screen, and
// back to /api/calendar/callback with a code. The state and the PKCE
// verifier ride in a short-lived cookie scoped to /api/calendar, so a reply
// is only taken from the browser that asked, and a code is only any use to
// the app that asked for it. The cookie also says what was asked for: the
// Todos calendar alone, or the person's other calendars to read as well.
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
 * What a trip to Google asks for: the Todos calendar only, or reading the
 * person's other calendars too. The second is asked for only when a person
 * turns it on, so nobody else is asked to give more than the sync needs.
 */
export type Want = 'sync' | 'read'

const SCOPES: Record<Want, Array<string>> = {
  sync: [CALENDAR_SCOPE],
  read: [CALENDAR_SCOPE, ...READ_SCOPES],
}

export function backToAccount(outcome: Outcome, extra?: HeadersInit): Response {
  const headers = new Headers(extra)
  headers.set('Location', `/account?calendar=${outcome}`)
  headers.set('Cache-Control', 'no-store')
  return new Response(null, { status: 302, headers })
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
        `${state}.${verifier}.${want}`,
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
 */
export async function finishConsent(
  request: Request,
  client: OAuthClient,
  fetcher: Fetch = fetch,
): Promise<{ grant: Grant; want: Want } | { outcome: Outcome }> {
  const url = new URL(request.url)
  const remembered = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  const [state, verifier, asked] = remembered?.split('.') ?? []
  const want: Want = asked === 'read' ? 'read' : 'sync'
  if (url.searchParams.get('error')) {
    return { outcome: want === 'read' ? 'reading-denied' : 'denied' }
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
    return { outcome: want === 'read' ? 'reading-denied' : 'denied' }
  }
  return { grant, want }
}

/** The header that clears the cookie once the reply is read. */
export function forgetConsent(secure: boolean): HeadersInit {
  return { 'Set-Cookie': cookie('', 0, secure) }
}
