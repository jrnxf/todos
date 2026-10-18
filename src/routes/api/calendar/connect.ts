import { createFileRoute } from '@tanstack/react-router'
import { backToAccount, startConsent } from '@/calendar/consent'
import { oauthClient } from '@/calendar/run'
import { env } from '@/server/env'
import { currentPerson } from '@/server/identity'

// The Connect button on the account page: off to Google to ask for a
// calendar of the app's own. Only a signed-in person gets here (src/start.ts).
export const Route = createFileRoute('/api/calendar/connect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const person = await currentPerson(request.headers)
        if (!person) return backToAccount('failed')
        if (!env.calendar.enabled) return backToAccount('unavailable')
        return startConsent(oauthClient(), env.auth.emailFor(person))
      },
    },
  },
})
