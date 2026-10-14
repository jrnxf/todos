// The add bar used to blink and jump while a sentence was typed: a date read
// from "Tues" went on "Tuesd" and came back on "Tuesday", one backspace put back
// a date Jev had taken away, and chips pushed each other along. These pin
// what the bar keeps showing instead, against the real rules.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from './read'
import { answerHolds, heldReadings, steadyChips } from './steady'
import type { HeldReadings } from './steady'
import type { ReadContext, ReadField } from './read'

const context: ReadContext = {
  today: '2026-10-14',
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: [{ id: 1, name: 'House' }],
}

/** Types `sentence` a key at a time and reports the date as shown after each. */
function typeOut(sentence: string) {
  let held: HeldReadings<string | undefined> = {}
  const shown: Array<string> = []
  for (let at = 1; at <= sentence.length; at++) {
    const typed = sentence.slice(0, at)
    const rules = readTitle(chrono, typed.trim(), context)
    const read: Partial<
      Record<ReadField, { phrase: string; value: string | undefined }>
    > = {}
    for (const [field, phrase] of Object.entries(rules.phrases)) {
      read[field as ReadField] = { phrase, value: rules.fields.dueDate }
    }
    const next = heldReadings(held, typed, read, new Set())
    held = next.held
    const when = held.when
    shown.push(
      when
        ? `${typed}=${when.value}${next.tentative.includes('when') ? '?' : ''}`
        : `${typed}=-`,
    )
  }
  return shown
}

describe('heldReadings', () => {
  it('keeps a date read from a word still being typed', () => {
    const shown = typeOut('Order Taco Tuesday')
    expect(shown.slice(-5)).toEqual([
      'Order Taco Tue=2026-10-20',
      'Order Taco Tues=2026-10-20',
      'Order Taco Tuesd=2026-10-20?',
      'Order Taco Tuesda=2026-10-20?',
      'Order Taco Tuesday=2026-10-20',
    ])
  })

  it('lets it go once the word is done without a reading', () => {
    const before: HeldReadings<string> = {
      when: { phrase: 'sun', start: 13, typed: 'Call grandma sun', value: 'x' },
    }
    expect(
      heldReadings(before, 'Call grandma sund ', {}, new Set()).held,
    ).toEqual({})
    expect(heldReadings(before, 'Call grandma su', {}, new Set()).held).toEqual(
      {},
    )
  })

  it('lets it go after a few more letters', () => {
    // The rules read "the h" as one o'clock while "the hostas" is typed.
    const before: HeldReadings<string> = {
      when: { phrase: 'the h', start: 6, typed: 'Split the h', value: 'x' },
    }
    expect(
      heldReadings(before, 'Split the hos', {}, new Set()).tentative,
    ).toEqual(['when'])
    expect(heldReadings(before, 'Split the host', {}, new Set()).held).toEqual(
      {},
    )
  })

  it('lets it go when the field is set by hand or taken back', () => {
    const before: HeldReadings<string> = {
      when: { phrase: 'sun', start: 13, typed: 'Call grandma sun', value: 'x' },
    }
    expect(
      heldReadings(before, 'Call grandma sund', {}, new Set(['when'])).held,
    ).toEqual({})
  })
})

describe('answerHolds', () => {
  it('holds while more is typed', () => {
    expect(
      answerHolds('Split the hostas today', 'Split the hostas', undefined),
    ).toBe(true)
  })

  it('holds through a backspace while the taken-back words are there', () => {
    expect(
      answerHolds(
        'Order Taco Tuesday supplie',
        'Order Taco Tuesday supplies',
        'Tuesday',
      ),
    ).toBe(true)
  })

  it('does not hold once those words are gone', () => {
    expect(
      answerHolds('Order Taco Tues', 'Order Taco Tuesday supplies', 'Tuesday'),
    ).toBe(false)
  })

  it('does not hold for a different title', () => {
    expect(answerHolds('Split the roses', 'Split the hostas', undefined)).toBe(
      false,
    )
  })
})

describe('steadyChips', () => {
  const chip = (key: string) => ({ key })

  it('puts new chips at the end, after the ones already shown', () => {
    const shown = [chip('who'), chip('flag')]
    expect(
      steadyChips(shown, [chip('when'), chip('who'), chip('flag')], false).map(
        (one) => one.key,
      ),
    ).toEqual(['who', 'flag', 'when'])
  })

  it('keeps a chip that went while the pointer is over the line', () => {
    const shown = [chip('when'), chip('who')]
    expect(steadyChips(shown, [chip('who')], true)).toEqual([
      { key: 'when', gone: true },
      { key: 'who' },
    ])
    expect(steadyChips(shown, [chip('who')], false)).toEqual([{ key: 'who' }])
  })
})
