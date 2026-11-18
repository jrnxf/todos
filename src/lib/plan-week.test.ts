import { describe, expect, it } from 'vitest'
import { dueLabel } from './board'
import {
  byPlanDay,
  leftFromLastWeek,
  nextPlanDay,
  planWeekEnd,
  planWeekStart,
  settlePlanWeek,
} from './plan-week'
import type { Todo } from '@/db/schema'

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

describe('a this-week to-do', () => {
  it('stops being one when a day is picked for it', () => {
    expect(settlePlanWeek({ dueDate: '2026-11-20' })).toEqual({
      dueDate: '2026-11-20',
      planWeek: false,
    })
    expect(settlePlanWeek({ dueDate: null })).toEqual({
      dueDate: null,
      planWeek: false,
    })
  })

  it('stays one through changes that leave its date alone', () => {
    expect(
      settlePlanWeek<{ title?: string; dueDate?: string }>({
        title: 'Book the vet',
      }),
    ).toEqual({
      title: 'Book the vet',
    })
    expect(settlePlanWeek({ dueDate: '2026-11-24', planWeek: true })).toEqual({
      dueDate: '2026-11-24',
      planWeek: true,
    })
  })

  it('counts only while its date is a planning day', () => {
    const todo = { planWeek: true, dueDate: '2026-11-24' }
    expect(byPlanDay(todo, TUESDAY)).toBe(true)
    expect(byPlanDay({ ...todo, dueDate: '2026-11-25' }, TUESDAY)).toBe(false)
    expect(byPlanDay(todo, null)).toBe(false)
  })

  it('turns amber only the day before its planning day, then red', () => {
    const todo = {
      dueDate: '2026-11-24',
      dueTime: null,
      planWeek: true,
    } as Todo
    expect(dueLabel(todo, '2026-11-21')).toMatchObject({ tone: 'plain' })
    expect(dueLabel(todo, '2026-11-23')).toMatchObject({ tone: 'soon' })
    expect(dueLabel(todo, '2026-11-25')).toMatchObject({ tone: 'late' })
  })
})

describe('what is left from last week', () => {
  const todo = (fields: Partial<Todo>) =>
    ({
      id: 1,
      dueTime: null,
      doneAt: null,
      planWeek: false,
      ...fields,
    }) as Todo

  it('is what is open and was due before this plan week', () => {
    const left = leftFromLastWeek(
      [
        todo({ id: 1, dueDate: '2026-11-16' }),
        todo({ id: 2, dueDate: '2026-11-16', doneAt: '2026-11-16T09:00Z' }),
        todo({ id: 3, dueDate: '2026-11-17' }),
        todo({ id: 4, dueDate: '2026-11-18' }),
        todo({ id: 5, dueDate: null }),
      ],
      '2026-11-17',
      TUESDAY,
    )
    expect(left.map((one) => one.id)).toEqual([1])
  })

  it('takes in a this-week to-do that was due by the planning day', () => {
    const left = leftFromLastWeek(
      [todo({ id: 1, dueDate: '2026-11-17', planWeek: true })],
      '2026-11-19',
      TUESDAY,
    )
    expect(left.map((one) => one.id)).toEqual([1])
  })
})
