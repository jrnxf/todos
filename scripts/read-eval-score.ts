// The sums behind `bun run eval:read`: what counts as a hit, the delays, the
// cost, and the report they are written into. Nothing here sends anything, so
// the arithmetic can be tested on its own.
import type { JevRead, ReadField, TitleRead } from '@/lib/read'
import type { Expected } from './read-eval-cases'

/** Jev 1.13: charged per input token (docs.typesafe.ai/models). */
export const USD_PER_TOKEN = 0.042 / 1_000_000

/** The three ways a title is read, in the order the report shows them. */
export const WAYS = ['rules', 'first', 'gaps'] as const
export type Way = (typeof WAYS)[number]
/** The ways that ask Jev. */
export type JevWay = Exclude<Way, 'rules'>
export const WAY_NAMES: Record<Way, string> = {
  rules: 'Rules alone',
  first: 'Jev first',
  gaps: 'Jev fills the gaps',
}

export const FIELDS = [
  'title',
  'date',
  'time',
  'who',
  'area',
  'heads-up',
  'flag',
] as const
export type Field = (typeof FIELDS)[number]

const READ_FIELD: Record<Exclude<Field, 'title'>, ReadField> = {
  date: 'when',
  time: 'when',
  who: 'who',
  area: 'area',
  'heads-up': 'headsUp',
  flag: 'flag',
}

/** One request to Jev and what came of it. */
export interface Sent {
  ms: number
  status: number | string
  /** Input tokens: the service's count, or the estimate when it gave none. */
  tokens: number
  /** Jev's reading, or null: an error, or no reply inside the eval's limit. */
  jev: JevRead | null
}

export interface Outcome {
  sentence: string
  expected: Expected
  /** Which set of sentences it belongs to. */
  set: string
  reads: Record<Way, TitleRead>
  /** Null where nothing was sent: the rules had left nothing to ask about. */
  sent: Record<JevWay, Sent | null>
}

type Areas = ReadonlyArray<{ id: number; name: string }>

/** What was wanted and what was read, as text that compares. */
export function sides(
  expected: Expected,
  read: TitleRead,
  areas: Areas,
): Record<Field, [wanted: string, got: string] | null> {
  const area = areas.find((one) => one.id === read.fields.areaId)
  const plain = (title: string) =>
    title
      .toLowerCase()
      .replace(/[\s,;:.]+$/, '')
      .trim()
  const days = (list: Array<number> | undefined) =>
    list ? `[${[...list].sort((a, b) => a - b).join(', ')}]` : 'unsaid'
  return {
    title: [plain(expected.title), plain(read.title)],
    date: [expected.date ?? 'none', read.fields.dueDate ?? 'none'],
    time: [expected.time ?? 'none', read.fields.dueTime ?? 'none'],
    who: [expected.who ?? 'nobody', read.fields.assignee ?? 'nobody'],
    // Not scored where the sentence could sit in two areas.
    area:
      expected.area === undefined
        ? null
        : [expected.area ?? 'none', area?.name ?? 'none'],
    'heads-up': [days(expected.headsUp), days(read.fields.headsUpDays)],
    flag: [
      expected.flag ? 'yes' : 'no',
      read.fields.mustNotMiss ? 'yes' : 'no',
    ],
  }
}

/** Who filled a field that came out wrong: Jev, or the rules. */
export function filledBy(field: Field, read: TitleRead): 'Jev' | 'rules' {
  // A title is Jev's doing once any word left it on Jev's say.
  if (field === 'title')
    return Object.values(read.guessed).some((words) => words) ? 'Jev' : 'rules'
  return read.guessed[READ_FIELD[field]] !== undefined ? 'Jev' : 'rules'
}

export interface Miss {
  sentence: string
  field: Field
  expected: string
  got: string
  filledBy: 'Jev' | 'rules'
}

export interface Tally {
  hits: number
  /** How many sentences the field was scored on. */
  scored: number
  misses: Array<Miss>
}

/** How often one way got one field as a person would expect. */
export function tally(
  outcomes: ReadonlyArray<Outcome>,
  way: Way,
  field: Field,
  areas: Areas,
): Tally {
  const result: Tally = { hits: 0, scored: 0, misses: [] }
  for (const outcome of outcomes) {
    const read = outcome.reads[way]
    const side = sides(outcome.expected, read, areas)[field]
    if (!side) continue
    result.scored += 1
    if (side[0] === side[1]) result.hits += 1
    else
      result.misses.push({
        sentence: outcome.sentence,
        field,
        expected: side[0],
        got: side[1],
        filledBy: filledBy(field, read),
      })
  }
  return result
}

export const rate = ({ hits, scored }: Tally) =>
  scored === 0
    ? 'n/a'
    : `${hits}/${scored} (${Math.round((100 * hits) / scored)}%)`

/** The median, the delay 9 in 10 came within, and the slowest. */
export function spread(delays: ReadonlyArray<number>) {
  const sorted = [...delays].sort((a, b) => a - b)
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
  return sorted.length === 0
    ? null
    : {
        median: at(0.5),
        nineInTen: at(0.9),
        slowest: sorted[sorted.length - 1],
      }
}

export const usd = (tokens: number) => `$${(tokens * USD_PER_TOKEN).toFixed(4)}`

/** What one way sent and spent over every sentence. */
export function spend(outcomes: ReadonlyArray<Outcome>, way: JevWay) {
  const sent = outcomes.flatMap((outcome) => outcome.sent[way] ?? [])
  const tokens = sent.reduce((sum, one) => sum + one.tokens, 0)
  return {
    requests: sent.length,
    tokens,
    /** Per to-do typed, whether or not it needed a request. */
    tokensPerTodo: Math.round(tokens / Math.max(1, outcomes.length)),
    usdPerTodo: usd(tokens / Math.max(1, outcomes.length)),
  }
}

const list = (names: Array<string>) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** One sentence a field: who got it right most often. */
export function winners(
  outcomes: ReadonlyArray<Outcome>,
  areas: Areas,
): Array<string> {
  return FIELDS.map((field) => {
    const scores = WAYS.map((way) => tally(outcomes, way, field, areas))
    const scored = scores[0].scored
    const best = Math.max(...scores.map((score) => score.hits))
    const leaders = WAYS.filter((_way, index) => scores[index].hits === best)
    const name = field[0].toUpperCase() + field.slice(1)
    if (leaders.length === WAYS.length)
      return `${name}: level, all three at ${best} of ${scored}.`
    const others = WAYS.filter((way) => !leaders.includes(way))
      .map((way) => `${WAY_NAMES[way]} ${scores[WAYS.indexOf(way)].hits}`)
      .join(', ')
    return `${name}: ${list(leaders.map((way) => WAY_NAMES[way]))} at ${best} of ${scored} (${others}).`
  })
}

export interface Run {
  outcomes: ReadonlyArray<Outcome>
  /** Every sentence set, in order, with how many sentences it holds. */
  sets: ReadonlyArray<{ name: string; size: number }>
  areas: Areas
  endpoint: string
  model: string
  /** The day of the run, and the household's fixed "today". */
  ranOn: string
  today: string
  /** How long the add bar waits for Jev before the rules read alone. */
  timeLimitMs: number
  capUsd: number
  /** Why the run ended early, if it did. */
  stopped: string
}

export function report(run: Run): string {
  const { outcomes, areas } = run
  const total = run.sets.reduce((sum, set) => sum + set.size, 0)
  const lines: Array<string> = []
  const say = (line = '') => lines.push(line)
  const names = WAYS.map((way) => WAY_NAMES[way])

  say('# Reading to-do titles with Jev')
  say()
  say(
    `${outcomes.length} of ${total} sentences read three ways, with Jev at \`${run.endpoint}\`${run.model ? `, answered by \`${run.model}\`` : ''}, on ${run.ranOn}. The household is made up and "today" is fixed at ${run.today}, a Tuesday.`,
  )
  say()
  say(
    `- **${WAY_NAMES.rules}**: the rules in the page, and nothing sent.\n- **${WAY_NAMES.first}**: Jev is asked about every field and every word of the title; what it is sure of fills the field and tidies the title, and the rules read the rest.\n- **${WAY_NAMES.gaps}**: the rules read first and write the title alone; Jev is asked only about a field they left empty, and about the area unless it was named outright.`,
  )
  if (run.stopped) say(`\n**${run.stopped}**`)
  say()
  say('## Hit rate per field')
  say()
  say(
    `A hit is the field ending up as a person would expect, filled or left empty. Both Jev columns are what the add bar would show: an answer that took longer than it waits (${run.timeLimitMs} ms) is not used, and the rules read that sentence alone.`,
  )
  const groups = [
    { name: `All ${outcomes.length}`, outcomes },
    ...run.sets.map((set) => ({
      name: set.name,
      outcomes: outcomes.filter((outcome) => outcome.set === set.name),
    })),
  ]
  for (const group of groups) {
    say()
    say(`### ${group.name}`)
    say()
    if (group.outcomes.length === 0) {
      say('None of these were read.')
      continue
    }
    say(`| Field | ${names.join(' | ')} |`)
    say(`| --- | ${names.map(() => '---').join(' | ')} |`)
    for (const field of FIELDS)
      say(
        `| ${field} | ${WAYS.map((way) => rate(tally(group.outcomes, way, field, areas))).join(' | ')} |`,
      )
  }
  say()
  say('## Misses')
  for (const way of WAYS) {
    const misses = FIELDS.flatMap(
      (field) => tally(outcomes, way, field, areas).misses,
    )
    say()
    say(`### ${WAY_NAMES[way]}: ${misses.length}`)
    say()
    if (misses.length === 0) {
      say('None.')
      continue
    }
    say('| Sentence | Field | Expected | Got | Filled by |')
    say('| --- | --- | --- | --- | --- |')
    for (const miss of misses)
      say(
        `| ${miss.sentence} | ${miss.field} | ${miss.expected} | ${miss.got} | ${miss.filledBy} |`,
      )
  }
  say()
  say('## Delay')
  say()
  say(`${WAY_NAMES.rules} sends nothing, so it has no delay.`)
  for (const way of ['first', 'gaps'] as const) {
    const sent = outcomes.flatMap((outcome) => outcome.sent[way] ?? [])
    const delays = spread(sent.map((one) => one.ms))
    const late = sent.filter((one) => one.ms > run.timeLimitMs).length
    const failed = sent.filter((one) => !one.jev)
    say()
    say(
      delays
        ? `**${WAY_NAMES[way]}**: ${sent.length} requests for ${outcomes.length} sentences. Median ${delays.median} ms, 9 in 10 within ${delays.nineInTen} ms, slowest ${delays.slowest} ms. ${late} took longer than the add bar waits (${run.timeLimitMs} ms) and were read by the rules alone. ${failed.length} got no usable reply at all.`
        : `**${WAY_NAMES[way]}**: nothing was sent.`,
    )
    if (failed.length > 0) {
      say()
      for (const outcome of outcomes) {
        const one = outcome.sent[way]
        if (one && !one.jev) say(`- ${one.status}: ${outcome.sentence}`)
      }
    }
  }
  say()
  say('## Cost')
  say()
  say(
    `Charged at $0.042 a million input tokens (output is free), under a cap of $${run.capUsd.toFixed(4)} for the whole run.`,
  )
  say()
  say('| | Requests | Input tokens | Cost | Tokens a to-do | Cost a to-do |')
  say('| --- | --- | --- | --- | --- | --- |')
  say(`| ${WAY_NAMES.rules} | 0 | 0 | ${usd(0)} | 0 | ${usd(0)} |`)
  let allTokens = 0
  for (const way of ['first', 'gaps'] as const) {
    const spent = spend(outcomes, way)
    allTokens += spent.tokens
    say(
      `| ${WAY_NAMES[way]} | ${spent.requests} | ${spent.tokens} | ${usd(spent.tokens)} | ${spent.tokensPerTodo} | ${spent.usdPerTodo} |`,
    )
  }
  say()
  say(`The whole run: ${allTokens} input tokens, ${usd(allTokens)}.`)
  say()
  say('## Which won')
  say()
  say(
    outcomes.length === 0
      ? 'Nothing was read.'
      : `Over all ${outcomes.length} sentences. ${winners(outcomes, areas).join(' ')}`,
  )
  say()
  return lines.join('\n')
}
