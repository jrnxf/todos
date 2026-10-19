// A person's other Google calendars in the app: choosing which to show, and
// their events beside the to-dos in the day, week and month views. An event
// is read-only and is never a to-do: it has no box to tick, carries its
// calendar's colour as a mark, and opens in Google Calendar.
import { createContext, useContext, useEffect } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { cn } from 'cn'
import { ArrowUpRightIcon, CalendarRangeIcon, ClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { eventSpan, eventsOn } from '@/lib/calendar-events'
import { monthWeeks, stepDay } from '@/lib/lens'
import {
  calendarEventsQ,
  calendarQ,
  calendarsQ,
  useShowCalendar,
} from '@/lib/queries'
import { Row, Rows } from './rows'
import { SectionHeading } from './todo-row'
import type { CalendarEventView, DayEvent } from '@/lib/calendar-events'
import type { LocalDate } from '@/lib/dates'
import type { LensView } from '@/lib/lens'

/** Where the person lets the app read their other calendars. */
export const READ_CALENDARS = '/api/calendar/connect?read'

const NONE: ReadonlyArray<CalendarEventView> = []
const ShownEvents = createContext<ReadonlyArray<CalendarEventView>>(NONE)

/** The first and last day of the month grid that holds `day`. */
function gridSpan(day: LocalDate): [LocalDate, LocalDate] {
  const weeks = monthWeeks(day)
  return [weeks[0][0], weeks[weeks.length - 1][6]]
}

/**
 * The shown calendars' events over the month grid that holds `day`, for the
 * views under it: one request covers the day, its week and its month.
 * Nothing is asked of the server, or of Google, until the person has chosen
 * a calendar to show.
 */
export function ShownEventsProvider({
  view,
  day,
  children,
}: {
  view: LensView
  day: LocalDate
  children: React.ReactNode
}) {
  const [from, to] = gridSpan(day)
  const { data: status } = useQuery(calendarQ)
  const showing = Boolean(
    status && status.reads && !status.problem && status.showing > 0,
  )
  const { data } = useQuery({
    ...calendarEventsQ(from, to),
    enabled: showing,
    // Moving to another month keeps the days the two grids share filled.
    placeholderData: keepPreviousData,
  })
  // Where the arrows lead is asked for ahead, when it is another grid, so
  // its events are there as the move starts rather than after it.
  const client = useQueryClient()
  const [beforeFrom, beforeTo] = gridSpan(stepDay(day, view, -1))
  const [afterFrom, afterTo] = gridSpan(stepDay(day, view, 1))
  useEffect(() => {
    if (!showing) return
    for (const [start, end] of [
      [beforeFrom, beforeTo],
      [afterFrom, afterTo],
    ]) {
      if (start !== from) void client.prefetchQuery(calendarEventsQ(start, end))
    }
  }, [client, showing, from, beforeFrom, beforeTo, afterFrom, afterTo])
  return (
    <ShownEvents.Provider value={showing && data ? data : NONE}>
      {children}
    </ShownEvents.Provider>
  )
}

/** The shown events on one day, whole-day ones first. */
export function useEventsOn(date: LocalDate): Array<DayEvent> {
  return eventsOn(useContext(ShownEvents), date)
}

/** An event's mark: its calendar's colour, square where a tag's dot is round. */
export function EventMark({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-1.5 shrink-0 rounded-[2px]"
      style={{ background: color }}
    />
  )
}

/** Opens the event in Google Calendar, in a tab of its own. */
function EventLink({
  event,
  className,
  children,
}: {
  event: CalendarEventView
  className?: string
  children: React.ReactNode
}) {
  if (!event.link) return <span className={className}>{children}</span>
  return (
    <a
      href={event.link}
      target="_blank"
      rel="noreferrer"
      className={className}
      aria-label={`${event.title}, in Google Calendar`}
    >
      {children}
    </a>
  )
}

/** One event in the active square of a week or a month. */
export function LensEventRow({ on }: { on: DayEvent }) {
  return (
    <div className="lens-row" data-event="">
      <span
        aria-hidden
        className="lens-row-mark"
        style={{ background: on.event.color }}
      />
      <EventLink event={on.event} className="lens-row-title">
        <span>{on.event.title}</span>
        {!on.wholeDay && <small>{on.when}</small>}
      </EventLink>
    </div>
  )
}

/** The day view's events: a card of rows below the to-dos. */
export function DayEvents({ date }: { date: LocalDate }) {
  const events = useEventsOn(date)
  if (events.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading>On your calendars</SectionHeading>
      <Rows>
        {events.map((on) => (
          <EventRow key={on.event.key} on={on} />
        ))}
      </Rows>
    </section>
  )
}

const COVER =
  'outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:ring-3 focus-visible:after:ring-inset focus-visible:after:ring-ring/50'

function EventRow({ on }: { on: DayEvent }) {
  const { event } = on
  return (
    <Row
      className={cn(
        'relative items-start gap-3',
        event.link && 'hover:bg-muted/50',
      )}
    >
      {/* Where a to-do has its box: the calendar's colour, as a bar. */}
      <ItemMedia className="flex h-5.5 w-5.5 items-center justify-center">
        <span
          aria-hidden
          className="h-4.5 w-1 rounded-full"
          style={{ background: event.color }}
        />
      </ItemMedia>
      <EventLink event={event} className={cn('flex min-w-0 flex-1', COVER)}>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="line-clamp-2 text-[0.9375rem]">
            {event.title}
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.8125rem]">
            <span className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5 shrink-0" />
              {eventSpan(on)}
            </span>
            <span className="truncate">{event.calendar}</span>
          </ItemDescription>
        </ItemContent>
      </EventLink>
      {event.link && (
        <ItemActions>
          <ArrowUpRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      )}
    </Row>
  )
}

/**
 * The person's calendars, each with a switch for whether the views show
 * it. In a card on the account page, or bare in the views' popover.
 */
export function CalendarChoices({ bare = false }: { bare?: boolean }) {
  const { data: calendars, isPending, isError } = useQuery(calendarsQ)
  const show = useShowCalendar()

  if (isPending) {
    return (
      <div className={cn('flex flex-col gap-3', !bare && 'px-1')}>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-5 w-full" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <p className="px-1 text-sm text-destructive">
        Could not reach Google Calendar. Try again in a moment.
      </p>
    )
  }
  if (calendars.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Your Google account has no other calendars to show.
      </p>
    )
  }

  const rows = calendars.map((calendar) => {
    const id = `calendar-${calendar.id}`
    return (
      <Row
        key={calendar.id}
        className={cn('gap-3', bare && 'rounded-md px-1.5 py-2')}
      >
        <ItemMedia className="flex w-3 items-center justify-center">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ background: calendar.color }}
          />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <label htmlFor={id} className="truncate text-sm font-medium">
            {calendar.name}
          </label>
        </ItemContent>
        <ItemActions>
          <Switch
            id={id}
            checked={calendar.shown}
            onCheckedChange={(shown) => show.mutate({ id: calendar.id, shown })}
          />
        </ItemActions>
      </Row>
    )
  })
  return bare ? (
    <div role="list" className="-mx-1 flex flex-col">
      {rows}
    </div>
  ) : (
    <Rows>{rows}</Rows>
  )
}

/**
 * The views' way to the same choice: a button by the arrows on a laptop,
 * and by the avatar on a phone, where the arrows have no room for it. There
 * only while the person's Google Calendar is connected and working.
 */
export function CalendarsButton({ className }: { className?: string }) {
  const { data: status } = useQuery(calendarQ)
  if (!status?.available || !status.connected || status.problem) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Calendars shown"
            className={className}
          />
        }
      >
        <CalendarRangeIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-76 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Your calendars</PopoverTitle>
          <PopoverDescription>
            {status.reads
              ? 'Their events show here beside the to-dos. Only you see them.'
              : 'Show events from your other Google calendars here, beside the to-dos. Read-only, and only you see them.'}
          </PopoverDescription>
        </PopoverHeader>
        {status.reads ? (
          <div className="max-h-80 overflow-y-auto">
            <CalendarChoices bare />
          </div>
        ) : (
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={READ_CALENDARS} />}
          >
            Choose calendars
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
