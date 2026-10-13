// The sums behind `bun run eval:read`: what counts as a hit, the delays, the
// cost, and the report they are written into. Nothing here sends anything, so
// the arithmetic can be tested on its own.
import type { ReadField, TitleRead } from '@/lib/read'
import type { Expected } from './read-eval-cases'
import type { Provider, Way } from './read-eval-ways'

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

/** One request and what came of it. */
export interface Sent {
  /** Wall-clock time from sending to having the answer in hand. */
  ms: number
  status: number | string
  /** The service's counts, or the estimate when it gave none. */
  inputTokens: number
  outputTokens: number
  usd: number
  /** Whether the reply could be read at all, late or not. */
  usable: boolean
}

export interface Outcome {
  sentence: string
  expected: Expected
  /** Which set of sentences it belongs to. */
  set: string
  /** What each way read, by the way's id. */
  reads: Record<string, TitleRead>
  /** Null where a way sent nothing for this sentence. */
  sent: Record<string, Sent | null>
  /** The ways whose whole reading, title included, is a model's. */
  whole: ReadonlyArray<string>
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

/**
 * Who filled a field that came out wrong: the model that was asked, or the
 * rules. `whole` is a reading a model wrote all of.
 */
export function filledBy(
  field: Field,
  read: TitleRead,
  whole = false,
): 'model' | 'rules' {
  if (whole) return 'model'
  // A title is the model's doing once any word left it on the model's say.
  if (field === 'title')
    return Object.values(read.guessed).some((words) => words)
      ? 'model'
      : 'rules'
  return read.guessed[READ_FIELD[field]] !== undefined ? 'model' : 'rules'
}

export interface Miss {
  sentence: string
  set: string
  field: Field
  expected: string
  got: string
  filledBy: 'model' | 'rules'
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
  way: string,
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
        set: outcome.set,
        field,
        expected: side[0],
        got: side[1],
        filledBy: filledBy(field, read, outcome.whole.includes(way)),
      })
  }
  return result
}

/** Every miss one way made, field by field. */
export function misses(
  outcomes: ReadonlyArray<Outcome>,
  way: string,
  areas: Areas,
): Array<Miss> {
  return FIELDS.flatMap((field) => tally(outcomes, way, field, areas).misses)
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

export const usd = (dollars: number) => `$${dollars.toFixed(4)}`

/** What a request of these sizes costs with `provider`. */
export function cost(
  provider: Pick<Provider, 'usdPerMInput' | 'usdPerMOutput'>,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens * provider.usdPerMInput +
      outputTokens * provider.usdPerMOutput) /
    1_000_000
  )
}

/** What one way sent, how long it took and what it spent, over `outcomes`. */
export function spend(
  outcomes: ReadonlyArray<Outcome>,
  way: string,
  timeLimitMs: number,
) {
  const sent = outcomes.flatMap((outcome) => outcome.sent[way] ?? [])
  const sum = (pick: (one: Sent) => number) =>
    sent.reduce((total, one) => total + pick(one), 0)
  // Per to-do typed, whether or not it needed a request.
  const todos = Math.max(1, outcomes.length)
  return {
    requests: sent.length,
    delays: spread(sent.map((one) => one.ms)),
    late: sent.filter((one) => one.ms > timeLimitMs).length,
    unusable: sent.filter((one) => !one.usable).length,
    inputTokens: sum((one) => one.inputTokens),
    outputTokens: sum((one) => one.outputTokens),
    inputPerTodo: Math.round(sum((one) => one.inputTokens) / todos),
    outputPerTodo: Math.round(sum((one) => one.outputTokens) / todos),
    usd: sum((one) => one.usd),
    usdPerTodo: sum((one) => one.usd) / todos,
  }
}

/** A few names in full; more than that, how many. */
const some = (names: Array<string>) =>
  names.length > 3 ? `${names.length} ways` : list(names)

const list = (names: Array<string>) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** One sentence a field: who got it right most often. */
export function winners(
  outcomes: ReadonlyArray<Outcome>,
  ways: ReadonlyArray<Pick<Way, 'id' | 'name'>>,
  areas: Areas,
): Array<string> {
  return FIELDS.map((field) => {
    const scores = ways.map((way) => tally(outcomes, way.id, field, areas))
    const scored = scores[0].scored
    const best = Math.max(...scores.map((score) => score.hits))
    const leaders = ways.filter((_way, index) => scores[index].hits === best)
    const name = field[0].toUpperCase() + field.slice(1)
    if (leaders.length === ways.length)
      return `${name}: level, every way at ${best} of ${scored}.`
    const others = ways
      .filter((way) => !leaders.includes(way))
      .map((way) => `${way.name} ${scores[ways.indexOf(way)].hits}`)
      .join(', ')
    return `${name}: ${list(leaders.map((way) => way.name))} at ${best} of ${scored} (${others}).`
  })
}

/** One plain paragraph: which way won what. */
export function verdict(
  outcomes: ReadonlyArray<Outcome>,
  ways: ReadonlyArray<Pick<Way, 'id' | 'name'>>,
  areas: Areas,
  timeLimitMs: number,
): string {
  if (outcomes.length === 0 || ways.length === 0) return 'Nothing was read.'
  const totals = ways.map((way) => ({
    way,
    misses: misses(outcomes, way.id, areas).length,
    spent: spend(outcomes, way.id, timeLimitMs),
  }))
  const fewest = Math.min(...totals.map((one) => one.misses))
  const asked = totals.filter((one) => one.spent.requests > 0)
  const parts = [
    `Over all ${outcomes.length} sentences, fewest misses in total: ${list(totals.filter((one) => one.misses === fewest).map((one) => one.way.name))} with ${fewest} (${totals.map((one) => `${one.way.name} ${one.misses}`).join(', ')}).`,
    ...winners(outcomes, ways, areas),
  ]
  if (asked.length > 0) {
    const quickest = asked.reduce((a, b) =>
      (b.spent.delays?.median ?? Infinity) <
      (a.spent.delays?.median ?? Infinity)
        ? b
        : a,
    )
    const cheapest = asked.reduce((a, b) =>
      b.spent.usdPerTodo < a.spent.usdPerTodo ? b : a,
    )
    parts.push(
      `Of the ways that send anything, ${quickest.way.name} answered quickest (median ${quickest.spent.delays?.median} ms) and ${cheapest.way.name} cost least (${usd(cheapest.spent.usdPerTodo)} a to-do).`,
    )
  }
  return parts.join(' ')
}

/**
 * The answer, in plain words: which way missed fewest fields on one set of
 * sentences, and how far that is from the rules alone and from the old usage.
 */
export function headline(
  outcomes: ReadonlyArray<Outcome>,
  ways: ReadonlyArray<Pick<Way, 'id' | 'name' | 'kind'>>,
  areas: Areas,
  what: string,
): string {
  if (outcomes.length === 0 || ways.length === 0)
    return `None of ${what} were read.`
  const totals = ways.map((way) => ({
    way,
    misses: misses(outcomes, way.id, areas).length,
  }))
  const scored = FIELDS.reduce(
    (sum, field) => sum + tally(outcomes, ways[0].id, field, areas).scored,
    0,
  )
  const fewest = Math.min(...totals.map((one) => one.misses))
  const leaders = totals.filter((one) => one.misses === fewest)
  const rules = totals.find((one) => one.way.kind === 'rules')
  const old = totals.find((one) => one.way.kind === 'first')
  const asking = totals.filter((one) => one.way.kind !== 'rules')
  if (leaders.length === totals.length)
    return `On ${what}, every way missed the same: ${fewest} of ${scored} fields. Asking a model won nothing and lost nothing.`
  const parts = [
    `On ${what}, ${some(leaders.map((one) => one.way.name))} missed fewest: ${fewest} of ${scored} fields.`,
  ]
  if (rules && asking.length > 0) {
    const best = Math.min(...asking.map((one) => one.misses))
    const named = some(
      asking.filter((one) => one.misses === best).map((one) => one.way.name),
    )
    parts.push(
      best < rules.misses
        ? `The rules alone missed ${rules.misses}, so asking a model won by ${rules.misses - best} (${named}).`
        : best === rules.misses
          ? `The rules alone missed ${rules.misses} too: asking a model won nothing (the best was ${named}).`
          : `The rules alone missed ${rules.misses}: no way that asks a model beat them, and the closest (${named}) missed ${best - rules.misses} more.`,
    )
  }
  if (old) parts.push(`${old.way.name} missed ${old.misses}.`)
  return parts.join(' ')
}

/** What one cut-off did, set by set: fields missed, and how often it acted. */
export interface CutoffRow {
  cutoff: number
  misses: Record<string, number>
  acted: Record<string, number>
}
/** The cut-offs tried for one question of one decision model. */
export interface CutoffTable {
  /** The column they were tried on, by its way's name. */
  way: string
  /** What is cut off, in a few words. */
  question: string
  /** What "acted" counts: fills, or dates taken away. */
  acts: string
  chosen: number
  rows: ReadonlyArray<CutoffRow>
}

export interface Run {
  outcomes: ReadonlyArray<Outcome>
  /**
   * Every sentence set with how many sentences it holds, and what it is for:
   * `fresh` is shown first, and a cut-off is chosen on `tuned` alone.
   */
  sets: ReadonlyArray<{
    name: string
    size: number
    kind: 'tuned' | 'held' | 'fresh'
  }>
  areas: Areas
  /** The ways that were run, in order. */
  ways: ReadonlyArray<Way>
  /** The ways that were not, and why: a key that is not set. */
  skipped: ReadonlyArray<{ way: Way; why: string }>
  providers: Record<string, Provider>
  /** The model each provider said answered, where it said. */
  models: Record<string, string>
  /** The day of the run, and the household's fixed "today". */
  ranOn: string
  today: string
  /** How long the add bar waits for an answer before the rules read alone. */
  timeLimitMs: number
  capUsd: number
  /** Why the run ended early, if it did. */
  stopped: string
  /** True when stand-ins answered and no service was called. */
  standIn: boolean
  /** The cut-offs tried for each decision model, and the ones chosen. */
  cutoffs: ReadonlyArray<CutoffTable>
  /** What the run was charged, every request counted once. */
  spentUsd: number
  /** Where every raw answer was written, beside the report. */
  results: string
}

export function report(run: Run): string {
  const { outcomes, areas, ways } = run
  const total = run.sets.reduce((sum, set) => sum + set.size, 0)
  const lines: Array<string> = []
  const say = (line = '') => lines.push(line)
  const names = ways.map((way) => way.name)

  say('# Reading to-do titles')
  say()
  if (run.standIn) {
    say(
      '**A stand-in run. No service was called: every reply below was made up on this machine in the shape the provider documents, with made-up delays and token counts. It shows that the test runs and what its report looks like. The hit rates of every way but Rules alone, the delays and the costs say nothing about the real services.**',
    )
    say()
  }
  say(
    `${outcomes.length} of ${total} sentences read ${ways.length} ways on ${run.ranOn}. The household is made up and "today" is fixed at ${run.today}, a Tuesday.`,
  )
  say()
  for (const way of ways) {
    const provider = way.provider && run.providers[way.provider]
    say(
      `- **${way.name}**${provider ? ` (${provider.name}, \`${run.models[way.provider ?? ''] || provider.model}\`)` : ''}: ${way.about}.`,
    )
  }
  if (run.skipped.length > 0) {
    say()
    say('Skipped, not failed:')
    say()
    for (const { way, why } of run.skipped) say(`- **${way.name}**: ${why}`)
  }
  if (run.stopped) say(`\n**${run.stopped}**`)
  const order = { fresh: 0, held: 1, tuned: 2 }
  const sets = [...run.sets].sort((a, b) => order[a.kind] - order[b.kind])
  const of = (name: string) =>
    outcomes.filter((outcome) => outcome.set === name)
  const fresh = sets.filter((set) => set.kind === 'fresh')
  const tuned = sets.filter((set) => set.kind === 'tuned')
  say()
  say('## The answer')
  say()
  for (const set of fresh.length > 0 ? fresh : sets.slice(0, 1))
    say(
      headline(
        of(set.name),
        ways,
        areas,
        `the ${set.size} sentences of ${set.name}`,
      ),
    )
  say()
  say(
    `${fresh.map((set) => set.name).join(' and ') || 'No set'} is the honest number: written before the documented requests were, and before the rules or any model read it. ${tuned.map((set) => set.name).join(' and ') || 'No set'} ${tuned.length === 1 ? 'is' : 'are'} what the rules were tuned against, so there the rules can hardly lose; ${sets
      .filter((set) => set.kind === 'held')
      .map((set) => set.name)
      .join(
        ' and ',
      )} was held out from that tuning, but its misses were read before the documented requests were written.`,
  )
  say()
  say('## Hit rate per field')
  say()
  say(
    `A hit is the field ending up as a person would expect, filled or left empty. Every column is what the add bar would show: an answer that took longer than it waits (${run.timeLimitMs} ms) or could not be read is not used, and the rules read that sentence alone.`,
  )
  const groups = [
    ...sets.map((set) => ({ name: set.name, outcomes: of(set.name) })),
    { name: `All ${outcomes.length}`, outcomes },
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
        `| ${field} | ${ways.map((way) => rate(tally(group.outcomes, way.id, field, areas))).join(' | ')} |`,
      )
    say(
      `| **total misses** | ${ways.map((way) => `**${misses(group.outcomes, way.id, areas).length}**`).join(' | ')} |`,
    )
  }
  if (run.cutoffs.length > 0) {
    say()
    say('## Cut-offs')
    say()
    say(
      `How sure an answer has to be before it is acted on, and what each choice of that costs. Each cut-off was chosen on ${tuned.map((set) => set.name).join(' and ') || 'no set'} alone: the least careful one that does no more harm there than the best, then one step more careful. The rules miss little or nothing on those sentences, so they show where a cut-off starts to do harm; what it wins shows on the other sets, which had no say in it. Every raw probability is in \`${run.results}\`, to try other cut-offs against.`,
    )
    for (const table of run.cutoffs) {
      say()
      say(`### ${table.way}: ${table.question}`)
      say()
      say(
        `| Cut-off | ${sets.map((set) => `${set.name}: missed, ${table.acts}`).join(' | ')} |`,
      )
      say(`| --- | ${sets.map(() => '---').join(' | ')} |`)
      for (const row of table.rows)
        say(
          `| ${row.cutoff}${row.cutoff === table.chosen ? ' (chosen)' : ''} | ${sets.map((set) => `${row.misses[set.name] ?? 0}, ${row.acted[set.name] ?? 0}`).join(' | ')} |`,
        )
    }
  }
  say()
  say('## Which won, over every sentence')
  say()
  say(verdict(outcomes, ways, areas, run.timeLimitMs))
  say()
  say('## Misses')
  for (const way of ways) {
    const missed = misses(outcomes, way.id, areas)
    say()
    say(`### ${way.name}: ${missed.length}`)
    say()
    if (missed.length === 0) {
      say('None.')
      continue
    }
    say('| Set | Sentence | Field | Expected | Got | Filled by |')
    say('| --- | --- | --- | --- | --- | --- |')
    for (const set of sets)
      for (const miss of missed.filter((one) => one.set === set.name))
        say(
          `| ${miss.set} | ${miss.sentence} | ${miss.field} | ${miss.expected} | ${miss.got} | ${miss.filledBy} |`,
        )
  }
  say()
  say('## Speed and cost')
  say()
  say(
    `The delay is the wall-clock time of one request, from sending it to having a usable answer in hand, measured from this machine one request at a time. "Late" is how many took longer than the add bar waits (${run.timeLimitMs} ms). Tokens and cost are per to-do typed, whether or not it needed a request, under a cap of ${usd(run.capUsd)} for the whole run. The columns of one decision model are read out of one request: each row has that request's delay, and the share of its tokens and cost that the column's own questions take.`,
  )
  say()
  say(
    '| Way | Requests | Median | 9 in 10 | Slowest | Late | No usable reply | Input tokens a to-do | Output tokens a to-do | Cost a to-do | Cost of the run |',
  )
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const way of ways) {
    const spent = spend(outcomes, way.id, run.timeLimitMs)
    const ms = (value: number | undefined) =>
      value === undefined ? 'n/a' : `${value} ms`
    say(
      `| ${way.name} | ${spent.requests} | ${ms(spent.delays?.median)} | ${ms(spent.delays?.nineInTen)} | ${ms(spent.delays?.slowest)} | ${spent.late} | ${spent.unusable} | ${spent.inputPerTodo} | ${spent.outputPerTodo} | ${usd(spent.usdPerTodo)} | ${usd(spent.usd)} |`,
    )
  }
  say()
  say(`The whole run, every request counted once: ${usd(run.spentUsd)}.`)
  if (
    ways.some((way) => way.provider === 'clef' || way.provider === 'clefFlash')
  ) {
    say()
    say(
      'Clef and Clef Flash were called here over Cloudflare’s public REST API from this machine. That is not what the app would see: a Worker reaches them through an AI binding inside Cloudflare’s network, with no public hop and no token check, and Cloudflare’s own figures are medians of 209 ms and 39 ms (huggingface.co/Cloudflare/clef). Read these two delays as the public route’s, not the models’. `scripts/clef-speed/README.md` has an optional way to time them from inside Cloudflare.',
    )
  }
  const failed = ways.flatMap((way) =>
    outcomes.flatMap((outcome) => {
      const one = outcome.sent[way.id]
      return one && !one.usable
        ? [`- ${way.name}, ${one.status}: ${outcome.sentence}`]
        : []
    }),
  )
  if (failed.length > 0) {
    say()
    say('No usable reply:')
    say()
    for (const line of failed) say(line)
  }
  say()
  say('## Notes: where each fact came from')
  say()
  const used = [
    ...new Set(
      [...ways, ...run.skipped.map((one) => one.way)].flatMap(
        (way) => way.provider ?? [],
      ),
    ),
  ]
  for (const id of used) {
    const provider = run.providers[id]
    say(
      `- **${provider.name}**: \`${provider.model}\` at \`${provider.endpoint}\`; $${provider.usdPerMInput} a million input tokens, ${provider.usdPerMOutput === 0 ? 'output not charged' : `$${provider.usdPerMOutput} a million output tokens`}; key from ${provider.env.map((name) => `\`${name}\``).join(' with ')}. ${provider.notes} ${provider.checked} Sources: ${provider.sources.join(', ')}.`,
    )
  }
  say()
  return lines.join('\n')
}
