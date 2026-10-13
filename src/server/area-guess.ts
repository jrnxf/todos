// Guessing which area a to-do belongs in, for the add bar, when its title
// does not say. The one thing asked of an outside service: Jev, TypeSafe AI's
// decision model, which is handed the areas and returns one of them with a
// probability (https://docs.typesafe.ai/api). It is optional. Without the
// TYPESAFE_API_KEY setting nothing is ever sent and the app is as it was.
//
// A wrong area is worse than none, so everything short of a confident,
// well-formed answer in time is "no guess": the area button stays empty.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
/** How sure the answer has to be before the area is filled in. */
export const AREA_FLOOR = 0.8
/** Past this the person has moved on; the guess is dropped. */
export const AREA_TIME_LIMIT_MS = 1500
const NONE = 'none'

interface Household {
  people: Array<{ name: string }>
  areas: Array<{ id: number; name: string }>
}

const option = (areaId: number) => `area_${areaId}`

/**
 * What is sent: the to-do's title, the first names (so "Sam's boots" reads
 * as a person and not a thing) and the area names. Nothing else leaves.
 */
export function areaQuestion(title: string, household: Household) {
  return {
    model: MODEL,
    state: {
      todo: title,
      people: household.people.map((person) => person.name),
    },
    questions: {
      area: {
        type: 'choice',
        instructions: `Which ONE area of this household's to-do list does \`todo\` belong in? Each option is an area's name. Pick \`${NONE}\` unless the to-do clearly belongs in one of them.`,
        criteria: {
          ...Object.fromEntries(
            household.areas.map((area) => [option(area.id), area.name]),
          ),
          [NONE]: 'It does not clearly belong in any of the areas.',
        },
      },
    },
  }
}

/** The area an answer names, if it names one of ours and is sure enough. */
export function areaFromAnswer(
  response: unknown,
  household: Household,
  floor = AREA_FLOOR,
): number | null {
  const answer = (
    response as {
      answers?: {
        area?: { choice?: unknown; probabilities?: Record<string, unknown> }
      }
    } | null
  )?.answers?.area
  const choice = answer?.choice
  if (typeof choice !== 'string') return null
  const area = household.areas.find((one) => option(one.id) === choice)
  const probability = answer?.probabilities?.[choice]
  if (!area || typeof probability !== 'number') return null
  return probability >= floor ? area.id : null
}

export async function guessArea(
  title: string,
  household: Household,
  options: {
    apiKey: string
    timeLimitMs?: number
    /** Stands in for the network in tests. */
    fetch?: typeof fetch
  },
): Promise<number | null> {
  if (!options.apiKey || !title.trim() || household.areas.length === 0)
    return null
  try {
    const response = await (options.fetch ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(areaQuestion(title, household)),
      signal: AbortSignal.timeout(options.timeLimitMs ?? AREA_TIME_LIMIT_MS),
    })
    if (!response.ok) return null
    return areaFromAnswer(await response.json(), household)
  } catch {
    // Offline, too slow, or not JSON: no guess.
    return null
  }
}
