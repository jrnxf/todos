// Optional, and no part of the app: a Worker of its own that times Clef and
// Clef Flash from inside Cloudflare, through the AI binding the app would
// use. `bun run eval:read` can only reach them over the public REST API from
// a laptop, which is not what a Worker sees. README.md beside this file says
// how to put it up, ask it once and take it down again.
//
// Asked with the key it was put up with, it sends the same request to each
// model `n` times back to back, then `spaced` times with ten seconds between
// (as a household types: now and then, not in a stream), and answers with
// how long each took. Nothing is stored and nothing else is called.
import { REQUEST } from './request'

interface Env {
  AI: { run: (model: string, input: unknown) => Promise<unknown> }
  /** Set when it is put up; without it every request is refused. */
  KEY?: string
}

const MODELS = [
  { id: '@cf/cloudflare/clef', model: 'clef' },
  { id: '@cf/cloudflare/clef-flash', model: 'clef-flash' },
] as const
/** A Worker on the free plan may make 50 calls a request: stay under it. */
const MOST_CALLS = 44
const GAP_MS = 10_000

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
const whole = (value: string | null, otherwise: number) => {
  const n = Number(value ?? otherwise)
  return Number.isInteger(n) && n >= 0 ? n : otherwise
}

function spread(delays: Array<number>) {
  const sorted = [...delays].sort((a, b) => a - b)
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
  return sorted.length === 0
    ? null
    : {
        median_ms: at(0.5),
        nine_in_ten_ms: at(0.9),
        slowest_ms: sorted[sorted.length - 1],
      }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!env.KEY || url.searchParams.get('key') !== env.KEY)
      return new Response('Not found', { status: 404 })
    const n = whole(url.searchParams.get('n'), 15)
    const spaced = whole(url.searchParams.get('spaced'), 4)
    if (MODELS.length * (n + spaced) > MOST_CALLS)
      return Response.json(
        { error: `n + spaced can be ${MOST_CALLS / MODELS.length} at most` },
        { status: 400 },
      )

    // The clock in a Worker stands still but for input and output, which is
    // all that is timed here.
    const time = async (one: (typeof MODELS)[number]) => {
      const started = Date.now()
      try {
        await env.AI.run(one.id, { ...REQUEST, model: one.model })
        return { ms: Date.now() - started, failed: null }
      } catch (error) {
        return { ms: Date.now() - started, failed: String(error) }
      }
    }
    const results: Record<string, unknown> = {}
    const runs = { back_to_back: [n, 0], ten_seconds_apart: [spaced, GAP_MS] }
    for (const one of MODELS) {
      const passes: Record<string, unknown> = {}
      for (const [name, [times, gap]] of Object.entries(runs)) {
        const took: Array<{ ms: number; failed: string | null }> = []
        for (let turn = 0; turn < times; turn++) {
          if (gap > 0) await wait(gap)
          took.push(await time(one))
        }
        const answered = took.filter((each) => each.failed === null)
        passes[name] = {
          ...spread(answered.map((each) => each.ms)),
          each_ms: took.map((each) => each.ms),
          failed: took.flatMap((each) => each.failed ?? []),
        }
      }
      results[one.id] = passes
    }
    return Response.json({
      asked_from: request.cf?.colo ?? null,
      request_characters: JSON.stringify(REQUEST).length,
      results,
    })
  },
}
