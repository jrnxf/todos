// The test is trusted for these, and none of them would look wrong in a
// report if it broke: it asks the app's request and reads it with the app's
// code, the wider checks can only take back what the rules read or fill a
// person where they read none, and no sentence of the test is written into
// the requests it is scored by. No key is at hand, so the requests are also
// held to the shapes the providers document.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from '@/lib/read'
import {
  verifyRequest as appRequest,
  verdictFrom,
  verifiedRead,
} from '@/lib/verify'
import { CASES, HOUSEHOLD, SETS } from './read-eval-cases'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import {
  CUTOFFS,
  GRIDS,
  QUESTIONS,
  STARTING_CUTOFFS,
  chooseCutoff,
  columnAsks,
  columnRead,
  hindsightCutoff,
  named,
  verifyRequest,
} from './read-eval-verify'
import {
  DECISION_PROVIDERS,
  decisionAnswers,
  decisionCall,
} from './read-eval-ways'
import type { Answers, Column, Cutoffs } from './read-eval-verify'

const YARD = HOUSEHOLD.tags.find((one) => one.name === 'Yard')?.id
const cuts: Cutoffs = { ...STARTING_CUTOFFS, ...CUTOFFS }
const COLUMNS: ReadonlyArray<Column> = ['verify', 'who', 'title', 'both']
const pick = (choice: string, sure = 0.95) => ({
  choice,
  probabilities: { [choice]: sure, other: 1 - sure },
})
const rulesRead = (title: string) => readTitle(chrono, title, HOUSEHOLD)
const column = (name: Column, title: string, answers: Answers | null) =>
  columnRead(name, title, HOUSEHOLD, rulesRead(title), answers, cuts)
const ids = (title: string, app = false) =>
  Object.keys(verifyRequest(title, HOUSEHOLD, app).request?.questions ?? {})
// The household is Michelle (0) and Sam (1), and Sam is typing.
const MICHELLE = 'who_0'
const SAM = 'who_1'

describe('the sentences', () => {
  it('are 300, in five sets, none of them twice', () => {
    expect(SETS.map((set) => [set.name, set.cases.length, set.kind])).toEqual([
      ['First 30', 30, 'tuned'],
      ['New 70', 70, 'tuned'],
      ['Held out 50', 50, 'seen'],
      ['Fresh 50', 50, 'seen'],
      ['Unseen 100', 100, 'unseen'],
    ])
    expect(
      new Set(CASES.map(([sentence]) => sentence.toLowerCase())).size,
    ).toBe(300)
  })
})

describe('the request', () => {
  it('is the app’s own, with the test’s questions after the app’s', () => {
    for (const [sentence] of CASES) {
      const app = appRequest(chrono, sentence, HOUSEHOLD)
      // Asked for alone, it is the app's request to the byte.
      expect(
        JSON.stringify(verifyRequest(sentence, HOUSEHOLD, true).request),
      ).toBe(JSON.stringify(app.request))
      const wide = verifyRequest(sentence, HOUSEHOLD)
      expect(wide.rules).toEqual(app.rules)
      if (!wide.request) {
        expect(app.request).toBeNull()
        continue
      }
      const mine = Object.keys(app.request?.questions ?? {})
      expect(Object.keys(wide.request.questions).slice(0, mine.length)).toEqual(
        mine,
      )
      for (const id of mine)
        expect(wide.request.questions[id]).toEqual(app.request?.questions[id])
      if (app.request) {
        expect(wide.request.model).toBe(app.request.model)
        expect(wide.request.state).toEqual(app.request.state)
      }
    }
  })

  it('asks who of every household name in the title, and of no other word', () => {
    expect(named('Call Sam about Michelle’s party', HOUSEHOLD)).toEqual([
      { index: 0, id: 'michelle', name: 'Michelle' },
      { index: 1, id: 'sam', name: 'Sam' },
    ])
    expect(named('Samsung repair for Samantha', HOUSEHOLD)).toEqual([])
    expect(ids('Sam: dentist fri 5pm')).toEqual([
      QUESTIONS.when,
      SAM,
      'title_who',
    ])
    expect(ids("Sam's dentist appointment friday")).toEqual([
      QUESTIONS.when,
      SAM,
    ])
    // Nobody named: nothing to ask about who.
    expect(ids('I need to call the dentist')).toEqual(['title_who'])
    const { request } = verifyRequest('Sam: dentist fri 5pm', HOUSEHOLD)
    expect(request?.questions[SAM]).toMatchObject({
      type: 'noul',
      instructions: { person: 'Sam' },
    })
  })

  it('asks of the title only the phrases the rules took out for who, the heads-up and the flag', () => {
    const title = 'Sam: renew the passports, remind me a week before !!'
    const { rules, request } = verifyRequest(title, HOUSEHOLD)
    expect(Object.keys(request?.questions ?? {})).toEqual([
      SAM,
      'title_who',
      'title_headsUp',
      'title_flag',
    ])
    for (const field of ['who', 'headsUp', 'flag'] as const)
      expect(request?.questions[`title_${field}`]).toMatchObject({
        type: 'noul',
        instructions: { phrase: rules.phrases[field] },
      })
    // A tag the rules hinted at stays in the title: nothing was taken out.
    expect(ids('Mow the lawn')).toEqual([])
    expect(verifyRequest('Mow the lawn', HOUSEHOLD).request).toBeNull()
  })

  it('says which questions are whose, for the cost of each', () => {
    expect(columnAsks('verify', QUESTIONS.tag)).toBe(true)
    expect(columnAsks('verify', QUESTIONS.when)).toBe(true)
    expect(columnAsks('verify', SAM)).toBe(false)
    expect(columnAsks('verify', 'title_flag')).toBe(false)
    expect(columnAsks('who', SAM)).toBe(true)
    expect(columnAsks('who', 'title_flag')).toBe(false)
    expect(columnAsks('title', 'title_flag')).toBe(true)
    expect(columnAsks('title', SAM)).toBe(false)
    expect(columnAsks('both', SAM)).toBe(true)
    expect(columnAsks('both', 'title_who')).toBe(true)
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
    expect(examples.length).toBeGreaterThan(35)
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
      for (const title of ['Call mom', 'Sam: mow the lawn saturday !!']) {
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
        // The stand-in agrees with the rules, so every column is the rules'.
        for (const name of COLUMNS)
          expect(column(name, title, read)).toEqual(rulesRead(title))
      }
    },
  )
})

describe('the app’s column', () => {
  it('is the app’s own reading of the reply, and the rules’ with no reply', () => {
    const answers: Answers = {
      [QUESTIONS.tag]: pick('Yard'),
      [QUESTIONS.tagReversed]: pick('Yard'),
      [QUESTIONS.when]: { noul: 0.01 },
      [SAM]: { noul: 0.01 },
      title_who: { noul: 0.99 },
    }
    for (const title of [
      'Sam: call mom saturday',
      'Call mom',
      'Mow the lawn',
    ]) {
      const rules = rulesRead(title)
      expect(column('verify', title, answers)).toEqual(
        verifiedRead(
          chrono,
          title,
          HOUSEHOLD,
          rules,
          verdictFrom(answers, rules, HOUSEHOLD),
        ),
      )
      for (const name of COLUMNS)
        expect(column(name, title, null)).toEqual(rules)
    }
    expect(column('verify', 'Call mom', answers).fields.tagId).toBe(YARD)
    // The wider questions are not the app's: it does not read them.
    expect(column('verify', 'Sam: call mom', answers).fields.assignee).toBe(
      'sam',
    )
  })
})

describe('checking who', () => {
  const no = { noul: 0.01 }
  const yes = { noul: 0.99 }

  it('takes back a person the rules read, and puts the words back', () => {
    const title = 'Sam call the school tomorrow'
    expect(rulesRead(title)).toMatchObject({
      title: 'call the school',
      fields: { assignee: 'sam' },
    })
    for (const name of ['who', 'both'] as const) {
      const read = column(name, title, { [SAM]: no })
      expect(read.title).toBe('Sam call the school')
      expect(read.fields.assignee).toBe(undefined)
      // Everything else the rules read stands.
      expect(read.fields.dueDate).toBe('2026-10-14')
      // Blamed on the model if it was wrong to.
      expect(read.guessed.who).toBe('Sam')
    }
    // Not sure enough, or not asked in this column: the person stays.
    expect(
      column('who', title, { [SAM]: { noul: cuts.whoNo + 0.01 } }),
    ).toEqual(rulesRead(title))
    expect(column('title', title, { [SAM]: no })).toEqual(rulesRead(title))
  })

  it('fills a person where the rules read none, and leaves the title alone', () => {
    const title = 'have Michelle water the ferns'
    expect(rulesRead(title).fields.assignee).toBe(undefined)
    const read = column('who', title, { [MICHELLE]: yes })
    expect(read.fields.assignee).toBe('michelle')
    expect(read.title).toBe(rulesRead(title).title)
    expect(read.guessed.who).toBe('')
    expect(
      column('who', title, { [MICHELLE]: { noul: cuts.whoYes - 0.01 } }).fields
        .assignee,
    ).toBe(undefined)
  })

  it('fills nobody when it is sure of two, and never over a person the rules kept', () => {
    const both = 'Michelle and Sam anniversary dinner'
    expect(
      column('who', both, { [MICHELLE]: yes, [SAM]: yes }).fields.assignee,
    ).toBe(undefined)
    const kept = 'Sam: call Michelle'
    expect(
      column('who', kept, { [MICHELLE]: yes, [SAM]: { noul: 0.5 } }).fields
        .assignee,
    ).toBe('sam')
    // Taken back from one, and sure of the other: it is the other's.
    const swapped = column('who', kept, { [MICHELLE]: yes, [SAM]: no })
    expect(swapped.fields.assignee).toBe('michelle')
    expect(swapped.title).toBe('Sam: call Michelle')
  })

  it('leaves a to-do that is the typist’s by "I need to" alone', () => {
    const title = 'I need to call Michelle'
    expect(rulesRead(title).fields.assignee).toBe('sam')
    expect(column('who', title, { [MICHELLE]: yes }).fields.assignee).toBe(
      'sam',
    )
  })
})

describe('checking the title', () => {
  it('puts back a phrase that is part of the task, and takes its field away', () => {
    const title = 'Renew the passports, remind me a week before !!'
    expect(rulesRead(title)).toMatchObject({
      title: 'Renew the passports',
      fields: { headsUpDays: [7], mustNotMiss: true },
    })
    for (const name of ['title', 'both'] as const) {
      const read = column(name, title, { title_headsUp: { noul: 0.99 } })
      expect(read.title).toBe('Renew the passports, remind me a week before')
      expect(read.fields.headsUpDays).toBe(undefined)
      expect(read.fields.mustNotMiss).toBe(true)
      expect(read.guessed.headsUp).toBe(', remind me a week before')
    }
    const all = column('title', title, {
      title_headsUp: { noul: 0.99 },
      title_flag: { noul: 0.99 },
    })
    expect(all.title).toBe(title)
    // The tag the rules hinted at is all that is left.
    expect(all.fields).toEqual({ tagId: rulesRead(title).fields.tagId })
    // Not sure enough, or not asked in this column: nothing goes back.
    expect(
      column('title', title, { title_flag: { noul: cuts.title - 0.01 } }),
    ).toEqual(rulesRead(title))
    expect(column('who', title, { title_flag: { noul: 0.99 } })).toEqual(
      rulesRead(title),
    )
  })

  it('keeps a vetoed date’s words in the title as well', () => {
    const title = 'Sam: order Taco Tuesday supplies'
    const read = column('both', title, {
      [QUESTIONS.when]: { noul: 0.01 },
      title_who: { noul: 0.99 },
    })
    expect(read.title).toBe(title)
    expect(read.fields.dueDate).toBe(undefined)
    expect(read.fields.assignee).toBe(undefined)
  })
})

describe('every column, on every sentence, whatever the reply', () => {
  const replies: ReadonlyArray<number> = [0, 0.3, 0.7, 1]

  it('never adds or changes a date, a heads-up, a flag or a tag the rules read', () => {
    for (const odds of replies)
      for (const [sentence] of CASES) {
        const rules = rulesRead(sentence)
        const answers: Answers = Object.fromEntries(
          ids(sentence).map((id) => [
            id,
            id.startsWith('area') ? pick('Yard') : { noul: odds },
          ]),
        )
        for (const name of COLUMNS) {
          const read = column(name, sentence, answers)
          for (const key of [
            'dueDate',
            'dueTime',
            'headsUpDays',
            'mustNotMiss',
          ] as const)
            if (read.fields[key] !== undefined)
              expect(read.fields[key]).toEqual(rules.fields[key])
          expect(read.fields.tagId).toBe(rules.fields.tagId ?? YARD)
          // A person is one of the household's, named in the title, or the
          // rules' own.
          if (read.fields.assignee !== rules.fields.assignee)
            expect([
              undefined,
              ...named(sentence, HOUSEHOLD).map((one) => one.id),
            ]).toContain(read.fields.assignee)
          // The app's column and the title column never fill a person.
          if (name === 'verify')
            expect(read.fields.assignee).toBe(rules.fields.assignee)
          if (name === 'title' && read.fields.assignee !== undefined)
            expect(read.fields.assignee).toBe(rules.fields.assignee)
          // A title only ever gets words back.
          expect(read.title.length).toBeGreaterThanOrEqual(rules.title.length)
        }
      }
  })
})

describe('choosing a cut-off', () => {
  const harm = (at: Record<number, number>) => (cutoff: number) => at[cutoff]

  it('takes the least careful that does no more harm than the best, then one step more careful', () => {
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

  it('finds what hindsight would have picked: the fewest misses, most careful first', () => {
    expect(
      hindsightCutoff(
        GRIDS.tag,
        harm({ 0.95: 9, 0.9: 7, 0.8: 4, 0.7: 4, 0.6: 6, 0.5: 8 }),
      ),
    ).toBe(0.8)
    expect(hindsightCutoff(GRIDS.veto, () => 3)).toBe(0.05)
  })

  it('tries every cut-off from the most careful to the least', () => {
    for (const grid of Object.values(GRIDS)) {
      expect(grid).toHaveLength(6)
      expect(grid.at(-1)).toBe(0.5)
    }
    expect(Object.keys(GRIDS).sort()).toEqual(
      Object.keys(STARTING_CUTOFFS).sort(),
    )
  })
})
