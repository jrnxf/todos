/**
 * The history state for opening a to-do or an event over the page. The first
 * one opened by a click here is marked, so closing it can go Back. Moving to
 * another replaces the entry and keeps its mark: one that was opened by a
 * link still closes by dropping it from the address, not by leaving the page.
 */
export function openInPlace(replacing: boolean) {
  return <S extends { openedInPlace?: boolean }>(
    now: S,
  ): S & { openedInPlace?: boolean } => ({
    ...now,
    openedInPlace: replacing ? now.openedInPlace : true,
  })
}
