import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { themeBootScript } from '@/lib/theme'

import appCss from '../styles.css?url'
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'

import type { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'todos' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'todos' },
    ],
    links: [
      // Found from the HTML, so it downloads beside the stylesheet instead of
      // after it. crossorigin is required even same-origin, or the browser
      // fetches the font a second time.
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: geistLatin,
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-4 pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Not here</h1>
      <p className="text-muted-foreground">
        That page does not exist.{' '}
        <a href="/" className="text-foreground underline underline-offset-4">
          Open the list
        </a>
        .
      </p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The class on <html> is owned by the boot script (src/lib/theme.ts),
    // not by React.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster position="top-center" />
        <Scripts />
      </body>
    </html>
  )
}
