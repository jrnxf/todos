// Stand-ins for every service `bun run eval:read` can call, for trying the
// test without a key or a bill: `bun run eval:read --stand-in`. Each takes
// the request the test would send, refuses one that is not in the shape its
// provider documents, and answers in the shape that provider documents. The
// answers are the dullest there are: they agree with the rules. They say
// nothing about how well any service reads; they show that the requests are
// well formed, that the replies are understood, and what the report looks
// like.
import * as chrono from 'chrono-node'
import { readTitle } from '@/lib/read'
import { PROVIDERS } from './read-eval-ways'
import { QUESTIONS } from './read-eval-verify'
import type { ReadContext as Household } from '@/lib/read'
import type { SystemOne } from './read-eval-ways'

type Body = Record<string, unknown>

/**
 * A reply to any System One request that agrees with the rules, all of it
 * sure: `none` for the tag, a yes to the date being one, a yes for the
 * person the rules read and a no for anyone else, and a no to a phrase the
 * rules took out being part of the task. So a stand-in run reads as the
 * rules alone.
 */
function reply(request: SystemOne, household: Household) {
  const todo = (request.state as { todo?: unknown }).todo
  const rules = readTitle(
    chrono,
    typeof todo === 'string' ? todo : '',
    household,
  )
  const questions = request.questions as Record<
    string,
    { type: string; criteria?: Record<string, unknown> }
  >
  return {
    model: 'stand-in',
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type !== 'choice') {
          const person =
            household.people[Number(id.slice(QUESTIONS.who.length))]
          const yes = id.startsWith(QUESTIONS.who)
            ? person.id === rules.fields.assignee
            : !id.startsWith(QUESTIONS.title)
          return [id, { type: 'noul', noul: yes ? 0.99 : 0.01 }]
        }
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
function systemOne(body: Body, mostQuestions: number): SystemOne {
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
  return body as unknown as SystemOne
}

function clef(url: URL, body: Body, household: Household) {
  must(
    /\/accounts\/[^/]+\/ai\/run\/@cf\/cloudflare\/clef$/.test(url.pathname),
    `no such model at ${url.pathname}`,
  )
  must(body.model === 'clef', 'model must be "clef"')
  return {
    result: {
      ...reply(systemOne(body, 64), household),
      model: PROVIDERS.clef.model,
      usage: { input_tokens: tokens(body), output_tokens: 0 },
    },
    success: true,
    errors: [],
    messages: [],
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
          return Response.json({
            ...reply(systemOne(body, Infinity), household),
            usage: { input_tokens: tokens(body) },
          })
        }
        if (url.host === 'api.cloudflare.com') {
          must(bearer, 'no bearer token')
          return Response.json(clef(url, body, household))
        }
        return Response.json(
          { error: `no stand-in for ${url.href}` },
          { status: 404 },
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
