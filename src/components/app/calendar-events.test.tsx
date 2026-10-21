import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { calendarEventsQ, calendarQ } from '@/lib/queries'
import { DayEvents, ShownEventsProvider, gridSpan } from './calendar-events'
import type { CalendarStatus } from '@/calendar/run'
import type { CalendarEventView } from '@/lib/calendar-events'

// The queries reach the server's code through their server functions.
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: () => {} }))

const DAY = '2026-10-21'

const status: CalendarStatus = {
  available: true,
  connected: true,
  problem: null,
  lastSyncedAt: '2026-10-21T08:00:00.000Z',
  reads: true,
  edits: true,
  showing: 1,
}

const lunch: CalendarEventView = {
  key: 'family lunch',
  calendarId: 'family',
  eventId: 'lunch',
  seriesId: null,
  title: 'Lunch with Sam',
  color: '#4285f4',
  calendar: 'Family',
  link: null,
  allDay: false,
  startDate: DAY,
  startTime: '12:00',
  endDate: DAY,
  endTime: '13:00',
}

function render({
  showing = 1,
  events,
}: {
  showing?: number
  events?: Array<CalendarEventView>
}) {
  const client = new QueryClient()
  client.setQueryData(calendarQ.queryKey, { ...status, showing })
  if (events) {
    const [from, to] = gridSpan(DAY)
    client.setQueryData(calendarEventsQ(from, to).queryKey, events)
  }
  // An event's row opens it through the URL, so it needs a router.
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>
        <ShownEventsProvider view="day" day={DAY}>
          <DayEvents date={DAY} />
        </ShownEventsProvider>
      </RouterContextProvider>
    </QueryClientProvider>,
  )
}

describe("a day's calendar events", () => {
  it('hold their place while they are on their way', () => {
    const html = render({})
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('On your calendars')
  })

  it('show once they come, and nothing holds a place any more', () => {
    const html = render({ events: [lunch] })
    expect(html).toContain('Lunch with Sam')
    expect(html).not.toContain('aria-busy')
  })

  it('take no room on a day without any', () => {
    expect(render({ events: [] })).toBe('')
  })

  it('take no room for someone who shows no calendars', () => {
    expect(render({ showing: 0 })).toBe('')
  })
})
