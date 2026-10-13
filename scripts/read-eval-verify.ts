// A decision model asked the way its makers document, for `bun run
// eval:read`. The app's own request (src/server/jev-read.ts) asks the model
// to find the day among 120, the time among 96, and what each word of the
// title is for. TypeSafe's notes on Jev say it reads dates as text and not as
// days in order, does not count, and should pick among candidates that code
// found (docs.typesafe.ai/model-jaggedness/jev-1.13, and the cookbooks on
// value and date extraction). So here the rules read first and write the
// title, and the model is asked only what takes judgment:
//
//   area    which area, from options that are named and described, when the
//           rules found none
//   when    is the phrase the rules read a date from really when the to-do is
//           due, or part of a name ("the Sunday paper")? A no takes the date
//           away again
//   date_*  test only: the parts of a date the rules did not find (how it is
//           written, the month, the day, the weekday), put together in code
//
// One request carries all of it, and three columns are read out of the one
// reply: the area alone, the area and the veto, and those with the date in
// parts. Nothing here sends anything, and nothing here is used by the app.
import * as chrono from 'chrono-node'
import { addDays, weekday } from '@/lib/dates'
import { gapsIn, readTitle } from '@/lib/read'
import type { LocalDate } from '@/lib/dates'
import type { TitleRead } from '@/lib/read'
import type { Household } from '@/server/jev-read'

/**
 * The version asked, not an alias that moves: a cut-off chosen against one
 * model says nothing about the next (docs.typesafe.ai/models). Clef and
 * OpenAI's Decisions API name no versions to pin; the model each reply names
 * is written into the results instead.
 */
export const JEV_VERSION = 'jev-1.13.0'

const NONE = 'none'

// What each area is for, by the names households give them. An area with
// another name is offered by its name alone. The examples are not, and must
// never be, sentences of the test (scripts/read-eval-verify.test.ts).
interface About {
  what: string
  not_for: string
  examples: Array<string>
}
const ABOUT: Partial<Record<string, About>> = {
  house: {
    what: 'The building and what is in it: repairs, cleaning, appliances, furniture, utilities, tradespeople.',
    not_for:
      'Plants, lawn and anything growing outside (Yard). Bills and forms (Paperwork).',
    examples: [
      'Fix the squeaky stair',
      'Descale the kettle',
      'Book the chimney sweep',
    ],
  },
  yard: {
    what: 'Outdoor ground and plants: lawn, garden, trees, leaves, snow, the garden center.',
    not_for:
      'The roof, gutters, walls and other parts of the building (House).',
    examples: [
      'Prune the roses',
      'Edge the flower beds',
      'Shovel the driveway',
    ],
  },
  kids: {
    what: "The children's own things: school, classes, practices, lessons, playdates, their forms and their gear.",
    not_for: 'A task that only happens with or near the kids.',
    examples: [
      'Label the lunch boxes',
      'Buy a recorder for music class',
      'Buy shin guards',
    ],
  },
  paperwork: {
    what: 'Money and documents: bills, taxes, insurance, banking, renewals, forms to file.',
    not_for:
      "A form that is for school (Kids) or for a doctor's visit (Health).",
    examples: [
      'Set up autopay for the water bill',
      'Scan the birth certificates',
      'Update the will',
    ],
  },
  car: {
    what: 'The vehicles: service, repairs, tires, registration, washing.',
    not_for: 'An errand that is only driven to.',
    examples: [
      'Top up the washer fluid',
      'Fix the windshield chip',
      'Vacuum the back seat',
    ],
  },
  health: {
    what: "People's health: doctor, dentist, pharmacy, prescriptions, clinics, check-ups.",
    not_for: "An animal's health (Pets).",
    examples: [
      'Book a dermatologist visit',
      'Pick up allergy pills',
      'Schedule a hearing test',
    ],
  },
  pets: {
    what: 'The animals: food, vet, grooming, walks, tanks and cages.',
    not_for: 'Wild animals and pests (House).',
    examples: [
      "Trim the cat's claws",
      'Buy litter',
      'Book the kennel for the trip',
    ],
  },
}
const NO_AREA: About = {
  what: 'It does not clearly belong in one of the areas, or it could sit in two.',
  not_for: 'A to-do that plainly fits one area.',
  examples: ['Wrap the wedding gift', 'Charge the camera'],
}

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
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** The questions a request can hold, by id. */
export const QUESTIONS = {
  area: 'area',
  areaReversed: 'area_reversed',
  when: 'when',
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
export type Column = 'area' | 'verify' | 'parts'
/** Which questions each column reads; the rest of the request is not its. */
export function columnAsks(column: Column, id: string): boolean {
  if (PARTS.includes(id)) return column === 'parts'
  if (id === QUESTIONS.when) return column !== 'area'
  return true
}

export interface Asked {
  /** The rules' own reading: the title, and every field they found. */
  rules: TitleRead
  /** Null when the rules left nothing to ask about. */
  request: {
    model: string
    state: { todo: string; today: string }
    questions: Record<string, unknown>
  } | null
}

const areaOption = (name: string) => name
function areaOptions(household: Household): Array<[string, About | null]> {
  return household.areas.map((area) => [
    areaOption(area.name),
    ABOUT[area.name.toLowerCase()] ?? null,
  ])
}

/** The rules' reading of `title`, and the request it leaves to be asked. */
export function verifyRequest(title: string, household: Household): Asked {
  const rules = readTitle(chrono, title, household)
  const questions: Record<string, unknown> = {}

  // The area, only where the rules found none: what they read is theirs.
  if (
    rules.fields.areaId === undefined &&
    gapsIn(chrono, title, household).includes('area') &&
    household.areas.length > 0
  ) {
    const instructions = {
      question: 'Which one area of this household list does `todo` belong in?',
      focus: `Judge what the task is about, not words it happens to contain. Pick \`${NONE}\` unless one area plainly fits.`,
    }
    const options = areaOptions(household)
    // `none` first: Jev leans to the option that comes first, and an empty
    // button is the safe answer.
    questions[QUESTIONS.area] = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([[NONE, NO_AREA], ...options]),
    }
    // And once more the other way round. The two must agree: it is the
    // check TypeSafe gives for that lean.
    questions[QUESTIONS.areaReversed] = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([...options.reverse(), [NONE, NO_AREA]]),
    }
  }

  if (rules.fields.dueDate !== undefined && rules.phrases.when)
    questions[QUESTIONS.when] = {
      type: 'noul',
      instructions: {
        phrase: rules.phrases.when,
        question:
          'In `todo`, does `phrase` say when this to-do is due or takes place?',
      },
      criteria: {
        true: '`phrase` is the deadline, or the day or time the task happens: "haircut on the 3rd at 2pm", "cancel the trial by friday", "call the landlord tomorrow".',
        false:
          '`phrase` is part of a name, or describes a thing in the task: "watch the 5 o\'clock news", "buy the Sunday paper", "start the 30 day trial", "eat Friday\'s leftovers".',
      },
    }

  // Test only: the date in parts, where the rules read none.
  if (rules.fields.dueDate === undefined) {
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
    rules,
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

/** One answer, whoever gave it: a pick with its odds, or the odds of a yes. */
export type Answer =
  { choice: string; probabilities: Record<string, number> } | { noul: number }
export type Answers = Partial<Record<string, Answer>>

/** How sure an answer has to be before a column acts on it. */
export interface Cutoffs {
  /** The area fills at this probability or more, both ways round. */
  area: number
  /** The date is taken away at this probability of a yes or less. */
  veto: number
  /** A date in parts is used when its least sure part is this sure. */
  parts: number
}
/** Where a cut-off starts before any run has chosen one. */
export const STARTING_CUTOFFS: Cutoffs = { area: 0.7, veto: 0.2, parts: 0.8 }
/** The cut-offs tried, each from the most careful to the least. */
export const GRIDS: Record<keyof Cutoffs, ReadonlyArray<number>> = {
  area: [0.95, 0.9, 0.8, 0.7, 0.6, 0.5],
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

/** The area both orders agree on, surely enough; else none. */
export function areaFrom(
  answers: Answers,
  household: Household,
  cutoff: number,
): number | undefined {
  const one = picked(answers[QUESTIONS.area])
  const other = picked(answers[QUESTIONS.areaReversed])
  if (!one || !other || one.choice !== other.choice) return undefined
  const sure = Math.min(
    one.probabilities[one.choice] ?? 0,
    other.probabilities[other.choice] ?? 0,
  )
  if (sure < cutoff) return undefined
  return household.areas.find((area) => areaOption(area.name) === one.choice)
    ?.id
}

/** Whether the model says the phrase the rules read is not a deadline. */
export function vetoed(answers: Answers, cutoff: number): boolean {
  const answer = answers[QUESTIONS.when]
  return answer !== undefined && 'noul' in answer && answer.noul <= cutoff
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
 * What a column makes of a reply. The title and every field the rules read
 * stay the rules': the area is filled only where they left it empty, the
 * veto can only take their date away (and puts its words back in the title),
 * and a date in parts is used only where they read none. With no answer it is
 * the rules' reading.
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
  let title = rules.title
  const fields = { ...rules.fields }
  const phrases = { ...rules.phrases }
  const guessed = { ...rules.guessed }

  if (
    column !== 'area' &&
    rules.fields.dueDate !== undefined &&
    vetoed(answers, cutoffs.veto)
  ) {
    // The rules again, told to leave the day alone, for a title with its
    // words back in. Everything else they read the first time stands.
    title = readTitle(chrono, typed, {
      ...household,
      skip: new Set(['when']),
    }).title
    delete fields.dueDate
    delete fields.dueTime
    delete phrases.when
    guessed.when = rules.phrases.when ?? ''
  }

  if (fields.areaId === undefined) {
    const area = areaFrom(answers, household, cutoffs.area)
    if (area !== undefined) {
      fields.areaId = area
      guessed.area = ''
    }
  }

  if (column === 'parts' && rules.fields.dueDate === undefined) {
    const date = dateFromParts(answers, household.today, cutoffs.parts)
    if (date) {
      fields.dueDate = date
      fields.dueTime = null
      guessed.when = ''
    }
  }

  return { title, fields, phrases, guessed }
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
