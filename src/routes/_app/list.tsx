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
import type { Tag, Todo } from '@/db/schema'

export const Route = createFileRoute('/_app/list')({
  head: () => ({ meta: [{ title: 'List - todos' }] }),
  // With a tag in the URL the list is that one tag; the laptop sidebar
  // links here for each of them.
  validateSearch: z.object({ tag: z.coerce.number().int().optional() }),
  component: ListScreen,
})

const ALL = 'all'
const EITHER = 'either'

// The whole plate, grouped by tag, including the things with no date.
function ListScreen() {
  const board = useBoard()
  const search = Route.useSearch()
  const tag = board.tags.find((one) => one.id === search.tag)
  const [who, setWho] = useState(ALL)

  const inTag = (todo: Todo) => !tag || todo.tagId === tag.id
  const open = board.items.filter(isOpen).filter(inTag)
  const done = board.items
    .filter((todo) => !isOpen(todo))
    .filter(inTag)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const filters = [
    { value: ALL, label: 'Anyone' },
    ...board.people.map((person) => ({ value: person.id, label: person.name })),
    { value: EITHER, label: 'Unassigned' },
  ]

  return (
    <Column>
      <ScreenHeader
        title={tag?.name ?? 'Everything'}
        subtitle={
          tag ? `${open.length} open` : `${open.length} open, grouped by tag`
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
              ) : tag ? (
                <TodoGroup todos={[...todos].sort(byDue)} hideTag />
              ) : (
                <ByTag todos={todos} tags={board.tags} />
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

function ByTag({ todos, tags }: { todos: Array<Todo>; tags: Array<Tag> }) {
  const sorted = [...todos].sort(byDue)
  return (
    <>
      {tags.map((tag) => (
        <Section
          key={tag.id}
          title={tag.name}
          todos={sorted.filter((todo) => todo.tagId === tag.id)}
          hideTag
        />
      ))}
      <Section
        title="No tag"
        todos={sorted.filter((todo) => todo.tagId === null)}
      />
    </>
  )
}
