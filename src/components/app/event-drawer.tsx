// An event from one of the person's other Google calendars, opened over the
// views as a to-do is: a sheet from the bottom on a phone, a pane beside the
// grid on a laptop, so the grid stays usable and another event swaps this
// one. Which event is open lives in the URL (`?event=<calendar> <event>`),
// so Back closes it. Changes save as they are made, as a to-do's do, and go
// to Google straight away; a repeating event first asks which of its days a
// change is for. A calendar shared with the person to view, an event someone
// else invited them to, and one Google keeps (a birthday) only show.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useLocation,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  LockIcon,
  MapPinIcon,
  RepeatIcon,
  SunIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerKeyboard,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  NO_TITLE,
  lastDay,
  parseEventKey,
  settlePick,
  unsavedOnLeave,
  whenRuns,
} from '@/lib/calendar-events'
import {
  addDays,
  addMinutes,
  diffDays,
  formatDay,
  formatTime,
} from '@/lib/dates'
import {
  calendarEventQ,
  calendarsQ,
  useChangeEvent,
  useDeleteEvent,
  useMoveEvent,
} from '@/lib/queries'
import { useIsDesktop } from './picker'
import { Row, Rows } from './rows'
import type { LucideIcon } from 'lucide-react'
import type {
  CalendarEventView,
  EventChange,
  EventDetail,
  EventWhen,
  SeriesScope,
  ShownCalendar,
} from '@/lib/calendar-events'
import type { LocalDate, LocalTime } from '@/lib/dates'

/** The key in the URL, whether or not such an event exists. */
export function useOpenEventKey(): string | undefined {
  return useRouterState({ select: (state) => state.location.search.event })
}

/** The event as the views already have it, to show while it is read. */
function useListed(key: string | undefined): CalendarEventView | undefined {
  const client = useQueryClient()
  if (!key) return undefined
  for (const [, list] of client.getQueriesData<Array<CalendarEventView>>({
    queryKey: ['calendar-events'],
  })) {
    const found = list?.find((event) => event.key === key)
    if (found) return found
  }
  return undefined
}

export function EventDrawer() {
  const router = useRouter()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const key = useOpenEventKey()
  const ref = key ? parseEventKey(key) : null
  const listed = useListed(key)
  const { data: detail, isError } = useQuery({
    ...calendarEventQ(ref?.calendarId ?? '', ref?.eventId ?? ''),
    enabled: ref !== null,
  })
  const event: EventDetail | CalendarEventView | undefined = detail ?? listed

  // Keep drawing the last event while the drawer slides away.
  const [last, setLast] = useState(event)
  if (event && event !== last) setLast(event)
  const shown = event ?? (key ? undefined : last)

  const close = () => {
    // As the to-do drawer does: Back when it was opened by a click here,
    // otherwise drop it from the address.
    if (router.history.location.state.openedInPlace) router.history.back()
    else {
      void navigate({
        to: '.',
        search: (now) => ({ ...now, event: undefined }),
        replace: true,
      })
    }
  }
  // A day of a series that was split, or an event that moved, has a new
  // key: the panel follows it there.
  const follow = (from: string, to: string) => {
    if (router.state.location.search.event !== from) return
    void navigate({
      to: '.',
      search: (now) => ({ ...now, event: to }),
      replace: true,
      state: (now) => now,
    })
  }

  // A link to an event that is gone, or no event at all, says so once.
  const told = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!key || told.current === key) return
    if (ref && detail !== null && !isError) return
    told.current = key
    toast(
      isError
        ? 'Could not open that event. Google Calendar did not answer.'
        : 'That event is gone. It was deleted or moved in Google Calendar.',
    )
    close()
  })

  return (
    <Drawer
      open={Boolean(key && shown)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      swipeDirection={desktop ? 'right' : 'down'}
      modal={!desktop}
      disablePointerDismissal={desktop}
      showSwipeHandle={!desktop}
    >
      <DrawerKeyboard>
        <DrawerContent className="mx-auto max-w-md data-[swipe-axis=x]:mx-0 data-[swipe-axis=x]:max-w-none data-[swipe-axis=x]:rounded-none data-[swipe-axis=x]:shadow-lg data-[swipe-axis=x]:sm:[--drawer-content-width:24rem] data-[swipe-direction=down]:bottom-(--drawer-keyboard-inset,0px)">
          <DrawerHeader className="flex-row items-center justify-between p-2 pb-0 lg:pt-3">
            <div className="sr-only">
              <DrawerTitle>{shown?.title ?? 'Event'}</DrawerTitle>
              <DrawerDescription>
                Read it, change it or delete it, in Google Calendar.
              </DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Close"
              className="ml-auto"
              onClick={close}
            >
              <XIcon />
            </Button>
          </DrawerHeader>
          {shown && (
            // A fresh panel per event, and per version of it Google sends,
            // so nothing typed carries over and nothing shown is stale.
            <EventPanel
              key={`${shown.key} ${'can' in shown ? 'read' : 'listed'}`}
              event={shown}
              onClose={close}
              onFollow={follow}
            />
          )}
        </DrawerContent>
      </DrawerKeyboard>
    </Drawer>
  )
}

const isDetail = (
  event: EventDetail | CalendarEventView,
): event is EventDetail => 'can' in event

/** "every Saturday" from "Every Saturday", to sit inside a sentence. */
const inSentence = (repeats: string) =>
  repeats === 'Repeats'
    ? 'repeats'
    : `repeats ${repeats[0].toLowerCase()}${repeats.slice(1)}`

type Asking =
  | { kind: 'change'; change: EventChange }
  | { kind: 'move'; to: ShownCalendar }
  | { kind: 'delete' }
  | null

function EventPanel({
  event,
  onClose,
  onFollow,
}: {
  event: EventDetail | CalendarEventView
  onClose: () => void
  onFollow: (from: string, to: string) => void
}) {
  const detail = isDetail(event) ? event : null
  const canEdit = detail?.can === 'edit'
  const change = useChangeEvent(onFollow)
  const move = useMoveEvent(onFollow)
  const remove = useDeleteEvent()
  const { data: calendars } = useQuery({ ...calendarsQ, enabled: canEdit })
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<Asking>(null)
  const askingNow = useRef(asking)
  useEffect(() => {
    askingNow.current = asking
  })
  useEffect(
    () => () => {
      const said = unsavedOnLeave(askingNow.current)
      if (said) toast(said, { id: said })
    },
    [],
  )
  const [scope, setScope] = useState<SeriesScope>('this')
  // Fields put back after a change was called off.
  const [reset, setReset] = useState(0)
  const repeating = event.seriesId !== null

  const save = (next: EventChange) => {
    if (next.when && !whenRuns(next.when)) {
      setError('It ends before it starts. Pick a later end.')
      setReset((n) => n + 1)
      return
    }
    setError(null)
    if (repeating) {
      setScope('this')
      setAsking({ kind: 'change', change: next })
    } else change.mutate({ event, scope: 'this', change: next })
  }
  const when: EventWhen = {
    allDay: event.allDay,
    startDate: event.startDate,
    startTime: event.startTime,
    endDate: event.endDate,
    endTime: event.endTime,
  }
  const setWhen = (next: Partial<EventWhen>) =>
    save({ when: { ...when, ...next } })

  const allDayTo = (allDay: boolean) => {
    const final = lastDay(event)
    setWhen(
      allDay
        ? { allDay, endDate: addDays(final, 1), startTime: null, endTime: null }
        : {
            allDay,
            endDate: final,
            startTime: '09:00',
            endTime: event.startDate === final ? '10:00' : '17:00',
          },
    )
  }
  // Moving the start keeps the length, as Google Calendar does.
  const startTo = (date: LocalDate, time: LocalTime | null) => {
    if (event.allDay || !event.startTime || !event.endTime || !time) {
      const shift = diffDays(date, event.startDate)
      setWhen({ startDate: date, endDate: addDays(event.endDate, shift) })
      return
    }
    const length =
      diffDays(event.endDate, event.startDate) * 1440 +
      minutesOf(event.endTime) -
      minutesOf(event.startTime)
    const [endDate, endTime] = addMinutes(`${date}T${time}`, length).split('T')
    setWhen({ startDate: date, startTime: time, endDate, endTime })
  }

  const confirm = () => {
    if (!asking) return
    if (asking.kind === 'change') {
      change.mutate({ event, scope, change: asking.change })
    } else if (asking.kind === 'move') {
      move.mutate({ event, to: asking.to })
    } else {
      remove.mutate({ event, scope })
      onClose()
    }
    setAsking(null)
  }
  const callOff = () => {
    setAsking(null)
    setReset((n) => n + 1)
  }

  const final = lastDay(event)
  const writable = (calendars ?? []).filter((one) => one.writable)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-5 *:shrink-0">
        <div className="flex flex-col gap-1.5">
          <Textarea
            key={`${event.title} ${reset}`}
            defaultValue={event.title === NO_TITLE ? '' : event.title}
            placeholder={NO_TITLE}
            aria-label="Title"
            rows={1}
            maxLength={1024}
            enterKeyHint="done"
            readOnly={!canEdit}
            className="min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-2xl leading-tight font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
            onKeyDown={(keyed) => {
              if (keyed.key === 'Enter') {
                keyed.preventDefault()
                keyed.currentTarget.blur()
              }
            }}
            onBlur={(blurred) => {
              const title = blurred.target.value.replace(/\s+/g, ' ').trim()
              const was = event.title === NO_TITLE ? '' : event.title
              if (canEdit && title !== was) save({ title })
            }}
          />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: event.color }}
              />
              {event.calendar}
            </span>
            {repeating && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden>·</span>
                <RepeatIcon className="size-3.5" />
                {detail?.repeats ?? 'Repeats'}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Rows role="group" aria-label="When">
            <FieldRow icon={SunIcon} label="All day" htmlFor="event-all-day">
              <Switch
                id="event-all-day"
                checked={event.allDay}
                disabled={!canEdit}
                onCheckedChange={allDayTo}
              />
            </FieldRow>
            <FieldRow icon={ClockIcon} label="Starts" bad={error !== null}>
              <DateTime
                key={`start ${reset}`}
                date={event.startDate}
                time={event.allDay ? null : event.startTime}
                disabled={!canEdit}
                repeating={repeating}
                label="Start"
                onDate={(date) => startTo(date, event.startTime)}
                onTime={(time) => startTo(event.startDate, time)}
              />
            </FieldRow>
            <FieldRow icon={ArrowRightIcon} label="Ends" bad={error !== null}>
              <DateTime
                key={`end ${reset}`}
                // An all-day event's last day, where Google keeps the next.
                date={event.allDay ? final : event.endDate}
                time={event.allDay ? null : event.endTime}
                disabled={!canEdit}
                repeating={repeating}
                label="End"
                onDate={(date) =>
                  setWhen({ endDate: event.allDay ? addDays(date, 1) : date })
                }
                onTime={(time) => setWhen({ endTime: time })}
              />
            </FieldRow>
          </Rows>
          {error && (
            <p role="alert" className="px-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <Rows role="group" aria-label="Where">
          <FieldRow icon={CalendarIcon} label="Calendar">
            {canEdit && writable.length > 1 ? (
              <Select
                key={`calendar ${reset}`}
                value={event.calendarId}
                items={writable.map((one) => ({
                  value: one.id,
                  label: one.name,
                }))}
                onValueChange={(id) => {
                  const to = writable.find((one) => one.id === id)
                  if (!to || to.id === event.calendarId) return
                  if (repeating) setAsking({ kind: 'move', to })
                  else move.mutate({ event, to })
                }}
              >
                <SelectTrigger
                  aria-label="Calendar"
                  className="-mr-1.5 h-8 max-w-48 border-0 bg-transparent px-1.5 text-base font-medium shadow-none md:text-sm hover:bg-muted dark:bg-transparent dark:hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: event.color }}
                  />
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent align="end" alignItemWithTrigger={false}>
                  {writable.map((one) => (
                    <SelectItem key={one.id} value={one.id}>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-[2px]"
                          style={{ background: one.color }}
                        />
                        {one.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: event.color }}
                />
                <span className="truncate">{event.calendar}</span>
              </span>
            )}
          </FieldRow>
          <FieldRow icon={MapPinIcon} label="Place" htmlFor="event-place">
            {detail ? (
              <input
                id="event-place"
                key={`${detail.place} ${reset}`}
                defaultValue={detail.place}
                placeholder={canEdit ? 'Add a place' : 'None'}
                readOnly={!canEdit}
                enterKeyHint="done"
                maxLength={1024}
                className="-mr-1.5 h-8 w-full min-w-0 rounded-md bg-transparent px-1.5 text-right text-base outline-none placeholder:text-muted-foreground read-only:pointer-events-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [&:not(:read-only)]:hover:bg-muted"
                onKeyDown={(keyed) => {
                  if (keyed.key === 'Enter') keyed.currentTarget.blur()
                }}
                onBlur={(blurred) => {
                  const place = blurred.target.value.trim()
                  if (canEdit && place !== detail.place) save({ place })
                }}
              />
            ) : (
              <Skeleton className="h-4 w-32" />
            )}
          </FieldRow>
        </Rows>

        <Field>
          <FieldLabel
            htmlFor="event-notes"
            className="px-1 font-normal text-muted-foreground"
          >
            Notes
          </FieldLabel>
          {detail ? (
            <Textarea
              id="event-notes"
              key={`${detail.notes} ${reset}`}
              defaultValue={detail.notes}
              placeholder={canEdit ? 'Add a description' : 'No description'}
              readOnly={!canEdit}
              className={cn(
                'min-h-20 text-base md:text-base',
                !canEdit && 'border-dashed focus-visible:ring-0',
              )}
              onBlur={(blurred) => {
                const notes = blurred.target.value
                if (canEdit && notes !== detail.notes) save({ notes })
              }}
            />
          ) : (
            <Skeleton className="h-20 w-full rounded-lg" />
          )}
        </Field>

        {detail && detail.can !== 'edit' && <Why detail={detail} />}
      </div>

      <div className="flex shrink-0 gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {event.link && (
          <Button
            size="xl"
            variant="outline"
            className="flex-1"
            nativeButton={false}
            render={<a href={event.link} target="_blank" rel="noreferrer" />}
          >
            <ArrowUpRightIcon data-icon="inline-start" />
            Open in Google Calendar
          </Button>
        )}
        {canEdit && (
          <Button
            size="icon-xl"
            variant="destructive"
            aria-label="Delete this event"
            onClick={() => {
              setScope('this')
              setAsking({ kind: 'delete' })
            }}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      <AlertDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) callOff()
        }}
      >
        {asking && (
          <Ask
            asking={asking}
            event={event}
            repeats={detail?.repeats ?? null}
            scope={scope}
            onScope={setScope}
            onConfirm={confirm}
          />
        )}
      </AlertDialog>
    </>
  )
}

const minutesOf = (time: LocalTime) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** A row with an icon and a label on the left, and its value on the right. */
function FieldRow({
  icon: Icon,
  label,
  htmlFor,
  bad = false,
  children,
}: {
  icon: LucideIcon
  label: string
  htmlFor?: string
  bad?: boolean
  children: React.ReactNode
}) {
  return (
    <Row role={undefined} className="min-h-13 gap-3 py-2">
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="flex-none">
        <ItemTitle className="font-normal whitespace-nowrap text-muted-foreground">
          {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        </ItemTitle>
      </ItemContent>
      <ItemActions
        className={cn(
          'min-w-0 flex-1 justify-end gap-0.5 text-base font-medium md:text-sm',
          bad && 'text-destructive',
        )}
      >
        {children}
      </ItemActions>
    </Row>
  )
}

/**
 * A day and, for a timed event, a time: friendly words over the phone's or
 * the browser's own picker, which opens on a tap.
 */
function DateTime({
  date,
  time,
  disabled,
  repeating,
  label,
  onDate,
  onTime,
}: {
  date: LocalDate
  time: LocalTime | null
  disabled: boolean
  repeating: boolean
  label: string
  onDate: (date: LocalDate) => void
  onTime: (time: LocalTime) => void
}) {
  return (
    <span className="flex flex-wrap items-center justify-end">
      <Native
        type="date"
        value={date}
        format={formatDay}
        disabled={disabled}
        repeating={repeating}
        label={`${label} day`}
        onPick={onDate}
      />
      {time && (
        <Native
          type="time"
          value={time}
          format={formatTime}
          disabled={disabled}
          repeating={repeating}
          label={`${label} time`}
          onPick={onTime}
        />
      )}
    </span>
  )
}

/**
 * One native picker. What is picked shows at once, and is kept once it
 * settles: when typing or picking stops for a moment, when the picker is
 * left or Enter is pressed, or when the panel closes.
 */
function Native({
  type,
  value,
  format,
  disabled,
  repeating,
  label,
  onPick,
}: {
  type: 'date' | 'time'
  value: string
  format: (value: string) => string
  disabled: boolean
  repeating: boolean
  label: string
  onPick: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(value)
  if (saved !== value) {
    setSaved(value)
    setDraft(null)
  }
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const commit = (leaving = false) => {
    clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    const settled = settlePick(next, value, { leaving, repeating })
    if (settled && 'keep' in settled) onPick(settled.keep)
    else if (settled) toast(settled.dropped, { id: settled.dropped })
    else if (next !== null) setDraft(null)
  }
  const flush = useRef(commit)
  useEffect(() => {
    flush.current = commit
  })
  useEffect(() => () => flush.current(true), [])
  return (
    <span
      className={cn(
        'relative inline-flex h-8 items-center rounded-md px-1.5 whitespace-nowrap focus-within:ring-3 focus-within:ring-ring/50',
        !disabled && 'hover:bg-muted',
      )}
    >
      {format(draft || value)}
      <input
        type={type}
        aria-label={label}
        value={draft ?? value}
        disabled={disabled}
        required
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        onClick={(clicked) => {
          try {
            clicked.currentTarget.showPicker()
          } catch {
            // Already open, or a browser that opens it on its own.
          }
        }}
        onChange={(changed) => {
          pending.current = changed.target.value
          setDraft(changed.target.value)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => flush.current(), 800)
        }}
        onBlur={() => commit()}
        onKeyDown={(pressed) => {
          if (pressed.key === 'Enter') commit()
        }}
      />
    </span>
  )
}

/** Why the panel only shows the event, and what would let it change. */
function Why({ detail }: { detail: EventDetail }) {
  const location = useLocation()
  if (detail.can === 'allow') {
    const back = `${location.pathname}${location.searchStr}`
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
        <p className="flex gap-2.5">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            To change or delete events here, let todos edit your Google
            calendars. Google asks you once.
          </span>
        </p>
        <Button
          variant="outline"
          size="lg"
          className="self-start bg-background"
          nativeButton={false}
          render={
            <a
              href={`/api/calendar/connect?read&back=${encodeURIComponent(back)}`}
            />
          }
        >
          Allow editing
        </Button>
      </div>
    )
  }
  return (
    <p className="flex gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <LockIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        {detail.why === 'calendar' ? (
          <>
            <b className="font-medium text-foreground">{detail.calendar}</b> is
            shared with you to view only, so this event can't be changed or
            deleted here.
          </>
        ) : detail.why === 'invited' ? (
          'You were invited to this event, so only the person who made it can change it.'
        ) : (
          "Google Calendar keeps this event itself, so it can't be changed here."
        )}
      </span>
    </p>
  )
}

const SCOPES: Array<[SeriesScope, string]> = [
  ['this', 'This event'],
  ['following', 'This and following events'],
  ['all', 'All events'],
]

/** The question before a change to a series, a move, or a delete. */
function Ask({
  asking,
  event,
  repeats,
  scope,
  onScope,
  onConfirm,
}: {
  asking: NonNullable<Asking>
  event: CalendarEventView
  repeats: string | null
  scope: SeriesScope
  onScope: (scope: SeriesScope) => void
  onConfirm: () => void
}) {
  const repeating = event.seriesId !== null
  const says = repeats ? inSentence(repeats) : 'repeats'
  const name = `“${event.title}”`
  const deleting = asking.kind === 'delete'
  const choose = repeating && asking.kind !== 'move'
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {asking.kind === 'move'
            ? 'Move a repeating event'
            : deleting
              ? repeating
                ? 'Delete a repeating event'
                : `Delete ${name}?`
              : 'Change a repeating event'}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {asking.kind === 'move'
            ? `${name} ${says}. Every day of it moves to ${asking.to.name}.`
            : deleting
              ? repeating
                ? `${name} ${says}. It goes from the ${event.calendar} calendar in Google, for everyone who sees it.`
                : `It goes from the ${event.calendar} calendar in Google, for everyone who sees that calendar.`
              : `${name} ${says}. Which should change?`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {choose && (
        <div
          role="radiogroup"
          aria-label="Which events"
          className="-mx-1 grid gap-1"
        >
          {SCOPES.map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.9375rem] hover:bg-muted"
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => onScope(value)}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>{deleting ? 'Keep it' : 'Cancel'}</AlertDialogCancel>
        <AlertDialogAction
          variant={deleting ? 'destructive' : 'default'}
          onClick={onConfirm}
        >
          {deleting ? 'Delete' : asking.kind === 'move' ? 'Move' : 'Save'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
