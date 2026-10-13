// Sign-in with Google, by Better Auth. It owns the four auth_ tables and the
// routes under /api/auth; the rest of the app only ever asks it one question,
// in identity.ts: whose session is this?
// The minimal build leaves out the query builder that the Drizzle adapter
// stands in for.
import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDb, schema } from '@/db/client'
import { env } from './env'

const DAY = 60 * 60 * 24

function build() {
  const { secret, google } = env.auth
  if (!secret || !google.clientId || !google.clientSecret) return null

  return betterAuth({
    appName: 'todos',
    // Fixed, never taken from the request, so a forged Host header cannot
    // point Google's reply somewhere else.
    baseURL: env.appUrl,
    secret,
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    socialProviders: {
      google: {
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        // A phone with two Google accounts gets asked which one.
        prompt: 'select_account',
      },
    },
    user: {
      // The list of who gets in. Asked before a user is created and again on
      // every later sign-in, so a stranger's Google account leaves no row.
      validateUserInfo: ({ user }) =>
        user.emailVerified === true &&
        typeof user.email === 'string' &&
        env.auth.personFor(user.email)
          ? undefined
          : { error: 'not_on_the_list' },
    },
    session: {
      // A phone that opens the app now and then stays signed in: each visit
      // more than a day after the last pushes the expiry out again.
      expiresIn: 90 * DAY,
      updateAge: DAY,
      // Between database checks, a signed cookie answers for the session.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: { encryptOAuthTokens: true },
    advanced: {
      cookiePrefix: 'home',
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    // Every failure on the way back from Google lands on our own page.
    onAPIError: { errorURL: `${env.appUrl}/signin` },
    telemetry: { enabled: false },
    // Has to stay last: it copies the cookies the others set onto the reply.
    plugins: [tanstackStartCookies()],
  })
}

let auth: ReturnType<typeof build> = null

/** Null until the sign-in secrets are set; until then nobody gets in. */
export function getAuth() {
  auth ??= build()
  return auth
}
