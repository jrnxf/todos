// How well is a to-do's title read, and is the way the app asks Jev the best
// way to ask it? 400 household sentences, each with the fill a person would
// expect (scripts/read-eval-cases.ts), are read every way in
// scripts/read-eval-ways.ts and scored field by field, side by side:
//
//   - the rules alone;
//   - Verify with Jev, which is what the app does, asked and read by the
//     app's own code (src/lib/verify.ts) at the app's own cut-offs: the
//     rules read first, and Jev picks the tag where they found none and can
//     take back a date that is part of a name;
//   - that with Jev also checking who, with Jev also checking the title, and
//     with both (scripts/read-eval-verify.ts): test only, to see whether the
//     app should ask more. One request a sentence carries all of it;
//   - Verify with Cloudflare Clef, for comparison: the app's request, sent
//     to Clef instead.
//
// Each request is timed. Every raw probability is written beside the report.
// The cut-offs the app does not fix are chosen from them on the sentences
// the rules were tuned on, never on the others, and the report says what
// hindsight would have chosen instead.
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
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  Clef
import {
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { TIME_LIMIT_MS } from '@/server/jev-read'
import { CASES, HOUSEHOLD, SETS } from './read-eval-cases'
import { cost, misses, report, usd } from './read-eval-score'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import {
  CUTOFFS,
  GRIDS,
  STARTING_CUTOFFS,
  chooseCutoff,
  columnAsks,
  columnRead,
  hindsightCutoff,
  putBack,
  tagFrom,
  verifyRequest,
  vetoed,
  whoFrom,
} from './read-eval-verify'
import {
  COLUMNS,
  DECISION_PROVIDERS,
  PROVIDERS,
  WAYS,
  columnWay,
  decisionAnswers,
  decisionCall,
  missing,
} from './read-eval-ways'
import type { CutoffTable, Outcome, Sent } from './read-eval-score'
import type { Answers, Column, Cutoffs } from './read-eval-verify'
import type { Call, DecisionProvider } from './read-eval-ways'

const DEFAULT_CAP_USD = 2
/** Far past the add bar's limit, so the report can say how slow slow was. */
const EVAL_TIME_LIMIT_MS = 15_000
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
/** Who is asked: each decision model once a sentence, for all its columns. */
const senders = DECISION_PROVIDERS.filter(
  (provider) => missing(provider, env).length === 0,
)

/**
 * What is sent for a sentence. It is built before the clock starts, so the
 * delay is the service's and not this script's.
 */
interface Plan {
  call: Call
  /** The questions asked, by id. */
  questions: Record<string, unknown>
  state: unknown
  /** Its size in characters, to guess its tokens from. */
  size: number
}

const sentences = CASES.map(([sentence]) => {
  // Jev is sent the app's questions and the test's; Clef, there to compare
  // the app's way, the app's alone.
  const wide = verifyRequest(sentence, HOUSEHOLD)
  const app = verifyRequest(sentence, HOUSEHOLD, true)
  const plans = new Map<DecisionProvider, Plan | null>()
  /** What `provider` is sent for this sentence, or null: nothing to ask. */
  const plan = (provider: DecisionProvider) => {
    if (!plans.has(provider)) {
      const request = (COLUMNS[provider].length > 1 ? wide : app).request
      const call = request && decisionCall(provider, request, env)
      plans.set(
        provider,
        request && call
          ? {
              call,
              questions: request.questions,
              state: request.state,
              size: call.body.length,
            }
          : null,
      )
    }
    return plans.get(provider) ?? null
  }
  return { rules: app.rules, plan }
})

// The first run of this test was charged about one token for every 1.8
// characters of a decision request. Guessing 1.5 errs on the dear side, so
// the cap errs early.
const guessTokens = (plan: Plan) => Math.ceil(plan.size / 1.5)
const guess = (provider: DecisionProvider, plan: Plan) =>
  cost(PROVIDERS[provider], guessTokens(plan), 0)
const planned = (provider: DecisionProvider) =>
  sentences.flatMap((sentence) => sentence.plan(provider) ?? [])
const guessed = (provider: DecisionProvider) =>
  planned(provider).reduce((sum, plan) => sum + guess(provider, plan), 0)
const guessedUsd = senders.reduce((sum, sender) => sum + guessed(sender), 0)

console.log(
  `Sentences:      ${CASES.length} (${SETS.map((set) => set.name).join(', ')})`,
)
if (standIn)
  console.log('Stand-ins:      on. No key is read and nothing is sent.')
console.log('\nRequests:')
console.log(`  ${'Rules alone'.padEnd(18)} nothing sent`)
for (const provider of DECISION_PROVIDERS) {
  const about = PROVIDERS[provider]
  const lacking = missing(provider, env)
  console.log(
    `  ${about.name.padEnd(18)} ${
      lacking.length > 0
        ? `SKIPPED, ${lacking.join(' and ')} not set in the environment.`
        : `${about.model}, key from ${about.env.join(' + ')}: ${planned(provider).length} requests, about ${usd(guessed(provider))}, read as ${COLUMNS[
            provider
          ]
            .map(
              (column) =>
                WAYS.find((way) => way.id === columnWay(provider, column))
                  ?.name,
            )
            .join('; ')}`
    }`,
  )
}
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

let spentUsd = 0
let stopped = ''
const models: Record<string, string> = {}

/** One request, timed, and what could be read out of the reply. */
async function ask(
  provider: DecisionProvider,
  plan: Plan,
): Promise<{ sent: Sent; answers: Answers | null }> {
  const started = performance.now()
  let status: number | string = 'no reply'
  let answers: Answers | null = null
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    const response = await send(plan.call.url, {
      method: 'POST',
      headers: plan.call.headers,
      body: plan.call.body,
      signal: AbortSignal.timeout(EVAL_TIME_LIMIT_MS),
    })
    status = response.status
    if (response.ok) {
      const read = decisionAnswers(provider, await response.json())
      answers = read.read
      inputTokens = read.inputTokens
      outputTokens = read.outputTokens
      if (read.model) models[provider] = read.model
    }
  } catch (error) {
    status = error instanceof Error ? error.name : 'error'
  }
  const ms = Math.round(performance.now() - started)
  // Where the service gave no count, the guess: a failed request may still
  // have been charged.
  const input = inputTokens ?? guessTokens(plan)
  const output = outputTokens ?? 0
  return {
    answers,
    sent: {
      ms,
      status,
      inputTokens: input,
      outputTokens: output,
      usd: cost(PROVIDERS[provider], input, output),
      usable: answers !== null,
    },
  }
}

const outcomes: Array<Outcome> = []
/** Every raw answer of a decision model. */
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
  const answered: (typeof raw)[number] = {}
  // Turn about, so no one always pays for the cold connection.
  const turn = index % senders.length
  for (const provider of [...senders.slice(turn), ...senders.slice(0, turn)]) {
    const next = plan(provider)
    if (!next) continue
    if (spentUsd + guess(provider, next) > capUsd) {
      stopped = `Stopped before sentence ${index + 1}: the next request could pass the cap.`
      break run
    }
    const one = await ask(provider, next)
    spentUsd += one.sent.usd
    console.log(
      `${String(index + 1).padStart(3)}/${CASES.length}  ${provider.padEnd(5)}  ${String(one.sent.status).padEnd(12)} ${String(one.sent.ms).padStart(5)} ms  ${sentence}`,
    )
    if (one.sent.status === 401 || one.sent.status === 403) {
      stopped = `Stopped: the key for ${PROVIDERS[provider].name} was refused (${one.sent.status}).`
      break run
    }
    // What the add bar would show: an answer it had stopped waiting for is
    // not used.
    answered[provider] = {
      sent: one.sent,
      answers: one.sent.ms <= TIME_LIMIT_MS ? one.answers : null,
    }
  }
  raw.push(answered)
  outcomes.push({
    sentence,
    expected,
    set: setOf(index),
    reads: { rules },
    sent: { rules: null },
  })
}

// ── Choose each cut-off, then read the columns ──────────────────────────────

const tuned: ReadonlyArray<string> = SETS.filter(
  (set) => set.kind === 'tuned',
).map((set) => set.name)
const others: ReadonlyArray<string> = SETS.filter(
  (set) => set.kind !== 'tuned',
).map((set) => set.name)
const used: Partial<Record<DecisionProvider, Cutoffs>> = {}
const cutoffs: Array<CutoffTable> = []

/** Every outcome's reading by one column of `provider` at `cuts`. */
function readColumn(provider: DecisionProvider, column: Column, cuts: Cutoffs) {
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

interface Step {
  key: keyof Cutoffs
  column: Column
  question: string
  acts: string
  /** Whether the answers to sentence `index` are acted on at `cuts`. */
  acted: (answers: Answers, cuts: Cutoffs, index: number) => boolean
}
const STEPS: ReadonlyArray<Step> = [
  {
    key: 'tag',
    column: 'verify',
    question: 'how sure of the tag, both ways round, before it is filled',
    acts: 'filled',
    acted: (answers, cuts, index) =>
      sentences[index].rules.fields.tagId === undefined &&
      tagFrom(answers, HOUSEHOLD, cuts.tag) !== undefined,
  },
  {
    key: 'veto',
    column: 'verify',
    question:
      'how unlikely "this phrase is when it is due" has to be before the date is taken away',
    acts: 'taken away',
    acted: (answers, cuts) => vetoed(answers, cuts.veto),
  },
  {
    key: 'whoNo',
    column: 'who',
    question:
      'how unlikely "this person is the one to do it" has to be before a person the rules read is taken back',
    acts: 'taken back',
    acted: (answers, cuts, index) =>
      whoFrom(
        answers,
        outcomes[index].sentence,
        HOUSEHOLD,
        sentences[index].rules,
        cuts,
      ).takeBack,
  },
  {
    key: 'whoYes',
    column: 'who',
    question:
      'how sure "this person is the one to do it" has to be before a person is filled where the rules read none',
    acts: 'filled',
    acted: (answers, cuts, index) =>
      whoFrom(
        answers,
        outcomes[index].sentence,
        HOUSEHOLD,
        sentences[index].rules,
        cuts,
      ).fill !== undefined,
  },
  {
    key: 'title',
    column: 'title',
    question:
      'how sure "this phrase is part of the task" has to be before a phrase the rules took out is put back',
    acts: 'put back',
    acted: (answers, cuts, index) =>
      putBack(answers, sentences[index].rules, cuts.title).length > 0,
  },
]

for (const provider of senders) {
  // The app acts on fixed cut-offs with Jev, so Jev's columns are read at
  // those: the test measures what the app runs. Every other cut-off is
  // chosen here, in turn, each with those before it in place.
  const fixed: Partial<Cutoffs> = provider === 'jev' ? CUTOFFS : {}
  const cuts: Cutoffs = { ...STARTING_CUTOFFS, ...fixed }
  const columns = COLUMNS[provider]
  for (const step of STEPS.filter((one) => columns.includes(one.column))) {
    const rows = GRIDS[step.key].map((cutoff) => {
      const at = { ...cuts, [step.key]: cutoff }
      const read = readColumn(provider, step.column, at)
      const bySet = (count: (name: string) => number) =>
        Object.fromEntries(SETS.map((set) => [set.name, count(set.name)]))
      return {
        cutoff,
        misses: bySet(
          (name) =>
            misses(
              read.filter((one) => one.set === name),
              'column',
              HOUSEHOLD.tags,
            ).length,
        ),
        acted: bySet(
          (name) =>
            outcomes.filter((outcome, index) => {
              const answers = raw[index][provider]?.answers
              return (
                outcome.set === name &&
                answers != null &&
                step.acted(answers, at, index)
              )
            }).length,
        ),
      }
    })
    const missed = (names: ReadonlyArray<string>) => (cutoff: number) => {
      const row = rows.find((one) => one.cutoff === cutoff)
      return names.reduce((sum, name) => sum + (row?.misses[name] ?? 0), 0)
    }
    const chosen = chooseCutoff(GRIDS[step.key], missed(tuned))
    cuts[step.key] = fixed[step.key] ?? chosen
    cutoffs.push({
      way:
        WAYS.find((way) => way.id === columnWay(provider, step.column))?.name ??
        provider,
      question: step.question,
      acts: step.acts,
      chosen,
      used: cuts[step.key],
      fixed: fixed[step.key] !== undefined,
      hindsight: hindsightCutoff(GRIDS[step.key], missed(others)),
      rows,
    })
  }
  used[provider] = cuts

  for (const column of columns) {
    const id = columnWay(provider, column)
    for (const [index, outcome] of outcomes.entries()) {
      const plan = sentences[index].plan(provider)
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
            sum + JSON.stringify(plan?.questions[question] ?? '').length,
          JSON.stringify(plan?.state ?? '').length,
        )
      const all = Object.keys(plan?.questions ?? {})
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
      cutoffs: used,
      sentences: outcomes.map((outcome, index) => ({
        sentence: outcome.sentence,
        set: outcome.set,
        expected: outcome.expected,
        rules: sentences[index].rules,
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
    tags: HOUSEHOLD.tags,
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
