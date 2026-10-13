import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDownIcon, ListChecksIcon } from 'lucide-react'
import { z } from 'zod'
import { Column, ScreenHeader } from '@/components/app/shell'
import { Section, SectionHeading, TodoGroup } from '@/components/app/todo-row'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byDue, isOpen } from '@/lib/board'
import { useBoard } from '@/lib/queries'
import type { Area, Todo } from '@/db/schema'

export const Route = createFileRoute('/_app/list')({
  // With an area in the URL the list is that one area; the laptop sidebar
  // links here for each of them.
  validateSearch: z.object({ area: z.coerce.number().int().optional() }),
  component: ListScreen,
})

const ALL = 'all'
const EITHER = 'either'

// The whole plate, grouped by area, including the things with no date.
function ListScreen() {
  const board = useBoard()
  const search = Route.useSearch()
  const area = board.areas.find((one) => one.id === search.area)
  const [who, setWho] = useState(ALL)

  const inArea = (todo: Todo) => !area || todo.areaId === area.id
  const open = board.items.filter(isOpen).filter(inArea)
  const done = board.items
    .filter((todo) => !isOpen(todo))
    .filter(inArea)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const filters = [
    { value: ALL, label: 'All' },
    ...board.people.map((person) => ({ value: person.id, label: person.name })),
    { value: EITHER, label: 'Either' },
  ]

  return (
    <Column>
      <ScreenHeader
        title={area?.name ?? 'Everything'}
        subtitle={
          area ? `${open.length} open` : `${open.length} open, grouped by area`
        }
      />
      <Tabs value={who} onValueChange={setWho} className="gap-5">
        <TabsList className="w-full group-data-horizontal/tabs:h-10 lg:w-fit">
          {filters.map((filter) => (
            <TabsTrigger
              key={filter.value}
              value={filter.value}
              className="lg:px-4"
            >
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {filters.map((filter) => {
          const todos = open.filter(
            (todo) =>
              filter.value === ALL ||
              (filter.value === EITHER
                ? todo.assignee === null
                : todo.assignee === filter.value),
          )
          return (
            <TabsContent
              key={filter.value}
              value={filter.value}
              className="flex flex-col gap-5"
            >
              {todos.length === 0 ? (
                <Nothing />
              ) : area ? (
                <TodoGroup todos={[...todos].sort(byDue)} hideArea />
              ) : (
                <ByArea todos={todos} areas={board.areas} />
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {done.length > 0 && (
        <Collapsible className="flex flex-col gap-2.5">
          <CollapsibleTrigger className="group flex items-center justify-between rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <SectionHeading count={done.length}>Done this week</SectionHeading>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TodoGroup todos={done} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Column>
  )
}

function Nothing() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecksIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing here</EmptyTitle>
        <EmptyDescription>No open to-dos match this filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ByArea({ todos, areas }: { todos: Array<Todo>; areas: Array<Area> }) {
  const sorted = [...todos].sort(byDue)
  return (
    <>
      {areas.map((area) => (
        <Section
          key={area.id}
          title={area.name}
          todos={sorted.filter((todo) => todo.areaId === area.id)}
          hideArea
        />
      ))}
      <Section
        title="No area"
        todos={sorted.filter((todo) => todo.areaId === null)}
      />
    </>
  )
}
