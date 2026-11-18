// The household's planning week. Some households plan once a week on a set
// day (the PLAN_DAY setting): by that day last week's to-dos should be done,
// and next week's planned. The week runs from one planning day to the day
// before the next. The calendar keeps its own Sunday-first weeks; this is a
// second way to cut the same days. Pure, and runs on both sides.
import { addDays, formatMonthDay, formatWeekday, weekday } from './dates'
import type { LocalDate } from './dates'

/** 0 is Sunday, as `weekday` counts. */
export type PlanDay = number

export const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** The planning day that opens the planning week holding `date`. */
export function planWeekStart(date: LocalDate, planDay: PlanDay): LocalDate {
  return addDays(date, -((weekday(date) - planDay + 7) % 7))
}

/** The last day of the planning week holding `date`. */
export function planWeekEnd(date: LocalDate, planDay: PlanDay): LocalDate {
  return addDays(planWeekStart(date, planDay), 6)
}

/**
 * The next planning day after `today`. On a planning day that is a week
 * on, not today: today is when the coming week gets planned.
 */
export function nextPlanDay(today: LocalDate, planDay: PlanDay): LocalDate {
  return addDays(planWeekStart(today, planDay), 7)
}

/**
 * Whether the calendar draws a plan week's line at the start of this day.
 * A plan week that starts on Sunday starts with the grid's own row, so it
 * needs none.
 */
export function startsPlanWeek(
  date: LocalDate,
  planDay: PlanDay | null,
): boolean {
  return planDay !== null && planDay !== 0 && weekday(date) === planDay
}

/**
 * Whether a day sits before the line in its Sunday-first row: it belongs to
 * the plan week before the one that starts in that row.
 */
export function beforePlanLine(
  date: LocalDate,
  planDay: PlanDay | null,
): boolean {
  return planDay !== null && weekday(date) < planDay
}

/** "Tue 17 to Mon 23", with the months named when it crosses one. */
export function planWeekSpan(start: LocalDate): string {
  const end = addDays(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const day = (date: LocalDate) =>
    sameMonth
      ? `${formatWeekday(date)} ${Number(date.slice(8))}`
      : `${formatWeekday(date)}, ${formatMonthDay(date)}`
  return `${day(start)} to ${day(end)}`
}
