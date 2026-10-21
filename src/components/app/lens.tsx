// The home page on a laptop: always on one day, seen as a day, a week or a
// month, and one grid draws all three. Month shows every square, with the
// picked day's whole list in a panel beside the grid. Week closes the other
// rows, and every day in it is a list to tick. Day closes the other columns
// too, and the one square left is the page, centred, its title stepping in
// to sit over it. A phone has its own shape (home-phone.tsx).
//
// The motion is the point, so a few rules hold it together:
// - Track sizes are pixels from src/lib/lens.ts, so every move runs at one
//   pace in and out. The grid's own width is pixels too, so the month's
//   panel and the grid trade width at that same pace.
// - A square holds three drawings of its day (month chips, the week's list,
//   the full day), each laid out once at the size it will be shown at. The
//   grid only uncovers them; no title re-wraps mid-move. Which one shows,
//   and how it fades, is CSS in styles.css. The ones not shown are inert, so
//   neither the keyboard nor a screen reader finds them.
// - Nothing slow runs while the grid moves: the page waits for onSettled to
//   route, and a day stepped away from keeps its page until it is gone.
//
// Events from the person's other Google calendars, once they chose some,
// sit after the day's to-dos in each drawing (calendar-events.tsx). One that
// runs a whole day or more is not drawn in the squares but once per week, as
// a bar laid over the row on the grid's own column tracks, so it stretches
// as the columns move; each drawing leaves room for the row's bars under the
// day's number.
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isOpen, weekStart } from '@/lib/board'
import { formatLongDay, formatMonth, formatMonthDay } from '@/lib/dates'
import {
  LENS_VIEWS,
  lensDirection,
  lensTracks,
  monthWeeks,
  stepDay,
} from '@/lib/lens'
import { useBoard } from '@/lib/queries'
import { barsHidden, isBar, weekBars } from '@/lib/calendar-events'
import {
  CalendarsButton,
  EventMark,
  LensEventRow,
  OpenEvent,
  WeekBars,
  useEventsOn,
  useShownEvents,
} from './calendar-events'
import { DayView } from './day-view'
import {
  MiniRow,
  OpenTodo,
  TodayButton,
  TodoDot,
  dayTodos,
  fromToday,
  weekSpan,
} from './home-parts'
import type { LensView } from '@/lib/lens'
import type { LocalDate } from '@/lib/dates'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** The weekday names above the grid; they fold away for a day. */
const HEADER_HEIGHT = 26
/** The month's panel of the picked day, and the gap before it. */
const PANEL = 360
const PANEL_GAP = 24
/** The day's page, as wide as the old Today page was. */
const PAGE = 672
/**
 * How many lanes of bars a week shows, by how tall its row is: a month's
 * row, the picked day's row in a month, and a week. Bars past these are
 * counted in each day's "N more".
 */
const LANES = { month: 3, activeMonth: 5, week: 10 }

export interface LensChange {
  view?: LensView
  day?: LocalDate
}

export function Lens({
  view,
  day,
  onChange,
  onSettled,
}: {
  view: LensView
  day: LocalDate
  onChange: (change: LensChange) => void
  /** The last change has finished moving: the time for slower work. */
  onSettled: () => void
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
  // Days stepped away from as a day keep their page while their column
  // closes, so the page slides out instead of blinking into chips.
  const [leaving, setLeaving] = useState<Array<LocalDate>>([])
  if (shown.view !== view || shown.day !== day) {
    setShown({ view, day })
    setMove({
      dir: lensDirection(shown.view, view),
      from: shown.view,
      newMonth: shown.day.slice(0, 7) !== day.slice(0, 7),
    })
    setLeaving(
      shown.view === 'day' &&
        view === 'day' &&
        monthWeeks(shown.day)[0][0] === monthWeeks(day)[0][0]
        ? [...leaving.filter((date) => date !== day), shown.day]
        : [],
    )
  }

  // The room for the grid and the panel, in pixels. Until it is known (the
  // server render, the first paint) the grid falls back to fractions and
  // does not animate.
  const room = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()
  useLayoutEffect(() => {
    const element = room.current
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

  const roomWidth = size?.width ?? 7
  const height = size?.height ?? 7
  /** The grid gives the month's panel its room. */
  const gridWidth = (forView: LensView) =>
    forView === 'month' && size
      ? Math.max(roomWidth - PANEL - PANEL_GAP, 7)
      : roomWidth
  const gridHeight = (forView: LensView) =>
    forView === 'day' || !size ? height : height - HEADER_HEIGHT
  const tracksFor = (forView: LensView) =>
    lensTracks({
      view: forView,
      day,
      width: gridWidth(forView),
      height: gridHeight(forView),
      compact: false,
    })
  const now = tracksFor(view)
  const month = tracksFor('month')
  const week = tracksFor('week')
  const whole = tracksFor('day')
  const unit = size ? 'px' : 'fr'
  const template = (list: Array<number>) =>
    list.map((value) => `${value.toFixed(3)}${unit}`).join(' ')
  // In Day the title steps in to sit over the centred page.
  const inset = view === 'day' ? Math.max(0, (roomWidth - PAGE) / 2) : 0

  const weeks = monthWeeks(day)
  const thisWeek = weekStart(day)
  const events = useShownEvents()
  const firstOfMonth = `${day.slice(0, 7)}-01`
  const bars = useMemo(
    () => monthWeeks(firstOfMonth).map((dates) => weekBars(events, dates)),
    [events, firstOfMonth],
  )
  /** The lanes a row shows in a view: the picked row has more room. */
  const lanesShown = (row: number, forView: LensView) =>
    forView === 'month'
      ? row === now.row
        ? LANES.activeMonth
        : LANES.month
      : LANES.week

  // What a square does when picked, kept stable so a square only redraws
  // when its own look changes: a tap redraws one or two squares, not 35.
  const latest = useRef({ view, day, today, onChange, onSettled })
  useLayoutEffect(() => {
    latest.current = { view, day, today, onChange, onSettled }
  })

  // Once the grid stops moving, the days left behind go, and the page may
  // do what would have stalled the move.
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = grid.current
    if (!element) return
    let live = true
    const settle = async () => {
      for (
        let running = element.getAnimations();
        running.length > 0;
        running = element.getAnimations()
      ) {
        await Promise.allSettled(running.map((one) => one.finished))
      }
      if (!live) return
      setLeaving([])
      latest.current.onSettled()
    }
    void settle()
    return () => {
      live = false
    }
  }, [view, day])
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
      ? day === today
        ? formatLongDay(day)
        : fromToday(day, today)
      : view === 'week'
        ? `Week of ${formatMonthDay(weekStart(day))}`
        : day.slice(0, 4)
  const title =
    view === 'day'
      ? day === today
        ? 'Today'
        : formatLongDay(day)
      : view === 'week'
        ? weekSpan(day)
        : formatMonth(day).split(' ')[0]

  return (
    <div
      className="lens-home flex flex-col gap-5 lg:mx-auto lg:w-full lg:max-w-6xl"
      data-ready={ready ? '' : undefined}
    >
      <header className="flex items-end justify-between gap-4">
        <div className="lens-title min-w-0" style={{ paddingLeft: inset }}>
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <TodayButton day={day} today={today} onToday={goToday} />
          <CalendarsButton />
          <Tabs
            value={view}
            onValueChange={(picked: LensView) => onChange({ view: picked })}
            className="ml-2.5"
          >
            <TabsList className="group-data-horizontal/tabs:h-9">
              {LENS_VIEWS.map((option) => (
                <TabsTrigger key={option} value={option} className="px-3.5">
                  {option[0].toUpperCase() + option.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={`Earlier ${view}`}
            onClick={() => step(-1)}
            className="ml-2.5"
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
        </div>
      </header>

      <div ref={room} className="lens-room" data-view={view}>
        <div
          className="lens"
          data-view={view}
          data-dir={move.dir}
          data-from={move.from}
          data-ready={ready ? '' : undefined}
          style={size ? { width: gridWidth(view) } : undefined}
        >
          <div
            className="lens-weekdays"
            aria-hidden
            style={{ gridTemplateColumns: template(now.cols) }}
          >
            {WEEKDAYS.map((name, col) => (
              <span key={name} data-active={col === now.col ? '' : undefined}>
                {name}
              </span>
            ))}
          </div>
          <div
            // A new month is a new grid: it fades in instead of moving.
            key={weeks[0][0]}
            ref={grid}
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
                  const { pieces, lanes } = bars[row]
                  return (
                    <LensSquare
                      key={date}
                      date={date}
                      row={row}
                      col={col}
                      view={view}
                      lanes={{
                        month: Math.min(lanes, lanesShown(row, 'month')),
                        week: Math.min(lanes, LANES.week),
                      }}
                      hidden={{
                        month: barsHidden(
                          pieces,
                          col,
                          lanesShown(row, 'month'),
                        ),
                        week: barsHidden(pieces, col, LANES.week),
                      }}
                      active={active}
                      leaving={leaving.includes(date)}
                      inWeek={weekStart(date) === thisWeek}
                      outside={date.slice(0, 7) !== day.slice(0, 7)}
                      onPick={pick}
                      onToday={goToday}
                      sizes={{
                        month: sized(month.cols[col], month.rows[row]),
                        week: sized(week.cols[col], week.rows[now.row]),
                        day: sized(whole.cols[now.col], whole.rows[now.row]),
                      }}
                    />
                  )
                })}
                {bars[row].lanes > 0 && (
                  <WeekBars
                    row={row}
                    week={row === now.row}
                    pieces={bars[row].pieces}
                    shown={lanesShown(row, view)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <aside
          className="lens-panel"
          aria-label={`${formatLongDay(day)}, the picked day`}
          inert={view !== 'month'}
        >
          <div className="lens-panel-in">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">
                  {day === today ? 'Today' : formatLongDay(day).split(',')[0]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {day === today
                    ? formatLongDay(day)
                    : `${formatMonthDay(day)} · ${fromToday(day, today)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onChange({ view: 'day' })}
              >
                Day view
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </div>
            <DayView key={day} day={day} onToday={goToday} />
          </div>
        </aside>
      </div>
    </div>
  )
}

type Size = { width: number | string; height: number | string }
type Sizes = { month: Size; week: Size; day: Size }
/** Lanes of bars each drawing leaves room for, under the day's number. */
type Lanes = { month: number; week: number }
/** Bars over this day that its row has no room to show. */
type Hidden = { month: number; week: number }

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height

const LensSquare = memo(
  LensSquareView,
  (a, b) =>
    a.date === b.date &&
    a.row === b.row &&
    a.col === b.col &&
    a.view === b.view &&
    a.lanes.month === b.lanes.month &&
    a.lanes.week === b.lanes.week &&
    a.hidden.month === b.hidden.month &&
    a.hidden.week === b.hidden.week &&
    a.active === b.active &&
    a.leaving === b.leaving &&
    a.inWeek === b.inWeek &&
    a.outside === b.outside &&
    a.onPick === b.onPick &&
    a.onToday === b.onToday &&
    (Object.keys(a.sizes) as Array<keyof Sizes>).every((key) =>
      sameSize(a.sizes[key], b.sizes[key]),
    ),
)

function LensSquareView({
  date,
  row,
  col,
  view,
  lanes,
  hidden,
  active,
  leaving,
  inWeek,
  outside,
  sizes,
  onPick,
  onToday,
}: {
  date: LocalDate
  /** Where it sits in the grid, which the week's bars share. */
  row: number
  col: number
  view: LensView
  lanes: Lanes
  hidden: Hidden
  active: boolean
  /** The day just stepped away from, as a day: its page stays until it is
      out of sight. */
  leaving: boolean
  /** In the picked day's week: the squares a week view shows. */
  inWeek: boolean
  /** In the grid but not the month, such as Sep 27 in October. */
  outside: boolean
  sizes: Sizes
  onPick: (date: LocalDate) => void
  onToday: () => void
}) {
  const board = useBoard()
  const { today } = board
  const { late, due } = dayTodos(board.items, date, today)
  // What spans the week is drawn as a bar over the row instead.
  const events = useEventsOn(date).filter((on) => !isBar(on.event))
  // Only the drawing on show can be reached.
  const monthShown = view === 'month' || !inWeek
  const weekShown = view === 'week' && inWeek
  const number = (
    <span className="lens-head-line" aria-hidden>
      <span className="lens-number">{Number(date.slice(8))}</span>
      {date === today && <span className="lens-today">Today</span>}
    </span>
  )
  const room = (count: number) => (
    <span
      aria-hidden
      className="lens-lanes"
      style={{ ['--shown' as string]: count }}
    />
  )

  return (
    <div
      role="gridcell"
      aria-selected={active}
      className="lens-square"
      style={{ gridRow: row + 1, gridColumn: col + 1 }}
      data-active={active ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
      data-week={inWeek ? '' : undefined}
      data-today={date === today ? '' : undefined}
      data-outside={outside ? '' : undefined}
    >
      {/* The whole square picks the day; what is inside it that can be
          ticked or opened sits above this. */}
      <button
        type="button"
        className="lens-pick"
        aria-label={`${formatLongDay(date)}${date === today ? ', today' : ''}${active && view !== 'day' ? ', open the day' : ''}`}
        aria-current={date === today ? 'date' : undefined}
        tabIndex={view === 'day' ? -1 : undefined}
        onClick={() => onPick(date)}
      />
      <div
        className="lens-layer"
        data-layer="month"
        style={sizes.month}
        inert={!monthShown}
      >
        <div className="lens-pad">
          {number}
          {room(lanes.month)}
          <FitList className="lens-chips" more={hidden.month}>
            {late.length > 0 && (
              <OpenLate
                className="lens-chip"
                count={late.length}
                onToday={onToday}
              />
            )}
            {due.map((todo) => (
              <OpenTodo
                key={todo.id}
                todo={todo}
                className="lens-chip"
                data-done={isOpen(todo) ? undefined : ''}
              >
                <TodoDot todo={todo} tags={board.tags} />
                <span>{todo.title}</span>
              </OpenTodo>
            ))}
            {events.map((on) => (
              <OpenEvent
                key={on.event.key}
                event={on.event}
                className="lens-chip"
                data-event=""
              >
                <EventMark color={on.event.color} />
                <span>{on.event.title}</span>
              </OpenEvent>
            ))}
          </FitList>
        </div>
      </div>
      {inWeek && (
        <div
          className="lens-layer"
          data-layer="week"
          style={sizes.week}
          inert={!weekShown}
        >
          <div className="lens-pad">
            {number}
            {room(lanes.week)}
            <FitList className="lens-list" more={hidden.week}>
              {late.length > 0 && (
                <>
                  <p className="lens-caption" data-late="">
                    Late
                  </p>
                  {late.map((todo) => (
                    <MiniRow key={todo.id} todo={todo} late />
                  ))}
                  <p className="lens-caption">Today</p>
                </>
              )}
              {due.map((todo) => (
                <MiniRow key={todo.id} todo={todo} late={false} />
              ))}
              {due.length === 0 && late.length === 0 && (
                <p className="lens-caption">Nothing due</p>
              )}
              {events.map((on) => (
                <LensEventRow key={on.event.key} on={on} />
              ))}
            </FitList>
          </div>
        </div>
      )}
      {(active || leaving) && (
        <div
          className="lens-layer"
          data-layer="day"
          style={sizes.day}
          inert={!active || view !== 'day'}
        >
          <div className="lens-pad">
            <DayView day={date} onToday={onToday} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Today's chip for what is late: it opens today as a day. */
function OpenLate({
  className,
  count,
  onToday,
}: {
  className: string
  count: number
  onToday: () => void
}) {
  return (
    <button
      type="button"
      className={className}
      data-late=""
      data-carried=""
      onClick={onToday}
    >
      <span>{count} late</span>
    </button>
  )
}

/**
 * A drawing's chips or rows, down to the last that fits whole. What does not
 * fit is hidden and counted in an "N more" line, with `more` bars over the
 * day that its row has no room to show.
 */
function FitList({
  className,
  more: extra,
  children,
}: {
  className: string
  more: number
  children: React.ReactNode
}) {
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
    const counts = (row: HTMLElement) => !row.classList.contains('lens-caption')
    for (const row of rows) row.style.display = ''
    line.textContent = `${extra} more`
    line.hidden = false
    const bottom =
      pad.getBoundingClientRect().bottom -
      parseFloat(getComputedStyle(pad).paddingBottom)
    const last = rows.at(-1)
    const fits = (box: HTMLElement) =>
      box.getBoundingClientRect().bottom <= bottom + 0.5
    let cut = rows.length
    if ((last && !fits(last)) || (extra > 0 && !fits(line))) {
      // "N more" takes the place of the first row it stands for, so it
      // stands for the row before the first place it would not fit.
      const height = line.getBoundingClientRect().height
      const crowded = rows.findIndex(
        (row) => row.getBoundingClientRect().top + height > bottom,
      )
      cut = Math.max(0, (crowded === -1 ? rows.length : crowded) - 1)
      if (crowded === -1 && last && fits(last) && extra > 0) {
        // Every row fits, only the line does not: the last row makes way.
        cut = rows.length - 1
      }
      // A caption with nothing under it goes too.
      while (cut > 0 && !counts(rows[cut - 1])) cut--
    }
    rows.forEach((row, index) => {
      if (index >= cut) row.style.display = 'none'
    })
    const hidden = rows.slice(cut).filter(counts).length + extra
    line.textContent = `${hidden} more`
    line.hidden = hidden === 0
  }, [extra])
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
      <div ref={list} className={className}>
        {children}
      </div>
      <span ref={more} className="lens-more" hidden />
    </>
  )
}
