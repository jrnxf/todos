// The alerts one day makes: what was sent and what is still to come. The
// home page shows them under today.
import { useQuery } from '@tanstack/react-query'
import { alertsInWindow } from '@/alerts/rules'
import { isOpen } from '@/lib/board'
import { addMinutes, toStamp } from '@/lib/dates'
import { useBoard } from '@/lib/queries'
import { getSentAlerts } from '@/server/board'
import type { PlannedAlert } from '@/alerts/rules'
import type { LocalDate } from '@/lib/dates'
import type { SentAlert } from '@/server/board'

const ALERT_NAME: Record<string, string> = {
  digest: 'Digest',
  headsup: 'Heads-up',
  nudge: 'Nudge',
  overdue: 'Still late',
}

/** "Heads-up: Dentist", or just "Digest". */
export function alertName(kind: string, title: string | null | undefined) {
  const name = ALERT_NAME[kind] ?? kind
  return kind === 'digest' || !title ? name : `${name}: ${title}`
}

/**
 * Every buzz one day makes for whoever holds the phone: what the scheduler
 * recorded as sent, and what the rules say is still to come. Nothing counts
 * as sent unless it was.
 */
export function useDayAlerts(day: LocalDate): {
  sent: Array<SentAlert>
  planned: Array<PlannedAlert & { todoTitle: string | undefined }>
} {
  const board = useBoard()
  const sent = useQuery({
    queryKey: ['sent-alerts', day, board.me],
    queryFn: () => getSentAlerts({ data: { date: day } }),
    staleTime: 30_000,
  })

  const open = board.items.filter(isOpen)
  const dayStart = addMinutes(toStamp(day, '00:00'), -1)
  const planned = alertsInWindow({
    items: open,
    people: board.people,
    from: dayStart > board.now ? dayStart : board.now,
    to: toStamp(day, '23:59'),
    config: board.alertConfig,
  })
    .filter((alert) => alert.person === board.me)
    .map((alert) => ({
      ...alert,
      todoTitle: open.find((todo) => todo.id === alert.itemId)?.title,
    }))

  return { sent: sent.data ?? [], planned }
}
