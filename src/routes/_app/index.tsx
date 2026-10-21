import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  ShownEventsProvider,
  gridSpan,
  showsEvents,
} from '@/components/app/calendar-events'
import { useAddsTo } from '@/components/app/capture'
import { HomePhone } from '@/components/app/home-phone'
import { Lens } from '@/components/app/lens'
import { useIsDesktop } from '@/components/app/picker'
import { addDays } from '@/lib/dates'
import { LENS_VIEWS, stepDay } from '@/lib/lens'
import { boardQ, calendarEventsQ, calendarQ, useBoard } from '@/lib/queries'
import type { LensChange } from '@/components/app/lens'
import type { LensView } from '@/lib/lens'

// The view and the day being stood on live in the URL, so a reload or a
// shared link lands in the same place. Today, as a day, is the bare `/`.
const homeSearch = z.object({
  view: z.enum(LENS_VIEWS).optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** How long the first page waits on Google for the calendars' events. */
const EVENTS_WAIT = 1_000

export const Route = createFileRoute('/_app/')({
  validateSearch: homeSearch,
  loader: async ({ context, location }) => {
    const { queryClient } = context
    const { today } = await queryClient.ensureQueryData(boardQ)
    // The first page comes with the shown calendars' events in it, when
    // Google answers in time; otherwise they follow the page down as they
    // come. Moving about after that asks for them ahead (calendar-events.tsx).
    if (
      typeof window === 'undefined' &&
      showsEvents(queryClient.getQueryData(calendarQ.queryKey))
    ) {
      const day = homeSearch.safeParse(location.search).data?.day ?? today
      const [from, to] = gridSpan(day)
      await Promise.race([
        queryClient.prefetchQuery(calendarEventsQ(from, to)),
        new Promise((resolve) => setTimeout(resolve, EVENTS_WAIT)),
      ])
    }
    return { today }
  },
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

// Home: always on one day, as a day, a week or a month. A phone and a
// laptop each get their own shape of it; until the page knows which it is
// on, it draws both and lets CSS show the right one.
function HomeScreen() {
  const { today } = useBoard()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  // The page answers a tap at once and the URL follows once the move has
  // finished; routing first held every move back, and routing during it
  // stalled it partway. Back, Forward and links still win: a URL that
  // changes from outside resets what is shown.
  const fromUrl = { view: search.view ?? 'day', day: search.day ?? today }
  const [shown, setShown] = useState(fromUrl)
  const [url, setUrl] = useState(fromUrl)
  if (url.view !== fromUrl.view || url.day !== fromUrl.day) {
    setUrl(fromUrl)
    setShown(fromUrl)
  }

  // Adding starts on the day being looked at, today included.
  useAddsTo(shown.day)

  const go = (change: LensChange) => setShown({ ...shown, ...change })
  const settled = () => {
    if (shown.view === url.view && shown.day === url.day) return
    void navigate({
      search: (now) => ({
        ...now,
        view: shown.view === 'day' ? undefined : shown.view,
        day: shown.day === today ? undefined : shown.day,
      }),
      replace: true,
    })
  }
  useHomeKeys({
    view: shown.view,
    day: shown.day,
    today,
    busy: search.item !== undefined || search.event !== undefined,
    onChange: go,
  })

  const desktop = useIsDesktop()
  const hydrated = useHydrated()
  const props = {
    view: shown.view,
    day: shown.day,
    onChange: go,
    onSettled: settled,
  }
  return (
    <ShownEventsProvider view={shown.view} day={shown.day}>
      {(!hydrated || !desktop) && (
        <div className="lg:hidden">
          <HomePhone {...props} />
        </div>
      )}
      {(!hydrated || desktop) && (
        <div className="hidden lg:block">
          <Lens {...props} />
        </div>
      )}
    </ShownEventsProvider>
  )
}

const noSubscribe = () => () => {}

/** False on the server and while hydrating, then true. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  )
}

const VIEW_KEYS: Record<string, LensView> = { d: 'day', w: 'week', m: 'month' }
/** Out from a day to its week, and from a week to its month. */
const OUT: Record<LensView, LensView | null> = {
  day: 'week',
  week: 'month',
  month: null,
}

/**
 * The keyboard: arrows move the day (a week with up and down, the view's
 * own step with Shift), T goes to today, D, W and M pick the view, Enter
 * opens the picked day, Escape steps back out. Never while typing, while a
 * dialog is open, or while a to-do or an event is open beside the list.
 */
function useHomeKeys({
  view,
  day,
  today,
  busy,
  onChange,
}: {
  view: LensView
  day: string
  today: string
  busy: boolean
  onChange: (change: LensChange) => void
}) {
  const latest = useRef({ view, day, today, busy, onChange })
  useLayoutEffect(() => {
    latest.current = { view, day, today, busy, onChange }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = latest.current
      if (now.busy || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      )
        return
      const change = keyChange(event, now.view, now.day, now.today, target)
      if (!change) return
      event.preventDefault()
      now.onChange(change)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function keyChange(
  event: KeyboardEvent,
  view: LensView,
  day: string,
  today: string,
  target: HTMLElement | null,
): LensChange | null {
  const key = event.key.toLowerCase()
  if (key in VIEW_KEYS && !event.shiftKey) return { view: VIEW_KEYS[key] }
  if (key === 't' && !event.shiftKey) return { day: today }
  if (event.key === 'Escape') {
    const out = OUT[view]
    return out ? { view: out } : null
  }
  // Enter on a focused button presses it; on the page it opens the day.
  if (event.key === 'Enter') {
    const onPage = !target || target === document.body
    return onPage && view !== 'day' ? { view: 'day' } : null
  }
  const sideways = { ArrowLeft: -1, ArrowRight: 1 }[event.key] as
    -1 | 1 | undefined
  if (sideways) {
    return {
      day: event.shiftKey
        ? stepDay(day, view, sideways)
        : addDays(day, sideways),
    }
  }
  // Up and down scroll a day's page; in a week or a month they move a week.
  const upDown = { ArrowUp: -7, ArrowDown: 7 }[event.key]
  if (upDown && view !== 'day') return { day: addDays(day, upDown) }
  return null
}
