// Reading the rest of a to-do out of its typed title: whose it is, the tag,
// the heads-up and the flag, on top of the date that lib/when.ts reads.
// "Sam: flu shots for the kids sat 10:30 !" is Sam's, in Kids, on Saturday,
// and must not be missed.
//
// A guess that fills a button wrongly is worse than a button left empty, so
// each thing is read only where it is said, and whatever was read can be
// taken back (`skip`). The one hint is the tag (lib/tag-hints.ts), which
// may be read from the words of the task and gives way when they point two
// ways.
//
// With a TypeSafe key the server then has Jev check this reading
// (lib/verify.ts): it may pick a tag where none was read here, and take back
// a date read from words that are part of a name. The title and every other
// field are always these rules' own.
import { hintedTag } from './tag-hints'
import { parseWhen } from './when'
import type { LocalDate, LocalTime } from './dates'
import type { DateParser } from './when'

export const READ_FIELDS = ['when', 'who', 'tag', 'headsUp', 'flag'] as const
export type ReadField = (typeof READ_FIELDS)[number]

export interface ReadContext {
  today: LocalDate
  /** Who is typing: "I need to..." is theirs. */
  me: string
  people: Array<{ id: string; name: string }>
  tags: Array<{ id: number; name: string }>
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
    tagId?: number
    headsUpDays?: Array<number>
    mustNotMiss?: true
  }
  /** The words each field was read from, as typed. */
  phrases: Partial<Record<ReadField, string>>
  /**
   * The fields a model had the say in rather than the rules (lib/verify.ts):
   * a tag it picked, as '', and a date it took back, as the words the rules
   * had read it from.
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
// The same, opening the title and joined to the task by "to": "Remind me the
// day before to pack lunches". Its first group is the asking.
const HEADS_UP_OPENS = new RegExp(
  String.raw`^\s*(${ASK})\s+(?:${SPAN}(?:\s+${AHEAD})?\s*(?:,\s*and|,|and|&)\s*)*${SPAN}\s+${AHEAD}\s+to\s+`,
  'i',
)
const NO_HEADS_UP =
  /[,;]?\s*\b(?:(?:no|without(?:\s+an?)?)\s+(?:reminder|heads[- ]?up|alert|notification|nudge|ping)s?(?:\s+(?:needed|necessary|required|wanted|please))?|(?:don'?t|do\s+not|no\s+need\s+to|never)\s+(?:remind|alert|ping|nudge|notify|warn)(?:\s+(?:me|us))?)\b/i
// "!" on its own at the end, or "!!", or opening the title: "!! call the
// bank". Not the "!" that ends an ordinary sentence: the flag alerts
// everyone until the to-do is done.
const FLAG_MARK = /(\s+!+|!!+)\s*$|^\s*!+(?=\s)/
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
  /^\s*(me\s*[:,–-]|remind me to|note to self:?|i need to|i should|i ought to|i have to|i've got to|i gotta|i must|i'll|i will|i'm going to|i am going to)\s+/i
// "We need to book the cleaners": the household's, and no one person's. The
// saying is not the task.
const OURS =
  /^\s*(?:we\s+(?:need to|should|have to|have got to|gotta|must|ought to|will|are going to|are gonna)|we['’](?:ve got to|ll|re going to|re gonna)|let['’]s|let us)\s+/i
// "Michelle can you take out the trash": the asking is not the task.
const ASKING = String.raw`(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?|please\s+)`
// "Michelle will pick up the cake", as "I'll" is the typist's.
const WILL = String.raw`(?:\s+(?:to|should|needs to|has to|has got to|gotta|must|ought to|can|will|is going to|is gonna)|['’](?:s got to|ll|s going to|s gonna))`

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
// list of names or a sentence about them, "Sam and Michelle anniversary
// dinner", or is the first of a whole name, "Sam Smith concert tickets".
function whose(name: string, text: string): Array<RegExp> {
  const n = escaped(name)
  const opens = new RegExp(String.raw`^\s*${n}\s+`, 'i').exec(text)
  const wholeName =
    opens !== null &&
    /^\p{Lu}/u.test(text.slice(opens[0].length)) &&
    /(?<=\S\s+)\p{Ll}/u.test(text)
  return [
    new RegExp(String.raw`(^|\s)@${n}\b`, 'i'),
    new RegExp(String.raw`^\s*${n}\s*[:,-]\s+${ASKING}?`, 'i'),
    new RegExp(String.raw`^\s*${n}\s+${ASKING}`, 'i'),
    new RegExp(String.raw`^\s*${n}${WILL}\s+`, 'i'),
    new RegExp(String.raw`^\s*(ask|tell|have|get|remind)\s+${n}\s+to\s+`, 'i'),
    // "Can Sam take the dog out", "have Michelle call the roofer". Not
    // "have Sam over": a guest is not the one to do it.
    new RegExp(
      String.raw`^\s*(?:(?:can|could|will|would)\s+${n}\s+(?:please\s+)?|have\s+${n}\s+(?!(?:over|round|around|back|along|for|to|at|in|on|stay|visit)\b))`,
      'i',
    ),
    new RegExp(String.raw`\s*[-–(]\s*${n}\)?\s*$`, 'i'),
    ...(wholeName
      ? []
      : [
          new RegExp(
            String.raw`^\s*${n}\s+(?!(?:and|or|vs|is|was|are|were)\b|[&+/-])`,
            'i',
          ),
        ]),
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

  /** Whoever the title is handed to, their name taken out of what is left. */
  const theirs = () =>
    context.people.find((one) =>
      whose(one.name, rest).some((pattern) => take('who', pattern)),
    )

  if (reads('flag') && take('flag', FLAG_MARK)) fields.mustNotMiss = true

  // "Remind me the day before to pack lunches": the asking opened the title,
  // so it is the typist's, and the "to" that joined it to the task goes too.
  let askedByMe: string | null = null
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
        const opened = take('headsUp', HEADS_UP_OPENS)
        if (opened) askedByMe = /\bme\b/i.test(opened[1]) ? opened[1] : null
        else take('headsUp', HEADS_UP)
        fields.headsUpDays = each
      }
    }
  }

  // After the heads-up, so a stress that closed the task still closes it:
  // "Renew the passports, important, remind me a week before". With the
  // marks too, so "pay the fine ASAP!!" leaves no "ASAP" in the title.
  if (reads('flag') && FLAG_WORDS.some((pattern) => take('flag', pattern)))
    fields.mustNotMiss = true

  if (reads('who')) {
    const person = theirs()
    if (person) fields.assignee = person.id
    else if (take('who', MINE) ?? take('who', /\s*[-–(]\s*me\)?\s*$/i))
      fields.assignee = context.me
    else if (askedByMe) {
      fields.assignee = context.me
      phrases.who = askedByMe
    }
  }
  rest = rest.replace(OURS, '')

  // A tag named as a hashtag, a heading or in brackets: "#kids", "House:
  // ...", "Car - ...", "(house) ...".
  if (reads('tag')) {
    const tag = context.tags.find((one) => {
      const n = escaped(one.name)
      return (
        take('tag', new RegExp(String.raw`(^|\s)#${n}\b`, 'i')) ??
        take('tag', new RegExp(String.raw`^\s*${n}(?:\s*:|\s+[-–])\s+`, 'i')) ??
        take(
          'tag',
          new RegExp(
            String.raw`^\s*[([]\s*${n}\s*[)\]]\s*[:–-]?\s+|\s+[([]\s*${n}\s*[)\]]\s*$`,
            'i',
          ),
        )
      )
    })
    if (tag) fields.tagId = tag.id
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
  if (!title) return unread

  // Or a tag the title only points to, in words that stay in it: "Flu
  // shots for the kids" is in Kids, "Mow the lawn" in Yard.
  if (reads('tag') && fields.tagId === undefined) {
    const hinted = hintedTag(title, context.tags)
    if (hinted) {
      fields.tagId = hinted.tag.id
      phrases.tag = hinted.phrase
    }
  }

  return { title, fields, phrases, guessed: {} }
}
