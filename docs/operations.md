# Running it

How the app is put together once deployed, how to set up your own, and what to
look at when something seems off. `<your-app>` below stands for the address
your Worker is served at, such as `todos.jrnxf.co`.

## Shape

- One Worker: a TanStack Start app, deployed with wrangler from this repo.
- One D1 database (SQLite). Schema changes are SQL files under `drizzle/`,
  applied with wrangler.
- One Cron Trigger, every minute, which is the whole alert scheduler and the
  Google Calendar sync's backstop.
- Sign-in with Google (Better Auth), limited to a list of addresses. The
  address is public, but all it shows a stranger is the sign-in page.
- Optionally, each person's own Google Calendar, kept in step with the list
  both ways, and their other Google calendars shown beside the to-dos.

The database holds only what the household creates (to-dos, tags, sign-in
sessions), each connected calendar's sealed tokens, what Google granted it
and its record of which event is which to-do, the ids of the other
calendars each person chose to see, a few rows of scheduler state, and the
migration history. Who lives in the house is a setting, not a table.

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

4. **Custom domain.** A custom domain is required, because the temporary
   `workers.dev` address is off. Attach your own domain to the Worker in the
   Cloudflare dashboard: Workers > todos > Settings > Domains & Routes, or
   add a `routes` entry with `custom_domain: true` in your own copy of
   `wrangler.jsonc` before deploying.

5. **Deploy.**

   ```bash
   bun run db:migrate:remote
   bun run deploy
   ```

## Who gets in

Only the Google accounts named in `PEOPLE_EMAILS`, and each one is the person
it is listed against. Everything else is refused in one place,
`src/start.ts`: a page request is sent to `/signin`, a data request gets a 401. Four paths answer without a session: `/signin`, `/api/auth/*` (the
sign-in machinery), `/api/health`, and `/api/calendar/notify`, which Google
Calendar calls on a change and which believes only a call that carries the
channel, resource and token the app gave Google.

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

## Google Calendar (optional)

Each person can connect their own Google account from the account page.
The app then makes a calendar called **Todos** in that account and keeps it
in step with the list, both ways:

- Every to-do with a deadline is an event in it, whoever the to-do is for.
  One with a time is a half-hour event at that time; one without is an
  all-day event. A to-do finished more than 30 days ago is not added when
  someone connects.
- Renaming, re-dating, finishing or deleting a to-do changes or removes its
  event, within seconds. Finished shows as a mark in front of the title:
  "✓ Renew passports".
- The same in Google Calendar changes the to-do: rename or move the event,
  put ✓ (or `[x]`) in front of the title to finish it or take it out to
  undo that, or delete the event to delete the to-do. Notes travel too.
  Tags, who it is for, heads-ups and must-not-miss stay as they are.
- An event made in the Todos calendar becomes a to-do, for either of you,
  and shows up in everyone else's Todos calendar. A repeating event is left
  alone.
- When a to-do and its event both changed before the two caught up, the one
  changed last wins.
- Nothing outside the Todos calendar is written, and nothing outside it is
  read unless the person asks to see their other calendars (below). The
  app asks Google for `calendar.app.created`, which reaches only calendars
  the app made itself: not the primary calendar, and not any other.

**Disconnect** on the account page deletes the Todos calendar from that
Google account, stops Google calling, withdraws the app's access and forgets
the tokens and which event is which to-do. It is there also when the link
has a problem. When access was withdrawn in Google, the app can no longer
delete the Todos calendar, so it stays in that Google account and can be
deleted there. The to-dos stay, those made in the calendar too.

### Seeing your other calendars

Each person can also see the events of their other Google calendars (their
own, a shared family one, a school's) in Day, Week and Month, beside the
to-dos. It is off until they turn it on, and only they see their own.

Where the sync was already running, before anyone turns this on: add the
two scopes below in the Google Cloud console (step 1 of
[Turning it on](#turning-it-on)), then `bun run db:migrate:remote` and
`bun run deploy`, back to back.

- **Turning it on.** Under Google Calendar on the account page, **Your
  other calendars**, **Show**; or the calendar button by the arrows at
  home (by the avatar on a phone), **Choose calendars**. Google asks once
  more, for two read-only scopes on top of the one the sync already has:
  - `calendar.calendarlist.readonly`, the list of the person's calendars
    with the colour each has, to choose from;
  - `calendar.events.readonly`, the events in them.

  Together they read less than `calendar.readonly`, which would also read
  each calendar's settings and who it is shared with, and neither can
  change anything. Nobody who never turns this on is asked for them, and
  the sync carries on as it was if the person says no.

- **Choosing.** A switch for each calendar, on the account page and in that
  button's popover. None is shown until the person picks one, the Todos
  calendar is never offered (it is the to-dos themselves), and twelve at
  most can be shown.
- **What shows.** Each event once a day it touches, after the day's to-dos,
  marked with its calendar's colour and outlined rather than filled, with
  no box to tick. Tapping one in Day, or in the open square of Week or
  Month, opens it in Google Calendar. Events the person declined, and
  cancelled ones, are left out. An event is never a to-do and the app never
  writes to these calendars.
- **What is kept.** Only which calendars each person chose, by Google's
  calendar id (`calendars_shown`), and the granted scopes on their link. A
  chosen calendar Google no longer lists for the person (they left it, or
  lost access) is forgotten the next time the list is read.
  Names, colours and events are asked of Google while the home page is
  open, one request for the list and one per shown calendar for the month
  on screen, and are kept only in that browser: asked again when the page
  comes back into view after two minutes, and every five minutes while it
  stays open. Nothing of them is stored in the database or the Worker.
  Each ask fetches only an event's title, times, link, status and the
  person's own answer to an invitation: no descriptions, places or guests.
- **Turning it off.** Turn every switch off, and no events are read; the
  list of calendars is read only while the account page or the popover
  shows it.
  **Disconnect** forgets the choices with the rest and withdraws all of the
  app's access, the read-only scopes included; connecting again later asks
  for the calendar sync alone.

How a change travels: Google calls `/api/calendar/notify` on every change
to a Todos calendar (a push channel, renewed every week), and the app asks
Google what changed since it last asked. A change in the app starts the
same pass straight away. Every quarter of an hour the cron runs a pass
anyway, in case a call from Google went missing. One pass makes at most 40
requests to Google; a longer first fill carries on a minute later.

### Turning it on

1. In the Google Cloud console, in the project of the sign-in client:
   - **APIs & Services > Library**: enable the **Google Calendar API**.
   - **Google Auth Platform > Data Access** (the OAuth consent screen's
     scopes): add `https://www.googleapis.com/auth/calendar.app.created`,
     and, for seeing other calendars,
     `https://www.googleapis.com/auth/calendar.calendarlist.readonly` and
     `https://www.googleapis.com/auth/calendar.events.readonly`. Google
     only grants a scope listed here.
   - **Google Auth Platform > Clients**, the sign-in client: add these
     authorised redirect URIs next to the sign-in ones:

     ```
     https://<your-app>/api/calendar/callback
     http://localhost:3001/api/calendar/callback
     ```

   - **Google Auth Platform > Audience**: if the publishing status is
     **Testing**, Google lets a calendar connection last only 7 days. Press
     **Publish app** to make it **In production**. Without Google's review of
     the app, each person sees "Google hasn't verified this app" once when
     connecting, and goes on through **Advanced**, which is fine for a
     household.

2. Set the key that seals the calendar tokens in the database:

   ```bash
   bunx wrangler secret put CALENDAR_TOKEN_KEY   # openssl rand -base64 32
   ```

   Changing it later cuts every calendar off; each person connects again.

3. Apply the migration and deploy (`bun run db:migrate:remote`, then
   `bun run deploy`, as in [Deploying a change](#deploying-a-change)).
4. Each person: open the app, tap the avatar, **Connect** under Google
   Calendar, and say yes to Google.

Until the key and the sign-in client are both set, the account page says
Google Calendar is not set up, and nothing is sent to Google. A dev server
on `http://localhost` gets no push channel (Google calls only https
addresses), so there a change made in Google Calendar arrives with the next
change in the app or the quarter-hour pass.

### When a calendar stops

The account page says so, with **Reconnect**, when Google stopped letting
the app in (access withdrawn at myaccount.google.com, or the key changed)
or when the Todos calendar was deleted in Google. Reconnecting after the
first carries on with the same calendar; after the second it makes a new
one.

```bash
bunx wrangler d1 execute DB --remote --command \
  "select person, problem, last_synced_at, channel_expires_at from calendar_links"
```

When a person's other calendars stop showing, `scopes` on the same row says
whether the two read-only scopes are still granted. Reconnecting after the
Todos calendar was deleted keeps them (the app asks Google to keep what was
given before); after access was withdrawn they went with the rest, and the
account page offers **Show** again.

`last_synced_at` is the last pass that completed for that person, UTC.

## Reading titles with Jev (optional)

The add bar fills its buttons from what is typed: "Sam: dentist fri 5pm !" is
Sam's, on Friday at five, and must not be missed. It does that with rules in
the page, which read only what is said outright and write the tidied title.

Given a key, the rules' reading is then checked by
[Jev](https://docs.typesafe.ai), TypeSafe AI's decision model, once typing
pauses. It is asked only the two things that take judgment, in one request
(`src/lib/verify.ts`):

- **Which tag**, where the rules found none: "Split the hostas" names no tag
  and has no word the rules know. Jev picks from your tags, each described,
  or picks none. It is asked twice, with the options in either order, and
  fills the tag only when both answers agree and are at least 60% sure.
- **Whether a date is one**, where the rules read a date: in "Order Taco
  Tuesday supplies" the rules read Tuesday. Jev is asked whether those words
  say when the to-do is due, and when it is 40% sure or less that they do,
  the date is taken away and the words go back in the title.

Jev never writes a date, a time, a person or a title, and never touches
anything else the rules read. A tag it picked shows under the title as
"Guessed", and one tap takes it back. A button you set yourself, or took
back, is not asked about and is never filled again. Anything short of a sure
answer leaves the rules' reading as it was: an unsure answer, a reply slower
than a second and a half, an error, or no connection.

The request names the model version (`jev-1.13.0`), not `jev-latest`: the
two cut-offs above were chosen against that version by the test below, and
say nothing about the next. To move to a newer version, change `JEV_VERSION`
in `src/lib/verify.ts`, run the test, and put the cut-offs it chooses in
`CUTOFFS` beside it.

It is off until you give the Worker a key:

```bash
bunx wrangler secret put TYPESAFE_API_KEY
```

With the key set, this is sent to TypeSafe AI, a company outside the
household, when typing pauses on a new to-do that leaves one of those two
things to judge: the title as typed so far, today's date, and your tag
names. Nothing else is: no names of the household but one typed into the
title, no notes, no other to-dos, no addresses. Nothing is sent for a to-do
whose tag the rules read and that has no date. Delete the secret
(`bunx wrangler secret delete TYPESAFE_API_KEY`) and deploy to turn it off
again: nothing is sent, and the add bar reads titles with its rules alone, as
it does without a key.

Jev is charged by what is sent: roughly 2,800 tokens for a request that asks
both, which at the listed $0.042 per million is about $0.0001 for each pause
in typing.

### Checking how well it reads

`bun run eval:read` measures it, and asks whether the app should have Jev
check more than it does. It reads 400 household sentences, each with the fill
a person would expect, six ways on the same inputs:

- **Rules alone**: the rules in the page, and nothing sent.
- **Verify, Jev**: what the add bar does. The test asks the add bar's own
  request and reads the reply with the add bar's own code
  (`src/lib/verify.ts`), at the add bar's own cut-offs, so it measures what
  the app runs.
- **Verify + who, Jev**: test only. Jev is also asked, of each household
  name in the title, whether that person is the one to do it or is only
  mentioned ("Pick Michelle up from the airport", "Sam's haircut"). A no
  takes back a person the rules read; a yes fills one where they read none.
- **Verify + title, Jev**: test only. Jev is also asked, of each phrase the
  rules took out of the title to say who, ask for a reminder or stress it,
  whether the phrase is part of the task after all. A yes puts it back.
- **Verify + who + title, Jev**: test only, both of those.
- **Verify, Clef**: for comparison, the add bar's request sent to
  Cloudflare's Clef instead.

The wider ways ask the documented way too (`scripts/read-eval-verify.ts`):
code finds the candidates, Jev answers yes or no about each, and nothing is
counted or written by it. One request a sentence carries every question for
Jev, and its four columns are read out of the one reply.

It writes `data/read-eval/report.md`. First comes one table: the fields each
way missed, set by set, and under it the answer in plain words, on the unseen
sentences: which way missed fewest, how far that is from the rules alone, and
whether asking more than the app does won anything. Then the hit rate per
field, what each cut-off costs, every miss, one table of the speed (median,
9 in 10, slowest, and how many answers came later than the add bar waits),
the tokens and the cost a to-do, and where each provider's endpoint, limits
and price were read. Beside it, `results.json` holds every raw probability
the models gave, so another cut-off can be tried without paying again. Both
hold the test's made-up household only, and no key. Files already there are
kept beside the new ones under the time they were written.

```bash
bun run eval:read             # the plan and the estimated cost; sends nothing
bun run eval:read --stand-in  # the whole run against stand-ins: no key, no bill
TYPESAFE_API_KEY=... bun run eval:read --yes
```

Keys come from the environment and are never printed or written. A way whose
key is not set is skipped, and the report says so:

| Variable                                        | Runs               |
| ----------------------------------------------- | ------------------ |
| `TYPESAFE_API_KEY`                              | Jev's four columns |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Verify, Clef       |

With the keys in a file of `NAME=value` lines, a subshell loads them for the
one run and leaves the shell you type in without them:

```bash
(set -a; source ~/.todos-eval-keys; set +a; bun run eval:read)        # the plan
(set -a; source ~/.todos-eval-keys; set +a; bun run eval:read --yes)  # the run
```

It stops before the request that would take it past its spending cap, two
dollars for the whole run unless `--cap-usd` says otherwise.

The sentences and the made-up household they are read for are in
`scripts/read-eval-cases.ts`, in six sets:

- the 30 the test began with, written by the author of the rules, and 70
  written before the rules were opened. The rules were tuned against these
  100, so they can hardly lose there;
- 50 held out and 50 fresh, each written before the tuning or the requests
  it was to judge. Their misses have since been read, and the rule faults
  they showed fixed, so they no longer judge the rules. They are kept to set
  beside earlier runs;
- 100 unseen, written before those faults were fixed and before the wider
  questions were. Half of them tempt a wrong person or a wrong title: a name
  that is only mentioned, and a day, a number or a word of stress that
  belongs to the task. The rules were later fixed for their misses, so they
  are now tuned as well;
- 100 untouched, written before those fixes, with the same mix and traps of
  their own. They are the honest number, and the report shows them first.
  Do not fix a rule, a wording or a cut-off because of a miss in them: write
  a new sentence into a tuned set.

How sure a decision model has to be before its answer is acted on is a
cut-off, one for each question. The app does not choose them as it runs: it
acts on the two in `CUTOFFS` (`src/lib/verify.ts`), and Jev's columns are
read at those. Every other cut-off is chosen by the run on the first 100
sentences alone: the least careful one that does no more harm there than the
best, then one step more careful. The rules miss nothing on those sentences,
so they show where a cut-off starts to do harm and not what it wins, which
makes the choice a fragile one. The report shows what every cut-off tried
would have done on every set, and under each table the cut-off that would
have missed fewest on the other 200 sentences. That one is hindsight, picked
with the answers in hand: it is not used for any number in the report, and
is there to show how much hangs on the choice. Clef has no versions to name,
so the model each reply names is in the report.

The delays are measured from the machine that runs the test, one request at
a time. For Clef that is Cloudflare's public REST API, which is not what an
app would see: a Worker reaches it through an AI binding inside Cloudflare's
network. `scripts/clef-speed/README.md` has an optional Worker of its own,
put up and taken down in three commands, that times it from inside.

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
