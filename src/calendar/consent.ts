// Asking a person for their calendar: off to Google's consent screen, and
// back to /api/calendar/callback with a code. The state and the PKCE
// verifier ride in a short-lived cookie scoped to /api/calendar, so a reply
// is only taken from the browser that asked, and a code is only any use to
// the app that asked for it.
import {
  CALENDAR_SCOPE,
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
export type Outcome = 'connected' | 'denied' | 'failed' | 'unavailable'

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
      }),
      'Set-Cookie': cookie(`${state}.${verifier}`, COOKIE_SECONDS, secure),
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Reads Google's reply. The grant when the person said yes to the calendar,
 * from this browser; otherwise the outcome to show them. A grant without
 * the calendar (Google lets a person untick it) is handed straight back.
 */
export async function finishConsent(
  request: Request,
  client: OAuthClient,
  fetcher: Fetch = fetch,
): Promise<{ grant: Grant } | { outcome: Outcome }> {
  const url = new URL(request.url)
  const remembered = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  const [state, verifier] = remembered?.split('.') ?? []
  if (url.searchParams.get('error')) return { outcome: 'denied' }
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
    return { outcome: 'denied' }
  }
  return { grant }
}

/** The header that clears the cookie once the reply is read. */
export function forgetConsent(secure: boolean): HeadersInit {
  return { 'Set-Cookie': cookie('', 0, secure) }
}
