import { Link, createFileRoute } from '@tanstack/react-router'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  PartyPopperIcon,
  SunriseIcon,
} from 'lucide-react'
import { alertName, useDayAlerts } from '@/components/app/calendar-views'
import { Column, ScreenHeader } from '@/components/app/shell'
import { Section, SectionHeading, TodoGroup } from '@/components/app/todo-row'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { byDue, isOpen } from '@/lib/board'
import { addDays, formatLongDay, formatTime, localNow } from '@/lib/dates'
import { useBoard } from '@/lib/queries'

export const Route = createFileRoute('/_app/')({ component: TodayScreen })

// Today: one list to work down, a bar that fills as it shrinks, the alerts
// still to come, and a look at tomorrow. Not a calendar view: no tabs, no
// arrows.
function TodayScreen() {
  const board = useBoard()
  const { today } = board
  const alerts = useDayAlerts(today)

  const open = board.items.filter(isOpen).sort(byDue)
  const carried = open.filter((todo) => todo.dueDate && todo.dueDate < today)
  const dueToday = open.filter((todo) => todo.dueDate === today)
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

  const tomorrow = open.filter((todo) => todo.dueDate === addDays(today, 1))
  const restOfWeek = open.filter(
    (todo) =>
      todo.dueDate &&
      todo.dueDate > addDays(today, 1) &&
      todo.dueDate <= addDays(today, 7),
  )
  const nextAlert = alerts.planned.at(0)

  return (
    <Column>
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

      {total === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SunriseIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing due today</EmptyTitle>
            <EmptyDescription>
              Nothing carried over either. Tomorrow is below.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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

      <div className="flex flex-col gap-5 border-t pt-5">
        {tomorrow.length > 0 ? (
          <Section title="Tomorrow" todos={tomorrow} secondary="time" />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            Tomorrow · nothing due
          </p>
        )}
        {restOfWeek.length > 0 && (
          <Collapsible className="flex flex-col gap-2.5">
            <CollapsibleTrigger className="group flex items-center justify-between rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <SectionHeading count={restOfWeek.length}>
                Rest of this week
              </SectionHeading>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TodoGroup todos={restOfWeek} />
            </CollapsibleContent>
          </Collapsible>
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
    </Column>
  )
}
