// Reading dates out of titles is the one place a wrong guess silently puts a
// deadline on the wrong day, so it gets a few cases.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { parseWhen } from './when'

const today = '2026-10-12' // a Monday

describe('a date typed into a title', () => {
  it('is taken out of the title and becomes the deadline', () => {
    expect(parseWhen(chrono, 'Passports, both kids oct 30', today)).toEqual({
      phrase: 'oct 30',
      title: 'Passports, both kids',
      dueDate: '2026-10-30',
      dueTime: null,
    })
  })

  it('reads a weekday and a time, looking forward', () => {
    expect(parseWhen(chrono, 'Dentist fri 5pm', today)).toMatchObject({
      title: 'Dentist',
      dueDate: '2026-10-16',
      dueTime: '17:00',
    })
  })

  it('takes the linking word with it', () => {
    expect(
      parseWhen(chrono, 'Pay the plumber by tomorrow', today),
    ).toMatchObject({
      title: 'Pay the plumber',
      dueDate: '2026-10-13',
    })
  })

  it('does not take a name or an amount for a deadline', () => {
    for (const title of [
      'Pick up March of the Penguins dvd from library',
      'Do the August statement',
      'Take 2 weeks of recycling to the depot',
      'Buy 3 days of food',
      'Fix the light on the 2nd floor',
    ])
      expect(parseWhen(chrono, title, today), title).toBeNull()
  })

  it('still reads a month or a length of time that is said as a deadline', () => {
    expect(parseWhen(chrono, 'Taxes by march', today)).toMatchObject({
      title: 'Taxes',
      dueDate: '2027-03-01',
    })
    expect(
      parseWhen(chrono, 'Call the school in 2 weeks', today),
    ).toMatchObject({ title: 'Call the school', dueDate: '2026-10-26' })
  })

  it('reads a day of the month, with a time said after it', () => {
    expect(
      parseWhen(
        chrono,
        "Mortgage payment on the 1st at 9am, don't forget",
        today,
      ),
    ).toEqual({
      phrase: 'on the 1st at 9am',
      title: "Mortgage payment, don't forget",
      dueDate: '2026-11-01',
      dueTime: '09:00',
    })
    expect(parseWhen(chrono, 'Pay rent on the 1st', today)).toMatchObject({
      title: 'Pay rent',
      dueDate: '2026-11-01',
      dueTime: null,
    })
    // A day this month has not reached yet is this month's; one no month
    // soon has is skipped to a month that does.
    expect(parseWhen(chrono, 'Pay rent by the 15th', today)).toMatchObject({
      dueDate: '2026-10-15',
    })
    expect(
      parseWhen(chrono, 'Close the books on the 31st', '2026-11-02'),
    ).toMatchObject({
      dueDate: '2026-12-31',
    })
  })

  it('leaves a title alone when there is no date, or nothing but a date', () => {
    expect(parseWhen(chrono, 'Fix closet door', today)).toBeNull()
    expect(parseWhen(chrono, 'Tomorrow', today)).toBeNull()
  })
})
