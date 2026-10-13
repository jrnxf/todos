import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from 'cn'
import { CalendarIcon, ClockIcon, FlagIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { dueLabel } from '@/lib/board'
import { formatTime } from '@/lib/dates'
import { useBoard, useSetDone } from '@/lib/queries'
import { AreaDot } from './area'
import { Row, Rows } from './rows'
import type { Todo } from '@/db/schema'
import type { Person } from '@/server/env'
import type { DueTone } from '@/lib/board'

const TONE: Record<DueTone, string> = {
  late: 'text-destructive',
  soon: 'text-warning',
  plain: 'text-muted-foreground',
}

export function PersonAvatar({
  person,
  size,
}: {
  person: Person | undefined
  size?: 'sm' | 'default' | 'lg'
}) {
  if (!person) return null
  return (
    <Avatar size={size} aria-label={person.name}>
      <AvatarFallback className="font-medium text-foreground">
        {person.initial}
      </AvatarFallback>
    </Avatar>
  )
}

/** The line under a title: when it is due, in the colour of how soon. */
export function DueLine({
  todo,
  className,
}: {
  todo: Todo
  className?: string
}) {
  const { today } = useBoard()
  const due = dueLabel(todo, today)
  if (!due) return null
  const Icon = due.timed ? ClockIcon : CalendarIcon
  return (
    <span
      className={cn('flex items-center gap-1.5', TONE[due.tone], className)}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{due.text}</span>
      {todo.mustNotMiss && (
        <FlagIcon className="size-3.5 shrink-0" aria-label="Must not miss" />
      )}
    </span>
  )
}

/**
 * What a row says about when: the full deadline, only the clock time (under
 * a heading that already names the day), or nothing.
 */
type Secondary = 'due' | 'time' | 'none'

function TimeLine({ todo }: { todo: Todo }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      {todo.dueTime && (
        <>
          <ClockIcon className="size-3.5 shrink-0" />
          {formatTime(todo.dueTime)}
        </>
      )}
      {todo.mustNotMiss && (
        <>
          <FlagIcon className="size-3.5 shrink-0" />
          Must not miss
        </>
      )}
    </span>
  )
}

export interface RowOptions {
  secondary?: Secondary
  /** Leave the area off, for lists already grouped by it. */
  hideArea?: boolean
}

export function TodoRow({
  todo,
  secondary = 'due',
  hideArea = false,
  lead,
}: RowOptions & {
  todo: Todo
  /** Something to show before the checkbox, such as a date or a time. */
  lead?: React.ReactNode
}) {
  const { people, areas } = useBoard()
  const setDone = useSetDone()
  const done = Boolean(todo.doneAt)
  const openId = useRouterState({
    select: (state) => state.location.search.item,
  })
  const anyOpen = openId !== undefined
  const selected = openId === todo.id

  const assignee = people.find((p) => p.id === todo.assignee)
  const area = hideArea
    ? undefined
    : areas.find((one) => one.id === todo.areaId)
  const when =
    secondary === 'due' && todo.dueDate ? (
      <DueLine todo={todo} />
    ) : secondary === 'time' && (todo.dueTime || todo.mustNotMiss) ? (
      <TimeLine todo={todo} />
    ) : null

  return (
    <Row className={cn('items-start gap-3', selected && 'bg-muted')}>
      {lead}
      <ItemMedia>
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => setDone(todo, checked)}
          aria-label={
            done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" done`
          }
          className="size-5.5 rounded-md after:absolute after:-inset-3"
        />
      </ItemMedia>
      <Link
        // Opens over the list instead of leaving it. The first one adds a
        // history entry, so Back closes it; moving to another replaces it.
        to="."
        search={(now) => ({ ...now, item: todo.id })}
        state={(now) => ({ ...now, openedInPlace: true })}
        replace={anyOpen}
        className="flex min-w-0 flex-1 outline-none"
      >
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle
            className={cn(
              'line-clamp-2 text-[0.9375rem]',
              done && 'text-muted-foreground line-through',
            )}
          >
            {todo.title}
          </ItemTitle>
          {!done && (when || area) && (
            <ItemDescription
              // On a laptop the area sits at the right of the row instead,
              // so a line holding nothing else is not drawn there.
              className={cn(
                'flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.8125rem]',
                !when && 'lg:hidden',
              )}
            >
              {when}
              {area && (
                <span className="flex items-center gap-1.5 lg:hidden">
                  <AreaDot color={area.color} />
                  {area.name}
                </span>
              )}
            </ItemDescription>
          )}
        </ItemContent>
      </Link>
      <ItemActions className="gap-3">
        {area && (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <AreaDot color={area.color} />
            {area.name}
          </span>
        )}
        {assignee ? (
          <PersonAvatar person={assignee} size="sm" />
        ) : (
          // Keeps the area labels in one column on a laptop.
          <span className="hidden size-6 lg:block" />
        )}
      </ItemActions>
    </Row>
  )
}

/** A card of rows with a hairline between each. */
export function TodoGroup({
  todos,
  ...options
}: RowOptions & { todos: Array<Todo> }) {
  return (
    <Rows>
      {todos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} {...options} />
      ))}
    </Rows>
  )
}

export function SectionHeading({
  children,
  count,
  late = false,
}: {
  children: React.ReactNode
  count?: number
  /** Drawn in red, for what is overdue. */
  late?: boolean
}) {
  return (
    <h2
      className={cn(
        'flex items-center gap-2 px-1 text-[0.9375rem] font-normal text-muted-foreground',
        late && 'text-destructive',
      )}
    >
      {children}
      {count !== undefined && (
        <Badge variant={late ? 'destructive' : 'secondary'}>{count}</Badge>
      )}
    </h2>
  )
}

export function Section({
  title,
  todos,
  late,
  ...options
}: RowOptions & { title: string; todos: Array<Todo>; late?: boolean }) {
  if (todos.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading count={todos.length} late={late}>
        {title}
      </SectionHeading>
      <TodoGroup todos={todos} {...options} />
    </section>
  )
}
