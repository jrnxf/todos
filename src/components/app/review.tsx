// The planning-day review. On the planning day, what is left from last week
// comes up one card at a time: done, on to the next planning day, a day of
// its own, or dropped. Then a box to plan the coming week, whose to-dos are
// due by the next planning day. Home's banner opens it, and so does the
// planning day's morning push; it lives in the URL (`?review=1`).
import { useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerKeyboard,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatDay, formatWeekday } from '@/lib/dates'
import { leftFromLastWeek, nextPlanDay } from '@/lib/plan-week'
import {
  useAddItem,
  useBoard,
  useDelete,
  useMoveTo,
  useSetDone,
  useUpdateItem,
} from '@/lib/queries'
import { EMPTY_FIELDS } from './capture'
import { useIsDesktop } from './picker'
import { Plates } from './plates'
import { WhenFields } from './when-picker'
import type { Todo } from '@/db/schema'

const EVERYONE = 'everyone'

/** What is left from last week. Empty when the household plans on no day. */
export function useLeftovers(): Array<Todo> {
  const { items, today, planDay } = useBoard()
  return planDay === null ? [] : leftFromLastWeek(items, today, planDay)
}

/** "2 left from last week · Review", on Home until nothing is left. */
export function ReviewBanner() {
  const left = useLeftovers()
  if (left.length === 0) return null
  return (
    <Link
      to="."
      search={(now) => ({ ...now, review: 1 })}
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
    >
      <span className="font-medium">{left.length} left from last week</span>
      <span className="ml-auto flex items-center gap-1 text-muted-foreground">
        Review
        <ArrowRightIcon className="size-4" />
      </span>
    </Link>
  )
}

export function ReviewDrawer() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const open = useRouterState({
    select: (state) => state.location.search.review === 1,
  })
  const close = () =>
    void navigate({
      to: '.',
      search: (now) => ({ ...now, review: undefined }),
      replace: true,
    })

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      swipeDirection={desktop ? 'right' : 'down'}
      showSwipeHandle={!desktop}
    >
      <DrawerKeyboard>
        <DrawerContent className="mx-auto max-w-md data-[swipe-axis=x]:mx-0 data-[swipe-axis=x]:max-w-none data-[swipe-axis=x]:rounded-none data-[swipe-axis=x]:shadow-lg data-[swipe-axis=x]:sm:[--drawer-content-width:26rem] data-[swipe-direction=down]:bottom-(--drawer-keyboard-inset,0px)">
          <DrawerHeader className="flex-row items-center justify-between px-4 pt-3 pb-0">
            <div className="flex flex-col gap-0.5 text-left">
              <DrawerTitle className="text-xl font-semibold">
                Plan the week
              </DrawerTitle>
              <DrawerDescription>
                Settle what is left, then plan what comes next.
              </DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Close"
              onClick={close}
            >
              <XIcon />
            </Button>
          </DrawerHeader>
          {open && <Review onClose={close} />}
        </DrawerContent>
      </DrawerKeyboard>
    </Drawer>
  )
}

function Review({ onClose }: { onClose: () => void }) {
  const { people } = useBoard()
  const [person, setPerson] = useState(EVERYONE)
  // A to-do with no one on it is both of ours, so it shows for each.
  const left = useLeftovers().filter(
    (todo) =>
      person === EVERYONE || todo.assignee === null || todo.assignee === person,
  )
  const current = left.at(0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] *:shrink-0">
      <ToggleGroup
        variant="chip"
        size="touch"
        aria-label="Whose"
        className="flex-wrap"
        value={[person]}
        onValueChange={([picked]: Array<string | undefined>) =>
          setPerson(picked ?? EVERYONE)
        }
      >
        <ToggleGroupItem value={EVERYONE}>Everyone</ToggleGroupItem>
        {people.map((one) => (
          <ToggleGroupItem key={one.id} value={one.id}>
            {one.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {current ? (
        <Leftover key={current.id} todo={current} left={left.length} />
      ) : (
        <PlanNext person={person === EVERYONE ? null : person} />
      )}
      {!current && (
        <Button size="xl" className="lg:h-10 lg:text-sm" onClick={onClose}>
          Done
        </Button>
      )}
    </div>
  )
}

/** One to-do left from last week, and the four ways to settle it. */
function Leftover({ todo, left }: { todo: Todo; left: number }) {
  const { today, planDay, people } = useBoard()
  const setDone = useSetDone()
  const moveTo = useMoveTo()
  const update = useUpdateItem()
  const drop = useDelete()
  const [picking, setPicking] = useState(false)
  const next = planDay === null ? null : nextPlanDay(today, planDay)
  const who =
    people.find((one) => one.id === todo.assignee)?.name ?? 'Either of us'

  return (
    <section className="flex flex-col gap-3" aria-label="Left from last week">
      <h3 className="px-1 text-[0.9375rem] text-muted-foreground">
        Left from last week · {left} to go
      </h3>
      <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
        <p className="text-lg font-semibold">{todo.title}</p>
        <p className="text-sm text-muted-foreground">
          Was due {formatDay(todo.dueDate as string)} · {who}
        </p>
      </div>
      {picking ? (
        <WhenFields
          value={todo}
          onChange={(when) => update.mutate({ id: todo.id, patch: when })}
          onDone={() => setPicking(false)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="xl" onClick={() => setDone(todo, true)}>
            <CheckIcon data-icon="inline-start" />
            Done
          </Button>
          {next && (
            <Button
              variant="outline"
              size="xl"
              onClick={() => moveTo(todo, next)}
            >
              <ArrowRightIcon data-icon="inline-start" />
              Next {formatWeekday(next)}
            </Button>
          )}
          <Button variant="outline" size="xl" onClick={() => setPicking(true)}>
            <CalendarIcon data-icon="inline-start" />
            Pick a day
          </Button>
          <Button
            variant="outline"
            size="xl"
            className="text-destructive"
            onClick={() => drop(todo)}
          >
            <Trash2Icon data-icon="inline-start" />
            Drop it
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * The coming week: each person's plate, and a box that adds to-dos due by
 * the next planning day. With a person picked, what is added is theirs.
 */
function PlanNext({ person }: { person: string | null }) {
  const { today, planDay } = useBoard()
  const add = useAddItem()
  const [title, setTitle] = useState('')
  if (planDay === null) return null
  const by = nextPlanDay(today, planDay)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    add.mutate({
      ...EMPTY_FIELDS,
      title: trimmed,
      assignee: person,
      dueDate: by,
      planWeek: true,
    })
    setTitle('')
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Plan next week">
      <h3 className="px-1 text-base font-semibold">
        Nothing left from last week
      </h3>
      <Plates day={today} />
      <p className="mt-2 px-1 text-sm text-muted-foreground">
        What else should be done by {formatDay(by)}?
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a to-do for the week"
          aria-label="Add a to-do for the week"
          className="h-11 text-base lg:h-10 lg:text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon-xl"
          aria-label="Add"
          disabled={!title.trim()}
          className="lg:size-10"
        >
          <PlusIcon />
        </Button>
      </form>
    </section>
  )
}
