import { createFileRoute } from '@tanstack/react-router'
import { backToAccount, finishConsent, forgetConsent } from '@/calendar/consent'
import { connectCalendar, oauthClient } from '@/calendar/run'
import { env } from '@/server/env'
import { currentPerson } from '@/server/identity'

// Where Google sends a person back after they said yes, or no. The calendar
// is kept for whoever is signed in on this browser, which is who asked.
export const Route = createFileRoute('/api/calendar/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const client = oauthClient()
        const forget = forgetConsent(client.redirectUri.startsWith('https://'))
        const person = await currentPerson(request.headers)
        if (!person) return backToAccount('failed', forget)
        if (!env.calendar.enabled) return backToAccount('unavailable', forget)
        const reply = await finishConsent(request, client)
        if ('outcome' in reply) return backToAccount(reply.outcome, forget)
        await connectCalendar(person, reply.grant)
        return backToAccount('connected', forget)
      },
    },
  },
})
