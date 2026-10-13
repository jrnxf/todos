import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { z } from 'zod'
import { cn } from 'cn'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AddBar, AddProvider } from '@/components/app/capture'
import { TabBar } from '@/components/app/shell'
import { TodoDrawer, useOpenTodoId } from '@/components/app/todo-drawer'
import { SidebarProvider } from '@/components/ui/sidebar'
import { boardQ } from '@/lib/queries'

export const Route = createFileRoute('/_app')({
  // The to-do that is open over the list is part of the URL, on every screen
  // under this layout.
  validateSearch: z.object({ item: z.coerce.number().int().optional() }),
  // Every screen under here reads the board, so it is fetched once, first.
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(boardQ)
  },
  component: AppLayout,
})

function AppLayout() {
  // On the calendar, Add starts from the day being looked at.
  const calendarDay = useRouterState({
    select: (state) =>
      state.location.pathname === '/calendar'
        ? state.location.search.day
        : undefined,
  })
  const preset = calendarDay ? { dueDate: calendarDay } : undefined
  const todoOpen = useOpenTodoId() !== undefined

  return (
    <AddProvider>
      {/* A phone gets one column with a tab bar. A laptop gets the sidebar,
          the list, and room on the right for the to-do that slides in. */}
      <SidebarProvider>
        <AppSidebar addPreset={preset} />
        <div
          className={cn(
            'mx-auto flex min-h-dvh w-full max-w-md min-w-0 flex-col lg:mx-0 lg:max-w-none lg:flex-1',
            // Make room as the drawer comes in, at the drawer's own pace.
            'lg:transition-[padding] lg:duration-450 lg:ease-[cubic-bezier(0.22,1,0.36,1)]',
            todoOpen && 'lg:pr-96',
          )}
        >
          <main className="flex flex-1 flex-col gap-5 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-44 lg:px-10 lg:pt-10 lg:pb-12">
            <Outlet />
          </main>
          <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
            <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
            <div className="px-4 pb-3">
              <AddBar preset={preset} />
            </div>
            <TabBar />
          </div>
        </div>
      </SidebarProvider>
      <TodoDrawer />
    </AddProvider>
  )
}
