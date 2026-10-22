import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, hotkeyOf, typingIn } from './hotkeys'

const press = (key: string, held: Partial<KeyboardEvent> = {}) =>
  hotkeyOf({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...held,
  })

describe('hotkeyOf', () => {
  it('maps each letter to its shortcut', () => {
    expect(press('n')).toBe('add')
    expect(press('c')).toBe('calendar')
    expect(press('d')).toBe('day')
    expect(press('w')).toBe('week')
    expect(press('m')).toBe('month')
    expect(press('t')).toBe('today')
    expect(press('l')).toBe('lists')
    expect(press('a')).toBe('account')
  })

  it('takes Caps Lock letters as the same keys', () => {
    expect(press('D')).toBe('day')
  })

  it('opens the shortcuts on ?, which takes Shift to type', () => {
    expect(press('?', { shiftKey: true })).toBe('help')
    expect(press('?')).toBe('help')
  })

  it('leaves Cmd, Ctrl and Alt to the browser', () => {
    for (const held of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(press('d', { [held]: true })).toBeNull()
      expect(press('?', { [held]: true, shiftKey: true })).toBeNull()
    }
  })

  it('ignores Shift with a letter', () => {
    expect(press('N', { shiftKey: true })).toBeNull()
  })

  it('ignores every other key', () => {
    for (const key of ['x', 'Enter', 'Escape', 'ArrowLeft', '/', ' ']) {
      expect(press(key)).toBeNull()
    }
  })
})

describe('typingIn', () => {
  it('is true in a text box', () => {
    expect(typingIn({ tagName: 'INPUT' })).toBe(true)
    expect(typingIn({ tagName: 'TEXTAREA' })).toBe(true)
    expect(typingIn({ tagName: 'SELECT' })).toBe(true)
    expect(typingIn({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false on the page and on buttons', () => {
    expect(typingIn(null)).toBe(false)
    expect(typingIn({ tagName: 'BODY' })).toBe(false)
    expect(typingIn({ tagName: 'BUTTON' })).toBe(false)
  })
})

describe('SHORTCUT_GROUPS', () => {
  it('lists every single-key shortcut', () => {
    const listed = SHORTCUT_GROUPS.flatMap((group) =>
      group.keys.flatMap((row) => row.keys),
    )
    for (const key of ['N', '?', 'C', 'D', 'W', 'M', 'T', 'L', 'A']) {
      expect(listed).toContain(key)
      expect(press(key === '?' ? key : key.toLowerCase())).not.toBeNull()
    }
  })
})
