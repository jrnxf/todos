// How well does Jev read a to-do's title? Thirty household sentences, each
// with the fill a person would expect, are sent to the real service the way
// the add bar sends them, and the answers are scored field by field next to
// what the rules alone read.
//
//   bun run eval:read                    the plan: what would be sent, and
//                                        what it would cost. Sends nothing.
//   bun run eval:read --yes              runs it, and writes
//                                        data/read-eval/report.md
//   bun run eval:read --yes --cap-usd 0.02
//
// It spends money, a little: it never runs without --yes, and stops before
// the request that would take it past the cap. The key is read from the
// TYPESAFE_API_KEY environment variable and is never printed or written.
import { mkdirSync, writeFileSync } from 'node:fs'
import * as chrono from 'chrono-node'
import { readTitle } from '@/lib/read'
import {
  JEV_ENDPOINT,
  TIME_LIMIT_MS,
  jevReadFrom,
  jevRequest,
} from '@/server/jev-read'
import type { JevRead, TitleRead } from '@/lib/read'

/** Jev 1.13: charged per input token (docs.typesafe.ai/models). */
const USD_PER_TOKEN = 0.042 / 1_000_000
const DEFAULT_CAP_USD = 0.05
/** Far past the add bar's limit, so the report can say how slow slow was. */
const EVAL_TIME_LIMIT_MS = 15_000
const REPORT = 'data/read-eval/report.md'

// A made-up household on a fixed day, so every run asks the same thing.
const HOUSEHOLD = {
  today: '2026-10-13', // a Tuesday
  me: 'sam',
  people: [
    { id: 'michelle', name: 'Michelle' },
    { id: 'sam', name: 'Sam' },
  ],
  areas: ['House', 'Yard', 'Kids', 'Paperwork', 'Car', 'Health', 'Pets'].map(
    (name, index) => ({ id: index + 1, name }),
  ),
}

interface Expected {
  title: string
  date?: string
  time?: string
  who?: string
  /** An area's name, null for none, or left out where two would be right. */
  area?: string | null
  /** Left out: nothing said, the default stays. */
  headsUp?: Array<number>
  flag?: true
}

const CASES: Array<[sentence: string, expected: Expected]> = [
  [
    "Michelle visit garden center at 9pm on saturday don't forget",
    {
      title: 'visit garden center',
      date: '2026-10-17',
      time: '21:00',
      who: 'michelle',
      area: 'Yard',
      flag: true,
    },
  ],
  [
    'Pay property tax by friday',
    { title: 'Pay property tax', date: '2026-10-16', area: 'Paperwork' },
  ],
  [
    'Sam: take the car in for an oil change tomorrow at 8am',
    {
      title: 'take the car in for an oil change',
      date: '2026-10-14',
      time: '08:00',
      who: 'sam',
      area: 'Car',
    },
  ],
  [
    'Book flu shots for the kids monday at 3:30pm',
    {
      title: 'Book flu shots for the kids',
      date: '2026-10-19',
      time: '15:30',
    },
  ],
  [
    'I need to renew my passport, remind me 2 weeks before',
    {
      title: 'renew my passport',
      who: 'sam',
      area: 'Paperwork',
      headsUp: [14],
    },
  ],
  [
    "Ask Michelle to pick up the dog's medicine today",
    {
      title: "pick up the dog's medicine",
      date: '2026-10-13',
      who: 'michelle',
      area: 'Pets',
    },
  ],
  [
    'Mow the lawn sunday',
    { title: 'Mow the lawn', date: '2026-10-18', area: 'Yard' },
  ],
  [
    'Buy Michelle a birthday present',
    { title: 'Buy Michelle a birthday present', area: null },
  ],
  [
    "Michelle's dentist appointment thursday 2:15pm",
    {
      title: "Michelle's dentist appointment",
      date: '2026-10-15',
      time: '14:15',
      area: 'Health',
    },
  ],
  [
    'Clean the gutters on october 24',
    { title: 'Clean the gutters', date: '2026-10-24', area: 'House' },
  ],
  [
    'Sign the permission slip for the field trip tomorrow !!',
    {
      title: 'Sign the permission slip for the field trip',
      date: '2026-10-14',
      area: 'Kids',
      flag: true,
    },
  ],
  [
    'Renew car registration by the 30th, important',
    {
      title: 'Renew car registration',
      date: '2026-10-30',
      area: 'Car',
      flag: true,
    },
  ],
  [
    'Take the cat to the vet wednesday at 4:45pm',
    {
      title: 'Take the cat to the vet',
      date: '2026-10-14',
      time: '16:45',
      area: 'Pets',
    },
  ],
  [
    'Replace smoke detector batteries',
    { title: 'Replace smoke detector batteries', area: 'House' },
  ],
  [
    'Michelle to call the plumber about the kitchen leak',
    {
      title: 'call the plumber about the kitchen leak',
      who: 'michelle',
      area: 'House',
    },
  ],
  [
    'Submit FSA receipts, no reminder',
    { title: 'Submit FSA receipts', area: 'Paperwork', headsUp: [] },
  ],
  [
    'Pick up March of the Penguins from the library',
    { title: 'Pick up March of the Penguins from the library', area: null },
  ],
  [
    'Take 2 weeks of recycling to the depot',
    { title: 'Take 2 weeks of recycling to the depot' },
  ],
  [
    'Schedule furnace service for november 5 at 10am, heads up a week before',
    {
      title: 'Schedule furnace service',
      date: '2026-11-05',
      time: '10:00',
      area: 'House',
      headsUp: [7],
    },
  ],
  [
    'Dinner with the Hendersons friday 7pm',
    {
      title: 'Dinner with the Hendersons',
      date: '2026-10-16',
      time: '19:00',
    },
  ],
  [
    'Order new tires for the car',
    { title: 'Order new tires for the car', area: 'Car' },
  ],
  [
    'Wish grandma a happy birthday!',
    { title: 'Wish grandma a happy birthday!', area: null },
  ],
  [
    'Call Michelle about dinner',
    { title: 'Call Michelle about dinner', area: null },
  ],
  [
    'Refill my allergy prescription today',
    {
      title: 'Refill my allergy prescription',
      date: '2026-10-13',
      area: 'Health',
    },
  ],
  [
    'Rake the leaves in 3 days',
    { title: 'Rake the leaves', date: '2026-10-16', area: 'Yard' },
  ],
  [
    'Register the kids for soccer by tuesday must not miss',
    {
      title: 'Register the kids for soccer',
      date: '2026-10-20',
      area: 'Kids',
      flag: true,
    },
  ],
  [
    'File the insurance claim - Michelle',
    {
      title: 'File the insurance claim',
      who: 'michelle',
      area: 'Paperwork',
    },
  ],
  [
    'Fix the light on the 2nd floor',
    { title: 'Fix the light on the 2nd floor', area: 'House' },
  ],
  ['Buy dog food', { title: 'Buy dog food', area: 'Pets' }],
  [
    'Remind me to book the eye exam for dec 3 at 11:15am',
    {
      title: 'book the eye exam',
      date: '2026-12-03',
      time: '11:15',
      who: 'sam',
      area: 'Health',
    },
  ],
]

const FIELDS = [
  'title',
  'date',
  'time',
  'who',
  'area',
  'heads-up',
  'flag',
] as const
type Field = (typeof FIELDS)[number]

/** What was wanted and what was read, as text that compares. */
function sides(expected: Expected, read: TitleRead) {
  const area = HOUSEHOLD.areas.find((one) => one.id === read.fields.areaId)
  const plain = (title: string) =>
    title
      .toLowerCase()
      .replace(/[\s,;:.]+$/, '')
      .trim()
  const days = (list: Array<number> | undefined) =>
    list ? `[${list.join(', ')}]` : 'unsaid'
  const all: Record<Field, [wanted: string, got: string] | null> = {
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
  return all
}

const flag = (name: string) => process.argv.includes(name)
function option(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

const capUsd = Number(option('--cap-usd') ?? DEFAULT_CAP_USD)
if (!Number.isFinite(capUsd) || capUsd <= 0) {
  console.error('--cap-usd takes an amount in dollars, such as 0.05.')
  process.exit(1)
}
const endpoint = process.env.TYPESAFE_API_URL || JEV_ENDPOINT
const requests = CASES.map(([sentence]) =>
  JSON.stringify(jevRequest(sentence, HOUSEHOLD)),
)
// About three characters a token: an over-estimate, so the cap errs early.
const guess = (body: string) => Math.ceil(body.length / 3)
const guessedTokens = requests.reduce((sum, body) => sum + guess(body), 0)
const usd = (tokens: number) => `$${(tokens * USD_PER_TOKEN).toFixed(4)}`

console.log(`Sentences:       ${CASES.length}, one request each`)
console.log(`Sent to:         ${endpoint}`)
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

interface Outcome {
  sentence: string
  expected: Expected
  /** Jev's reading, or null: an error, or no reply inside the eval's limit. */
  jev: JevRead | null
  ms: number
  status: number | string
  tokens: number
}

const outcomes: Array<Outcome> = []
let spentTokens = 0
let stopped = ''
let model = ''

for (const [index, [sentence, expected]] of CASES.entries()) {
  const body = requests[index]
  if ((spentTokens + guess(body)) * USD_PER_TOKEN > capUsd) {
    stopped = `Stopped before sentence ${index + 1}: the next request could pass the cap.`
    break
  }
  const started = performance.now()
  let jev: JevRead | null = null
  let status: number | string = 'no reply'
  let tokens = guess(body)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
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
      jev = jevReadFrom(reply, sentence, HOUSEHOLD)
    }
  } catch (error) {
    status = error instanceof Error ? error.name : 'error'
  }
  const ms = Math.round(performance.now() - started)
  spentTokens += tokens
  outcomes.push({ sentence, expected, jev, ms, status, tokens })
  console.log(
    `${String(index + 1).padStart(2)}/${CASES.length}  ${String(status).padEnd(8)} ${String(ms).padStart(5)} ms  ${sentence}`,
  )
  if (status === 401) {
    stopped = 'Stopped: the key was refused (401).'
    break
  }
}

// Three readings of each sentence: the rules alone, the add bar (Jev first,
// but only an answer inside its time limit), and Jev however long it took.
const WAYS = ['Rules alone', 'Add bar', 'Jev, any delay'] as const
const readings = outcomes.map((outcome) => {
  const reads = (jev: JevRead | null) =>
    readTitle(chrono, outcome.sentence, { ...HOUSEHOLD, jev })
  return [
    reads(null),
    reads(outcome.ms <= TIME_LIMIT_MS ? outcome.jev : null),
    reads(outcome.jev),
  ]
})

const lines: Array<string> = []
const say = (line = '') => lines.push(line)
const answered = outcomes.filter((outcome) => outcome.jev)
const delays = outcomes.map((outcome) => outcome.ms).sort((a, b) => a - b)
const at = (share: number) =>
  delays[Math.min(delays.length - 1, Math.floor(delays.length * share))]

say('# Reading to-do titles with Jev')
say()
say(
  `${outcomes.length} of ${CASES.length} sentences sent to \`${endpoint}\`${model ? `, answered by \`${model}\`` : ''}, on ${new Date().toISOString().slice(0, 10)}. The household is made up and "today" is fixed at ${HOUSEHOLD.today}, a Tuesday.`,
)
if (stopped) say(`\n**${stopped}**`)
say()
say('## Hit rate per field')
say()
say(
  'A hit is the field ending up as a person would expect, filled or left empty. "Add bar" is what the app shows: Jev first where it was sure and answered in time, the rules for the rest.',
)
say()
say(`| Field | ${WAYS.join(' | ')} |`)
say(`| --- | ${WAYS.map(() => '---').join(' | ')} |`)
const misses: Array<string> = []
for (const field of FIELDS) {
  const cells = WAYS.map((_way, way) => {
    let hits = 0
    let scored = 0
    outcomes.forEach((outcome, index) => {
      const side = sides(outcome.expected, readings[index][way])[field]
      if (!side) return
      scored += 1
      if (side[0] === side[1]) hits += 1
      else if (way === 1) {
        const from =
          field !== 'title' &&
          readings[index][way].guessed[
            field === 'date' || field === 'time'
              ? 'when'
              : field === 'heads-up'
                ? 'headsUp'
                : field
          ] !== undefined
            ? 'Jev'
            : 'rules'
        misses.push(
          `| ${outcome.sentence} | ${field} | ${side[0]} | ${side[1]} | ${field === 'title' ? '' : from} |`,
        )
      }
    })
    return scored === 0
      ? 'n/a'
      : `${hits}/${scored} (${Math.round((100 * hits) / scored)}%)`
  })
  say(`| ${field} | ${cells.join(' | ')} |`)
}
say()
say('## Misses in the add bar')
say()
if (misses.length === 0) say('None.')
else {
  say('| Sentence | Field | Expected | Got | Filled by |')
  say('| --- | --- | --- | --- | --- |')
  misses.forEach((miss) => say(miss))
}
say()
say('## Delay')
say()
say(
  `Median ${at(0.5)} ms, 9 in 10 within ${at(0.9)} ms, slowest ${delays.at(-1)} ms. ${outcomes.filter((outcome) => outcome.ms > TIME_LIMIT_MS).length} of ${outcomes.length} took longer than the add bar waits (${TIME_LIMIT_MS} ms) and would have been read by the rules. ${outcomes.length - answered.length} got no usable reply at all.`,
)
const failed = outcomes.filter((outcome) => !outcome.jev)
if (failed.length > 0) {
  say()
  failed.forEach((outcome) => say(`- ${outcome.status}: ${outcome.sentence}`))
}
say()
say('## Cost')
say()
say(
  `${spentTokens} input tokens, ${usd(spentTokens)} at $0.042 a million (output is free), under a cap of $${capUsd.toFixed(4)}. That is ${usd(spentTokens / Math.max(1, outcomes.length))} a to-do.`,
)
say()

mkdirSync('data/read-eval', { recursive: true })
writeFileSync(REPORT, `${lines.join('\n')}`)
console.log(`\n${stopped ? `${stopped}\n` : ''}Wrote ${REPORT}`)
