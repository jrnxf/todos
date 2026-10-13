import { describe, expect, it } from 'vitest'
import { comingDay } from './board'

const today = '2026-10-13' // a Tuesday

describe('naming a day still to come', () => {
  it('says tomorrow for the next day', () => {
    expect(comingDay('2026-10-14', today)).toBe('tomorrow')
  })

  it('names the weekday inside the week', () => {
    expect(comingDay('2026-10-16', today)).toBe('Friday')
    expect(comingDay('2026-10-19', today)).toBe('Monday')
  })

  it('gives the date once the weekday alone could mean today', () => {
    expect(comingDay('2026-10-20', today)).toBe('Tue, Oct 20')
    expect(comingDay('2026-10-31', today)).toBe('Sat, Oct 31')
  })
})
