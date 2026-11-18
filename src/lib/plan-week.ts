// The household's planning week. Some households plan once a week on a set
// day (the PLAN_DAY setting): by that day last week's to-dos should be done,
// and next week's planned. The week runs from one planning day to the day
// before the next. The calendar keeps its own Sunday-first weeks; this is a
// second way to cut the same days. Pure, and runs on both sides.
import { addDays, weekday } from './dates'
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
