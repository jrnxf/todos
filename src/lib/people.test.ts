import { describe, expect, it } from 'vitest'
import { withPictures } from './people'

const people = [
  { id: 'alex', name: 'Alex', initial: 'A' },
  { id: 'sam', name: 'Sam', initial: 'S' },
]
const emails: Record<string, string> = {
  alex: 'alex@example.com',
  sam: 'Sam@Example.com',
}
const emailFor = (id: string) => emails[id] ?? null

describe('withPictures', () => {
  it('gives every household member the picture of their own account', () => {
    const shown = withPictures(
      people,
      [
        { email: 'sam@example.com', image: 'https://lh3.example/sam' },
        { email: 'alex@example.com', image: 'https://lh3.example/alex' },
      ],
      emailFor,
    )
    expect(shown.map((p) => [p.id, p.image])).toEqual([
      ['alex', 'https://lh3.example/alex'],
      ['sam', 'https://lh3.example/sam'],
    ])
  })

  it('leaves the picture null for someone who has not signed in, or has none', () => {
    const shown = withPictures(
      people,
      [{ email: 'alex@example.com', image: null }],
      emailFor,
    )
    expect(shown.map((p) => p.image)).toEqual([null, null])
  })

  it('ignores a link that is not https', () => {
    const shown = withPictures(
      people,
      [
        { email: 'alex@example.com', image: 'javascript:alert(1)' },
        { email: 'sam@example.com', image: 'not a url' },
      ],
      emailFor,
    )
    expect(shown.map((p) => p.image)).toEqual([null, null])
  })

  it('keeps a person with no listed address', () => {
    const shown = withPictures(
      people,
      [{ email: 'alex@example.com', image: 'https://lh3.example/alex' }],
      () => null,
    )
    expect(shown.map((p) => p.image)).toEqual([null, null])
  })
})
