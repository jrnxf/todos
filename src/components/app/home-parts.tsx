// What the home page's phone and laptop shapes share: which to-dos a day
// shows, a to-do as one short tickable row, and the words for where a day
// sits from today.
import { Link, useRouterState } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { byDue, isOpen, upNext, weekStart } from '@/lib/board'
import { addDays, diffDays, formatMonthDay, formatTime } from '@/lib/dates'
import { openInPlace } from '@/lib/in-place'
import { useSetDone } from '@/lib/queries'
import { TagDot } from './tag'
import type { Tag, Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'

/** "Today", "Tomorrow", "In 4 days", "3 days ago". */
export function fromToday(day: LocalDate, today: LocalDate): string {
  const days = diffDays(day, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

/** "Oct 11 to 17", "Oct 25 to Nov 1" */
export function weekSpan(day: LocalDate): string {
  const from = weekStart(day)
  const to = addDays(from, 6)
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${formatMonthDay(from)} to ${Number(to.slice(8))}`
    : `${formatMonthDay(from)} to ${formatMonthDay(to)}`
}

/**
 * What a day lists in the grid and the week: what is due that day, open
 * first, and, on today, what is late. A late to-do has one home, today, so
 * the day it was due no longer lists it.
 */
export function dayTodos(
  items: Array<Todo>,
  date: LocalDate,
  today: LocalDate,
): { late: Array<Todo>; due: Array<Todo> } {
  const late = date === today ? upNext(items, today).overdue : []
  const due = items
    .filter((todo) => todo.dueDate === date && !(date < today && isOpen(todo)))
    .sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || byDue(a, b))
  return { late, due }
}

/** Back to today, pointing the way it is; only there while away. */
export function TodayButton({
  day,
  today,
  onToday,
  size = 'lg',
}: {
  day: LocalDate
  today: LocalDate
  onToday: () => void
  size?: 'lg' | 'sm'
}) {
  if (day === today) return null
  return (
    <Button variant="outline" size={size} onClick={onToday}>
      {day > today && <ArrowLeftIcon data-icon="inline-start" />}
      Today
      {day < today && <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  )
}

/** One to-do as a short row: tick it, or open it. */
export function MiniRow({ todo, late }: { todo: Todo; late: boolean }) {
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
export function OpenTodo({
  todo,
  children,
  ...props
}: {
  todo: Todo
  children: React.ReactNode
} & Omit<React.ComponentProps<'a'>, 'href'>) {
  const anyOpen = useRouterState({
    select: ({ location: { search } }) =>
      search.item !== undefined || search.event !== undefined,
  })
  return (
    <Link
      to="."
      search={(now) => ({ ...now, item: todo.id, event: undefined })}
      state={openInPlace(anyOpen)}
      replace={anyOpen}
      {...props}
    >
      {children}
    </Link>
  )
}

export function TodoDot({ todo, tags }: { todo: Todo; tags: Array<Tag> }) {
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
