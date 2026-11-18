// Who has what this plan week: each person's to-dos side by side with how
// many are done, and the ones on no one in a smaller list below. It makes
// the planning talk quick: each plate is in view before more goes on it.
import { useState } from 'react'
import { cn } from 'cn'
import { UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { isOpen } from '@/lib/board'
import { planWeekSpan, planWeekStart, planWeekTodos } from '@/lib/plan-week'
import { useBoard, useSetDone } from '@/lib/queries'
import { OpenTodo } from './home-parts'
import { Picker } from './picker'
import { PersonAvatar } from './todo-row-view'
import type { Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'

/** Opens the plates of the plan week holding `day`. */
export function PlatesButton({ day }: { day: LocalDate }) {
  const { planDay } = useBoard()
  const [open, setOpen] = useState(false)
  if (planDay === null) return null
  return (
    <Picker
      title="Who has what"
      description="Each person's to-dos this plan week."
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="icon-lg" aria-label="Who has what">
          <UsersIcon />
        </Button>
      }
    >
      <Plates day={day} className="lg:w-[34rem]" />
    </Picker>
  )
}

export function Plates({
  day,
  className,
}: {
  day: LocalDate
  className?: string
}) {
  const { items, people, planDay } = useBoard()
  if (planDay === null) return null
  const start = planWeekStart(day, planDay)
  const todos = planWeekTodos(items, start, planDay)
  const either = todos.filter((todo) => todo.assignee === null)

  return (
    <section
      aria-label="Who has what"
      className={cn('flex flex-col gap-3', className)}
    >
      <p className="px-1 text-sm text-muted-foreground">
        Plan week {planWeekSpan(start)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {people.map((person) => (
          <Plate
            key={person.id}
            head={
              <>
                <PersonAvatar person={person} size="sm" />
                {person.name}
              </>
            }
            todos={todos.filter((todo) => todo.assignee === person.id)}
          />
        ))}
      </div>
      {either.length > 0 && <Plate head="Either of us" todos={either} small />}
    </section>
  )
}

function Plate({
  head,
  todos,
  small = false,
}: {
  head: React.ReactNode
  todos: Array<Todo>
  small?: boolean
}) {
  const done = todos.filter((todo) => !isOpen(todo)).length
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3',
        small && 'gap-1.5 py-2.5',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {head}
        <span className="ml-auto text-xs font-normal whitespace-nowrap text-muted-foreground">
          {done} of {todos.length} done
        </span>
      </div>
      {!small && todos.length > 0 && (
        <Progress
          value={(done / todos.length) * 100}
          aria-label="Done this plan week"
        />
      )}
      {todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet</p>
      ) : (
        <ul className="flex flex-col">
          {todos.map((todo) => (
            <PlateRow key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlateRow({ todo }: { todo: Todo }) {
  const setDone = useSetDone()
  const done = !isOpen(todo)
  return (
    <li className="flex min-w-0 items-center gap-2 py-1 text-sm">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => setDone(todo, checked)}
        aria-label={
          done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" done`
        }
      />
      <OpenTodo
        todo={todo}
        className={cn(
          'min-w-0 truncate hover:underline',
          done && 'text-muted-foreground line-through',
        )}
      >
        {todo.title}
      </OpenTodo>
    </li>
  )
}
