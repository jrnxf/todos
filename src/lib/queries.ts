// The board query and every change to it. Two phones stay in step by
// refetching, not by sockets: on focus, and every 15 seconds while open.
// Changes are applied to the cached board at once and rolled back if the
// server never hears them, so a tick feels instant and a lost connection is
// said out loud instead of silently dropped.
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  addTag,
  addItem,
  deleteTag,
  getBoard,
  setDeleted,
  setDone,
  updateTag,
  updateItem,
} from '@/server/board'
import {
  deleteCalendarEvent,
  getCalendar,
  getCalendarEvent,
  getCalendarEvents,
  getCalendars,
  moveCalendarEvent,
  setCalendarShown,
  updateCalendarEvent,
} from '@/server/calendar'
import type { Tag, TagColor, Todo } from '@/db/schema'
import type { Board, ItemFields } from '@/server/board'
import { NO_TITLE } from './calendar-events'
import type {
  CalendarEventView,
  EventChange,
  EventDetail,
  SeriesScope,
  ShownCalendar,
} from './calendar-events'
import type { LocalDate } from './dates'

export const boardQ = queryOptions({
  queryKey: ['board'],
  queryFn: () => getBoard(),
  refetchInterval: 15_000,
  refetchOnWindowFocus: true,
  staleTime: 5_000,
})

/** The person's Google Calendar connection, for the account page. */
export const calendarQ = queryOptions({
  queryKey: ['calendar'],
  queryFn: () => getCalendar(),
  // Asked often while the first pass after connecting runs, so "Filling"
  // turns into "synced" on its own.
  refetchInterval: (query) => {
    const status = query.state.data
    return status?.connected && !status.problem && !status.lastSyncedAt
      ? 3_000
      : 60_000
  },
  refetchOnWindowFocus: true,
})

/** The person's other Google calendars, for choosing which the views show. */
export const calendarsQ = queryOptions({
  queryKey: ['calendars'],
  queryFn: () => getCalendars(),
  staleTime: 60_000,
})

/**
 * The shown calendars' events over the days on screen. Asked of Google when
 * a screen needs them, kept a couple of minutes, and asked again on focus:
 * nothing of them is stored on the server.
 */
export const calendarEventsQ = (from: LocalDate, to: LocalDate) =>
  queryOptions({
    queryKey: ['calendar-events', from, to],
    queryFn: () => getCalendarEvents({ data: { from, to } }),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

/**
 * One event in full, for its panel: asked of Google when it opens, and
 * again on focus, so it is never far behind Google Calendar.
 */
export const calendarEventQ = (calendarId: string, eventId: string) =>
  queryOptions({
    queryKey: ['calendar-event', calendarId, eventId],
    queryFn: () => getCalendarEvent({ data: { calendarId, eventId } }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

/** An event as it will be once a change lands. */
function changed<T extends CalendarEventView>(
  event: T,
  change: EventChange,
): T {
  return {
    ...event,
    ...(change.title !== undefined
      ? { title: change.title.trim() || NO_TITLE }
      : {}),
    ...(change.notes !== undefined ? { notes: change.notes } : {}),
    ...(change.place !== undefined ? { place: change.place } : {}),
    ...change.when,
  }
}

/**
 * Applies a change to every cached view of the events at once, and puts
 * them back if Google does not take it. `pick` says which events it is for:
 * the one, or the days of its series the change covers.
 */
function useEventChange<TVars, TResult>({
  send,
  pick,
  apply,
  failed,
  done,
}: {
  send: (vars: TVars) => Promise<TResult>
  pick: (vars: TVars) => (event: CalendarEventView) => boolean
  apply: (vars: TVars, event: CalendarEventView) => CalendarEventView | null
  failed: string
  done?: (result: TResult, vars: TVars) => void
}) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: TVars) => {
      await client.cancelQueries({ queryKey: ['calendar-events'] })
      await client.cancelQueries({ queryKey: ['calendar-event'] })
      const lists = client.getQueriesData<Array<CalendarEventView>>({
        queryKey: ['calendar-events'],
      })
      const details = client.getQueriesData<EventDetail | null>({
        queryKey: ['calendar-event'],
      })
      const matches = pick(vars)
      for (const [key, list] of lists) {
        if (!list) continue
        client.setQueryData(
          key,
          list.flatMap((event) => {
            if (!matches(event)) return [event]
            const next = apply(vars, event)
            return next ? [next] : []
          }),
        )
      }
      for (const [key, detail] of details) {
        if (detail && matches(detail)) {
          const next = apply(vars, detail)
          if (next) client.setQueryData(key, next)
        }
      }
      return { lists, details }
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of [
        ...(context?.lists ?? []),
        ...(context?.details ?? []),
      ]) {
        client.setQueryData(key, data)
      }
      toast.error(failed)
    },
    onSuccess: (result, vars) => done?.(result, vars),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['calendar-events'] }),
        client.invalidateQueries({ queryKey: ['calendar-event'] }),
      ]),
  })
}

/** Whether `event` is among the days of `of`'s series that `scope` covers. */
function inScope(of: CalendarEventView, scope: SeriesScope) {
  return (event: CalendarEventView) =>
    event.key === of.key ||
    (scope !== 'this' &&
      of.seriesId !== null &&
      event.seriesId === of.seriesId &&
      (scope === 'all' || event.startDate >= of.startDate))
}

const NOT_SAVED = 'Not saved. Google Calendar did not take the change.'

/**
 * Changes an event, or the days of its series `scope` says. A change of
 * when only moves the one shown at once; the series' other days follow
 * when Google answers. `onKey` hears of the day's new key, when it has one.
 */
export function useChangeEvent(onKey: (from: string, to: string) => void) {
  return useEventChange({
    send: (vars: {
      event: CalendarEventView
      scope: SeriesScope
      change: EventChange
    }) =>
      updateCalendarEvent({
        data: {
          calendarId: vars.event.calendarId,
          eventId: vars.event.eventId,
          scope: vars.scope,
          change: vars.change,
        },
      }),
    pick: ({ event, scope }) => inScope(event, scope),
    apply: ({ event, change }, one) =>
      changed(
        one,
        one.key === event.key ? change : { ...change, when: undefined },
      ),
    failed: NOT_SAVED,
    done: (result, { event }) => {
      toast(`Saved in ${event.calendar}.`)
      if (result.key !== event.key) onKey(event.key, result.key)
    },
  })
}

/** Moves an event, a repeating one as a whole series, to another calendar. */
export function useMoveEvent(onKey: (from: string, to: string) => void) {
  return useEventChange({
    send: (vars: { event: CalendarEventView; to: ShownCalendar }) =>
      moveCalendarEvent({
        data: {
          calendarId: vars.event.calendarId,
          eventId: vars.event.eventId,
          to: vars.to.id,
        },
      }),
    pick: ({ event }) => inScope(event, 'all'),
    apply: ({ to }, one) => ({
      ...one,
      calendar: to.name,
      color: to.color,
    }),
    failed: 'Not moved. Google Calendar did not take the change.',
    done: (result, { event, to }) => {
      toast(`Moved to ${to.name}.`)
      if (result.key !== event.key) onKey(event.key, result.key)
    },
  })
}

/** Deletes an event, or the days of its series `scope` says. */
export function useDeleteEvent() {
  return useEventChange({
    send: (vars: { event: CalendarEventView; scope: SeriesScope }) =>
      deleteCalendarEvent({
        data: {
          calendarId: vars.event.calendarId,
          eventId: vars.event.eventId,
          scope: vars.scope,
        },
      }),
    pick: ({ event, scope }) => inScope(event, scope),
    apply: () => null,
    failed: 'Not deleted. Google Calendar did not take the change.',
    done: (_result, { event }) => toast(`Deleted from ${event.calendar}.`),
  })
}

/** Shows one of the person's calendars in the views, or stops showing it. */
export function useShowCalendar() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['show-calendar'],
    mutationFn: (vars: { id: string; shown: boolean }) =>
      setCalendarShown({ data: vars }),
    onMutate: async ({ id, shown }) => {
      await client.cancelQueries({ queryKey: calendarsQ.queryKey })
      const before = client.getQueryData(calendarsQ.queryKey)
      if (before) {
        client.setQueryData(
          calendarsQ.queryKey,
          before.map((calendar: ShownCalendar) =>
            calendar.id === id ? { ...calendar, shown } : calendar,
          ),
        )
      }
      return { before }
    },
    onError: (_error, _vars, context) => {
      if (context?.before) {
        client.setQueryData(calendarsQ.queryKey, context.before)
      }
      toast.error('Could not change which calendars are shown.')
    },
    onSettled: async () => {
      // Switches flicked in quick succession refetch once, after the last,
      // so an earlier answer cannot turn a later switch back off.
      if (client.isMutating({ mutationKey: ['show-calendar'] }) > 1) return
      await Promise.all([
        client.invalidateQueries({ queryKey: calendarsQ.queryKey }),
        client.invalidateQueries({ queryKey: calendarQ.queryKey }),
        client.invalidateQueries({ queryKey: ['calendar-events'] }),
      ])
    },
  })
}

export function useBoard(): Board {
  return useSuspenseQuery(boardQ).data
}

function useBoardChange<TVars>(
  send: (vars: TVars) => Promise<unknown>,
  apply: (board: Board, vars: TVars) => Board,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: TVars) => {
      await client.cancelQueries({ queryKey: boardQ.queryKey })
      const before = client.getQueryData(boardQ.queryKey)
      if (before) client.setQueryData(boardQ.queryKey, apply(before, vars))
      return { before }
    },
    onError: (_error, _vars, context) => {
      if (context?.before) {
        client.setQueryData(boardQ.queryKey, context.before)
      }
      toast.error('Not saved. This device cannot reach the list right now.')
    },
    onSettled: () => client.invalidateQueries({ queryKey: boardQ.queryKey }),
  })
}

function patchItem(board: Board, id: number, patch: Partial<Todo>): Board {
  return {
    ...board,
    items: board.items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }
}

export function useAddItem() {
  return useBoardChange(
    (fields: ItemFields) => addItem({ data: fields }),
    (board, fields) => ({
      ...board,
      items: [
        ...board.items,
        {
          ...fields,
          // A placeholder id until the refetch brings the real row.
          id: -Date.now(),
          doneAt: null,
          doneBy: null,
          createdAt: new Date().toISOString(),
          createdBy: board.me,
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  )
}

export function useUpdateItem() {
  return useBoardChange(
    (vars: { id: number; patch: Partial<ItemFields> }) =>
      updateItem({ data: vars }),
    (board, { id, patch }) => patchItem(board, id, patch),
  )
}

/** Tick or untick. Ticking offers an undo for a few seconds. */
export function useSetDone() {
  const change = useBoardChange(
    (vars: { id: number; done: boolean }) => setDone({ data: vars }),
    (board, { id, done }) =>
      patchItem(
        board,
        id,
        done
          ? { doneAt: new Date().toISOString(), doneBy: board.me }
          : { doneAt: null, doneBy: null },
      ),
  )
  return (item: Todo, done: boolean) => {
    change.mutate({ id: item.id, done })
    if (done) {
      toast(`Done: ${item.title}`, {
        action: {
          label: 'Undo',
          onClick: () => change.mutate({ id: item.id, done: false }),
        },
      })
    }
  }
}

/** Delete is soft; the toast brings the to-do back. */
export function useDelete() {
  const change = useBoardChange(
    (vars: { id: number; deleted: boolean }) => setDeleted({ data: vars }),
    (board, { id, deleted }) =>
      deleted
        ? { ...board, items: board.items.filter((item) => item.id !== id) }
        : board,
  )
  return (item: Todo) => {
    change.mutate({ id: item.id, deleted: true })
    toast(`Deleted: ${item.title}`, {
      action: {
        label: 'Undo',
        onClick: () => change.mutate({ id: item.id, deleted: false }),
      },
    })
  }
}

/** Resolves with the new tag, so the caller can put a to-do in it at once. */
export function useAddTag() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tag: { name: string; color: TagColor }) =>
      addTag({ data: tag }),
    onSuccess: (created: Tag) => {
      const board = client.getQueryData(boardQ.queryKey)
      if (board && !board.tags.some((tag) => tag.id === created.id)) {
        client.setQueryData(boardQ.queryKey, {
          ...board,
          tags: [...board.tags, created],
        })
      }
    },
    onError: () => toast.error('Could not make that tag.'),
    onSettled: () => client.invalidateQueries({ queryKey: boardQ.queryKey }),
  })
}

export function useUpdateTag() {
  return useBoardChange(
    (vars: { id: number; patch: { name?: string; color?: TagColor } }) =>
      updateTag({ data: vars }),
    (board, { id, patch }) => ({
      ...board,
      tags: board.tags.map((tag) =>
        tag.id === id ? { ...tag, ...patch } : tag,
      ),
    }),
  )
}

export function useDeleteTag() {
  return useBoardChange(
    (id: number) => deleteTag({ data: { id } }),
    (board, id) => ({
      ...board,
      tags: board.tags.filter((tag) => tag.id !== id),
      items: board.items.map((item) =>
        item.tagId === id ? { ...item, tagId: null } : item,
      ),
    }),
  )
}
