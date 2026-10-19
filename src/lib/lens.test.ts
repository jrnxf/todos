import { describe, expect, it } from 'vitest'
import { lensDirection, lensTracks, monthWeeks, stepDay } from './lens'

describe('monthWeeks', () => {
  it('runs Sunday to Saturday over every week that touches the month', () => {
    const weeks = monthWeeks('2026-10-13')
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-09-27')
    expect(weeks[4][6]).toBe('2026-10-31')
  })

  it('takes six rows when the month needs them', () => {
    // August 2026 starts on a Saturday and has 31 days.
    expect(monthWeeks('2026-08-20')).toHaveLength(6)
  })
})

describe('stepDay', () => {
  it('steps by what the view shows', () => {
    expect(stepDay('2026-10-13', 'day', 1)).toBe('2026-10-14')
    expect(stepDay('2026-10-13', 'week', -1)).toBe('2026-10-06')
    expect(stepDay('2026-10-13', 'month', 1)).toBe('2026-11-13')
  })

  it("stops at a shorter month's last day", () => {
    expect(stepDay('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(stepDay('2026-03-31', 'month', -1)).toBe('2026-02-28')
  })

  it('crosses the year', () => {
    expect(stepDay('2026-12-15', 'month', 1)).toBe('2027-01-15')
    expect(stepDay('2027-01-02', 'week', -1)).toBe('2026-12-26')
  })
})

describe('lensTracks', () => {
  const size = { width: 700, height: 500, compact: false }

  it('fills the grid exactly in every view', () => {
    for (const view of ['day', 'week', 'month'] as const) {
      const t = lensTracks({ view, day: '2026-10-13', ...size })
      const sum = (list: Array<number>) => list.reduce((a, b) => a + b, 0)
      expect(sum(t.cols)).toBeCloseTo(700)
      expect(sum(t.rows)).toBeCloseTo(500)
    }
  })

  it('gives the active day the larger column and row in month', () => {
    const t = lensTracks({ view: 'month', day: '2026-10-13', ...size })
    expect(t.col).toBe(2)
    expect(t.row).toBe(2)
    expect(t.cols[2]).toBeCloseTo(t.cols[0] * 1.5)
    expect(t.rows[2]).toBeCloseTo(t.rows[0] * 1.9)
  })

  it('closes the other rows for a week, and the other columns for a day', () => {
    const week = lensTracks({ view: 'week', day: '2026-10-13', ...size })
    expect(week.rows).toEqual([0, 0, 500, 0, 0])
    expect(week.cols[2]).toBeGreaterThan(week.cols[3])
    const day = lensTracks({ view: 'day', day: '2026-10-13', ...size })
    expect(day.cols).toEqual([0, 0, 700, 0, 0, 0, 0])
    expect(day.rows).toEqual([0, 0, 500, 0, 0])
  })

  it('leaves a phone a readable active column in a week', () => {
    const t = lensTracks({
      view: 'week',
      day: '2026-10-13',
      width: 358,
      height: 480,
      compact: true,
    })
    expect(t.cols[2]).toBeGreaterThan(190)
  })
})

describe('lensDirection', () => {
  it('names a move by how far in it goes', () => {
    expect(lensDirection('month', 'week')).toBe('in')
    expect(lensDirection('day', 'month')).toBe('out')
    expect(lensDirection('week', 'week')).toBe('same')
  })
})
