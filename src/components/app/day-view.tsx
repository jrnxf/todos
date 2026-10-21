// One day as a page: what the home page shows once it is zoomed all the way
// in, and the picked day's list beside or under the grid. Today keeps
// everything the old Today page had: the bar that fills as the list shrinks,
// what is late, the alerts, a look ahead once nothing is left, and what has
// no date. Any other day is that day's list; a late to-do lives on today,
// so the day it was due points there instead. Under the to-dos, either way,
// come the events of the calendars the person chose to see, and a way to
// add to that day.
import { memo } from 'react'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PartyPopperIcon,
  PlusIcon,
  SunriseIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { DayEvents } from './calendar-events'
import { useAdd } from './capture'
import { alertName, useDayAlerts } from './day-alerts'
import { Section, SectionHeading, TodoGroup } from './todo-row'
import type { Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'

/** How much of "Later" a day with nothing left on it shows. */
const LATER_SHOWN = 5

// Its own memo, so a page sliding out does not redraw as its square stops
// being the active one.
export const DayView = memo(function DayView({
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
})

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

      <Section title="Late" todos={carried} late />
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

      <DayEvents date={today} />
      <AddHere day={today} today={today} />

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
      <NoDate todos={groups.undated} />
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
  const past = day < today
  const due = board.items.filter((todo) => todo.dueDate === day)
  // What is still open from a past day is late, and waits on today.
  const waiting = past ? due.filter(isOpen) : []
  const open = past ? [] : due.filter(isOpen).sort(byDue)
  const done = due.filter((todo) => !isOpen(todo)).sort(byDue)
  const shown = [...open, ...done]
  const late = upNext(board.items, today).overdue

  return (
    <>
      {shown.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          {past ? (
            <SectionHeading>Done that day</SectionHeading>
          ) : (
            <SectionHeading count={open.length}>To do</SectionHeading>
          )}
          <TodoGroup todos={shown} secondary="time" />
        </section>
      ) : (
        waiting.length === 0 && (
          <NothingDue
            title={`Nothing due on ${formatLongWeekday(day)}`}
            detail={nextDeadline(board.items, day)}
          />
        )
      )}
      {past && waiting.length > 0 && (
        <p className="px-1 text-sm text-destructive">
          {waiting.length} from this day {waiting.length === 1 ? 'is' : 'are'}{' '}
          late, waiting on <TodayLink onToday={onToday} />
        </p>
      )}
      <DayEvents date={day} />
      {!past && <AddHere day={day} today={today} />}
      {!past && late.length > 0 && (
        <p className="px-1 text-sm text-destructive">
          {late.length} late, waiting on <TodayLink onToday={onToday} />
        </p>
      )}
    </>
  )
}

function TodayLink({ onToday }: { onToday: () => void }) {
  return (
    <button
      type="button"
      onClick={onToday}
      className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      Today
    </button>
  )
}

/** Adds to this day, saying which. */
function AddHere({ day, today }: { day: LocalDate; today: LocalDate }) {
  const add = useAdd()
  return (
    <Button
      variant="outline"
      size="lg"
      className="justify-start border-dashed font-normal text-muted-foreground shadow-none"
      onClick={() => add({ dueDate: day })}
    >
      <PlusIcon data-icon="inline-start" />
      {day === today ? 'Add for today' : `Add to ${formatLongWeekday(day)}`}
    </Button>
  )
}

/** What has no date yet, folded away under today until asked for. */
function NoDate({ todos }: { todos: Array<Todo> }) {
  if (todos.length === 0) return null
  return (
    <Collapsible className="flex flex-col gap-2.5">
      <CollapsibleTrigger className="group flex items-center justify-between rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <SectionHeading count={todos.length}>No date</SectionHeading>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <TodoGroup todos={todos} />
      </CollapsibleContent>
    </Collapsible>
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
          {fresh
            ? 'Add a to-do and give it a date. On its day, it shows up here.'
            : undated > 0
              ? `No deadline is coming up either. ${undated} without a date ${undated === 1 ? 'is' : 'are'} below.`
              : 'No deadline is coming up either. The list is clear.'}
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
