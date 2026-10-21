// The home page on a phone: the month's grid as a way to pick a day, and the
// picked day's whole list under it. Month shows every row of the grid. Week
// closes the other rows into the week's strip, and lists the week's days
// under it. Day keeps the strip and folds the other days away, so the
// picked one opens into its page. One tap on a day shows everything on it.
//
// Rows close and days fold by CSS transitions on the same elements, so each
// move runs both ways at one pace; with reduced motion they only fade. What
// is folded away is inert. The laptop has its own shape (lens.tsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isOpen, weekDays, weekStart } from '@/lib/board'
import { eventsOn, isBar, lastDay } from '@/lib/calendar-events'
import {
  formatLongDay,
  formatLongWeekday,
  formatMonth,
  weekday,
} from '@/lib/dates'
import { LENS_VIEWS, monthWeeks, stepDay } from '@/lib/lens'
import { useBoard } from '@/lib/queries'
import { AccountMenu } from './account-menu'
import {
  CalendarsButton,
  EventMark,
  LensEventRow,
  useShownEvents,
} from './calendar-events'
import { DayView } from './day-view'
import {
  MiniRow,
  TodayButton,
  TodoDot,
  dayTodos,
  fromToday,
  weekSpan,
} from './home-parts'
import type { LensChange } from './lens'
import type { Tag, Todo } from '@/db/schema'
import type { CalendarEventView } from '@/lib/calendar-events'
import type { LensView } from '@/lib/lens'
import type { LocalDate } from '@/lib/dates'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
/** A row of the month, and the one row a week or a day keeps. */
const ROW = 46
const STRIP = 56
/** A swipe is a move along, not a scroll down, past this many pixels. */
const SWIPE = 50

export function HomePhone({
  view,
  day,
  onChange,
  onSettled,
}: {
  view: LensView
  day: LocalDate
  onChange: (change: LensChange) => void
  onSettled: () => void
}) {
  const { today } = useBoard()

  const pick = (date: LocalDate) =>
    onChange(date === day && view !== 'day' ? { view: 'day' } : { day: date })
  const step = (direction: -1 | 1, unit: LensView = view) =>
    onChange({ day: stepDay(day, unit, direction) })

  // Once nothing moves, the page may route.
  const root = useRef<HTMLDivElement>(null)
  const settledRef = useRef(onSettled)
  useLayoutEffect(() => {
    settledRef.current = onSettled
  })
  useEffect(() => {
    const element = root.current
    if (!element) return
    let live = true
    const settle = async () => {
      for (
        let running = element.getAnimations({ subtree: true });
        running.length > 0;
        running = element.getAnimations({ subtree: true })
      ) {
        await Promise.allSettled(running.map((one) => one.finished))
      }
      if (live) settledRef.current()
    }
    // A frame first, so the transitions this change starts are running.
    const frame = requestAnimationFrame(() => void settle())
    return () => {
      live = false
      cancelAnimationFrame(frame)
    }
  }, [view, day])

  return (
    <div ref={root} className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-[1.75rem] leading-tight font-semibold tracking-tight">
          {view === 'week' ? weekSpan(day) : formatMonth(day)}
        </h1>
        <TodayButton
          day={day}
          today={today}
          onToday={() => onChange({ day: today })}
        />
        <CalendarsButton />
        <AccountMenu />
      </header>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`Earlier ${view}`}
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`Later ${view}`}
          onClick={() => step(1)}
        >
          <ChevronRightIcon />
        </Button>
        <Tabs
          value={view}
          onValueChange={(picked: LensView) => onChange({ view: picked })}
          className="flex-1"
        >
          <TabsList className="w-full group-data-horizontal/tabs:h-9">
            {LENS_VIEWS.map((option) => (
              <TabsTrigger key={option} value={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Navigator
        view={view}
        day={day}
        today={today}
        onPick={pick}
        onSwipe={(direction) =>
          step(direction, view === 'month' ? 'month' : 'week')
        }
      />
      <div className="-mx-4 border-t" />
      <Folds
        view={view}
        day={day}
        today={today}
        onPick={pick}
        onToday={() => onChange({ day: today })}
        onSwipe={(direction) =>
          step(direction, view === 'week' ? 'week' : 'day')
        }
      />
    </div>
  )
}

/** Sideways swipes on an element, as -1 (back) or 1 (on). */
function useSwipe(onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse') return
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: React.PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return
      onSwipe(dx < 0 ? 1 : -1)
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}

/** The month's grid; for a week or a day, the other rows close. */
function Navigator({
  view,
  day,
  today,
  onPick,
  onSwipe,
}: {
  view: LensView
  day: LocalDate
  today: LocalDate
  onPick: (date: LocalDate) => void
  onSwipe: (direction: -1 | 1) => void
}) {
  const board = useBoard()
  const events = useShownEvents()
  const weeks = monthWeeks(day)
  const row = weeks.findIndex((week) => week.includes(day))
  const rows = weeks
    .map((_, index) =>
      view === 'month' ? `${ROW}px` : index === row ? `${STRIP}px` : '0px',
    )
    .join(' ')
  const swipe = useSwipe(onSwipe)
  // Only a month moved to fades in; the one the page opens on is just there.
  const [grid, setGrid] = useState({ first: weeks[0][0], moved: false })
  if (grid.first !== weeks[0][0] && !grid.moved) {
    setGrid({ ...grid, moved: true })
  }

  return (
    <div {...swipe} className="touch-pan-y">
      <div className="pnav-weekdays" aria-hidden>
        {WEEKDAYS.map((name, col) => (
          <span key={col}>{name}</span>
        ))}
      </div>
      <div
        // A new month is a new grid: it fades in instead of moving.
        key={weeks[0][0]}
        className="pnav"
        data-new-month={grid.moved ? '' : undefined}
        role="grid"
        aria-label={formatMonth(day)}
        style={{ gridTemplateRows: rows }}
      >
        {weeks.map((dates, index) => {
          const open = view === 'month' || index === row
          return (
            <div key={dates[0]} role="row" className="contents">
              {dates.map((date) => (
                <NavDay
                  key={date}
                  date={date}
                  picked={date === day}
                  today={today}
                  outside={date.slice(0, 7) !== day.slice(0, 7)}
                  open={open}
                  marks={marks(board.items, events, board.tags, date, today)}
                  bar={barOn(events, date)}
                  onPick={onPick}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Up to three marks for a day: what is late, its to-dos, its events. */
function marks(
  items: Array<Todo>,
  events: ReadonlyArray<CalendarEventView>,
  tags: Array<Tag>,
  date: LocalDate,
  today: LocalDate,
): React.ReactNode {
  const { late, due } = dayTodos(items, date, today)
  const open = due.filter(isOpen)
  const timed = eventsOn(events, date).filter((on) => !isBar(on.event))
  return [
    ...late.map((todo) => (
      <span
        key={`late-${todo.id}`}
        aria-hidden
        className="inline-block size-1.5 shrink-0 rounded-full bg-destructive"
      />
    )),
    ...open.map((todo) => <TodoDot key={todo.id} todo={todo} tags={tags} />),
    ...timed.map((on) => (
      <EventMark key={on.event.key} color={on.event.color} />
    )),
  ].slice(0, 3)
}

/** The first bar over a day, drawn as a line under its marks. */
function barOn(
  events: ReadonlyArray<CalendarEventView>,
  date: LocalDate,
): { color: string; first: boolean; last: boolean; title: string } | null {
  const event = events.find(
    (one) => isBar(one) && one.startDate <= date && lastDay(one) >= date,
  )
  if (!event) return null
  return {
    color: event.color,
    title: event.title,
    first: event.startDate === date || weekday(date) === 0,
    last: lastDay(event) === date || weekday(date) === 6,
  }
}

function NavDay({
  date,
  picked,
  today,
  outside,
  open,
  marks: dots,
  bar,
  onPick,
}: {
  date: LocalDate
  picked: boolean
  today: LocalDate
  outside: boolean
  /** Its row is showing. */
  open: boolean
  marks: React.ReactNode
  bar: ReturnType<typeof barOn>
  onPick: (date: LocalDate) => void
}) {
  return (
    <button
      type="button"
      role="gridcell"
      className="pnav-day"
      aria-selected={picked}
      aria-current={date === today ? 'date' : undefined}
      aria-label={`${formatLongDay(date)}${date === today ? ', today' : ''}`}
      aria-hidden={open ? undefined : true}
      tabIndex={open ? undefined : -1}
      data-picked={picked ? '' : undefined}
      data-today={date === today ? '' : undefined}
      data-outside={outside ? '' : undefined}
      onClick={() => onPick(date)}
    >
      <span className="pnav-number">{Number(date.slice(8))}</span>
      <span className="pnav-marks">{dots}</span>
      {bar && (
        <span
          className="pnav-bar"
          title={bar.title}
          data-first={bar.first ? '' : undefined}
          data-last={bar.last ? '' : undefined}
          style={{ ['--bar' as string]: bar.color }}
        />
      )}
    </button>
  )
}

/**
 * The week's days, each a short list; for a day (and a month) the others
 * fold away and the picked one opens into its page.
 */
function Folds({
  view,
  day,
  today,
  onPick,
  onToday,
  onSwipe,
}: {
  view: LensView
  day: LocalDate
  today: LocalDate
  onPick: (date: LocalDate) => void
  onToday: () => void
  onSwipe: (direction: -1 | 1) => void
}) {
  const board = useBoard()
  const events = useShownEvents()
  const mode = view === 'week' ? 'week' : 'day'
  const swipe = useSwipe(onSwipe)
  // Another week is new days: they slide in the way time went.
  const [seen, setSeen] = useState<{
    week: LocalDate
    enter?: 'next' | 'prev'
  }>({ week: weekStart(day) })
  if (seen.week !== weekStart(day)) {
    setSeen({
      week: weekStart(day),
      enter: weekStart(day) > seen.week ? 'next' : 'prev',
    })
  }
  const enter = seen.enter

  return (
    <div
      {...swipe}
      key={weekStart(day)}
      className="folds touch-pan-y"
      data-mode={mode}
      data-enter={enter}
    >
      {weekDays(day).map((date) => {
        const picked = date === day
        const { late, due } = dayTodos(board.items, date, today)
        const on = eventsOn(events, date)
        const empty = late.length + due.length + on.length === 0
        const linesShown = mode === 'week'
        const headShown = mode === 'week' || picked
        return (
          <section
            key={date}
            className="fold-day"
            data-picked={picked ? '' : undefined}
            data-today={date === today ? '' : undefined}
            aria-label={formatLongDay(date)}
          >
            <div className="fold" data-open={headShown ? '' : undefined}>
              <div inert={!headShown}>
                <button
                  type="button"
                  className="fold-head"
                  onClick={() => onPick(date)}
                >
                  <span className="fold-number">{Number(date.slice(8))}</span>
                  <span className="font-medium">{formatLongWeekday(date)}</span>
                  <span className="text-sm text-muted-foreground">
                    {date === today ? 'Today' : fromToday(date, today)}
                  </span>
                  {empty && linesShown && (
                    <span className="ml-auto text-sm text-muted-foreground">
                      Nothing
                    </span>
                  )}
                </button>
              </div>
            </div>
            <div
              className="fold"
              data-open={linesShown && !empty ? '' : undefined}
            >
              <div inert={!linesShown}>
                {!empty && (
                  <div className="fold-lines">
                    {late.map((todo) => (
                      <MiniRow key={todo.id} todo={todo} late />
                    ))}
                    {due.map((todo) => (
                      <MiniRow key={todo.id} todo={todo} late={false} />
                    ))}
                    {on.map((one) => (
                      <LensEventRow key={one.event.key} on={one} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            {picked && (
              <div className="fold" data-open={mode === 'day' ? '' : undefined}>
                <div inert={mode !== 'day'}>
                  <div className="fold-page">
                    <DayView day={date} onToday={onToday} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
