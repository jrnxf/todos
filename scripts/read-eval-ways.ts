// The ways `bun run eval:read` reads a title, and what each one sends and
// makes of the reply. Nothing here sends anything: the requests are built
// and the replies read as plain data, so both can be tested against the
// shapes the providers document.
//
// Every fact about a provider below (endpoint, model, request and reply
// shape, limits, price) comes from where `checked` says, at the addresses
// given beside it.
import { JEV_VERSION, answersIn as wellFormed } from '@/lib/verify'
import { JEV_ENDPOINT } from '@/server/jev-read'
import type { Answers, Column } from './read-eval-verify'

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
    model: JEV_VERSION,
    endpoint: JEV_ENDPOINT,
    env: ['TYPESAFE_API_KEY'],
    usdPerMInput: 0.042,
    usdPerMOutput: 0,
    notes:
      'A decision model: typed questions in, a probability per option out. At most 255 options a choice. Output is not charged. The version is named, as the app names it, so that its cut-offs stay those of one model.',
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
} as const satisfies Record<string, Provider>
export type ProviderId = keyof typeof PROVIDERS

// ── Ways ────────────────────────────────────────────────────────────────────

export interface Way {
  id: string
  name: string
  /**
   * `rules`: nothing is sent. The rest are readings of a decision model's
   * reply (scripts/read-eval-verify.ts): `verify` is the app's way, `who`
   * and `title` each add one more check to it, and `both` adds the two.
   */
  kind: 'rules' | Column
  provider?: ProviderId
  about: string
}

const VERIFY =
  'the rules read first and write the title; the model picks the tag from described options where the rules found none, and can take back a date the rules read from words that are part of a name. It never writes a date, a time or a title'
const WHO =
  'it is also asked, of each household name in the title, whether that person is the one to do it: a no takes back a person the rules read, a yes fills one where they read none'
const TITLE =
  'it is also asked, of each phrase the rules took out of the title to say who, ask for a reminder or stress it, whether the phrase is part of the task: a yes puts it back'
/** The decision models asked, in the report's order. */
export const DECISION_PROVIDERS = ['jev', 'clef'] as const
export type DecisionProvider = (typeof DECISION_PROVIDERS)[number]
/** The id of a decision model's column. */
export const columnWay = (provider: DecisionProvider, column: Column) =>
  `${column}:${provider}`
/**
 * The columns read out of each model's reply. Jev is the one being asked
 * whether more should be checked; Clef is there to compare the app's way.
 */
export const COLUMNS: Record<DecisionProvider, ReadonlyArray<Column>> = {
  jev: ['verify', 'who', 'title', 'both'],
  clef: ['verify'],
}

/** Every way, in the order the report shows them. */
export const WAYS: Array<Way> = [
  {
    id: 'rules',
    name: 'Rules alone',
    kind: 'rules',
    about: 'the rules in the page, and nothing sent',
  },
  {
    id: columnWay('jev', 'verify'),
    name: 'Verify, Jev',
    kind: 'verify',
    provider: 'jev',
    about: `what the app does, by the app's own code and at the app's own cut-offs: ${VERIFY}`,
  },
  {
    id: columnWay('jev', 'who'),
    name: 'Verify + who, Jev',
    kind: 'who',
    provider: 'jev',
    about: `test only. The app's way, and ${WHO}`,
  },
  {
    id: columnWay('jev', 'title'),
    name: 'Verify + title, Jev',
    kind: 'title',
    provider: 'jev',
    about: `test only. The app's way, and ${TITLE}`,
  },
  {
    id: columnWay('jev', 'both'),
    name: 'Verify + who + title, Jev',
    kind: 'both',
    provider: 'jev',
    about: 'test only. The app’s way with both of those checks',
  },
  {
    id: columnWay('clef', 'verify'),
    name: 'Verify, Clef',
    kind: 'verify',
    provider: 'clef',
    about: `for comparison, the app's request sent to Clef instead, at cut-offs chosen for Clef: ${VERIFY}`,
  },
]

/** The variables of `provider` that `env` does not set. */
export function missing(
  provider: ProviderId,
  env: Record<string, string | undefined>,
): Array<string> {
  return PROVIDERS[provider].env.filter((name) => !env[name])
}

// ── Decision models: Jev, Clef ──────────────────────────────────────────────

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

/**
 * The request a decision provider is sent for a System One body. Jev takes
 * it as it is, model and all; Clef takes it under its own model's name.
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
  return {
    url: (env.CLOUDFLARE_API_URL || PROVIDERS.clef.endpoint).replace(
      '{account}',
      encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? ''),
    ),
    headers: { ...json, Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body: JSON.stringify({ ...questions, model: 'clef' }),
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
 * A decision provider's reply as raw answers: each pick with the odds of
 * every option, each yes or no as the odds of a yes. An answer that is not
 * well formed is left out, which every column reads as no answer. It is read
 * by the app's own code (src/lib/verify.ts).
 */
export function decisionAnswers(
  provider: DecisionProvider,
  reply: unknown,
): Reply<Answers> {
  // Workers AI wraps a model's reply in `result`.
  const outer = object(reply)
  const body = provider === 'clef' ? object(outer.result ?? outer) : outer
  const usage = object(body.usage)
  return {
    read: wellFormed(body),
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    model: typeof body.model === 'string' ? body.model : '',
  }
}
