import { describe, expect, it } from 'vitest'
import { nextPlanDay, planWeekEnd, planWeekStart } from './plan-week'

const TUESDAY = 2

describe('the planning week', () => {
  it('opens on the planning day itself', () => {
    expect(planWeekStart('2026-11-17', TUESDAY)).toBe('2026-11-17')
  })

  it('reaches back to the last planning day', () => {
    // Wednesday, Sunday and Monday all belong to the week of Tue Nov 17.
    expect(planWeekStart('2026-11-18', TUESDAY)).toBe('2026-11-17')
    expect(planWeekStart('2026-11-22', TUESDAY)).toBe('2026-11-17')
    expect(planWeekStart('2026-11-23', TUESDAY)).toBe('2026-11-17')
  })

  it('ends the day before the next planning day', () => {
    expect(planWeekEnd('2026-11-18', TUESDAY)).toBe('2026-11-23')
  })

  it('crosses a month and a year', () => {
    expect(planWeekStart('2026-12-03', TUESDAY)).toBe('2026-12-01')
    expect(planWeekStart('2027-01-04', TUESDAY)).toBe('2026-12-29')
  })
})

describe('the next planning day', () => {
  it('is a week on when today is the planning day', () => {
    expect(nextPlanDay('2026-11-17', TUESDAY)).toBe('2026-11-24')
  })

  it('is the coming one on any other day', () => {
    expect(nextPlanDay('2026-11-18', TUESDAY)).toBe('2026-11-24')
    expect(nextPlanDay('2026-11-23', TUESDAY)).toBe('2026-11-24')
  })

  it('works for a Sunday planning day', () => {
    expect(nextPlanDay('2026-11-21', 0)).toBe('2026-11-22')
    expect(nextPlanDay('2026-11-22', 0)).toBe('2026-11-29')
  })
})
