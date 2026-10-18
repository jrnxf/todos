import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '@/db/client'
import { requestCalendarSync } from '@/calendar/run'
import { verifyPush } from '@/calendar/sync'

// Google calls here when something changed in a Todos calendar. It is open
// without a session (src/start.ts), so it believes only a call that carries
// the channel, resource and token the app gave Google, and it reads nothing
// from the call but that: the pass it starts asks Google what changed.
const NO_STORE = { 'Cache-Control': 'no-store' }

export const Route = createFileRoute('/api/calendar/notify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const push = await verifyPush(getDb(), request.headers)
        if (!push) return new Response(null, { status: 404, headers: NO_STORE })
        // The first call on a new channel only says it is open.
        if (push.state !== 'sync') requestCalendarSync()
        return new Response(null, { status: 204, headers: NO_STORE })
      },
    },
  },
})
