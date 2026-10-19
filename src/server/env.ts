// Every setting the server reads, declared and validated in one place. What
// any household would share is `vars` in wrangler.jsonc; what belongs to one
// household, and every secret, is set on the Worker with `wrangler secret
// put`, and in dev in .dev.vars. Nothing here names a particular household:
// the defaults are only good enough to boot.
import { env as bindings } from 'cloudflare:workers'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')

/**
 * Someone who lives here. People are configuration, the PEOPLE setting, and
 * exist in no table: a to-do just carries an id.
 */
export interface Person {
  id: string
  name: string
  initial: string
}

/** "alex:Alex,sam:Sam" to [["alex", "Alex"], ...] */
function pairs(value: string): Array<[string, string]> {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(':')
      return [entry.slice(0, at).trim(), entry.slice(at + 1).trim()] as [
        string,
        string,
      ]
    })
}

const _env = createEnv({
  server: {
    // IANA zone the household lives in. Deadlines and alert times are
    // wall-clock times in this zone. A Worker's own clock is always UTC.
    HOUSEHOLD_TZ: z.string().default('UTC'),

    // id:Name pairs. Ids are stable keys in the database; names are shown.
    PEOPLE: z
      .string()
      .default('alex:Alex,sam:Sam')
      .transform((value) =>
        pairs(value).map(([id, name]): Person => ({
          id,
          name,
          initial: name.slice(0, 1).toUpperCase(),
        })),
      ),

    // Where an alert's link points. No trailing slash.
    APP_URL: z.string().default('http://localhost:3001'),

    // Pushover. With no application token, alerts are written to the log
    // instead of sent, which is what dev wants. Both are secrets.
    PUSHOVER_APP_TOKEN: z.string().default(''),
    // id:userkey pairs, ids as in PEOPLE.
    PUSHOVER_USER_KEYS: z
      .string()
      .default('')
      .transform((value) => Object.fromEntries(pairs(value))),

    DIGEST_TIME: clock.default('07:30'),
    HEADS_UP_TIME: clock.default('19:00'),
    NUDGE_MINUTES_BEFORE: z.coerce.number().int().positive().default(60),

    // Sign-in with Google. All four are secrets. Until the first three are
    // set the app stays locked: nobody can sign in, so nothing is served.
    // Signs the session cookies. Any 32 or more random characters.
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, 'at least 32 characters')
      .default(''),
    // The OAuth client made for this app in the Google Cloud console.
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    // id:email pairs, ids as in PEOPLE: the Google accounts let in, and who
    // each one is. Anyone else is turned away at sign-in.
    PEOPLE_EMAILS: z.string().default('').transform(pairs),

    // A secret: seals the Google Calendar tokens kept in the database
    // (src/calendar/seal.ts). Any 32 or more random characters. Until it is
    // set, and the Google client above is too, nobody can connect a
    // calendar. Changing it later cuts every connected calendar off, and
    // each person connects theirs again. One set but too short leaves
    // calendars off, as if unset, and says so in the log: calendars are
    // optional, so a bad key must not stop the rest of the app.
    CALENDAR_TOKEN_KEY: z
      .string()
      .default('')
      .transform((key) => {
        if (key === '' || key.length >= 32) return key
        console.error(
          '[env] CALENDAR_TOKEN_KEY must be at least 32 characters; calendar sync is off until it is',
        )
        return ''
      }),

    // Dev server only, ignored once built: be this person without signing in.
    DEV_SIGNED_IN_AS: z.string().default(''),

    // Optional, a secret: a TypeSafe AI key. With it, the add bar has their
    // Jev model check its reading of a new to-do's title
    // (src/server/jev-read.ts), which sends them the title, today's date and
    // the tag names. Without it nothing is sent.
    TYPESAFE_API_KEY: z.string().default(''),
    // Where Jev is asked. Only ever changed to point a dev server at a
    // stand-in, so that trying the add bar spends nothing.
    TYPESAFE_API_URL: z
      .string()
      .default('https://api.typesafe.ai/v1/systemone'),

    // Optional dead-man switch: a URL fetched after every scheduler pass
    // that completes (healthchecks.io or the like). If the passes stop, the
    // pings stop, and that service raises the alarm this app no longer can.
    HEARTBEAT_URL: z.string().default(''),
  },
  runtimeEnv: bindings as unknown as Record<string, string | undefined>,
  emptyStringAsUndefined: true,
  isServer: typeof window === 'undefined',
  onValidationError: (issues) => {
    console.error('[env] invalid environment variables:')
    for (const issue of issues) {
      const path = issue.path
        ?.map((p) => (typeof p === 'object' ? p.key : p))
        .join('.')
      console.error(`  - ${path}: ${issue.message}`)
    }
    throw new Error('Invalid environment variables, see the log above')
  },
})

/** A person id only counts if PEOPLE has it. */
function knownPerson(id: string): string | null {
  return _env.PEOPLE.some((person) => person.id === id) ? id : null
}

// Getters, so that importing this module on the client (server functions are
// imported there for their types) never touches a server-only value.
export const env = {
  get timeZone() {
    return _env.HOUSEHOLD_TZ
  },
  get people(): Array<Person> {
    return _env.PEOPLE
  },
  get appUrl() {
    return _env.APP_URL.replace(/\/$/, '')
  },
  pushover: {
    get appToken() {
      return _env.PUSHOVER_APP_TOKEN
    },
    get userKeys(): Record<string, string | undefined> {
      return _env.PUSHOVER_USER_KEYS
    },
  },
  auth: {
    get secret() {
      return _env.BETTER_AUTH_SECRET
    },
    google: {
      get clientId() {
        return _env.GOOGLE_CLIENT_ID
      },
      get clientSecret() {
        return _env.GOOGLE_CLIENT_SECRET
      },
    },
    /** Who a Google account is, or null if it is not on the list. */
    personFor(email: string): string | null {
      const wanted = email.trim().toLowerCase()
      const match = _env.PEOPLE_EMAILS.find(
        ([, listed]) => listed.toLowerCase() === wanted,
      )
      return match ? knownPerson(match[0]) : null
    },
    /** The address a person signs in with, if the list has one. */
    emailFor(personId: string): string | null {
      const match = _env.PEOPLE_EMAILS.find(([id]) => id === personId)
      return match ? match[1] : null
    },
    get devSignedInAs() {
      return knownPerson(_env.DEV_SIGNED_IN_AS)
    },
  },
  calendar: {
    get tokenKey() {
      return _env.CALENDAR_TOKEN_KEY
    },
    /** Whether a person can connect a Google Calendar here. */
    get enabled() {
      return (
        _env.CALENDAR_TOKEN_KEY !== '' &&
        _env.GOOGLE_CLIENT_ID !== '' &&
        _env.GOOGLE_CLIENT_SECRET !== ''
      )
    },
  },
  typesafe: {
    get apiKey() {
      return _env.TYPESAFE_API_KEY
    },
    get url() {
      return _env.TYPESAFE_API_URL
    },
  },
  get heartbeatUrl() {
    return _env.HEARTBEAT_URL
  },
  alerts: {
    get digestTime() {
      return _env.DIGEST_TIME
    },
    get headsUpTime() {
      return _env.HEADS_UP_TIME
    },
    get nudgeMinutesBefore() {
      return _env.NUDGE_MINUTES_BEFORE
    },
  },
}
