// A stored theme that is read wrongly silently shows the wrong colours, so the
// reading, and the boot script that applies it, get a few cases.
import { describe, expect, it } from 'vitest'
import { THEME_COLORS, THEME_KEY, parseTheme, themeBootScript } from './theme'

describe('a stored theme', () => {
  it('is light or dark only when it says exactly that', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })

  it('falls back to system for anything else', () => {
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme(undefined)).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('Dark')).toBe('system')
    expect(parseTheme('sepia')).toBe('system')
  })
})

// Runs the boot script against a minimal fake page.
function boot(stored: string | null, deviceDark: boolean, throws = false) {
  const classes = new Set<string>()
  let tags: Array<{ content: string; media?: string }> = []
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, on: boolean) =>
          on ? classes.add(name) : classes.delete(name),
      },
      style: {},
    },
    head: {
      appendChild: (tag: { content: string; media?: string }) => tags.push(tag),
    },
    querySelectorAll: () =>
      tags.map((tag) => ({
        remove: () => {
          tags = tags.filter((other) => other !== tag)
        },
      })),
    createElement: () => ({
      content: '',
      setAttribute() {},
    }),
  }
  const window = {
    matchMedia: () => ({ matches: deviceDark, addEventListener() {} }),
    addEventListener() {},
  }
  const localStorage = {
    getItem: (key: string) => {
      if (throws) throw new Error('blocked')
      return key === THEME_KEY ? stored : null
    },
  }
  new Function('window', 'document', 'localStorage', themeBootScript)(
    window,
    document,
    localStorage,
  )
  return {
    dark: classes.has('dark'),
    chrome: tags.map((tag) => tag.content),
  }
}

describe('the boot script', () => {
  it('follows the device when nothing is chosen', () => {
    const both = [THEME_COLORS.light, THEME_COLORS.dark]
    expect(boot(null, true)).toEqual({ dark: true, chrome: both })
    expect(boot(null, false)).toEqual({ dark: false, chrome: both })
  })

  it('lets a remembered choice win over the device', () => {
    expect(boot('light', true)).toEqual({
      dark: false,
      chrome: [THEME_COLORS.light],
    })
    expect(boot('dark', false)).toEqual({
      dark: true,
      chrome: [THEME_COLORS.dark],
    })
  })

  it('treats a junk value or blocked storage as system', () => {
    expect(boot('sepia', true).dark).toBe(true)
    expect(boot(null, true, true).dark).toBe(true)
    expect(boot(null, false, true).dark).toBe(false)
  })
})
