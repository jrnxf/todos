// The Worker's entry. Requests go to TanStack Start unchanged; the Cron
// Trigger in wrangler.jsonc calls `scheduled` once a minute, and that is the
// whole alert scheduler.
import handler from '@tanstack/react-start/server-entry'
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { tick } from '@/alerts/tick'

import appCss from './styles.css?url'

// Sent on HTML responses so Cloudflare can answer with 103 Early Hints while
// the page renders. The same files are preloaded in the document head.
const earlyHints = [
  `<${appCss}>; rel=preload; as=style`,
  `<${geistLatin}>; rel=preload; as=font; type="font/woff2"; crossorigin`,
]

export default {
  async fetch(request) {
    const response = await handler.fetch(request)
    if (!response.headers.get('content-type')?.includes('text/html')) {
      return response
    }
    const hinted = new Response(response.body, response)
    for (const link of earlyHints) hinted.headers.append('Link', link)
    return hinted
  },
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(tick())
  },
} satisfies ExportedHandler<Env>
