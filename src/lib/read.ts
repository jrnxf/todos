// Reading the rest of a to-do out of its typed title: whose it is, the area,
// the heads-up and the flag, on top of the date that lib/when.ts reads.
// "Sam: flu shots for the kids sat 10:30 !" is Sam's, in Kids, on Saturday,
// and must not be missed.
//
// A guess that fills a button wrongly is worse than a button left empty, so
// nothing here guesses: each thing is read only where it is said outright,
// and whatever was read can be taken back (`skip`).
//
// With a TypeSafe key the server also asks Jev (src/server/jev-read.ts). What
// Jev is sure of comes first; these rules read the rest, and all of it when
// there is no answer.
import { HEADS_UP_CHOICES } from './board'
import { parseWhen } from './when'
import type { LocalDate, LocalTime } from './dates'
import type { DateParser } from './when'

export type ReadField = 'when' | 'who' | 'area' | 'headsUp' | 'flag'

export interface ReadContext {
  today: LocalDate
  /** Who is typing: "I need to..." is theirs. */
  me: string
  people: Array<{ id: string; name: string }>
  areas: Array<{ id: number; name: string }>
  /** Fields to leave alone: set by hand, or read and then taken back. */
  skip?: ReadonlySet<ReadField>
  /** What Jev was sure of for this very text, if it was asked and answered. */
  jev?: JevRead | null
  /** Fields Jev may not fill, though the rules still read them. */
  notJevs?: ReadonlySet<ReadField>
}

/**
 * Jev's reading of a title: only the fields it was sure of. A field that is
 * absent is one the rules read instead.
 */
export interface JevRead {
  when?: { dueDate: LocalDate; dueTime: LocalTime | null }
  who?: string
  area?: number
  headsUp?: Array<number>
  flag?: true
  /**
   * The words that only say one of those fields and so leave the title, by
   * their place in `titleWords`. Never a word of the task itself.
   */
  drops: Array<{ index: number; field: ReadField }>
}

/** A title's words, in order: what Jev is asked about one by one. */
export function titleWords(text: string): Array<{ text: string; at: number }> {
  return [...text.matchAll(/\S+/g)].map((found) => ({
    text: found[0],
    at: found.index,
  }))
}

export interface TitleRead {
  /** The title with everything that was read taken out. */
  title: string
  /** Only the fields that were read; the rest are absent. */
  fields: {
    dueDate?: LocalDate
    dueTime?: LocalTime | null
    assignee?: string
    areaId?: number
    headsUpDays?: Array<number>
    mustNotMiss?: true
  }
  /** The words each field was read from, as typed. */
  phrases: Partial<Record<ReadField, string>>
  /**
   * The fields Jev filled rather than the rules, each with the words that
   * left the title for it; empty when none did.
   */
  guessed: Partial<Record<ReadField, string>>
}

const OFFERED = new Set(HEADS_UP_CHOICES.map((choice) => choice.days))
const COUNT: Partial<Record<string, number>> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
}
const SPAN = String.raw`(?:\d+|an?|one|two|three)\s+(?:day|week)s?`
const HEADS_UP = new RegExp(
  String.raw`[,;]?\s*\b(?:remind(?:er)?(?:\s+(?:me|us))?|heads[- ]?up|alert(?:\s+(?:me|us))?|warn(?:\s+(?:me|us))?|nudge(?:\s+(?:me|us))?)\s+(${SPAN}(?:\s*(?:,|and|&)\s*${SPAN})*)\s+(?:before|ahead|early|in advance)\b`,
  'i',
)
const NO_HEADS_UP = /[,;]?\s*\bno (reminder|heads[- ]?up|alert)s?\b/i
// "!" on its own at the end, or "!!". Not the "!" that ends an ordinary
// sentence: the flag alerts everyone until the to-do is done.
const FLAG_MARK = /(\s+!+|!!+)\s*$/
const FLAG_WORDS =
  /[,;]?\s*\b(must not miss|can'?t miss|do not forget|don'?t forget|important|urgent|critical)\b[:!,]?(\s+to\b)?/i
const MINE =
  /^\s*(remind me to|i need to|i should|i have to|i must|i'll|i will)\s+/i

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '')
    .trim()
}

// Where a name means "this is theirs". A name in passing does not: "Call Sam"
// and "Sam's eye appointment" are about Sam, not Sam's to do. A name that
// opens the title does: "Sam visit the garden center".
function whose(name: string): Array<RegExp> {
  const n = escaped(name)
  return [
    new RegExp(String.raw`(^|\s)@${n}\b`, 'i'),
    new RegExp(String.raw`^\s*${n}\s*[:,-]\s+`, 'i'),
    new RegExp(
      String.raw`^\s*${n}\s+(to|should|needs to|has to|must|can)\s+`,
      'i',
    ),
    new RegExp(String.raw`^\s*(ask|tell|have|get|remind)\s+${n}\s+to\s+`, 'i'),
    new RegExp(String.raw`\s*[-–(]\s*${n}\)?\s*$`, 'i'),
    new RegExp(String.raw`^\s*${n}\s+`, 'i'),
  ]
}

export function readTitle(
  parser: DateParser | null,
  text: string,
  context: ReadContext,
): TitleRead {
  const unread: TitleRead = {
    title: text.trim(),
    fields: {},
    phrases: {},
    guessed: {},
  }
  const fields: TitleRead['fields'] = {}
  const phrases: TitleRead['phrases'] = {}
  const guessed: TitleRead['guessed'] = {}
  const jev = context.jev
  let rest = text

  // Jev first: what it was sure of fills the field, and the words that only
  // said it leave the title. A field set by hand or taken back is not its to
  // fill.
  if (jev) {
    const open = (field: ReadField) =>
      !context.skip?.has(field) && !context.notJevs?.has(field)
    if (jev.when && open('when')) {
      fields.dueDate = jev.when.dueDate
      fields.dueTime = jev.when.dueTime
      guessed.when = ''
    }
    if (jev.who !== undefined && open('who')) {
      fields.assignee = jev.who
      guessed.who = ''
    }
    if (jev.area !== undefined && open('area')) {
      fields.areaId = jev.area
      guessed.area = ''
    }
    if (jev.headsUp && open('headsUp')) {
      fields.headsUpDays = jev.headsUp
      guessed.headsUp = ''
    }
    if (jev.flag && open('flag')) {
      fields.mustNotMiss = true
      guessed.flag = ''
    }
    const words = titleWords(text)
    const drops = jev.drops.filter(
      (drop) => guessed[drop.field] !== undefined && drop.index < words.length,
    )
    const gone = new Set(drops.map((drop) => drop.index))
    for (const drop of drops)
      guessed[drop.field] =
        `${guessed[drop.field]} ${words[drop.index].text}`.trim()
    rest = words
      .filter((_word, index) => !gone.has(index))
      .map((word) => word.text)
      .join(' ')
  }
  const reads = (field: ReadField) =>
    !context.skip?.has(field) && guessed[field] === undefined

  /** Takes the first match out of what is left and notes it against `field`. */
  const take = (field: ReadField, pattern: RegExp): RegExpExecArray | null => {
    const found = pattern.exec(rest)
    if (!found) return null
    phrases[field] = found[0].trim()
    rest = `${rest.slice(0, found.index)} ${rest.slice(found.index + found[0].length)}`
    return found
  }

  if (reads('flag') && (take('flag', FLAG_MARK) ?? take('flag', FLAG_WORDS)))
    fields.mustNotMiss = true

  if (reads('headsUp')) {
    if (take('headsUp', NO_HEADS_UP)) fields.headsUpDays = []
    else {
      const days = [
        ...(HEADS_UP.exec(rest)?.[1] ?? '').matchAll(
          /(\d+|an?|one|two|three)\s+(day|week)/gi,
        ),
      ].map(
        ([, count, unit]) =>
          (COUNT[count.toLowerCase()] ?? Number(count)) *
          (unit.toLowerCase() === 'week' ? 7 : 1),
      )
      // Only what the picker offers; anything else stays in the title.
      if (days.length > 0 && days.every((n) => OFFERED.has(n))) {
        take('headsUp', HEADS_UP)
        fields.headsUpDays = [...new Set(days)].sort((a, b) => a - b)
      }
    }
  }

  if (reads('who')) {
    const person = context.people.find((one) =>
      whose(one.name).some((pattern) => take('who', pattern)),
    )
    if (person) fields.assignee = person.id
    else if (take('who', MINE) ?? take('who', /\s*[-–(]\s*me\)?\s*$/i))
      fields.assignee = context.me
  }

  // An area said as a tag or a heading: "#kids", "House: ...".
  if (reads('area')) {
    const area = context.areas.find((one) => {
      const n = escaped(one.name)
      return (
        take('area', new RegExp(String.raw`(^|\s)#${n}\b`, 'i')) ??
        take('area', new RegExp(String.raw`^\s*${n}\s*:\s+`, 'i'))
      )
    })
    if (area) fields.areaId = area.id
  }

  const when =
    parser && reads('when')
      ? parseWhen(parser, tidy(rest), context.today)
      : null
  if (when) {
    fields.dueDate = when.dueDate
    fields.dueTime = when.dueTime
    phrases.when = when.phrase
  }
  const title = tidy(when ? when.title : rest)
  // Nothing but things to read is not a to-do: "Tomorrow" stays "Tomorrow".
  // Jev's reading is the first to go: the rules alone may leave a title.
  if (!title)
    return jev ? readTitle(parser, text, { ...context, jev: null }) : unread

  // Or an area named in passing, which stays in the title: "Flu shots for
  // the kids" is in Kids.
  if (reads('area') && fields.areaId === undefined) {
    const words = new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    const area = context.areas.find((one) => words.has(one.name.toLowerCase()))
    if (area) {
      fields.areaId = area.id
      phrases.area = area.name.toLowerCase()
    }
  }

  return { title, fields, phrases, guessed }
}
