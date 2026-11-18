// Quick ways to move a to-do that did not get done: to the next planning
// day, or to another day. The laptop gets them in a menu at the end of the
// row; a phone moves it to the next planning day by swiping the row left.
import { useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { cn } from 'cn'
import {
  CalendarArrowUpIcon,
  CalendarIcon,
  MoreHorizontalIcon,
  SunriseIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  addDays,
  formatDay,
  formatLongWeekday,
  formatMonthDay,
  formatWeekday,
} from '@/lib/dates'
import { openInPlace } from '@/lib/in-place'
import { nextPlanDay } from '@/lib/plan-week'
import { useBoard, useMoveTo } from '@/lib/queries'
import type { Todo } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'

export interface Moves {
  /** The next planning day, or null when the household has none. */
  planDay: LocalDate | null
  today: LocalDate
  moveTo: (date: LocalDate) => void
  /** Opens the to-do to choose a day there. */
  pickDay: () => void
}

/** The laptop's menu. Hidden until the row is hovered or the menu is open. */
export function MovesMenu({ title, moves }: { title: string; moves: Moves }) {
  const tomorrow = addDays(moves.today, 1)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move "${title}"`}
            // Above the link that covers the row, and only on a laptop.
            className="relative z-10 -my-1 hidden opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 lg:inline-flex"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          {moves.planDay && moves.planDay !== tomorrow && (
            <MoveItem
              icon={CalendarArrowUpIcon}
              label={`Next ${formatLongWeekday(moves.planDay)}`}
              day={formatMonthDay(moves.planDay)}
              onClick={() => moves.moveTo(moves.planDay as LocalDate)}
            />
          )}
          <MoveItem
            icon={SunriseIcon}
            label="Tomorrow"
            day={formatDay(tomorrow)}
            onClick={() => moves.moveTo(tomorrow)}
          />
          <MoveItem
            icon={CalendarIcon}
            label="Pick a day…"
            onClick={moves.pickDay}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MoveItem({
  icon: Icon,
  label,
  day,
  onClick,
}: {
  icon: React.ComponentType
  label: string
  day?: string
  onClick: () => void
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <Icon />
      {label}
      {day && (
        <span className="ml-auto text-xs text-muted-foreground">{day}</span>
      )}
    </DropdownMenuItem>
  )
}

/** How far a drag goes before letting go moves the to-do. */
const COMMIT = 96
/** How far the row can be dragged at most. */
const MAX = 160
/** Movement before a touch counts as a sideways drag and not a scroll. */
const SLOP = 8

/**
 * The phone's swipe: drag a row to the left and "Next Tue" shows in the gap
 * it leaves. Let go past the mark and the to-do moves there; the toast undoes
 * it. A sideways drag here is the row's, not the list's, so it does not also
 * step to the next day. A drag to the right is left to the list.
 */
export function SwipeToMove({
  target,
  onMove,
  role,
  rounded = false,
  className,
  children,
}: {
  /** The next planning day: the swipe exists only with one. */
  target: LocalDate
  onMove: () => void
  role?: React.AriaRole
  /** Rounds the gap's corners, for a row that is not in a card. */
  rounded?: boolean
  className?: string
  children: (row: {
    className: string
    style: React.CSSProperties
  }) => React.ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; sideways: boolean | null }>(null)
  // A drag ends in a click on the link under the finger; that click must
  // not open the to-do.
  const swallowClick = useRef(false)
  const armed = offset <= -COMMIT
  const settle = (commit: boolean) => {
    drag.current = null
    setDragging(false)
    setOffset(0)
    if (commit) onMove()
  }

  return (
    <div
      role={role}
      // Sideways only: the row slides under its own edge, while a focus ring
      // or the gap's rounded ends may still reach above and below.
      className={cn('relative overflow-x-clip', className)}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') return
        drag.current = { x: event.clientX, y: event.clientY, sideways: null }
      }}
      onPointerMove={(event) => {
        const now = drag.current
        if (!now) return
        const dx = event.clientX - now.x
        const dy = event.clientY - now.y
        if (now.sideways === null) {
          if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
          now.sideways = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5
          if (!now.sideways) {
            drag.current = null
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }
        setOffset(Math.max(-MAX, Math.min(0, dx)))
      }}
      onPointerUp={(event) => {
        if (!drag.current?.sideways) {
          drag.current = null
          return
        }
        // The list's own swipe must not see this one.
        event.stopPropagation()
        swallowClick.current = true
        settle(armed)
      }}
      onPointerCancel={() => settle(false)}
      onClickCapture={(event) => {
        if (!swallowClick.current) return
        swallowClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {offset < 0 && (
        <div
          aria-hidden
          // The gap the row leaves as it moves over.
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 overflow-hidden px-3 text-xs font-medium whitespace-nowrap transition-colors duration-150',
            rounded && '-my-1 rounded-md',
            armed
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
          style={{ width: -offset }}
        >
          <CalendarArrowUpIcon className="size-4 shrink-0" />
          Next {formatWeekday(target)}
        </div>
      )}
      {children({
        className: cn(
          'touch-pan-y',
          !dragging && 'transition-transform duration-200 ease-out',
        ),
        style: { transform: offset ? `translateX(${offset}px)` : undefined },
      })}
    </div>
  )
}

/**
 * The moves for one to-do, from the board: where "next" lands, and what
 * moving and picking a day do.
 */
export function useMoves(todo: Todo): Moves {
  const { today, planDay } = useBoard()
  const moveTo = useMoveTo()
  const navigate = useNavigate()
  const anyOpen = useRouterState({
    select: ({ location: { search } }) =>
      search.item !== undefined || search.event !== undefined,
  })
  return {
    planDay: planDay === null ? null : nextPlanDay(today, planDay),
    today,
    moveTo: (date) => moveTo(todo, date),
    pickDay: () =>
      void navigate({
        to: '.',
        search: (now) => ({ ...now, item: todo.id, event: undefined }),
        state: openInPlace(anyOpen),
        replace: anyOpen,
      }),
  }
}
