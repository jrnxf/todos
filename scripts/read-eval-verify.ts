// The test's side of the documented usage of a decision model, for `bun run
// eval:read`. The usage itself is the app's (src/lib/verify.ts): the rules
// read first and write the title, the model picks the tag where the rules
// found none and can take back a date that is part of a name. The test asks
// the app's request and reads the reply with the app's code, so it measures
// what the add bar does.
//
// Added here, for the test alone:
//
//   date_*  the parts of a date the rules did not find (how it is written,
//           the month, the day, the weekday), put together in code
//
// One request carries all of it, and three columns are read out of the one
// reply: the tag alone, the tag and the veto (the app's way), and those with
// the date in parts. Nothing here sends anything.
import * as chrono from 'chrono-node'
import { addDays, weekday } from '@/lib/dates'
import {
  QUESTIONS as ASKED,
  JEV_VERSION,
  WEEKDAYS,
  verifyRequest as appRequest,
  verdictFrom,
  verifiedRead,
} from '@/lib/verify'
import type { LocalDate } from '@/lib/dates'
import type { ReadContext as Household, TitleRead } from '@/lib/read'
import type {
  Answer,
  Answers,
  Cutoffs as AppCutoffs,
  Asked,
} from '@/lib/verify'

export { JEV_VERSION, tagFrom, vetoed } from '@/lib/verify'
export type { Answer, Answers, Asked } from '@/lib/verify'

const NONE = 'none'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The questions a request can hold, by id. */
export const QUESTIONS = {
  ...ASKED,
  mode: 'date_mode',
  month: 'date_month',
  day: 'date_day',
  anchor: 'date_anchor',
  weekday: 'date_weekday',
  week: 'date_week',
} as const
const PARTS: ReadonlyArray<string> = [
  QUESTIONS.mode,
  QUESTIONS.month,
  QUESTIONS.day,
  QUESTIONS.anchor,
  QUESTIONS.weekday,
  QUESTIONS.week,
]

/** The three readings made of one reply. */
export type Column = 'tag' | 'verify' | 'parts'
/** Which questions each column reads; the rest of the request is not its. */
export function columnAsks(column: Column, id: string): boolean {
  if (PARTS.includes(id)) return column === 'parts'
  if (id === QUESTIONS.when) return column !== 'tag'
  return true
}

/**
 * The rules' reading of `title`, and the request it leaves to be asked: the
 * app's, and after it the test's own questions.
 */
export function verifyRequest(title: string, household: Household): Asked {
  const asked = appRequest(chrono, title, household)
  const questions: Record<string, unknown> = {
    ...asked.request?.questions,
  }

  // Test only: the date in parts, where the rules read none.
  if (asked.rules.fields.dueDate === undefined) {
    const absent = 'It states no such thing, or it is not this kind of date.'
    const names = (list: ReadonlyArray<string>) =>
      Object.fromEntries([[NONE, absent], ...list.map((name) => [name, null])])
    questions[QUESTIONS.mode] = {
      type: 'choice',
      instructions:
        'How does `todo` say when it is due or takes place? A day or month that is part of a name, or that describes a thing in the task, is not when it is due.',
      criteria: {
        [NONE]: 'It does not say when it is due.',
        absolute:
          'A calendar date: a day of the month, with or without the month ("the 3rd", "March 3", "3/3").',
        relative:
          'Counted from `today`: today, tonight, tomorrow, the day after tomorrow, or a day of the week.',
      },
    }
    questions[QUESTIONS.month] = {
      type: 'choice',
      instructions:
        'If `todo` is due on a calendar date, which month does it name?',
      criteria: names(MONTHS),
    }
    questions[QUESTIONS.day] = {
      type: 'choice',
      instructions:
        'If `todo` is due on a calendar date, which day of the month is it?',
      criteria: names(Array.from({ length: 31 }, (_, day) => String(day + 1))),
    }
    questions[QUESTIONS.anchor] = {
      type: 'choice',
      instructions:
        'If `todo` is due on a day counted from `today`, which day is it?',
      criteria: {
        [NONE]: absent,
        today: 'Today or tonight.',
        tomorrow: null,
        day_after: 'The day after tomorrow.',
        weekday: 'A named day of the week.',
      },
    }
    questions[QUESTIONS.weekday] = {
      type: 'choice',
      instructions:
        'If `todo` is due on a named day of the week, which one is it?',
      criteria: names(WEEKDAYS),
    }
    questions[QUESTIONS.week] = {
      type: 'choice',
      instructions:
        'If `todo` is due on a named day of the week, does it say which week?',
      criteria: {
        unsaid: 'The day alone: "thursday", "on thursday", "by thursday".',
        next: '"next thursday", or "thursday next week".',
      },
    }
  }

  return {
    rules: asked.rules,
    request:
      Object.keys(questions).length === 0
        ? null
        : {
            model: JEV_VERSION,
            state: {
              todo: title,
              today: `${WEEKDAYS[weekday(household.today)]}, ${household.today}`,
            },
            questions,
          },
  }
}

// ── Reading the reply ───────────────────────────────────────────────────────

/** How sure an answer has to be before a column acts on it. */
export interface Cutoffs extends AppCutoffs {
  /** A date in parts is used when its least sure part is this sure. */
  parts: number
}
/** Where a cut-off starts before any run has chosen one. */
export const STARTING_CUTOFFS: Cutoffs = { tag: 0.7, veto: 0.2, parts: 0.8 }
/** The cut-offs tried, each from the most careful to the least. */
export const GRIDS: Record<keyof Cutoffs, ReadonlyArray<number>> = {
  tag: [0.95, 0.9, 0.8, 0.7, 0.6, 0.5],
  veto: [0.05, 0.1, 0.2, 0.3, 0.4, 0.5],
  parts: [0.95, 0.9, 0.8, 0.7, 0.6, 0.5],
}

const picked = (answer: Answer | undefined) =>
  answer && 'choice' in answer ? answer : undefined

/**
 * How far the pick stands above an even split, 0 to 1: the confidence
 * TypeSafe documents for a Choice (docs.typesafe.ai/confidence), worked out
 * here so every provider is read alike.
 */
export function confidence(answer: Answer | undefined): number {
  const pick = picked(answer)
  if (!pick) return 0
  const options = Object.keys(pick.probabilities).length
  const top = pick.probabilities[pick.choice] ?? 0
  return options < 2 ? 0 : (top - 1 / options) / (1 - 1 / options)
}

/**
 * The date the parts add up to, or none: an unsure part, a part left out, or
 * a day no month has. The calendar is worked here, never by the model. A day
 * of the week means the next one, and a week on when it is today's; a date
 * gone by is the next one to come, as the rules have it.
 */
export function dateFromParts(
  answers: Answers,
  today: LocalDate,
  cutoff: number,
): LocalDate | undefined {
  const used: Array<Answer | undefined> = []
  const part = (id: string) => {
    used.push(answers[id])
    return picked(answers[id])?.choice
  }
  const sure = () => used.every((answer) => confidence(answer) >= cutoff)
  const mode = part(QUESTIONS.mode)

  if (mode === 'relative') {
    const anchor = part(QUESTIONS.anchor)
    if (anchor === 'today') return sure() ? today : undefined
    if (anchor === 'tomorrow') return sure() ? addDays(today, 1) : undefined
    if (anchor === 'day_after') return sure() ? addDays(today, 2) : undefined
    if (anchor !== 'weekday') return undefined
    const day = WEEKDAYS.indexOf(part(QUESTIONS.weekday) ?? '')
    const week = part(QUESTIONS.week)
    if (day === -1 || !sure()) return undefined
    const ahead = (day - weekday(today) + 7) % 7 || 7
    // "next thursday" said on a Tuesday is the Thursday of the week after.
    return addDays(today, week === 'next' && ahead < 7 ? ahead + 7 : ahead)
  }

  if (mode === 'absolute') {
    const month = MONTHS.indexOf(part(QUESTIONS.month) ?? '')
    const day = Number(part(QUESTIONS.day))
    if (!Number.isInteger(day) || day < 1 || !sure()) return undefined
    const [year, thisMonth] = today.split('-').map(Number)
    const real = (y: number, m: number) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const made = new Date(`${date}T00:00:00Z`)
      return !Number.isNaN(made.getTime()) &&
        made.toISOString().slice(0, 10) === date
        ? date
        : undefined
    }
    // The month named, this year or next; or no month, and the next month
    // that has such a day.
    const tries =
      month === -1
        ? Array.from({ length: 13 }, (_, on) => {
            const m = thisMonth - 1 + on
            return real(year + Math.floor(m / 12), (m % 12) + 1)
          })
        : [real(year, month + 1), real(year + 1, month + 1)]
    return tries.find((date) => date !== undefined && date >= today)
  }

  return undefined
}

/**
 * What a column makes of a reply. `verify` is the app's own reading
 * (src/lib/verify.ts), acted on by the app's code. `tag` is that with the
 * veto left unread, and `parts` adds a date in parts where the rules read
 * none. With no answer it is the rules' reading.
 */
export function columnRead(
  column: Column,
  typed: string,
  household: Household,
  rules: TitleRead,
  answers: Answers | null,
  cutoffs: Cutoffs,
): TitleRead {
  if (!answers) return rules
  const verdict = verdictFrom(answers, rules, household, cutoffs)
  if (column === 'tag') delete verdict.notWhen
  const read = verifiedRead(chrono, typed, household, rules, verdict)

  if (column === 'parts' && rules.fields.dueDate === undefined) {
    const date = dateFromParts(answers, household.today, cutoffs.parts)
    if (date) {
      read.fields.dueDate = date
      read.fields.dueTime = null
      read.guessed.when = ''
    }
  }

  return read
}

/**
 * The cut-off to use: the least careful one that does no more harm than the
 * best on the sentences it may be chosen on, and then one step more careful.
 * `misses` is how many fields a column gets wrong there at a cut-off.
 */
export function chooseCutoff(
  grid: ReadonlyArray<number>,
  misses: (cutoff: number) => number,
): number {
  const counts = grid.map(misses)
  const fewest = Math.min(...counts)
  const least = counts.lastIndexOf(fewest)
  return grid[Math.max(0, least - 1)]
}
