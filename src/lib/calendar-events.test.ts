import { describe, expect, it } from 'vitest'
import { eventSpan, eventsOn, fromGoogle } from './calendar-events'
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
      ['Trip', 'All day'],
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
