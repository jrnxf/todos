// How well is a to-do's title read? 150 household sentences, each with the
// fill a person would expect (scripts/read-eval-cases.ts), are read every
// way in scripts/read-eval-ways.ts and scored field by field, side by side:
// the rules alone; Jev first and Jev filling the gaps, the two ways the app
// can use Jev today; a hybrid that keeps the rules' title and asks a decision
// model (Jev, Cloudflare Clef, Clef Flash, OpenAI Decisions) for the rest;
// and one call to a fast general model (Claude Haiku 4.5, Gemini 3.1 Flash
// Lite) for all of it. Each request is timed.
//
//   bun run eval:read                    the plan: what would be sent, to
//                                        whom, and what it would cost. Sends
//                                        nothing.
//   bun run eval:read --yes              runs it, and writes
//                                        data/read-eval/report.md
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
import { gapsIn, readTitle } from '@/lib/read'
import { TIME_LIMIT_MS, jevRequest } from '@/server/jev-read'
import { CASES, HOUSEHOLD, SETS } from './read-eval-cases'
import { cost, report, usd } from './read-eval-score'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import {
  PROVIDERS,
  WAYS,
  decisionCall,
  decisionReply,
  fastInstructions,
  fastRead,
  fastSchema,
  geminiCall,
  geminiReply,
  hybridAsk,
  hybridRead,
  missing,
} from './read-eval-ways'
import type { JevRead, ReadField, TitleRead } from '@/lib/read'
import type { Outcome, Sent } from './read-eval-score'
import type { Call, Way } from './read-eval-ways'

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
 * What a way sends for a sentence. It is built before the clock starts, so
 * the delay is the service's and not this script's.
 */
interface Plan {
  kind: 'decision' | 'model'
  /** The fields a decision model is asked about; all of them when absent. */
  ask?: ReadonlyArray<ReadField>
  /** The request, but for Haiku, which goes through Anthropic's SDK. */
  call: Call | null
  /** Its size in characters, to guess its tokens from. */
  size: number
}
const instructions = fastInstructions(HOUSEHOLD)
const schema = fastSchema(HOUSEHOLD)
const sentences = CASES.map(([sentence]) => {
  const rules = readTitle(chrono, sentence, HOUSEHOLD)
  const gaps = gapsIn(chrono, sentence, HOUSEHOLD)
  const plans = new Map<string, Plan | null>()
  const build = (way: Way): Plan | null => {
    const provider = way.provider
    if (!provider) return null
    if (provider === 'haiku' || provider === 'gemini') {
      const call =
        provider === 'gemini' ? geminiCall(sentence, HOUSEHOLD, env) : null
      return {
        kind: 'model',
        call,
        size: (instructions + JSON.stringify(schema) + sentence).length,
      }
    }
    // Nothing left to ask: the rules read every field.
    if (way.kind === 'gaps' && gaps.length === 0) return null
    const fields =
      way.kind === 'first'
        ? undefined
        : way.kind === 'gaps'
          ? gaps
          : hybridAsk(gaps)
    const call = decisionCall(
      provider,
      jevRequest(sentence, HOUSEHOLD, fields, way.kind === 'first'),
      env,
    )
    return { kind: 'decision', ask: fields, call, size: call.body.length }
  }
  /** What `way` sends for this sentence, or null where it sends nothing. */
  const plan = (way: Way) => {
    if (!plans.has(way.id)) plans.set(way.id, build(way))
    return plans.get(way.id) ?? null
  }
  return { rules, gaps, plan }
})

// The first run of this test was charged about one token for every 1.8
// characters of a decision request. Guessing 1.5 errs on the dear side, so
// the cap errs early. A general model is guessed at 2.5 characters a token
// in, and a reply as long as it is allowed to be.
function guess(way: Way, plan: Plan): number {
  if (!way.provider) return 0
  return plan.kind === 'decision'
    ? cost(PROVIDERS[way.provider], Math.ceil(plan.size / 1.5), 0)
    : cost(
        PROVIDERS[way.provider],
        Math.ceil(plan.size / 2.5),
        MOST_OUTPUT_TOKENS,
      )
}
const planned = (way: Way) =>
  sentences.flatMap((sentence) => sentence.plan(way) ?? [])
const guessed = (way: Way) =>
  planned(way).reduce((sum, plan) => sum + guess(way, plan), 0)
const guessedUsd = ways.reduce((sum, way) => sum + guessed(way), 0)

console.log(
  `Sentences:      ${CASES.length} (${SETS.map((set) => set.name).join(', ')})`,
)
if (standIn)
  console.log('Stand-ins:      on. No key is read and nothing is sent.')
console.log('\nWays:')
for (const way of WAYS) {
  const provider = way.provider && PROVIDERS[way.provider]
  if (!provider) {
    console.log(`  ${way.name.padEnd(34)} nothing sent`)
    continue
  }
  const unset = missing(way.provider ?? 'jev', env)
  console.log(
    `  ${way.name.padEnd(34)} ${provider.model}, key from ${provider.env.join(' + ')}: ${
      unset.length > 0
        ? `SKIPPED, ${unset.join(' and ')} not set`
        : `${planned(way).length} requests, about ${usd(guessed(way))}`
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
if (ways.every((way) => !way.provider)) {
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
  way: Way,
  sentence: string,
  plan: Plan,
): Promise<{ sent: Sent; answer: JevRead | TitleRead | null }> {
  const provider = way.provider ?? 'jev'
  const started = performance.now()
  let status: number | string = 'no reply'
  let answer: JevRead | TitleRead | null = null
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
          const read = decisionReply(
            provider,
            reply,
            sentence,
            HOUSEHOLD,
            plan.ask,
          )
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
    plan.size / (plan.kind === 'decision' ? 1.5 : 2.5),
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
const setOf = (index: number) => {
  let before = 0
  for (const set of SETS) {
    before += set.cases.length
    if (index < before) return set.name
  }
  return ''
}
const asking = ways.filter((way) => way.provider)

run: for (const [index, [sentence, expected]] of CASES.entries()) {
  const { rules, gaps, plan } = sentences[index]
  const reads: Outcome['reads'] = { rules }
  const sent: Outcome['sent'] = { rules: null }
  const whole: Array<string> = []
  // Turn about, so no way always pays for the cold connection.
  const turn = index % asking.length
  for (const way of [...asking.slice(turn), ...asking.slice(0, turn)]) {
    const next = plan(way)
    sent[way.id] = null
    let answer: JevRead | TitleRead | null = null
    if (next) {
      if (spentUsd + guess(way, next) > capUsd) {
        stopped = `Stopped before sentence ${index + 1}: the next request could pass the cap.`
        break run
      }
      const one = await ask(way, sentence, next)
      sent[way.id] = one.sent
      spentUsd += one.sent.usd
      console.log(
        `${String(index + 1).padStart(3)}/${CASES.length}  ${way.id.padEnd(15)}  ${String(one.sent.status).padEnd(12)} ${String(one.sent.ms).padStart(5)} ms  ${sentence}`,
      )
      if (one.sent.status === 401 || one.sent.status === 403) {
        stopped = `Stopped: the key for ${way.name} was refused (${one.sent.status}).`
        break run
      }
      // What the add bar would show: an answer it had stopped waiting for
      // is not used.
      if (one.sent.ms <= TIME_LIMIT_MS) answer = one.answer
    }
    if (way.kind === 'model') {
      reads[way.id] = (answer as TitleRead | null) ?? rules
      if (answer) whole.push(way.id)
    } else if (way.kind === 'hybrid')
      reads[way.id] = hybridRead(rules, gaps, answer as JevRead | null)
    else
      reads[way.id] = readTitle(chrono, sentence, {
        ...HOUSEHOLD,
        jev: answer as JevRead | null,
        jevUse: way.kind === 'first' ? 'first' : 'gaps',
      })
  }
  outcomes.push({ sentence, expected, set: setOf(index), reads, sent, whole })
}

mkdirSync(DIRECTORY, { recursive: true })
// An earlier report is kept beside the new one, to read the two together.
if (existsSync(REPORT)) {
  const written = statSync(REPORT).mtime.toISOString().slice(0, 19)
  renameSync(
    REPORT,
    REPORT.replace(/\.md$/, `-${written.replace(/:/g, '')}.md`),
  )
}
writeFileSync(
  REPORT,
  report({
    outcomes,
    sets: SETS.map((set) => ({ name: set.name, size: set.cases.length })),
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
  }),
)
console.log(`\n${stopped ? `${stopped}\n` : ''}Wrote ${REPORT}`)
