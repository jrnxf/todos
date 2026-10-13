// The check is trusted for two promises, and neither would look wrong on
// the add bar if it broke: the veto can only take a date away, and the tag
// question never touches a field the rules read.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from './read'
import {
  CUTOFFS,
  JEV_VERSION,
  QUESTIONS,
  answersIn,
  verdictFrom,
  verifiedRead,
  verifyRequest,
} from './verify'
import type { ReadContext } from './read'
import type { Answers } from './verify'

const YARD = 2
const context: ReadContext = {
  today: '2026-10-13', // a Tuesday
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: [
    { id: 1, name: 'House' },
    { id: YARD, name: 'Yard' },
    // One the descriptions know nothing about.
    { id: 3, name: 'Errands' },
  ],
}
const pick = (choice: string, sure = 0.95) => ({
  choice,
  probabilities: { [choice]: sure, other: 1 - sure },
})
/** A reply that pushes both ways it can: a tag and a veto. */
const pushy: Answers = {
  [QUESTIONS.tag]: pick('Yard'),
  [QUESTIONS.tagReversed]: pick('Yard'),
  [QUESTIONS.when]: { noul: 0.01 },
}
const rules = (title: string, more: Partial<ReadContext> = {}) =>
  readTitle(chrono, title, { ...context, ...more })
const checked = (
  title: string,
  answers: Answers,
  more: Partial<ReadContext> = {},
) => {
  const all = { ...context, ...more }
  const read = rules(title, more)
  return verifiedRead(chrono, title, all, read, verdictFrom(answers, read, all))
}

describe('the request', () => {
  const ids = (title: string, more: Partial<ReadContext> = {}) =>
    Object.keys(
      verifyRequest(chrono, title, { ...context, ...more }).request
        ?.questions ?? {},
    )

  it('asks only what the rules left to judgment', () => {
    // A date was read: is it one? A tag was found: not asked.
    expect(ids('Mow the lawn saturday')).toEqual([QUESTIONS.when])
    // No tag and no date: the tag, both ways round.
    expect(ids('Call mom')).toEqual([QUESTIONS.tag, QUESTIONS.tagReversed])
    // A tag named outright is not asked about.
    expect(ids('#yard rake saturday')).toEqual([QUESTIONS.when])
    // Nothing to judge: nothing to send.
    expect(verifyRequest(chrono, 'Mow the lawn', context).request).toBeNull()
  })

  it('does not ask about a field set by hand or taken back', () => {
    expect(ids('Call mom', { skip: new Set(['tag']) })).toEqual([])
    expect(ids('Call mom saturday', { skip: new Set(['when']) })).toEqual([
      QUESTIONS.tag,
      QUESTIONS.tagReversed,
    ])
  })

  it('pins the model, names and describes each tag, and puts `none` first', () => {
    const { request } = verifyRequest(chrono, 'Call mom', context)
    expect(request?.model).toBe(JEV_VERSION)
    expect(request?.state).toEqual({
      todo: 'Call mom',
      today: 'Tuesday, 2026-10-13',
    })
    const tag = request?.questions[QUESTIONS.tag] as {
      criteria: Record<string, { what: string } | null>
    }
    const reversed = request?.questions[QUESTIONS.tagReversed] as typeof tag
    expect(Object.keys(tag.criteria)).toEqual([
      'none',
      'House',
      'Yard',
      'Errands',
    ])
    expect(Object.keys(reversed.criteria)).toEqual(
      Object.keys(tag.criteria).reverse(),
    )
    expect(tag.criteria.Yard?.what).toMatch(/lawn/)
    // A tag of the household's own making goes by its name alone.
    expect(tag.criteria.Errands).toBeNull()
  })

  it('asks about the very words the rules read the date from', () => {
    const asked = verifyRequest(chrono, 'Mow the lawn saturday', context)
    expect(asked.request?.questions[QUESTIONS.when]).toMatchObject({
      type: 'noul',
      instructions: { phrase: asked.rules.phrases.when },
    })
  })
})

describe('reading a reply', () => {
  it('leaves out an answer that is not well formed', () => {
    expect(
      answersIn({
        answers: {
          a: { type: 'noul', noul: 0.3 },
          b: { type: 'noul', noul: 'high' },
          c: { type: 'choice', choice: 'x', probabilities: { x: 0.9, y: 0.1 } },
          d: { type: 'choice', choice: 'x', probabilities: { y: 1 } },
          e: { type: 'choice', choice: 'x', probabilities: { x: 2 } },
        },
      }),
    ).toEqual({
      a: { noul: 0.3 },
      c: { choice: 'x', probabilities: { x: 0.9, y: 0.1 } },
    })
    expect(answersIn({})).toBeNull()
    expect(answersIn(null)).toBeNull()
  })
})

describe('the verdict', () => {
  it('is the rules’ reading when there is none', () => {
    const read = rules('Mow the lawn saturday')
    expect(
      verifiedRead(chrono, 'Mow the lawn saturday', context, read, null),
    ).toBe(read)
  })

  it('fills a tag only where the rules found none, and only when both orders agree surely', () => {
    const tag = (answers: Answers) => checked('Call mom', answers).fields.tagId
    expect(tag(pushy)).toBe(YARD)
    expect(checked('Call mom', pushy).guessed).toEqual({ tag: '' })
    expect(tag({ ...pushy, [QUESTIONS.tagReversed]: pick('House') })).toBe(
      undefined,
    )
    expect(
      tag({ ...pushy, [QUESTIONS.tag]: pick('Yard', CUTOFFS.tag - 0.01) }),
    ).toBe(undefined)
    expect(
      tag({
        [QUESTIONS.tag]: pick('none'),
        [QUESTIONS.tagReversed]: pick('none'),
      }),
    ).toBe(undefined)
    // Not a tag of this household.
    expect(
      tag({
        [QUESTIONS.tag]: pick('Boat'),
        [QUESTIONS.tagReversed]: pick('Boat'),
      }),
    ).toBe(undefined)
    // The rules read one: it is theirs.
    expect(checked('Fix the leaky faucet', pushy).fields.tagId).toBe(1)
    // Set by hand or taken back: not the model's to fill.
    expect(
      checked('Call mom', pushy, { skip: new Set(['tag']) }).fields.tagId,
    ).toBe(undefined)
  })

  it('takes a vetoed date away and puts its words back in the title', () => {
    const title = 'Sam: mow the lawn saturday at 9am'
    expect(rules(title).fields).toMatchObject({
      dueDate: '2026-10-17',
      dueTime: '09:00',
    })
    const read = checked(title, pushy)
    expect(read.fields.dueDate).toBe(undefined)
    expect(read.fields.dueTime).toBe(undefined)
    expect(read.phrases.when).toBe(undefined)
    expect(read.title).toBe('mow the lawn saturday at 9am')
    // Everything else the rules read stands.
    expect(read.fields.assignee).toBe('sam')
    // Blamed on the model if it was wrong to.
    expect(read.guessed.when).toBe('saturday at 9am')
    // Not sure enough that it is no deadline: the date stays.
    expect(
      checked(title, { [QUESTIONS.when]: { noul: CUTOFFS.veto + 0.01 } }),
    ).toEqual(rules(title))
  })

  it('is not acted on for other words than it was asked about', () => {
    const title = 'Mow the lawn friday'
    expect(
      verifiedRead(chrono, title, context, rules(title), {
        notWhen: 'saturday',
      }),
    ).toEqual(rules(title))
  })

  it('never adds or changes a date, a person, a heads-up or a flag, whatever the reply', () => {
    for (const noul of [0, 0.1, 0.5, 1])
      for (const title of [
        'Sam: dentist fri 5pm, remind me 3 days before !',
        'Order Taco Tuesday supplies',
        'Call mom',
        'I need to renew my passport by the 30th',
        'Tomorrow',
      ]) {
        const read = checked(title, { ...pushy, [QUESTIONS.when]: { noul } })
        const first = rules(title)
        if (read.fields.dueDate !== undefined) {
          expect(read.fields.dueDate).toBe(first.fields.dueDate)
          expect(read.fields.dueTime).toBe(first.fields.dueTime)
          expect(read.title).toBe(first.title)
        }
        expect(read.fields.assignee).toBe(first.fields.assignee)
        expect(read.fields.headsUpDays).toEqual(first.fields.headsUpDays)
        expect(read.fields.mustNotMiss).toBe(first.fields.mustNotMiss)
      }
  })
})
