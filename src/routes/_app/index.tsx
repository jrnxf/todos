import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ShownEventsProvider } from '@/components/app/calendar-events'
import { Lens } from '@/components/app/lens'
import { LENS_VIEWS } from '@/lib/lens'
import { boardQ, useBoard } from '@/lib/queries'
import type { LensChange } from '@/components/app/lens'

export const Route = createFileRoute('/_app/')({
  // The view and the day being stood on live in the URL, so a reload or a
  // shared link lands in the same place. Today, as a day, is the bare `/`.
  validateSearch: z.object({
    view: z.enum(LENS_VIEWS).optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  loader: async ({ context }) => ({
    today: (await context.queryClient.ensureQueryData(boardQ)).today,
  }),
  head: ({ match, loaderData }) => {
    const { view, day } = match.search
    const screen =
      view === 'week'
        ? 'Week'
        : view === 'month'
          ? 'Month'
          : day && day !== loaderData?.today
            ? 'Day'
            : 'Today'
    return { meta: [{ title: `${screen} - todos` }] }
  },
  component: HomeScreen,
})

// Home: always on one day, as a day, a week or a month. It replaces the old
// Today, Up next and Calendar pages.
function HomeScreen() {
  const { today } = useBoard()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  // The page answers a tap at once and the URL follows once the move has
  // started; routing first held every move back. Back, Forward
  // and links still win: a URL that changes from outside resets what is
  // shown.
  const fromUrl = { view: search.view ?? 'day', day: search.day ?? today }
  const [shown, setShown] = useState(fromUrl)
  const [url, setUrl] = useState(fromUrl)
  if (url.view !== fromUrl.view || url.day !== fromUrl.day) {
    setUrl(fromUrl)
    setShown(fromUrl)
  }

  const go = (change: LensChange) => {
    const next = { ...shown, ...change }
    setShown(next)
    // After the frame that starts the move has been drawn.
    requestAnimationFrame(() =>
      setTimeout(() =>
        navigate({
          search: (now) => ({
            ...now,
            view: next.view === 'day' ? undefined : next.view,
            day: next.day === today ? undefined : next.day,
          }),
          replace: true,
        }),
      ),
    )
  }

  return (
    <ShownEventsProvider day={shown.day}>
      <Lens view={shown.view} day={shown.day} onChange={go} />
    </ShownEventsProvider>
  )
}
