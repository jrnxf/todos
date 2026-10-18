import { describe, expect, it } from 'vitest'
import {
  belongsInCalendar,
  contentFromEvent,
  contentHash,
  contentOf,
  eventBody,
  notesFrom,
} from './mapping'
import type { Todo } from '@/db/schema'
import type { EventContent, GoogleEvent } from './mapping'

const TZ = 'America/Chicago'
const options = { timeZone: TZ, appUrl: 'https://todos.example' }

const todo: Todo = {
  id: 7,
  title: 'Renew passports',
  notes: 'Photos first',
  tagId: null,
  assignee: null,
  dueDate: '2026-10-15',
  dueTime: null,
  headsUpDays: [1],
  mustNotMiss: false,
  doneAt: null,
  doneBy: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'alex',
  deletedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

/** The body as Google hands it back. */
const asEvent = (body: ReturnType<typeof eventBody>): GoogleEvent => ({
  ...body,
  id: 'e1',
  etag: '"1"',
})

describe('a to-do as an event', () => {
  it('is an all-day event on its date when it has no time', () => {
    const body = eventBody(7, contentOf(todo), options)
    expect(body).toMatchObject({
      summary: 'Renew passports',
      description: 'Photos first',
      start: { date: '2026-10-15' },
      end: { date: '2026-10-16' },
      transparency: 'transparent',
      extendedProperties: { private: { todosItem: '7' } },
      source: { title: 'todos', url: 'https://todos.example/item/7' },
    })
  })

  it('is a half hour from its time, in household time, when it has one', () => {
    const body = eventBody(7, contentOf({ ...todo, dueTime: '23:45' }), options)
    expect(body.start).toEqual({
      dateTime: '2026-10-15T23:45:00',
      timeZone: TZ,
    })
    expect(body.end).toEqual({ dateTime: '2026-10-16T00:15:00', timeZone: TZ })
  })

  it('marks a finished to-do in its title', () => {
    const done = { ...todo, doneAt: '2026-10-14T12:00:00.000Z' }
    expect(eventBody(7, contentOf(done), options).summary).toBe(
      '✓ Renew passports',
    )
  })

  it('reads back as what it was written from', () => {
    for (const item of [
      todo,
      { ...todo, dueTime: '09:30' },
      { ...todo, doneAt: '2026-10-14T12:00:00.000Z', dueTime: '18:00' },
    ]) {
      const content = contentOf(item)
      expect(
        contentFromEvent(asEvent(eventBody(7, content, options)), TZ),
      ).toEqual(content)
    }
  })
})

describe('an event as a to-do', () => {
  const event = (fields: Partial<GoogleEvent>): GoogleEvent => ({
    id: 'e1',
    etag: '"1"',
    summary: 'Dentist',
    start: { date: '2026-10-20' },
    ...fields,
  })

  it('reads a time in any zone as household time', () => {
    expect(
      contentFromEvent(
        event({ start: { dateTime: '2026-10-20T15:00:00Z' } }),
        TZ,
      ),
    ).toMatchObject({ dueDate: '2026-10-20', dueTime: '10:00' })
    expect(
      contentFromEvent(
        event({ start: { dateTime: '2026-10-21T01:30:00+02:00' } }),
        TZ,
      ),
    ).toMatchObject({ dueDate: '2026-10-20', dueTime: '18:30' })
    // No offset: a wall-clock time in the event's own zone.
    expect(
      contentFromEvent(
        event({
          start: {
            dateTime: '2026-10-20T17:00:00',
            timeZone: 'America/New_York',
          },
        }),
        TZ,
      ),
    ).toMatchObject({ dueDate: '2026-10-20', dueTime: '16:00' })
  })

  it('is done when its title starts with a done mark', () => {
    for (const summary of [
      '✓ Dentist',
      '✔Dentist',
      '[x] Dentist',
      ' [X]  Dentist',
    ]) {
      expect(contentFromEvent(event({ summary }), TZ)).toMatchObject({
        title: 'Dentist',
        done: true,
      })
    }
    expect(contentFromEvent(event({ summary: 'Dentist ✓' }), TZ)).toMatchObject(
      {
        title: 'Dentist ✓',
        done: false,
      },
    )
  })

  it('gets a title when it has none', () => {
    expect(contentFromEvent(event({ summary: undefined }), TZ)?.title).toBe(
      '(No title)',
    )
    expect(contentFromEvent(event({ summary: '✓' }), TZ)).toMatchObject({
      title: '(No title)',
      done: true,
    })
  })

  it('is nothing the list can hold without a start', () => {
    expect(contentFromEvent(event({ start: undefined }), TZ)).toBeNull()
    expect(
      contentFromEvent(event({ start: { dateTime: 'soon' } }), TZ),
    ).toBeNull()
  })
})

describe('notes', () => {
  it('keeps plain text as it is', () => {
    expect(notesFrom('a < b\n\nand c > d')).toBe('a < b\n\nand c > d')
  })

  it("reads Google Calendar's HTML as text", () => {
    expect(
      notesFrom(
        'Bring <b>both</b> passports<br>and the forms:<ul><li>DS-82</li><li>photos &amp; fee</li></ul>',
      ),
    ).toBe('Bring both passports\nand the forms:- DS-82\n- photos & fee')
  })
})

describe('which to-dos are in the calendar', () => {
  const now = new Date('2026-10-12T12:00:00Z')

  it('has every open to-do with a deadline', () => {
    expect(belongsInCalendar(todo, false, now)).toBe(true)
    expect(belongsInCalendar({ ...todo, dueDate: null }, false, now)).toBe(
      false,
    )
    expect(
      belongsInCalendar(
        { ...todo, deletedAt: '2026-10-11T00:00:00Z' },
        true,
        now,
      ),
    ).toBe(false)
  })

  it('leaves out one finished long ago, unless it is there already', () => {
    const old = { ...todo, doneAt: '2026-08-01T00:00:00.000Z' }
    expect(belongsInCalendar(old, false, now)).toBe(false)
    expect(belongsInCalendar(old, true, now)).toBe(true)
    const recent = { ...todo, doneAt: '2026-10-01T00:00:00.000Z' }
    expect(belongsInCalendar(recent, false, now)).toBe(true)
  })
})

describe('content hash', () => {
  it('changes with every field an event shows, and nothing else', async () => {
    const base: EventContent = contentOf(todo)
    const hash = await contentHash(base)
    expect(await contentHash({ ...base })).toBe(hash)
    for (const change of [
      { title: 'Renew passport' },
      { notes: '' },
      { dueDate: '2026-10-16' },
      { dueTime: '09:00' },
      { done: true },
    ]) {
      expect(await contentHash({ ...base, ...change })).not.toBe(hash)
    }
  })
})
