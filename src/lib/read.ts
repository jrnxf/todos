// Reading the rest of a to-do out of its typed title: whose it is, the area,
// the heads-up and the flag, on top of the date that lib/when.ts reads.
// "Sam: flu shots for the kids sat 10:30 !" is Sam's, in Kids, on Saturday,
// and must not be missed.
//
// A guess that fills a button wrongly is worse than a button left empty, so
// nothing here guesses: each thing is read only where it is said outright,
// and whatever was read can be taken back (`skip`).
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

// Where a name means "this is theirs". A name alone does not: "Call Sam" and
// "Sam's eye appointment" are about Sam, not Sam's to do.
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
  ]
}

export function readTitle(
  parser: DateParser | null,
  text: string,
  context: ReadContext,
): TitleRead {
  const unread: TitleRead = { title: text.trim(), fields: {}, phrases: {} }
  const fields: TitleRead['fields'] = {}
  const phrases: TitleRead['phrases'] = {}
  const reads = (field: ReadField) => !context.skip?.has(field)
  let rest = text

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
  if (!title) return unread

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

  return { title, fields, phrases }
}
