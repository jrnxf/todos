// The test's side of the documented usage of a decision model, for `bun run
// eval:read`. The usage itself is the app's (src/lib/verify.ts): the rules
// read first and write the title, the model picks the tag where the rules
// found none and can take back a date that is part of a name. The test asks
// the app's request and reads the reply with the app's code, so it measures
// what the add bar does.
//
// Added here, for the test alone, to find out whether the app should ask
// more. Both are asked the same documented way: code finds the candidates,
// the model answers yes or no about each, and nothing is counted or written.
//
//   who_*    is this person the one to do it, or only mentioned? Asked of
//            every household name in the title. A no takes back a person the
//            rules read; a yes fills one where they read none
//   title_*  is this phrase part of what the to-do is, or does it only say
//            who, ask for a reminder or stress it? Asked of every phrase the
//            rules took out of the title for one of those. A yes puts it
//            back. (The date's phrase is the app's own question.)
//
// One request carries all of it, and four columns are read out of the one
// reply: the app's way, that with who, that with the title, and with both.
// Nothing here sends anything.
import * as chrono from 'chrono-node'
import { readTitle } from '@/lib/read'
import {
  QUESTIONS as ASKED,
  JEV_VERSION,
  verifyRequest as appRequest,
  stateOf,
  verdictFrom,
  verifiedRead,
} from '@/lib/verify'
import type { ReadContext as Household, ReadField, TitleRead } from '@/lib/read'
import type { Answers, Cutoffs as AppCutoffs, Asked } from '@/lib/verify'

export { CUTOFFS, JEV_VERSION, tagFrom, vetoed } from '@/lib/verify'
export type { Answer, Answers, Asked } from '@/lib/verify'

/** The app's two questions, and the head of each of the test's own ids. */
export const QUESTIONS = { ...ASKED, who: 'who_', title: 'title_' } as const

/** The phrases the title question is asked of, by the field they were read for. */
const TITLE_FIELDS = ['who', 'headsUp', 'flag'] as const
type TitleField = (typeof TITLE_FIELDS)[number]
const whoQuestion = (index: number) => `${QUESTIONS.who}${index}`
const titleQuestion = (field: TitleField) => `${QUESTIONS.title}${field}`

// What a phrase the rules took out might only be saying. The examples are
// not, and must never be, sentences of the test.
const ONLY: Record<TitleField, { true: string; false: string }> = {
  who: {
    true: '`phrase` belongs to the task: someone it is about, done to or done for, or part of a name: "Dana and Lee\'s housewarming", "Dana Scully poster for the den".',
    false:
      '`phrase` only says whose job the to-do is: "Dana: book the movers", "ask Dana to water the ferns", "I need to find the charger".',
  },
  headsUp: {
    true: '`phrase` belongs to the task: the reminder, alert or notice is the thing to be done or dealt with: "set a reminder on the oven clock", "turn off the low battery alert".',
    false:
      '`phrase` only asks to be reminded ahead of the deadline, or not to be: "book the movers, remind me 2 days before", "water the ferns, no reminder".',
  },
  flag: {
    true: '`phrase` names or describes a thing in the task: "the Important Papers box", "the urgent mail tray", "the Top Priority podcast".',
    false:
      '`phrase` only stresses that the to-do must not be missed: "book the movers, important", "URGENT water the ferns", "find the charger!!".',
  },
}

/** The four readings made of one reply. */
export type Column = 'verify' | 'who' | 'title' | 'both'
/** Which questions each column reads; the rest of the request is not its. */
export function columnAsks(column: Column, id: string): boolean {
  if (id.startsWith(QUESTIONS.who)) return column === 'who' || column === 'both'
  if (id.startsWith(QUESTIONS.title))
    return column === 'title' || column === 'both'
  return true
}

/** The household's people named in `title`, as whole words, by their place. */
export function named(
  title: string,
  household: Household,
): Array<{ index: number; id: string; name: string }> {
  return household.people.flatMap((person, index) =>
    new RegExp(
      String.raw`(?<![\p{L}\p{N}])${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\p{L}\p{N}])`,
      'iu',
    ).test(title)
      ? [{ index, id: person.id, name: person.name }]
      : [],
  )
}

/**
 * The rules' reading of `title`, and the request it leaves to be asked: the
 * app's own, and after its questions the test's unless `app` alone is
 * wanted.
 */
export function verifyRequest(
  title: string,
  household: Household,
  app = false,
): Asked {
  const asked = appRequest(chrono, title, household)
  if (app) return asked
  const questions: Record<string, unknown> = { ...asked.request?.questions }

  for (const person of named(title, household))
    questions[whoQuestion(person.index)] = {
      type: 'noul',
      instructions: {
        person: person.name,
        question: 'In `todo`, is `person` the one who is to do this to-do?',
      },
      criteria: {
        true: '`todo` is addressed or handed to `person`, so it is theirs to do: "Dana: book the movers", "ask Dana to water the ferns", "Dana can you defrost the soup", "return the ladder - Dana".',
        false:
          '`person` is only mentioned: someone the task is done to, for or with, or whose thing it is: "call Dana about the keys", "Dana\'s piano recital", "buy Dana a scarf", "coffee with Dana".',
      },
    }

  for (const field of TITLE_FIELDS) {
    const phrase = asked.rules.phrases[field]
    if (phrase)
      questions[titleQuestion(field)] = {
        type: 'noul',
        instructions: {
          phrase,
          question:
            'In `todo`, is `phrase` part of what has to be done, or of the name of a thing in it?',
        },
        criteria: ONLY[field],
      }
  }

  return {
    rules: asked.rules,
    request:
      Object.keys(questions).length === 0
        ? null
        : {
            model: JEV_VERSION,
            state: stateOf(title, household),
            questions,
          },
  }
}

// ── Reading the reply ───────────────────────────────────────────────────────

/** How sure an answer has to be before a column acts on it. */
export interface Cutoffs extends AppCutoffs {
  /** A person the rules read is taken back at this probability or less. */
  whoNo: number
  /** A person is filled, where the rules read none, at this or more. */
  whoYes: number
  /** A phrase goes back in the title at this probability or more. */
  title: number
}
/** Where a cut-off starts before a run has chosen one. */
export const STARTING_CUTOFFS: Cutoffs = {
  tag: 0.7,
  veto: 0.2,
  whoNo: 0.2,
  whoYes: 0.8,
  title: 0.8,
}
const SURE = [0.95, 0.9, 0.8, 0.7, 0.6, 0.5]
const UNSURE = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5]
/** The cut-offs tried, each from the most careful to the least. */
export const GRIDS: Record<keyof Cutoffs, ReadonlyArray<number>> = {
  tag: SURE,
  veto: UNSURE,
  whoNo: UNSURE,
  whoYes: SURE,
  title: SURE,
}

const yes = (answers: Answers, id: string): number | undefined => {
  const answer = answers[id]
  return answer && 'noul' in answer ? answer.noul : undefined
}

/**
 * What the who questions make of the rules' person: taken back, filled, or
 * left as it is. A person is filled only where no one is left by the rules,
 * and the model is sure of exactly one.
 */
export function whoFrom(
  answers: Answers,
  typed: string,
  household: Household,
  rules: TitleRead,
  cutoffs: Pick<Cutoffs, 'whoNo' | 'whoYes'>,
): { takeBack: boolean; fill?: string } {
  const people = named(typed, household).map((person) => ({
    ...person,
    odds: yes(answers, whoQuestion(person.index)),
  }))
  const theirs = people.find((person) => person.id === rules.fields.assignee)
  const takeBack = theirs?.odds !== undefined && theirs.odds <= cutoffs.whoNo
  if (rules.fields.assignee !== undefined && !takeBack)
    return { takeBack: false }
  const sure = people.filter(
    (person) =>
      person !== theirs &&
      person.odds !== undefined &&
      person.odds >= cutoffs.whoYes,
  )
  return { takeBack, fill: sure.length === 1 ? sure[0].id : undefined }
}

/** The fields whose phrase the model says is part of the task after all. */
export function putBack(
  answers: Answers,
  rules: TitleRead,
  cutoff: number,
): Array<TitleField> {
  return TITLE_FIELDS.filter((field) => {
    const odds = yes(answers, titleQuestion(field))
    return (
      rules.phrases[field] !== undefined && odds !== undefined && odds >= cutoff
    )
  })
}

const HOLDS: Record<ReadField, ReadonlyArray<keyof TitleRead['fields']>> = {
  when: ['dueDate', 'dueTime'],
  who: ['assignee'],
  tag: ['tagId'],
  headsUp: ['headsUpDays'],
  flag: ['mustNotMiss'],
}

/**
 * What a column makes of a reply. `verify` is the app's own reading
 * (src/lib/verify.ts), acted on by the app's code. The others start from it:
 * `who` acts on the who questions, `title` on the title questions, `both`
 * on both. A field taken back has its words put back in the title by the
 * rules, read again and told to leave it alone; everything else they read
 * the first time stands. With no answer it is the rules' reading.
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
  const read = verifiedRead(chrono, typed, household, rules, verdict)
  if (column === 'verify') return read

  const undone = new Set<ReadField>()
  let fill: string | undefined
  if (column !== 'title') {
    const who = whoFrom(answers, typed, household, rules, cutoffs)
    if (who.takeBack) undone.add('who')
    fill = who.fill
  }
  if (column !== 'who')
    for (const field of putBack(answers, rules, cutoffs.title))
      undone.add(field)

  for (const field of undone) {
    for (const key of HOLDS[field]) delete read.fields[key]
    read.guessed[field] = read.phrases[field] ?? ''
    delete read.phrases[field]
  }
  if (undone.size > 0)
    read.title = readTitle(chrono, typed, {
      ...household,
      // The date too, where the app's own question took it back.
      skip: new Set([
        ...undone,
        ...(read.guessed.when === undefined ? [] : (['when'] as const)),
      ]),
    }).title
  if (fill !== undefined && read.fields.assignee === undefined) {
    read.fields.assignee = fill
    read.guessed.who ??= ''
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

/**
 * The cut-off that misses fewest on sentences it was not chosen on, the most
 * careful of them where several do: what hindsight would have picked. Never
 * one to use: it is chosen with the answers in hand.
 */
export function hindsightCutoff(
  grid: ReadonlyArray<number>,
  misses: (cutoff: number) => number,
): number {
  const counts = grid.map(misses)
  return grid[counts.indexOf(Math.min(...counts))]
}
