// Reading the rest of a to-do out of its typed title: whose it is, the area,
// the heads-up and the flag, on top of the date that lib/when.ts reads.
// "Sam: flu shots for the kids sat 10:30 !" is Sam's, in Kids, on Saturday,
// and must not be missed.
//
// A guess that fills a button wrongly is worse than a button left empty, so
// each thing is read only where it is said, and whatever was read can be
// taken back (`skip`). The one hint is the area (lib/area-hints.ts), which
// may be read from the words of the task and gives way when they point two
// ways.
//
// With a TypeSafe key the server also asks Jev (src/server/jev-read.ts), in
// one of two ways (`JEV_USE`). Jev first: what Jev is sure of comes first and
// these rules read the rest. Jev fills the gaps: these rules read first, and
// Jev is asked only about what they left empty. Either way the rules read all
// of it when there is no answer.
import { hintedArea } from './area-hints'
import { parseWhen } from './when'
import type { LocalDate, LocalTime } from './dates'
import type { DateParser } from './when'

export type ReadField = 'when' | 'who' | 'area' | 'headsUp' | 'flag'

const FIELDS: ReadonlyArray<ReadField> = [
  'when',
  'who',
  'area',
  'headsUp',
  'flag',
]

/**
 * How Jev's answer is used.
 *
 * `first`: Jev is asked about every open field and about each word of the
 * title; what it is sure of fills the field and tidies the title, and the
 * rules read the rest.
 *
 * `gaps`: the rules read first and write the title alone. Jev is asked only
 * about a field they left empty, and about the area unless it was named
 * outright ("#kids", "House: ..."). It never touches a field the rules read.
 */
export type JevUse = 'first' | 'gaps'

/**
 * Which of the two the running app uses. `bun run eval:read` scores this
 * one, the rules alone and the ways that are not in the app, on the same
 * sentences.
 */
export const JEV_USE: JevUse = 'first'

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
  /** How that answer is used; `JEV_USE` unless the eval says otherwise. */
  jevUse?: JevUse
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

const COUNT: Partial<Record<string, number>> = {
  a: 1,
  an: 1,
  the: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  ten: 10,
}
const UNIT_DAYS: Partial<Record<string, number>> = {
  day: 1,
  night: 1,
  week: 7,
  month: 30,
}
/** The longest heads-up the server keeps, and how many of them. */
const MOST_DAYS = 365
const MOST_HEADS_UPS = 8
// "2 days", "a week", "the day": how far ahead.
const SPAN = String.raw`(?:(?:\d+|an?|one|two|three|four|five|six|seven|ten)\s+(?:day|week|month)s?|the\s+(?:day|night|week|month))`
const AHEAD = String.raw`(?:before(?:hand)?|ahead(?:\s+of\s+time)?|early|earlier|in\s+advance|prior|out)`
// "remind me", "heads up", "ping us", "let me know", "give me a heads up".
const ASK = String.raw`(?:(?:give|send)\s+(?:me|us)\s+an?\s+)?(?:(?:remind(?:er)?|heads[- ]?up|alert|warn(?:ing)?|nudge|ping|notify)(?:\s+(?:me|us))?|(?:tell|let)\s+(?:me|us)(?:\s+know)?)`
// One or several, each with or without its "before": "a week before and the
// day before", "3 days and 1 day before". Not "2 days before the party":
// that is ahead of something else, not of the deadline.
const HEADS_UP = new RegExp(
  String.raw`[,;]?\s*\b(?:and\s+)?${ASK}\s+((?:${SPAN}(?:\s+${AHEAD})?\s*(?:,\s*and|,|and|&)\s*)*${SPAN}\s+${AHEAD})\b(?!\s+(?:the|my|our|his|her|their|its|that|this|we|i|he|she|they|it)\b)`,
  'i',
)
const NO_HEADS_UP =
  /[,;]?\s*\b(?:(?:no|without(?:\s+an?)?)\s+(?:reminder|heads[- ]?up|alert|notification|nudge|ping)s?|(?:don'?t|do\s+not|no\s+need\s+to|never)\s+(?:remind|alert|ping|nudge|notify|warn)(?:\s+(?:me|us))?)\b/i
// "!" on its own at the end, or "!!". Not the "!" that ends an ordinary
// sentence: the flag alerts everyone until the to-do is done.
const FLAG_MARK = /(\s+!+|!!+)\s*$/
// Said as a phrase, wherever it is.
const FLAG_PHRASE =
  /[,;]?\s*(?:[-–]\s+)?\b(must not miss|can'?t miss|cannot miss|do not forget|don'?t forget|can'?t forget|must not forget|asap)\b[:!,]?(\s+to\b)?/i
// A word that stresses only where it is set apart: "Urgent: call the bank",
// "Renew the passports, important". In the run of the sentence it describes
// something ("Urgent care", "the important notice") and is the task's.
const STRESS = String.raw`(?:very\s+|super\s+)?(?:important|urgent|critical|(?:high|top)\s+priority|must[- ]do|time[- ]sensitive)`
const FLAG_OPENS = new RegExp(String.raw`^\s*${STRESS}\s*[:!–-]+\s+`, 'i')
const FLAG_CLOSES = new RegExp(
  String.raw`(?:[,;]|\s[-–(])?\s*\b${STRESS}\)?[!.]*\s*$`,
  'i',
)
const FLAG_BETWEEN = new RegExp(String.raw`[,;]\s*${STRESS}\s*(?=[,;])`, 'i')
// Shouted, in a title that is not: "URGENT call the insurance company".
const FLAG_SHOUTED =
  /(?:[,;]|\s[-–])?\s*\b(URGENT|IMPORTANT|CRITICAL|(?:HIGH|TOP) PRIORITY|MUST DO)\b[:!,]?(?=.*\p{Ll})/u
const FLAG_WORDS = [
  FLAG_PHRASE,
  FLAG_OPENS,
  FLAG_CLOSES,
  FLAG_BETWEEN,
  FLAG_SHOUTED,
]
const MINE =
  /^\s*(remind me to|note to self:?|i need to|i should|i ought to|i have to|i've got to|i gotta|i must|i'll|i will|i'm going to|i am going to)\s+/i
// "Michelle can you take out the trash": the asking is not the task.
const ASKING = String.raw`(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?|please\s+)`

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
// opens the title does: "Sam visit the garden center". Unless it opens a
// list of names or a sentence about them: "Sam and Michelle anniversary
// dinner".
function whose(name: string): Array<RegExp> {
  const n = escaped(name)
  return [
    new RegExp(String.raw`(^|\s)@${n}\b`, 'i'),
    new RegExp(String.raw`^\s*${n}\s*[:,-]\s+${ASKING}?`, 'i'),
    new RegExp(String.raw`^\s*${n}\s+${ASKING}`, 'i'),
    new RegExp(
      String.raw`^\s*${n}\s+(to|should|needs to|has to|must|can)\s+`,
      'i',
    ),
    new RegExp(String.raw`^\s*(ask|tell|have|get|remind)\s+${n}\s+to\s+`, 'i'),
    new RegExp(String.raw`\s*[-–(]\s*${n}\)?\s*$`, 'i'),
    new RegExp(
      String.raw`^\s*${n}\s+(?!(?:and|or|vs|is|was|are|were)\b|[&+/-])`,
      'i',
    ),
  ]
}

export function readTitle(
  parser: DateParser | null,
  text: string,
  context: ReadContext,
): TitleRead {
  return reading(parser, text, context).read
}

/**
 * The fields to ask Jev about when it fills the gaps: those the rules left
 * empty in `text`, and the area unless it was named outright. Never one set
 * by hand or taken back.
 */
export function gapsIn(
  parser: DateParser | null,
  text: string,
  context: ReadContext,
): Array<ReadField> {
  return reading(parser, text, { ...context, jev: null }).gaps
}

function reading(
  parser: DateParser | null,
  text: string,
  context: ReadContext,
): { read: TitleRead; gaps: Array<ReadField> } {
  const unread: TitleRead = {
    title: text.trim(),
    fields: {},
    phrases: {},
    guessed: {},
  }
  const fields: TitleRead['fields'] = {}
  const phrases: TitleRead['phrases'] = {}
  const guessed: TitleRead['guessed'] = {}
  const use = context.jevUse ?? JEV_USE
  // Jev's answer where it comes first; where it fills the gaps it waits for
  // the rules to have read.
  const jev = use === 'first' ? context.jev : null
  const open = (field: ReadField) =>
    !context.skip?.has(field) && !context.notJevs?.has(field)
  let rest = text

  // Jev first: what it was sure of fills the field, and the words that only
  // said it leave the title. A field set by hand or taken back is not its to
  // fill.
  if (jev) {
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

  /** Whoever the title is handed to, their name taken out of what is left. */
  const theirs = () =>
    context.people.find((one) =>
      whose(one.name).some((pattern) => take('who', pattern)),
    )

  const marked = reads('flag') && take('flag', FLAG_MARK) !== null
  if (marked) fields.mustNotMiss = true

  if (reads('headsUp')) {
    if (take('headsUp', NO_HEADS_UP)) fields.headsUpDays = []
    else {
      const days = [
        ...(HEADS_UP.exec(rest)?.[1] ?? '').matchAll(
          /(\d+|an?|the|one|two|three|four|five|six|seven|ten)\s+(day|night|week|month)/gi,
        ),
      ].map(
        ([, count, unit]) =>
          (COUNT[count.toLowerCase()] ?? Number(count)) *
          (UNIT_DAYS[unit.toLowerCase()] ?? 1),
      )
      const each = [...new Set(days)].sort((a, b) => a - b)
      // Only what can be kept; anything else stays in the title.
      if (
        each.length > 0 &&
        each.length <= MOST_HEADS_UPS &&
        each.every((n) => n >= 1 && n <= MOST_DAYS)
      ) {
        take('headsUp', HEADS_UP)
        fields.headsUpDays = each
      }
    }
  }

  // After the heads-up, so a stress that closed the task still closes it:
  // "Renew the passports, important, remind me a week before".
  if (
    reads('flag') &&
    !marked &&
    FLAG_WORDS.some((pattern) => take('flag', pattern))
  )
    fields.mustNotMiss = true

  if (reads('who')) {
    const person = theirs()
    if (person) fields.assignee = person.id
    else if (take('who', MINE) ?? take('who', /\s*[-–(]\s*me\)?\s*$/i))
      fields.assignee = context.me
  }

  // An area said as a tag or a heading: "#kids", "House: ...", "Car - ...".
  let named = false
  if (reads('area')) {
    const area = context.areas.find((one) => {
      const n = escaped(one.name)
      return (
        take('area', new RegExp(String.raw`(^|\s)#${n}\b`, 'i')) ??
        take('area', new RegExp(String.raw`^\s*${n}(?:\s*:|\s+[-–])\s+`, 'i'))
      )
    })
    if (area) {
      fields.areaId = area.id
      named = true
    }
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
  rest = tidy(when ? when.title : rest)
  // A name the date stood in front of: "thurs - Michelle - get the oil
  // changed".
  if (when && reads('who') && fields.assignee === undefined) {
    const person = theirs()
    if (person) fields.assignee = person.id
  }
  const title = tidy(rest)
  // Nothing but things to read is not a to-do: "Tomorrow" stays "Tomorrow".
  // Jev's reading is the first to go: the rules alone may leave a title.
  if (!title)
    return jev
      ? reading(parser, text, { ...context, jev: null })
      : { read: unread, gaps: [] }

  // Or an area the title only points to, in words that stay in it: "Flu
  // shots for the kids" is in Kids, "Mow the lawn" in Yard.
  if (reads('area') && fields.areaId === undefined) {
    const hinted = hintedArea(title, context.areas)
    if (hinted) {
      fields.areaId = hinted.area.id
      phrases.area = hinted.phrase
    }
  }

  // What the rules left empty. The area is one of them unless it was named
  // outright: one the title only points to is a hint, and Jev may know better.
  const left: Record<ReadField, boolean> = {
    when: fields.dueDate === undefined,
    who: fields.assignee === undefined,
    area: !named,
    headsUp: fields.headsUpDays === undefined,
    flag: fields.mustNotMiss === undefined,
  }
  const gaps = FIELDS.filter((field) => open(field) && left[field])

  // Jev fills the gaps: only those, and never a word of the title.
  const filler = use === 'gaps' ? context.jev : null
  if (filler) {
    const fills = (field: ReadField) => gaps.includes(field)
    if (filler.when && fills('when')) {
      fields.dueDate = filler.when.dueDate
      fields.dueTime = filler.when.dueTime
      guessed.when = ''
    }
    if (filler.who !== undefined && fills('who')) {
      fields.assignee = filler.who
      guessed.who = ''
    }
    if (filler.area !== undefined && fills('area')) {
      fields.areaId = filler.area
      delete phrases.area
      guessed.area = ''
    }
    if (filler.headsUp && fills('headsUp')) {
      fields.headsUpDays = filler.headsUp
      guessed.headsUp = ''
    }
    if (filler.flag && fills('flag')) {
      fields.mustNotMiss = true
      guessed.flag = ''
    }
  }

  return { read: { title, fields, phrases, guessed }, gaps }
}
