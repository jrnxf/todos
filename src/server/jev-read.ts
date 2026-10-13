// Having Jev, TypeSafe AI's decision model, check the add bar's reading of a
// new to-do's title. The rules in the page read the title first
// (src/lib/read.ts). Jev is then asked the two things that take judgment
// (src/lib/verify.ts): which tag, where the rules found none, and whether the
// words the rules read a date from are really when it is due. One request
// carries both.
//
// It is optional. Without the TYPESAFE_API_KEY setting nothing is ever sent
// and the rules' reading stands.
//
// A wrong fill is worse than none, so only a sure, well-formed answer in
// time counts. Everything short of that is "no answer", and the rules'
// reading stands.
import * as chrono from 'chrono-node'
import { CUTOFFS, answersIn, verdictFrom, verifyRequest } from '@/lib/verify'
import type { ReadContext } from '@/lib/read'
import type { Verdict } from '@/lib/verify'

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
/** Past this the person has moved on; the answer is dropped. */
export const TIME_LIMIT_MS = 1500

/**
 * Asks Jev about the rules' reading of a title. Null is "no answer": no key,
 * nothing to ask, or the service was slow, down, or made no sense. The
 * rules' reading then stands. `household.skip` holds the fields set by hand
 * or taken back, which are not asked about.
 */
export async function checkWithJev(
  title: string,
  household: ReadContext,
  options: {
    apiKey: string
    endpoint?: string
    timeLimitMs?: number
    /** Stands in for the network in tests. */
    fetch?: typeof fetch
  },
): Promise<Verdict | null> {
  if (!options.apiKey || !title.trim()) return null
  const { rules, request } = verifyRequest(chrono, title, household)
  if (!request) return null
  try {
    const response = await (options.fetch ?? fetch)(
      options.endpoint ?? JEV_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(options.timeLimitMs ?? TIME_LIMIT_MS),
      },
    )
    if (!response.ok) return null
    const answers = answersIn(await response.json())
    return answers && verdictFrom(answers, rules, household, CUTOFFS)
  } catch {
    // Offline, too slow, or not JSON: no answer.
    return null
  }
}
