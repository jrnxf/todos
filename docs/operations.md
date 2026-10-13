# Running it

How the app is put together once deployed, how to set up your own, and what to
look at when something seems off. `<your-app>` below stands for the address
your Worker is served at, such as `todos.<account>.workers.dev`.

## Shape

- One Worker: a TanStack Start app, deployed with wrangler from this repo.
- One D1 database (SQLite). Schema changes are SQL files under `drizzle/`,
  applied with wrangler.
- One Cron Trigger, every minute, which is the whole alert scheduler.
- Sign-in with Google (Better Auth), limited to a list of addresses. The
  address is public, but all it shows a stranger is the sign-in page.

The database holds only what the household creates (to-dos, areas, sign-in
sessions), one row of scheduler state, and the migration history. Who lives
in the house is a setting, not a table.

## Setting up your own

1. **Database.** `bunx wrangler d1 create todos`, then put the name and id it
   prints into `d1_databases` in `wrangler.jsonc`.

2. **Google sign-in client.** In the Google Cloud console (APIs & Services,
   Credentials) create an OAuth client ID of type **Web application**, with
   these authorised redirect URIs:

   ```
   https://<your-app>/api/auth/callback/google
   http://localhost:3001/api/auth/callback/google
   ```

   The second is only for signing in on a laptop's dev server. If the consent
   screen is left in Testing, add each Google account as a test user.

3. **Settings.** Each one is set on the Worker with
   `bunx wrangler secret put <NAME>`. Wrangler prompts for the value, so none
   of them lands in shell history or in this repo.

   | Setting                | Value                                                    |
   | ---------------------- | -------------------------------------------------------- |
   | `PEOPLE`               | Who lives here, as `id:Name` pairs: `alex:Alex,sam:Sam`  |
   | `PEOPLE_EMAILS`        | Who may sign in, as `id:email` pairs, ids as in `PEOPLE` |
   | `HOUSEHOLD_TZ`         | The household's IANA zone, such as `America/Chicago`     |
   | `APP_URL`              | `https://<your-app>`, no trailing slash                  |
   | `BETTER_AUTH_SECRET`   | 32 or more random characters: `openssl rand -base64 32`  |
   | `GOOGLE_CLIENT_ID`     | From the client made in step 2                           |
   | `GOOGLE_CLIENT_SECRET` | From the client made in step 2                           |

   One person can have two addresses: list their id twice in `PEOPLE_EMAILS`.
   The alert times (`DIGEST_TIME`, `HEADS_UP_TIME`, `NUDGE_MINUTES_BEFORE`)
   are plain `vars` in `wrangler.jsonc`.

4. **Deploy.**

   ```bash
   bun run db:migrate:remote
   bun run deploy
   ```

## Who gets in

Only the Google accounts named in `PEOPLE_EMAILS`, and each one is the person
it is listed against. Everything else is refused in one place,
`src/start.ts`: a page request is sent to `/signin`, a data request gets a 401. Three paths answer without a session: `/signin`, `/api/auth/*` (the
sign-in machinery) and `/api/health`.

- A Google account that is not on the list is turned away on its way back
  from Google and leaves no row behind.
- The list is checked on every request, not only at sign-in. Take an address
  out of `PEOPLE_EMAILS` and that person is out at once.
- A session lasts 90 days and renews itself with use, so a phone that opens
  the app now and then is never asked again. **Sign out** is on the account
  page (the avatar).
- With `BETTER_AUTH_SECRET` or either Google setting missing, nobody can sign
  in and the app serves nothing but the sign-in page.

Changing `BETTER_AUTH_SECRET` later signs everyone out. If the app moves to
another address, change `APP_URL` and add the new callback URI to the Google
client.

## Alerts

Three kinds and one switch, all through Pushover:

| Kind     | When                                        | Who                                      |
| -------- | ------------------------------------------- | ---------------------------------------- |
| Digest   | 07:30, skipped when there is nothing to say | Yours, unassigned, anything 2+ days late |
| Heads-up | 19:00, N days before (per to-do, default 1) | The assignee, or everyone if unassigned  |
| Nudge    | 1 hour before a to-do that has a clock time | The assignee, or everyone if unassigned  |

**Must not miss** (per to-do): its alerts go to everyone at high priority,
and once late it alerts everyone every morning until it is done or re-dated.

Times are wall-clock in `HOUSEHOLD_TZ`.

### Turning alerts on

Until these two settings exist, every alert is written to the Worker's log
instead of sent.

1. At pushover.net create an application. Each person installs the Pushover
   app and signs up; their User Key is on its settings screen.
2. Set both:

   ```bash
   bunx wrangler secret put PUSHOVER_APP_TOKEN   # the application's token
   bunx wrangler secret put PUSHOVER_USER_KEYS   # alex:<key>,sam:<key>
   ```

3. On each phone, open the app, tap the avatar, press **Send test**. In the
   Pushover app, turn on Critical Alerts for high priority if a must-not-miss
   to-do should sound through silent.

## Area guesses (optional)

When a new to-do's title does not say which area it belongs in, the add bar
can ask [Jev](https://docs.typesafe.ai), TypeSafe AI's decision model, to pick
one of your areas. It fills the area only when the answer is at least 80%
sure and arrives within a second and a half; otherwise the area stays empty,
as it does when the service is down or the phone is offline. A guess shows
under the title and one tap takes it back.

It is off until you give the Worker a key:

```bash
bunx wrangler secret put TYPESAFE_API_KEY
```

With the key set, each new to-do's title, the first names in `PEOPLE` and
your area names are sent to TypeSafe AI, a company outside the household.
Nothing else is, and nothing is sent for a to-do whose area you said or
picked. Delete the secret (`bunx wrangler secret delete TYPESAFE_API_KEY`) to
turn it off again.

## Each phone

Open the address in Safari, sign in with Google, then Share, Add to Home
Screen. Open it from the icon and sign in once more: the Home Screen app
keeps its own cookies, apart from Safari's.

## Deploying a change

```bash
bun run db:migrate:remote   # only when drizzle/ has a new file
bun run deploy
```

Migrate first, then deploy straight after: the new code expects the new
tables. When a migration takes something away that the running code still
reads, the live app errors for the seconds between the two commands. Run them
back to back.

## Looking inside

```bash
curl -s https://<your-app>/api/health   # {"ok":true}
bunx wrangler tail                       # live log, alerts included
bunx wrangler d1 execute DB --remote --command "select * from meta"
```

The last one shows `alerts_watermark`: the minute the scheduler last
completed a pass, in household time. If it is more than a few minutes old,
alerts are not going out.

## Knowing when it stops

Nothing pages if the scheduler dies, unless a dead-man switch is set: create
a check at healthchecks.io with a period of a few minutes and put its ping
URL in the `HEARTBEAT_URL` setting. The scheduler fetches it after every pass
that completes, and healthchecks.io raises the alarm when the pings stop.

## Backup and restore

D1 keeps its own history (Time Travel): `bunx wrangler d1 time-travel info DB`
and `... restore DB --timestamp=<when>` bring the database back to an earlier
moment. For a copy that lives outside Cloudflare:
`bunx wrangler d1 export DB --remote --output=todos.sql`.

## Not built yet

- Offline reading (a service worker).
- Repeating to-dos, snooze, checklists, and a calendar feed. (Typing a date
  into the title is built.)
