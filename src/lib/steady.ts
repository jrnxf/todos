// Keeping the add bar still while its title is read (components/app/capture.tsx).
// The rules read the title again on every key, and Jev answers later, so what
// was read comes and goes as a sentence is typed. These decide what the bar
// keeps showing meanwhile. They never change what is read or sent.
import type { ReadField } from './read'

/** A reading of one field, kept from the key it was last read on. */
export interface Held<T> {
  /** The words it was read from, as typed. */
  phrase: string
  /** Where those words start in `typed`. */
  start: number
  /** The whole title as it was typed then. */
  typed: string
  value: T
}

export type HeldReadings<T> = Partial<Record<ReadField, Held<T>>>

/**
 * How many more letters of a word a reading of its start is kept for. Enough
 * to bridge "Tues" to "Tuesday" and "sun" to "sunday"; past that the word
 * was not what the reading took it for ("the h" read as one o'clock, while
 * "the hostas" is being typed), and it goes.
 */
const HOLD_LETTERS = 2

/**
 * The readings to keep showing for `typed`, from those kept for the key
 * before. A field read now is kept as read. A field no longer read is still
 * kept, as `tentative`, while the word it was read from is still being typed:
 * "Tues" is read, "Tuesd" is not, "Tuesday" is again, and the date should not
 * blink out and back in between. It goes once anything but a few more
 * letters of that word is typed, or the field is set by hand or taken back
 * (`skip`).
 */
export function heldReadings<T>(
  before: HeldReadings<T>,
  typed: string,
  read: Partial<Record<ReadField, { phrase: string; value: T }>>,
  skip: ReadonlySet<ReadField>,
): { held: HeldReadings<T>; tentative: Array<ReadField> } {
  const held: HeldReadings<T> = {}
  const tentative: Array<ReadField> = []
  const fields = new Set([
    ...(Object.keys(before) as Array<ReadField>),
    ...(Object.keys(read) as Array<ReadField>),
  ])
  for (const field of fields) {
    const now = read[field]
    if (now) {
      held[field] = { ...now, start: typed.lastIndexOf(now.phrase), typed }
      continue
    }
    const was = before[field]
    const more = was ? typed.slice(was.start + was.phrase.length) : ''
    if (
      was &&
      !skip.has(field) &&
      was.start >= 0 &&
      typed.startsWith(was.typed) &&
      more.length <= HOLD_LETTERS &&
      /^\S+$/.test(more)
    ) {
      held[field] = was
      tentative.push(field)
    }
  }
  return { held, tentative }
}

/**
 * Whether Jev's answer about `asked` still applies to `title`. It does while
 * more is typed onto it, and also through a backspace, as long as the words
 * a date was taken back from are still there: one deleted letter is no
 * reason to put the date back and drop the tag until Jev is asked again.
 */
export function answerHolds(
  title: string,
  asked: string,
  notWhen: string | undefined,
): boolean {
  if (title.startsWith(asked)) return true
  return (
    title.length > 0 &&
    asked.startsWith(title) &&
    (notWhen === undefined || title.includes(notWhen))
  )
}

/**
 * The chips to show, in a steady order: those already shown keep their
 * place, and new ones go at the end, so a chip never pushes another along.
 * While `keepGone` (the pointer is over them), chips that are no longer
 * wanted stay too, marked `gone`, so nothing slides out from under it.
 */
export function steadyChips<T extends { key: string }>(
  shown: ReadonlyArray<T & { gone?: boolean }>,
  wanted: ReadonlyArray<T>,
  keepGone: boolean,
): Array<T & { gone?: boolean }> {
  const byKey = new Map(wanted.map((chip) => [chip.key, chip]))
  const next: Array<T & { gone?: boolean }> = []
  for (const chip of shown) {
    const now = byKey.get(chip.key)
    if (now) next.push(now)
    else if (keepGone) next.push({ ...chip, gone: true })
  }
  const placed = new Set(next.map((chip) => chip.key))
  for (const chip of wanted) if (!placed.has(chip.key)) next.push(chip)
  return next
}
