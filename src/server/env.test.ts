import { afterEach, describe, expect, it, vi } from 'vitest'

const bindings: Record<string, string | undefined> = {}
vi.mock('cloudflare:workers', () => ({ env: bindings }))

async function load(values: Record<string, string>) {
  for (const key of Object.keys(bindings)) delete bindings[key]
  Object.assign(bindings, values)
  vi.resetModules()
  return (await import('./env')).env
}

const google = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
}

describe('CALENDAR_TOKEN_KEY', () => {
  afterEach(() => vi.restoreAllMocks())

  it('turns calendars on when it is long enough', async () => {
    const env = await load({ ...google, CALENDAR_TOKEN_KEY: 'k'.repeat(32) })
    expect(env.calendar.enabled).toBe(true)
  })

  it('leaves calendars off, and the app up, when it is too short', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = await load({ ...google, CALENDAR_TOKEN_KEY: 'too-short' })
    expect(env.calendar.enabled).toBe(false)
    expect(env.calendar.tokenKey).toBe('')
    expect(env.timeZone).toBe('UTC')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('CALENDAR_TOKEN_KEY')
    expect(log.mock.calls[0][0]).toContain('32 characters')
    expect(log.mock.calls[0][0]).not.toContain('too-short')
  })
})
