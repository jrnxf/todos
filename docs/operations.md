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

The database holds only what the household creates (to-dos, tags, sign-in
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

## Reading titles with Jev (optional)

The add bar fills its buttons from what is typed: "Sam: dentist fri 5pm !" is
Sam's, on Friday at five, and must not be missed. On its own it does that
with rules in the page, which read only what is said outright.

Given a key, it first asks [Jev](https://docs.typesafe.ai), TypeSafe AI's
decision model, once typing pauses. One request asks for all of it: the day,
the time, whose it is, the tag, the heads-up, the flag, and for each word of
the title whether it is part of the task. Jev can only pick from options it
is handed or answer yes or no, so it never writes a date or a title of its
own.

- A button is filled from Jev's answer only when Jev is at least 80% sure.
  A word leaves the title only when Jev is at least 90% sure it is not part
  of the task, and only for a button it filled.
- Anything short of that falls back to the rules, field by field: an unsure
  answer, a "none", a reply slower than a second and a half, an error, or no
  connection. So does a date more than 120 days out, and a time that is not
  on a quarter hour.
- What Jev filled shows under the title as "Guessed", and one tap takes it
  back. A button you set yourself, or took back, is never filled again.

It is off until you give the Worker a key:

```bash
bunx wrangler secret put TYPESAFE_API_KEY
```

With the key set, this is sent to TypeSafe AI, a company outside the
household, each time typing pauses on a new to-do: the title as typed so far,
the first names in `PEOPLE` and which of them is typing, your tag names, and
today's date. Nothing else is: no notes, no other to-dos, no addresses.
Nothing is sent for a to-do whose every button you set by hand, and a button
you set by hand is not asked about. Delete the secret
(`bunx wrangler secret delete TYPESAFE_API_KEY`) and deploy to turn it off
again: nothing is sent, and the add bar reads titles with its rules alone, as
it does without a key.

Jev is charged by what is sent: roughly 5,000 tokens a request for a
ten-word title, which at the listed $0.042 per million is about $0.0002 for
each pause in typing.

### Checking how well it reads

Before trusting it with dates, measure it. `bun run eval:read` reads 200
household sentences, each with the fill a person would expect, several ways
on the same inputs:

- **Rules alone**: the rules in the page, and nothing sent.
- **Jev first, the old usage**: what the add bar does today, as described
  above. It is the baseline of how Jev was first asked.
- **Verify**, for each decision model there is a key for (Jev, Cloudflare
  Clef, Clef Flash, OpenAI's Decisions API): the model asked the way its
  makers document (`scripts/read-eval-verify.ts`). The rules read first and
  write the title. The model is asked only what takes judgment: which tag,
  from options that are named and described, where the rules found none; and
  whether the words the rules read a date from are really when the to-do is
  due, or part of a name ("the Sunday paper"). A no takes that date away
  again. The model never writes a date, a time or a title, and never
  touches a field the rules read but that one date.
- **Tag only** and **Verify + date parts**: test only, read out of the same
  reply, to show each part's worth on its own. The first reads the tag and
  nothing else. The second also asks, where the rules read no date, for the
  parts of one (how it is written, the month, the day, the weekday) and puts
  them together in code.
- **Fast model**: one call to a small general model (Claude Haiku 4.5, Gemini
  3.1 Flash Lite) returns every field and the tidied title as structured
  output, and the rules read the sentence alone on a late or a bad reply.

Only the first two are in the app. The rest exist in the test alone, to be
chosen between. Two ways the test used to score, Jev filling the gaps and a
hybrid in which the model's date replaced the rules', are gone from it: both
asked Jev to find a day among 120 and a time among 96, which its makers say
it does badly, and the columns above replace them.

It writes `data/read-eval/report.md`: the answer first, in plain words (which
way missed fewest on the fresh sentences, and by how many); the hit rate per
field and the total misses for each way side by side, the fresh set first,
then each other set, then all of them; what each cut-off costs; every miss;
one table of the speed (median, 9 in 10, slowest, and how many answers came
later than the add bar waits), the tokens and the cost a to-do of every way;
and where each provider's endpoint, limits and price were read. Beside it,
`results.json` holds every raw probability the decision models gave, so
another cut-off can be tried without paying again. Both hold the test's
made-up household only, and no key. Files already there are kept beside the
new ones under the time they were written.

```bash
bun run eval:read             # the plan and the estimated cost; sends nothing
bun run eval:read --stand-in  # the whole run against stand-ins: no key, no bill
TYPESAFE_API_KEY=... ANTHROPIC_API_KEY=... bun run eval:read --yes
```

Keys come from the environment and are never printed or written. A way whose
key is not set is skipped, and the report says so:

| Variable                                        | Runs                                |
| ----------------------------------------------- | ----------------------------------- |
| `TYPESAFE_API_KEY`                              | Jev first, and Jev's three columns  |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Clef and Clef Flash, three columns  |
| `OPENAI_API_KEY`                                | OpenAI Decisions, its three columns |
| `ANTHROPIC_API_KEY`                             | Claude Haiku 4.5                    |
| `GEMINI_API_KEY`                                | Gemini 3.1 Flash Lite               |

It stops before the request that would take it past its spending cap, two
dollars for the whole run unless `--cap-usd` says otherwise.

The sentences and the made-up household they are read for are in
`scripts/read-eval-cases.ts`, in four sets:

- the 30 the test began with, written by the author of the rules, and 70
  written before the rules were opened. The rules were tuned against these
  100, so they can hardly lose there;
- 50 held out, written before that tuning and never tuned against. The audit
  that led to the documented usage read their misses, so they no longer
  judge it fairly;
- 50 fresh ones, written before any of the documented requests were, and
  before the rules or any model read them. Ten have a day, a time or a word
  of stress inside a name. They are the honest number, and the report shows
  them first. Do not fix a rule, a wording or a cut-off because of a miss in
  them or in the held-out 50: write a new sentence into the first 100.

How sure a decision model has to be before its answer is acted on is a
cut-off, one for each question. The run chooses each on the first 100
sentences alone: the least careful one that does no more harm there than the
best, then one step more careful. The report shows what every cut-off tried
would have done on every set. The documented requests name Jev's version
(`jev-1.13.0`) and not `jev-latest`, since a cut-off chosen against one model
says nothing about the next; Clef and OpenAI's Decisions API have no versions
to name, so the model each reply names is in the report.

The delays are measured from the machine that runs the test, one request at
a time. For Clef and Clef Flash that is Cloudflare's public REST API, which
is not what the app would see: a Worker reaches them through an AI binding
inside Cloudflare's network. `scripts/clef-speed/README.md` has an optional
Worker of its own, put up and taken down in three commands, that times them
from inside.

How the add bar uses Jev is one constant, `JEV_USE` in `src/lib/read.ts`:
`'first'` today, `'gaps'` for the rules first and Jev only for what they left
empty. Neither is the documented usage; that is in the test alone until it
has been run and chosen.

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
