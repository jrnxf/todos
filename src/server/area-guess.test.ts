// The area guess talks to an outside service that may be slow, down, or
// wrong. Every one of those has to end in "no guess", never a wrong area and
// never an error on the add bar. The service is stood in for: these have
// never called the real one.
import { describe, expect, it, vi } from 'vitest'
import { AREA_FLOOR, areaFromAnswer, guessArea } from './area-guess'

const household = {
  people: [{ name: 'Alex' }, { name: 'Sam' }],
  areas: [
    { id: 1, name: 'House' },
    { id: 2, name: 'Kids' },
    { id: 7, name: 'Paperwork' },
  ],
}
const answer = (choice: string, probabilities: Record<string, number>) => ({
  model: 'jev-1.13.0',
  answers: { area: { type: 'choice', choice, probabilities, confidence: 0.9 } },
  usage: { input_tokens: 120, output_tokens: 8 },
})
const sure = answer('area_7', {
  area_1: 0.03,
  area_2: 0.02,
  area_7: 0.93,
  none: 0.02,
})
const replying = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }))

describe('asking for an area', () => {
  it('sends the title, the first names and the areas, with the key as a bearer token', async () => {
    const network = replying(sure)
    await guessArea('Pay property tax', household, {
      apiKey: 'k-123',
      fetch: network,
    })

    expect(network).toHaveBeenCalledOnce()
    const [url, init] = network.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer k-123',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'jev-latest',
      state: { todo: 'Pay property tax', people: ['Alex', 'Sam'] },
      questions: {
        area: {
          type: 'choice',
          instructions: expect.stringContaining('`none`'),
          criteria: {
            area_1: 'House',
            area_2: 'Kids',
            area_7: 'Paperwork',
            none: expect.any(String),
          },
        },
      },
    })
  })

  it('fills the area from a sure answer', async () => {
    expect(
      await guessArea('Pay property tax', household, {
        apiKey: 'k',
        fetch: replying(sure),
      }),
    ).toBe(7)
  })

  it('sends nothing without a key, a title or any areas', async () => {
    const network = replying(sure)
    expect(
      await guessArea('Pay tax', household, { apiKey: '', fetch: network }),
    ).toBeNull()
    expect(
      await guessArea('  ', household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
    expect(
      await guessArea(
        'Pay tax',
        { ...household, areas: [] },
        { apiKey: 'k', fetch: network },
      ),
    ).toBeNull()
    expect(network).not.toHaveBeenCalled()
  })
})

describe('no guess', () => {
  it.each([
    [
      'an answer under the floor',
      answer('area_7', { area_7: AREA_FLOOR - 0.01, none: 0.2 }),
    ],
    ['"none"', answer('none', { none: 0.95, area_7: 0.05 })],
    ['an area that is not ours', answer('area_99', { area_99: 0.99 })],
    [
      'an answer with no probabilities',
      { answers: { area: { choice: 'area_7' } } },
    ],
    [
      'a probability that is not a number',
      answer('area_7', { area_7: 'high' as unknown as number }),
    ],
    [
      'an answer to some other question',
      { answers: { rule: { choice: 'area_7' } } },
    ],
    ['an empty reply', null],
  ])('from %s', (_name, body) => {
    expect(areaFromAnswer(body, household)).toBeNull()
  })

  it.each([401, 422, 429, 500, 529])('from a %i reply', async (status) => {
    const network = replying(sure, status)
    expect(
      await guessArea('Pay tax', household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
  })

  it('when the device is offline', async () => {
    const network = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await guessArea('Pay tax', household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
  })

  it('when the reply is not JSON', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('<html>oops'))
    expect(
      await guessArea('Pay tax', household, { apiKey: 'k', fetch: network }),
    ).toBeNull()
  })

  it('when the reply takes longer than the time limit', async () => {
    // Answers only when its request is given up on, as a hung server would.
    const network = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          ),
        ),
    )
    const started = Date.now()
    expect(
      await guessArea('Pay tax', household, {
        apiKey: 'k',
        fetch: network,
        timeLimitMs: 30,
      }),
    ).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
