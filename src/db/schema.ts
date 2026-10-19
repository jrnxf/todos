import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** The colours a tag can have. Kept apart from the red and amber that mean late and soon. */
export const TAG_COLORS = [
  'blue',
  'teal',
  'green',
  'amber',
  'red',
  'pink',
  'violet',
  'gray',
] as const
export type TagColor = (typeof TAG_COLORS)[number]

// What a to-do is filed under: House, Kids, Paperwork, and whatever else the
// household makes. A thing of its own so it can carry a colour and be renamed
// in one place. It was called an area, and the table and the column that
// points at it keep that name in the database (drizzle/0001_areas.sql); this
// file is the one place the two words meet.
export const tags = sqliteTable('areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').$type<TagColor>().notNull(),
})

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes').notNull().default(''),
  // null is "no tag". Deleting a tag leaves its to-dos with none.
  tagId: integer('area_id').references(() => tags.id, {
    onDelete: 'set null',
  }),
  // A person's id from the PEOPLE setting (who lives here is configuration,
  // not a table); null means either of us.
  assignee: text('assignee'),
  // Household-local calendar date and wall-clock time (lib/dates.ts), not
  // UTC instants. A time only exists alongside a date.
  dueDate: text('due_date'),
  dueTime: text('due_time'),
  // Days before the deadline to send a heads-up, e.g. [3, 1].
  headsUpDays: text('heads_up_days', { mode: 'json' })
    .$type<Array<number>>()
    .notNull()
    .default([1]),
  mustNotMiss: integer('must_not_miss', { mode: 'boolean' })
    .notNull()
    .default(false),
  // UTC instants from here down.
  doneAt: text('done_at'),
  doneBy: text('done_by'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by'),
  // Delete is soft, so a slip of the thumb can be undone.
  deletedAt: text('deleted_at'),
  // The last change to the row, from the app or from a Google Calendar.
  // Calendar sync settles a change made on both sides by which came last
  // (src/calendar/sync.ts). Every write through drizzle stamps it; the
  // constant default only covers rows from before the column existed, which
  // the migration stamps with their creation.
  updatedAt: text('updated_at')
    .notNull()
    .default('1970-01-01T00:00:00.000Z')
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
})

// One row per alert that went out. The key is what makes the scheduler safe
// to restart: a second attempt at the same alert cannot insert, so it cannot
// send. `itemId` is 0 for the morning digest, which belongs to no single item.
export const alertsSent = sqliteTable(
  'alerts_sent',
  {
    itemId: integer('item_id').notNull(),
    kind: text('kind').notNull(),
    forDate: text('for_date').notNull(),
    person: text('person').notNull(),
    sentAt: text('sent_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.kind, t.forDate, t.person] })],
)

// Small key-value store; holds the scheduler's watermark.
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// Google Calendar, one row per person who connected theirs: their own
// "Todos" calendar, kept in step with the list (src/calendar/). Every to-do
// with a deadline is an event in it, whoever the to-do is for.
export const calendarLinks = sqliteTable('calendar_links', {
  // A person's id from the PEOPLE setting.
  person: text('person').primaryKey(),
  // Both tokens are sealed with the CALENDAR_TOKEN_KEY setting
  // (src/calendar/seal.ts), never stored as Google issued them.
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessTokenExpiresAt: integer('access_token_expires_at'),
  // The calendar the app made. Null only until the first sync makes it.
  calendarId: text('calendar_id'),
  // Google's place in the calendar's history: the next sync asks only for
  // what changed after it.
  syncToken: text('sync_token'),
  // The push channel Google calls on a change (/api/calendar/notify). The
  // token Google sends back with each call is kept only as a hash.
  channelId: text('channel_id'),
  channelResourceId: text('channel_resource_id'),
  channelTokenHash: text('channel_token_hash'),
  // Unix milliseconds, as Google gives it.
  channelExpiresAt: integer('channel_expires_at'),
  // Null while it works. Otherwise why it stopped, and the person has to
  // connect again: 'revoked' (access withdrawn in Google) or 'calendar_gone'
  // (the Todos calendar was deleted there).
  problem: text('problem').$type<'revoked' | 'calendar_gone'>(),
  // What Google granted, space-separated, as its last grant said. The
  // Todos calendar's own scope always; those that read and change their
  // other calendars too once the person asked to see them
  // (src/calendar/google.ts).
  // Links from before this column had only the first.
  scopes: text('scopes')
    .notNull()
    .default('https://www.googleapis.com/auth/calendar.app.created'),
  // UTC instants.
  connectedAt: text('connected_at').notNull(),
  lastSyncedAt: text('last_synced_at'),
})

// Which of a person's other Google calendars they chose to see in the day,
// week and month views, by Google's calendar id. Only the choice is kept:
// the calendars' names, colours and events are asked of Google when the
// views are open (src/calendar/read.ts), and never stored. None until the
// person picks one, and gone with the link on Disconnect.
export const calendarsShown = sqliteTable(
  'calendars_shown',
  {
    person: text('person')
      .notNull()
      .references(() => calendarLinks.person, { onDelete: 'cascade' }),
    calendarId: text('calendar_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.person, t.calendarId] })],
)

// Which event in a person's Todos calendar is which to-do, and what was last
// written to it. `etag` is Google's version of the event as the app last
// wrote or read it, so the app knows its own writes when they come back.
// `hash` is the to-do's content as it last agreed with the event, so a change
// in the app is seen as one. `event_hash` is what the event itself last said,
// part by part, so a change in the calendar is seen as one, and only the
// parts it changed travel.
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    person: text('person')
      .notNull()
      .references(() => calendarLinks.person, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    etag: text('etag').notNull(),
    hash: text('hash').notNull(),
    eventHash: text('event_hash').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.person, t.itemId] }),
    uniqueIndex('calendar_events_event').on(t.person, t.eventId),
  ],
)

// Sign-in. These four tables belong to Better Auth (src/server/auth.ts),
// which reads and writes them by these property names; nothing else in the
// app touches them. A row in `auth_user` is a Google account that got in,
// not a member of the household: who that is, is decided by matching its
// email against the PEOPLE_EMAILS setting (src/server/identity.ts).
const instant = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: instant('created_at').notNull(),
  updatedAt: instant('updated_at').notNull(),
})

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: instant('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_session_user_id').on(t.userId)],
)

export const authAccount = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: instant('access_token_expires_at'),
    refreshTokenExpiresAt: instant('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [index('auth_account_user_id').on(t.userId)],
)

// Short-lived: the state of a sign-in that is halfway through Google.
export const authVerification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [index('auth_verification_identifier').on(t.identifier)],
)

export type Todo = typeof items.$inferSelect
export type Tag = typeof tags.$inferSelect
export type CalendarLink = typeof calendarLinks.$inferSelect
export type CalendarEvent = typeof calendarEvents.$inferSelect
