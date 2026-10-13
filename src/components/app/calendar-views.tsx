// The Calendar page's parts: a real month for a laptop, a small one for a
// phone, and the agenda that runs on by week. Plus the day's alerts, which
// the Today page shows.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { alertsInWindow } from '@/alerts/rules'
import { byDue, isOpen, monthStart, weekDays } from '@/lib/board'
import {
  addDays,
  addMinutes,
  formatMonthDay,
  formatWeekday,
  fromPickerDate,
  toPickerDate,
  toStamp,
  weekday,
} from '@/lib/dates'
import { useBoard } from '@/lib/queries'
import { getSentAlerts } from '@/server/board'
import { AreaDot } from './area'
import { useAdd } from './capture'
import { Rows } from './rows'
import { SectionHeading, TodoRow } from './todo-row'
import type { PlannedAlert } from '@/alerts/rules'
import type { Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'
import type { SentAlert } from '@/server/board'

/** "October 2026" */
export function monthLabel(day: LocalDate): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}

function monthName(day: LocalDate): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}

export function CalendarNav({
  onStep,
  onToday,
}: {
  onStep: (direction: -1 | 1) => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Earlier month"
        onClick={() => onStep(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Later month"
        onClick={() => onStep(1)}
      >
        <ChevronRightIcon />
      </Button>
      <Button variant="outline" size="lg" onClick={onToday}>
        Today
      </Button>
    </div>
  )
}

function useDated(): Array<Todo> {
  const { items } = useBoard()
  return items
    .filter(isOpen)
    .filter((todo) => todo.dueDate !== null)
    .sort(byDue)
}

// ── The day's alerts ────────────────────────────────────────────────────────

const ALERT_NAME: Record<string, string> = {
  digest: 'Digest',
  headsup: 'Heads-up',
  nudge: 'Nudge',
  overdue: 'Still late',
}

/** "Heads-up: Dentist", or just "Digest". */
export function alertName(kind: string, title: string | null | undefined) {
  const name = ALERT_NAME[kind] ?? kind
  return kind === 'digest' || !title ? name : `${name}: ${title}`
}

/**
 * Every buzz one day makes for whoever holds the phone: what the scheduler
 * recorded as sent, and what the rules say is still to come. Nothing counts
 * as sent unless it was.
 */
export function useDayAlerts(day: LocalDate): {
  sent: Array<SentAlert>
  planned: Array<PlannedAlert & { todoTitle: string | undefined }>
} {
  const board = useBoard()
  const sent = useQuery({
    queryKey: ['sent-alerts', day, board.me],
    queryFn: () => getSentAlerts({ data: { date: day } }),
    staleTime: 30_000,
  })

  const open = board.items.filter(isOpen)
  const dayStart = addMinutes(toStamp(day, '00:00'), -1)
  const planned = alertsInWindow({
    items: open,
    people: board.people,
    from: dayStart > board.now ? dayStart : board.now,
    to: toStamp(day, '23:59'),
    config: board.alertConfig,
  })
    .filter((alert) => alert.person === board.me)
    .map((alert) => ({
      ...alert,
      todoTitle: open.find((todo) => todo.id === alert.itemId)?.title,
    }))

  return { sent: sent.data ?? [], planned }
}

// ── A real month, for a laptop ──────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Titles written in one day before the rest collapse to a count. */
const CHIPS_PER_DAY = 3

export function MonthGrid({ day }: { day: LocalDate }) {
  const { today, areas } = useBoard()
  const add = useAdd()
  const dated = useDated()

  const first = monthStart(day)
  const next = monthStart(day, 1)
  const gridStart = addDays(first, -weekday(first))
  const weeks = Math.ceil(
    (weekday(first) + Number(addDays(next, -1).slice(8))) / 7,
  )
  const days = Array.from({ length: weeks * 7 }, (_, index) =>
    addDays(gridStart, index),
  )

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b text-center text-sm text-muted-foreground">
        {WEEKDAYS.map((name) => (
          <div key={name} className="py-2">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date, index) => {
          const inMonth = date >= first && date < next
          const due = dated.filter((todo) => todo.dueDate === date)
          return (
            // The whole square adds a to-do on that day; the number is the
            // same action as a real button, for the keyboard.
            <div
              key={date}
              onClick={() => add({ dueDate: date })}
              className={cn(
                'flex min-h-28 min-w-0 cursor-pointer flex-col gap-1 p-1.5 transition-colors hover:bg-muted/50',
                index >= 7 && 'border-t',
                index % 7 !== 0 && 'border-l',
                date === today && 'bg-muted/50',
              )}
            >
              <button
                type="button"
                aria-label={`Add a to-do on ${formatMonthDay(date)}`}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  !inMonth && 'text-muted-foreground/60',
                  date === today &&
                    'bg-primary font-medium text-primary-foreground',
                )}
              >
                {Number(date.slice(8))}
              </button>
              {due.slice(0, CHIPS_PER_DAY).map((todo) => {
                const area = areas.find((one) => one.id === todo.areaId)
                return (
                  <Link
                    key={todo.id}
                    to="."
                    search={(now) => ({ ...now, item: todo.id })}
                    state={(now) => ({ ...now, openedInPlace: true })}
                    onClick={(event) => event.stopPropagation()}
                    title={todo.title}
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.8125rem] leading-snug font-medium outline-none hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50',
                      date < today
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted',
                    )}
                  >
                    {area && (
                      <AreaDot color={area.color} className="size-1.5" />
                    )}
                    <span className="truncate">{todo.title}</span>
                  </Link>
                )
              })}
              {due.length > CHIPS_PER_DAY && (
                <span className="px-1.5 text-xs text-muted-foreground">
                  {due.length - CHIPS_PER_DAY} more
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── A small month, for a phone ──────────────────────────────────────────────

// A dot under each day that has something due; red once that day has passed.
export const DAY_DOT =
  'after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:z-20 after:size-1 after:-translate-x-1/2 after:rounded-full'

export function CompactMonth({
  day,
  onPickDay,
}: {
  day: LocalDate
  onPickDay: (day: LocalDate) => void
}) {
  const { today } = useBoard()
  const dueDays = [...new Set(useDated().map((todo) => todo.dueDate as string))]
  return (
    <Calendar
      mode="single"
      required
      selected={toPickerDate(day)}
      month={toPickerDate(monthStart(day))}
      onSelect={(picked) => onPickDay(fromPickerDate(picked))}
      modifiers={{
        due: dueDays.filter((date) => date >= today).map(toPickerDate),
        late: dueDays.filter((date) => date < today).map(toPickerDate),
      }}
      modifiersClassNames={{
        due: `${DAY_DOT} after:bg-muted-foreground has-data-[selected-single=true]:after:bg-primary-foreground`,
        late: `${DAY_DOT} after:bg-destructive`,
      }}
      // The month's name and arrows are above, shared with the agenda.
      classNames={{ month_caption: 'hidden', nav: 'hidden' }}
      className="w-full bg-transparent p-0 [--cell-size:--spacing(10)]"
    />
  )
}

// ── The agenda ──────────────────────────────────────────────────────────────

interface AgendaSection {
  key: string
  title: string
  hint?: string
  late?: boolean
  todos: Array<Todo>
}

/** "Oct 11 to 17", "Oct 25 to Nov 1" */
function span(from: LocalDate, to: LocalDate): string {
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${formatMonthDay(from)} to ${Number(to.slice(8))}`
    : `${formatMonthDay(from)} to ${formatMonthDay(to)}`
}

function agendaSections(
  dated: Array<Todo>,
  day: LocalDate,
  today: LocalDate,
): Array<AgendaSection> {
  const first = monthStart(day)
  const next = monthStart(day, 1)
  const between = (from: LocalDate, to: LocalDate) =>
    dated.filter(
      (todo) =>
        (todo.dueDate as string) >= from && (todo.dueDate as string) <= to,
    )

  // Another month: just that month, a section per week.
  if (today < first || today >= next) {
    const sections: Array<AgendaSection> = []
    for (
      let start = addDays(first, -weekday(first));
      start < next;
      start = addDays(start, 7)
    ) {
      const from = start < first ? first : start
      const to =
        addDays(start, 6) >= next ? addDays(next, -1) : addDays(start, 6)
      sections.push({
        key: from,
        title: span(from, to),
        todos: between(from, to),
      })
    }
    return sections
  }

  // This month: from today on, by week, then running into later months.
  const weekEnd = weekDays(today)[6]
  const nextWeekEnd = addDays(weekEnd, 7)
  const sections: Array<AgendaSection> = [
    {
      key: 'before',
      title: 'Still open from before',
      late: true,
      todos: dated.filter((todo) => (todo.dueDate as string) < today),
    },
    {
      key: 'this-week',
      title: 'This week',
      hint: span(weekDays(today)[0], weekEnd),
      todos: between(today, weekEnd),
    },
    {
      key: 'next-week',
      title: 'Next week',
      hint: span(addDays(weekEnd, 1), nextWeekEnd),
      todos: between(addDays(weekEnd, 1), nextWeekEnd),
    },
    {
      key: 'later',
      title: `Later in ${monthName(today)}`,
      todos: between(addDays(nextWeekEnd, 1), addDays(next, -1)),
    },
  ]
  const after = nextWeekEnd >= next ? addDays(nextWeekEnd, 1) : next
  const byMonth = new Map<string, Array<Todo>>()
  for (const todo of dated) {
    const due = todo.dueDate as string
    if (due < after) continue
    const month = monthStart(due)
    byMonth.set(month, [...(byMonth.get(month) ?? []), todo])
  }
  for (const [month, todos] of byMonth) {
    sections.push({ key: month, title: monthLabel(month), todos })
  }
  return sections
}

/** The date down the left edge: "Today", "Tue 13", or "Nov 14" further out. */
function gutter(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today'
  return date.slice(0, 7) === today.slice(0, 7)
    ? `${formatWeekday(date)} ${Number(date.slice(8))}`
    : formatMonthDay(date)
}

export function Agenda({ day }: { day: LocalDate }) {
  const { today } = useBoard()
  const sections = agendaSections(useDated(), day, today).filter(
    (section) => section.todos.length > 0,
  )

  if (sections.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Nothing with a date here.
      </p>
    )
  }
  return (
    <>
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-2.5">
          <SectionHeading late={section.late} count={section.todos.length}>
            {section.title}
            {section.hint && (
              <span className="text-xs text-muted-foreground">
                {section.hint}
              </span>
            )}
          </SectionHeading>
          <Rows>
            {section.todos.map((todo, index) => {
              const date = todo.dueDate as string
              // Name the day once, on its first to-do.
              const first = section.todos[index - 1]?.dueDate !== date
              return (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  secondary="time"
                  lead={
                    <span
                      className={cn(
                        'w-14 shrink-0 pt-0.5 text-xs font-medium tabular-nums',
                        section.late && 'text-destructive',
                      )}
                    >
                      {first ? gutter(date, today) : ''}
                    </span>
                  }
                />
              )
            })}
          </Rows>
        </section>
      ))}
    </>
  )
}
