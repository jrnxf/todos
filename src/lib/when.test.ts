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
      'Renew passport, remind me 5 days before',
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

  it('reads a day of the month said without a linking word', () => {
    expect(
      parseWhen(chrono, 'Get the car inspected the 5th', today),
    ).toMatchObject({ title: 'Get the car inspected', dueDate: '2026-11-05' })
  })

  it('takes "for" with the date, and leaves no linking word behind', () => {
    expect(
      parseWhen(
        chrono,
        'Schedule furnace service for november 5 at 10am',
        today,
      ),
    ).toMatchObject({
      title: 'Schedule furnace service',
      dueDate: '2026-11-05',
      dueTime: '10:00',
    })
  })

  // Two readings nobody has ruled on; these are what the read test expects.
  it('reads a weekday typed on that weekday as next week', () => {
    expect(parseWhen(chrono, 'Take out the trash monday', today)).toMatchObject(
      { dueDate: '2026-10-19' },
    )
    expect(
      parseWhen(chrono, 'Take out the trash this monday', today),
    ).toMatchObject({ dueDate: '2026-10-12' })
    expect(parseWhen(chrono, 'Take out the trash today', today)).toMatchObject({
      dueDate: '2026-10-12',
    })
  })

  it('reads "next week" as the coming Monday', () => {
    expect(parseWhen(chrono, 'Plan the party next week', today)).toMatchObject({
      title: 'Plan the party',
      dueDate: '2026-10-19',
    })
    expect(
      parseWhen(chrono, 'Plan the party next week', '2026-10-15'),
    ).toMatchObject({ dueDate: '2026-10-19' })
    expect(
      parseWhen(chrono, 'Plan the party next week', '2026-10-18'),
    ).toMatchObject({ dueDate: '2026-10-19' })
  })

  it('does not take a day that is part of a name, or whose something it is', () => {
    for (const title of [
      'Watch Friday Night Lights with the kids',
      "Email the teacher about Friday's field trip",
      'Buy tickets for August: Osage County',
      'Read Mondays are the worst to the kids',
      'Kids dentist checkup, heads up the day before',
    ])
      expect(parseWhen(chrono, title, today), title).toBeNull()
    // Typed with capitals throughout, a capital says nothing.
    expect(
      parseWhen(chrono, 'Call The Dentist Friday Morning Early', today),
    ).toMatchObject({ dueDate: '2026-10-16' })
  })

  it.each([
    ['Dinner at the Nguyens at 7 saturday', '19:00'],
    ['Anniversary dinner reservation friday at 7:30', '19:30'],
    ['pick up kids from practice at 3 friday', '15:00'],
    ['dentist at 9 friday', '09:00'],
    ['Breakfast with dad sunday at 7', '07:00'],
    ['School drop off before work friday at 6', '06:00'],
    ['Flu shot oct 20 9:15', '09:15'],
    ['Call the vet friday at 14:30', '14:30'],
    ['Lunch friday at noon', '12:00'],
    ['Flight friday at 6am', '06:00'],
  ])('works out the half of the day in %j', (title, dueTime) => {
    expect(parseWhen(chrono, title, today)).toMatchObject({ dueTime })
  })

  it('reads a time with no day as today', () => {
    expect(parseWhen(chrono, 'pick up kids at 3', today)).toMatchObject({
      title: 'pick up kids',
      dueDate: today,
      dueTime: '15:00',
    })
  })

  it.each([
    ['wensday 6pm parent teacher conference', 'parent teacher conference', 2],
    [
      'take the dog to the groomer tommorow at 10',
      'take the dog to the groomer',
      1,
    ],
    ['Flu shots thrusday', 'Flu shots', 3],
    ['Trash to the curb tonite', 'Trash to the curb', 0],
    ['Renew the passes by febuary 2', 'Renew the passes', 113],
  ])('reads the mistyped day in %j', (typed, title, days) => {
    const read = parseWhen(chrono, typed, today)
    expect(read).toMatchObject({ title })
    expect(read?.dueDate).toBe(
      new Date(Date.UTC(2026, 9, 12 + days)).toISOString().slice(0, 10),
    )
  })

  it('keeps a mistyped word that is not the date as it was typed', () => {
    expect(parseWhen(chrono, 'tmrw plans for satruday friday', today)).toEqual({
      phrase: 'friday',
      title: 'tmrw plans for satruday',
      dueDate: '2026-10-16',
      dueTime: null,
    })
  })

  it('leaves a title alone when there is no date, or nothing but a date', () => {
    expect(parseWhen(chrono, 'Fix closet door', today)).toBeNull()
    expect(parseWhen(chrono, 'Tomorrow', today)).toBeNull()
  })
})
