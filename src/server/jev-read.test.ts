// Jev's reading comes from an outside service that may be slow, down, or
// wrong. Every one of those has to end in "no answer" for the field, which
// the rules then read: never a wrong fill, never a lost word, and never an
// error on the add bar. The service is stood in for (./jev-stand-in.ts):
// these have never called the real one.
import * as chrono from 'chrono-node'
import { describe, expect, it, vi } from 'vitest'
import { gapsIn, readTitle } from '@/lib/read'
import {
  DAYS_AHEAD,
  DROP_FLOOR,
  FILL_FLOOR,
  jevReadFrom,
  jevRequest,
  readWithJev,
} from './jev-read'
import { standInReply } from './jev-stand-in'
import type { JevRead, ReadContext, ReadField } from '@/lib/read'

const HOUSE = 1
const KIDS = 2
const PAPERWORK = 7
const household = {
  today: '2026-10-13', // a Tuesday
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: [
    { id: HOUSE, name: 'House' },
    { id: KIDS, name: 'Kids' },
    { id: PAPERWORK, name: 'Paperwork' },
  ],
}
const context: ReadContext = household
const OWNERS = "Sam visit garden center at 9pm on saturday don't forget"

const replying = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }))
/** The network, answered by the stand-in. */
const standIn = () =>
  vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(standInReply(JSON.parse(init?.body as string))),
  )
/** The stand-in's reply to a title, with some answers swapped for others. */
const reply = (title: string, swap: Record<string, unknown> = {}) => {
  const body = standInReply(jevRequest(title, household))
  return { ...body, answers: { ...body.answers, ...swap } }
}
const choice = (picked: string, probability: number) => ({
  type: 'choice',
  choice: picked,
  probabilities: { [picked]: probability },
  confidence: probability,
})
/** What the add bar ends up with: Jev's answer first, the rules for the rest. */
const filled = (title: string, body: unknown, ask?: Array<ReadField>) =>
  readTitle(chrono, title, {
    ...context,
    jev: jevReadFrom(body, title, household, ask),
  })
const rules = (title: string) => readTitle(chrono, title, context)

describe('asking Jev', () => {
  it('sends one request with every question, and the key as a bearer token', async () => {
    const network = standIn()
    await readWithJev(OWNERS, household, { apiKey: 'k-123', fetch: network })

    expect(network).toHaveBeenCalledOnce()
    const [url, init] = network.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer k-123',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init?.body as string)
    expect(body.model).toBe('jev-latest')
    // All that leaves: the title, today, the first names, who is typing.
    expect(body.state).toEqual({
      todo: OWNERS,
      today: 'Tuesday, October 13, 2026',
      people: ['Alex', 'Sam'],
      typed_by: 'Alex',
    })
    expect(Object.keys(body.questions)).toEqual([
      'date',
      'time',
      'person',
      'area',
      'alert',
      'flag',
      ...Array.from({ length: 10 }, (_, index) => `word_${index}`),
    ])
    expect(body.questions.area).toEqual({
      type: 'choice',
      instructions: expect.stringContaining('`none`'),
      criteria: {
        area_1: 'House',
        area_2: 'Kids',
        area_7: 'Paperwork',
        none: expect.any(String),
      },
    })
    expect(body.questions.person.criteria).toEqual({
      person_0: expect.stringContaining('Alex, who is typing'),
      person_1: 'Sam',
      none: expect.any(String),
    })
    expect(body.questions.flag.type).toBe('noul')
    expect(body.questions.word_7).toMatchObject({
      type: 'choice',
      instructions: { word: 'saturday', place: 8 },
      criteria: { task: expect.any(String), when: expect.any(String) },
    })
  })

  it('offers the coming days and every quarter hour, within the option limit', () => {
    const { questions } = jevRequest(OWNERS, household) as {
      questions: Record<string, { criteria?: Record<string, string> }>
    }
    const days = questions.date.criteria ?? {}
    expect(Object.keys(days)).toHaveLength(DAYS_AHEAD + 2)
    expect(days['day_2026-10-13']).toBe('Tuesday, October 13, 2026: today')
    expect(days['day_2026-10-17']).toBe(
      'Saturday, October 17, 2026: 4 days from today',
    )
    const times = questions.time.criteria ?? {}
    expect(Object.keys(times)).toHaveLength(96 + 2)
    expect(times['time_21:00']).toBe('9:00 pm')
    for (const question of Object.values(questions))
      expect(Object.keys(question.criteria ?? {}).length).toBeLessThanOrEqual(
        255,
      )
  })

  it('asks only about the fields still open', () => {
    const { questions } = jevRequest(OWNERS, household, ['tag', 'flag']) as {
      questions: Record<string, { criteria: Record<string, string> }>
    }
    expect(Object.keys(questions).slice(0, 2)).toEqual(['area', 'flag'])
    expect(questions.date).toBeUndefined()
    expect(questions.person).toBeUndefined()
    expect(Object.keys(questions.word_0.criteria)).toEqual([
      'task',
      'area',
      'flag',
    ])
  })

  it('sends nothing without a key, a title, or a field left to ask about', async () => {
    const network = standIn()
    expect(
      await readWithJev(OWNERS, household, { apiKey: '', fetch: network }),
    ).toBeNull()
    expect(
      await readWithJev('  ', household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
    expect(
      await readWithJev(OWNERS, household, {
        apiKey: 'k',
        ask: [],
        fetch: network,
      }),
    ).toBeNull()
    expect(network).not.toHaveBeenCalled()
  })

  it('asks the stand-in at the address it is given', async () => {
    const network = standIn()
    await readWithJev(OWNERS, household, {
      apiKey: 'k',
      endpoint: 'http://127.0.0.1:4011/v1/systemone',
      fetch: network,
    })
    expect(network.mock.calls[0][0]).toBe('http://127.0.0.1:4011/v1/systemone')
  })
})

describe('a sure answer', () => {
  it('fills every button and tidies the title', async () => {
    const jev = await readWithJev(OWNERS, household, {
      apiKey: 'k',
      fetch: standIn(),
    })
    expect(jev).toMatchObject({
      when: { dueDate: '2026-10-17', dueTime: '21:00' },
      who: 'sam',
      tag: HOUSE,
      flag: true,
    })
    expect(readTitle(chrono, OWNERS, { ...context, jev })).toMatchObject({
      title: 'visit garden center',
      fields: {
        dueDate: '2026-10-17',
        dueTime: '21:00',
        assignee: 'sam',
        tagId: HOUSE,
        mustNotMiss: true,
      },
      phrases: {},
    })
  })

  it('reads a heads-up, one of the offered ones or none at all', () => {
    expect(
      filled(
        'Pay property tax friday, remind me a week before',
        reply('Pay property tax friday, remind me a week before'),
      ),
    ).toMatchObject({
      title: 'Pay property tax',
      fields: { headsUpDays: [7], dueDate: '2026-10-16', tagId: PAPERWORK },
    })
    expect(
      filled(
        'Water the plants no reminder',
        reply('Water the plants no reminder'),
      ),
    ).toMatchObject({ title: 'Water the plants', fields: { headsUpDays: [] } })
  })

  it('gives "I need to" to whoever is typing', () => {
    expect(
      filled('I need to call the school', reply('I need to call the school'))
        .fields.assignee,
    ).toBe('alex')
  })
})

describe('falling back to the rules', () => {
  it.each([401, 422, 429, 500, 529])('on a %i reply', async (status) => {
    expect(
      await readWithJev(OWNERS, household, {
        apiKey: 'k',
        fetch: replying(reply(OWNERS), status),
      }),
    ).toBeNull()
  })

  it('when the device is offline', async () => {
    const network = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await readWithJev(OWNERS, household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
  })

  it('when the reply is not JSON', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('<html>oops'))
    expect(
      await readWithJev(OWNERS, household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
  })

  it('when the reply takes longer than the time limit', async () => {
    // Answers only when its request is given up on, as a hung server would.
    const network = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          ),
        ),
    )
    const started = Date.now()
    expect(
      await readWithJev(OWNERS, household, {
        apiKey: 'k',
        fetch: network,
        timeLimitMs: 30,
      }),
    ).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it.each([
    ['an empty reply', null],
    ['a reply with no answers', { model: 'jev-1.13.0' }],
    ['answers to other questions', { answers: { rule: choice('x', 0.99) } }],
    [
      'answers with no probabilities',
      {
        answers: {
          date: { choice: 'day_2026-10-17' },
          time: { choice: 'time_21:00' },
          person: { choice: 'person_1' },
          area: { choice: 'area_1' },
          flag: { noul: 'yes' },
          word_0: { choice: 'who' },
        },
      },
    ],
    ['every answer under the floor', reply(`${OWNERS} unsure`)],
  ])('for every field, from %s', (_name, body) => {
    expect(jevReadFrom(body, OWNERS, household)).toEqual({ drops: [] })
    // The add bar is then exactly what the rules alone read.
    expect(filled(OWNERS, body)).toEqual(rules(OWNERS))
  })

  it.each([
    ['the day', { date: choice('day_2026-10-17', FILL_FLOOR - 0.01) }],
    ['the time', { time: choice('time_21:00', FILL_FLOOR - 0.01) }],
    ['a day that is not offered', { date: choice('day_2031-01-01', 0.99) }],
    ['a day said but not listed', { date: choice('unlisted', 0.99) }],
    ['a time not on a quarter hour', { time: choice('unlisted', 0.99) }],
    ['a time with no day', { date: choice('none', 0.99) }],
  ])('for the whole date when unsure of %s', (_name, swap) => {
    const jev = jevReadFrom(reply(OWNERS, swap), OWNERS, household)
    expect(jev.when).toBeUndefined()
    // No date word left the title on Jev's say-so; the rules read the date.
    expect(jev.drops.some((drop) => drop.field === 'when')).toBe(false)
    expect(filled(OWNERS, reply(OWNERS, swap))).toMatchObject({
      title: 'visit garden center',
      fields: { dueDate: '2026-10-17', dueTime: '21:00', assignee: 'sam' },
      phrases: { when: 'at 9pm on saturday' },
    })
  })

  it.each([
    ['who', { person: choice('person_1', FILL_FLOOR - 0.01) }, 'assignee'],
    ['who', { person: choice('person_9', 0.99) }, 'assignee'],
    ['the flag', { flag: { type: 'noul', noul: FILL_FLOOR - 0.01 } }, 'flag'],
  ])('for %s alone, keeping the rest', (_name, swap, field) => {
    const jev = jevReadFrom(reply(OWNERS, swap), OWNERS, household)
    expect(field === 'flag' ? jev.flag : jev.who).toBeUndefined()
    expect(jev.when).toEqual({ dueDate: '2026-10-17', dueTime: '21:00' })
    // The rules read that field from the words Jev left in place.
    expect(filled(OWNERS, reply(OWNERS, swap))).toMatchObject({
      title: 'visit garden center',
      fields: { assignee: 'sam', mustNotMiss: true, tagId: HOUSE },
    })
  })

  it('for the area, which the rules do not guess', () => {
    for (const swap of [
      { area: choice('area_1', FILL_FLOOR - 0.01) },
      { area: choice('none', 0.99) },
      { area: choice('area_99', 0.99) },
    ])
      expect(filled(OWNERS, reply(OWNERS, swap)).fields.tagId).toBeUndefined()
  })

  it('for a heads-up that is not one of the offered ones', () => {
    // Jev can only pick an offered one; the rules read any number of days.
    const title = 'Renew passport friday, remind me 5 days before'
    const read = filled(title, reply(title))
    expect(read.fields.headsUpDays).toEqual([5])
    expect(read.title).toBe('Renew passport')
  })

  it('ignores an answer to a field that was not asked about', () => {
    // The person set the date and the name by hand: a reply that answers
    // them anyway changes neither.
    const jev = jevReadFrom(reply(OWNERS), OWNERS, household, ['tag', 'flag'])
    expect(jev).toEqual({
      tag: HOUSE,
      flag: true,
      drops: [
        { index: 8, field: 'flag' },
        { index: 9, field: 'flag' },
      ],
    })
  })
})

describe('the title', () => {
  it('keeps a word Jev is not sure enough about', () => {
    const swap = { word_7: choice('when', DROP_FLOOR - 0.01) }
    expect(filled(OWNERS, reply(OWNERS, swap)).title).toBe(
      'visit garden center saturday',
    )
  })

  it('keeps a word said to be for a field that was not filled', () => {
    // "center" is called a heads-up, and there is no heads-up.
    const swap = { word_3: choice('headsUp', 0.99) }
    expect(filled(OWNERS, reply(OWNERS, swap)).title).toBe(
      'visit garden center',
    )
  })

  it('keeps a word given a reason that does not exist', () => {
    const swap = { word_1: choice('filler', 0.99) }
    expect(filled(OWNERS, reply(OWNERS, swap)).title).toBe(
      'visit garden center',
    )
  })

  it('keeps every word when all of them would go', () => {
    const title = 'saturday 9pm'
    const jev = jevReadFrom(reply(title), title, household)
    expect(jev.when).toBeDefined()
    expect(jev.drops).toEqual([])
    expect(filled(title, reply(title)).title).not.toBe('')
  })

  // The words of the task, which must all still be there, in order, after
  // tidying: with a sure answer, an unsure one, and none.
  it.each([
    [OWNERS, 'visit garden center'],
    ['Sam: pick up dry cleaning tomorrow', 'pick up dry cleaning'],
    ['Call Sam about dinner on friday at 6pm', 'Call Sam about dinner'],
    ["Buy Sam's birthday present by saturday", "Buy Sam's birthday present"],
    ['Log in to the school portal tomorrow', 'Log in to the school portal'],
    ['Check in at the hotel at 3pm friday', 'Check in at the hotel'],
    ['Book a table for four on saturday', 'Book a table for four'],
    ['Pay property tax, remind me a week before', 'Pay property tax'],
    ['I need to renew the passport important', 'renew the passport'],
    [
      'Forget-me-nots for the garden on monday',
      'Forget-me-nots for the garden',
    ],
    ['Alex mow the lawn sat 10:30am', 'mow the lawn'],
    ['Sign the forms at 9:20am today', 'Sign the forms'],
    ['Take 2 weeks of recycling to the depot', 'Take 2 weeks of recycling'],
  ])('never loses a word of the task in %j', (title, task) => {
    const wanted = task.split(' ')
    for (const body of [
      reply(title),
      reply(`${title} unsure`),
      reply(title, { date: choice('none', 0.99) }),
      reply(title, { person: choice('none', 0.99) }),
    ]) {
      const kept = filled(title, body).title.split(/\s+/)
      let from = 0
      for (const word of wanted) {
        const at = kept.findIndex(
          (one, index) => index >= from && one.replace(/[,.]$/, '') === word,
        )
        expect(at, `"${word}" in "${kept.join(' ')}"`).toBeGreaterThanOrEqual(0)
        from = at + 1
      }
    }
  })
})

// The other way of using Jev: the rules read first, and Jev is asked only
// about what they left empty. What the rules read is theirs for good.
describe('Jev fills the gaps', () => {
  const gaps = (title: string, more: Partial<ReadContext> = {}) =>
    gapsIn(chrono, title, { ...context, ...more })
  /** Jev sure of everything, and all of it different from what was typed. */
  const contrary: JevRead = {
    when: { dueDate: '2026-12-25', dueTime: '06:00' },
    who: 'alex',
    tag: PAPERWORK,
    headsUp: [14],
    flag: true,
    drops: [
      { index: 0, field: 'who' },
      { index: 1, field: 'when' },
    ],
  }
  const filling = (title: string, more: Partial<ReadContext> = {}) =>
    readTitle(chrono, title, {
      ...context,
      jev: contrary,
      jevUse: 'gaps',
      ...more,
    })

  it('asks only about the fields the rules left empty', () => {
    expect(gaps(OWNERS)).toEqual(['tag', 'headsUp'])
    expect(gaps('Buy dog food')).toEqual([
      'when',
      'who',
      'tag',
      'headsUp',
      'flag',
    ])
  })

  it('asks about the area unless it was named outright', () => {
    expect(gaps('Flu shots for the kids')).toContain('tag')
    expect(gaps('Flu shots #kids')).not.toContain('tag')
    expect(gaps('Kids: flu shots')).not.toContain('tag')
  })

  it('does not ask about a field set by hand or taken back', () => {
    expect(
      gaps('Buy dog food', {
        skip: new Set<ReadField>(['when', 'tag']),
        notJevs: new Set<ReadField>(['who']),
      }),
    ).toEqual(['headsUp', 'flag'])
  })

  it('sends no question about a field the rules read, nor about any word', () => {
    const asked = Object.keys(
      jevRequest(OWNERS, household, gaps(OWNERS), false).questions,
    )
    expect(asked).toEqual(['area', 'alert'])
  })

  it('never overwrites what the rules read, and leaves the title to them', () => {
    const title = 'Sam: mow the lawn saturday at 9pm, no reminder !!'
    const read = filling(title)
    expect(read.fields).toEqual({
      ...rules(title).fields,
      tagId: PAPERWORK,
    })
    expect(read.title).toBe('mow the lawn')
    expect(read.guessed).toEqual({ tag: '' })
  })

  it('fills every field the rules left empty', () => {
    const read = filling('Buy dog food')
    expect(read.title).toBe('Buy dog food')
    expect(read.fields).toEqual({
      dueDate: '2026-12-25',
      dueTime: '06:00',
      assignee: 'alex',
      tagId: PAPERWORK,
      headsUpDays: [14],
      mustNotMiss: true,
    })
  })

  it('takes Jev over an area named in passing, but not over one named outright', () => {
    expect(filling('Flu shots for the kids').fields.tagId).toBe(PAPERWORK)
    expect(filling('Flu shots #kids').fields.tagId).toBe(KIDS)
    expect(filling('Kids: flu shots').fields.tagId).toBe(KIDS)
  })

  it('leaves a field set by hand or taken back alone', () => {
    const read = filling('Buy dog food', {
      skip: new Set<ReadField>(['when', 'tag']),
      notJevs: new Set<ReadField>(['who']),
    })
    expect(read.fields).toEqual({ headsUpDays: [14], mustNotMiss: true })
  })

  it('reads by the rules alone when Jev has no answer', () => {
    expect(
      readTitle(chrono, OWNERS, { ...context, jev: null, jevUse: 'gaps' }),
    ).toEqual(rules(OWNERS))
  })
})
