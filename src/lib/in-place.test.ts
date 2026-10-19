import { describe, expect, it } from 'vitest'
import { openInPlace } from './in-place'

describe('opening over the page', () => {
  it('marks the first one opened by a click', () => {
    expect(openInPlace(false)({}).openedInPlace).toBe(true)
  })

  it('keeps a link-opened entry unmarked when moving to another', () => {
    // Marking it would make Close go Back, past the page it opened on.
    expect(openInPlace(true)({}).openedInPlace).toBeUndefined()
    expect(openInPlace(true)({ openedInPlace: false }).openedInPlace).toBe(
      false,
    )
  })

  it('keeps a click-opened entry marked when moving to another', () => {
    expect(openInPlace(true)({ openedInPlace: true }).openedInPlace).toBe(true)
  })
})
