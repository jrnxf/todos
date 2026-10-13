import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { SIGNED_OUT, signInPath } from '@/lib/signed-out'
import { routeTree } from './routeTree.gen'

// A session can end while the app sits open: it ran out, or the person was
// taken off the list. The next thing the page asks for comes back refused,
// and the only useful move is the sign-in page.
function leaveIfSignedOut(error: Error) {
  if (typeof window === 'undefined' || error.message !== SIGNED_OUT) return
  const { pathname, search } = window.location
  window.location.assign(signInPath(pathname + search))
}

export function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: leaveIfSignedOut }),
    mutationCache: new MutationCache({ onError: leaveIfSignedOut }),
  })

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
