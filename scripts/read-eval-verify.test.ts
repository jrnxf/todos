// The documented usage is trusted for three promises, and none of them would
// look wrong in a report if it broke: the veto can only take a date away, the
// tag question never touches a field the rules read, and no sentence of the
// test is written into the requests it is scored by. No key is at hand, so
// the requests are also held to the shapes the providers document.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from '@/lib/read'
import { CASES, HOUSEHOLD } from './read-eval-cases'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import {
  GRIDS,
  JEV_VERSION,
  QUESTIONS,
  chooseCutoff,
  columnAsks,
  columnRead,
  confidence,
  dateFromParts,
  verifyRequest,
} from './read-eval-verify'
import {
  DECISION_PROVIDERS,
  decisionAnswers,
  decisionCall,
} from './read-eval-ways'
import type { Answers, Cutoffs } from './read-eval-verify'

const YARD = HOUSEHOLD.tags.find((one) => one.name === 'Yard')?.id
const cuts: Cutoffs = { tag: 0.7, veto: 0.2, parts: 0.8 }
const pick = (choice: string, sure = 0.95, others = ['none', 'x']) => ({
  choice,
  probabilities: Object.fromEntries([
    [choice, sure],
    ...others
      .filter((other) => other !== choice)
      .map((other) => [other, (1 - sure) / others.length]),
  ]),
})
/** A reply that pushes every way it can: a tag, a veto and a date. */
const pushy: Answers = {
  [QUESTIONS.tag]: pick('Yard'),
  [QUESTIONS.tagReversed]: pick('Yard'),
  [QUESTIONS.when]: { noul: 0.01 },
  [QUESTIONS.mode]: pick('relative'),
  [QUESTIONS.anchor]: pick('tomorrow'),
}
const rulesRead = (title: string) => readTitle(chrono, title, HOUSEHOLD)

describe('the request', () => {
  it('asks only what the rules left to judgment', () => {
    const ids = (title: string) =>
      Object.keys(verifyRequest(title, HOUSEHOLD).request?.questions ?? {})
    // A date was read: is it one? A tag was found: not asked.
    expect(ids('Mow the lawn saturday')).toEqual([QUESTIONS.when])
    // No tag and no date: the tag both ways round, and the date in parts.
    expect(ids('Call mom')).toEqual([
      QUESTIONS.tag,
      QUESTIONS.tagReversed,
      QUESTIONS.mode,
      QUESTIONS.month,
      QUESTIONS.day,
      QUESTIONS.anchor,
      QUESTIONS.weekday,
      QUESTIONS.week,
    ])
    // A tag named outright is not asked about.
    expect(ids('#yard rake saturday')).toEqual([QUESTIONS.when])
  })

  it('pins the model, names and describes each area, and puts `none` first', () => {
    const { request } = verifyRequest('Call mom', HOUSEHOLD)
    expect(request?.model).toBe(JEV_VERSION)
    expect(request?.state).toEqual({
      todo: 'Call mom',
      today: 'Tuesday, 2026-10-13',
    })
    const tag = request?.questions[QUESTIONS.tag] as {
      criteria: Record<string, { what: string; examples: Array<string> }>
    }
    const reversed = request?.questions[QUESTIONS.tagReversed] as typeof tag
    expect(Object.keys(tag.criteria)).toEqual([
      'none',
      ...HOUSEHOLD.tags.map((one) => one.name),
    ])
    expect(Object.keys(reversed.criteria)).toEqual(
      Object.keys(tag.criteria).reverse(),
    )
    expect(tag.criteria.Yard.what).toMatch(/lawn/)
  })

  it('asks about the very words the rules read the date from', () => {
    const { rules, request } = verifyRequest('Mow the lawn saturday', HOUSEHOLD)
    expect(request?.questions[QUESTIONS.when]).toMatchObject({
      type: 'noul',
      instructions: { phrase: rules.phrases.when },
    })
  })

  it('holds no sentence of the test, whole or in part', () => {
    const quoted = new Set<string>()
    const collect = (value: unknown) => {
      if (typeof value === 'string')
        for (const [, said] of value.matchAll(/"([^"]+)"/g)) quoted.add(said)
      else if (Array.isArray(value))
        for (const one of value) {
          if (typeof one === 'string') quoted.add(one)
          else collect(one)
        }
      else if (value && typeof value === 'object')
        Object.values(value).forEach(collect)
    }
    for (const [sentence] of CASES)
      collect(verifyRequest(sentence, HOUSEHOLD).request?.questions)
    // Three words or more is an example to-do, or a good part of one; less
    // is a way of saying a day ("by thursday") that any sentence may share.
    const examples = [...quoted].filter((said) => said.split(' ').length > 2)
    expect(examples.length).toBeGreaterThan(20)
    const bare = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
    for (const example of examples)
      for (const [sentence] of CASES) {
        // A sentence of one short word is in everything.
        if (bare(sentence).length < 8) continue
        expect(bare(sentence)).not.toContain(bare(example))
        expect(bare(example)).not.toContain(bare(sentence))
      }
  })

  it.each(DECISION_PROVIDERS)(
    'is taken by %s in its documented shape, and its reply is read',
    async (provider) => {
      const send = standInFetch(HOUSEHOLD)
      for (const title of ['Call mom', 'Mow the lawn saturday']) {
        const { request } = verifyRequest(title, HOUSEHOLD)
        if (!request) throw new Error('nothing to ask')
        const call = decisionCall(provider, request, STAND_IN_ENV)
        const response = await send(call.url, {
          method: 'POST',
          headers: call.headers,
          body: call.body,
        })
        expect(response.status).toBe(200)
        const { read } = decisionAnswers(provider, await response.json())
        expect(Object.keys(read ?? {}).sort()).toEqual(
          Object.keys(request.questions).sort(),
        )
      }
    },
  )

  it('is sent to Jev as it is, to Clef under Clef’s name, to OpenAI with every option described', () => {
    const { request } = verifyRequest('Call mom', HOUSEHOLD)
    if (!request) throw new Error('nothing to ask')
    expect(JSON.parse(decisionCall('jev', request, {}).body)).toEqual(request)
    expect(JSON.parse(decisionCall('clefFlash', request, {}).body)).toEqual({
      ...request,
      model: 'clef-flash',
    })
    const open = JSON.parse(decisionCall('openai', request, {}).body) as {
      questions: Array<{
        name: string
        instructions: unknown
        choices: Array<{ value: string; description: unknown }>
      }>
    }
    for (const question of open.questions) {
      expect(typeof question.instructions).toBe('string')
      for (const choice of question.choices)
        expect(typeof choice.description).toBe('string')
    }
  })
})

describe('reading a reply', () => {
  it('leaves out an answer that is not well formed', () => {
    const { read } = decisionAnswers('jev', {
      answers: {
        a: { type: 'noul', noul: 0.3 },
        b: { type: 'noul', noul: 'high' },
        c: { type: 'choice', choice: 'x', probabilities: { x: 0.9, y: 0.1 } },
        d: { type: 'choice', choice: 'x', probabilities: { y: 1 } },
        e: { type: 'choice', choice: 'x', probabilities: { x: 2 } },
      },
    })
    expect(read).toEqual({
      a: { noul: 0.3 },
      c: { choice: 'x', probabilities: { x: 0.9, y: 0.1 } },
    })
  })

  it('works confidence out as TypeSafe documents it for a Choice', () => {
    expect(
      confidence({ choice: 'a', probabilities: { a: 0.6, b: 0.3, c: 0.1 } }),
    ).toBeCloseTo(0.4)
    expect(confidence({ noul: 0.9 })).toBe(0)
    expect(confidence(undefined)).toBe(0)
  })
})

describe('the columns', () => {
  it('are the rules alone with no answer', () => {
    const rules = rulesRead('Mow the lawn saturday')
    for (const column of ['tag', 'verify', 'parts'] as const)
      expect(
        columnRead(
          column,
          'Mow the lawn saturday',
          HOUSEHOLD,
          rules,
          null,
          cuts,
        ),
      ).toBe(rules)
  })

  it('fill an area only where the rules found none, and only when both orders agree surely', () => {
    const rules = rulesRead('Call mom')
    const read = (answers: Answers) =>
      columnRead('tag', 'Call mom', HOUSEHOLD, rules, answers, cuts).fields
        .tagId
    expect(read(pushy)).toBe(YARD)
    expect(read({ ...pushy, [QUESTIONS.tagReversed]: pick('Pets') })).toBe(
      undefined,
    )
    expect(read({ ...pushy, [QUESTIONS.tag]: pick('Yard', 0.6) })).toBe(
      undefined,
    )
    expect(
      read({
        [QUESTIONS.tag]: pick('none'),
        [QUESTIONS.tagReversed]: pick('none'),
      }),
    ).toBe(undefined)
    // Not a tag of this household.
    expect(
      read({
        [QUESTIONS.tag]: pick('Boat'),
        [QUESTIONS.tagReversed]: pick('Boat'),
      }),
    ).toBe(undefined)
  })

  it('take a vetoed date away and put its words back in the title', () => {
    const title = 'Mow the lawn saturday'
    const rules = rulesRead(title)
    expect(rules.fields.dueDate).toBe('2026-10-17')
    const read = columnRead('verify', title, HOUSEHOLD, rules, pushy, cuts)
    expect(read.fields.dueDate).toBe(undefined)
    expect(read.fields.dueTime).toBe(undefined)
    expect(read.title).toBe(title)
    // Blamed on the model if it was wrong to.
    expect(read.guessed.when).toBe('saturday')
    // Not sure enough that it is no deadline: the date stays.
    expect(
      columnRead(
        'verify',
        title,
        HOUSEHOLD,
        rules,
        { [QUESTIONS.when]: { noul: 0.3 } },
        cuts,
      ),
    ).toEqual(rules)
    // The tag-only column does not read the veto at all.
    expect(
      columnRead('tag', title, HOUSEHOLD, rules, pushy, cuts).fields.dueDate,
    ).toBe('2026-10-17')
  })

  it('never add or change a date by the veto, whatever the reply, on any sentence', () => {
    for (const noul of [0, 0.1, 0.5, 1])
      for (const [sentence] of CASES) {
        const rules = rulesRead(sentence)
        const read = columnRead(
          'verify',
          sentence,
          HOUSEHOLD,
          rules,
          { ...pushy, [QUESTIONS.when]: { noul } },
          cuts,
        )
        if (read.fields.dueDate !== undefined) {
          expect(read.fields.dueDate).toBe(rules.fields.dueDate)
          expect(read.fields.dueTime).toBe(rules.fields.dueTime)
        }
        // And it never reaches the person, the alert or the flag.
        expect(read.fields.assignee).toBe(rules.fields.assignee)
        expect(read.fields.headsUpDays).toEqual(rules.fields.headsUpDays)
        expect(read.fields.mustNotMiss).toBe(rules.fields.mustNotMiss)
      }
  })

  it('never overwrite a field the rules read by the area question, on any sentence', () => {
    for (const [sentence] of CASES) {
      const rules = rulesRead(sentence)
      const read = columnRead('tag', sentence, HOUSEHOLD, rules, pushy, cuts)
      expect(read.title).toBe(rules.title)
      expect(read.fields).toEqual(
        rules.fields.tagId === undefined
          ? { ...rules.fields, tagId: YARD }
          : rules.fields,
      )
    }
  })

  it('use a date in parts only where the rules read none, and only in its own column', () => {
    const dated = rulesRead('Mow the lawn saturday')
    expect(
      columnRead(
        'parts',
        'Mow the lawn saturday',
        HOUSEHOLD,
        dated,
        {
          ...pushy,
          [QUESTIONS.when]: { noul: 0.9 },
        },
        cuts,
      ).fields.dueDate,
    ).toBe('2026-10-17')
    const bare = rulesRead('Call mom')
    expect(
      columnRead('parts', 'Call mom', HOUSEHOLD, bare, pushy, cuts).fields,
    ).toMatchObject({ dueDate: '2026-10-14', dueTime: null })
    expect(
      columnRead('verify', 'Call mom', HOUSEHOLD, bare, pushy, cuts).fields
        .dueDate,
    ).toBe(undefined)
  })

  it('say which questions are whose, for the cost of each', () => {
    expect(columnAsks('tag', QUESTIONS.tag)).toBe(true)
    expect(columnAsks('tag', QUESTIONS.when)).toBe(false)
    expect(columnAsks('verify', QUESTIONS.when)).toBe(true)
    expect(columnAsks('verify', QUESTIONS.mode)).toBe(false)
    expect(columnAsks('parts', QUESTIONS.week)).toBe(true)
  })
})

describe('a date in parts', () => {
  // Today is Tuesday, 2026-10-13.
  const today = HOUSEHOLD.today
  const date = (parts: Record<string, string>, sure = 0.99) =>
    dateFromParts(
      Object.fromEntries(
        Object.entries(parts).map(([id, choice]) => [id, pick(choice, sure)]),
      ),
      today,
      0.8,
    )
  const weekday = (day: string, week = 'unsaid') =>
    date({
      [QUESTIONS.mode]: 'relative',
      [QUESTIONS.anchor]: 'weekday',
      [QUESTIONS.weekday]: day,
      [QUESTIONS.week]: week,
    })
  const calendar = (month: string, day: string) =>
    date({
      [QUESTIONS.mode]: 'absolute',
      [QUESTIONS.month]: month,
      [QUESTIONS.day]: day,
    })

  it('counts days of the week in code: the next one, and a week on for today’s', () => {
    expect(weekday('Friday')).toBe('2026-10-16')
    expect(weekday('Tuesday')).toBe('2026-10-20')
    expect(weekday('Monday')).toBe('2026-10-19')
    expect(weekday('Thursday', 'next')).toBe('2026-10-22')
    expect(weekday('Tuesday', 'next')).toBe('2026-10-20')
  })

  it('reads today, tomorrow and the day after', () => {
    const anchor = (day: string) =>
      date({ [QUESTIONS.mode]: 'relative', [QUESTIONS.anchor]: day })
    expect(anchor('today')).toBe('2026-10-13')
    expect(anchor('tomorrow')).toBe('2026-10-14')
    expect(anchor('day_after')).toBe('2026-10-15')
  })

  it('takes the next such date to come, with or without a month', () => {
    expect(calendar('October', '22')).toBe('2026-10-22')
    expect(calendar('March', '3')).toBe('2027-03-03')
    expect(calendar('none', '20')).toBe('2026-10-20')
    expect(calendar('none', '1')).toBe('2026-11-01')
    expect(calendar('none', '31')).toBe('2026-10-31')
  })

  it('makes no date of a part left out, an unsure part or a day no month has', () => {
    expect(date({ [QUESTIONS.mode]: 'none' })).toBe(undefined)
    expect(calendar('February', '30')).toBe(undefined)
    expect(calendar('October', 'none')).toBe(undefined)
    expect(weekday('none')).toBe(undefined)
    expect(
      date({ [QUESTIONS.mode]: 'relative', [QUESTIONS.anchor]: 'today' }, 0.5),
    ).toBe(undefined)
    expect(dateFromParts({}, today, 0.8)).toBe(undefined)
  })
})

describe('choosing a cut-off', () => {
  it('takes the least careful that does no more harm than the best, then one step more careful', () => {
    const harm = (at: Record<number, number>) => (cutoff: number) => at[cutoff]
    // Harm starts at 0.6: 0.7 is the least careful clean one, so 0.8.
    expect(
      chooseCutoff(
        GRIDS.tag,
        harm({ 0.95: 0, 0.9: 0, 0.8: 0, 0.7: 0, 0.6: 2, 0.5: 3 }),
      ),
    ).toBe(0.8)
    // No harm anywhere: one step back from the least careful.
    expect(chooseCutoff(GRIDS.veto, () => 0)).toBe(0.4)
    // Harm everywhere but the most careful: that one.
    expect(
      chooseCutoff(
        GRIDS.tag,
        harm({ 0.95: 0, 0.9: 1, 0.8: 1, 0.7: 1, 0.6: 1, 0.5: 1 }),
      ),
    ).toBe(0.95)
  })
})
