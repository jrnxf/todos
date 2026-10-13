// How well is a to-do's title read? A hundred household sentences, each with
// the fill a person would expect (scripts/read-eval-cases.ts), are read three
// ways and scored field by field, side by side:
//
//   Rules alone          the rules in the page; nothing is sent.
//   Jev first            Jev is asked about every field and every word, the
//                        way the add bar asks today.
//   Jev fills the gaps   the rules read first; Jev is asked only about what
//                        they left empty, and never about the title.
//
//   bun run eval:read                    the plan: what would be sent, and
//                                        what it would cost. Sends nothing.
//   bun run eval:read --yes              runs it, and writes
//                                        data/read-eval/report.md
//   bun run eval:read --yes --cap-usd 0.2
//
// It spends money, a little: it never runs without --yes, and stops before
// the request that would take it past the cap. The key is read from the
// TYPESAFE_API_KEY environment variable and is never printed or written.
import {
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import * as chrono from 'chrono-node'
import { gapsIn, readTitle } from '@/lib/read'
import {
  JEV_ENDPOINT,
  TIME_LIMIT_MS,
  jevReadFrom,
  jevRequest,
} from '@/server/jev-read'
import { CASES, HOUSEHOLD, SETS } from './read-eval-cases'
import { USD_PER_TOKEN, WAY_NAMES, report, usd } from './read-eval-score'
import type { JevRead, ReadField } from '@/lib/read'
import type { JevWay, Outcome, Sent } from './read-eval-score'

const DEFAULT_CAP_USD = 0.5
/** Far past the add bar's limit, so the report can say how slow slow was. */
const EVAL_TIME_LIMIT_MS = 15_000
const DIRECTORY = 'data/read-eval'
const REPORT = `${DIRECTORY}/report.md`

const flag = (name: string) => process.argv.includes(name)
function option(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

const capUsd = Number(option('--cap-usd') ?? DEFAULT_CAP_USD)
if (!Number.isFinite(capUsd) || capUsd <= 0) {
  console.error('--cap-usd takes an amount in dollars, such as 0.2.')
  process.exit(1)
}
const endpoint = process.env.TYPESAFE_API_URL || JEV_ENDPOINT

/** What each way would send for a sentence; null where it sends nothing. */
interface Plan {
  ask: ReadonlyArray<ReadField> | undefined
  body: string
}
const JEV_WAYS = ['first', 'gaps'] as const satisfies ReadonlyArray<JevWay>
const plans = CASES.map(([sentence]): Record<JevWay, Plan | null> => {
  const gaps = gapsIn(chrono, sentence, HOUSEHOLD)
  return {
    first: {
      ask: undefined,
      body: JSON.stringify(jevRequest(sentence, HOUSEHOLD)),
    },
    gaps:
      gaps.length === 0
        ? null
        : {
            ask: gaps,
            body: JSON.stringify(jevRequest(sentence, HOUSEHOLD, gaps, false)),
          },
  }
})
// The first run of this test was charged about one token for every 1.8
// characters sent. Guessing 1.5 errs on the dear side, so the cap errs early.
const guess = (body: string) => Math.ceil(body.length / 1.5)
const guessed = (way: JevWay) =>
  plans.reduce((sum, plan) => sum + (plan[way] ? guess(plan[way].body) : 0), 0)
const guessedTokens = guessed('first') + guessed('gaps')

console.log(`Sentences:       ${CASES.length}, read three ways`)
console.log(`Sent to:         ${endpoint}`)
for (const way of JEV_WAYS)
  console.log(
    `${`${WAY_NAMES[way]}:`.padEnd(21)}${plans.filter((plan) => plan[way]).length} requests, about ${guessed(way)} input tokens, ${usd(guessed(way))}`,
  )
console.log(
  `Estimated cost:  ${usd(guessedTokens)} (about ${guessedTokens} input tokens at $0.042 a million)`,
)
console.log(`Spending cap:    $${capUsd.toFixed(4)}`)
console.log(`Report:          ${REPORT}`)

if (!flag('--yes')) {
  console.log('\nThis was the plan. Nothing was sent. Add --yes to run it.')
  process.exit(0)
}
const apiKey = process.env.TYPESAFE_API_KEY
if (!apiKey) {
  console.error('\nTYPESAFE_API_KEY is not set in the environment.')
  process.exit(1)
}
if (guessedTokens * USD_PER_TOKEN > capUsd) {
  console.error('\nThe estimate is over the cap. Nothing was sent.')
  process.exit(1)
}

let spentTokens = 0
let stopped = ''
let model = ''

async function send(sentence: string, plan: Plan): Promise<Sent> {
  const started = performance.now()
  let jev: JevRead | null = null
  let status: number | string = 'no reply'
  let tokens = guess(plan.body)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: plan.body,
      signal: AbortSignal.timeout(EVAL_TIME_LIMIT_MS),
    })
    status = response.status
    if (response.ok) {
      const reply: {
        model?: string
        usage?: { input_tokens?: number }
      } = await response.json()
      model = reply.model ?? model
      tokens = reply.usage?.input_tokens ?? tokens
      jev = jevReadFrom(reply, sentence, HOUSEHOLD, plan.ask)
    }
  } catch (error) {
    status = error instanceof Error ? error.name : 'error'
  }
  return { ms: Math.round(performance.now() - started), status, tokens, jev }
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

sentences: for (const [index, [sentence, expected]] of CASES.entries()) {
  const sent: Outcome['sent'] = { first: null, gaps: null }
  // Turn about, so neither way always pays for a cold connection.
  for (const way of index % 2 === 0 ? JEV_WAYS : [...JEV_WAYS].reverse()) {
    const plan = plans[index][way]
    if (!plan) continue
    if ((spentTokens + guess(plan.body)) * USD_PER_TOKEN > capUsd) {
      stopped = `Stopped before sentence ${index + 1}: the next request could pass the cap.`
      break sentences
    }
    const one = await send(sentence, plan)
    sent[way] = one
    spentTokens += one.tokens
    console.log(
      `${String(index + 1).padStart(3)}/${CASES.length}  ${way.padEnd(5)}  ${String(one.status).padEnd(8)} ${String(one.ms).padStart(5)} ms  ${sentence}`,
    )
    if (one.status === 401) {
      stopped = 'Stopped: the key was refused (401).'
      break sentences
    }
  }
  // What the add bar would show: an answer it had stopped waiting for is
  // not used.
  const inTime = (way: JevWay) =>
    sent[way] && sent[way].ms <= TIME_LIMIT_MS ? sent[way].jev : null
  outcomes.push({
    sentence,
    expected,
    set: setOf(index),
    reads: {
      rules: readTitle(chrono, sentence, HOUSEHOLD),
      first: readTitle(chrono, sentence, {
        ...HOUSEHOLD,
        jev: inTime('first'),
        jevUse: 'first',
      }),
      gaps: readTitle(chrono, sentence, {
        ...HOUSEHOLD,
        jev: inTime('gaps'),
        jevUse: 'gaps',
      }),
    },
    sent,
  })
}

mkdirSync(DIRECTORY, { recursive: true })
// An earlier report is kept beside the new one, to read the two together.
if (existsSync(REPORT)) {
  const written = statSync(REPORT).mtime.toISOString().slice(0, 19)
  renameSync(REPORT, `${DIRECTORY}/report-${written.replace(/:/g, '')}.md`)
}
writeFileSync(
  REPORT,
  report({
    outcomes,
    sets: SETS.map((set) => ({ name: set.name, size: set.cases.length })),
    areas: HOUSEHOLD.areas,
    endpoint,
    model,
    ranOn: new Date().toISOString().slice(0, 10),
    today: HOUSEHOLD.today,
    timeLimitMs: TIME_LIMIT_MS,
    capUsd,
    stopped,
  }),
)
console.log(`\n${stopped ? `${stopped}\n` : ''}Wrote ${REPORT}`)
