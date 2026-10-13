// What gets read out of a title fills buttons the person never touched, so a
// wrong reading is a to-do quietly given to the wrong person or flagged for
// everyone. These pin what counts as said, and what does not.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from './read'
import type { JevRead, ReadContext, ReadField } from './read'

const HOUSE = 1
const KIDS = 2
const PAPERWORK = 3
const context: ReadContext = {
  today: '2026-10-13', // a Tuesday
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  areas: [
    { id: HOUSE, name: 'House' },
    { id: KIDS, name: 'Kids' },
    { id: PAPERWORK, name: 'Paperwork' },
  ],
}
const read = (text: string, skip?: Array<ReadField>) =>
  readTitle(chrono, text, { ...context, skip: new Set(skip) })

describe('whose a to-do is', () => {
  it.each([
    ['Sam: pick up dry cleaning', 'sam', 'pick up dry cleaning'],
    ['@sam sign permission slip', 'sam', 'sign permission slip'],
    ['Alex to winterize the sprinklers', 'alex', 'winterize the sprinklers'],
    ['Ask Sam to call the school', 'sam', 'call the school'],
    ['Soccer practice signup - Sam', 'sam', 'Soccer practice signup'],
    ['I need to book flights', 'alex', 'book flights'],
    // A name that opens the title: it is theirs.
    ['Sam visit garden center', 'sam', 'visit garden center'],
    ['sam call the school tomorrow', 'sam', 'call the school'],
  ])('reads %j', (text, assignee, title) => {
    expect(read(text)).toMatchObject({ title, fields: { assignee } })
  })

  it.each([
    'Call Sam about dinner',
    'Buy birthday present for Sam',
    "Sam's eye appointment",
    "Sam's boots need new laces",
    'Samosas for the party',
    'Visit Sam at the garden center',
  ])('leaves %j with nobody', (text) => {
    expect(read(text)).toMatchObject({ title: text, fields: {} })
    expect(read(text).fields.assignee).toBeUndefined()
  })
})

describe('the area', () => {
  it('is read from a tag or a heading, which leave the title', () => {
    expect(read('sign permission slip #kids')).toMatchObject({
      title: 'sign permission slip',
      fields: { areaId: KIDS },
    })
    expect(read('House: replace smoke detector batteries')).toMatchObject({
      title: 'replace smoke detector batteries',
      fields: { areaId: HOUSE },
    })
  })

  it('is read from its own name in passing, which stays in the title', () => {
    expect(read('Flu shots for the kids')).toMatchObject({
      title: 'Flu shots for the kids',
      fields: { areaId: KIDS },
    })
  })

  it('is not guessed', () => {
    expect(read('Pay property tax').fields.areaId).toBeUndefined()
    expect(read('Housekeeping deposit').fields.areaId).toBeUndefined()
  })
})

describe('the heads-up', () => {
  it('is read as the offered choices, one or several', () => {
    expect(read('Pay property tax, remind me 2 weeks before')).toMatchObject({
      title: 'Pay property tax',
      fields: { headsUpDays: [14] },
    })
    expect(
      read('Submit FSA receipts, heads up 3 days and 1 day before'),
    ).toMatchObject({
      title: 'Submit FSA receipts',
      fields: { headsUpDays: [1, 3] },
    })
    expect(read('Water the plants, no reminder')).toMatchObject({
      title: 'Water the plants',
      fields: { headsUpDays: [] },
    })
  })

  it('is left in the title when it is not one of the choices', () => {
    const text = 'Renew passport, remind me 5 days before'
    expect(read(text)).toMatchObject({ title: text, fields: {} })
  })
})

describe('the flag', () => {
  it.each([
    ['Call plumber about the leak !', 'Call plumber about the leak'],
    ['Renew passports!!', 'Renew passports'],
    ['Renew passports must not miss', 'Renew passports'],
    ["Mortgage payment, don't forget", 'Mortgage payment'],
    ['Submit FSA receipts urgent', 'Submit FSA receipts'],
  ])('is read from %j', (text, title) => {
    expect(read(text)).toMatchObject({ title, fields: { mustNotMiss: true } })
  })

  it('is not read from a sentence that just ends with one', () => {
    expect(
      read('Wish grandma a happy birthday!').fields.mustNotMiss,
    ).toBeUndefined()
  })
})

describe('a whole title', () => {
  it('has everything read at once', () => {
    expect(
      read('Sam: flu shots for the kids sat 10:30, remind me 3 days before !'),
    ).toEqual({
      title: 'flu shots for the kids',
      fields: {
        assignee: 'sam',
        areaId: KIDS,
        dueDate: '2026-10-17',
        dueTime: '10:30',
        headsUpDays: [3],
        mustNotMiss: true,
      },
      phrases: {
        who: 'Sam:',
        area: 'kids',
        when: 'sat 10:30',
        headsUp: ', remind me 3 days before',
        flag: '!',
      },
      guessed: {},
    })
  })

  it('puts back the words of a reading that is taken back', () => {
    expect(read('Sam: call the school tomorrow', ['who'])).toMatchObject({
      title: 'Sam: call the school',
      fields: { dueDate: '2026-10-14' },
    })
    expect(read('Sam: call the school tomorrow', ['who', 'when'])).toEqual({
      title: 'Sam: call the school tomorrow',
      fields: {},
      phrases: {},
      guessed: {},
    })
  })

  it('is left alone when it is nothing but things to read', () => {
    expect(read('Sam: !')).toEqual({
      title: 'Sam: !',
      fields: {},
      phrases: {},
      guessed: {},
    })
  })

  it('still reads the rest before the date parser has loaded', () => {
    expect(readTitle(null, 'Sam: dentist fri', context)).toMatchObject({
      title: 'dentist fri',
      fields: { assignee: 'sam' },
    })
  })
})

// With a key, Jev's reading comes first (src/server/jev-read.ts). It fills
// buttons too, so the same guards hold: nothing set by hand or taken back is
// overwritten, and what Jev did not answer is read by the rules as before.
describe("Jev's reading", () => {
  const text = "Sam visit garden center at 9pm on saturday don't forget"
  //            0   1     2      3      4  5   6  7        8     9
  const jev: JevRead = {
    when: { dueDate: '2026-10-17', dueTime: '21:00' },
    who: 'sam',
    area: HOUSE,
    flag: true,
    drops: [
      { index: 0, field: 'who' },
      { index: 4, field: 'when' },
      { index: 5, field: 'when' },
      { index: 6, field: 'when' },
      { index: 7, field: 'when' },
      { index: 8, field: 'flag' },
      { index: 9, field: 'flag' },
    ],
  }
  const withJev = (
    typed: string,
    answer: JevRead | null,
    more: Partial<ReadContext> = {},
  ) => readTitle(chrono, typed, { ...context, ...more, jev: answer })

  it('fills the fields and takes their words out of the title', () => {
    expect(withJev(text, jev)).toEqual({
      title: 'visit garden center',
      fields: {
        dueDate: '2026-10-17',
        dueTime: '21:00',
        assignee: 'sam',
        areaId: HOUSE,
        mustNotMiss: true,
      },
      phrases: {},
      guessed: {
        when: 'at 9pm on saturday',
        who: 'Sam',
        area: '',
        flag: "don't forget",
      },
    })
  })

  it('is the rules alone when there is no answer', () => {
    expect(withJev(text, null)).toEqual(read(text))
  })

  it('leaves to the rules each field it did not answer', () => {
    // Only the area came back: who, when and the flag are read as before.
    expect(withJev(text, { area: HOUSE, drops: [] })).toEqual({
      ...read(text),
      fields: { ...read(text).fields, areaId: HOUSE },
      guessed: { area: '' },
    })
    // The day came back and the rest did not.
    expect(
      withJev('Sam: dentist fri !', {
        when: { dueDate: '2026-10-16', dueTime: null },
        drops: [{ index: 2, field: 'when' }],
      }),
    ).toMatchObject({
      title: 'dentist',
      fields: { dueDate: '2026-10-16', assignee: 'sam', mustNotMiss: true },
      phrases: { who: 'Sam:', flag: '!' },
      guessed: { when: 'fri' },
    })
  })

  it('never fills a field set by hand, and keeps its words', () => {
    const byHand = withJev(text, jev, { skip: new Set(['when', 'who']) })
    expect(byHand.fields).toEqual({ areaId: HOUSE, mustNotMiss: true })
    expect(byHand.title).toBe('Sam visit garden center at 9pm on saturday')
  })

  it('never fills a field whose reading was taken back', () => {
    // "Sam" was read by the rules and taken back: not Jev's to fill either.
    const takenBack = withJev(text, jev, {
      skip: new Set(['who']),
      notJevs: new Set(['who']),
    })
    expect(takenBack.fields.assignee).toBeUndefined()
    expect(takenBack.title).toBe('Sam visit garden center')
    // And with only Jev kept off it, the rules still read it.
    expect(withJev(text, jev, { notJevs: new Set(['when']) })).toMatchObject({
      title: 'visit garden center',
      fields: { dueDate: '2026-10-17', dueTime: '21:00' },
      phrases: { when: 'at 9pm on saturday' },
    })
  })

  it('drops no word for a field it did not fill', () => {
    const { when: _when, ...rest } = jev
    const kept = withJev(text, rest, { skip: new Set(['when']) })
    expect(kept.title).toBe('visit garden center at 9pm on saturday')
    expect(kept.fields.dueDate).toBeUndefined()
  })

  it('is set aside when it would leave no title', () => {
    expect(
      withJev('Saturday', {
        when: { dueDate: '2026-10-17', dueTime: null },
        drops: [{ index: 0, field: 'when' }],
      }),
    ).toEqual(read('Saturday'))
  })

  it('ignores a word that is not there', () => {
    expect(
      withJev('Mow the lawn', {
        flag: true,
        drops: [{ index: 7, field: 'flag' }],
      }).title,
    ).toBe('Mow the lawn')
  })
})
