import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { useBoard, useSetDone } from '@/lib/queries'
import { openInPlace } from '@/lib/in-place'
import { Rows } from './rows'
import { TodoRowView } from './todo-row-view'
import type { RowOptions } from './todo-row-view'
import type { Todo } from '@/db/schema'

export { PersonAvatar } from './todo-row-view'

export function TodoRow(
  props: RowOptions & {
    todo: Todo
    /** Something to show before the checkbox, such as a date or a time. */
    lead?: React.ReactNode
  },
) {
  const { todo } = props
  const { people, tags, today } = useBoard()
  const setDone = useSetDone()
  const openId = useRouterState({
    select: (state) => state.location.search.item,
  })
  const anyOpen = useRouterState({
    select: ({ location: { search } }) =>
      search.item !== undefined || search.event !== undefined,
  })

  return (
    <TodoRowView
      {...props}
      selected={openId === todo.id}
      people={people}
      tags={tags}
      today={today}
      onDoneChange={(checked) => setDone(todo, checked)}
      renderOpen={({ className, children }) => (
        <Link
          // Opens over the list instead of leaving it. The first one adds a
          // history entry, so Back closes it; moving to another replaces it.
          to="."
          search={(now) => ({ ...now, item: todo.id, event: undefined })}
          state={openInPlace(anyOpen)}
          replace={anyOpen}
          className={className}
        >
          {children}
        </Link>
      )}
    />
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
