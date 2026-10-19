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
  getCalendar,
  getCalendarEvents,
  getCalendars,
  setCalendarShown,
} from '@/server/calendar'
import type { Tag, TagColor, Todo } from '@/db/schema'
import type { Board, ItemFields } from '@/server/board'
import type { ShownCalendar } from './calendar-events'
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
