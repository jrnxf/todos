import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Agenda,
  CalendarNav,
  CompactMonth,
  MonthGrid,
  monthLabel,
} from '@/components/app/calendar-views'
import { ScreenHeader } from '@/components/app/shell'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { monthStart } from '@/lib/board'
import { useBoard } from '@/lib/queries'

type CalendarView = 'month' | 'agenda'

export const Route = createFileRoute('/_app/calendar')({
  // The month being looked at lives in the URL (as any day in it), so Back
  // returns to it and Add can start from the picked day.
  validateSearch: z.object({
    view: z.enum(['month', 'agenda']).optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  component: CalendarScreen,
})

// A laptop gets a real month, every to-do written in its day, with an agenda
// one click away. A phone's squares are too small for titles, so it gets a
// small month with dots over the agenda.
function CalendarScreen() {
  const board = useBoard()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const view = search.view ?? 'month'
  const day = search.day ?? board.today

  const go = (next: { view?: CalendarView; day?: string }) =>
    navigate({ search: (now) => ({ ...now, ...next }), replace: true })

  return (
    <div className="flex flex-col gap-5 lg:mx-auto lg:w-full lg:max-w-5xl">
      <ScreenHeader title={monthLabel(day)} />
      <div className="flex items-center justify-between gap-2">
        <Tabs
          value={view}
          onValueChange={(picked: CalendarView) => go({ view: picked })}
          className="hidden lg:flex"
        >
          <TabsList>
            <TabsTrigger value="month" className="px-4">
              Month
            </TabsTrigger>
            <TabsTrigger value="agenda" className="px-4">
              Agenda
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <CalendarNav
          onStep={(direction) => go({ day: monthStart(day, direction) })}
          onToday={() => go({ day: undefined })}
        />
      </div>

      <div className="flex flex-col gap-5 lg:hidden">
        <CompactMonth day={day} onPickDay={(picked) => go({ day: picked })} />
        <Agenda day={day} />
      </div>
      <div className="hidden flex-col gap-5 lg:flex">
        {view === 'agenda' ? <Agenda day={day} /> : <MonthGrid day={day} />}
      </div>
    </div>
  )
}
