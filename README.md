# todos

A to-do list for one household. Add a thing, give it a deadline, tick it off,
and get told on your phone before the deadline bites. Built for two people who
share the house, the kids and the paperwork, and who each need to see the same
list.

- **Views:** today, what is up next, a calendar (month and agenda), everything,
  and what got done this week.
- **Areas** with a colour each, made by you: House, Kids, whatever fits.
- **Alerts** through [Pushover](https://pushover.net): a morning digest, a
  heads-up some days before, a nudge an hour before a timed to-do, and a "must
  not miss" switch that alerts everyone until it is done.
- **Sign-in with Google**, limited to the addresses you list. Nobody else sees
  anything but the sign-in page.
- Works as a Home Screen app on a phone, and with a sidebar on a laptop.

It is a TanStack Start app on Cloudflare Workers with stock shadcn/ui, one D1
database, a Cron Trigger for the alerts, and Better Auth for sign-in. Running
it on Cloudflare, not on a machine at home, means alerts still go out when the
house has no power or no internet.

## Run it

```bash
cp .dev.vars.example .dev.vars   # no secrets needed: dev signs you in as alex
bun install
bun run db:migrate:local         # creates the local D1 database
bun run db:seed:local            # optional: a believable list, dated around today
bun run dev                      # http://localhost:3001
```

The dev server runs the server side in workerd, the same runtime as deployed,
against a local D1 database under `.wrangler/`. `DEV_SIGNED_IN_AS` in
`.dev.vars` stands in for signing in; it only works under `vite dev` and is
compiled out of the build. Empty it to go through Google for real, which
needs the four sign-in settings in the same file. With no Pushover token set,
alerts are printed to the terminal instead of sent. To run one scheduler pass
by hand:

```bash
curl "http://localhost:3001/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

```bash
bun run test        # the alert rules and the date reading
bun run typecheck
bun run lint
bun run check       # formatting
bun run db:generate # after editing src/db/schema.ts: writes the next migration
bun run deploy      # build, then wrangler deploy
```

`lefthook install` once, and the same checks run before each commit and push.

## Run your own

Everything about a household is a setting on the Worker, so nothing in this
repo has to change except the database it points at.
[docs/operations.md](docs/operations.md) has the full steps: make a D1
database, make a Google sign-in client, set the settings, deploy.

## Where things live

| Path                     | What                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `wrangler.jsonc`         | The Worker: database binding, cron, and the shared settings     |
| `src/server.ts`          | The Worker entry: requests, plus the cron that calls the tick   |
| `src/start.ts`           | The front door: nothing but sign-in is served to a stranger     |
| `src/server/auth.ts`     | Better Auth: Google sign-in, sessions, the `auth_` tables       |
| `src/server/identity.ts` | "Who is asking": the session's Google account, looked up        |
| `src/server/env.ts`      | Every setting, validated at boot                                |
| `src/server/board.ts`    | Every read and write the screens make                           |
| `src/db/schema.ts`       | The tables. Migrations under `drizzle/` are applied by wrangler |
| `src/lib/dates.ts`       | Dates as household-local strings, never UTC instants            |
| `src/lib/when.ts`        | Date shortcuts, and reading a date out of a title. With tests   |
| `src/alerts/rules.ts`    | Which alerts exist and when. Pure, with tests                   |
| `src/alerts/tick.ts`     | One scheduler pass: send what fell due since the last pass      |
| `src/alerts/notify.ts`   | The one way an alert leaves the app (Pushover today)            |
| `src/routes/`            | Today, Up next, List, Calendar, Done, Account, and sign-in      |
| `src/components/app/`    | Capture bar, pickers, calendar views, sidebar, the to-do drawer |
| `src/components/ui/`     | Stock shadcn components. Add more with `bunx shadcn add`        |

## Four seams, kept on purpose

So the app can run in someone else's house without a rewrite:

1. Alerts leave through one function, `notify()`.
2. Identity is answered in one file, `src/server/identity.ts`, and enforced
   in one other, `src/start.ts`. Another way to sign in changes those two and
   `src/server/auth.ts`, not what calls them.
3. Every setting comes from the environment; nothing in the repo names a
   household.
4. People come from a setting, not hard-coded names, and live in no table.
