// The ways `bun run eval:read` reads a title, and what each one sends and
// makes of the reply. Nothing here sends anything: the requests are built
// and the replies read as plain data, so both can be tested against the
// shapes the providers document.
//
// Every fact about a provider below (endpoint, model, request and reply
// shape, limits, price) comes from where `checked` says, at the addresses
// given beside it. The requests were tried against stand-ins only
// (scripts/read-eval-stand-in.ts), never the real services.
import { JEV_ENDPOINT, jevReadFrom } from '@/server/jev-read'
import type { JevRead, ReadField, TitleRead } from '@/lib/read'
import type { Household } from '@/server/jev-read'
import type { Answer, Answers, Column } from './read-eval-verify'

// ── Providers ───────────────────────────────────────────────────────────────

export interface Provider {
  name: string
  model: string
  endpoint: string
  /** The environment variables it needs; all of them, or it is skipped. */
  env: Array<string>
  /** Dollars per million tokens. */
  usdPerMInput: number
  usdPerMOutput: number
  /** Limits and anything else worth knowing, for the report's notes. */
  notes: string
  /** How and when the facts above were read. */
  checked: string
  sources: Array<string>
}

export const PROVIDERS = {
  jev: {
    name: 'TypeSafe Jev',
    model: 'jev-latest',
    endpoint: JEV_ENDPOINT,
    env: ['TYPESAFE_API_KEY'],
    usdPerMInput: 0.042,
    usdPerMOutput: 0,
    notes:
      'A decision model: typed questions in, a probability per option out. At most 255 options a choice. Output is not charged. Jev first asks `jev-latest`, as the app does; the documented usage names the version, `jev-1.13.0`, so that its cut-offs stay those of one model.',
    checked:
      'As src/server/jev-read.ts already had them, and as the first runs of this test were charged; not read again.',
    sources: [
      'https://docs.typesafe.ai/api',
      'https://docs.typesafe.ai/models',
    ],
  },
  clef: {
    name: 'Cloudflare Clef',
    model: '@cf/cloudflare/clef',
    endpoint:
      'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/cloudflare/clef',
    env: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    usdPerMInput: 0.24,
    usdPerMOutput: 0,
    notes:
      'A 27B decision model on Workers AI. It takes the System One request Jev takes (`state`, `questions` of type noul, choice or score) with `model: "clef"`, and answers in the same shape. 1 to 64 questions, 2 to 255 options a choice, a 65,536 token window. Output is not charged. The model page gives the reply as `{model, answers, usage}`; the Workers AI REST API wraps replies in `result`, so either is read.',
    checked: "Read from the provider's documentation on 2026-10-13.",
    sources: [
      'https://developers.cloudflare.com/workers-ai/models/clef/',
      'https://developers.cloudflare.com/workers-ai/models/clef/schema-input.json',
      'https://developers.cloudflare.com/workers-ai/models/clef/schema-output.json',
    ],
  },
  clefFlash: {
    name: 'Cloudflare Clef Flash',
    model: '@cf/cloudflare/clef-flash',
    endpoint:
      'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/cloudflare/clef-flash',
    env: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    usdPerMInput: 0.038,
    usdPerMOutput: 0,
    notes:
      'The 9B Clef: the same request with `model: "clef-flash"`, the same limits on questions and options, a 24,576 token window. Output is not charged.',
    checked: "Read from the provider's documentation on 2026-10-13.",
    sources: [
      'https://developers.cloudflare.com/workers-ai/models/clef-flash/',
      'https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-input.json',
    ],
  },
  openai: {
    name: 'OpenAI Decisions',
    model: 'gpt-6-luna',
    endpoint: 'https://api.openai.com/v1/decisions',
    env: ['OPENAI_API_KEY'],
    usdPerMInput: 0.1,
    usdPerMOutput: 0,
    notes:
      'In public beta since 2026-10-06; `gpt-6-luna` is its only model. `input` is text, `questions` an array of predicate, choice (2 to 255 `choices` of `{value, description}`) or score, each with a `name`. A question may come back as a `refusal`, which is read as no answer. Only input is charged; long-context and regional multipliers, which this test never reaches, are not counted. The reference gives no limit on the number of questions.',
    checked: "Read from the provider's documentation on 2026-10-13.",
    sources: [
      'https://developers.openai.com/api/docs/guides/decisions',
      'https://developers.openai.com/api/reference/resources/decisions/methods/create',
    ],
  },
  haiku: {
    name: 'Claude Haiku 4.5',
    model: 'claude-haiku-4-5-20251001',
    endpoint: 'https://api.anthropic.com/v1/messages',
    env: ['ANTHROPIC_API_KEY'],
    usdPerMInput: 1,
    usdPerMOutput: 5,
    notes:
      'A general model, asked once for every field and the tidied title as structured output (`output_config.format`, a JSON schema), through the official SDK with retries off so the delay is one request. No thinking.',
    checked:
      'Read from the Claude API reference bundled with Claude Code (its model table is dated 2026-09-25) and the types of @anthropic-ai/sdk 0.133.0, not from the web pages.',
    sources: [
      'https://platform.claude.com/docs/en/build-with-claude/structured-outputs',
      'https://platform.claude.com/docs/en/about-claude/pricing',
    ],
  },
  gemini: {
    name: 'Gemini 3.1 Flash Lite',
    model: 'gemini-3.1-flash-lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    env: ['GEMINI_API_KEY'],
    usdPerMInput: 0.25,
    usdPerMOutput: 1.5,
    notes:
      'A general model, asked once for every field and the tidied title as structured output (`response_format` with a JSON schema) through the Interactions API, which is in beta. `thinking_level` is `minimal` and `store` is off. Output is charged with thinking tokens counted in.',
    checked: "Read from the provider's documentation on 2026-10-13.",
    sources: [
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite',
      'https://ai.google.dev/gemini-api/docs/structured-output',
      'https://ai.google.dev/api/interactions-api',
      'https://ai.google.dev/gemini-api/docs/pricing',
    ],
  },
} as const satisfies Record<string, Provider>
export type ProviderId = keyof typeof PROVIDERS

// ── Ways ────────────────────────────────────────────────────────────────────

const MODEL =
  'one call returns every field and the tidied title as structured output; the rules read the sentence alone on a late or a bad reply'

export interface Way {
  id: string
  name: string
  /**
   * `rules`: nothing is sent. `first`: Jev as the app asks it today, for
   * every field and every word. `area`, `verify` and `parts`: a decision
   * model asked the documented way (scripts/read-eval-verify.ts), three
   * readings of one reply. `model`: one call to a general model for all of
   * it.
   */
  kind: 'rules' | 'first' | Column | 'model'
  provider?: ProviderId
  about: string
}

const ABOUT: Record<Column, string> = {
  verify:
    'the rules read first and write the title; the model picks the area from described options where the rules found none, and can take back a date the rules read from words that are part of a name. It never writes a date, a time or a title',
  area: 'test only, to show the area question’s worth alone: the same reply, read for the area and nothing else',
  parts:
    'test only: the same reply again, and where the rules read no date, one put together in code from the parts the model names (how it is written, the month, the day, the weekday)',
}
const COLUMN_NAME: Record<Column, string> = {
  verify: 'Verify',
  area: 'Area only',
  parts: 'Verify + date parts',
}
/** The decision models asked the documented way, in the report's order. */
export const DECISION_PROVIDERS = [
  'jev',
  'clef',
  'clefFlash',
  'openai',
] as const
export type DecisionProvider = (typeof DECISION_PROVIDERS)[number]
const SHORT: Record<DecisionProvider, string> = {
  jev: 'Jev',
  clef: 'Clef',
  clefFlash: 'Clef Flash',
  openai: 'OpenAI Decisions',
}
/** The id of a decision model's column. */
export const columnWay = (provider: DecisionProvider, column: Column) =>
  `${column}:${provider}`
/** The columns read out of one reply, the one that is the proposal first. */
export const COLUMNS: ReadonlyArray<Column> = ['verify', 'area', 'parts']

/** Every way, in the order the report shows them. */
export const WAYS: Array<Way> = [
  {
    id: 'rules',
    name: 'Rules alone',
    kind: 'rules',
    about: 'the rules in the page, and nothing sent',
  },
  {
    id: 'first',
    name: 'Jev first, the old usage',
    kind: 'first',
    provider: 'jev',
    about:
      'what the app does today, kept as the baseline: Jev is asked for the day among 120, the time among 96, every other field and what each word of the title is for; what it is sure of fills the field and tidies the title, and the rules read the rest',
  },
  ...DECISION_PROVIDERS.flatMap((provider) =>
    COLUMNS.map((column): Way => ({
      id: columnWay(provider, column),
      name: `${COLUMN_NAME[column]}, ${SHORT[provider]}`,
      kind: column,
      provider,
      about: ABOUT[column],
    })),
  ),
  {
    id: 'haiku',
    name: 'Fast model, Haiku 4.5',
    kind: 'model',
    provider: 'haiku',
    about: MODEL,
  },
  {
    id: 'gemini',
    name: 'Fast model, Gemini 3.1 Flash Lite',
    kind: 'model',
    provider: 'gemini',
    about: MODEL,
  },
]

/** The variables of `provider` that `env` does not set. */
export function missing(
  provider: ProviderId,
  env: Record<string, string | undefined>,
): Array<string> {
  return PROVIDERS[provider].env.filter((name) => !env[name])
}

// ── Decision models: Jev, Clef, Clef Flash, OpenAI Decisions ────────────────

/** A System One request: what Jev and Clef are sent as it is. */
export interface SystemOne {
  model: string
  state: unknown
  questions: Record<string, unknown>
}

export interface Call {
  url: string
  headers: Record<string, string>
  body: string
}

const text = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value)

/**
 * The request a decision provider is sent for a System One body. Jev takes
 * it as it is, model and all; Clef takes it under its own model's name;
 * OpenAI takes the same questions in its own shape.
 */
export function decisionCall(
  provider: DecisionProvider,
  questions: SystemOne,
  env: Record<string, string | undefined>,
): Call {
  const json = { 'Content-Type': 'application/json' }
  if (provider === 'jev')
    return {
      url: env.TYPESAFE_API_URL || PROVIDERS.jev.endpoint,
      headers: { ...json, Authorization: `Bearer ${env.TYPESAFE_API_KEY}` },
      body: JSON.stringify(questions),
    }
  if (provider === 'openai')
    return {
      url: env.OPENAI_API_URL || PROVIDERS.openai.endpoint,
      headers: { ...json, Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: PROVIDERS.openai.model,
        input: JSON.stringify(questions.state),
        questions: Object.entries(
          questions.questions as Record<
            string,
            {
              type: 'choice' | 'noul'
              instructions: unknown
              criteria?: Record<string, unknown>
            }
          >,
        ).map(([name, question]) =>
          question.type === 'choice'
            ? {
                type: 'choice',
                name,
                instructions: text(question.instructions),
                choices: Object.entries(question.criteria ?? {}).map(
                  ([value, description]) => ({
                    value,
                    // An option that needs no describing is its own name.
                    description:
                      description === null ? value : text(description),
                  }),
                ),
              }
            : {
                type: 'predicate',
                name,
                // A predicate has no criteria of its own: what a yes and a
                // no mean go into the question.
                instructions: `${text(question.instructions)} Yes: ${text(question.criteria?.true)} No: ${text(question.criteria?.false)}`,
              },
        ),
      }),
    }
  const model = provider === 'clef' ? 'clef' : 'clef-flash'
  return {
    url: (env.CLOUDFLARE_API_URL || PROVIDERS[provider].endpoint).replace(
      '{account}',
      encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? ''),
    ),
    headers: { ...json, Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body: JSON.stringify({ ...questions, model }),
  }
}

export interface Reply<T> {
  /** What was read out of the reply, or null: it made no sense. */
  read: T | null
  /** The service's count, or null when it gave none. */
  inputTokens: number | null
  outputTokens: number | null
  model: string
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/**
 * The answers in a decision provider's reply, in Jev's shape whoever gave
 * them, with the tokens it counted. Null answers: it made no sense.
 */
function answersIn(provider: DecisionProvider, reply: unknown) {
  // Workers AI wraps a model's reply in `result`.
  const outer = object(reply)
  const body =
    provider === 'clef' || provider === 'clefFlash'
      ? object(outer.result ?? outer)
      : outer
  const usage = object(body.usage)
  let answers = body.answers
  if (provider === 'openai') {
    if (!Array.isArray(answers)) answers = undefined
    else
      answers = Object.fromEntries(
        answers.flatMap((one: unknown): Array<[string, unknown]> => {
          const answer = object(one)
          if (typeof answer.name !== 'string') return []
          if (answer.type === 'predicate')
            return [[answer.name, { type: 'noul', noul: answer.probability }]]
          if (answer.type !== 'choice' || !Array.isArray(answer.probabilities))
            return []
          return [
            [
              answer.name,
              {
                type: 'choice',
                choice: answer.choice,
                probabilities: Object.fromEntries(
                  answer.probabilities.map((option: unknown) => [
                    String(object(option).value),
                    object(option).probability,
                  ]),
                ),
              },
            ],
          ]
        }),
      )
  }
  return {
    answers:
      answers && typeof answers === 'object'
        ? (answers as Record<string, unknown>)
        : null,
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    model: typeof body.model === 'string' ? body.model : '',
  }
}

/**
 * A decision provider's reply as the reading the app makes of Jev's: only
 * what was asked, is one of ours, and is sure enough.
 */
export function decisionReply(
  provider: DecisionProvider,
  reply: unknown,
  title: string,
  household: Household,
  ask?: ReadonlyArray<ReadField>,
): Reply<JevRead> {
  const { answers, ...rest } = answersIn(provider, reply)
  return {
    read: answers ? jevReadFrom({ answers }, title, household, ask) : null,
    ...rest,
  }
}

const odds = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1

/**
 * A decision provider's reply as raw answers: each pick with the odds of
 * every option, each yes or no as the odds of a yes. An answer that is not
 * well formed is left out, which every column reads as no answer.
 */
export function decisionAnswers(
  provider: DecisionProvider,
  reply: unknown,
): Reply<Answers> {
  const { answers, ...rest } = answersIn(provider, reply)
  if (!answers) return { read: null, ...rest }
  const read: Answers = {}
  for (const [id, given] of Object.entries(answers)) {
    const answer = object(given)
    const probabilities = object(answer.probabilities)
    let one: Answer | undefined
    if (odds(answer.noul)) one = { noul: answer.noul }
    else if (
      typeof answer.choice === 'string' &&
      odds(probabilities[answer.choice]) &&
      Object.values(probabilities).every(odds)
    )
      one = {
        choice: answer.choice,
        probabilities: probabilities as Record<string, number>,
      }
    if (one) read[id] = one
  }
  return { read, ...rest }
}

// ── Fast general models: Haiku 4.5, Gemini 3.1 Flash Lite ───────────────────

/** How long a to-do's title can be; a longer one from a model is a bad reply. */
const LONGEST_TITLE = 300
const MOST_DAYS = 365
const MOST_HEADS_UPS = 8

/** What a fast model is asked to return: every field, and the tidied title. */
export function fastSchema(household: Household) {
  const orNull = (schema: Record<string, unknown>) => ({
    anyOf: [schema, { type: 'null' }],
  })
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'title',
      'due_date',
      'due_time',
      'person',
      'area',
      'reminder_days',
      'must_not_miss',
    ],
    properties: {
      title: {
        type: 'string',
        description:
          'The to-do as typed, less the words that only say one of the other fields.',
      },
      due_date: {
        ...orNull({ type: 'string' }),
        description: 'YYYY-MM-DD, or null when no day is said.',
      },
      due_time: {
        ...orNull({ type: 'string' }),
        description: 'HH:MM on a 24 hour clock, or null when no time is said.',
      },
      person: {
        ...orNull({
          type: 'string',
          enum: household.people.map((one) => one.name),
        }),
        description: 'Whose job it is, or null when it does not say.',
      },
      area: {
        ...orNull({
          type: 'string',
          enum: household.areas.map((one) => one.name),
        }),
        description: 'The one area it belongs in, or null when none fits.',
      },
      reminder_days: {
        ...orNull({ type: 'array', items: { type: 'integer' } }),
        description:
          'Days ahead of the deadline to remind: [] when it asks for no reminder, null when it says nothing about one.',
      },
      must_not_miss: {
        type: 'boolean',
        description: 'True only when the to-do itself stresses it.',
      },
    },
  }
}

/** The standing instructions a fast model reads a to-do under. */
export function fastInstructions(household: Household): string {
  const me = household.people.find((one) => one.id === household.me)
  const weekday = new Date(`${household.today}T12:00:00Z`).toLocaleDateString(
    'en-US',
    { weekday: 'long', timeZone: 'UTC' },
  )
  return [
    'You read one to-do typed into a shared household list and return what its buttons should be set to. Fill a field only from what the to-do says; when it does not say, return null. A wrong fill is worse than an empty one.',
    `Today is ${weekday}, ${household.today}. The household is ${household.people.map((one) => one.name).join(' and ')}${me ? `; ${me.name} is typing ("I", "me")` : ''}. The areas are ${household.areas.map((one) => one.name).join(', ')}.`,
    'title: the to-do as typed, in the same words, case and spelling, with only the words removed that say the day or time, hand it to someone ("Sam:", "ask Sam to", "I need to", "can you"), name the area as a tag or heading ("#kids", "House:"), ask for or refuse a reminder, or stress it. Never drop or change a word of the task itself, and never drop a name, number, day or month that is part of the task ("Friday Night Lights", "Sam\'s suit", "2 weeks of recycling").',
    'due_date: the day it is due or happens on. A weekday means the next one, and when it is today\'s weekday it means a week from today. "next week" is the coming Monday, "this weekend" the coming Saturday, "before friday" is Friday, "the 5th" is the next 5th. A day or month already gone by is the next one to come. A day that is part of a name or says whose something is ("Friday\'s field trip") is not a due date.',
    'due_time: the time of day, when one is said. An hour without am or pm is the one the task makes likely: "dinner at 7" is 19:00, "dentist at 9" is 09:00.',
    'person: whose job it is, only when the to-do is addressed or handed to them: their name opens or closes it, or it says so ("ask Sam to", "I need to"). Someone who is only mentioned, visited, called or bought for is not it.',
    'area: the one area it clearly belongs in, whether named or not ("Mow the lawn" is the yard\'s). null when none fits or it is unclear.',
    'reminder_days: how many days ahead of the deadline it asks to be reminded ("remind me a week before and the day before" is [7, 1]); [] when it asks not to be reminded; null when it says nothing about a reminder.',
    'must_not_miss: true only when the to-do itself stresses that it must not be missed ("don\'t forget", "urgent", "asap", "high priority", "!!"). A word that describes something ("urgent care", "the important notice") or one "!" ending a sentence is not that.',
  ].join('\n\n')
}

/**
 * The body Gemini's Interactions API is sent. Haiku goes through Anthropic's
 * SDK, which is handed `fastInstructions` and `fastSchema` directly.
 */
export function geminiCall(
  title: string,
  household: Household,
  env: Record<string, string | undefined>,
): Call {
  return {
    url: env.GEMINI_API_URL || PROVIDERS.gemini.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY ?? '',
    },
    body: JSON.stringify({
      model: PROVIDERS.gemini.model,
      system_instruction: fastInstructions(household),
      input: title,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: fastSchema(household),
      },
      generation_config: { thinking_level: 'minimal' },
      store: false,
    }),
  }
}

/** The JSON text and the token counts out of an Interactions API reply. */
export function geminiReply(reply: unknown): {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  model: string
} {
  const body = object(reply)
  const usage = object(body.usage)
  const steps = Array.isArray(body.steps) ? body.steps : []
  const output = steps
    .map(object)
    .filter((step) => step.type === 'model_output')
    .at(-1)
  const parts = Array.isArray(output?.content) ? output.content : []
  const out = count(usage.total_output_tokens)
  return {
    text: parts
      .map(object)
      .flatMap((part) =>
        part.type === 'text' && typeof part.text === 'string' ? part.text : [],
      )
      .join(''),
    inputTokens: count(usage.total_input_tokens),
    // Thinking is charged as output.
    outputTokens:
      out === null ? null : out + (count(usage.total_thought_tokens) ?? 0),
    model: typeof body.model === 'string' ? body.model : '',
  }
}

const realDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const realTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

/**
 * A fast model's JSON as a reading, or null for a bad reply: not JSON, not
 * the shape that was asked for, or a value that is not one of ours. A bad
 * reply is never half used; the rules read the sentence instead.
 */
export function fastRead(json: string, household: Household): TitleRead | null {
  let reply: Record<string, unknown>
  try {
    reply = object(JSON.parse(json))
  } catch {
    return null
  }
  const { title, person, area } = reply
  const date = reply.due_date
  const time = reply.due_time
  const days = reply.reminder_days
  if (typeof title !== 'string' || !title.trim()) return null
  if (title.length > LONGEST_TITLE) return null
  if (typeof reply.must_not_miss !== 'boolean') return null
  const fields: TitleRead['fields'] = {}

  if (date !== null) {
    if (typeof date !== 'string' || !realDate(date)) return null
    if (time !== null && (typeof time !== 'string' || !realTime(time)))
      return null
    fields.dueDate = date
    fields.dueTime = time
  }
  // A time and no day is not something a to-do can hold.
  else if (time !== null) return null

  if (person !== null) {
    const who = household.people.find((one) => one.name === person)
    if (!who) return null
    fields.assignee = who.id
  }
  if (area !== null) {
    const where = household.areas.find((one) => one.name === area)
    if (!where) return null
    fields.areaId = where.id
  }
  if (days !== null) {
    if (
      !Array.isArray(days) ||
      days.length > MOST_HEADS_UPS ||
      !days.every(
        (n): n is number => Number.isInteger(n) && n >= 1 && n <= MOST_DAYS,
      )
    )
      return null
    fields.headsUpDays = [...new Set(days)].sort((a, b) => a - b)
  }
  if (reply.must_not_miss) fields.mustNotMiss = true

  return { title: title.trim(), fields, phrases: {}, guessed: {} }
}
