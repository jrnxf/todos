// Everything the screens read and every change they make. The whole
// household list is a few hundred rows, so one read returns all of it and
// the screens group and filter in the browser.
import { createServerFn } from '@tanstack/react-start'
import { and, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { channelFor, notify } from '@/alerts/notify'
import { getDb, schema } from '@/db/client'
import { TAG_COLORS } from '@/db/schema'
import { addDays, localNow } from '@/lib/dates'
import { withPictures } from '@/lib/people'
import { READ_FIELDS } from '@/lib/read'
import { SIGNED_OUT } from '@/lib/signed-out'
import { env } from './env'
import { checkWithJev } from './jev-read'
import type { Channel } from '@/alerts/notify'
import type { AlertConfig } from '@/alerts/rules'
import type { Tag, Todo } from '@/db/schema'
import type { LocalDate, Stamp } from '@/lib/dates'
import type { PersonView } from '@/lib/people'
import type { Verdict } from '@/lib/verify'

/** How long a finished to-do stays on the board. */
const DONE_VISIBLE_DAYS = 7

export interface Board {
  /** The household's calendar date and wall clock, not the browser's. */
  today: LocalDate
  now: Stamp
  /** The household's zone, for placing a stored instant on its calendar day. */
  timeZone: string
  /** The person signed in on this device. */
  me: string
  /** The address `me` signs in with, for the account menu. */
  meEmail: string | null
  /** Everyone in the household, with the Google picture when there is one. */
  people: Array<PersonView>
  tags: Array<Tag>
  /** Open items, plus those finished in the last week. */
  items: Array<Todo>
  alertConfig: AlertConfig
  /** How alerts reach `me`: 'log' means none are really sent. */
  channel: Channel
  /** Whether the add bar may have Jev check a title (TYPESAFE_API_KEY is set). */
  jev: boolean
}

/**
 * Who is asking. The door (src/start.ts) lets nobody else reach a server
 * function, so the refusal here is for the types, and for the day that stops
 * being true.
 */
function signedIn(context: { person: string | null }): string {
  if (!context.person) throw new Error(SIGNED_OUT)
  return context.person
}

export const getBoard = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<Board> => {
    const me = signedIn(context)
    const db = getDb()
    const now = localNow(env.timeZone)
    const doneSince = new Date(
      Date.now() - DONE_VISIBLE_DAYS * 86_400_000,
    ).toISOString()

    const [tags, items, accounts] = await Promise.all([
      db.select().from(schema.tags),
      db
        .select()
        .from(schema.items)
        .where(
          and(
            isNull(schema.items.deletedAt),
            or(
              isNull(schema.items.doneAt),
              gte(schema.items.doneAt, doneSince),
            ),
          ),
        ),
      db
        .select({
          email: schema.authUser.email,
          image: schema.authUser.image,
        })
        .from(schema.authUser),
    ])

    return {
      today: now.date,
      now: now.stamp,
      timeZone: env.timeZone,
      me,
      meEmail: env.auth.emailFor(me),
      people: withPictures(env.people, accounts, env.auth.emailFor),
      tags,
      items,
      alertConfig: { ...env.alerts },
      channel: channelFor(me),
      jev: env.typesafe.apiKey !== '',
    }
  },
)

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const fields = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000),
  tagId: z.number().int().nullable(),
  assignee: z.string().nullable(),
  dueDate: date.nullable(),
  dueTime: time.nullable(),
  headsUpDays: z.array(z.number().int().min(1).max(365)).max(8),
  mustNotMiss: z.boolean(),
})

export type ItemFields = z.infer<typeof fields>

function knownPerson(id: string | null): string | null {
  return id && env.people.some((person) => person.id === id) ? id : null
}

export const addItem = createServerFn({ method: 'POST' })
  .validator(fields)
  .handler(async ({ data, context }): Promise<Todo> => {
    const me = signedIn(context)
    const db = getDb()
    const [created] = await db
      .insert(schema.items)
      .values({
        ...data,
        assignee: knownPerson(data.assignee),
        // A time means nothing without a date.
        dueTime: data.dueDate ? data.dueTime : null,
        createdAt: new Date().toISOString(),
        createdBy: me,
      })
      .returning()
    return created
  })

export const updateItem = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), patch: fields.partial() }))
  .handler(async ({ data }): Promise<void> => {
    const patch = { ...data.patch }
    if ('assignee' in patch) {
      patch.assignee = knownPerson(patch.assignee ?? null)
    }
    if (patch.dueDate === null) patch.dueTime = null
    const db = getDb()
    await db.update(schema.items).set(patch).where(eq(schema.items.id, data.id))
  })

export const setDone = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), done: z.boolean() }))
  .handler(async ({ data, context }): Promise<void> => {
    const me = signedIn(context)
    const db = getDb()
    await db
      .update(schema.items)
      .set(
        data.done
          ? { doneAt: new Date().toISOString(), doneBy: me }
          : { doneAt: null, doneBy: null },
      )
      .where(eq(schema.items.id, data.id))
  })

/** Soft delete; `deleted: false` brings the to-do back. */
export const setDeleted = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), deleted: z.boolean() }))
  .handler(async ({ data }): Promise<void> => {
    const db = getDb()
    await db
      .update(schema.items)
      .set({ deletedAt: data.deleted ? new Date().toISOString() : null })
      .where(eq(schema.items.id, data.id))
  })

/**
 * What Jev makes of the rules' reading of a new to-do's title: a tag where
 * they read none, and whether the date they read is one. Null: switched off,
 * nothing to ask, or the service could not be reached in time, and the add
 * bar's own reading stands. `skip` is the fields set by hand or taken back.
 */
export const checkTitleWithJev = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().trim().min(1).max(200),
      skip: z.array(z.enum(READ_FIELDS)).max(READ_FIELDS.length),
    }),
  )
  .handler(async ({ data, context }): Promise<Verdict | null> => {
    const me = signedIn(context)
    const apiKey = env.typesafe.apiKey
    if (!apiKey) return null
    const tags = await getDb().select().from(schema.tags)
    return checkWithJev(
      data.title,
      {
        today: localNow(env.timeZone).date,
        me,
        people: env.people,
        tags,
        skip: new Set(data.skip),
      },
      { apiKey, endpoint: env.typesafe.url },
    )
  })

const tagFields = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(TAG_COLORS),
})

/** Makes a tag. Asked for a name that exists, it hands back that one. */
export const addTag = createServerFn({ method: 'POST' })
  .validator(tagFields)
  .handler(async ({ data }): Promise<Tag> => {
    const db = getDb()
    const made = await db
      .insert(schema.tags)
      .values(data)
      .onConflictDoNothing()
      .returning()
    if (made.length > 0) return made[0]
    const [existing] = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, data.name))
    return existing
  })

export const updateTag = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), patch: tagFields.partial() }))
  .handler(async ({ data }): Promise<void> => {
    const db = getDb()
    await db
      .update(schema.tags)
      .set(data.patch)
      .where(eq(schema.tags.id, data.id))
  })

/** Its to-dos stay, with no tag. */
export const deleteTag = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ data }): Promise<void> => {
    const db = getDb()
    await db.delete(schema.tags).where(eq(schema.tags.id, data.id))
  })

export interface SentAlert {
  /** Household wall-clock time it went out, 'HH:MM'. */
  time: string
  kind: string
  /** 0 for the digest. */
  itemId: number
  /** The to-do's title, or null for the digest or a to-do since deleted. */
  title: string | null
}

/**
 * The alerts that really went to whoever is asking on one day, from the
 * scheduler's own record. The Day view shows these as sent; what is still to
 * come it works out from the rules.
 */
export const getSentAlerts = createServerFn({ method: 'GET' })
  .validator(z.object({ date }))
  .handler(async ({ data, context }): Promise<Array<SentAlert>> => {
    const me = signedIn(context)
    const db = getDb()
    const rows = await db
      .select({
        kind: schema.alertsSent.kind,
        itemId: schema.alertsSent.itemId,
        sentAt: schema.alertsSent.sentAt,
        title: schema.items.title,
      })
      .from(schema.alertsSent)
      .leftJoin(schema.items, eq(schema.items.id, schema.alertsSent.itemId))
      .where(
        and(
          eq(schema.alertsSent.person, me),
          // A day on either side covers the household's offset from UTC;
          // the exact day is settled below, in household time.
          gte(schema.alertsSent.sentAt, `${addDays(data.date, -1)}T00:00`),
          lt(schema.alertsSent.sentAt, `${addDays(data.date, 2)}T00:00`),
        ),
      )
    return rows
      .map((row) => ({
        ...row,
        at: localNow(env.timeZone, new Date(row.sentAt)),
      }))
      .filter((row) => row.at.date === data.date)
      .sort((a, b) => a.at.time.localeCompare(b.at.time))
      .map((row) => ({
        time: row.at.time,
        kind: row.kind,
        itemId: row.itemId,
        title: row.title,
      }))
  })

/** Sends one alert to whoever is asking, so they can see it arrive. */
export const sendTestAlert = createServerFn({ method: 'POST' }).handler(
  async ({ context }): Promise<{ channel: Channel }> => {
    const me = signedIn(context)
    await notify({
      person: me,
      title: 'Test alert',
      message: 'If you can read this, alerts reach this phone.',
      priority: 0,
      path: '/',
    })
    return { channel: channelFor(me) }
  },
)
