// What the test sends each provider and what it makes of the reply. No key
// is at hand, so these stand in for the services: the requests are held to
// the shapes the providers document (scripts/read-eval-stand-in.ts refuses
// anything else, as the service would), and the replies are the documented
// ones.
import { describe, expect, it } from 'vitest'
import { jevRequest } from '@/server/jev-read'
import { HOUSEHOLD } from './read-eval-cases'
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
  missing,
} from './read-eval-ways'

const TITLE = 'Sam: dentist fri 5pm'
const ASK = ['when', 'tag', 'headsUp', 'flag'] as const
const questions = jevRequest(TITLE, HOUSEHOLD, ASK, false)
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
const HEALTH = HOUSEHOLD.tags.find((one) => one.name === 'Health')?.id

describe('the ways', () => {
  it('are the rules, the old usage, three columns a decision model and two general models', () => {
    expect(WAYS.map((way) => [way.id, way.kind, way.provider])).toEqual([
      ['rules', 'rules', undefined],
      ['first', 'first', 'jev'],
      ['verify:jev', 'verify', 'jev'],
      ['tag:jev', 'tag', 'jev'],
      ['parts:jev', 'parts', 'jev'],
      ['verify:clef', 'verify', 'clef'],
      ['tag:clef', 'tag', 'clef'],
      ['parts:clef', 'parts', 'clef'],
      ['verify:clefFlash', 'verify', 'clefFlash'],
      ['tag:clefFlash', 'tag', 'clefFlash'],
      ['parts:clefFlash', 'parts', 'clefFlash'],
      ['verify:openai', 'verify', 'openai'],
      ['tag:openai', 'tag', 'openai'],
      ['parts:openai', 'parts', 'openai'],
      ['haiku', 'model', 'haiku'],
      ['gemini', 'model', 'gemini'],
    ])
  })

  it('need one key each, and Cloudflare its account as well', () => {
    expect(missing('haiku', {})).toEqual(['ANTHROPIC_API_KEY'])
    expect(missing('haiku', { ANTHROPIC_API_KEY: 'k' })).toEqual([])
    expect(missing('clef', { CLOUDFLARE_API_TOKEN: 'k' })).toEqual([
      'CLOUDFLARE_ACCOUNT_ID',
    ])
    // An empty setting is not a key.
    expect(missing('openai', { OPENAI_API_KEY: '' })).toEqual([
      'OPENAI_API_KEY',
    ])
    expect(Object.keys(STAND_IN_ENV).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'GEMINI_API_KEY',
      'OPENAI_API_KEY',
      'TYPESAFE_API_KEY',
    ])
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
    expect(decisionReply('jev', reply, TITLE, HOUSEHOLD, ASK)).toMatchObject({
      read: { when: { dueDate: '2026-10-16', dueTime: '17:00' } },
      model: 'jev-stand-in',
    })
  })

  it.each([
    ['clef', 'clef', '@cf/cloudflare/clef'],
    ['clefFlash', 'clef-flash', '@cf/cloudflare/clef-flash'],
  ] as const)(
    '%s is sent them with its model, at the account’s address',
    async (provider, model, id) => {
      const call = decisionCall(provider, questions, {
        CLOUDFLARE_API_TOKEN: 'k',
        CLOUDFLARE_ACCOUNT_ID: 'acct 1',
      })
      expect(call.url).toBe(
        `https://api.cloudflare.com/client/v4/accounts/acct%201/ai/run/${id}`,
      )
      expect(call.headers.Authorization).toBe('Bearer k')
      expect(JSON.parse(call.body)).toEqual({ ...questions, model })
      const { status, reply } = await post(call)
      expect(status).toBe(200)
      const read = decisionReply(provider, reply, TITLE, HOUSEHOLD, ASK)
      expect(read).toMatchObject({
        read: { when: { dueDate: '2026-10-16', dueTime: '17:00' } },
        model: id,
        outputTokens: 0,
      })
      expect(read.inputTokens).toBeGreaterThan(0)
    },
  )

  it('Clef is read with or without the `result` Workers AI wraps it in', async () => {
    const env = { CLOUDFLARE_API_TOKEN: 'k', CLOUDFLARE_ACCOUNT_ID: 'a' }
    const { reply } = await post(decisionCall('clef', questions, env))
    const bare = (reply as { result: unknown }).result
    expect(decisionReply('clef', bare, TITLE, HOUSEHOLD, ASK)).toEqual(
      decisionReply('clef', reply, TITLE, HOUSEHOLD, ASK),
    )
  })

  it('OpenAI is sent them as predicates and choices of values', async () => {
    const call = decisionCall('openai', questions, { OPENAI_API_KEY: 'k' })
    expect(call.url).toBe('https://api.openai.com/v1/decisions')
    expect(call.headers.Authorization).toBe('Bearer k')
    const body = JSON.parse(call.body) as {
      model: string
      input: string
      questions: Array<{
        type: string
        name: string
        instructions: string
        choices?: Array<{ value: string; description: string }>
      }>
    }
    expect(body.model).toBe('gpt-6-luna')
    expect(JSON.parse(body.input)).toEqual(questions.state)
    expect(body.questions.map((one) => [one.name, one.type])).toEqual([
      ['date', 'choice'],
      ['time', 'choice'],
      ['area', 'choice'],
      ['alert', 'choice'],
      ['flag', 'predicate'],
    ])
    const tag = body.questions.find((one) => one.name === 'area')
    expect(tag?.choices).toContainEqual({
      value: `area_${HEALTH}`,
      description: 'Health',
    })
    // Every choice within the documented 2 to 255.
    for (const one of body.questions.filter((q) => q.type === 'choice')) {
      expect(one.choices?.length).toBeGreaterThanOrEqual(2)
      expect(one.choices?.length).toBeLessThanOrEqual(255)
    }
    expect(body.questions.at(-1)?.instructions).toMatch(/ Yes: .+ No: .+/)

    const { status, reply } = await post(call)
    expect(status).toBe(200)
    expect(decisionReply('openai', reply, TITLE, HOUSEHOLD, ASK)).toMatchObject(
      {
        read: { when: { dueDate: '2026-10-16', dueTime: '17:00' } },
        model: 'gpt-6-luna',
        outputTokens: 0,
      },
    )
  })

  it('reads OpenAI’s documented reply, and a refusal as no answer', () => {
    const reply = {
      model: 'gpt-6-luna',
      answers: [
        {
          type: 'choice',
          name: 'area',
          choice: `area_${HEALTH}`,
          probabilities: [
            { value: `area_${HEALTH}`, probability: 0.95 },
            { value: 'none', probability: 0.05 },
          ],
          confidence: 0.93,
        },
        { type: 'predicate', name: 'flag', probability: 0.92 },
        { type: 'refusal', name: 'date' },
      ],
      usage: { input_tokens: 42, output_tokens: 0, total_tokens: 42 },
    }
    expect(decisionReply('openai', reply, TITLE, HOUSEHOLD, ASK)).toEqual({
      read: { tag: HEALTH, flag: true, drops: [] },
      inputTokens: 42,
      outputTokens: 0,
      model: 'gpt-6-luna',
    })
  })

  it('makes nothing of a reply that is not one', () => {
    for (const reply of [null, 'oops', { error: 'x' }, { answers: 3 }])
      expect(decisionReply('openai', reply, TITLE, HOUSEHOLD, ASK).read).toBe(
        null,
      )
    expect(decisionReply('clef', {}, TITLE, HOUSEHOLD, ASK)).toEqual({
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
    const open = decisionCall('openai', questions, STAND_IN_ENV)
    expect(
      (await post({ ...open, headers: { 'Content-Type': 'application/json' } }))
        .status,
    ).toBe(400)
  })
})

describe('a fast general model', () => {
  const good = {
    title: 'dentist',
    due_date: '2026-10-16',
    due_time: '17:00',
    person: 'Sam',
    area: 'Health',
    reminder_days: [7, 1, 7],
    must_not_miss: false,
  }

  it('is asked for every field, each one that can be empty nullable', () => {
    const schema = fastSchema(HOUSEHOLD)
    expect(schema.required).toEqual(Object.keys(schema.properties))
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.person.anyOf).toEqual([
      { type: 'string', enum: ['Michelle', 'Sam'] },
      { type: 'null' },
    ])
    expect(schema.properties.area.anyOf[0]).toMatchObject({
      enum: HOUSEHOLD.tags.map((one) => one.name),
    })
    // Nothing structured output refuses: no bounds on numbers or strings.
    expect(JSON.stringify(schema)).not.toMatch(
      /minimum|maximum|minLength|maxLength|pattern/,
    )
  })

  it('is told the day, who is typing and the areas', () => {
    const told = fastInstructions(HOUSEHOLD)
    expect(told).toContain('Today is Tuesday, 2026-10-13.')
    expect(told).toContain('Michelle and Sam; Sam is typing')
    expect(told).toContain('House, Yard, Kids, Paperwork, Car, Health, Pets')
  })

  it('reads a good reply into the fields, by name', () => {
    expect(fastRead(JSON.stringify(good), HOUSEHOLD)).toEqual({
      title: 'dentist',
      fields: {
        dueDate: '2026-10-16',
        dueTime: '17:00',
        assignee: 'sam',
        tagId: HEALTH,
        headsUpDays: [1, 7],
      },
      phrases: {},
      guessed: {},
    })
    expect(
      fastRead(
        JSON.stringify({
          title: 'Call back',
          due_date: null,
          due_time: null,
          person: null,
          area: null,
          reminder_days: [],
          must_not_miss: true,
        }),
        HOUSEHOLD,
      ),
    ).toMatchObject({
      title: 'Call back',
      fields: { headsUpDays: [], mustNotMiss: true },
    })
  })

  it.each([
    ['not JSON', 'Sure! Here is the to-do'],
    ['no title', JSON.stringify({ ...good, title: ' ' })],
    [
      'a day that is not one',
      JSON.stringify({ ...good, due_date: '2026-02-30' }),
    ],
    ['a time that is not one', JSON.stringify({ ...good, due_time: '5pm' })],
    ['a time and no day', JSON.stringify({ ...good, due_date: null })],
    ['a stranger', JSON.stringify({ ...good, person: 'Alex' })],
    ['an area we do not have', JSON.stringify({ ...good, area: 'Errands' })],
    ['a heads-up of no days', JSON.stringify({ ...good, reminder_days: [0] })],
    ['a missing flag', JSON.stringify({ ...good, must_not_miss: undefined })],
  ])('makes nothing of a bad reply: %s', (_why, json) => {
    expect(fastRead(json, HOUSEHOLD)).toBe(null)
  })

  it('Gemini is sent the schema as a text response format', async () => {
    const call = geminiCall(TITLE, HOUSEHOLD, { GEMINI_API_KEY: 'k' })
    expect(call.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    )
    expect(call.headers['x-goog-api-key']).toBe('k')
    expect(JSON.parse(call.body)).toEqual({
      model: 'gemini-3.1-flash-lite',
      system_instruction: fastInstructions(HOUSEHOLD),
      input: TITLE,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: fastSchema(HOUSEHOLD),
      },
      generation_config: { thinking_level: 'minimal' },
      store: false,
    })
    const { status, reply } = await post(call)
    expect(status).toBe(200)
    const read = geminiReply(reply)
    expect(fastRead(read.text, HOUSEHOLD)).toMatchObject({
      title: 'dentist',
      fields: { assignee: 'sam', dueDate: '2026-10-16', dueTime: '17:00' },
    })
    expect(read.model).toBe('gemini-3.1-flash-lite')
  })

  it('reads Gemini’s documented reply, thinking counted as output', () => {
    expect(
      geminiReply({
        id: 'v1_x',
        model: 'gemini-3.1-flash-lite',
        object: 'interaction',
        status: 'completed',
        steps: [
          { type: 'thought', content: [{ type: 'text', text: 'hm' }] },
          {
            type: 'model_output',
            content: [
              { type: 'text', text: '{"title":' },
              { type: 'text', text: '"x"}' },
            ],
          },
        ],
        usage: {
          total_input_tokens: 700,
          total_output_tokens: 20,
          total_thought_tokens: 22,
          total_tokens: 742,
        },
      }),
    ).toEqual({
      text: '{"title":"x"}',
      inputTokens: 700,
      outputTokens: 42,
      model: 'gemini-3.1-flash-lite',
    })
    expect(geminiReply({ error: { code: 400 } })).toEqual({
      text: '',
      inputTokens: null,
      outputTokens: null,
      model: '',
    })
  })

  it('Haiku is priced in and out, and the rest for input alone', () => {
    expect(PROVIDERS.haiku).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      usdPerMInput: 1,
      usdPerMOutput: 5,
    })
    for (const id of ['jev', 'clef', 'clefFlash', 'openai'] as const)
      expect(PROVIDERS[id].usdPerMOutput).toBe(0)
  })
})
