import { describe, expect, it } from 'vitest'
import { startingFields } from './add-preset'

describe('startingFields', () => {
  it('starts on the picked day when nothing else is said, today included', () => {
    // The bug: standing on today, or pressing N anywhere, added with no date.
    expect(startingFields(undefined, '2026-10-21')).toEqual({
      dueDate: '2026-10-21',
    })
    expect(startingFields({}, '2026-10-22')).toEqual({ dueDate: '2026-10-22' })
  })

  it('keeps what the caller set, adding the day only where it said none', () => {
    expect(startingFields({ tagId: 2 }, '2026-10-22')).toEqual({
      tagId: 2,
      dueDate: '2026-10-22',
    })
    expect(startingFields({ dueDate: '2026-11-01' }, '2026-10-22')).toEqual({
      dueDate: '2026-11-01',
    })
    expect(startingFields({ dueDate: null }, '2026-10-22')).toEqual({
      dueDate: null,
    })
  })

  it('starts with no date away from the calendar', () => {
    expect(startingFields(undefined, null)).toEqual({})
  })
})
