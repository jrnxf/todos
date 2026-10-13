// "Who is asking" is answered here and nowhere else: the Google account
// behind the session, looked up in the PEOPLE_EMAILS list. The list is
// consulted on every request, not only at sign-in, so taking an address off
// it shuts that person out at once.
import { getAuth } from './auth'
import { env } from './env'

/** The person a request comes from, or null if it comes from nobody. */
export async function currentPerson(headers: Headers): Promise<string | null> {
  // `vite dev` only. The build replaces the flag with `false` and drops this.
  if (import.meta.env.DEV && env.auth.devSignedInAs) {
    return env.auth.devSignedInAs
  }
  const session = await getAuth()?.api.getSession({ headers })
  if (!session?.user.emailVerified) return null
  return env.auth.personFor(session.user.email)
}
