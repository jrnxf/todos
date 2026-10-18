import { describe, expect, it } from 'vitest'
import { hashToken, matchesHash, seal, unseal } from './seal'

const KEY = 'k'.repeat(32)

describe('sealed tokens', () => {
  it('open with the same key, for the same person', async () => {
    const sealed = await seal(KEY, 'refresh-token', 'alex')
    expect(sealed).not.toContain('refresh-token')
    expect(await unseal(KEY, sealed, 'alex')).toBe('refresh-token')
  })

  it('do not open with another key, for another person, or once changed', async () => {
    const sealed = await seal(KEY, 'refresh-token', 'alex')
    await expect(unseal('x'.repeat(32), sealed, 'alex')).rejects.toThrow()
    await expect(unseal(KEY, sealed, 'sam')).rejects.toThrow()
    const [version, iv, data] = sealed.split('.')
    const flipped = `${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`
    await expect(
      unseal(KEY, [version, iv, flipped].join('.'), 'alex'),
    ).rejects.toThrow()
  })

  it('match only their own hash', async () => {
    const hash = await hashToken('channel-token')
    expect(await matchesHash('channel-token', hash)).toBe(true)
    expect(await matchesHash('channel-tokeN', hash)).toBe(false)
    expect(await matchesHash('', hash)).toBe(false)
  })
})
