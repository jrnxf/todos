// One to-do, in full: its title, the rows that open the pickers, notes, and
// exactly when it will alert. The phone shows it as a page, the laptop as a
// pane beside the list; both render these same parts.
import { useState } from 'react'
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FlagIcon,
  RotateCcwIcon,
  TagIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { upcomingAlerts } from '@/alerts/rules'
import { dueLabel, headsUpSummary } from '@/lib/board'
import { addDays, formatDay, formatInstantDay, formatTime } from '@/lib/dates'
import { useBoard, useDelete, useSetDone, useUpdateItem } from '@/lib/queries'
import { whenLabel } from '@/lib/when'
import { AreaDot } from './area'
import { Picker } from './picker'
import { Row, Rows } from './rows'
import { AreaFields, HeadsUpFields, WhoFields } from './small-pickers'
import { SectionHeading } from './todo-row'
import { WhenFields } from './when-picker'
import type { LucideIcon } from 'lucide-react'
import type { UpcomingAlert } from '@/alerts/rules'
import type { Todo } from '@/db/schema'
import type { LocalDate, Stamp } from '@/lib/dates'
import type { ItemFields } from '@/server/board'

const ALERT_LABEL: Record<UpcomingAlert['kind'], string> = {
  headsup: 'Heads-up',
  nudge: 'Nudge',
  digest: 'Morning digest',
}

/** "Today, 7:00 pm", "Wed, Oct 14, 7:00 pm" */
function formatStamp(stamp: Stamp, today: LocalDate): string {
  const [date, time] = stamp.split('T')
  const day =
    date === today
      ? 'Today'
      : date === addDays(today, 1)
        ? 'Tomorrow'
        : formatDay(date)
  return `${day}, ${formatTime(time)}`
}

/** A row that shows a value and opens the picker for it. */
function ValueRow({
  icon: Icon,
  label,
  children,
  ...props
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
} & React.ComponentProps<typeof Row>) {
  return (
    // A real button, so it is announced as one and not as a list item.
    <Row role={undefined} render={<button type="button" />} {...props}>
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="font-normal text-muted-foreground">
          {label}
        </ItemTitle>
      </ItemContent>
      <ItemActions className="gap-1.5 font-medium">
        {children}
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Row>
  )
}

type Open = 'when' | 'headsUp' | 'who' | 'area' | null

/** Everything about the to-do except the two buttons that finish or delete it. */
export function TodoDetailBody({ todo }: { todo: Todo }) {
  const board = useBoard()
  const update = useUpdateItem()
  const [open, setOpen] = useState<Open>(null)

  const done = Boolean(todo.doneAt)
  const nameOf = (id: string | null) =>
    board.people.find((p) => p.id === id)?.name
  const due = dueLabel(todo, board.today)
  const alerts = upcomingAlerts(todo, board.now, board.alertConfig)
  const late = Boolean(todo.dueDate && todo.dueDate < board.today)
  const area = board.areas.find((one) => one.id === todo.areaId)

  const save = (patch: Partial<ItemFields>) =>
    update.mutate({ id: todo.id, patch })
  const toggle = (which: Exclude<Open, null>) => (isOpen: boolean) =>
    setOpen(isOpen ? which : null)

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Textarea
          // Remount when the title changes elsewhere, so the box is never stale.
          key={todo.title}
          defaultValue={todo.title}
          aria-label="Title"
          rows={1}
          maxLength={200}
          enterKeyHint="done"
          className="min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-2xl leading-tight font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            const title = event.target.value.trim()
            if (title && title !== todo.title) save({ title })
            else event.target.value = todo.title
          }}
        />
        <p className="text-sm text-muted-foreground">
          Added
          {nameOf(todo.createdBy) ? ` by ${nameOf(todo.createdBy)}` : ''}
          {` on ${formatInstantDay(todo.createdAt)}`}
        </p>
      </div>

      <Rows role="group" aria-label="When">
        <Picker
          title="When"
          description="Pick a date and, if it matters, a time."
          open={open === 'when'}
          onOpenChange={toggle('when')}
          trigger={
            <ValueRow icon={CalendarIcon} label="Due">
              {todo.dueDate ? (
                <>
                  <span>{whenLabel(todo, board.today)}</span>
                  {!done && due && due.tone !== 'plain' && (
                    <Badge
                      variant={
                        due.tone === 'late' ? 'destructive' : 'secondary'
                      }
                      className={
                        due.tone === 'soon' ? 'bg-warning/10 text-warning' : ''
                      }
                    >
                      {due.text.split(' · ')[1]}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="font-normal text-muted-foreground">
                  No date
                </span>
              )}
            </ValueRow>
          }
        >
          <WhenFields
            value={todo}
            onChange={(when) => save(when)}
            onDone={() => setOpen(null)}
          />
        </Picker>

        <Picker
          title="Heads-up"
          description="How far ahead of the deadline to be warned."
          open={open === 'headsUp'}
          onOpenChange={toggle('headsUp')}
          trigger={
            <ValueRow icon={BellIcon} label="Heads-up">
              {todo.dueDate ? (
                <span>{headsUpSummary(todo.headsUpDays)}</span>
              ) : (
                <span className="font-normal text-muted-foreground">
                  Needs a date
                </span>
              )}
            </ValueRow>
          }
        >
          <HeadsUpFields
            value={todo.headsUpDays}
            onChange={(headsUpDays) => save({ headsUpDays })}
          />
        </Picker>
      </Rows>

      <Rows role="group" aria-label="Who and where">
        <Picker
          title="Who"
          description="Whose to-do this is."
          open={open === 'who'}
          onOpenChange={toggle('who')}
          trigger={
            <ValueRow icon={UserIcon} label="Who">
              <span>{nameOf(todo.assignee) ?? 'Either'}</span>
            </ValueRow>
          }
        >
          <WhoFields
            value={todo.assignee}
            onChange={(assignee) => {
              save({ assignee })
              setOpen(null)
            }}
          />
        </Picker>

        <Picker
          title="Area"
          description="File it under an area."
          open={open === 'area'}
          onOpenChange={toggle('area')}
          trigger={
            <ValueRow icon={TagIcon} label="Area">
              {area ? (
                <span className="flex items-center gap-1.5">
                  <AreaDot color={area.color} />
                  {area.name}
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">None</span>
              )}
            </ValueRow>
          }
        >
          <AreaFields
            value={todo.areaId}
            onChange={(areaId) => {
              save({ areaId })
              setOpen(null)
            }}
          />
        </Picker>

        <Row role={undefined}>
          <ItemMedia variant="icon">
            <FlagIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="font-normal text-muted-foreground">
              <label htmlFor="must-not-miss">Must not miss</label>
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <Switch
              id="must-not-miss"
              checked={todo.mustNotMiss}
              onCheckedChange={(mustNotMiss) => save({ mustNotMiss })}
            />
          </ItemActions>
        </Row>
      </Rows>

      <Field>
        <FieldLabel
          htmlFor="notes"
          className="px-1 font-normal text-muted-foreground"
        >
          Notes
        </FieldLabel>
        <Textarea
          id="notes"
          // Remount when another phone changes the notes, so the box never
          // shows something stale.
          key={todo.notes}
          defaultValue={todo.notes}
          placeholder="Anything worth remembering"
          className="min-h-20 text-base md:text-base"
          onBlur={(event) => {
            const notes = event.target.value
            if (notes !== todo.notes) save({ notes })
          }}
        />
      </Field>

      {!done && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>When this will alert</SectionHeading>
          {alerts.length === 0 && !late && (
            <p className="px-1 text-sm text-muted-foreground">
              {todo.dueDate
                ? 'Nothing more before the deadline.'
                : 'No date, so no alerts. Give it a deadline to be reminded.'}
            </p>
          )}
          {(alerts.length > 0 || late || todo.mustNotMiss) && todo.dueDate && (
            <Rows>
              {alerts.map((alert) => (
                <Row key={`${alert.kind}-${alert.at}`} className="py-3">
                  <ItemContent>
                    <ItemTitle className="font-normal">
                      {formatStamp(alert.at, board.today)}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant="secondary">{ALERT_LABEL[alert.kind]}</Badge>
                  </ItemActions>
                </Row>
              ))}
              {(late || todo.mustNotMiss) && (
                <Row key="late" className="py-3">
                  <ItemContent>
                    <ItemTitle className="font-normal">
                      {late ? 'Now it is late' : 'If it goes late'}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    {todo.mustNotMiss ? (
                      <Badge variant="destructive">Every morning, both</Badge>
                    ) : (
                      <Badge variant="secondary">In the morning digest</Badge>
                    )}
                  </ItemActions>
                </Row>
              )}
            </Rows>
          )}
        </section>
      )}

      {done && (
        <p className="px-1 text-sm text-muted-foreground">
          Done{nameOf(todo.doneBy) ? ` by ${nameOf(todo.doneBy)}` : ''} on{' '}
          {formatInstantDay(todo.doneAt as string)}.
        </p>
      )}
    </>
  )
}

/** Mark done (or reopen) and delete. `onLeave` runs after either. */
export function TodoDetailActions({
  todo,
  onLeave,
}: {
  todo: Todo
  onLeave: () => void
}) {
  const setDone = useSetDone()
  const remove = useDelete()
  const done = Boolean(todo.doneAt)
  const leave = onLeave

  return (
    <>
      {done ? (
        <Button
          size="xl"
          variant="outline"
          className="flex-1"
          onClick={() => setDone(todo, false)}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Reopen
        </Button>
      ) : (
        <Button
          size="xl"
          className="flex-1"
          onClick={() => {
            setDone(todo, true)
            leave()
          }}
        >
          <CheckIcon data-icon="inline-start" />
          Mark done
        </Button>
      )}
      <Button
        size="icon-xl"
        variant="destructive"
        aria-label="Delete this to-do"
        onClick={() => {
          remove(todo)
          leave()
        }}
      >
        <Trash2Icon />
      </Button>
    </>
  )
}
