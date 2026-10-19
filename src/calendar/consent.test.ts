import { describe, expect, it, vi } from 'vitest'
import { finishConsent, startConsent } from './consent'
import { CALENDAR_SCOPE, READ_SCOPES } from './google'
import type { Want } from './consent'

const client = {
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'https://todos.example/api/calendar/callback',
}

/** Goes to Google and returns with Google's answer and the browser's cookie. */
async function roundTrip(want: Want = 'sync') {
  const start = await startConsent(client, 'alex@example.com', want)
  const to = new URL(start.headers.get('Location')!)
  const cookie = start.headers.get('Set-Cookie')!.split(';')[0]
  return {
    to,
    back: (query: string, sendCookie = true) =>
      new Request(`${client.redirectUri}?${query}`, {
        headers: sendCookie ? { Cookie: `other=1; ${cookie}` } : {},
      }),
    state: to.searchParams.get('state')!,
  }
}

const google = (scope: string) =>
  vi.fn<typeof fetch>(async (url) =>
    String(url).includes('/revoke')
      ? new Response(null, { status: 200 })
      : Response.json({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          scope,
        }),
  )

describe('asking for a calendar', () => {
  it('asks Google for the app-made calendars only, offline, with PKCE', async () => {
    const start = await startConsent(client, 'alex@example.com')
    const to = new URL(start.headers.get('Location')!)
    expect(to.origin + to.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      scope: CALENDAR_SCOPE,
      include_granted_scopes: 'true',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      login_hint: 'alex@example.com',
      redirect_uri: client.redirectUri,
    })
    expect(start.headers.get('Set-Cookie')).toMatch(
      /Path=\/api\/calendar; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
    )
  })

  it('takes the grant back from the browser that asked', async () => {
    const trip = await roundTrip()
    const fetcher = google(`openid ${CALENDAR_SCOPE}`)
    const reply = await finishConsent(
      trip.back(`code=abc&state=${trip.state}`),
      client,
      fetcher,
    )
    expect(reply).toMatchObject({ grant: { refreshToken: 'refresh' } })
    const sent = fetcher.mock.calls[0][1]!.body as URLSearchParams
    expect(sent.get('code_verifier')).toBeTruthy()
  })

  it('refuses a reply with another state, or from another browser', async () => {
    const trip = await roundTrip()
    const fetcher = google(CALENDAR_SCOPE)
    for (const request of [
      trip.back('code=abc&state=forged'),
      trip.back(`code=abc&state=${trip.state}`, false),
      trip.back(`state=${trip.state}`),
    ]) {
      expect(await finishConsent(request, client, fetcher)).toEqual({
        outcome: 'failed',
      })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('hands back a grant that leaves the calendar out', async () => {
    const trip = await roundTrip()
    const fetcher = google('openid email')
    expect(
      await finishConsent(
        trip.back(`code=abc&state=${trip.state}`),
        client,
        fetcher,
      ),
    ).toEqual({ outcome: 'denied' })
    expect(String(fetcher.mock.calls[1][0])).toContain('/revoke')
  })

  it('says so when the person said no', async () => {
    const trip = await roundTrip()
    expect(
      await finishConsent(
        trip.back(`error=access_denied&state=${trip.state}`),
        client,
      ),
    ).toEqual({ outcome: 'denied' })
  })
})

describe('asking to read the other calendars as well', () => {
  const all = [CALENDAR_SCOPE, ...READ_SCOPES].join(' ')

  it('asks for the read-only scopes on top of what was given before', async () => {
    const trip = await roundTrip('read')
    expect(trip.to.searchParams.get('scope')).toBe(all)
    expect(trip.to.searchParams.get('include_granted_scopes')).toBe('true')
  })

  it('says what was asked for when the grant comes back', async () => {
    const trip = await roundTrip('read')
    expect(
      await finishConsent(
        trip.back(`code=abc&state=${trip.state}`),
        client,
        google(all),
      ),
    ).toMatchObject({ want: 'read', grant: { scopes: all.split(' ') } })
  })

  it('keeps a grant without the reading, so the sync carries on', async () => {
    const trip = await roundTrip('read')
    const fetcher = google(CALENDAR_SCOPE)
    expect(
      await finishConsent(
        trip.back(`code=abc&state=${trip.state}`),
        client,
        fetcher,
      ),
    ).toMatchObject({ want: 'read', grant: { scopes: [CALENDAR_SCOPE] } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('says the reading was not given when the person said no', async () => {
    const trip = await roundTrip('read')
    expect(
      await finishConsent(
        trip.back(`error=access_denied&state=${trip.state}`),
        client,
      ),
    ).toEqual({ outcome: 'reading-denied' })
  })
})
