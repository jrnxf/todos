// What the test sends each provider and what it makes of the reply. No key
// is at hand, so these stand in for the services: the requests are held to
// the shapes the providers document (scripts/read-eval-stand-in.ts refuses
// anything else, as the service would), and the replies are the documented
// ones.
import { describe, expect, it } from 'vitest'
import { HOUSEHOLD } from './read-eval-cases'
import { STAND_IN_ENV, standInFetch } from './read-eval-stand-in'
import { verifyRequest } from './read-eval-verify'
import {
  COLUMNS,
  PROVIDERS,
  WAYS,
  decisionAnswers,
  decisionCall,
  missing,
} from './read-eval-ways'

const TITLE = 'Sam: dentist fri 5pm'
const { request: questions } = verifyRequest(TITLE, HOUSEHOLD)
if (!questions) throw new Error('nothing to ask')
/** What the stand-in says: it agrees with the rules. */
const answered = {
  when: { noul: 0.99 },
  who_1: { noul: 0.99 },
  title_who: { noul: 0.01 },
}
const send = standInFetch(HOUSEHOLD)
const post = async (call: { url: string; headers: object; body: string }) => {
  const response = await send(call.url, {
    method: 'POST',
    headers: call.headers as Record<string, string>,
    body: call.body,
  })
  const reply: unknown = await response.json()
  return { status: response.status, reply }
}

describe('the ways', () => {
  it('are the rules, the app’s way with Jev, three wider ways with Jev, and the app’s way with Clef', () => {
    expect(WAYS.map((way) => [way.id, way.kind, way.provider])).toEqual([
      ['rules', 'rules', undefined],
      ['verify:jev', 'verify', 'jev'],
      ['who:jev', 'who', 'jev'],
      ['title:jev', 'title', 'jev'],
      ['both:jev', 'both', 'jev'],
      ['verify:clef', 'verify', 'clef'],
    ])
    expect(COLUMNS).toEqual({
      jev: ['verify', 'who', 'title', 'both'],
      clef: ['verify'],
    })
  })

  it('need one key each, and Cloudflare its account as well', () => {
    expect(missing('jev', {})).toEqual(['TYPESAFE_API_KEY'])
    expect(missing('jev', { TYPESAFE_API_KEY: 'k' })).toEqual([])
    expect(missing('clef', { CLOUDFLARE_API_TOKEN: 'k' })).toEqual([
      'CLOUDFLARE_ACCOUNT_ID',
    ])
    // An empty setting is not a key.
    expect(missing('jev', { TYPESAFE_API_KEY: '' })).toEqual([
      'TYPESAFE_API_KEY',
    ])
    expect(Object.keys(STAND_IN_ENV).sort()).toEqual([
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'TYPESAFE_API_KEY',
    ])
  })

  it('ask Jev for the version the app asks for', () => {
    expect(PROVIDERS.jev.model).toBe(questions.model)
  })
})

describe('a decision model', () => {
  it('Jev is sent the questions as they are', async () => {
    const call = decisionCall('jev', questions, { TYPESAFE_API_KEY: 'k' })
    expect(call.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(call.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(call.body)).toEqual(questions)
    const { status, reply } = await post(call)
    expect(status).toBe(200)
    const read = decisionAnswers('jev', reply)
    expect(read).toMatchObject({ read: answered, model: 'stand-in' })
    expect(read.inputTokens).toBeGreaterThan(0)
  })

  it('Clef is sent them with its model, at the account’s address', async () => {
    const call = decisionCall('clef', questions, {
      CLOUDFLARE_API_TOKEN: 'k',
      CLOUDFLARE_ACCOUNT_ID: 'acct 1',
    })
    expect(call.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct%201/ai/run/@cf/cloudflare/clef',
    )
    expect(call.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(call.body)).toEqual({ ...questions, model: 'clef' })
    const { status, reply } = await post(call)
    expect(status).toBe(200)
    const read = decisionAnswers('clef', reply)
    expect(read).toMatchObject({
      read: answered,
      model: '@cf/cloudflare/clef',
      outputTokens: 0,
    })
    expect(read.inputTokens).toBeGreaterThan(0)
  })

  it('Clef is read with or without the `result` Workers AI wraps it in', async () => {
    const env = { CLOUDFLARE_API_TOKEN: 'k', CLOUDFLARE_ACCOUNT_ID: 'a' }
    const { reply } = await post(decisionCall('clef', questions, env))
    const bare = (reply as { result: unknown }).result
    expect(decisionAnswers('clef', bare)).toEqual(
      decisionAnswers('clef', reply),
    )
  })

  it('makes nothing of a reply that is not one', () => {
    for (const reply of [null, 'oops', { error: 'x' }, { answers: 3 }])
      expect(decisionAnswers('jev', reply).read).toBe(null)
    expect(decisionAnswers('clef', {})).toEqual({
      read: null,
      inputTokens: null,
      outputTokens: null,
      model: '',
    })
  })

  it('is refused by the stand-in when the request is out of shape', async () => {
    const call = decisionCall('clef', questions, STAND_IN_ENV)
    const wrong = {
      ...call,
      body: JSON.stringify({ ...questions, model: 'x' }),
    }
    expect((await post(wrong)).status).toBe(400)
    const jev = decisionCall('jev', questions, STAND_IN_ENV)
    expect(
      (await post({ ...jev, headers: { 'Content-Type': 'application/json' } }))
        .status,
    ).toBe(400)
    expect(
      (await post({ ...jev, body: JSON.stringify({ state: {} }) })).status,
    ).toBe(400)
    expect(
      (await post({ ...jev, url: 'https://example.com/v1/systemone' })).status,
    ).toBe(404)
  })
})
