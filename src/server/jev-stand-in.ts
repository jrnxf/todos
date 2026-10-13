// A stand-in for Jev, for the tests and for trying the add bar on a laptop
// without a key or a bill. It takes the request the app would send and
// answers in the real reply's shape, by a few crude rules of its own. It is
// not Jev and says nothing about how well Jev reads: `bun run eval:read`
// against the real service is what measures that.
//
// A to-do with the word "unsure" in it is answered with every probability
// under the floors, to show what falls back.
import type { jevRequest } from './jev-read'

type Request = ReturnType<typeof jevRequest>
interface Choice {
  type: 'choice'
  instructions: unknown
  criteria: Record<string, string>
}

const SURE = 0.95
const UNSURE = 0.5
const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
/** Words that put a to-do in an area, by the area's name. */
const AREA_WORDS: Partial<Record<string, Array<string>>> = {
  house: ['garden', 'gutters', 'furnace', 'plumber', 'lawn'],
  kids: ['school', 'pediatrician', 'soccer', 'daycare'],
  paperwork: ['tax', 'taxes', 'passport', 'insurance', 'receipts'],
}

const bare = (word: string) => word.toLowerCase().replace(/[.,;:!?]+$/, '')

function weekdayOf(word: string): string | undefined {
  const said = bare(word)
  return WEEKDAYS.find(
    (day) => said === day || (said.length >= 3 && said === day.slice(0, 3)),
  )
}

const isDay = (word: string) =>
  weekdayOf(word) !== undefined || ['today', 'tomorrow'].includes(bare(word))
const isClock = (word: string) => CLOCK.test(bare(word))

export function standInReply(request: Request) {
  const todo = request.state.todo
  const words = todo.split(/\s+/).filter(Boolean)
  const lower = todo.toLowerCase()
  const sure = /\bunsure\b/i.test(todo) ? UNSURE : SURE
  const questions = request.questions as Record<
    string,
    Choice | { type: 'noul' } | undefined
  >

  /** A Choice answered with `wanted`, or `otherwise` if it was not offered. */
  const choose = (
    id: string,
    wanted: string | undefined,
    otherwise: string,
  ) => {
    const question = questions[id]
    if (question?.type !== 'choice') return []
    const options = Object.keys(question.criteria)
    const choice = wanted && options.includes(wanted) ? wanted : otherwise
    const rest = (1 - sure) / Math.max(1, options.length - 1)
    return [
      [
        id,
        {
          type: 'choice',
          choice,
          probabilities: Object.fromEntries(
            options.map((option) => [option, option === choice ? sure : rest]),
          ),
          confidence: sure,
        },
      ],
    ]
  }
  /** The option of a Choice whose description passes `test`. */
  const optionWhere = (id: string, test: (description: string) => boolean) => {
    const question = questions[id]
    if (question?.type !== 'choice') return undefined
    return Object.entries(question.criteria).find(([, description]) =>
      test(description.toLowerCase()),
    )?.[0]
  }

  const day = words.find(isDay)
  const weekday = day && weekdayOf(day)
  const clock = CLOCK.exec(bare(words.find(isClock) ?? ''))
  const hour = clock
    ? (Number(clock[1]) % 12) + (clock[3].toLowerCase() === 'pm' ? 12 : 0)
    : 0
  const first = bare(words[0] ?? '')
  const mine = /^(i need to|i should|i have to|i must|i'll|i will)\b/i.test(
    todo,
  )
  const alert = /\b(no reminder)\b|\bremind me (.+?) before\b/i.exec(todo)
  const alertDays = { 'a day': 1, '1 day': 1, '3 days': 3, 'a week': 7 }[
    alert?.[2]?.toLowerCase() ?? ''
  ]
  const flagged = /don'?t forget|must not miss|important|urgent|!!/i.test(todo)

  const wordSays = (index: number): string | undefined => {
    const word = bare(words[index])
    const next = words[index + 1] ?? ''
    if (isDay(word) || isClock(word)) return 'when'
    if (['on', 'at', 'by'].includes(word) && (isDay(next) || isClock(next)))
      return 'when'
    if (
      index === 0 &&
      optionWhere('person', (name) => name.split(',')[0] === word)
    )
      return 'who'
    if (/^(don'?t|forget)$/.test(word) && /don'?t forget/i.test(todo))
      return 'flag'
    if (/^(important|urgent|!!+)$/.test(word)) return 'flag'
    if (alert) {
      const from = lower.slice(0, alert.index).split(/\s+/).filter(Boolean)
      const span = alert[0].split(/\s+/).length
      if (index >= from.length && index < from.length + span) return 'headsUp'
    }
    return undefined
  }

  return {
    model: 'jev-stand-in',
    answers: Object.fromEntries([
      ...choose(
        'date',
        optionWhere('date', (description) =>
          weekday
            ? description.startsWith(weekday)
            : day !== undefined && description.endsWith(`: ${bare(day)}`),
        ),
        'none',
      ),
      ...choose(
        'time',
        clock
          ? `time_${String(hour).padStart(2, '0')}:${clock[2] || '00'}`
          : undefined,
        clock ? 'unlisted' : 'none',
      ),
      ...choose(
        'person',
        optionWhere('person', (name) =>
          mine
            ? name.includes('who is typing')
            : first !== '' && name.split(',')[0] === first,
        ),
        'none',
      ),
      ...choose(
        'area',
        optionWhere('area', (name) =>
          (AREA_WORDS[name] ?? []).some((word) =>
            new RegExp(String.raw`\b${word}\b`).test(lower),
          ),
        ),
        'none',
      ),
      ...choose(
        'alert',
        alert?.[1] ? 'off' : alertDays ? `days_${alertDays}` : undefined,
        alert ? 'unlisted' : 'none',
      ),
      ...(questions.flag
        ? [['flag', { type: 'noul', noul: flagged ? sure : 1 - sure }]]
        : []),
      ...words.flatMap((_word, index) =>
        choose(`word_${index}`, wordSays(index), 'task'),
      ),
    ]),
    usage: { input_tokens: Math.ceil(JSON.stringify(request).length / 4) },
  }
}
