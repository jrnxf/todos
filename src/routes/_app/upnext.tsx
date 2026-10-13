import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarCheckIcon } from 'lucide-react'
import { Column, ScreenHeader } from '@/components/app/shell'
import { Section } from '@/components/app/todo-row'
import { Badge } from '@/components/ui/badge'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { isOpen, upNext } from '@/lib/board'
import { formatLongDay } from '@/lib/dates'
import { useBoard } from '@/lib/queries'

export const Route = createFileRoute('/_app/upnext')({
  component: UpNextScreen,
})

// The deadline view: what bites soonest, first. Things without a date stay
// out of the way in List.
function UpNextScreen() {
  const board = useBoard()
  const groups = upNext(board.items, board.today)
  const open = board.items.filter(isOpen).length
  const dated = open - groups.undated.length

  return (
    <Column>
      <div className="flex flex-col gap-3">
        <ScreenHeader title="Up next" subtitle={formatLongDay(board.today)} />
        <div className="flex flex-wrap gap-2 *:h-6 *:px-2.5 *:text-[0.8125rem]">
          {groups.overdue.length > 0 && (
            <Badge variant="destructive">{groups.overdue.length} overdue</Badge>
          )}
          <Badge variant="secondary">{groups.today.length} today</Badge>
          <Badge variant="outline">{open} open</Badge>
        </div>
      </div>

      <Section title="Overdue" todos={groups.overdue} />
      <Section title="Today" todos={groups.today} />
      <Section title="Week ahead" todos={groups.week} />
      <Section title="Later" todos={groups.later} />

      {dated === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing with a deadline</EmptyTitle>
            <EmptyDescription>
              Add a to-do and give it a date, and it shows up here in the order
              it bites.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {groups.undated.length > 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          {groups.undated.length} without a date{' '}
          {groups.undated.length === 1 ? 'is' : 'are'} in{' '}
          <Link
            to="/list"
            className="text-foreground underline underline-offset-4"
          >
            List
          </Link>
          .
        </p>
      )}
    </Column>
  )
}
