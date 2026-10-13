// The report is read to choose how the app reads a title, so its sums have to
// be right: a miscounted hit rate would not look wrong.
import { describe, expect, it } from 'vitest'
import {
  cost,
  filledBy,
  misses,
  rate,
  report,
  sides,
  spend,
  spread,
  tally,
  usd,
  verdict,
  winners,
} from './read-eval-score'
import { PROVIDERS, WAYS } from './read-eval-ways'
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
  inputTokens: tokens,
  outputTokens: 0,
  usd: cost(PROVIDERS.jev, tokens, 0),
  usable: answered,
})
/** A general model's request: charged for what it writes as well. */
const wrote = (ms: number, input: number, output: number): Sent => ({
  ms,
  status: 200,
  inputTokens: input,
  outputTokens: output,
  usd: cost(PROVIDERS.haiku, input, output),
  usable: true,
})
const way = (id: string) => {
  const found = WAYS.find((one) => one.id === id)
  if (!found) throw new Error(`no way called ${id}`)
  return found
}
const ways = [way('rules'), way('first'), way('gaps'), way('haiku')]

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
      // The model wrote all of it, and got the day wrong.
      haiku: read('Mow the lawn', {
        dueDate: '2026-10-25',
        dueTime: null,
        areaId: 2,
      }),
    },
    sent: {
      rules: null,
      first: sent(300, 10_000),
      gaps: sent(100, 2_000),
      haiku: wrote(400, 1_000, 50),
    },
    whole: ['haiku'],
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
      haiku: read('Dinner with the Hendersons'),
    },
    sent: {
      rules: null,
      first: sent(2_000, 12_000, false),
      gaps: null,
      haiku: wrote(600, 1_000, 30),
    },
    whole: ['haiku'],
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
        set: 'First',
        field: 'title',
        expected: 'mow the lawn',
        got: 'mow the',
        filledBy: 'model',
      },
    ])
    expect(tally(outcomes, 'rules', 'area', areas).misses[0]).toMatchObject({
      expected: 'Yard',
      got: 'none',
      filledBy: 'rules',
    })
  })

  it('blames the model only for a field, or a title word, that it took', () => {
    const jevs = read('x', { areaId: 1 }, { area: '' })
    expect(filledBy('area', jevs)).toBe('model')
    expect(filledBy('date', jevs)).toBe('rules')
    // Jev filled the area but dropped no word: the title is the rules'.
    expect(filledBy('title', jevs)).toBe('rules')
    expect(filledBy('title', read('x', {}, { when: 'sunday' }))).toBe('model')
  })

  it('blames the model for all of a reading it wrote whole', () => {
    expect(tally(outcomes, 'haiku', 'date', areas).misses).toEqual([
      {
        sentence: 'Mow the lawn sunday',
        set: 'First',
        field: 'date',
        expected: '2026-10-18',
        got: '2026-10-25',
        filledBy: 'model',
      },
    ])
    expect(filledBy('title', read('x'), true)).toBe('model')
  })

  it('counts the misses of a way over every field', () => {
    expect(misses(outcomes, 'rules', areas)).toHaveLength(1)
    expect(misses(outcomes, 'gaps', areas)).toHaveLength(0)
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

  it('prices a request by what the provider charges in and out', () => {
    expect(usd(cost(PROVIDERS.jev, 1_000_000, 500))).toBe('$0.0420')
    expect(usd(cost(PROVIDERS.jev, 10_400, 0))).toBe('$0.0004')
    // Haiku: $1 in, $5 out.
    expect(cost(PROVIDERS.haiku, 1_000, 50)).toBeCloseTo(0.00125, 10)
    // Clef charges nothing for output.
    expect(cost(PROVIDERS.clef, 1_000_000, 1_000_000)).toBe(0.24)
  })

  it('spreads what a way spent over every to-do, asked about or not', () => {
    expect(spend(outcomes, 'first', 1500)).toMatchObject({
      requests: 2,
      delays: { median: 2000, nineInTen: 2000, slowest: 2000 },
      late: 1,
      unusable: 1,
      inputTokens: 22_000,
      inputPerTodo: 11_000,
      outputPerTodo: 0,
    })
    expect(usd(spend(outcomes, 'first', 1500).usdPerTodo)).toBe('$0.0005')
    expect(spend(outcomes, 'gaps', 1500)).toMatchObject({
      requests: 1,
      late: 0,
      unusable: 0,
      inputPerTodo: 1_000,
    })
    expect(spend(outcomes, 'haiku', 1500)).toMatchObject({
      requests: 2,
      inputPerTodo: 1_000,
      outputPerTodo: 40,
    })
    expect(spend(outcomes, 'haiku', 1500).usd).toBeCloseTo(0.0024, 10)
    expect(spend(outcomes, 'rules', 1500)).toMatchObject({
      requests: 0,
      delays: null,
      usd: 0,
    })
  })
})

describe('the report', () => {
  const run = {
    outcomes,
    sets: [
      { name: 'First', size: 1 },
      { name: 'New', size: 1 },
    ],
    areas,
    ways,
    skipped: [{ way: way('gemini'), why: 'GEMINI_API_KEY not set.' }],
    providers: PROVIDERS,
    models: { jev: 'jev-stand-in' },
    ranOn: '2026-10-13',
    today: '2026-10-13',
    timeLimitMs: 1500,
    capUsd: 2,
    stopped: '',
    standIn: false,
  }
  const written = report(run)
  const section = (heading: string) =>
    written.split(/^#{2,3} /m).find((part) => part.startsWith(heading)) ?? ''

  it('names the winner of each field, or calls it level', () => {
    expect(winners(outcomes, ways, areas)).toEqual([
      'Title: Rules alone, Jev fills the gaps and Fast model, Haiku 4.5 at 2 of 2 (Jev first 1).',
      'Date: Rules alone, Jev first and Jev fills the gaps at 2 of 2 (Fast model, Haiku 4.5 1).',
      'Time: level, every way at 2 of 2.',
      'Who: level, every way at 2 of 2.',
      'Area: Jev first, Jev fills the gaps and Fast model, Haiku 4.5 at 1 of 1 (Rules alone 0).',
      'Heads-up: level, every way at 2 of 2.',
      'Flag: level, every way at 2 of 2.',
    ])
  })

  it('says in one paragraph which way won what', () => {
    const said = verdict(outcomes, ways, areas, 1500)
    expect(said).not.toContain('\n')
    expect(said).toContain(
      'fewest misses in total: Jev fills the gaps with 0 (Rules alone 1, Jev first 1, Jev fills the gaps 0, Fast model, Haiku 4.5 1).',
    )
    expect(said).toContain(
      'Jev fills the gaps answered quickest (median 100 ms) and Jev fills the gaps cost least ($0.0000 a to-do).',
    )
    expect(section('Which won')).toContain(said)
  })

  it('scores all the sentences, and each set on its own', () => {
    expect(section('All 2')).toContain(
      '| title | 2/2 (100%) | 1/2 (50%) | 2/2 (100%) | 2/2 (100%) |',
    )
    expect(section('All 2')).toContain(
      '| **total misses** | **1** | **1** | **0** | **1** |',
    )
    expect(section('First')).toContain(
      '| title | 1/1 (100%) | 0/1 (0%) | 1/1 (100%) | 1/1 (100%) |',
    )
    expect(section('New')).toContain('| area | n/a | n/a | n/a | n/a |')
  })

  it('lists the misses of each way under its own heading', () => {
    expect(section('Rules alone: 1')).toContain(
      '| First | Mow the lawn sunday | area | Yard | none | rules |',
    )
    expect(section('Jev first: 1')).toContain(
      '| First | Mow the lawn sunday | title | mow the lawn | mow the | model |',
    )
    expect(section('Jev fills the gaps: 0')).toContain('None.')
  })

  it('gives the speed, the tokens and the cost of every way in one table', () => {
    const table = section('Speed and cost')
    expect(table).toContain(
      '| Rules alone | 0 | n/a | n/a | n/a | 0 | 0 | 0 | 0 | $0.0000 | $0.0000 |',
    )
    expect(table).toContain(
      '| Jev first | 2 | 2000 ms | 2000 ms | 2000 ms | 1 | 1 | 11000 | 0 | $0.0005 | $0.0009 |',
    )
    expect(table).toContain(
      '| Jev fills the gaps | 1 | 100 ms | 100 ms | 100 ms | 0 | 0 | 1000 | 0 | $0.0000 | $0.0001 |',
    )
    expect(table).toContain(
      '| Fast model, Haiku 4.5 | 2 | 600 ms | 600 ms | 600 ms | 0 | 0 | 1000 | 40 | $0.0012 | $0.0024 |',
    )
    expect(table).toContain('The whole run: $0.0034.')
    expect(table).toContain('- Jev first, 500: Dinner with the Hendersons')
  })

  it('names a way that was skipped, and why, without scoring it', () => {
    expect(written).toContain(
      '- **Fast model, Gemini 3.1 Flash Lite**: GEMINI_API_KEY not set.',
    )
    expect(section('All 2')).not.toContain('Gemini')
  })

  it('says where each provider fact came from', () => {
    const notes = section('Notes')
    expect(notes).toContain('**TypeSafe Jev**: `jev-latest`')
    expect(notes).toContain('key from `ANTHROPIC_API_KEY`')
    expect(notes).toContain('https://ai.google.dev/gemini-api/docs/pricing')
    // A provider no way in the run or skipped uses is left out.
    expect(notes).not.toContain('Clef')
  })

  it('says so, first, when stand-ins answered', () => {
    expect(written).not.toContain('stand-in run')
    expect(report({ ...run, standIn: true })).toMatch(
      /^# Reading to-do titles\n\n\*\*A stand-in run\. No service was called/,
    )
  })
})
