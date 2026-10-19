import { describe, expect, it } from 'vitest'
import {
  barsHidden,
  eventSpan,
  eventsOn,
  fromGoogle,
  isBar,
  parseEventKey,
  plainText,
  settlePick,
  weekBars,
  whenRuns,
} from './calendar-events'
import type { CalendarEventView } from './calendar-events'
import type { ReadEvent } from '@/calendar/google'

const work = { id: 'work@example.com', name: 'Work', color: '#7986cb' }
const ZONE = 'America/Chicago'

const read = (event: Partial<ReadEvent>) =>
  fromGoogle({ id: 'e1', ...event }, work, ZONE)

const timed = (start: string, end: string, title = 'Standup') =>
  read({
    summary: title,
    start: { dateTime: start },
    end: { dateTime: end },
  }) as CalendarEventView

describe('reading an event from another calendar', () => {
  it('puts a timed event on the household clock, whatever zone Google wrote', () => {
    expect(
      read({
        summary: 'Dentist',
        htmlLink: 'https://www.google.com/calendar/event?eid=abc',
        start: { dateTime: '2026-10-20T14:00:00Z' },
        end: { dateTime: '2026-10-20T15:30:00Z' },
      }),
    ).toEqual({
      key: 'work@example.com e1',
      calendarId: 'work@example.com',
      eventId: 'e1',
      seriesId: null,
      title: 'Dentist',
      color: '#7986cb',
      calendar: 'Work',
      link: 'https://www.google.com/calendar/event?eid=abc',
      allDay: false,
      startDate: '2026-10-20',
      startTime: '09:00',
      endDate: '2026-10-20',
      endTime: '10:30',
    })
  })

  it('keeps an all-day event on its own dates, the end the day after', () => {
    expect(
      read({ start: { date: '2026-10-23' }, end: { date: '2026-10-26' } }),
    ).toMatchObject({
      allDay: true,
      startDate: '2026-10-23',
      endDate: '2026-10-26',
      startTime: null,
    })
  })

  it('names an untitled event as Google Calendar does', () => {
    expect(read({ start: { date: '2026-10-23' } })).toMatchObject({
      title: '(No title)',
      endDate: '2026-10-24',
    })
  })

  it('leaves out what is not on: cancelled, declined, or with no start', () => {
    expect(read({ status: 'cancelled', start: { date: '2026-10-23' } })).toBe(
      null,
    )
    expect(
      read({
        start: { date: '2026-10-23' },
        attendees: [
          { self: false, responseStatus: 'accepted' },
          { self: true, responseStatus: 'declined' },
        ],
      }),
    ).toBe(null)
    expect(read({ summary: 'Nothing' })).toBe(null)
  })

  it('keeps an event the person was invited to and has not declined', () => {
    expect(
      read({
        start: { date: '2026-10-23' },
        attendees: [{ self: true, responseStatus: 'needsAction' }],
      }),
    ).not.toBe(null)
  })
})

describe('the events on a day', () => {
  const events = [
    timed('2026-10-20T15:00:00Z', '2026-10-20T15:30:00Z', 'Standup'),
    read({
      id: 'trip',
      summary: 'Trip',
      start: { date: '2026-10-19' },
      end: { date: '2026-10-22' },
    }) as CalendarEventView,
    timed('2026-10-20T13:00:00Z', '2026-10-20T14:00:00Z', 'School run'),
  ]

  it('puts the whole-day ones first, then the rest by when they start', () => {
    expect(
      eventsOn(events, '2026-10-20').map((on) => [on.event.title, on.when]),
    ).toEqual([
      ['Trip', 'All day, day 2 of 3'],
      ['School run', '8:00 am'],
      ['Standup', '10:00 am'],
    ])
  })

  it('shows an all-day event on each of its days and not the day after', () => {
    expect(eventsOn(events, '2026-10-19')).toHaveLength(1)
    expect(eventsOn(events, '2026-10-21')).toHaveLength(1)
    expect(eventsOn(events, '2026-10-22')).toHaveLength(0)
  })

  it('carries a long event over midnight and says when it ends', () => {
    // 9 pm Monday to 2 am Wednesday, household time.
    const night = [timed('2026-10-20T02:00:00Z', '2026-10-21T07:00:00Z')]
    expect(eventsOn(night, '2026-10-19')[0]).toMatchObject({
      when: '9:00 pm',
      wholeDay: false,
    })
    expect(eventsOn(night, '2026-10-20')[0]).toMatchObject({
      when: 'All day',
      wholeDay: true,
    })
    expect(eventsOn(night, '2026-10-21')[0]).toMatchObject({
      when: 'until 2:00 am',
    })
    expect(eventsOn(night, '2026-10-22')).toHaveLength(0)
  })

  it('does not spill onto the next day when it ends at midnight', () => {
    const late = [timed('2026-10-21T03:00:00Z', '2026-10-21T05:00:00Z')]
    expect(eventsOn(late, '2026-10-20')).toHaveLength(1)
    expect(eventsOn(late, '2026-10-21')).toHaveLength(0)
  })
})

describe('when an event runs, said in full', () => {
  it('gives the start and end of an event within the day', () => {
    const [on] = eventsOn(
      [timed('2026-10-20T14:00:00Z', '2026-10-20T15:30:00Z')],
      '2026-10-20',
    )
    expect(eventSpan(on)).toBe('9:00 am to 10:30 am')
  })

  it('gives the start alone for an event that carries on past midnight', () => {
    const night = [timed('2026-10-20T02:00:00Z', '2026-10-21T07:00:00Z')]
    expect(eventSpan(eventsOn(night, '2026-10-19')[0])).toBe('From 9:00 pm')
    expect(eventSpan(eventsOn(night, '2026-10-21')[0])).toBe('until 2:00 am')
  })

  it('ends at midnight on the day it started', () => {
    const late = [timed('2026-10-21T03:00:00Z', '2026-10-21T05:00:00Z')]
    expect(eventSpan(eventsOn(late, '2026-10-20')[0])).toBe(
      '10:00 pm to 12:00 am',
    )
  })
})

/** Oct 18 to 24, 2026: Sunday to Saturday. */
const WEEK = [
  '2026-10-18',
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
]

const allDay = (id: string, start: string, end: string, title = id) =>
  read({
    id,
    summary: title,
    start: { date: start },
    end: { date: end },
  }) as CalendarEventView

describe('which events span their days as bars', () => {
  it('draws anything all day as a bar, even a single day', () => {
    expect(isBar(allDay('a', '2026-10-20', '2026-10-21'))).toBe(true)
  })

  it('draws a timed event of a day or more as a bar, and a shorter one not', () => {
    // 9:00 am Oct 14 to 5:00 pm Oct 16, Chicago.
    expect(isBar(timed('2026-10-14T14:00:00Z', '2026-10-16T22:00:00Z'))).toBe(
      true,
    )
    // Exactly 24 hours.
    expect(isBar(timed('2026-10-14T14:00:00Z', '2026-10-15T14:00:00Z'))).toBe(
      true,
    )
    // A red-eye across midnight, under a day: a chip on both days.
    expect(isBar(timed('2026-10-28T03:30:00Z', '2026-10-28T11:45:00Z'))).toBe(
      false,
    )
  })
})

describe("a week's bars", () => {
  it('cuts a bar at the week edges and says it carries on', () => {
    const { pieces, lanes } = weekBars(
      [allDay('trip', '2026-10-16', '2026-10-20')],
      WEEK,
    )
    expect(lanes).toBe(1)
    expect(pieces).toMatchObject([
      { from: 0, to: 1, lane: 0, before: true, after: false },
    ])
    const later = weekBars([allDay('visit', '2026-10-21', '2026-10-26')], WEEK)
    expect(later.pieces).toMatchObject([
      { from: 3, to: 6, before: false, after: true },
    ])
  })

  it('ends a timed bar on its last day, not the midnight after', () => {
    const { pieces } = weekBars(
      [timed('2026-10-20T05:00:00Z', '2026-10-22T05:00:00Z')],
      WEEK,
    )
    // Midnight Oct 20 to midnight Oct 22, Chicago: Oct 20 and 21.
    expect(pieces).toMatchObject([{ from: 2, to: 3 }])
  })

  it('leaves out what does not touch the week, and what is not a bar', () => {
    const { pieces } = weekBars(
      [
        allDay('before', '2026-10-10', '2026-10-18'),
        allDay('after', '2026-10-25', '2026-10-26'),
        timed('2026-10-20T14:00:00Z', '2026-10-20T15:00:00Z'),
      ],
      WEEK,
    )
    expect(pieces).toEqual([])
  })

  it('packs lanes first-fit, earliest and then longest first', () => {
    const { pieces, lanes } = weekBars(
      [
        allDay('short', '2026-10-19', '2026-10-20', 'Short'),
        allDay('long', '2026-10-19', '2026-10-23', 'Long'),
        allDay('later', '2026-10-21', '2026-10-23', 'Later'),
        allDay('end', '2026-10-23', '2026-10-25', 'End'),
      ],
      WEEK,
    )
    const lane = Object.fromEntries(
      pieces.map((piece) => [piece.event.title, piece.lane]),
    )
    // End starts after Long has ended, so it takes Long's lane again.
    expect(lane).toEqual({ Long: 0, Short: 1, Later: 1, End: 0 })
    expect(lanes).toBe(2)
  })

  it('counts the bars over a day that its row has no lane for', () => {
    const { pieces } = weekBars(
      [
        allDay('a', '2026-10-19', '2026-10-22'),
        allDay('b', '2026-10-19', '2026-10-21'),
        allDay('c', '2026-10-20', '2026-10-21'),
      ],
      WEEK,
    )
    expect(barsHidden(pieces, 2, 3)).toBe(0)
    expect(barsHidden(pieces, 2, 2)).toBe(1)
    expect(barsHidden(pieces, 1, 2)).toBe(0)
    expect(barsHidden(pieces, 2, 0)).toBe(3)
  })
})

describe('an event, opened by its key', () => {
  it('splits the key at the space between calendar and event', () => {
    expect(
      parseEventKey('family@group.calendar.google.com abc_20261024'),
    ).toEqual({
      calendarId: 'family@group.calendar.google.com',
      eventId: 'abc_20261024',
    })
    expect(parseEventKey('nospace')).toBeNull()
    expect(parseEventKey(' leading')).toBeNull()
  })

  it('says whether a when ends after it starts', () => {
    const day = { startTime: null, endTime: null, allDay: true }
    expect(
      whenRuns({ ...day, startDate: '2026-10-20', endDate: '2026-10-21' }),
    ).toBe(true)
    expect(
      whenRuns({ ...day, startDate: '2026-10-20', endDate: '2026-10-20' }),
    ).toBe(false)
    const at = (endDate: string, endTime: string) => ({
      allDay: false,
      startDate: '2026-10-20',
      startTime: '09:00',
      endDate,
      endTime,
    })
    expect(whenRuns(at('2026-10-20', '09:00'))).toBe(true)
    expect(whenRuns(at('2026-10-20', '08:30'))).toBe(false)
    expect(whenRuns(at('2026-10-21', '08:30'))).toBe(true)
  })

  it("turns Google Calendar's HTML description into words", () => {
    expect(plainText('Cabin door code 4417.')).toBe('Cabin door code 4417.')
    expect(
      plainText('Code <b>4417</b><br>Bring chains &amp; a shovel<br/>'),
    ).toBe('Code 4417\nBring chains & a shovel')
  })
})

describe('settling a picked day or time', () => {
  const stay = { leaving: false, repeating: false }

  it('keeps a whole pick that differs from what is saved', () => {
    expect(settlePick('10:30', '09:00', stay)).toEqual({ keep: '10:30' })
    expect(
      settlePick('2026-10-21', '2026-10-20', { ...stay, repeating: true }),
    ).toEqual({ keep: '2026-10-21' })
  })

  it('does nothing for no pick, a part of one, or the saved value', () => {
    expect(settlePick(null, '09:00', stay)).toBeNull()
    expect(settlePick('', '09:00', stay)).toBeNull()
    expect(settlePick('09:00', '09:00', stay)).toBeNull()
  })

  it("still keeps a one-off event's pick as the panel closes", () => {
    expect(
      settlePick('10:30', '09:00', { leaving: true, repeating: false }),
    ).toEqual({ keep: '10:30' })
  })

  it("drops a repeating event's pick as the panel closes, and says so", () => {
    expect(
      settlePick('10:30', '09:00', { leaving: true, repeating: true }),
    ).toEqual({ dropped: 'Change to a repeating event not saved.' })
    expect(
      settlePick('09:00', '09:00', { leaving: true, repeating: true }),
    ).toBeNull()
  })
})
