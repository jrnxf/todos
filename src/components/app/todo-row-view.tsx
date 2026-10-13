// The row's markup, free of the router and the board's queries so it can be
// rendered on its own (see todo-row.test.tsx). todo-row.tsx wires it up.
import { cn } from 'cn'
import { CalendarIcon, ClockIcon, FlagIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { TagDot } from './tag'
import { Row } from './rows'
import type { Tag, Todo } from '@/db/schema'
import type { PersonView } from '@/lib/people'
import type { DueTone } from '@/lib/board'
import type { LocalDate } from '@/lib/dates'

const TONE: Record<DueTone, string> = {
  late: 'text-destructive',
  soon: 'text-warning',
  plain: 'text-muted-foreground',
}

export function PersonAvatar({
  person,
  size,
}: {
  person: PersonView | undefined
  size?: 'sm' | 'default' | 'lg'
}) {
  if (!person) return null
  return (
    <Avatar size={size} aria-label={person.name}>
      {/* The initial is drawn until the picture has loaded, and stays when
          there is none or it fails: the avatar never changes size. */}
      {person.image && (
        <AvatarImage src={person.image} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback className="font-medium text-foreground">
        {person.initial}
      </AvatarFallback>
    </Avatar>
  )
}

/** The line under a title: when it is due, in the colour of how soon. */
export function DueLine({
  todo,
  today,
  className,
}: {
  todo: Todo
  today: LocalDate
  className?: string
}) {
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
  /** Leave the tag off, for lists already grouped by it. */
  hideTag?: boolean
}

/**
 * The row's two targets are siblings: the title's link, whose `::after`
 * covers the whole card (so a tap anywhere opens it), and the checkbox, lifted
 * above that cover. Nothing is nested, and nothing needs `stopPropagation`.
 */
const COVER =
  'outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:ring-3 focus-visible:after:ring-inset focus-visible:after:ring-ring/50'

export function TodoRowView({
  todo,
  secondary = 'due',
  hideTag = false,
  lead,
  selected = false,
  people,
  tags,
  today,
  onDoneChange,
  renderOpen,
}: RowOptions & {
  todo: Todo
  lead?: React.ReactNode
  selected?: boolean
  people: Array<PersonView>
  tags: Array<Tag>
  today: LocalDate
  onDoneChange: (checked: boolean) => void
  /** Draws the element that opens the to-do; it must carry `className`. */
  renderOpen: (props: {
    className: string
    children: React.ReactNode
  }) => React.ReactElement
}) {
  const done = Boolean(todo.doneAt)
  const assignee = people.find((p) => p.id === todo.assignee)
  const tag = hideTag ? undefined : tags.find((one) => one.id === todo.tagId)
  const when =
    secondary === 'due' && todo.dueDate ? (
      <DueLine todo={todo} today={today} />
    ) : secondary === 'time' && (todo.dueTime || todo.mustNotMiss) ? (
      <TimeLine todo={todo} />
    ) : null

  return (
    <Row
      className={cn(
        'relative items-start gap-3 hover:bg-muted/50',
        selected && 'bg-muted hover:bg-muted',
      )}
    >
      {lead}
      <ItemMedia className="relative z-10">
        <Checkbox
          checked={done}
          onCheckedChange={onDoneChange}
          aria-label={
            done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" done`
          }
          // The after: grows the tap area to about 44 px; the box stays put.
          className="size-5.5 rounded-md after:absolute after:-inset-3"
        />
      </ItemMedia>
      {renderOpen({
        className: cn('flex min-w-0 flex-1', COVER),
        children: (
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle
              className={cn(
                'line-clamp-2 text-[0.9375rem]',
                done && 'text-muted-foreground line-through',
              )}
            >
              {todo.title}
            </ItemTitle>
            {!done && (when || tag) && (
              <ItemDescription
                // On a laptop the tag sits at the right of the row instead,
                // so a line holding nothing else is not drawn there.
                className={cn(
                  'flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.8125rem]',
                  !when && 'lg:hidden',
                )}
              >
                {when}
                {tag && (
                  <span className="flex items-center gap-1.5 lg:hidden">
                    <TagDot color={tag.color} />
                    {tag.name}
                  </span>
                )}
              </ItemDescription>
            )}
          </ItemContent>
        ),
      })}
      <ItemActions className="gap-3">
        {tag && (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <TagDot color={tag.color} />
            {tag.name}
          </span>
        )}
        {assignee ? (
          <PersonAvatar person={assignee} size="sm" />
        ) : (
          // Keeps the tag labels in one column on a laptop.
          <span className="hidden size-6 lg:block" />
        )}
      </ItemActions>
    </Row>
  )
}
