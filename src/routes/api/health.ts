import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'

// What a monitor asks. It answers 200 only if the database answers too, so
// "the page loads but nothing can be saved" does not pass for healthy. It is
// one of the few paths open without signing in (src/start.ts), and it says
// nothing about the list.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const db = getDb()
        await db.run(sql`select 1`)
        return Response.json(
          { ok: true },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      },
    },
  },
})
