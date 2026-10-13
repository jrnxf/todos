// Reading a new to-do's title with Jev, TypeSafe AI's decision model, for
// the add bar. Jev only ever picks one of the options it is handed or answers
// yes or no, each with a probability (https://docs.typesafe.ai/api), so every
// field is asked that way: the day as a pick among the coming days, the time
// among quarter hours, the person, the area and the heads-up among ours, the
// flag as a yes or no, and each word of the title as a pick of what it says.
// All of it goes in one request.
//
// It is optional. Without the TYPESAFE_API_KEY setting nothing is ever sent
// and the rules in src/lib/read.ts read the title alone.
//
// A wrong fill is worse than none, so only a sure, well-formed answer in
// time counts. Everything short of that is "no answer" for its field, which
// the rules then read; and a word leaves the title only when Jev is surer
// still that it is not part of the task, and filled the field the word says.
import { HEADS_UP_CHOICES } from '@/lib/board'
import { addDays, diffDays, formatLongDay, formatTime } from '@/lib/dates'
import { titleWords } from '@/lib/read'
import type { LocalDate, LocalTime } from '@/lib/dates'
import type { JevRead, ReadField } from '@/lib/read'

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
/** How sure an answer has to be before it fills its button. */
export const FILL_FLOOR = 0.8
/** How sure Jev has to be that a word is not the task before it is dropped. */
export const DROP_FLOOR = 0.9
/** Past this the person has moved on; the answer is dropped. */
export const TIME_LIMIT_MS = 1500
/** How far ahead a day can be picked. Past it the rules read the date. */
export const DAYS_AHEAD = 120
/** A Choice takes at most this many options (docs.typesafe.ai/api). */
const MOST_OPTIONS = 255

const NONE = 'none'
/** "Said, but not one of the options": the rules read it instead. */
const UNLISTED = 'unlisted'
const TASK = 'task'

export const READ_FIELDS = [
  'when',
  'who',
  'area',
  'headsUp',
  'flag',
] as const satisfies ReadonlyArray<ReadField>

export interface Household {
  /** The household's calendar date. */
  today: LocalDate
  /** Who is typing, a person's id: "I need to..." is theirs. */
  me: string
  people: Array<{ id: string; name: string }>
  areas: Array<{ id: number; name: string }>
}

const dayOption = (date: LocalDate) => `day_${date}`
const timeOption = (time: LocalTime) => `time_${time}`
const personOption = (index: number) => `person_${index}`
const areaOption = (areaId: number) => `area_${areaId}`
const alertOption = (days: number) => `days_${days}`
const wordQuestion = (index: number) => `word_${index}`

const SLOTS: Array<LocalTime> = Array.from(
  { length: 96 },
  (_, slot) =>
    `${String(Math.floor(slot / 4)).padStart(2, '0')}:${String((slot % 4) * 15).padStart(2, '0')}`,
)

function ahead(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `${days} days from today`
}

/** What each word of a title can be saying, for the fields that are asked. */
const SAYS: Record<ReadField, string> = {
  when: 'Only says the day or the time it is due, or links to it ("on saturday", "at 9pm", "by tomorrow").',
  who: 'Only says whose job it is: that person\'s name opening or closing the to-do, or the words handing it to them ("Sam:", "ask Sam to", "I need to").',
  area: 'Only a tag or heading naming the area ("#kids", "House:").',
  headsUp:
    'Only asks for a reminder ahead of the deadline, or for none ("remind me 3 days before").',
  flag: 'Only stresses that it must not be missed ("don\'t forget", "important", "urgent", "!!").',
}

/**
 * What is sent: the to-do's title, today's date, the first names (so "Sam's
 * boots" reads as a person and not a thing) and the area names. Nothing else
 * leaves. Only the fields in `ask` are asked about.
 */
export function jevRequest(
  title: string,
  household: Household,
  ask: ReadonlyArray<ReadField> = READ_FIELDS,
) {
  const asks = (field: ReadField) => ask.includes(field)
  const typedBy = household.people.find((one) => one.id === household.me)
  const questions: Record<string, unknown> = {}

  if (asks('when')) {
    questions.date = {
      type: 'choice',
      instructions: `Which day does \`todo\` say it is due or happens on? Each option is one calendar day, counted from \`today\`. A weekday on its own means the next one. Pick \`${NONE}\` if it states no day, and \`${UNLISTED}\` if it states one that is not an option.`,
      criteria: {
        ...Object.fromEntries(
          Array.from({ length: DAYS_AHEAD }, (_, days) => {
            const date = addDays(household.today, days)
            return [
              dayOption(date),
              `${formatLongDay(date)}, ${date.slice(0, 4)}: ${ahead(diffDays(date, household.today))}`,
            ]
          }),
        ),
        [UNLISTED]: 'It states a day, but not one of these.',
        [NONE]: 'It states no day.',
      },
    }
    questions.time = {
      type: 'choice',
      instructions: `What time of day does \`todo\` say it is due or happens at? Pick \`${NONE}\` if it states no clock time, and \`${UNLISTED}\` if it states one that is not on a quarter hour.`,
      criteria: {
        ...Object.fromEntries(
          SLOTS.map((time) => [timeOption(time), formatTime(time)]),
        ),
        [UNLISTED]: 'It states a time, but not one of these.',
        [NONE]: 'It states no clock time.',
      },
    }
  }

  if (asks('who') && household.people.length < MOST_OPTIONS)
    questions.person = {
      type: 'choice',
      instructions: `Whose job is \`todo\`? Each option is a member of the household. It is theirs when it is addressed or handed to them: their name opens or closes it ("Sam: ...", "Sam visit the garden center", "... - Sam"), or it says so ("ask Sam to ...", "I need to ..."). Someone who is only mentioned (someone to call, visit, or buy for; "Sam's appointment") does not make it theirs. Pick \`${NONE}\` unless it clearly says whose it is.`,
      criteria: {
        ...Object.fromEntries(
          household.people.map((person, index) => [
            personOption(index),
            person.id === household.me
              ? `${person.name}, who is typing this ("I", "me")`
              : person.name,
          ]),
        ),
        [NONE]: 'It does not clearly say whose job it is.',
      },
    }

  if (
    asks('area') &&
    household.areas.length > 0 &&
    household.areas.length < MOST_OPTIONS
  )
    questions.area = {
      type: 'choice',
      instructions: `Which ONE area of this household's to-do list does \`todo\` belong in? Each option is an area's name. Pick \`${NONE}\` unless the to-do clearly belongs in one of them.`,
      criteria: {
        ...Object.fromEntries(
          household.areas.map((area) => [areaOption(area.id), area.name]),
        ),
        [NONE]: 'It does not clearly belong in any of the areas.',
      },
    }

  if (asks('headsUp'))
    questions.alert = {
      type: 'choice',
      instructions: `Does \`todo\` ask for a reminder some time ahead of its deadline ("remind me 3 days before", "heads up a week ahead")? Pick \`${NONE}\` if it says nothing about a reminder, and \`${UNLISTED}\` if it asks for several or for one that is not an option.`,
      criteria: {
        ...Object.fromEntries(
          HEADS_UP_CHOICES.map((choice) => [
            alertOption(choice.days),
            `A reminder ${choice.label} before.`,
          ]),
        ),
        off: 'It asks for no reminder at all.',
        [UNLISTED]:
          'It asks for more than one reminder, or one that is not listed.',
        [NONE]: 'It says nothing about a reminder.',
      },
    }

  if (asks('flag'))
    questions.flag = {
      type: 'noul',
      instructions:
        'Does `todo` itself stress that it must not be missed ("don\'t forget", "must not miss", "important", "urgent", "critical", or "!!")?',
      criteria: {
        true: 'It says so in words or with "!!".',
        false:
          'It does not. An ordinary to-do, however serious it sounds, is a no.',
      },
    }

  // The title is tidied word by word. Each word is asked about on its own,
  // so Jev never writes a title: it can only say what a word that was typed
  // is for.
  if (ask.length > 0)
    titleWords(title).forEach((word, index) => {
      questions[wordQuestion(index)] = {
        type: 'choice',
        instructions: {
          word: word.text,
          place: index + 1,
          question: `What is \`word\`, word number \`place\` of \`todo\`, there for? Pick \`${TASK}\` if it is any part of what has to be done, and whenever unsure.`,
        },
        criteria: {
          [TASK]:
            'Part of what has to be done: the action, the thing, the place, or anyone it is about.',
          ...Object.fromEntries(ask.map((field) => [field, SAYS[field]])),
        },
      }
    })

  return {
    model: MODEL,
    state: {
      todo: title,
      today: `${formatLongDay(household.today)}, ${household.today.slice(0, 4)}`,
      people: household.people.map((person) => person.name),
      typed_by: typedBy?.name ?? null,
    },
    questions,
  }
}

interface Answers {
  answers?: Record<
    string,
    | {
        choice?: unknown
        probabilities?: Record<string, unknown>
        noul?: unknown
      }
    | undefined
  >
}

/**
 * Jev's reading out of its reply to `jevRequest(title, household, ask)`:
 * only what was asked, is one of ours, and is sure enough.
 */
export function jevReadFrom(
  response: unknown,
  title: string,
  household: Household,
  ask: ReadonlyArray<ReadField> = READ_FIELDS,
): JevRead {
  const answers = (response as Answers | null)?.answers ?? {}
  const asks = (field: ReadField) => ask.includes(field)
  /** The option picked for a question, if it was picked surely enough. */
  const picked = (question: string, floor = FILL_FLOOR): string | null => {
    const answer = answers[question]
    const choice = answer?.choice
    if (typeof choice !== 'string') return null
    const probability = answer?.probabilities?.[choice]
    return typeof probability === 'number' && probability >= floor
      ? choice
      : null
  }
  const read: JevRead = { drops: [] }

  // The day and the time are one field. A day with a time Jev was not sure
  // of, or a time with no day, is left whole for the rules.
  if (asks('when')) {
    const day = picked('date')
    const time = picked('time')
    const dueDate = Array.from({ length: DAYS_AHEAD }, (_, days) =>
      addDays(household.today, days),
    ).find((date) => dayOption(date) === day)
    const dueTime = SLOTS.find((slot) => timeOption(slot) === time)
    if (dueDate && (dueTime || time === NONE))
      read.when = { dueDate, dueTime: dueTime ?? null }
  }

  if (asks('who')) {
    const person = picked('person')
    const who = household.people.find(
      (_one, index) => personOption(index) === person,
    )
    if (who) read.who = who.id
  }

  if (asks('area')) {
    const choice = picked('area')
    const area = household.areas.find((one) => areaOption(one.id) === choice)
    if (area) read.area = area.id
  }

  if (asks('headsUp')) {
    const alert = picked('alert')
    const offered = HEADS_UP_CHOICES.find(
      (choice) => alertOption(choice.days) === alert,
    )
    if (offered) read.headsUp = [offered.days]
    else if (alert === 'off') read.headsUp = []
  }

  if (asks('flag')) {
    const yes = answers.flag?.noul
    if (typeof yes === 'number' && yes >= FILL_FLOOR) read.flag = true
  }

  // A word leaves only for a field that was filled just now: dropping
  // "saturday" without setting the day would lose it.
  const filled: Record<ReadField, boolean> = {
    when: read.when !== undefined,
    who: read.who !== undefined,
    area: read.area !== undefined,
    headsUp: read.headsUp !== undefined,
    flag: read.flag === true,
  }
  const words = titleWords(title)
  words.forEach((_word, index) => {
    const says = picked(wordQuestion(index), DROP_FLOOR)
    const field = READ_FIELDS.find((one) => one === says)
    if (field && asks(field) && filled[field]) read.drops.push({ index, field })
  })
  // A title with no words left is no title: keep them all.
  if (read.drops.length >= words.length) read.drops = []

  return read
}

/**
 * Asks Jev about a title. Null is "no answer": no key, nothing to ask, or
 * the service was slow, down, or made no sense. The rules then read it all.
 */
export async function readWithJev(
  title: string,
  household: Household,
  options: {
    apiKey: string
    /** The fields still open; one set by hand or taken back is not asked. */
    ask?: ReadonlyArray<ReadField>
    endpoint?: string
    timeLimitMs?: number
    /** Stands in for the network in tests. */
    fetch?: typeof fetch
  },
): Promise<JevRead | null> {
  const ask = options.ask ?? READ_FIELDS
  if (!options.apiKey || !title.trim() || ask.length === 0) return null
  try {
    const response = await (options.fetch ?? fetch)(
      options.endpoint ?? JEV_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jevRequest(title, household, ask)),
        signal: AbortSignal.timeout(options.timeLimitMs ?? TIME_LIMIT_MS),
      },
    )
    if (!response.ok) return null
    return jevReadFrom(await response.json(), title, household, ask)
  } catch {
    // Offline, too slow, or not JSON: no answer.
    return null
  }
}
