// The front door. Every request the app answers passes through here before
// any page, server function or API route sees it, and only three things are
// open to someone who is not signed in: the sign-in page, the sign-in
// machinery under /api/auth, and the health check. The cron is not a request
// and does not come this way.
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { SIGNED_OUT, returnPath, signInPath } from '@/lib/signed-out'
import { currentPerson } from '@/server/identity'

// Start only adds this by itself when there is no start.ts.
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const NO_STORE = { 'Cache-Control': 'no-store' }

function sendTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: path },
  })
}

const door = createMiddleware().server(
  async ({ request, pathname, handlerType, next }) => {
    const page = handlerType === 'router'
    // These answer for themselves, signed in or not.
    if (
      page &&
      (pathname === '/api/health' || pathname.startsWith('/api/auth/'))
    ) {
      return next({ context: { person: null as string | null } })
    }

    const person = await currentPerson(request.headers)
    const url = new URL(request.url)

    if (page && pathname === '/signin') {
      return person
        ? sendTo(returnPath(url.searchParams.get('redirect')))
        : next({ context: { person } })
    }
    if (person) return next({ context: { person } })

    // A browser asking for a page is shown where to sign in; anything else,
    // a server function above all, is told plainly.
    const wantsPage =
      page &&
      request.method === 'GET' &&
      (request.headers.get('Accept') ?? '').includes('text/html')
    return wantsPage
      ? sendTo(signInPath(pathname + url.search))
      : new Response(SIGNED_OUT, {
          status: 401,
          headers: { ...NO_STORE, 'Content-Type': 'text/plain' },
        })
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, door],
}))
