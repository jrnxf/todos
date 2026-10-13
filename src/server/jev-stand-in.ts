// A stand-in for Jev, for the tests and for trying the add bar on a laptop
// without a key or a bill. It takes the request the app would send
// (src/lib/verify.ts) and answers in the real reply's shape, by a few crude
// rules of its own. It is not Jev and says nothing about how well Jev reads:
// `bun run eval:read` against the real service is what measures that.
//
// A to-do with the word "unsure" in it is answered with every probability
// short of the cut-offs, to show what falls back.
import { QUESTIONS } from '@/lib/verify'
import type { VerifyRequest } from '@/lib/verify'

const SURE = 0.95
const UNSURE = 0.5
/** Words that put a to-do in a tag, by the tag's name. */
const TAG_WORDS: Partial<Record<string, Array<string>>> = {
  house: ['mattress', 'radiators', 'kettle'],
  yard: ['hostas', 'tomatoes', 'roses'],
  kids: ['soccer', 'recital'],
  health: ['contact lenses', 'inhaler'],
}

export function standInReply(request: VerifyRequest) {
  const todo = request.state.todo
  const lower = todo.toLowerCase()
  const sure = /\bunsure\b/i.test(todo) ? UNSURE : SURE
  const questions = request.questions as Partial<
    Record<
      string,
      {
        type: string
        instructions: { phrase?: string }
        criteria: Record<string, unknown>
      }
    >
  >

  const choose = (id: string) => {
    const question = questions[id]
    if (!question) return []
    const options = Object.keys(question.criteria)
    const choice =
      options.find((name) =>
        (TAG_WORDS[name.toLowerCase()] ?? []).some((word) =>
          lower.includes(word),
        ),
      ) ?? 'none'
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
        },
      ],
    ]
  }

  // A day in a run of capitalised words is part of a name: "Taco Tuesday".
  const phrase = questions[QUESTIONS.when]?.instructions.phrase ?? ''
  const at = todo.indexOf(phrase)
  const named =
    /^\p{Lu}/u.test(phrase) && /\p{Lu}\p{L}*\s+$/u.test(todo.slice(0, at))

  return {
    model: 'jev-stand-in',
    answers: Object.fromEntries([
      ...choose(QUESTIONS.tag),
      ...choose(QUESTIONS.tagReversed),
      ...(questions[QUESTIONS.when]
        ? [[QUESTIONS.when, { type: 'noul', noul: named ? 1 - sure : sure }]]
        : []),
    ]),
    usage: { input_tokens: Math.ceil(JSON.stringify(request).length / 4) },
  }
}
