// The Worker's entry. Requests go to TanStack Start unchanged; the Cron
// Trigger in wrangler.jsonc calls `scheduled` once a minute, and that is the
// whole alert scheduler.
import handler from '@tanstack/react-start/server-entry'
import { tick } from '@/alerts/tick'

export default {
  fetch(request) {
    return handler.fetch(request)
  },
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(tick())
  },
} satisfies ExportedHandler<Env>
