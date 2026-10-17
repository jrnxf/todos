import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { BellIcon, CheckIcon, SmartphoneIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Row, Rows } from '@/components/app/rows'
import { Column, ScreenHeader } from '@/components/app/shell'
import { PersonAvatar, SectionHeading } from '@/components/app/todo-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { useSignOut } from '@/lib/auth-client'
import { useBoard } from '@/lib/queries'
import { sendTestAlert } from '@/server/board'

export const Route = createFileRoute('/_app/account')({
  head: () => ({ meta: [{ title: 'Account - todos' }] }),
  component: AccountScreen,
})

// Who is signed in on this device, the two things worth setting up on a new
// phone, and the way out.
function AccountScreen() {
  const board = useBoard()
  const me = board.people.find((person) => person.id === board.me)

  // Only knowable in the browser, so it starts unknown.
  const [installed, setInstalled] = useState<boolean | null>(null)
  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    )
  }, [])

  const test = useMutation({
    mutationFn: () => sendTestAlert(),
    onSuccess: ({ channel }) =>
      channel === 'pushover'
        ? toast.success('Sent. It should arrive within a few seconds.')
        : toast.warning('Alerts are not connected yet, so nothing was sent.'),
    onError: () => toast.error('Could not send the test alert.'),
  })

  const signOut = useSignOut()

  return (
    <Column>
      <ScreenHeader title="Account" />

      <Rows>
        <Row>
          <ItemMedia>
            <PersonAvatar person={me} size="lg" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{me?.name}</ItemTitle>
            <ItemDescription>Signed in with Google</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="lg"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              Sign out
            </Button>
          </ItemActions>
        </Row>
      </Rows>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>This device</SectionHeading>
        <Rows>
          <Row>
            <ItemMedia variant="icon">
              <SmartphoneIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Home Screen icon</ItemTitle>
              <ItemDescription>
                {installed
                  ? 'Added from the Share menu'
                  : 'In Safari: Share, then Add to Home Screen'}
              </ItemDescription>
            </ItemContent>
            {installed !== null && (
              <ItemActions>
                {installed ? (
                  <Badge className="bg-success/10 text-success">
                    <CheckIcon data-icon="inline-start" />
                    Done
                  </Badge>
                ) : (
                  <Badge variant="outline">Not yet</Badge>
                )}
              </ItemActions>
            )}
          </Row>
          <Row>
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Alerts</ItemTitle>
              <ItemDescription>
                {board.channel === 'pushover'
                  ? 'Pushover linked. Turn on Critical Alerts in its app.'
                  : 'Pushover is not connected yet'}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="lg"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                Send test
              </Button>
            </ItemActions>
          </Row>
        </Rows>
      </section>
    </Column>
  )
}
