// One pass of the scheduler: send whatever fell due since the last pass. A
// Cron Trigger runs it once a minute (src/server.ts).
//
// The watermark is the wall-clock stamp the previous pass reached. Each pass
// covers (watermark, now], so an alert whose minute was skipped goes out late
// instead of never, and an alert whose time was already behind us when its
// to-do was created is never sent at all. Each alert is claimed in
// alerts_sent before it is sent, so two passes that overlap cannot send it
// twice.
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '@/db/client'
import { addMinutes, localNow } from '@/lib/dates'
import { env } from '@/server/env'
import { notify } from './notify'
import { alertsInWindow } from './rules'
import type { PlannedAlert } from './rules'

const WATERMARK = 'alerts_watermark'
/** After a long gap, how far back a pass still looks. */
const MAX_CATCH_UP_MINUTES = 24 * 60

type Db = ReturnType<typeof getDb>

export async function tick(instant: Date = new Date()): Promise<void> {
  const db = getDb()
  const to = localNow(env.timeZone, instant).stamp

  const stored = await db
    .select()
    .from(schema.meta)
    .where(eq(schema.meta.key, WATERMARK))
    .get()
  // First run ever: start from now, with nothing behind us to catch up on.
  if (!stored) return setWatermark(db, to)

  const earliest = addMinutes(to, -MAX_CATCH_UP_MINUTES)
  const from = stored.value < earliest ? earliest : stored.value
  if (from >= to) return

  const items = await db
    .select()
    .from(schema.items)
    .where(and(isNull(schema.items.doneAt), isNull(schema.items.deletedAt)))
  const planned = alertsInWindow({
    items,
    people: env.people,
    from,
    to,
    config: env.alerts,
  })

  let failed = false
  for (const alert of planned) {
    if (!(await claim(db, alert))) continue
    try {
      await notify(alert)
    } catch (error) {
      failed = true
      await release(db, alert)
      console.error(`[alerts] ${alert.kind} for ${alert.person} failed:`, error)
    }
  }
  // Leave the watermark behind a failure so the next pass tries it again;
  // what did go out is already claimed and will not repeat.
  if (failed) return
  await setWatermark(db, to)
  await heartbeat()
}

async function setWatermark(db: Db, stamp: string): Promise<void> {
  await db
    .insert(schema.meta)
    .values({ key: WATERMARK, value: stamp })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value: stamp } })
}

/** True when this pass is the first to take the alert. */
async function claim(db: Db, alert: PlannedAlert): Promise<boolean> {
  const inserted = await db
    .insert(schema.alertsSent)
    .values({
      itemId: alert.itemId,
      kind: alert.kind,
      forDate: alert.forDate,
      person: alert.person,
      sentAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ itemId: schema.alertsSent.itemId })
  return inserted.length > 0
}

async function release(db: Db, alert: PlannedAlert): Promise<void> {
  await db
    .delete(schema.alertsSent)
    .where(
      and(
        eq(schema.alertsSent.itemId, alert.itemId),
        eq(schema.alertsSent.kind, alert.kind),
        eq(schema.alertsSent.forDate, alert.forDate),
        eq(schema.alertsSent.person, alert.person),
      ),
    )
}

/** Tell the outside watcher, if there is one, that a pass completed. */
async function heartbeat(): Promise<void> {
  if (!env.heartbeatUrl) return
  try {
    await fetch(env.heartbeatUrl, { signal: AbortSignal.timeout(5_000) })
  } catch (error) {
    console.error('[alerts] heartbeat failed:', error)
  }
}
