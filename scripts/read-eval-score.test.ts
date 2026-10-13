// The report is read to choose how the app reads a title, so its sums have to
// be right: a miscounted hit rate would not look wrong.
import { describe, expect, it } from 'vitest'
import {
  cost,
  filledBy,
  headline,
  misses,
  rate,
  report,
  sides,
  spend,
  spread,
  tally,
  usd,
} from './read-eval-score'
import { PROVIDERS, WAYS } from './read-eval-ways'
import type { TitleRead } from '@/lib/read'
import type { Expected } from './read-eval-cases'
import type { Outcome, Run, Sent } from './read-eval-score'

const tags = [
  { id: 1, name: 'House' },
  { id: 2, name: 'Yard' },
]
const read = (
  title: string,
  fields: TitleRead['fields'] = {},
  guessed: TitleRead['guessed'] = {},
): TitleRead => ({ title, fields, phrases: {}, guessed })
const sent = (ms: number, tokens: number, answered = true): Sent => ({
  ms,
  status: answered ? 200 : 500,
  inputTokens: tokens,
  outputTokens: 0,
  usd: cost(PROVIDERS.jev, tokens, 0),
  usable: answered,
})
const way = (id: string) => {
  const found = WAYS.find((one) => one.id === id)
  if (!found) throw new Error(`no way called ${id}`)
  return found
}
const ways = [way('rules'), way('verify:jev'), way('who:jev')]

const mow: Expected = {
  title: 'Mow the lawn',
  date: '2026-10-18',
  tag: 'Yard',
}
const dated = { dueDate: '2026-10-18', dueTime: null }
const outcomes: Array<Outcome> = [
  {
    sentence: 'Sam mow the lawn sunday',
    expected: { ...mow, who: 'sam' },
    set: 'First',
    reads: {
      // The date, the person and the title, not the tag.
      rules: read('Mow the lawn', { ...dated, assignee: 'sam' }),
      // All of it.
      'verify:jev': read(
        'Mow the lawn',
        { ...dated, assignee: 'sam', tagId: 2 },
        { tag: '' },
      ),
      // The tag, but the person taken back and put in the title.
      'who:jev': read(
        'Sam mow the lawn',
        { ...dated, tagId: 2 },
        { tag: '', who: 'Sam' },
      ),
    },
    sent: {
      rules: null,
      'verify:jev': sent(100, 2_000),
      'who:jev': sent(100, 3_000),
    },
  },
  {
    sentence: 'Dinner with the Hendersons',
    // No tag given: two would be right, so it is not scored.
    expected: { title: 'Dinner with the Hendersons' },
    set: 'New',
    reads: {
      rules: read('Dinner with the Hendersons'),
      'verify:jev': read('Dinner with the Hendersons', { tagId: 1 }),
      'who:jev': read('Dinner with the Hendersons'),
    },
    sent: {
      rules: null,
      'verify:jev': sent(2_000, 1_000, false),
      'who:jev': null,
    },
  },
]

describe('scoring a reading', () => {
  it('compares titles without case or closing punctuation, and alerts in any order', () => {
    const got = sides(
      { title: 'Renew passport.', headsUp: [7, 1] },
      read('renew passport', { headsUpDays: [1, 7] }),
      tags,
    )
    expect(got.title).toEqual(['renew passport', 'renew passport'])
    expect(got['heads-up']).toEqual(['[1, 7]', '[1, 7]'])
  })

  it('tells no tag wanted from a tag not scored', () => {
    expect(sides({ title: 'x', tag: null }, read('x'), tags).tag).toEqual([
      'none',
      'none',
    ])
    expect(sides({ title: 'x' }, read('x', { tagId: 1 }), tags).tag).toBeNull()
  })

  it('counts hits only over the sentences a field is scored on', () => {
    expect(rate(tally(outcomes, 'rules', 'tag', tags))).toBe('0/1 (0%)')
    expect(rate(tally(outcomes, 'verify:jev', 'tag', tags))).toBe('1/1 (100%)')
    expect(rate(tally(outcomes, 'who:jev', 'title', tags))).toBe('1/2 (50%)')
    expect(rate({ hits: 0, scored: 0, misses: [] })).toBe('n/a')
  })

  it('lists each miss with what was wanted, what was read and whose say it was', () => {
    expect(tally(outcomes, 'who:jev', 'who', tags).misses).toEqual([
      {
        sentence: 'Sam mow the lawn sunday',
        set: 'First',
        field: 'who',
        expected: 'sam',
        got: 'nobody',
        filledBy: 'model',
      },
    ])
    expect(tally(outcomes, 'rules', 'tag', tags).misses[0].filledBy).toBe(
      'rules',
    )
  })

  it('blames the model only for a field, or a title, that it had the say in', () => {
    const guess = read('x', {}, { tag: '', when: 'friday' })
    expect(filledBy('tag', guess)).toBe('model')
    expect(filledBy('date', guess)).toBe('model')
    expect(filledBy('time', guess)).toBe('model')
    expect(filledBy('who', guess)).toBe('rules')
    // Words went back in the title on its say.
    expect(filledBy('title', guess)).toBe('model')
    expect(filledBy('title', read('x', {}, { tag: '' }))).toBe('rules')
  })

  it('counts the misses of a way over every field', () => {
    expect(misses(outcomes, 'rules', tags)).toHaveLength(1)
    expect(misses(outcomes, 'verify:jev', tags)).toHaveLength(0)
    expect(misses(outcomes, 'who:jev', tags)).toHaveLength(2)
  })
})

describe('delay and cost', () => {
  it('finds the median, the 9-in-10 mark and the slowest, whatever the order', () => {
    expect(spread([900, 100, 300, 200, 500])).toEqual({
      median: 300,
      nineInTen: 900,
      slowest: 900,
    })
    expect(spread([])).toBeNull()
  })

  it('prices a request by what the provider charges in and out', () => {
    expect(cost(PROVIDERS.jev, 1_000_000, 500)).toBeCloseTo(0.042)
    expect(cost(PROVIDERS.clef, 1_000_000, 500)).toBeCloseTo(0.24)
    expect(usd(0.00012)).toBe('$0.0001')
  })

  it('spreads what a way spent over every to-do, asked about or not', () => {
    expect(spend(outcomes, 'verify:jev', 1500)).toMatchObject({
      requests: 2,
      late: 1,
      unusable: 1,
      inputTokens: 3_000,
      inputPerTodo: 1_500,
    })
    expect(spend(outcomes, 'who:jev', 1500).requests).toBe(1)
    expect(spend(outcomes, 'rules', 1500)).toMatchObject({
      requests: 0,
      delays: null,
      usd: 0,
    })
  })
})

describe('the report', () => {
  const run: Run = {
    outcomes,
    sets: [
      { name: 'First', size: 1, kind: 'tuned' },
      { name: 'Old', size: 0, kind: 'seen' },
      { name: 'New', size: 1, kind: 'unseen' },
    ],
    tags,
    ways,
    skipped: [
      { way: way('verify:clef'), why: 'CLOUDFLARE_API_TOKEN not set.' },
    ],
    providers: PROVIDERS,
    models: { jev: 'jev-1.13.0' },
    ranOn: '2026-10-13',
    today: '2026-10-13',
    timeLimitMs: 1500,
    capUsd: 2,
    stopped: '',
    standIn: false,
    cutoffs: [
      {
        way: 'Verify, Jev',
        question: 'how sure of the tag',
        acts: 'filled',
        chosen: 0.8,
        used: 0.6,
        fixed: true,
        hindsight: 0.9,
        rows: [
          { cutoff: 0.9, misses: { First: 1, New: 0 }, acted: { First: 0 } },
          { cutoff: 0.8, misses: { First: 0, New: 1 }, acted: { First: 1 } },
          { cutoff: 0.6, misses: { First: 0, New: 1 }, acted: { First: 1 } },
        ],
      },
      {
        way: 'Verify + who, Jev',
        question: 'how sure of the person',
        acts: 'filled',
        chosen: 0.8,
        used: 0.8,
        fixed: false,
        hindsight: 0.8,
        rows: [{ cutoff: 0.8, misses: { First: 2 }, acted: { First: 1 } }],
      },
    ],
    spentUsd: 0.0034,
    results: 'data/read-eval/results.json',
  }
  const written = report(run)
  const section = (heading: string) =>
    written.split(/^#{2,3} /m).find((part) => part.startsWith(heading)) ?? ''

  it('leads with one table of the fields missed, each way by each set, the unseen set first', () => {
    const lead = section('Fields missed')
    expect(written.indexOf('## Fields missed')).toBeLessThan(
      written.indexOf('## Hit rate per field'),
    )
    expect(lead).toContain(
      '| Way | New (of 6) | Old (of 0) | First (of 7) | All 2 (of 13) |',
    )
    expect(lead).toContain('| Rules alone | 0 | 0 | 1 | 1 |')
    expect(lead).toContain('| Verify, Jev | 0 | 0 | 0 | 0 |')
    expect(lead).toContain('| Verify + who, Jev | 0 | 0 | 2 | 2 |')
  })

  it('answers in plain words: against the rules, and whether asking more than the app does won', () => {
    expect(headline(outcomes.slice(1), ways, tags, 'the unseen ones')).toBe(
      'On the unseen ones, every way missed the same: 0 of 6 fields. Asking a model won nothing and lost nothing.',
    )
    expect(headline(outcomes, ways, tags, 'all of them')).toBe(
      'On all of them, Verify, Jev missed fewest: 0 of 13 fields. The rules alone missed 1, so asking a model won by 1 (Verify, Jev). Asking more than the app does lost: Verify, Jev missed 0, and the best of the wider ways (Verify + who, Jev) missed 2.',
    )
    // A wider way that wins is said to win.
    const better = outcomes.map((outcome) => ({
      ...outcome,
      reads: { ...outcome.reads, 'who:jev': outcome.reads['verify:jev'] },
    }))
    expect(
      headline(
        [
          better[0],
          {
            ...better[1],
            reads: { ...better[1].reads, 'verify:jev': read('Dinner') },
          },
        ],
        ways,
        tags,
        'all',
      ),
    ).toContain('Asking more than the app does won 1')
    expect(section('Fields missed')).toContain(
      'On the 1 sentences of New, every way missed the same',
    )
  })

  it('shows the per-field hit rates of the unseen set and of all, and no other', () => {
    const at = (heading: string) => written.indexOf(`### ${heading}\n`)
    expect(at('New')).toBeGreaterThan(-1)
    expect(at('New')).toBeLessThan(at('All 2'))
    expect(at('First')).toBe(-1)
    expect(section('All 2')).toContain('| tag | 0/1 (0%) | 1/1 (100%) |')
  })

  it('shows what each cut-off costs, which was used, and what hindsight would have picked', () => {
    const app = section('Verify, Jev: how sure of the tag')
    expect(app).toContain(
      '| Cut-off | New: missed, filled | Old: missed, filled | First: missed, filled |',
    )
    expect(app).toContain('| 0.9 | 0, 0 | 0, 0 | 1, 0 |')
    expect(app).toContain('| 0.6 (used) | 1, 0 | 0, 0 | 0, 1 |')
    expect(app).toContain(
      'Used: 0.6, the cut-off the app acts on. This run would choose 0.8 on the tuned sets. Hindsight: 0.9 would have missed 0 fields on the other sets, where 0.6 missed 1.',
    )
    expect(section('Verify + who, Jev: how sure of the person')).toContain(
      'Used: 0.8, chosen on the tuned sets. Hindsight finds no cut-off that would have missed fewer on the other sets (0).',
    )
    expect(section('Cut-offs')).toContain('That one is hindsight')
  })

  it('lists the misses of each way under its own heading', () => {
    expect(section('Rules alone: 1')).toContain(
      '| First | Sam mow the lawn sunday | tag | Yard | none | rules |',
    )
    expect(section('Verify + who, Jev: 2')).toContain(
      '| First | Sam mow the lawn sunday | who | sam | nobody | model |',
    )
    expect(section('Verify, Jev: 0')).toContain('None.')
  })

  it('gives the speed, the tokens and the cost of every way in one table', () => {
    const table = section('Speed and cost')
    expect(table).toContain(
      '| Rules alone | 0 | n/a | n/a | n/a | 0 | 0 | 0 | $0.0000 | $0.0000 |',
    )
    expect(table).toContain(
      '| Verify, Jev | 2 | 2000 ms | 2000 ms | 2000 ms | 1 | 1 | 1500 | $0.0001 | $0.0001 |',
    )
    expect(table).toContain(
      'The whole run, every request counted once: $0.0034.',
    )
    expect(table).toContain('- Verify, Jev, 500: Dinner with the Hendersons')
  })

  it('names a way that was skipped, and why, without scoring it', () => {
    expect(written).toContain(
      '- **Verify, Clef**: CLOUDFLARE_API_TOKEN not set.',
    )
    expect(section('All 2')).not.toContain('Clef')
  })

  it('says where each provider fact came from', () => {
    const notes = section('Notes')
    expect(notes).toContain('**TypeSafe Jev**: `jev-1.13.0`')
    expect(notes).toContain('key from `CLOUDFLARE_API_TOKEN`')
    expect(notes).toContain('https://docs.typesafe.ai/api')
  })

  it('says so, first, when stand-ins answered', () => {
    const stood = report({ ...run, standIn: true })
    expect(stood.indexOf('A stand-in run')).toBeLessThan(
      stood.indexOf('## Fields missed'),
    )
    expect(written).not.toContain('A stand-in run')
  })

  it('says why a run ended early', () => {
    expect(report({ ...run, stopped: 'Stopped: the cap.' })).toContain(
      '**Stopped: the cap.**',
    )
  })
})
