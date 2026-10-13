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

  it('leaves a title alone when there is no date, or nothing but a date', () => {
    expect(parseWhen(chrono, 'Fix closet door', today)).toBeNull()
    expect(parseWhen(chrono, 'Tomorrow', today)).toBeNull()
  })
})
