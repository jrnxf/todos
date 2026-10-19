import { createFileRoute } from '@tanstack/react-router'
import {
  backTo,
  backToAccount,
  finishConsent,
  forgetConsent,
} from '@/calendar/consent'
import { readsCalendars } from '@/calendar/google'
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
        // Asked from an event: back to it, which can be changed or not as
        // Google answered. Only a trip that failed outright says so first.
        if (reply.back && !('outcome' in reply && reply.outcome === 'failed')) {
          if ('grant' in reply) await connectCalendar(person, reply.grant)
          return backTo(reply.back, forget)
        }
        if ('outcome' in reply) return backToAccount(reply.outcome, forget)
        await connectCalendar(person, reply.grant)
        if (reply.want === 'sync') return backToAccount('connected', forget)
        return backToAccount(
          readsCalendars(reply.grant.scopes) ? 'reading' : 'reading-denied',
          forget,
        )
      },
    },
  },
})
