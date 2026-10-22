// The single-key shortcuts, kept apart from React so they can be tested on
// their own. One key each, never with Cmd, Ctrl or Alt held (those belong to
// the browser), and never while typing.

export type Hotkey =
  | 'add'
  | 'help'
  | 'calendar'
  | 'day'
  | 'week'
  | 'month'
  | 'today'
  | 'lists'
  | 'account'

const KEYS: Record<string, Hotkey> = {
  n: 'add',
  c: 'calendar',
  d: 'day',
  w: 'week',
  m: 'month',
  t: 'today',
  l: 'lists',
  a: 'account',
}

type Pressed = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>

/** The shortcut a key press asks for, or null when it is not one. */
export function hotkeyOf(event: Pressed): Hotkey | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  // "?" is Shift and "/" on most keyboards, so Shift is allowed for it alone.
  if (event.key === '?') return 'help'
  if (event.shiftKey) return null
  return KEYS[event.key.toLowerCase()] ?? null
}

type Target = { isContentEditable?: boolean; tagName?: string } | null

/** Whether a key press lands in a text box, where it is typing. */
export function typingIn(target: Target): boolean {
  return (
    !!target?.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
  )
}

/** What the shortcuts dialog lists, in groups. */
export const SHORTCUT_GROUPS: ReadonlyArray<{
  title: string
  keys: ReadonlyArray<{ keys: ReadonlyArray<string>; label: string }>
}> = [
  {
    title: 'Go to',
    keys: [
      { keys: ['C'], label: 'Calendar' },
      { keys: ['D'], label: 'Day' },
      { keys: ['W'], label: 'Week' },
      { keys: ['M'], label: 'Month' },
      { keys: ['T'], label: 'Today' },
      { keys: ['L'], label: 'Lists' },
      { keys: ['A'], label: 'Account' },
    ],
  },
  {
    title: 'On the calendar',
    keys: [
      { keys: ['←', '→'], label: 'Day before or after' },
      { keys: ['↑', '↓'], label: 'Week before or after, in a week or month' },
      { keys: ['Shift', '←', '→'], label: 'A whole day, week or month' },
      { keys: ['Enter'], label: 'Open the picked day' },
      { keys: ['Esc'], label: 'Zoom out' },
    ],
  },
  {
    title: 'Anywhere',
    keys: [
      { keys: ['N'], label: 'Add a to-do' },
      { keys: ['?'], label: 'These shortcuts' },
    ],
  },
]
