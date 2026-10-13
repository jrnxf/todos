// Jev's verdict comes from an outside service that may be slow, down, or
// wrong. Every one of those has to end in "no answer", with the rules'
// reading left standing: never a wrong fill, never a lost word, and never an
// error on the add bar. The service is stood in for (./jev-stand-in.ts):
// these have never called the real one.
import * as chrono from 'chrono-node'
import { describe, expect, it, vi } from 'vitest'
import { readTitle } from '@/lib/read'
import { JEV_VERSION, verifiedRead } from '@/lib/verify'
import { checkWithJev } from './jev-read'
import { standInReply } from './jev-stand-in'
import type { ReadContext } from '@/lib/read'

const HOUSE = 1
const YARD = 2
const household: ReadContext = {
  today: '2026-10-13', // a Tuesday
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: [
    { id: HOUSE, name: 'House' },
    { id: YARD, name: 'Yard' },
  ],
}
const NAMED = 'Order Taco Tuesday supplies'

const replying = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }))
/** The network, answered by the stand-in. */
const standIn = () =>
  vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(standInReply(JSON.parse(init?.body as string))),
  )
const rules = (title: string) => readTitle(chrono, title, household)
/** What the add bar ends up with: the rules' reading, checked. */
const checked = async (title: string, network: typeof fetch) =>
  verifiedRead(
    chrono,
    title,
    household,
    rules(title),
    await checkWithJev(title, household, { apiKey: 'k-123', fetch: network }),
  )

describe('asking Jev', () => {
  it('sends one request, to the pinned version, with the key as a bearer token', async () => {
    const network = standIn()
    await checkWithJev(NAMED, household, { apiKey: 'k-123', fetch: network })

    expect(network).toHaveBeenCalledOnce()
    const [url, init] = network.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer k-123',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init?.body as string)
    expect(body.model).toBe(JEV_VERSION)
    // All that leaves: the title, today, and the tags in the questions.
    expect(body.state).toEqual({ todo: NAMED, today: 'Tuesday, 2026-10-13' })
    expect(Object.keys(body.questions)).toEqual([
      'area',
      'area_reversed',
      'when',
    ])
    expect(JSON.stringify(body)).not.toMatch(/Alex|Sam/)
  })

  it('sends nothing without a key, a title, or anything left to judge', async () => {
    const network = standIn()
    const ask = (title: string, apiKey: string, context = household) =>
      checkWithJev(title, context, { apiKey, fetch: network })
    expect(await ask(NAMED, '')).toBeNull()
    expect(await ask('   ', 'k-123')).toBeNull()
    // The rules read the tag, and no date: nothing takes judgment.
    expect(await ask('Mow the lawn', 'k-123')).toBeNull()
    // Both set by hand.
    expect(
      await ask(NAMED, 'k-123', {
        ...household,
        skip: new Set(['tag', 'when']),
      }),
    ).toBeNull()
    expect(network).not.toHaveBeenCalled()
  })

  it('does not ask about a field set by hand or taken back', async () => {
    const network = standIn()
    await checkWithJev(
      NAMED,
      { ...household, skip: new Set(['tag']) },
      { apiKey: 'k-123', fetch: network },
    )
    const body = JSON.parse(network.mock.calls[0][1]?.body as string)
    expect(Object.keys(body.questions)).toEqual(['when'])
  })

  it('asks the stand-in at the address it is given', async () => {
    const network = standIn()
    await checkWithJev(NAMED, household, {
      apiKey: 'k-123',
      endpoint: 'http://127.0.0.1:9999/v1/systemone',
      fetch: network,
    })
    expect(network.mock.calls[0][0]).toBe('http://127.0.0.1:9999/v1/systemone')
  })
})

describe('a sure answer', () => {
  it('takes back a date that is part of a name, and its words go back', async () => {
    expect(rules(NAMED)).toMatchObject({
      title: 'Order Taco supplies',
      fields: { dueDate: '2026-10-20' },
    })
    const read = await checked(NAMED, standIn())
    expect(read.title).toBe(NAMED)
    expect(read.fields).toEqual({})
  })

  it('fills the tag where the rules read none', async () => {
    const read = await checked('Split the hostas', standIn())
    expect(read).toMatchObject({
      title: 'Split the hostas',
      fields: { tagId: YARD },
      guessed: { tag: '' },
    })
  })

  it('leaves a date that is one alone', async () => {
    const title = 'Call the bank friday'
    expect(await checked(title, standIn())).toEqual(rules(title))
  })
})

describe('the rules’ reading stands', () => {
  const stands = async (title: string, network: typeof fetch) =>
    expect(await checked(title, network)).toEqual(rules(title))

  it('when Jev is not sure enough', async () => {
    await stands('Order Taco Tuesday supplies unsure', standIn())
    await stands('Split the hostas unsure', standIn())
  })

  it('when the device is offline', async () => {
    await stands(
      NAMED,
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed')
      }),
    )
  })

  it('when the service answers with an error', async () => {
    await stands(NAMED, replying({ error: 'overloaded' }, 529))
  })

  it('when the reply is not JSON', async () => {
    await stands(
      NAMED,
      vi.fn<typeof fetch>(async () => new Response('<html>')),
    )
  })

  it('when the reply holds no answers, or answers that are not well formed', async () => {
    await stands(NAMED, replying({}))
    await stands(NAMED, replying({ answers: 'none' }))
    await stands(
      NAMED,
      replying({
        answers: {
          when: { type: 'noul', noul: 'low' },
          area: { type: 'choice', choice: 'Yard' },
          area_reversed: { type: 'choice', choice: 'Yard', probabilities: {} },
        },
      }),
    )
  })

  it('when the reply takes longer than the time limit', async () => {
    const slow = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )
    expect(
      await checkWithJev(NAMED, household, {
        apiKey: 'k-123',
        timeLimitMs: 20,
        fetch: slow,
      }),
    ).toBeNull()
  })

  it('when the two orders of the tag question disagree', async () => {
    const body = standInReply(
      JSON.parse(
        JSON.stringify({
          model: JEV_VERSION,
          state: { todo: 'Split the hostas', today: '' },
          questions: {
            area: { type: 'choice', criteria: { none: 0, Yard: 0, House: 0 } },
            area_reversed: {
              type: 'choice',
              criteria: { none: 0, Yard: 0, House: 0 },
            },
          },
        }),
      ),
    )
    await stands(
      'Split the hostas',
      replying({
        answers: {
          ...body.answers,
          area_reversed: {
            type: 'choice',
            choice: 'House',
            probabilities: { House: 0.95, Yard: 0.03, none: 0.02 },
          },
        },
      }),
    )
  })

  it('for a tag this household does not have', async () => {
    await stands(
      'Split the hostas',
      replying({
        answers: Object.fromEntries(
          ['area', 'area_reversed'].map((id) => [
            id,
            {
              type: 'choice',
              choice: 'Boat',
              probabilities: { Boat: 0.99, none: 0.01 },
            },
          ]),
        ),
      }),
    )
  })
})
