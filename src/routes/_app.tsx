import { Outlet, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AddBar, AddProvider } from '@/components/app/capture'
import { EventDrawer } from '@/components/app/event-drawer'
import { ShortcutsProvider } from '@/components/app/hotkeys'
import { TabBar, TopBar } from '@/components/app/shell'
import { TodoDrawer } from '@/components/app/todo-drawer'
import { boardQ, calendarQ } from '@/lib/queries'

export const Route = createFileRoute('/_app')({
  // The to-do, or the calendar event, that is open over the list is part of
  // the URL, on every screen under this layout.
  validateSearch: z.object({
    item: z.coerce.number().int().optional(),
    event: z.string().max(2100).optional(),
  }),
  // Every screen under here reads the board, so it is fetched once, first.
  // The calendar's state comes alongside: it decides what the header and
  // the day show, and asked for only once the page is up, it popped them in
  // afterwards. A calendar that cannot be read is never worth a failed page.
  beforeLoad: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(boardQ),
      context.queryClient.ensureQueryData(calendarQ).catch(() => undefined),
    ])
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <AddProvider>
      <ShortcutsProvider>
        {/* A phone gets one column with a tab bar. A laptop gets a bar across
          the top and the screen under it. The to-do or the event slides in
          over the screen's right edge, and the screen stays where it is:
          making room for it resized the home grid as the drawer moved, and
          the grid's own moves then chased the drawer's. */}
        <div className="flex min-h-dvh flex-col">
          <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col lg:max-w-none">
            <TopBar />
            <main className="flex flex-1 flex-col gap-5 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-44 lg:px-10 lg:pt-8 lg:pb-12">
              <Outlet />
            </main>
            <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
              <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
              <div className="px-4 pb-3">
                <AddBar />
              </div>
              <TabBar />
            </div>
          </div>
        </div>
        <TodoDrawer />
        <EventDrawer />
      </ShortcutsProvider>
    </AddProvider>
  )
}
