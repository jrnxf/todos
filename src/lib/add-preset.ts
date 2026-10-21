// What a new to-do starts with. Every way to add one (the add bar, the
// laptop's Add button, the N key) goes through this, so each starts on the
// day being looked at, today included.
import type { LocalDate } from './dates'
import type { ItemFields } from '@/server/board'

/**
 * The fields a caller set, else the picked day as the deadline. A caller
 * that sets a deadline, or none on purpose (`dueDate: null`), wins.
 */
export function startingFields(
  explicit: Partial<ItemFields> | undefined,
  picked: LocalDate | null,
): Partial<ItemFields> {
  if (explicit && 'dueDate' in explicit) return explicit
  return picked ? { ...explicit, dueDate: picked } : { ...explicit }
}
