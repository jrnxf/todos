// What a to-do looks like as an event in someone's Todos calendar, and what
// an event there says about its to-do. Pure, so both directions are tested
// without Google (mapping.test.ts).
//
// Only what a calendar can show travels: the title, the notes, the deadline
// and whether it is done. A calendar has no box to tick, so done is a mark in
// front of the title: "✓ Renew passports". Typing that mark in Google
// Calendar ticks the to-do; taking it out unticks it. Tags, who it is for,
// heads-ups and must-not-miss stay in the app and are never touched by a
// change in a calendar.
import { addDays, addMinutes, localNow, toStamp } from '@/lib/dates'
import type { Todo } from '@/db/schema'
import type { LocalDate, LocalTime } from '@/lib/dates'

/** The parts of a Calendar API event the app reads or writes. */
export interface GoogleEvent {
  id: string
  etag: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  start?: EventTime
  end?: EventTime
  /** RFC 3339: when the event last changed, by anyone. */
  updated?: string
  recurrence?: Array<string>
  recurringEventId?: string
  extendedProperties?: { private?: Record<string, string> }
}

export interface EventTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

/** What an event is written from, and what is read back out of one. */
export interface EventContent {
  title: string
  notes: string
  dueDate: LocalDate
  dueTime: LocalTime | null
  done: boolean
}

export const DONE_MARK = '✓'
/** Any of these at the start of a title means done. */
const DONE_PREFIX = /^\s*(?:✓|✔|☑|✅|\[x\])\s*/iu

/** A timed to-do is a half-hour event starting at its time. */
const TIMED_MINUTES = 30
/** Where the event says which to-do it is, in case the app loses its own record. */
export const ITEM_PROPERTY = 'todosItem'

const MAX_TITLE = 200
const MAX_NOTES = 5000

/** How long a finished to-do still gets an event made for it. */
const DONE_KEPT_DAYS = 30

/**
 * Whether a to-do belongs in the calendar. One with a deadline does, until
 * it is deleted or loses its deadline. A to-do finished long ago is not put
 * there when someone connects, so connecting does not fill months past with
 * old events, but one that already has an event keeps it.
 */
export function belongsInCalendar(
  item: Todo,
  hasEvent: boolean,
  now: Date,
): boolean {
  if (item.deletedAt !== null || item.dueDate === null) return false
  if (item.doneAt === null || hasEvent) return true
  return now.getTime() - Date.parse(item.doneAt) < DONE_KEPT_DAYS * 86_400_000
}

export function contentOf(item: Todo): EventContent {
  if (item.dueDate === null) throw new Error(`to-do ${item.id} has no date`)
  return {
    title: item.title,
    notes: item.notes,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    done: item.doneAt !== null,
  }
}

/**
 * A fingerprint of an event's content. Two sides that agree have the same
 * one, so a change is seen by comparing it with the one last written.
 */
export async function contentHash(content: EventContent): Promise<string> {
  return digest(JSON.stringify(FIELDS.map((field) => content[field])))
}

const FIELDS = ['title', 'notes', 'dueDate', 'dueTime', 'done'] as const

/**
 * A fingerprint of each part of an event's content, in one string, so what
 * changed in an event is told part by part from what it said before.
 */
export async function fieldHashes(content: EventContent): Promise<string> {
  const parts = await Promise.all(
    FIELDS.map((field) => digest(JSON.stringify(content[field]))),
  )
  return parts.join(' ')
}

/** The parts of `content` that differ from those `fieldHashes` once gave. */
export async function changedFields(
  content: EventContent,
  before: string,
): Promise<Array<keyof EventContent>> {
  const known = before.split(' ')
  const now = (await fieldHashes(content)).split(' ')
  return FIELDS.filter((_, i) => now[i] !== known[i])
}

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** The event body written for a to-do, both to make it and to change it. */
export function eventBody(
  itemId: number,
  content: EventContent,
  options: { timeZone: string; appUrl: string },
): Omit<GoogleEvent, 'id' | 'etag'> & Record<string, unknown> {
  const times =
    content.dueTime === null
      ? {
          start: { date: content.dueDate },
          end: { date: addDays(content.dueDate, 1) },
        }
      : timed(content.dueDate, content.dueTime, options.timeZone)
  return {
    summary: content.done ? `${DONE_MARK} ${content.title}` : content.title,
    description: content.notes,
    ...times,
    // A to-do does not make anyone look busy.
    transparency: 'transparent',
    extendedProperties: { private: { [ITEM_PROPERTY]: String(itemId) } },
    source: { title: 'todos', url: `${options.appUrl}/item/${itemId}` },
  }
}

function timed(date: LocalDate, time: LocalTime, timeZone: string) {
  const start = toStamp(date, time)
  const end = addMinutes(start, TIMED_MINUTES)
  return {
    start: { dateTime: `${start}:00`, timeZone },
    end: { dateTime: `${end}:00`, timeZone },
  }
}

/**
 * What an event says about its to-do, in household time. Null for an event
 * with no start the app can read.
 */
export function contentFromEvent(
  event: GoogleEvent,
  timeZone: string,
): EventContent | null {
  const when = whenOf(event.start, timeZone)
  if (!when) return null
  const summary = event.summary ?? ''
  const done = DONE_PREFIX.test(summary)
  const title = summary.replace(DONE_PREFIX, '').trim().slice(0, MAX_TITLE)
  return {
    title: title || '(No title)',
    notes: notesFrom(event.description ?? '').slice(0, MAX_NOTES),
    dueDate: when.date,
    dueTime: when.time,
    done,
  }
}

function whenOf(
  start: EventTime | undefined,
  timeZone: string,
): { date: LocalDate; time: LocalTime | null } | null {
  if (start?.date && /^\d{4}-\d{2}-\d{2}$/.test(start.date)) {
    return { date: start.date, time: null }
  }
  if (start?.dateTime) {
    const instant = instantOf(start.dateTime, start.timeZone ?? timeZone)
    if (Number.isNaN(instant.getTime())) return null
    const local = localNow(timeZone, instant)
    return { date: local.date, time: local.time }
  }
  return null
}

const OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i

/**
 * Google writes an offset into every time it returns. A time without one is
 * a wall-clock time in the event's own zone.
 */
function instantOf(dateTime: string, zone: string): Date {
  if (OFFSET.test(dateTime)) return new Date(dateTime)
  const wall = Date.parse(`${dateTime}Z`)
  if (Number.isNaN(wall)) return new Date(Number.NaN)
  // How far the zone's clock is from UTC around then, asked twice so a
  // time near a change of the clocks lands on the right side of it.
  let instant = wall
  for (let i = 0; i < 2; i++) {
    const seen = Date.parse(`${localNow(zone, new Date(instant)).stamp}Z`)
    instant -= seen - wall
  }
  return new Date(instant)
}

const TAG = /<\/?[a-z][^>]*>/i

/**
 * Google Calendar's own editor saves a description as HTML; the app keeps
 * notes as plain text. Text the app wrote, with no tags in it, is kept as
 * it is, so a note that says "a < b" survives the trip.
 */
export function notesFrom(description: string): string {
  if (!TAG.test(description)) return description
  return description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
