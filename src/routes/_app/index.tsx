import { Link, createFileRoute } from '@tanstack/react-router'
import { cn } from 'cn'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PartyPopperIcon,
  PlusIcon,
  SunriseIcon,
} from 'lucide-react'
import { alertName, useDayAlerts } from '@/components/app/calendar-views'
import { useAdd } from '@/components/app/capture'
import { Column, ScreenHeader } from '@/components/app/shell'
import { Section, SectionHeading, TodoGroup } from '@/components/app/todo-row'
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
import { comingDay, upNext } from '@/lib/board'
import { addDays, formatLongDay, formatTime, localNow } from '@/lib/dates'
import { useBoard } from '@/lib/queries'

export const Route = createFileRoute('/_app/')({ component: TodayScreen })

/** How much of "Later" a day with nothing left on it shows. */
const LATER_SHOWN = 5

// Today: one list to work down, a bar that fills as it shrinks, the alerts
// still to come, and a look at tomorrow. Not a calendar view: no tabs, no
// arrows. A day with nothing left on it looks ahead instead: what is coming
// is opened up, so the page is never just a notice.
function TodayScreen() {
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
    <Column className={cn(bare && 'flex-1')}>
      <ScreenHeader eyebrow="Today" title={formatLongDay(today)} />

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
        <Item variant="muted" className="gap-3 rounded-xl px-4 py-3.5">
          <ItemMedia className="size-9 rounded-lg border bg-background">
            <SunriseIcon className="size-4.5" />
          </ItemMedia>
          <ItemContent className="gap-0.5">
            <ItemTitle className="text-[0.9375rem]">
              Nothing due today
            </ItemTitle>
            <ItemDescription>
              The next deadline is {comingDay(next.dueDate, today)}.
            </ItemDescription>
          </ItemContent>
        </Item>
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
      {!bare && (
        <div
          className={cn('flex flex-col gap-5', total > 0 && 'border-t pt-5')}
        >
          {tomorrow.length > 0 ? (
            <Section title="Tomorrow" todos={tomorrow} secondary="time" />
          ) : (
            // An empty day already says when the next deadline is.
            total > 0 && (
              <p className="px-1 text-sm text-muted-foreground">
                Tomorrow · nothing due
              </p>
            )
          )}
          {left === 0 ? (
            <>
              <Section title="Week ahead" todos={weekAhead} />
              {groups.later.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  <SectionHeading count={groups.later.length}>
                    Later
                  </SectionHeading>
                  <TodoGroup todos={groups.later.slice(0, LATER_SHOWN)} />
                </section>
              )}
            </>
          ) : (
            weekAhead.length > 0 && (
              <Collapsible className="flex flex-col gap-2.5">
                <CollapsibleTrigger className="group flex items-center justify-between rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <SectionHeading count={weekAhead.length}>
                    Week ahead
                  </SectionHeading>
                  <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <TodoGroup todos={weekAhead} />
                </CollapsibleContent>
              </Collapsible>
            )
          )}
          <p className="px-1 text-sm text-muted-foreground">
            <Link
              to="/upnext"
              className="text-foreground underline underline-offset-4"
            >
              Everything coming up
            </Link>
          </p>
        </div>
      )}
    </Column>
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
