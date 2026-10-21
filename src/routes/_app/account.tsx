import { useEffect, useState } from 'react'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  BellIcon,
  CalendarRangeIcon,
  CheckIcon,
  SmartphoneIcon,
  SunMoonIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CalendarChoices,
  READ_CALENDARS,
} from '@/components/app/calendar-events'
import { CalendarRow } from '@/components/app/calendar-row'
import { Row, Rows } from '@/components/app/rows'
import { Column, ScreenHeader } from '@/components/app/shell'
import { TagsManager } from '@/components/app/tags-manager'
import { PersonAvatar, SectionHeading } from '@/components/app/todo-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { useSignOut } from '@/lib/auth-client'
import { calendarQ, useBoard } from '@/lib/queries'
import { THEMES, parseTheme, setTheme, useTheme } from '@/lib/theme'
import { sendTestAlert } from '@/server/board'

export const Route = createFileRoute('/_app/account')({
  head: () => ({ meta: [{ title: 'Account - todos' }] }),
  // How connecting Google Calendar went, on the way back from Google.
  validateSearch: z.object({ calendar: z.string().optional() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(calendarQ),
  component: AccountScreen,
})

// Who is signed in on this device, the things worth setting up on a new
// phone, the theme, the household's tags, their Google Calendar and which of
// their other calendars the views show, and the way out.
function AccountScreen() {
  const board = useBoard()
  const { data: calendar } = useSuspenseQuery(calendarQ)
  const linked = calendar.available && calendar.connected && !calendar.problem
  const me = board.people.find((person) => person.id === board.me)

  // Said once, then taken out of the address so a reload does not repeat it.
  const { calendar: outcome } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  useEffect(() => {
    if (!outcome) return
    announce(outcome)
    void navigate({
      search: (search) => ({ ...search, calendar: undefined }),
      replace: true,
    })
  }, [outcome, navigate])

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
          <ThemeRow />
        </Rows>
      </section>

      <section id="tags" className="flex scroll-mt-20 flex-col gap-2.5">
        <SectionHeading>Tags</SectionHeading>
        <TagsManager />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Calendar</SectionHeading>
        <Rows>
          <CalendarRow />
          {linked && (
            <Row>
              <ItemMedia variant="icon">
                <CalendarRangeIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Your other calendars</ItemTitle>
                <ItemDescription>
                  {calendar.reads
                    ? 'Choose which show in Day, Week and Month, for you only'
                    : 'See and change their events in Day, Week and Month'}
                </ItemDescription>
              </ItemContent>
              {!calendar.reads && (
                <ItemActions>
                  <Button
                    variant="outline"
                    size="lg"
                    nativeButton={false}
                    render={<a href={READ_CALENDARS} />}
                  >
                    Show
                  </Button>
                </ItemActions>
              )}
            </Row>
          )}
        </Rows>
      </section>

      {linked && calendar.reads && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>Shown in Day, Week and Month</SectionHeading>
          <CalendarChoices />
        </section>
      )}
    </Column>
  )
}

/** Light, dark, or as the device is; remembered on this device only. */
function ThemeRow() {
  const theme = useTheme()
  return (
    <Row>
      <ItemMedia variant="icon">
        <SunMoonIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Theme</ItemTitle>
        <ItemDescription>On this device</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Tabs
          value={theme}
          onValueChange={(value: string) => setTheme(parseTheme(value))}
        >
          <TabsList>
            {THEMES.map((option) => (
              <TabsTrigger key={option} value={option} className="px-2.5">
                {option[0].toUpperCase() + option.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </ItemActions>
    </Row>
  )
}

// One toast however many times the page asks: React runs effects twice in dev.
const ONCE = { id: 'calendar-outcome' }

/** What the trip to Google came back with, said once. */
function announce(outcome: string | undefined): void {
  switch (outcome) {
    case 'connected':
      toast.success(
        'Google Calendar connected. Your to-dos are on their way.',
        ONCE,
      )
      break
    case 'denied':
      toast.warning(
        'Google Calendar was not connected: access was not given.',
        ONCE,
      )
      break
    case 'failed':
      toast.error('Could not connect Google Calendar. Try again.', ONCE)
      break
    case 'unavailable':
      toast.error('Google Calendar is not set up on this server yet.', ONCE)
      break
    case 'reading':
      toast.success(
        'Your calendars are ready. Choose which to show below.',
        ONCE,
      )
      break
    case 'reading-denied':
      toast.warning(
        'Your other calendars were not shown: access was not given. The Todos calendar carries on.',
        ONCE,
      )
      break
  }
}
