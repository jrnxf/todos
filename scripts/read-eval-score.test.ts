// The report is read to choose how the app uses Jev, so its sums have to be
// right: a miscounted hit rate would not look wrong.
import { describe, expect, it } from 'vitest'
import {
  filledBy,
  rate,
  report,
  sides,
  spend,
  spread,
  tally,
  usd,
  winners,
} from './read-eval-score'
import type { TitleRead } from '@/lib/read'
import type { Expected } from './read-eval-cases'
import type { Outcome, Sent } from './read-eval-score'

const areas = [
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
  tokens,
  jev: answered ? { drops: [] } : null,
})

const mow: Expected = {
  title: 'Mow the lawn',
  date: '2026-10-18',
  area: 'Yard',
}
const outcomes: Array<Outcome> = [
  {
    sentence: 'Mow the lawn sunday',
    expected: mow,
    set: 'First',
    reads: {
      // The date and the title, not the area.
      rules: read('Mow the lawn', { dueDate: '2026-10-18', dueTime: null }),
      // The area, but a scrap left in the title.
      first: read(
        'Mow the',
        { dueDate: '2026-10-18', dueTime: null, areaId: 2 },
        { when: 'sunday', area: '' },
      ),
      // All of it.
      gaps: read(
        'Mow the lawn',
        { dueDate: '2026-10-18', dueTime: null, areaId: 2 },
        { area: '' },
      ),
    },
    sent: { first: sent(300, 10_000), gaps: sent(100, 2_000) },
  },
  {
    sentence: 'Dinner with the Hendersons',
    // No area given: two would be right, so it is not scored.
    expected: { title: 'Dinner with the Hendersons' },
    set: 'New',
    reads: {
      rules: read('Dinner with the Hendersons'),
      first: read('Dinner with the Hendersons', { areaId: 1 }, { area: '' }),
      gaps: read('Dinner with the Hendersons'),
    },
    sent: { first: sent(2_000, 12_000, false), gaps: null },
  },
]

describe('scoring a reading', () => {
  it('compares titles without case or closing punctuation, and alerts in any order', () => {
    const side = sides(
      { title: 'Book the cabin', headsUp: [7, 1] },
      read('book the cabin,', { headsUpDays: [1, 7] }),
      areas,
    )
    expect(side.title).toEqual(['book the cabin', 'book the cabin'])
    expect(side['heads-up']).toEqual(['[1, 7]', '[1, 7]'])
  })

  it('tells no area wanted from an area not scored', () => {
    expect(sides({ title: 'x', area: null }, read('x'), areas).area).toEqual([
      'none',
      'none',
    ])
    expect(sides({ title: 'x' }, read('x', { areaId: 1 }), areas).area).toBe(
      null,
    )
  })

  it('counts hits only over the sentences a field is scored on', () => {
    expect(rate(tally(outcomes, 'rules', 'area', areas))).toBe('0/1 (0%)')
    expect(rate(tally(outcomes, 'gaps', 'area', areas))).toBe('1/1 (100%)')
    expect(rate(tally(outcomes, 'first', 'title', areas))).toBe('1/2 (50%)')
    expect(rate(tally(outcomes, 'rules', 'date', areas))).toBe('2/2 (100%)')
    expect(rate(tally([], 'rules', 'date', areas))).toBe('n/a')
  })

  it('lists each miss with what was wanted, what was read and who filled it', () => {
    expect(tally(outcomes, 'first', 'title', areas).misses).toEqual([
      {
        sentence: 'Mow the lawn sunday',
        field: 'title',
        expected: 'mow the lawn',
        got: 'mow the',
        filledBy: 'Jev',
      },
    ])
    expect(tally(outcomes, 'rules', 'area', areas).misses[0]).toMatchObject({
      expected: 'Yard',
      got: 'none',
      filledBy: 'rules',
    })
  })

  it('blames Jev only for a field, or a title word, that Jev took', () => {
    const jevs = read('x', { areaId: 1 }, { area: '' })
    expect(filledBy('area', jevs)).toBe('Jev')
    expect(filledBy('date', jevs)).toBe('rules')
    // Jev filled the area but dropped no word: the title is the rules'.
    expect(filledBy('title', jevs)).toBe('rules')
    expect(filledBy('title', read('x', {}, { when: 'sunday' }))).toBe('Jev')
  })
})

describe('delay and cost', () => {
  it('finds the median, the 9-in-10 mark and the slowest, whatever the order', () => {
    expect(spread([900, 100, 300, 200, 500, 400, 700, 600, 800, 1000])).toEqual(
      { median: 600, nineInTen: 1000, slowest: 1000 },
    )
    expect(spread([250])).toEqual({ median: 250, nineInTen: 250, slowest: 250 })
    expect(spread([])).toBe(null)
  })

  it('prices tokens at $0.042 a million', () => {
    expect(usd(1_000_000)).toBe('$0.0420')
    expect(usd(10_400)).toBe('$0.0004')
  })

  it('spreads what a way spent over every to-do, asked about or not', () => {
    expect(spend(outcomes, 'first')).toEqual({
      requests: 2,
      tokens: 22_000,
      tokensPerTodo: 11_000,
      usdPerTodo: '$0.0005',
    })
    expect(spend(outcomes, 'gaps')).toEqual({
      requests: 1,
      tokens: 2_000,
      tokensPerTodo: 1_000,
      usdPerTodo: '$0.0000',
    })
  })
})

describe('the report', () => {
  const written = report({
    outcomes,
    sets: [
      { name: 'First', size: 1 },
      { name: 'New', size: 1 },
    ],
    areas,
    endpoint: 'http://stand-in',
    model: 'jev-stand-in',
    ranOn: '2026-10-13',
    today: '2026-10-13',
    timeLimitMs: 1500,
    capUsd: 0.5,
    stopped: '',
  })
  const section = (heading: string) =>
    written.split(/^#{2,3} /m).find((part) => part.startsWith(heading)) ?? ''

  it('names the winner of each field, or calls it level', () => {
    expect(winners(outcomes, areas)).toEqual([
      'Title: Rules alone and Jev fills the gaps at 2 of 2 (Jev first 1).',
      'Date: level, all three at 2 of 2.',
      'Time: level, all three at 2 of 2.',
      'Who: level, all three at 2 of 2.',
      'Area: Jev first and Jev fills the gaps at 1 of 1 (Rules alone 0).',
      'Heads-up: level, all three at 2 of 2.',
      'Flag: level, all three at 2 of 2.',
    ])
  })

  it('scores all the sentences, and each set on its own', () => {
    expect(section('All 2')).toContain(
      '| title | 2/2 (100%) | 1/2 (50%) | 2/2 (100%) |',
    )
    expect(section('First')).toContain(
      '| title | 1/1 (100%) | 0/1 (0%) | 1/1 (100%) |',
    )
    expect(section('New')).toContain('| area | n/a | n/a | n/a |')
  })

  it('lists the misses of each way under its own heading', () => {
    expect(section('Rules alone: 1')).toContain(
      '| area | Yard | none | rules |',
    )
    expect(section('Jev first: 1')).toContain(
      '| Mow the lawn sunday | title | mow the lawn | mow the | Jev |',
    )
    expect(section('Jev fills the gaps: 0')).toContain('None.')
  })

  it('gives the delay and the cost of each way', () => {
    expect(section('Delay')).toContain(
      '**Jev first**: 2 requests for 2 sentences. Median 2000 ms, 9 in 10 within 2000 ms, slowest 2000 ms. 1 took longer than the add bar waits (1500 ms) and were read by the rules alone. 1 got no usable reply at all.',
    )
    expect(section('Delay')).toContain('- 500: Dinner with the Hendersons')
    expect(section('Delay')).toContain(
      '**Jev fills the gaps**: 1 requests for 2 sentences. Median 100 ms',
    )
    expect(section('Cost')).toContain(
      '| Jev first | 2 | 22000 | $0.0009 | 11000 | $0.0005 |',
    )
    expect(section('Cost')).toContain(
      '| Jev fills the gaps | 1 | 2000 | $0.0001 | 1000 | $0.0000 |',
    )
    expect(section('Cost')).toContain(
      'The whole run: 24000 input tokens, $0.0010.',
    )
  })
})
