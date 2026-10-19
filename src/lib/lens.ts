// The home page's one grid, as numbers. Month shows every square with the
// active one larger; week closes the other rows; day closes the other columns
// too, so the one square left is the page. Pure: the component turns these
// numbers into pixels on screen and lets CSS travel between them.
import { addDays, diffDays, weekday } from './dates'
import { monthStart, weekStart } from './board'
import type { LocalDate } from './dates'

export type LensView = 'day' | 'week' | 'month'

export const LENS_VIEWS: ReadonlyArray<LensView> = ['day', 'week', 'month']

/** The weeks of the month holding `day`, each a Sunday-first row of seven. */
export function monthWeeks(day: LocalDate): Array<Array<LocalDate>> {
  const first = monthStart(day)
  const next = monthStart(day, 1)
  const start = weekStart(first)
  const count = Math.ceil((weekday(first) + diffDays(next, first)) / 7)
  return Array.from({ length: count }, (_row, row) =>
    Array.from({ length: 7 }, (_col, col) => addDays(start, row * 7 + col)),
  )
}

/**
 * The day the arrows land on: a day, a week or a month away, whichever the
 * view shows. A month keeps the day of the month where it can, and otherwise
 * stops at the month's last day (January 31 steps to February 28).
 */
export function stepDay(
  day: LocalDate,
  view: LensView,
  direction: -1 | 1,
): LocalDate {
  if (view === 'day') return addDays(day, direction)
  if (view === 'week') return addDays(day, 7 * direction)
  const target = monthStart(day, direction)
  const last = Number(addDays(monthStart(target, 1), -1).slice(8))
  const dayOfMonth = Math.min(Number(day.slice(8)), last)
  return `${target.slice(0, 8)}${String(dayOfMonth).padStart(2, '0')}`
}

/**
 * How much larger the active square is than the rest: its column in a
 * month and in a week, and its row in a month. A laptop's month keeps the
 * column modest, so the six others have room for their chips and bars.
 */
const GROW = {
  compact: { month: 2.3, week: 7, monthRow: 2.3 },
  wide: { month: 1.5, week: 2.6, monthRow: 1.9 },
}

export interface LensTracks {
  /** Column widths in pixels, Sunday first. */
  cols: Array<number>
  /** Row heights in pixels, one per week of the month. */
  rows: Array<number>
  /** Where the active day sits. */
  col: number
  row: number
}

/**
 * Every column and row of the grid for one state, in pixels. Worked out
 * here rather than left to the grid's own `fr` units because fractions do
 * not move evenly: a square shares width with six closing columns, so it
 * would grow late going in and shrink early coming out. Pixels interpolate
 * in a straight line, so every move runs at one pace in both directions.
 */
export function lensTracks({
  view,
  day,
  width,
  height,
  compact,
}: {
  view: LensView
  day: LocalDate
  width: number
  height: number
  /** A phone's narrow grid: the active square takes a bigger share. */
  compact: boolean
}): LensTracks {
  const weeks = monthWeeks(day)
  const row = weeks.findIndex((week) => week.includes(day))
  const col = weekday(day)
  const grow = compact ? GROW.compact : GROW.wide
  const colWeights = Array.from({ length: 7 }, (_, c) => {
    if (view === 'day') return c === col ? 1 : 0
    if (c !== col) return 1
    return view === 'week' ? grow.week : grow.month
  })
  const rowWeights = weeks.map((_, r) => {
    if (view === 'month') return r === row ? grow.monthRow : 1
    return r === row ? 1 : 0
  })
  return {
    cols: share(colWeights, width),
    rows: share(rowWeights, height),
    col,
    row,
  }
}

function share(weights: Array<number>, total: number): Array<number> {
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((weight) => (total * weight) / sum)
}

/**
 * Which way a change of view goes: further in (month to week to day), back
 * out, or neither (another day, same view). The page times each a little
 * differently.
 */
export function lensDirection(
  from: LensView,
  to: LensView,
): 'in' | 'out' | 'same' {
  const depth = { month: 0, week: 1, day: 2 }
  if (depth[to] > depth[from]) return 'in'
  if (depth[to] < depth[from]) return 'out'
  return 'same'
}
