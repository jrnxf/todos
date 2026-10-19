import { describe, expect, it } from 'vitest'
import {
  continueSeries,
  countsDays,
  describeRepeat,
  endSeries,
  restyleUntil,
  untilBefore,
} from './repeats'

describe('how a series repeats, in words', () => {
  it('says the common rules plainly', () => {
    expect(describeRepeat(['RRULE:FREQ=WEEKLY;BYDAY=SA'])).toBe(
      'Every Saturday',
    )
    expect(describeRepeat(['RRULE:FREQ=WEEKLY;BYDAY=TH,TU'])).toBe(
      'Every Tuesday and Thursday',
    )
    expect(describeRepeat(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'])).toBe(
      'Every Monday, Wednesday and Friday',
    )
    expect(describeRepeat(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'])).toBe(
      'Every weekday',
    )
    expect(describeRepeat(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'])).toBe(
      'Every 2 weeks on Monday',
    )
    expect(describeRepeat(['RRULE:FREQ=DAILY'])).toBe('Every day')
    expect(describeRepeat(['RRULE:FREQ=DAILY;INTERVAL=3;COUNT=5'])).toBe(
      'Every 3 days',
    )
    expect(describeRepeat(['RRULE:FREQ=MONTHLY'])).toBe('Every month')
    expect(
      describeRepeat(['EXDATE:20261031', 'RRULE:FREQ=YEARLY;UNTIL=20300101']),
    ).toBe('Every year')
  })

  it('says only that it repeats when the rule is too particular', () => {
    expect(describeRepeat(['RRULE:FREQ=MONTHLY;BYDAY=2TU'])).toBe('Repeats')
    expect(describeRepeat(['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'])).toBe(
      'Repeats',
    )
  })

  it('says nothing for an event that does not repeat', () => {
    expect(describeRepeat(undefined)).toBeNull()
    expect(describeRepeat(['EXDATE:20261031'])).toBeNull()
  })
})

describe('splitting a series at one of its days', () => {
  it('ends an all-day series the day before', () => {
    expect(untilBefore({ date: '2026-10-24' })).toEqual({ date: '2026-10-23' })
    expect(
      endSeries(['RRULE:FREQ=WEEKLY;BYDAY=SA'], { date: '2026-10-23' }),
    ).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261023'])
  })

  it('ends a timed series a second before, in UTC', () => {
    const until = untilBefore({ dateTime: '2026-10-24T09:00:00-05:00' })
    expect(until).toEqual({ instant: '2026-10-24T13:59:59.000Z' })
    expect(endSeries(['RRULE:FREQ=WEEKLY;COUNT=10'], until)).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261024T135959Z',
    ])
  })

  it('keeps the other lines of the rule', () => {
    expect(
      endSeries(['EXDATE;VALUE=DATE:20261010', 'RRULE:FREQ=DAILY'], {
        date: '2026-10-20',
      }),
    ).toEqual(['EXDATE;VALUE=DATE:20261010', 'RRULE:FREQ=DAILY;UNTIL=20261020'])
  })

  it('gives the new series what is left of a counted one', () => {
    expect(countsDays(['RRULE:FREQ=DAILY;COUNT=10'])).toBe(true)
    expect(countsDays(['RRULE:FREQ=DAILY'])).toBe(false)
    expect(continueSeries(['RRULE:FREQ=DAILY;COUNT=10'], 4)).toEqual([
      'RRULE:FREQ=DAILY;COUNT=6',
    ])
    expect(continueSeries(['RRULE:FREQ=DAILY;UNTIL=20261231'], 4)).toEqual([
      'RRULE:FREQ=DAILY;UNTIL=20261231',
    ])
  })

  it('writes the end as a date or an instant to match the series', () => {
    expect(
      restyleUntil(['RRULE:FREQ=DAILY;UNTIL=20261231T235959Z'], true),
    ).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261231'])
    expect(restyleUntil(['RRULE:FREQ=DAILY;UNTIL=20261231'], false)).toEqual([
      'RRULE:FREQ=DAILY;UNTIL=20261231T235959Z',
    ])
    expect(restyleUntil(['RRULE:FREQ=DAILY'], false)).toEqual([
      'RRULE:FREQ=DAILY',
    ])
  })
})
