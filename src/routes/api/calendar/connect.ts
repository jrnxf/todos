import { createFileRoute } from '@tanstack/react-router'
import { backToAccount, safeBack, startConsent } from '@/calendar/consent'
import { oauthClient } from '@/calendar/run'
import { env } from '@/server/env'
import { currentPerson } from '@/server/identity'

// The Connect button on the account page: off to Google to ask for a
// calendar of the app's own. With `?read`, the button that shows the
// person's other calendars in the views: the same, plus reading and
// changing those. An event's "Allow editing" adds `&back=<path>`, to come
// back to that event. Only a signed-in person gets here (src/start.ts).
export const Route = createFileRoute('/api/calendar/connect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const person = await currentPerson(request.headers)
        if (!person) return backToAccount('failed')
        if (!env.calendar.enabled) return backToAccount('unavailable')
        const asked = new URL(request.url).searchParams
        const read = asked.has('read')
        return startConsent(
          oauthClient(),
          env.auth.emailFor(person),
          read ? 'read' : 'sync',
          read ? safeBack(asked.get('back')) : null,
        )
      },
    },
  },
})
