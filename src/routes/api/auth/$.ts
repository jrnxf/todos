import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/server/auth'

// Better Auth's own routes: starting a sign-in, Google's reply, sign-out.
function handle(request: Request): Response | Promise<Response> {
  const auth = getAuth()
  if (!auth) {
    return Response.json(
      { message: 'Sign-in has not been set up yet.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
})
