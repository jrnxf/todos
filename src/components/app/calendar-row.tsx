// The account page's Google Calendar row: connect, see that it is keeping
// up, or take it away. Each person connects their own; the to-dos in it are
// the whole household's.
import { useState } from 'react'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { CalendarSyncIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Row } from '@/components/app/rows'
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
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { calendarQ } from '@/lib/queries'
import { removeCalendar } from '@/server/calendar'
import type { CalendarStatus } from '@/calendar/run'

const CONNECT = '/api/calendar/connect'

export function CalendarRow() {
  const { data: status } = useSuspenseQuery(calendarQ)
  const [confirming, setConfirming] = useState(false)
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => removeCalendar(),
    onSuccess: () => toast.success('Google Calendar disconnected.'),
    onError: () => toast.error('Could not disconnect Google Calendar.'),
    onSettled: () => client.invalidateQueries({ queryKey: calendarQ.queryKey }),
  })

  return (
    <Row>
      <ItemMedia variant="icon">
        <CalendarSyncIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Google Calendar</ItemTitle>
        <ItemDescription
          className={status.problem ? 'text-destructive' : undefined}
        >
          {describe(status)}
        </ItemDescription>
      </ItemContent>
      {status.available && (
        <ItemActions>
          {(!status.connected || status.problem) && (
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<a href={CONNECT} />}
            >
              {status.problem ? 'Reconnect' : 'Connect'}
            </Button>
          )}
          {status.connected && (
            <Button
              variant="outline"
              size="lg"
              disabled={remove.isPending}
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </Button>
          )}
        </ItemActions>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              The Todos calendar is deleted from your Google account, and the
              app forgets its access to it and which event is which to-do. Your
              to-dos stay here, those you made in that calendar too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false)
                remove.mutate()
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Row>
  )
}

function describe(status: CalendarStatus): string {
  if (!status.available) return 'Not set up on this server yet'
  if (status.problem === 'revoked') {
    return 'Google stopped letting the app in'
  }
  if (status.problem === 'calendar_gone') {
    return 'The Todos calendar was deleted in Google'
  }
  if (!status.connected) {
    return 'See to-dos with a deadline in a Todos calendar'
  }
  if (!status.lastSyncedAt) return 'Connected. Filling your Todos calendar…'
  return `In your Todos calendar, synced ${ago(status.lastSyncedAt)}`
}

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}
