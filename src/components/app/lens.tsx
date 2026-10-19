// The home page: always on one day, seen as a day, a week or a month. One
// grid draws all three. Month shows every square, with the active day's
// larger and tickable. Week closes the other rows, so that week stands tall.
// Day closes the other columns too, and the one square left is the page.
//
// The motion is the point, so a few rules hold it together:
// - Track sizes are pixels from src/lib/lens.ts, so every move runs at one
//   pace in and out.
// - A square holds four drawings of its day (month chips, week chips, the
//   active day's checklist, the full day), each laid out once at the size it
//   will be shown at. The grid only uncovers them; no title re-wraps
//   mid-move. Which one shows, and how it fades, is CSS in styles.css.
//
// Events from the person's other Google calendars, once they chose some,
// sit after the day's to-dos in each drawing (calendar-events.tsx).
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byDue, isOpen, upNext, weekStart } from '@/lib/board'
import {
  addDays,
  diffDays,
  formatLongDay,
  formatMonth,
  formatMonthDay,
  formatTime,
} from '@/lib/dates'
import {
  LENS_VIEWS,
  lensDirection,
  lensTracks,
  monthWeeks,
  stepDay,
} from '@/lib/lens'
import { useBoard, useSetDone } from '@/lib/queries'
import {
  CalendarsButton,
  EventMark,
  LensEventRow,
  useEventsOn,
} from './calendar-events'
import { DayView } from './day-view'
import { ScreenHeader } from './shell'
import { TagDot } from './tag'
import type { Tag, Todo } from '@/db/schema'
import type { LensView } from '@/lib/lens'
import type { LocalDate } from '@/lib/dates'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** The weekday names above the grid; they fold away for a day. */
const HEADER_HEIGHT = 32
/** Narrower than this, the grid is a phone's: the active day takes more. */
const COMPACT_WIDTH = 640

export interface LensChange {
  view?: LensView
  day?: LocalDate
}

/** "Today", "Tomorrow", "In 4 days", "3 days ago". */
function fromToday(day: LocalDate, today: LocalDate): string {
  const days = diffDays(day, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

/** "Oct 11 to 17", "Oct 25 to Nov 1" */
function weekSpan(day: LocalDate): string {
  const from = weekStart(day)
  const to = addDays(from, 6)
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${formatMonthDay(from)} to ${Number(to.slice(8))}`
    : `${formatMonthDay(from)} to ${formatMonthDay(to)}`
}

export function Lens({
  view,
  day,
  onChange,
}: {
  view: LensView
  day: LocalDate
  onChange: (change: LensChange) => void
}) {
  const board = useBoard()
  const { today } = board

  // Which way the last change went, for the CSS to time it.
  const [shown, setShown] = useState({ view, day })
  const [move, setMove] = useState<{
    dir: 'in' | 'out' | 'same'
    from: LensView
    newMonth: boolean
  }>({ dir: 'same', from: view, newMonth: false })
  if (shown.view !== view || shown.day !== day) {
    setShown({ view, day })
    setMove({
      dir: lensDirection(shown.view, view),
      from: shown.view,
      newMonth: shown.day.slice(0, 7) !== day.slice(0, 7),
    })
  }

  // The panel's size in pixels. Until it is known (the server render, the
  // first paint) the grid falls back to fractions and does not animate.
  const panel = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    if (!size || ready) return
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [size, ready])

  const width = size?.width ?? 7
  const height = size?.height ?? 7
  const compact = width < COMPACT_WIDTH
  const gridHeight = (forView: LensView) =>
    forView === 'day' || !size ? height : height - HEADER_HEIGHT
  const tracksFor = (forView: LensView) =>
    lensTracks({
      view: forView,
      day,
      width,
      height: gridHeight(forView),
      compact,
    })
  const now = tracksFor(view)
  const month = tracksFor('month')
  const week = tracksFor('week')
  const whole = tracksFor('day')
  const unit = size ? 'px' : 'fr'
  const template = (list: Array<number>) =>
    list.map((value) => `${value.toFixed(3)}${unit}`).join(' ')

  const weeks = monthWeeks(day)
  const thisWeek = weekStart(day)
  const undated = upNext(board.items, today).undated

  // What a square does when picked, kept stable so a square only redraws
  // when its own look changes: a tap redraws one or two squares, not 35.
  const latest = useRef({ view, day, today, onChange })
  useLayoutEffect(() => {
    latest.current = { view, day, today, onChange }
  })
  const pick = useCallback((date: LocalDate) => {
    const { view: shownView, day: shownDay, onChange: change } = latest.current
    change(
      date === shownDay && shownView !== 'day'
        ? { view: 'day' }
        : { day: date },
    )
  }, [])
  const goToday = useCallback(
    () => latest.current.onChange({ day: latest.current.today }),
    [],
  )

  const step = (direction: -1 | 1) =>
    onChange({ day: stepDay(day, view, direction) })

  const eyebrow =
    view === 'day'
      ? fromToday(day, today)
      : view === 'week'
        ? `Week of ${weekSpan(day)}`
        : formatMonth(day)

  return (
    <div className="flex flex-col gap-5 lg:mx-auto lg:w-full lg:max-w-5xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <ScreenHeader
          eyebrow={eyebrow}
          title={formatLongDay(day)}
          phoneActions={<CalendarsButton />}
        />
        <div className="flex items-center justify-between gap-2 lg:gap-4">
          <Tabs
            value={view}
            onValueChange={(picked: LensView) => onChange({ view: picked })}
          >
            <TabsList className="group-data-horizontal/tabs:h-9">
              {LENS_VIEWS.map((option) => (
                <TabsTrigger key={option} value={option} className="px-3.5">
                  {option[0].toUpperCase() + option.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1.5">
            <CalendarsButton className="hidden lg:inline-flex" />
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={`Earlier ${view}`}
              onClick={() => step(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={`Later ${view}`}
              onClick={() => step(1)}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onChange({ day: today })}
            >
              Today
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={panel}
        className="lens"
        data-view={view}
        data-dir={move.dir}
        data-from={move.from}
        data-ready={ready ? '' : undefined}
      >
        <div
          className="lens-weekdays"
          aria-hidden
          style={{ gridTemplateColumns: template(now.cols) }}
        >
          {WEEKDAYS.map((name, col) => (
            <span key={name} data-active={col === now.col ? '' : undefined}>
              <span className="hidden sm:inline">{name}</span>
              <span className="sm:hidden">{name[0]}</span>
            </span>
          ))}
        </div>
        <div
          // A new month is a new grid: it fades in instead of moving.
          key={weeks[0][0]}
          className="lens-grid"
          data-new-month={move.newMonth ? '' : undefined}
          role="grid"
          aria-label={formatMonth(day)}
          style={{
            gridTemplateColumns: template(now.cols),
            gridTemplateRows: template(now.rows),
          }}
        >
          {weeks.map((dates, row) => (
            <div key={dates[0]} role="row" className="contents">
              {dates.map((date, col) => {
                const active = date === day
                const sized = (w: number, h: number) =>
                  size
                    ? { width: Math.round(w), height: Math.round(h) }
                    : { width: '100%', height: '100%' }
                return (
                  <LensSquare
                    key={date}
                    date={date}
                    active={active}
                    inWeek={weekStart(date) === thisWeek}
                    outside={date.slice(0, 7) !== day.slice(0, 7)}
                    canOpen={active && view !== 'day'}
                    onPick={pick}
                    onToday={goToday}
                    sizes={{
                      month: sized(month.cols[col], month.rows[row]),
                      week: sized(week.cols[col], week.rows[now.row]),
                      active: sized(
                        (view === 'month' ? month : week).cols[col],
                        (view === 'month' ? month : week).rows[
                          view === 'month' ? row : now.row
                        ],
                      ),
                      day: sized(whole.cols[now.col], whole.rows[now.row]),
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="-mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="flex shrink-0 items-center gap-2">
            No date
            <Badge variant="secondary">{undated.length}</Badge>
          </span>
          <div className="lens-tray">
            {undated.map((todo) => (
              <OpenTodo
                key={todo.id}
                todo={todo}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <TodoDot todo={todo} tags={board.tags} />
                {todo.title}
              </OpenTodo>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type Size = { width: number | string; height: number | string }
type Sizes = { month: Size; week: Size; active: Size; day: Size }

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height

const LensSquare = memo(
  LensSquareView,
  (a, b) =>
    a.date === b.date &&
    a.active === b.active &&
    a.inWeek === b.inWeek &&
    a.outside === b.outside &&
    a.canOpen === b.canOpen &&
    a.onPick === b.onPick &&
    a.onToday === b.onToday &&
    (Object.keys(a.sizes) as Array<keyof Sizes>).every((key) =>
      sameSize(a.sizes[key], b.sizes[key]),
    ),
)

function LensSquareView({
  date,
  active,
  inWeek,
  outside,
  canOpen,
  sizes,
  onPick,
  onToday,
}: {
  date: LocalDate
  active: boolean
  /** In the active day's week: the squares a week view shows. */
  inWeek: boolean
  /** In the grid but not the month, such as Sep 27 in October. */
  outside: boolean
  /** Picking it again opens it as a day. */
  canOpen: boolean
  sizes: Sizes
  onPick: (date: LocalDate) => void
  onToday: () => void
}) {
  const board = useBoard()
  const { today } = board
  // What is late heads today's square.
  const carried = date === today ? upNext(board.items, today).overdue : []
  const due = board.items.filter((todo) => todo.dueDate === date)
  // Open first, then what was ticked off, each in deadline order.
  const items = due.sort(
    (a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || byDue(a, b),
  )
  const past = date < today
  const events = useEventsOn(date)
  const chipCount = items.length + events.length + (carried.length ? 1 : 0)
  const number = (
    <span className="lens-number" aria-hidden>
      {Number(date.slice(8))}
    </span>
  )
  const chips = (
    <div className="lens-chips">
      {carried.length > 0 && (
        <span className="lens-chip" data-late="" data-carried="">
          <span>{carried.length} carried over</span>
        </span>
      )}
      {items.map((todo) => (
        <span
          key={todo.id}
          className="lens-chip"
          data-late={past && isOpen(todo) ? '' : undefined}
          data-done={isOpen(todo) ? undefined : ''}
        >
          <TodoDot todo={todo} tags={board.tags} />
          <span>
            {todo.title}
            {todo.dueTime && isOpen(todo) && (
              <small>{formatTime(todo.dueTime)}</small>
            )}
          </span>
        </span>
      ))}
      {events.map((on) => (
        <span key={on.event.key} className="lens-chip" data-event="">
          <EventMark color={on.event.color} />
          <span>
            {on.event.title}
            {!on.wholeDay && <small>{on.when}</small>}
          </span>
        </span>
      ))}
      {chipCount > 2 && <span className="lens-more">{chipCount - 2} more</span>}
    </div>
  )

  return (
    <div
      role="gridcell"
      aria-selected={active}
      className="lens-square"
      data-active={active ? '' : undefined}
      data-week={inWeek ? '' : undefined}
      data-today={date === today ? '' : undefined}
      data-outside={outside ? '' : undefined}
    >
      {/* The whole square picks the day; what is inside it that can be
          ticked or opened sits above this. */}
      <button
        type="button"
        className="lens-pick"
        aria-label={`${formatLongDay(date)}${canOpen ? ', open the day' : ''}`}
        aria-current={date === today ? 'date' : undefined}
        onClick={() => onPick(date)}
      />
      <div className="lens-layer" data-layer="month" style={sizes.month}>
        <div className="lens-pad">
          {number}
          {chips}
        </div>
      </div>
      <div className="lens-layer" data-layer="week" style={sizes.week}>
        <div className="lens-pad">
          {number}
          {chips}
        </div>
      </div>
      {active && (
        <>
          <div className="lens-layer" data-layer="active" style={sizes.active}>
            <div className="lens-pad">
              {number}
              <ActiveList>
                {carried.length > 0 && (
                  <>
                    <p className="lens-caption" data-late="">
                      Carried over
                    </p>
                    {carried.map((todo) => (
                      <MiniRow key={todo.id} todo={todo} late />
                    ))}
                    <p className="lens-caption">Today</p>
                  </>
                )}
                {items.map((todo) => (
                  <MiniRow
                    key={todo.id}
                    todo={todo}
                    late={past && isOpen(todo)}
                  />
                ))}
                {items.length === 0 && (
                  <p className="lens-caption">Nothing due</p>
                )}
                {events.map((on) => (
                  <LensEventRow key={on.event.key} on={on} />
                ))}
              </ActiveList>
            </div>
          </div>
          <div className="lens-layer" data-layer="day" style={sizes.day}>
            <div className="lens-pad">
              <DayView day={date} onToday={onToday} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** The active square's rows, down to the last that fits whole. What does
    not fit is hidden and counted, as a month square counts its chips. */
function ActiveList({ children }: { children: React.ReactNode }) {
  const list = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLSpanElement>(null)
  // Laid out by hand, as React does not see the square's size: every row
  // shows, then those from the first that leaves no room for "N more" hide.
  const measure = useCallback(() => {
    const element = list.current
    const line = more.current
    const pad = element?.parentElement
    if (!element || !line || !pad) return
    const rows = Array.from(element.children) as Array<HTMLElement>
    for (const row of rows) row.style.display = ''
    line.hidden = false
    const bottom =
      pad.getBoundingClientRect().bottom -
      parseFloat(getComputedStyle(pad).paddingBottom)
    const last = rows.at(-1)
    let cut = rows.length
    if (last && last.getBoundingClientRect().bottom > bottom) {
      // "N more" takes the place of the first row it stands for, so it
      // stands for the row before the first place it would not fit.
      const height = line.getBoundingClientRect().height
      const crowded = rows.findIndex(
        (row) => row.getBoundingClientRect().top + height > bottom,
      )
      cut = Math.max(0, (crowded === -1 ? rows.length : crowded) - 1)
      // A caption with nothing under it goes too.
      while (cut > 0 && !rows[cut - 1].classList.contains('lens-row')) cut--
    }
    rows.forEach((row, index) => {
      if (index >= cut) row.style.display = 'none'
    })
    const hidden = rows
      .slice(cut)
      .filter((row) => row.classList.contains('lens-row')).length
    line.textContent = `${hidden} more`
    line.hidden = hidden === 0
  }, [])
  // Rows come and go with the board, and change height as fonts load; the
  // square resizes as the view moves.
  useLayoutEffect(measure)
  useLayoutEffect(() => {
    const element = list.current
    if (!element?.parentElement) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(element.parentElement)
    return () => observer.disconnect()
  }, [measure])
  return (
    <>
      <div ref={list} className="lens-list">
        {children}
      </div>
      <span ref={more} className="lens-more" hidden />
    </>
  )
}

/** One to-do in the active square: tick it, or open it. */
function MiniRow({ todo, late }: { todo: Todo; late: boolean }) {
  const setDone = useSetDone()
  const done = !isOpen(todo)
  return (
    <div
      className="lens-row"
      data-late={late ? '' : undefined}
      data-done={done ? '' : undefined}
    >
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => setDone(todo, checked)}
        aria-label={
          done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" done`
        }
        className="mt-px"
      />
      <OpenTodo todo={todo} className="lens-row-title">
        <span>{todo.title}</span>
        {!done && (todo.dueTime || late) && (
          <small>
            {late && todo.dueDate
              ? formatMonthDay(todo.dueDate)
              : formatTime(todo.dueTime as string)}
          </small>
        )}
      </OpenTodo>
    </div>
  )
}

/** Opens the to-do's drawer over the page, as a row does. */
function OpenTodo({
  todo,
  className,
  children,
}: {
  todo: Todo
  className?: string
  children: React.ReactNode
}) {
  const anyOpen = useRouterState({
    select: (state) => state.location.search.item !== undefined,
  })
  return (
    <Link
      to="."
      search={(now) => ({ ...now, item: todo.id })}
      state={(now) => ({ ...now, openedInPlace: true })}
      replace={anyOpen}
      className={className}
    >
      {children}
    </Link>
  )
}

function TodoDot({ todo, tags }: { todo: Todo; tags: Array<Tag> }) {
  const tag = tags.find((one) => one.id === todo.tagId)
  return tag ? (
    <TagDot color={tag.color} className="size-1.5" />
  ) : (
    <span
      aria-hidden
      className="inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
    />
  )
}
