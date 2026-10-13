// Having a decision model check the rules' reading of a title, the way its
// makers document. TypeSafe's notes on Jev say it reads dates as text and not
// as days in order, does not count, and should pick among candidates that
// code found (docs.typesafe.ai/model-jaggedness/jev-1.13, and the cookbooks
// on value and date extraction). So the rules (lib/read.ts) read first and
// write the title, and the model is asked only what takes judgment:
//
//   tag   which tag, from options that are named and described, when the
//         rules found none
//   when  is the phrase the rules read a date from really when the to-do is
//         due, or part of a name ("the Sunday paper")? A no takes the date
//         away again
//
// It never writes a date, a time or a title, and never touches a field the
// rules read but that one date. The add bar (src/server/jev-read.ts) and
// `bun run eval:read` both go through this file, so the test measures what
// the app runs. Nothing here sends anything.
import { weekday } from './dates'
import { readTitle } from './read'
import type { ReadContext, TitleRead } from './read'
import type { DateParser } from './when'

/**
 * The version asked, not an alias that moves: a cut-off chosen against one
 * model says nothing about the next (docs.typesafe.ai/models).
 */
export const JEV_VERSION = 'jev-1.13.0'

const NONE = 'none'

// What each tag is for, by the names households give them. A tag with
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
const NO_TAG: About = {
  what: 'It does not clearly belong in one of the areas, or it could sit in two.',
  not_for: 'A to-do that plainly fits one area.',
  examples: ['Wrap the wedding gift', 'Charge the camera'],
}

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

// What the model is sent still calls a tag an "area": the questions' ids and
// wording stay as they were tested.
/** The questions a request can hold, by id. */
export const QUESTIONS = {
  tag: 'area',
  tagReversed: 'area_reversed',
  when: 'when',
} as const

export interface VerifyRequest {
  model: string
  state: { todo: string; today: string }
  questions: Record<string, unknown>
}

export interface Asked {
  /** The rules' own reading: the title, and every field they found. */
  rules: TitleRead
  /** Null when the rules left nothing to ask about. */
  request: VerifyRequest | null
}

const tagOption = (name: string) => name
function tagOptions(context: ReadContext): Array<[string, About | null]> {
  return context.tags.map((tag) => [
    tagOption(tag.name),
    ABOUT[tag.name.toLowerCase()] ?? null,
  ])
}

/**
 * The rules' reading of `title`, and the request it leaves to be asked. What
 * is sent: the title, today's date and the tag names. No name of a person
 * leaves but one typed into the title.
 */
export function verifyRequest(
  parser: DateParser | null,
  title: string,
  context: ReadContext,
): Asked {
  const rules = readTitle(parser, title, context)
  const questions: Record<string, unknown> = {}

  // The tag, only where the rules found none: what they read is theirs. Never
  // one set by hand or taken back.
  if (
    rules.fields.tagId === undefined &&
    !context.skip?.has('tag') &&
    context.tags.length > 0
  ) {
    const instructions = {
      question: 'Which one area of this household list does `todo` belong in?',
      focus: `Judge what the task is about, not words it happens to contain. Pick \`${NONE}\` unless one area plainly fits.`,
    }
    const options = tagOptions(context)
    // `none` first: Jev leans to the option that comes first, and an empty
    // button is the safe answer.
    questions[QUESTIONS.tag] = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([[NONE, NO_TAG], ...options]),
    }
    // And once more the other way round. The two must agree: it is the
    // check TypeSafe gives for that lean.
    questions[QUESTIONS.tagReversed] = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([...options.reverse(), [NONE, NO_TAG]]),
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

  return {
    rules,
    request:
      Object.keys(questions).length === 0
        ? null
        : {
            model: JEV_VERSION,
            state: {
              todo: title,
              today: `${WEEKDAYS[weekday(context.today)]}, ${context.today}`,
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

const odds = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/**
 * The answers of a System One reply (`{answers: {id: ...}}`) that are well
 * formed: each pick with the odds of every option, each yes or no as the odds
 * of a yes. Any other is left out, which reads as no answer. Null: the reply
 * holds no answers at all.
 */
export function answersIn(reply: unknown): Answers | null {
  const answers = object(reply).answers
  if (!answers || typeof answers !== 'object') return null
  const read: Answers = {}
  for (const [id, given] of Object.entries(answers)) {
    const answer = object(given)
    const probabilities = object(answer.probabilities)
    if (odds(answer.noul)) read[id] = { noul: answer.noul }
    else if (
      typeof answer.choice === 'string' &&
      odds(probabilities[answer.choice]) &&
      Object.values(probabilities).every(odds)
    )
      read[id] = {
        choice: answer.choice,
        probabilities: probabilities as Record<string, number>,
      }
  }
  return read
}

/** How sure an answer has to be before it is acted on. */
export interface Cutoffs {
  /** The tag fills at this probability or more, both ways round. */
  tag: number
  /** The date is taken away at this probability of a yes or less. */
  veto: number
}
/**
 * The cut-offs the add bar acts on. `bun run eval:read` chose them against
 * `JEV_VERSION` on 2026-10-13, on the sentences the rules were tuned on: the
 * least careful one that did no more harm there than the best, then one step
 * more careful. A new model version wants a new run and a new choice.
 */
export const CUTOFFS: Cutoffs = { tag: 0.6, veto: 0.4 }

const picked = (answer: Answer | undefined) =>
  answer && 'choice' in answer ? answer : undefined

/** The tag both orders agree on, surely enough; else none. */
export function tagFrom(
  answers: Answers,
  context: ReadContext,
  cutoff: number,
): number | undefined {
  const one = picked(answers[QUESTIONS.tag])
  const other = picked(answers[QUESTIONS.tagReversed])
  if (!one || !other || one.choice !== other.choice) return undefined
  const sure = Math.min(
    one.probabilities[one.choice] ?? 0,
    other.probabilities[other.choice] ?? 0,
  )
  if (sure < cutoff) return undefined
  return context.tags.find((tag) => tagOption(tag.name) === one.choice)?.id
}

/** Whether the model says the phrase the rules read is not a deadline. */
export function vetoed(answers: Answers, cutoff: number): boolean {
  const answer = answers[QUESTIONS.when]
  return answer !== undefined && 'noul' in answer && answer.noul <= cutoff
}

/** What the model's answers come to, for the reading they were asked about. */
export interface Verdict {
  /** The tag it picked, to fill where the rules read none. */
  tag?: number
  /** The words the rules read a date from, where it says they are no date. */
  notWhen?: string
}

export function verdictFrom(
  answers: Answers,
  rules: TitleRead,
  context: ReadContext,
  cutoffs: Cutoffs = CUTOFFS,
): Verdict {
  const verdict: Verdict = {}
  const tag = tagFrom(answers, context, cutoffs.tag)
  if (tag !== undefined) verdict.tag = tag
  if (rules.phrases.when !== undefined && vetoed(answers, cutoffs.veto))
    verdict.notWhen = rules.phrases.when
  return verdict
}

/**
 * The rules' reading with a verdict acted on. The title and every field the
 * rules read stay the rules': the tag is filled only where they left it
 * empty, and the veto can only take their date away, for the very words it
 * was asked about, which go back in the title. With no verdict it is the
 * rules' reading.
 */
export function verifiedRead(
  parser: DateParser | null,
  typed: string,
  context: ReadContext,
  rules: TitleRead,
  verdict: Verdict | null,
): TitleRead {
  if (!verdict) return rules
  let title = rules.title
  const fields = { ...rules.fields }
  const phrases = { ...rules.phrases }
  const guessed = { ...rules.guessed }

  if (
    rules.fields.dueDate !== undefined &&
    verdict.notWhen !== undefined &&
    verdict.notWhen === rules.phrases.when
  ) {
    // The rules again, told to leave the day alone, for a title with its
    // words back in. Everything else they read the first time stands.
    title = readTitle(parser, typed, {
      ...context,
      skip: new Set([...(context.skip ?? []), 'when']),
    }).title
    delete fields.dueDate
    delete fields.dueTime
    delete phrases.when
    guessed.when = verdict.notWhen
  }

  if (
    fields.tagId === undefined &&
    verdict.tag !== undefined &&
    !context.skip?.has('tag') &&
    context.tags.some((tag) => tag.id === verdict.tag)
  ) {
    fields.tagId = verdict.tag
    guessed.tag = ''
  }

  return { title, fields, phrases, guessed }
}
