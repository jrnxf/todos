// How well is a to-do's title read, and does asking a decision model help
// when it is asked the way its makers document? 200 household sentences, each
// with the fill a person would expect (scripts/read-eval-cases.ts), are read
// every way in scripts/read-eval-ways.ts and scored field by field, side by
// side:
//
//   - the rules alone;
//   - Jev first, what the app does today, as the baseline of the old usage;
//   - each decision model (Jev, Cloudflare Clef, Clef Flash, OpenAI
//     Decisions) asked the documented way (scripts/read-eval-verify.ts): the
//     rules read first, and the model picks the area and can take back a
//     date that is part of a name. One request a sentence, read three ways:
//     that, the area alone, and with the date in parts where the rules read
//     none;
//   - one call to a fast general model (Claude Haiku 4.5, Gemini 3.1 Flash
//     Lite) for all of it.
//
// Each request is timed. Every raw probability is written beside the report,
// and the cut-offs the documented usage acts on are chosen from them on the
// sentences the rules were tuned on, never on the held-out or fresh ones.
//
//   bun run eval:read                    the plan: what would be sent, to
//                                        whom, and what it would cost. Sends
//                                        nothing.
//   bun run eval:read --yes              runs it, and writes
//                                        data/read-eval/report.md and
//                                        results.json
//   bun run eval:read --yes --cap-usd 0.5
//   bun run eval:read --stand-in         runs it against stand-ins on this
//                                        machine: no key, no bill, nothing
//                                        sent. Writes report-stand-in.md
//
// It spends money, a little: it never runs without --yes, and stops before
// the request that would take it past the cap. Keys are read from the
// environment, one provider at a time, and are never printed or written; a
// way whose key is not set is skipped, not failed:
//
//   TYPESAFE_API_KEY                             Jev
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  Clef and Clef Flash
//   OPENAI_API_KEY                               OpenAI Decisions
//   ANTHROPIC_API_KEY                            Claude Haiku 4.5
//   GEMINI_API_KEY                               Gemini 3.1 Flash Lite
import {
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import * as chrono from 'chrono-node'
import { readTitle } from '@/lib/read'
import { TIME_LIMIT_MS, jevRequest } from '@/server/jev-read'
import { CASES, HOUSEHOLD, SETS } from './read-eval-cases'
import { cost, misses, report, usd } from './read-eval-score'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import {
  GRIDS,
  JEV_VERSION,
  STARTING_CUTOFFS,
  areaFrom,
  chooseCutoff,
  columnAsks,
  columnRead,
  dateFromParts,
  verifyRequest,
  vetoed,
} from './read-eval-verify'
import {
  COLUMNS,
  DECISION_PROVIDERS,
  PROVIDERS,
  WAYS,
  columnWay,
  decisionAnswers,
  decisionCall,
  decisionReply,
  fastInstructions,
  fastRead,
  fastSchema,
  geminiCall,
  geminiReply,
  missing,
} from './read-eval-ways'
import type { JevRead, TitleRead } from '@/lib/read'
import type { CutoffTable, Outcome, Sent } from './read-eval-score'
import type { Answers, Cutoffs } from './read-eval-verify'
import type { Call, DecisionProvider } from './read-eval-ways'

const DEFAULT_CAP_USD = 2
/** Far past the add bar's limit, so the report can say how slow slow was. */
const EVAL_TIME_LIMIT_MS = 15_000
/** Room for the seven fields and the title, and no more. */
const MOST_OUTPUT_TOKENS = 512
const DIRECTORY = 'data/read-eval'

const flag = (name: string) => process.argv.includes(name)
function option(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

const capUsd = Number(option('--cap-usd') ?? DEFAULT_CAP_USD)
if (!Number.isFinite(capUsd) || capUsd <= 0) {
  console.error('--cap-usd takes an amount in dollars, such as 0.5.')
  process.exit(1)
}
const standIn = flag('--stand-in')
const REPORT = `${DIRECTORY}/${standIn ? 'report-stand-in' : 'report'}.md`
const RESULTS = `${DIRECTORY}/${standIn ? 'results-stand-in' : 'results'}.json`
// With stand-ins no real key is read and nothing leaves this machine.
const env: Record<string, string | undefined> = standIn
  ? STAND_IN_ENV
  : process.env
const send = standIn ? standInFetch(HOUSEHOLD) : fetch

const ways = WAYS.filter(
  (way) => !way.provider || missing(way.provider, env).length === 0,
)
const skipped = WAYS.filter((way) => !ways.includes(way)).map((way) => ({
  way,
  why: `${missing(way.provider ?? 'jev', env).join(' and ')} not set in the environment.`,
}))

/**
 * What is sent for a sentence. It is built before the clock starts, so the
 * delay is the service's and not this script's.
 */
interface Plan {
  kind: 'first' | 'verify' | 'model'
  /** The request, but for Haiku, which goes through Anthropic's SDK. */
  call: Call | null
  /** Its size in characters, to guess its tokens from. */
  size: number
}
/**
 * Who is asked. The three columns of a decision model are one request, so
 * they are asked for once, under the model's name.
 */
interface Sender {
  id: string
  name: string
  provider: keyof typeof PROVIDERS
  kind: Plan['kind']
}
const keyed = (provider: keyof typeof PROVIDERS) =>
  missing(provider, env).length === 0
const senders: Array<Sender> = [
  ...(keyed('jev')
    ? [
        {
          id: 'first',
          name: 'Jev first, the old usage',
          provider: 'jev',
          kind: 'first',
        } as const,
      ]
    : []),
  ...DECISION_PROVIDERS.filter(keyed).map((provider): Sender => ({
    id: `verify:${provider}`,
    name: `${PROVIDERS[provider].name}, the documented way`,
    provider,
    kind: 'verify',
  })),
  ...(['haiku', 'gemini'] as const).filter(keyed).map((provider): Sender => ({
    id: provider,
    name: PROVIDERS[provider].name,
    provider,
    kind: 'model',
  })),
]

const instructions = fastInstructions(HOUSEHOLD)
const schema = fastSchema(HOUSEHOLD)
const sentences = CASES.map(([sentence]) => {
  const asked = verifyRequest(sentence, HOUSEHOLD)
  const plans = new Map<string, Plan | null>()
  const build = (sender: Sender): Plan | null => {
    if (sender.kind === 'model')
      return {
        kind: 'model',
        call:
          sender.provider === 'gemini'
            ? geminiCall(sentence, HOUSEHOLD, env)
            : null,
        size: (instructions + JSON.stringify(schema) + sentence).length,
      }
    const provider = sender.provider as DecisionProvider
    if (sender.kind === 'first') {
      const call = decisionCall(provider, jevRequest(sentence, HOUSEHOLD), env)
      return { kind: 'first', call, size: call.body.length }
    }
    // Nothing left to ask: the rules read every field.
    if (!asked.request) return null
    const call = decisionCall(provider, asked.request, env)
    return { kind: 'verify', call, size: call.body.length }
  }
  /** What `sender` sends for this sentence, or null where it sends nothing. */
  const plan = (sender: Sender) => {
    if (!plans.has(sender.id)) plans.set(sender.id, build(sender))
    return plans.get(sender.id) ?? null
  }
  return { rules: asked.rules, asked, plan }
})

// The first run of this test was charged about one token for every 1.8
// characters of a decision request. Guessing 1.5 errs on the dear side, so
// the cap errs early. A general model is guessed at 2.5 characters a token
// in, and a reply as long as it is allowed to be.
function guess(sender: Sender, plan: Plan): number {
  return plan.kind === 'model'
    ? cost(
        PROVIDERS[sender.provider],
        Math.ceil(plan.size / 2.5),
        MOST_OUTPUT_TOKENS,
      )
    : cost(PROVIDERS[sender.provider], Math.ceil(plan.size / 1.5), 0)
}
const planned = (sender: Sender) =>
  sentences.flatMap((sentence) => sentence.plan(sender) ?? [])
const guessed = (sender: Sender) =>
  planned(sender).reduce((sum, plan) => sum + guess(sender, plan), 0)
const guessedUsd = senders.reduce((sum, sender) => sum + guessed(sender), 0)

console.log(
  `Sentences:      ${CASES.length} (${SETS.map((set) => set.name).join(', ')})`,
)
if (standIn)
  console.log('Stand-ins:      on. No key is read and nothing is sent.')
console.log('\nRequests:')
console.log(`  ${'Rules alone'.padEnd(42)} nothing sent`)
for (const sender of senders) {
  const provider = PROVIDERS[sender.provider]
  console.log(
    `  ${sender.name.padEnd(42)} ${sender.kind === 'verify' && sender.provider === 'jev' ? JEV_VERSION : provider.model}, key from ${provider.env.join(' + ')}: ${planned(sender).length} requests, about ${usd(guessed(sender))}`,
  )
}
for (const { way, why } of skipped)
  console.log(`  ${way.name.padEnd(42)} SKIPPED, ${why}`)
console.log(`\nEstimated cost: ${usd(guessedUsd)}`)
console.log(`Spending cap:   ${usd(capUsd)}`)
console.log(`Report:         ${REPORT}`)

if (!standIn && !flag('--yes')) {
  console.log('\nThis was the plan. Nothing was sent. Add --yes to run it.')
  process.exit(0)
}
if (senders.length === 0) {
  console.error('\nNo key is set in the environment: only the rules would run.')
  process.exit(1)
}
if (guessedUsd > capUsd) {
  console.error('\nThe estimate is over the cap. Nothing was sent.')
  process.exit(1)
}

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY ?? '',
  // One request, timed as it is: a retry would hide a slow or failed one.
  maxRetries: 0,
  timeout: EVAL_TIME_LIMIT_MS,
  fetch: send,
  ...(standIn ? { baseURL: 'https://api.anthropic.com' } : {}),
})

let spentUsd = 0
let stopped = ''
const models: Record<string, string> = {}

/** One request, timed, and what could be read out of the reply. */
async function ask(
  sender: Sender,
  sentence: string,
  plan: Plan,
): Promise<{ sent: Sent; answer: JevRead | TitleRead | Answers | null }> {
  const provider = sender.provider
  const started = performance.now()
  let status: number | string = 'no reply'
  let answer: JevRead | TitleRead | Answers | null = null
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    if (provider === 'haiku') {
      const message = await anthropic.messages.create({
        model: PROVIDERS.haiku.model,
        max_tokens: MOST_OUTPUT_TOKENS,
        system: instructions,
        messages: [{ role: 'user', content: sentence }],
        output_config: { format: { type: 'json_schema', schema } },
      })
      status = 200
      inputTokens = message.usage.input_tokens
      outputTokens = message.usage.output_tokens
      models[provider] = message.model
      // A reply cut short or refused is not the JSON that was asked for.
      if (message.stop_reason === 'end_turn')
        answer = fastRead(
          message.content
            .flatMap((block) => (block.type === 'text' ? block.text : []))
            .join(''),
          HOUSEHOLD,
        )
      else status = message.stop_reason ?? 'no stop reason'
    } else if (plan.call) {
      const call = plan.call
      const response = await send(call.url, {
        method: 'POST',
        headers: call.headers,
        body: call.body,
        signal: AbortSignal.timeout(EVAL_TIME_LIMIT_MS),
      })
      status = response.status
      if (response.ok) {
        const reply: unknown = await response.json()
        if (provider === 'gemini') {
          const read = geminiReply(reply)
          answer = fastRead(read.text, HOUSEHOLD)
          inputTokens = read.inputTokens
          outputTokens = read.outputTokens
          if (read.model) models[provider] = read.model
        } else {
          const read =
            plan.kind === 'first'
              ? decisionReply(provider, reply, sentence, HOUSEHOLD)
              : decisionAnswers(provider, reply)
          answer = read.read
          inputTokens = read.inputTokens
          outputTokens = read.outputTokens
          if (read.model) models[provider] = read.model
        }
      }
    }
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError)
      status = 'TimeoutError'
    else if (error instanceof Anthropic.APIError)
      status = error.status ?? 'no reply'
    else status = error instanceof Error ? error.name : 'error'
  }
  const ms = Math.round(performance.now() - started)
  // Where the service gave no count, the guess: a failed request may still
  // have been charged.
  const guessedInput = Math.ceil(
    plan.size / (plan.kind === 'model' ? 2.5 : 1.5),
  )
  const input = inputTokens ?? guessedInput
  const output = outputTokens ?? 0
  return {
    answer,
    sent: {
      ms,
      status,
      inputTokens: input,
      outputTokens: output,
      usd: cost(PROVIDERS[provider], input, output),
      usable: answer !== null,
    },
  }
}

const outcomes: Array<Outcome> = []
/** Every raw answer of a decision model asked the documented way. */
const raw: Array<
  Partial<Record<DecisionProvider, { sent: Sent; answers: Answers | null }>>
> = []
const setOf = (index: number) => {
  let before = 0
  for (const set of SETS) {
    before += set.cases.length
    if (index < before) return set.name
  }
  return ''
}

run: for (const [index, [sentence, expected]] of CASES.entries()) {
  const { rules, plan } = sentences[index]
  const reads: Outcome['reads'] = { rules }
  const sent: Outcome['sent'] = { rules: null }
  const whole: Array<string> = []
  const answered: (typeof raw)[number] = {}
  // Turn about, so no one always pays for the cold connection.
  const turn = index % senders.length
  for (const sender of [...senders.slice(turn), ...senders.slice(0, turn)]) {
    const next = plan(sender)
    let one: Awaited<ReturnType<typeof ask>> | null = null
    if (next) {
      if (spentUsd + guess(sender, next) > capUsd) {
        stopped = `Stopped before sentence ${index + 1}: the next request could pass the cap.`
        break run
      }
      one = await ask(sender, sentence, next)
      spentUsd += one.sent.usd
      console.log(
        `${String(index + 1).padStart(3)}/${CASES.length}  ${sender.id.padEnd(16)}  ${String(one.sent.status).padEnd(12)} ${String(one.sent.ms).padStart(5)} ms  ${sentence}`,
      )
      if (one.sent.status === 401 || one.sent.status === 403) {
        stopped = `Stopped: the key for ${sender.name} was refused (${one.sent.status}).`
        break run
      }
    }
    // What the add bar would show: an answer it had stopped waiting for is
    // not used.
    const answer = one && one.sent.ms <= TIME_LIMIT_MS ? one.answer : null
    if (sender.kind === 'model') {
      sent[sender.id] = one?.sent ?? null
      reads[sender.id] = (answer as TitleRead | null) ?? rules
      if (answer) whole.push(sender.id)
    } else if (sender.kind === 'first') {
      sent[sender.id] = one?.sent ?? null
      reads[sender.id] = readTitle(chrono, sentence, {
        ...HOUSEHOLD,
        jev: answer as JevRead | null,
        jevUse: 'first',
      })
    } else if (one)
      // Its columns are read once every cut-off is chosen, below.
      answered[sender.provider as DecisionProvider] = {
        sent: one.sent,
        answers: answer as Answers | null,
      }
  }
  raw.push(answered)
  outcomes.push({ sentence, expected, set: setOf(index), reads, sent, whole })
}

// ── The documented usage: choose each cut-off, then read the columns ────────

const tunedSets: ReadonlyArray<string> = SETS.filter(
  (set) => set.kind === 'tuned',
).map((set) => set.name)
const asked = DECISION_PROVIDERS.filter((provider) =>
  senders.some((sender) => sender.id === `verify:${provider}`),
)
const chosen: Partial<Record<DecisionProvider, Cutoffs>> = {}
const cutoffs: Array<CutoffTable> = []

/** Every outcome's reading by one column of `provider` at `cuts`. */
function readColumn(
  provider: DecisionProvider,
  column: (typeof COLUMNS)[number],
  cuts: Cutoffs,
) {
  return outcomes.map((outcome, index) => ({
    ...outcome,
    reads: {
      column: columnRead(
        column,
        outcome.sentence,
        HOUSEHOLD,
        sentences[index].rules,
        raw[index][provider]?.answers ?? null,
        cuts,
      ),
    },
  }))
}

for (const provider of asked) {
  const cuts: Cutoffs = { ...STARTING_CUTOFFS }
  const steps = [
    {
      key: 'area',
      column: 'area',
      question: 'how sure of the area, both ways round, before it is filled',
      acts: 'filled',
      acted: (answers: Answers, cutoff: number, index: number) =>
        sentences[index].rules.fields.areaId === undefined &&
        areaFrom(answers, HOUSEHOLD, cutoff) !== undefined,
    },
    {
      key: 'veto',
      column: 'verify',
      question:
        'how unlikely "this phrase is when it is due" has to be before the date is taken away',
      acts: 'taken away',
      acted: (answers: Answers, cutoff: number) => vetoed(answers, cutoff),
    },
    {
      key: 'parts',
      column: 'parts',
      question: 'how sure of every part of a date before it is used',
      acts: 'dated',
      acted: (answers: Answers, cutoff: number, index: number) =>
        sentences[index].rules.fields.dueDate === undefined &&
        dateFromParts(answers, HOUSEHOLD.today, cutoff) !== undefined,
    },
  ] as const
  // In turn: the veto is chosen with the area's cut-off in place, and the
  // parts with both.
  for (const step of steps) {
    const rows = GRIDS[step.key].map((cutoff) => {
      const read = readColumn(provider, step.column, {
        ...cuts,
        [step.key]: cutoff,
      })
      const bySet = (count: (name: string) => number) =>
        Object.fromEntries(SETS.map((set) => [set.name, count(set.name)]))
      return {
        cutoff,
        misses: bySet(
          (name) =>
            misses(
              read.filter((one) => one.set === name),
              'column',
              HOUSEHOLD.areas,
            ).length,
        ),
        acted: bySet(
          (name) =>
            outcomes.filter((outcome, index) => {
              const answers = raw[index][provider]?.answers
              return (
                outcome.set === name &&
                answers != null &&
                step.acted(answers, cutoff, index)
              )
            }).length,
        ),
      }
    })
    cuts[step.key] = chooseCutoff(GRIDS[step.key], (cutoff) => {
      const row = rows.find((one) => one.cutoff === cutoff)
      return tunedSets.reduce((sum, name) => sum + (row?.misses[name] ?? 0), 0)
    })
    cutoffs.push({
      way:
        WAYS.find((way) => way.id === columnWay(provider, step.column))?.name ??
        provider,
      question: step.question,
      acts: step.acts,
      chosen: cuts[step.key],
      rows,
    })
  }
  chosen[provider] = cuts

  for (const column of COLUMNS) {
    const id = columnWay(provider, column)
    for (const [index, outcome] of outcomes.entries()) {
      const request = sentences[index].asked.request
      const one = raw[index][provider]
      outcome.reads[id] = columnRead(
        column,
        outcome.sentence,
        HOUSEHOLD,
        sentences[index].rules,
        one?.answers ?? null,
        cuts,
      )
      // The column's share of the request: the state, and its own questions.
      const size = (ids: ReadonlyArray<string>) =>
        ids.reduce(
          (sum, question) =>
            sum + JSON.stringify(request?.questions[question] ?? '').length,
          JSON.stringify(request?.state ?? '').length,
        )
      const all = Object.keys(request?.questions ?? {})
      const own = all.filter((question) => columnAsks(column, question))
      const share = own.length === 0 ? 0 : size(own) / size(all)
      outcome.sent[id] =
        one && own.length > 0
          ? {
              ...one.sent,
              inputTokens: Math.round(one.sent.inputTokens * share),
              outputTokens: Math.round(one.sent.outputTokens * share),
              usd: one.sent.usd * share,
            }
          : null
    }
  }
}

mkdirSync(DIRECTORY, { recursive: true })
// An earlier report is kept beside the new one, to read the two together.
for (const file of [REPORT, RESULTS])
  if (existsSync(file)) {
    const written = statSync(file).mtime.toISOString().slice(0, 19)
    renameSync(
      file,
      file.replace(/\.(md|json)$/, `-${written.replace(/:/g, '')}.$1`),
    )
  }
// Every raw answer, to try other cut-offs against without paying again. No
// key is in it, and no household but the made-up one.
writeFileSync(
  RESULTS,
  `${JSON.stringify(
    {
      ranOn: new Date().toISOString().slice(0, 10),
      standIn,
      today: HOUSEHOLD.today,
      timeLimitMs: TIME_LIMIT_MS,
      models,
      cutoffs: chosen,
      sentences: outcomes.map((outcome, index) => ({
        sentence: outcome.sentence,
        set: outcome.set,
        expected: outcome.expected,
        rules: sentences[index].rules,
        asked: Object.keys(sentences[index].asked.request?.questions ?? {}),
        answers: Object.fromEntries(
          Object.entries(raw[index]).map(([provider, one]) => [
            provider,
            { ms: one.sent.ms, status: one.sent.status, answers: one.answers },
          ]),
        ),
      })),
    },
    null,
    1,
  )}\n`,
)
writeFileSync(
  REPORT,
  report({
    outcomes,
    sets: SETS.map((set) => ({
      name: set.name,
      size: set.cases.length,
      kind: set.kind,
    })),
    areas: HOUSEHOLD.areas,
    ways,
    skipped,
    providers: PROVIDERS,
    models,
    ranOn: new Date().toISOString().slice(0, 10),
    today: HOUSEHOLD.today,
    timeLimitMs: TIME_LIMIT_MS,
    capUsd,
    stopped,
    standIn,
    cutoffs,
    spentUsd,
    results: RESULTS,
  }),
)
console.log(`\n${stopped ? `${stopped}\n` : ''}Wrote ${REPORT} and ${RESULTS}`)
