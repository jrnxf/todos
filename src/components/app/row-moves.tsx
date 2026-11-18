// Quick ways to move a to-do that did not get done: to the next planning
// day, or to another day. The laptop gets them in a menu at the end of the
// row; a phone gets them by swiping the row to the left.
import { useRef, useState } from 'react'
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

/** How far the row slides to show both targets, and where it snaps open. */
const TARGET = 88
const OPEN = TARGET * 2
const SNAP = 56
/** Movement before a touch counts as a sideways drag and not a scroll. */
const SLOP = 8

/**
 * The phone's swipe: drag the row left and two targets show under it, "Pick
 * day" and "Next Tue". A sideways drag here is the row's, not the list's, so
 * it does not also step to the next day. A drag to the right is left to the
 * list unless the row is open.
 */
export function SwipeToMove({
  moves,
  target,
  children,
}: {
  moves: Moves
  /** The next planning day: the swipe exists only with one. */
  target: LocalDate
  children: (row: {
    className: string
    style: React.CSSProperties
  }) => React.ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{
    x: number
    y: number
    from: number
    sideways: boolean | null
  } | null>(null)
  // A drag ends in a click on the link under the finger; that click must
  // not open the to-do.
  const swallowClick = useRef(false)
  const open = offset !== 0 && !dragging
  const close = () => setOffset(0)

  const left = Math.max(-OPEN, Math.min(0, offset))

  return (
    <div
      role="listitem"
      className="relative overflow-hidden"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') return
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          from: offset,
          sideways: null,
        }
      }}
      onPointerMove={(event) => {
        const now = drag.current
        if (!now) return
        const dx = event.clientX - now.x
        const dy = event.clientY - now.y
        if (now.sideways === null) {
          if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
          // Right from shut is the list's: it steps back a day.
          now.sideways =
            Math.abs(dx) > Math.abs(dy) * 1.5 && (dx < 0 || now.from !== 0)
          if (!now.sideways) {
            drag.current = null
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }
        setOffset(Math.max(-OPEN, Math.min(0, now.from + dx)))
      }}
      onPointerUp={(event) => {
        const now = drag.current
        drag.current = null
        if (!now?.sideways) return
        // The list's own swipe must not see this one.
        event.stopPropagation()
        swallowClick.current = true
        setDragging(false)
        setOffset((at) => (at < -SNAP ? -OPEN : 0))
      }}
      onPointerCancel={() => {
        drag.current = null
        setDragging(false)
        setOffset((at) => (at < -SNAP ? -OPEN : 0))
      }}
      onClickCapture={(event) => {
        if (swallowClick.current) {
          swallowClick.current = false
          event.preventDefault()
          event.stopPropagation()
          return
        }
        // A tap on an open row shuts it, and does nothing else.
        const onTarget = (event.target as Element).closest('[data-move]')
        if (open && !onTarget) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: OPEN }}
        // Out of the way of a screen reader: the laptop menu and the to-do's
        // own page offer the same moves.
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          data-move=""
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-muted text-xs font-medium text-foreground"
          onClick={() => {
            close()
            moves.pickDay()
          }}
        >
          <CalendarIcon className="size-4" />
          Pick day
        </button>
        <button
          type="button"
          data-move=""
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary text-xs font-medium text-primary-foreground"
          onClick={() => {
            close()
            moves.moveTo(target)
          }}
        >
          <CalendarArrowUpIcon className="size-4" />
          {`Next ${formatWeekday(target)}`}
          <span className="font-normal opacity-80">
            {formatMonthDay(target)}
          </span>
        </button>
      </div>
      {children({
        className: cn(
          'bg-card touch-pan-y',
          !dragging && 'transition-transform duration-200 ease-out',
        ),
        style: { transform: left ? `translateX(${left}px)` : undefined },
      })}
    </div>
  )
}
