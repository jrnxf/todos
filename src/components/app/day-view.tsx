// One day as a page: what the home page shows once it is zoomed all the way
// in. Today keeps everything the old Today page had: the bar that fills as
// the list shrinks, what was carried over, the alerts, and a look ahead once
// nothing is left. Any other day is that day's list, with a pointer back to
// today while something is late.
import { Link } from '@tanstack/react-router'
import {
  BellIcon,
  CheckIcon,
  PartyPopperIcon,
  PlusIcon,
  SunriseIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { byDue, comingDay, isOpen, upNext } from '@/lib/board'
import {
  addDays,
  diffDays,
  formatDay,
  formatLongWeekday,
  formatTime,
  localNow,
} from '@/lib/dates'
import { useBoard } from '@/lib/queries'
import { useAdd } from './capture'
import { alertName, useDayAlerts } from './day-alerts'
import { Section, SectionHeading, TodoGroup } from './todo-row'
import type { Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'

/** How much of "Later" a day with nothing left on it shows. */
const LATER_SHOWN = 5

export function DayView({
  day,
  onToday,
}: {
  day: LocalDate
  /** Go back to today, from a later day's "carried over" line. */
  onToday: () => void
}) {
  const { today } = useBoard()
  return day === today ? (
    <TodayView />
  ) : (
    <OtherDayView day={day} onToday={onToday} />
  )
}

function TodayView() {
  const board = useBoard()
  const { today } = board
  const alerts = useDayAlerts(today)

  const groups = upNext(board.items, today)
  const carried = groups.overdue
  const dueToday = groups.today
  // What was on today's plate and got ticked off today stays in sight.
  const doneToday = board.items.filter(
    (todo) =>
      todo.doneAt &&
      todo.dueDate &&
      todo.dueDate <= today &&
      localNow(board.timeZone, new Date(todo.doneAt)).date === today,
  )
  const total = carried.length + dueToday.length + doneToday.length
  const left = carried.length + dueToday.length

  const tomorrow = groups.week.filter(
    (todo) => todo.dueDate === addDays(today, 1),
  )
  const weekAhead = groups.week.filter(
    (todo) => todo.dueDate !== addDays(today, 1),
  )
  const next = groups.week.at(0) ?? groups.later.at(0)
  const nextAlert = alerts.planned.at(0)

  // Nothing was due and no deadline is coming: the page has one thing to say.
  const bare = total === 0 && !next

  return (
    <>
      {total > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Progress
            value={(doneToday.length / total) * 100}
            aria-label="Done today"
            className="w-32 lg:w-40"
          />
          <span>
            {doneToday.length} of {total} done
          </span>
          {nextAlert && (
            <span className="ml-auto flex items-center gap-1.5">
              <BellIcon className="size-3.5" />
              <span className="hidden lg:inline">Next alert</span>
              {formatTime(nextAlert.at.slice(11))}
            </span>
          )}
        </div>
      )}

      <Section title="Carried over" todos={carried} late />
      {(dueToday.length > 0 || doneToday.length > 0) && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading count={dueToday.length}>Today</SectionHeading>
          <TodoGroup todos={[...dueToday, ...doneToday]} secondary="time" />
        </section>
      )}

      {total === 0 && next?.dueDate && (
        <NothingDue
          title="Nothing due today"
          detail={`The next deadline is ${comingDay(next.dueDate, today)}.`}
        />
      )}
      {total > 0 && left === 0 && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <PartyPopperIcon className="size-4" />
          All done for today.
        </p>
      )}

      {(alerts.sent.length > 0 || alerts.planned.length > 0) && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>Buzzing today</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {alerts.sent.map((alert) => (
              <Badge
                key={`sent-${alert.kind}-${alert.itemId}-${alert.time}`}
                variant="outline"
                className="h-6 gap-1.5 px-2.5 font-normal text-muted-foreground"
              >
                <CheckIcon data-icon="inline-start" />
                <span className="font-medium tabular-nums">
                  {formatTime(alert.time)}
                </span>
                {alertName(alert.kind, alert.title)}, sent
              </Badge>
            ))}
            {alerts.planned.map((alert) => (
              <Badge
                key={`planned-${alert.kind}-${alert.itemId}-${alert.at}`}
                variant="outline"
                className={
                  alert.priority === 1
                    ? 'h-6 max-w-full gap-1.5 border-destructive/40 px-2.5 font-normal'
                    : 'h-6 max-w-full gap-1.5 px-2.5 font-normal'
                }
              >
                <BellIcon data-icon="inline-start" />
                <span className="font-medium tabular-nums">
                  {formatTime(alert.at.slice(11))}
                </span>
                <span className="truncate">
                  {alertName(alert.kind, alert.todoTitle)}
                  {alert.priority === 1 ? ', both' : ''}
                </span>
              </Badge>
            ))}
          </div>
        </section>
      )}

      {bare && (
        <NothingAhead
          fresh={board.items.length === 0}
          undated={groups.undated.length}
        />
      )}
      {/* Once nothing is left, today looks ahead. While there is still work,
          the week view is one tap away instead. */}
      {!bare && left === 0 && (
        <div className="flex flex-col gap-5 border-t pt-5">
          <Section title="Tomorrow" todos={tomorrow} secondary="time" />
          <Section title="Week ahead" todos={weekAhead} />
          {groups.later.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionHeading count={groups.later.length}>Later</SectionHeading>
              <TodoGroup todos={groups.later.slice(0, LATER_SHOWN)} />
            </section>
          )}
        </div>
      )}
    </>
  )
}

function OtherDayView({
  day,
  onToday,
}: {
  day: LocalDate
  onToday: () => void
}) {
  const board = useBoard()
  const { today } = board
  const due = board.items.filter((todo) => todo.dueDate === day)
  const open = due.filter(isOpen).sort(byDue)
  const done = due.filter((todo) => !isOpen(todo)).sort(byDue)
  const past = day < today
  const late = upNext(board.items, today).overdue

  return (
    <>
      {due.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          {past &&
            (open.length > 0 ? (
              <SectionHeading count={open.length} late>
                Still open from this day
              </SectionHeading>
            ) : (
              <SectionHeading>Done that day</SectionHeading>
            ))}
          <TodoGroup
            todos={[...open, ...done]}
            secondary={past ? 'due' : 'time'}
          />
        </section>
      ) : (
        <NothingDue
          title={`Nothing due on ${formatLongWeekday(day)}`}
          detail={nextDeadline(board.items, day)}
        />
      )}
      {!past && late.length > 0 && (
        <p className="px-1 text-sm text-destructive">
          {late.length} carried over, waiting on{' '}
          <button
            type="button"
            onClick={onToday}
            className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Today
          </button>
        </p>
      )}
    </>
  )
}

/** "The next deadline is Thursday.", counted from `day`, not from today. */
function nextDeadline(items: Array<Todo>, day: LocalDate): string {
  const next = items
    .filter(isOpen)
    .filter((todo) => todo.dueDate !== null && todo.dueDate > day)
    .sort(byDue)
    .at(0)?.dueDate
  if (!next) return 'No deadline is coming up after it.'
  return diffDays(next, day) < 7
    ? `The next deadline is ${formatLongWeekday(next)}.`
    : `The next deadline is ${formatDay(next)}.`
}

function NothingDue({ title, detail }: { title: string; detail: string }) {
  return (
    <Item variant="muted" className="gap-3 rounded-xl px-4 py-3.5">
      <ItemMedia className="size-9 rounded-lg border bg-background">
        <SunriseIcon className="size-4.5" />
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <ItemTitle className="text-[0.9375rem]">{title}</ItemTitle>
        <ItemDescription>{detail}</ItemDescription>
      </ItemContent>
    </Item>
  )
}

/** The whole page, when nothing was due today and no deadline is coming. */
function NothingAhead({
  fresh,
  undated,
}: {
  /** A household that has never added a to-do. */
  fresh: boolean
  /** How many open to-dos have no date. */
  undated: number
}) {
  const add = useAdd()
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 [&_svg]:size-5">
          <SunriseIcon />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {fresh ? 'Nothing on the list yet' : 'Nothing due today'}
        </EmptyTitle>
        <EmptyDescription>
          {fresh ? (
            'Add a to-do and give it a date. On its day, it shows up here.'
          ) : undated > 0 ? (
            <>
              No deadline is coming up either. {undated} without a date{' '}
              {undated === 1 ? 'is' : 'are'} in <Link to="/list">List</Link>.
            </>
          ) : (
            'No deadline is coming up either. The list is clear.'
          )}
        </EmptyDescription>
      </EmptyHeader>
      {fresh && (
        <EmptyContent>
          <Button onClick={() => add()}>
            <PlusIcon data-icon="inline-start" />
            Add a to-do
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
