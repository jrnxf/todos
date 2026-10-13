// Stand-ins for every service `bun run eval:read` can call, for trying the
// test without a key or a bill: `bun run eval:read --stand-in`. Each takes
// the request the test would send, refuses one that is not in the shape its
// provider documents, and answers in the shape that provider documents. The
// answers are crude: the dullest there is for the decision models, and the
// rules' own reading for the general ones. They say nothing about how well any
// service reads; they show that the requests are well formed, that the
// replies are understood, and what the report looks like.
import * as chrono from 'chrono-node'
import { readTitle } from '@/lib/read'
import { PROVIDERS } from './read-eval-ways'
import type { ReadContext as Household } from '@/lib/read'
import type { VerifyRequest } from '@/lib/verify'

type Body = Record<string, unknown>
type Questions = VerifyRequest

/**
 * A reply to any System One request, the dullest there is: `none` where it
 * is offered and the first option where it is not, a yes to every yes or no,
 * all of it sure. So a stand-in run of the documented usage reads as the
 * rules alone.
 */
function reply(request: Questions) {
  const questions = request.questions as Record<
    string,
    { type: string; criteria?: Record<string, unknown> }
  >
  return {
    model: 'stand-in',
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type !== 'choice') return [id, { type: 'noul', noul: 0.9 }]
        const options = Object.keys(question.criteria ?? {})
        const choice = options.includes('none') ? 'none' : options[0]
        const rest = 0.1 / Math.max(1, options.length - 1)
        return [
          id,
          {
            type: 'choice',
            choice,
            probabilities: Object.fromEntries(
              options.map((option) => [option, option === choice ? 0.9 : rest]),
            ),
          },
        ]
      }),
    ),
  }
}

/** What stands in for every key, so a real one is never read or sent. */
export const STAND_IN_ENV: Record<string, string> = Object.fromEntries(
  Object.values(PROVIDERS).flatMap((provider) =>
    provider.env.map((name) => [name, 'stand-in']),
  ),
)

class Refused extends Error {}
function must(condition: unknown, why: string): asserts condition {
  if (!condition) throw new Refused(why)
}
const tokens = (body: unknown) => Math.ceil(JSON.stringify(body).length / 4)

/** A System One request (Jev's, and Clef's), checked against its limits. */
function systemOne(body: Body, mostQuestions: number): Questions {
  must(body.state !== undefined, 'state is required')
  must(body.questions && typeof body.questions === 'object', 'no questions')
  const questions = Object.entries(body.questions as Record<string, Body>)
  must(
    questions.length >= 1 && questions.length <= mostQuestions,
    `1 to ${mostQuestions} questions`,
  )
  for (const [id, question] of questions) {
    must(/^[\w.-]{1,100}$/.test(id), `question id ${id}`)
    must(question.instructions, `${id}: instructions are required`)
    if (question.type === 'choice') {
      const options = Object.keys(question.criteria ?? {}).length
      must(options >= 2 && options <= 255, `${id}: 2 to 255 options`)
    } else must(question.type === 'noul', `${id}: type ${question.type}`)
  }
  return body as unknown as Questions
}

function clef(url: URL, body: Body) {
  const model =
    /\/accounts\/[^/]+\/ai\/run\/@cf\/cloudflare\/(clef|clef-flash)$/.exec(
      url.pathname,
    )?.[1]
  must(model, `no such model at ${url.pathname}`)
  must(body.model === model, `model must be "${model}"`)
  const answered = reply(systemOne(body, 64))
  return {
    result: {
      ...answered,
      model: `@cf/cloudflare/${model}`,
      usage: { input_tokens: tokens(body), output_tokens: 0 },
    },
    success: true,
    errors: [],
    messages: [],
  }
}

function openai(body: Body) {
  must(body.model === PROVIDERS.openai.model, `model ${body.model}`)
  must(typeof body.input === 'string', 'input must be text')
  must(Array.isArray(body.questions), 'questions must be an array')
  const asked = body.questions as Array<Body>
  const questions: Record<string, unknown> = {}
  for (const question of asked) {
    must(typeof question.name === 'string', 'a question needs a name')
    must(typeof question.instructions === 'string', 'instructions are text')
    if (question.type === 'choice') {
      must(Array.isArray(question.choices), `${question.name}: no choices`)
      const choices = question.choices as Array<Body>
      must(
        choices.length >= 2 && choices.length <= 255,
        `${question.name}: between 2 and 255 choices`,
      )
      must(
        new Set(choices.map((one) => one.value)).size === choices.length,
        `${question.name}: each choice must be unique`,
      )
      questions[question.name] = {
        type: 'choice',
        instructions: question.instructions,
        criteria: Object.fromEntries(
          choices.map((one) => [one.value, one.description ?? '']),
        ),
      }
    } else {
      must(question.type === 'predicate', `type ${question.type}`)
      questions[question.name] = {
        type: 'noul',
        instructions: question.instructions,
      }
    }
  }
  const answered = reply({
    state: JSON.parse(body.input),
    questions,
  } as unknown as Questions)
  const answers = answered.answers as Record<
    string,
    {
      type: string
      noul?: number
      choice?: string
      probabilities?: Record<string, number>
      confidence?: number
    }
  >
  return {
    model: PROVIDERS.openai.model,
    // In the order the questions were asked.
    answers: asked.map((question) => {
      const name = question.name as string
      const answer = answers[name]
      return answer.type === 'noul'
        ? { type: 'predicate', name, probability: answer.noul }
        : {
            type: 'choice',
            name,
            choice: answer.choice,
            probabilities: Object.entries(answer.probabilities ?? {}).map(
              ([value, probability]) => ({ value, probability }),
            ),
            confidence: answer.confidence,
          }
    }),
    usage: {
      input_tokens: tokens(body),
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: tokens(body),
    },
  }
}

/** What a general model would return, as the rules read the to-do. */
function structured(title: string, household: Household): string {
  const read = readTitle(chrono, title, household)
  return JSON.stringify({
    title: read.title,
    due_date: read.fields.dueDate ?? null,
    due_time: read.fields.dueTime ?? null,
    person:
      household.people.find((one) => one.id === read.fields.assignee)?.name ??
      null,
    area:
      household.tags.find((one) => one.id === read.fields.tagId)?.name ?? null,
    reminder_days: read.fields.headsUpDays ?? null,
    must_not_miss: read.fields.mustNotMiss === true,
  })
}

function schemaOf(format: unknown): Body {
  const schema = (format as Body | undefined)?.schema as Body | undefined
  must(schema?.type === 'object', 'the format needs a JSON schema')
  must(schema.additionalProperties === false, 'additionalProperties: false')
  return schema
}

function gemini(body: Body, household: Household) {
  must(body.model === PROVIDERS.gemini.model, `model ${body.model}`)
  must(typeof body.input === 'string', 'input must be text')
  const format = body.response_format as Body | undefined
  must(format?.type === 'text', 'response_format.type must be "text"')
  must(format.mime_type === 'application/json', 'mime_type')
  schemaOf(format)
  const text = structured(body.input, household)
  return {
    id: 'stand-in',
    object: 'interaction',
    model: PROVIDERS.gemini.model,
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
    usage: {
      total_input_tokens: tokens(body),
      total_output_tokens: tokens(text),
      total_thought_tokens: 0,
      total_tokens: tokens(body) + tokens(text),
    },
  }
}

function anthropic(body: Body, household: Household) {
  must(body.model === PROVIDERS.haiku.model, `model ${body.model}`)
  must(typeof body.max_tokens === 'number', 'max_tokens is required')
  const messages = body.messages as Array<Body> | undefined
  must(messages?.length === 1 && messages[0].role === 'user', 'one user turn')
  must(typeof messages[0].content === 'string', 'content must be text')
  const format = (body.output_config as Body | undefined)?.format as
    Body | undefined
  must(format?.type === 'json_schema', 'output_config.format.type')
  schemaOf(format)
  const text = structured(messages[0].content, household)
  return {
    id: 'msg_stand_in',
    type: 'message',
    role: 'assistant',
    model: PROVIDERS.haiku.model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: tokens(body), output_tokens: tokens(text) },
  }
}

/**
 * A `fetch` that never leaves this machine. A request to an address it does
 * not know, without the header its provider wants, or out of shape, is
 * answered with an error, as the service would.
 */
export function standInFetch(household: Household): typeof fetch {
  const answer = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const bearer = request.headers.get('authorization')?.startsWith('Bearer ')
    return request.text().then((sent) => {
      try {
        must(request.method === 'POST', 'POST only')
        const body = JSON.parse(sent) as Body
        if (url.href === PROVIDERS.jev.endpoint) {
          must(bearer, 'no bearer token')
          return Response.json(reply(systemOne(body, Infinity)))
        }
        if (url.host === 'api.cloudflare.com') {
          must(bearer, 'no bearer token')
          return Response.json(clef(url, body))
        }
        if (url.href === PROVIDERS.openai.endpoint) {
          must(bearer, 'no bearer token')
          return Response.json(openai(body))
        }
        if (url.href === PROVIDERS.gemini.endpoint) {
          must(request.headers.get('x-goog-api-key'), 'no x-goog-api-key')
          return Response.json(gemini(body, household))
        }
        if (url.href === PROVIDERS.haiku.endpoint) {
          must(request.headers.get('x-api-key'), 'no x-api-key')
          must(request.headers.get('anthropic-version'), 'no version header')
          return Response.json(anthropic(body, household))
        }
        return Response.json(
          { error: `no stand-in for ${url.href}` },
          {
            status: 404,
          },
        )
      } catch (error) {
        if (!(error instanceof Refused) && !(error instanceof SyntaxError))
          throw error
        return Response.json(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: error.message },
          },
          { status: 400 },
        )
      }
    })
  }
  return answer
}
